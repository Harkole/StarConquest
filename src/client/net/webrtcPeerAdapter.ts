import {
  StandardAIBot,
  type AIBotController,
} from '../../shared/ai/aiController.ts';
import {
  PLAYER_SLOT_IDS,
  normalizeMatchSetupConfig,
  type DeepSpaceStructureId,
  type MatchPresetId,
  type MatchSetupConfig,
  type MatchSetupInput,
  type PlayerSlotConfig,
} from '../../shared/config/index.ts';
import type {
  GameCommand,
  PlayerSlotId,
  Vector2D,
} from '../../shared/protocol/commands.ts';
import {
  parseP2PWireMessage,
  type LobbyPeerSlotInfo,
  type P2PWireMessage,
} from '../../shared/protocol/snapshots.ts';
import type { GalaxyTopology } from '../../shared/sim/galaxy.ts';
import {
  GameSimulation,
  type CombatShipUnitState,
  type CombatVisualEvent,
  type CommandResult,
  type DeepSpaceStructureInstance,
  type FleetInstance,
  type HarvesterUnitState,
  type MatchOutcomeState,
  type OrbitalStructureInstance,
  type PlanetRuntimeState,
  type PlayerEconomyState,
} from '../../shared/sim/gameSimulation.ts';
import type { PlayerSystemView } from '../../shared/sim/playerIntel.ts';
import type { SimulationView } from '../../shared/sim/simulationView.ts';
import { SnapshotSimulationView } from '../../shared/sim/snapshotSimulationView.ts';
import {
  BroadcastChannelSignalingTransport,
  decodeManualSignalToken,
  encodeManualSignalToken,
  generateRoomCode,
  normalizeRoomCode,
  type RoomSignalEnvelope,
  type RoomSignalingTransport,
} from './signaling.ts';
import type {
  HostRoomOptions,
  JoinRoomOptions,
  MultiplayerRoomAdapter,
  SimAdapterMode,
  WebRTCRoomPeerInfo,
  WebRTCRoomState,
  WebRTCRoomStatus,
} from './simAdapter.ts';

export const MAX_REMOTE_PEERS = 3;

function toPlainSessionDescription(
  sdp: RTCSessionDescriptionInit,
): RTCSessionDescriptionInit {
  return {
    type: sdp.type,
    ...(sdp.sdp !== undefined ? { sdp: sdp.sdp } : {}),
  };
}

function toPlainIceCandidate(
  candidate: RTCIceCandidate | RTCIceCandidateInit,
): RTCIceCandidateInit {
  if ('toJSON' in candidate && typeof candidate.toJSON === 'function') {
    return candidate.toJSON();
  }
  return {
    ...(candidate.candidate !== undefined ? { candidate: candidate.candidate } : {}),
    ...(candidate.sdpMid !== undefined ? { sdpMid: candidate.sdpMid } : {}),
    ...(candidate.sdpMLineIndex !== undefined
      ? { sdpMLineIndex: candidate.sdpMLineIndex }
      : {}),
    ...(candidate.usernameFragment !== undefined
      ? { usernameFragment: candidate.usernameFragment }
      : {}),
  };
}
export const P2P_DATA_CHANNEL_LABEL = 'starconquest-p2p';
export const DEFAULT_SNAPSHOT_INTERVAL_SECONDS = 0.05;

export interface DataChannelLike {
  readonly label: string;
  readonly readyState: RTCDataChannelState;
  onopen: (() => void) | null;
  onclose: (() => void) | null;
  onerror: (() => void) | null;
  onmessage: ((event: { readonly data: unknown }) => void) | null;
  send(data: string): void;
  close(): void;
}

export interface PeerConnectionLike {
  onicecandidate: ((event: { readonly candidate: RTCIceCandidateInit | null }) => void) | null;
  ondatachannel: ((event: { readonly channel: DataChannelLike }) => void) | null;
  onconnectionstatechange: (() => void) | null;
  createDataChannel(label: string, options?: RTCDataChannelInit): DataChannelLike;
  createOffer(): Promise<RTCSessionDescriptionInit>;
  createAnswer(): Promise<RTCSessionDescriptionInit>;
  setLocalDescription(desc: RTCSessionDescriptionInit): Promise<void>;
  setRemoteDescription(desc: RTCSessionDescriptionInit): Promise<void>;
  addIceCandidate(candidate: RTCIceCandidateInit): Promise<void>;
  close(): void;
}

export type PeerConnectionFactory = (
  config: RTCConfiguration,
) => PeerConnectionLike;

export interface WebRTCPeerAdapterOptions {
  readonly localPeerId?: string;
  readonly signalingTransport?: RoomSignalingTransport;
  readonly peerConnectionFactory?: PeerConnectionFactory;
  readonly iceServers?: readonly RTCIceServer[];
  readonly snapshotIntervalSeconds?: number;
}

interface RemotePeerEntry {
  readonly peerId: string;
  readonly label: string;
  readonly pc: PeerConnectionLike;
  channel: DataChannelLike | null;
  assignedSlotId: PlayerSlotId | null;
  connected: boolean;
  remoteDescriptionSet: boolean;
  readonly pendingIceCandidates: RTCIceCandidateInit[];
  readonly localIceCandidates: RTCIceCandidateInit[];
  readonly pendingCombatEvents: CombatVisualEvent[];
}

class HostSimulationView implements SimulationView {
  private readonly sim: GameSimulation;
  private readonly localCombatEvents: CombatVisualEvent[];

  constructor(sim: GameSimulation, localCombatEvents: CombatVisualEvent[]) {
    this.sim = sim;
    this.localCombatEvents = localCombatEvents;
  }

  public get presetId(): MatchPresetId {
    return this.sim.presetId;
  }
  public get galaxy(): GalaxyTopology {
    return this.sim.galaxy;
  }
  public get currentTick(): number {
    return this.sim.currentTick;
  }
  public get elapsedSeconds(): number {
    return this.sim.elapsedSeconds;
  }
  public getMatchSetup(): MatchSetupConfig {
    return this.sim.getMatchSetup();
  }
  public getMatchOutcome(): MatchOutcomeState {
    return this.sim.getMatchOutcome();
  }
  public getPlayerState(playerId: PlayerSlotId): PlayerEconomyState {
    return this.sim.getPlayerState(playerId);
  }
  public isPlayerInActiveCombat(
    playerId: PlayerSlotId,
    windowSeconds?: number,
  ): boolean {
    return this.sim.isPlayerInActiveCombat(playerId, windowSeconds);
  }
  public isPlayerDefeated(playerId: PlayerSlotId): boolean {
    return this.sim.isPlayerDefeated(playerId);
  }
  public getPlayerSystemView(
    viewerId: PlayerSlotId,
    systemId: string,
  ): PlayerSystemView {
    return this.sim.getPlayerSystemView(viewerId, systemId);
  }
  public consumeCombatEvents(): CombatVisualEvent[] {
    if (this.localCombatEvents.length === 0) {
      return [];
    }
    return this.localCombatEvents.splice(0, this.localCombatEvents.length);
  }
  public getFleetsForPlayer(playerId: PlayerSlotId): readonly FleetInstance[] {
    return this.sim.getFleetsForPlayer(playerId);
  }
  public getFleetById(fleetId: string): FleetInstance | undefined {
    return this.sim.getFleetById(fleetId);
  }
  public getShipsInFleet(fleetId: string): readonly CombatShipUnitState[] {
    return this.sim.getShipsInFleet(fleetId);
  }
  public getFleetLiveAnchor(
    fleetId: string,
  ): { readonly systemId: string; readonly position: Vector2D } | null {
    return this.sim.getFleetLiveAnchor(fleetId);
  }
  public getPlanetState(planetId: string): PlanetRuntimeState {
    return this.sim.getPlanetState(planetId);
  }
  public getPlanetsInSystem(systemId: string): readonly PlanetRuntimeState[] {
    return this.sim.getPlanetsInSystem(systemId);
  }
  public getStructureById(structureId: string) {
    return this.sim.getStructureById(structureId);
  }
  public getDeepSpaceStructureById(
    structureId: string,
  ): DeepSpaceStructureInstance | undefined {
    return this.sim.getDeepSpaceStructureById(structureId);
  }
  public getCombatShipById(shipId: string): CombatShipUnitState | undefined {
    return this.sim.getCombatShipById(shipId);
  }
  public getHarvesterById(harvesterId: string): HarvesterUnitState | undefined {
    return this.sim.getHarvesterById(harvesterId);
  }
  public getPlayerTechModuleCount(playerId: PlayerSlotId): number {
    return this.sim.getPlayerTechModuleCount(playerId);
  }
  public validateDeepSpacePlacement(
    playerId: PlayerSlotId,
    systemId: string,
    position: Vector2D,
    structureId: DeepSpaceStructureId,
  ): CommandResult {
    return this.sim.validateDeepSpacePlacement(
      playerId,
      systemId,
      position,
      structureId,
    );
  }
  public getMaxConcurrentDocks(structure: OrbitalStructureInstance): number {
    return this.sim.getMaxConcurrentDocks(structure);
  }
  public getPlatformUnloadRatePerSecond(
    structure: OrbitalStructureInstance,
  ): number {
    return this.sim.getPlatformUnloadRatePerSecond(structure);
  }
}

function createDefaultPeerConnectionFactory(): PeerConnectionFactory {
  return (config: RTCConfiguration): PeerConnectionLike => {
    const pc = new RTCPeerConnection(config);
    return pc as unknown as PeerConnectionLike;
  };
}

function createPeerId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${rand}`;
}

function buildAIBotsForSetup(
  setup: MatchSetupConfig,
): readonly AIBotController[] {
  const bots: AIBotController[] = [];
  for (const slotId of PLAYER_SLOT_IDS) {
    const slotCfg = setup.slots[slotId];
    if (slotCfg.kind === 'ai') {
      bots.push(new StandardAIBot(slotId, slotCfg.difficulty));
    }
  }
  return bots;
}

export class WebRTCPeerAdapter implements MultiplayerRoomAdapter {
  public localPlayerId: PlayerSlotId = 'player_1';
  public simSpeedMultiplier = 1;

  private readonly signaling: RoomSignalingTransport;
  private readonly peerConnectionFactory: PeerConnectionFactory;
  private readonly iceServers: readonly RTCIceServer[];
  private snapshotIntervalSeconds: number;
  private localPeerId: string;

  private role: 'host' | 'client' = 'host';
  private status: WebRTCRoomStatus = 'idle';
  private roomCode: string | null = null;
  private hostPeerId: string | null = null;
  private lastError: string | null = null;

  private lobbySetup: MatchSetupConfig = normalizeMatchSetupConfig('standard_tactical');
  private hostSim: GameSimulation | null = null;
  private hostSimView: HostSimulationView | null = null;
  private aiBots: readonly AIBotController[] = [];
  private readonly localHostCombatEvents: CombatVisualEvent[] = [];
  private snapshotAccumulatorSeconds = 0;

  private readonly peers = new Map<string, RemotePeerEntry>();
  private clientPc: PeerConnectionLike | null = null;
  private clientChannel: DataChannelLike | null = null;
  private clientRemoteDescriptionSet = false;
  private readonly clientPendingIce: RTCIceCandidateInit[] = [];
  private clientLobbySlots: LobbyPeerSlotInfo[] = [];
  private clientLobbyPresetId: MatchPresetId = 'standard_tactical';
  private snapshotView: SnapshotSimulationView | null = null;
  private fallbackView: SimulationView | null = null;

  private unsubscribeSignaling: (() => void) | null = null;
  private commandCounter = 0;
  private readonly roomStateListeners = new Set<(state: WebRTCRoomState) => void>();

  constructor(options: WebRTCPeerAdapterOptions = {}) {
    this.localPeerId = options.localPeerId ?? createPeerId('peer');
    this.signaling =
      options.signalingTransport ?? new BroadcastChannelSignalingTransport();
    this.peerConnectionFactory =
      options.peerConnectionFactory ?? createDefaultPeerConnectionFactory();
    this.iceServers = options.iceServers ?? [
      { urls: 'stun:stun.l.google.com:19302' },
    ];
    this.snapshotIntervalSeconds =
      options.snapshotIntervalSeconds ?? DEFAULT_SNAPSHOT_INTERVAL_SECONDS;
  }

  public get mode(): SimAdapterMode {
    return this.role === 'client' ? 'p2p_client' : 'p2p_host';
  }

  public get simulation(): SimulationView {
    if (this.role === 'host' && this.hostSimView) {
      return this.hostSimView;
    }
    if (this.role === 'client' && this.snapshotView) {
      return this.snapshotView;
    }
    if (!this.fallbackView) {
      this.fallbackView = new GameSimulation('standard_tactical');
    }
    return this.fallbackView;
  }

  public getHostSimulation(): GameSimulation | null {
    return this.hostSim;
  }

  public hostRoom(options: HostRoomOptions = {}): MatchSetupConfig {
    this.leaveRoom();

    this.role = 'host';
    this.status = 'hosting';
    this.roomCode = normalizeRoomCode(options.roomCode ?? generateRoomCode());
    this.hostPeerId = this.localPeerId;
    this.lastError = null;
    if (options.snapshotIntervalSeconds !== undefined) {
      this.snapshotIntervalSeconds = options.snapshotIntervalSeconds;
    }

    const setup = normalizeMatchSetupConfig(
      options.presetOrSetup ?? 'standard_tactical',
    );
    this.lobbySetup = setup;
    this.localPlayerId = setup.localPlayerId;
    this.hostSim = new GameSimulation(setup);
    this.localHostCombatEvents.length = 0;
    this.hostSimView = new HostSimulationView(
      this.hostSim,
      this.localHostCombatEvents,
    );
    this.aiBots = buildAIBotsForSetup(setup);

    this.unsubscribeSignaling = this.signaling.subscribe(
      this.roomCode,
      (signal) => this.handleHostSignal(signal),
    );
    this.emitRoomState();
    return setup;
  }

  public async joinRoom(
    roomCode: string,
    options: JoinRoomOptions = {},
  ): Promise<void> {
    this.leaveRoom();

    if (options.peerId) {
      this.localPeerId = options.peerId;
    }

    this.role = 'client';
    this.status = 'joining';
    this.roomCode = normalizeRoomCode(roomCode);
    this.hostPeerId = null;
    this.lastError = null;
    this.clientRemoteDescriptionSet = false;
    this.clientPendingIce.length = 0;
    this.clientLobbySlots = [];

    this.unsubscribeSignaling = this.signaling.subscribe(
      this.roomCode,
      (signal) => void this.handleClientSignal(signal, options.requestedSlotId),
    );

    this.signaling.send({
      kind: 'join_request',
      roomCode: this.roomCode,
      fromPeerId: this.localPeerId,
      ...(options.requestedSlotId !== undefined
        ? { requestedSlotId: options.requestedSlotId }
        : {}),
    });

    this.emitRoomState();
  }

  public leaveRoom(): void {
    const activeRoomCode = this.roomCode;
    if (activeRoomCode) {
      if (this.role === 'host') {
        this.signaling.send({
          kind: 'room_closed',
          roomCode: activeRoomCode,
          fromPeerId: this.localPeerId,
          reason: 'Host left room',
        });
      } else if (this.clientChannel?.readyState === 'open') {
        this.sendWireMessage(this.clientChannel, {
          kind: 'peer_leave',
          peerId: this.localPeerId,
          reason: 'Peer left room',
        });
      }
    }

    if (this.unsubscribeSignaling) {
      this.unsubscribeSignaling();
      this.unsubscribeSignaling = null;
    }

    for (const peer of this.peers.values()) {
      peer.channel?.close();
      peer.pc.close();
    }
    this.peers.clear();

    this.clientChannel?.close();
    this.clientChannel = null;
    this.clientPc?.close();
    this.clientPc = null;
    this.clientRemoteDescriptionSet = false;
    this.clientPendingIce.length = 0;
    this.clientLobbySlots = [];

    this.hostSim = null;
    this.hostSimView = null;
    this.aiBots = [];
    this.localHostCombatEvents.length = 0;
    this.snapshotView = null;
    this.snapshotAccumulatorSeconds = 0;
    this.status = 'idle';
    this.roomCode = null;
    this.hostPeerId = null;
    this.emitRoomState();
  }

  public assignPeerToSlot(peerId: string, slotId: PlayerSlotId): boolean {
    if (this.role !== 'host' || slotId === this.localPlayerId) {
      return false;
    }
    const targetPeer = this.peers.get(peerId);
    if (!targetPeer) {
      return false;
    }

    for (const other of this.peers.values()) {
      if (other.peerId !== peerId && other.assignedSlotId === slotId) {
        other.assignedSlotId = null;
      }
    }

    targetPeer.assignedSlotId = slotId;
    const updatedSlots: Record<PlayerSlotId, PlayerSlotConfig> = {
      ...this.lobbySetup.slots,
      [slotId]: { kind: 'human' },
    };
    this.lobbySetup = normalizeMatchSetupConfig({
      presetId: this.lobbySetup.presetId,
      localPlayerId: this.lobbySetup.localPlayerId,
      slots: updatedSlots,
    });

    this.broadcastLobbySync();
    this.emitRoomState();
    return true;
  }

  public unassignSlot(slotId: PlayerSlotId): void {
    if (this.role !== 'host' || slotId === this.localPlayerId) {
      return;
    }
    let changed = false;
    for (const peer of this.peers.values()) {
      if (peer.assignedSlotId === slotId) {
        peer.assignedSlotId = null;
        changed = true;
      }
    }
    if (changed) {
      this.broadcastLobbySync();
      this.emitRoomState();
    }
  }

  public setLobbySetup(
    presetOrSetup: MatchPresetId | MatchSetupInput,
  ): MatchSetupConfig {
    if (this.role !== 'host') {
      return this.lobbySetup;
    }
    const nextSetup = normalizeMatchSetupConfig(presetOrSetup);
    this.lobbySetup = nextSetup;
    this.localPlayerId = nextSetup.localPlayerId;

    for (const peer of this.peers.values()) {
      if (peer.assignedSlotId) {
        const slotCfg = nextSetup.slots[peer.assignedSlotId];
        if (
          peer.assignedSlotId === this.localPlayerId ||
          slotCfg.kind !== 'human'
        ) {
          peer.assignedSlotId = null;
        }
      }
    }

    this.broadcastLobbySync();
    this.emitRoomState();
    return nextSetup;
  }

  public launchMatch(): MatchSetupConfig {
    if (this.role !== 'host') {
      return this.simulation.getMatchSetup();
    }

    const setup = this.lobbySetup;
    this.localPlayerId = setup.localPlayerId;
    this.hostSim = new GameSimulation(setup);
    this.localHostCombatEvents.length = 0;
    this.hostSimView = new HostSimulationView(
      this.hostSim,
      this.localHostCombatEvents,
    );
    this.aiBots = buildAIBotsForSetup(setup);
    this.snapshotAccumulatorSeconds = 0;
    this.status = 'in_match';

    for (const peer of this.peers.values()) {
      peer.pendingCombatEvents.length = 0;
      if (peer.connected && peer.channel?.readyState === 'open' && peer.assignedSlotId) {
        const initialSnapshot = this.hostSim.buildStateSnapshot(
          peer.assignedSlotId,
          [],
        );
        this.sendWireMessage(peer.channel, {
          kind: 'match_start',
          assignedSlotId: peer.assignedSlotId,
          matchSetup: setup,
          initialSnapshot,
        });
      }
    }

    this.emitRoomState();
    return setup;
  }

  public resetMatch(
    presetOrSetup: MatchPresetId | MatchSetupInput,
  ): MatchSetupConfig {
    if (this.role !== 'host') {
      return this.simulation.getMatchSetup();
    }
    this.setLobbySetup(presetOrSetup);
    return this.launchMatch();
  }

  public submitPlayerCommand(command: GameCommand): CommandResult {
    if (this.role === 'host') {
      if (this.status !== 'in_match' || !this.hostSim) {
        return { ok: false, reason: 'Match has not started' };
      }
      return this.hostSim.submitCommand(command);
    }

    if (
      this.status !== 'in_match' ||
      !this.clientChannel ||
      this.clientChannel.readyState !== 'open'
    ) {
      return { ok: false, reason: 'Not connected to host' };
    }

    const stampedCommand: GameCommand = {
      ...command,
      playerId: this.localPlayerId,
    };
    this.commandCounter += 1;
    const commandId = `${this.localPeerId}-cmd-${this.commandCounter}`;
    this.sendWireMessage(this.clientChannel, {
      kind: 'player_command',
      commandId,
      command: stampedCommand,
    });
    return { ok: true };
  }

  public update(deltaSeconds: number): void {
    if (this.role !== 'host' || this.status !== 'in_match' || !this.hostSim) {
      return;
    }

    const scaledDelta = deltaSeconds * this.simSpeedMultiplier;
    this.hostSim.stepTick(scaledDelta);

    for (const bot of this.aiBots) {
      const commands = bot.decideNextCommands(
        this.hostSim.galaxy,
        this.hostSim.currentTick,
        this.hostSim,
      );
      for (const cmd of commands) {
        this.hostSim.submitCommand(cmd);
      }
    }

    const viewerIds: PlayerSlotId[] = [this.localPlayerId];
    for (const peer of this.peers.values()) {
      if (
        peer.connected &&
        peer.assignedSlotId &&
        !viewerIds.includes(peer.assignedSlotId)
      ) {
        viewerIds.push(peer.assignedSlotId);
      }
    }

    const eventsByViewer = this.hostSim.drainCombatEventsForViewers(viewerIds);
    const localEvents = eventsByViewer.get(this.localPlayerId);
    if (localEvents && localEvents.length > 0) {
      this.localHostCombatEvents.push(...localEvents);
    }
    for (const peer of this.peers.values()) {
      if (peer.connected && peer.assignedSlotId) {
        const peerEv = eventsByViewer.get(peer.assignedSlotId);
        if (peerEv && peerEv.length > 0) {
          peer.pendingCombatEvents.push(...peerEv);
        }
      }
    }

    this.snapshotAccumulatorSeconds += deltaSeconds;
    if (this.snapshotAccumulatorSeconds >= this.snapshotIntervalSeconds) {
      this.snapshotAccumulatorSeconds = 0;
      for (const peer of this.peers.values()) {
        if (
          peer.connected &&
          peer.assignedSlotId &&
          peer.channel?.readyState === 'open'
        ) {
          const peerEvents = peer.pendingCombatEvents.splice(
            0,
            peer.pendingCombatEvents.length,
          );
          const snapshot = this.hostSim.buildStateSnapshot(
            peer.assignedSlotId,
            peerEvents,
          );
          this.sendWireMessage(peer.channel, {
            kind: 'state_snapshot',
            snapshot,
          });
        }
      }
    }
  }

  public getRoomState(): WebRTCRoomState {
    const slots =
      this.role === 'host'
        ? this.buildHostLobbySlots()
        : this.clientLobbySlots;
    const peers: WebRTCRoomPeerInfo[] = [];
    for (const p of this.peers.values()) {
      peers.push({
        peerId: p.peerId,
        label: p.label,
        assignedSlotId: p.assignedSlotId,
        connected: p.connected,
      });
    }
    return {
      status: this.status,
      role: this.role,
      roomCode: this.roomCode,
      localPeerId: this.localPeerId,
      localPlayerId: this.localPlayerId,
      hostPeerId: this.hostPeerId,
      presetId:
        this.role === 'host' ? this.lobbySetup.presetId : this.clientLobbyPresetId,
      slots,
      peers,
      lastError: this.lastError,
    };
  }

  public onRoomStateChange(
    listener: (state: WebRTCRoomState) => void,
  ): () => void {
    this.roomStateListeners.add(listener);
    return () => {
      this.roomStateListeners.delete(listener);
    };
  }

  public async createManualInviteToken(
    slotId?: PlayerSlotId,
  ): Promise<string> {
    if (this.role !== 'host' || this.status === 'idle') {
      this.hostRoom();
    }
    if (!this.roomCode) {
      throw new Error('Room code not initialized');
    }
    if (this.peers.size >= MAX_REMOTE_PEERS) {
      throw new Error('Room is full (max 3 remote peers)');
    }

    const peerId = createPeerId('manual-peer');
    const entry = this.createHostPeerEntry(peerId, slotId);
    if (slotId && slotId !== this.localPlayerId) {
      this.assignPeerToSlot(peerId, slotId);
    }
    const offer = await entry.pc.createOffer();
    await entry.pc.setLocalDescription(offer);
    await waitForIceGatherBrief(150);

    return encodeManualSignalToken({
      version: 1,
      kind: 'offer',
      roomCode: this.roomCode,
      fromPeerId: this.localPeerId,
      toPeerId: peerId,
      sdp: offer,
      iceCandidates: [...entry.localIceCandidates],
      ...(entry.assignedSlotId ? { assignedSlotId: entry.assignedSlotId } : {}),
    });
  }

  public async acceptManualInviteToken(token: string): Promise<string> {
    const payload = decodeManualSignalToken(token);
    if (!payload || payload.kind !== 'offer') {
      throw new Error('Invalid manual invite token');
    }

    this.leaveRoom();
    this.role = 'client';
    this.status = 'joining';
    this.roomCode = payload.roomCode;
    this.hostPeerId = payload.fromPeerId;
    if (payload.toPeerId) {
      this.localPeerId = payload.toPeerId;
    }

    const pc = this.peerConnectionFactory({
      iceServers: [...this.iceServers],
    });
    this.clientPc = pc;
    const localIce: RTCIceCandidateInit[] = [];
    pc.onicecandidate = (ev) => {
      if (ev.candidate) {
        localIce.push(ev.candidate);
      }
    };
    pc.ondatachannel = (ev) => {
      this.attachClientDataChannel(ev.channel, payload.assignedSlotId);
    };

    await pc.setRemoteDescription(payload.sdp);
    this.clientRemoteDescriptionSet = true;
    for (const candidate of payload.iceCandidates) {
      await pc.addIceCandidate(candidate);
    }

    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    await waitForIceGatherBrief(150);

    this.emitRoomState();

    return encodeManualSignalToken({
      version: 1,
      kind: 'answer',
      roomCode: payload.roomCode,
      fromPeerId: this.localPeerId,
      toPeerId: payload.fromPeerId,
      sdp: answer,
      iceCandidates: localIce,
    });
  }

  public async applyManualAnswerToken(token: string): Promise<void> {
    if (this.role !== 'host') {
      throw new Error('Only the host can apply an answer token');
    }
    const payload = decodeManualSignalToken(token);
    if (!payload || payload.kind !== 'answer') {
      throw new Error('Invalid manual answer token');
    }

    const peer = this.peers.get(payload.fromPeerId);
    if (!peer) {
      throw new Error(`Unknown peer ${payload.fromPeerId} in answer token`);
    }

    await peer.pc.setRemoteDescription(payload.sdp);
    peer.remoteDescriptionSet = true;
    for (const candidate of payload.iceCandidates) {
      await peer.pc.addIceCandidate(candidate);
    }
  }

  private handleHostSignal(signal: RoomSignalEnvelope): void {
    if (signal.fromPeerId === this.localPeerId) {
      return;
    }

    switch (signal.kind) {
      case 'join_request':
        void this.handleHostJoinRequest(
          signal.fromPeerId,
          signal.requestedSlotId,
        );
        break;
      case 'answer':
        if (signal.toPeerId === this.localPeerId) {
          void this.handleHostAnswer(signal.fromPeerId, signal.sdp);
        }
        break;
      case 'ice':
        if (signal.toPeerId === this.localPeerId) {
          void this.handleHostIce(signal.fromPeerId, signal.candidate);
        }
        break;
      case 'offer':
      case 'room_closed':
        break;
    }
  }

  private async handleHostJoinRequest(
    peerId: string,
    requestedSlotId?: PlayerSlotId,
  ): Promise<void> {
    if (!this.roomCode) {
      return;
    }
    if (!this.peers.has(peerId) && this.peers.size >= MAX_REMOTE_PEERS) {
      return;
    }

    const existing = this.peers.get(peerId);
    if (existing) {
      existing.channel?.close();
      existing.pc.close();
      this.peers.delete(peerId);
    }

    const entry = this.createHostPeerEntry(peerId, requestedSlotId);
    const offer = await entry.pc.createOffer();
    await entry.pc.setLocalDescription(offer);

    this.signaling.send({
      kind: 'offer',
      roomCode: this.roomCode,
      fromPeerId: this.localPeerId,
      toPeerId: peerId,
      sdp: toPlainSessionDescription(offer),
    });
    this.emitRoomState();
  }

  private createHostPeerEntry(
    peerId: string,
    requestedSlotId?: PlayerSlotId,
  ): RemotePeerEntry {
    const pc = this.peerConnectionFactory({
      iceServers: [...this.iceServers],
    });
    const channel = pc.createDataChannel(P2P_DATA_CHANNEL_LABEL, {
      ordered: true,
    });

    const assignedSlotId = this.findAvailableSlotForPeer(requestedSlotId);
    const entry: RemotePeerEntry = {
      peerId,
      label: `Peer ${this.peers.size + 1}`,
      pc,
      channel,
      assignedSlotId,
      connected: false,
      remoteDescriptionSet: false,
      pendingIceCandidates: [],
      localIceCandidates: [],
      pendingCombatEvents: [],
    };
    this.peers.set(peerId, entry);

    pc.onicecandidate = (ev) => {
      if (!ev.candidate) {
        return;
      }
      const plainCandidate = toPlainIceCandidate(ev.candidate);
      entry.localIceCandidates.push(plainCandidate);
      if (this.roomCode) {
        this.signaling.send({
          kind: 'ice',
          roomCode: this.roomCode,
          fromPeerId: this.localPeerId,
          toPeerId: peerId,
          candidate: plainCandidate,
        });
      }
    };

    channel.onopen = () => {
      entry.connected = true;
      this.broadcastLobbySync();
      this.emitRoomState();
    };

    channel.onclose = () => {
      entry.connected = false;
      this.broadcastLobbySync();
      this.emitRoomState();
    };

    channel.onmessage = (ev) => {
      this.handleHostWireMessage(entry, ev.data);
    };

    return entry;
  }

  private async handleHostAnswer(
    peerId: string,
    sdp: RTCSessionDescriptionInit,
  ): Promise<void> {
    const peer = this.peers.get(peerId);
    if (!peer) {
      return;
    }
    await peer.pc.setRemoteDescription(sdp);
    peer.remoteDescriptionSet = true;
    while (peer.pendingIceCandidates.length > 0) {
      const candidate = peer.pendingIceCandidates.shift();
      if (candidate) {
        await peer.pc.addIceCandidate(candidate);
      }
    }
  }

  private async handleHostIce(
    peerId: string,
    candidate: RTCIceCandidateInit,
  ): Promise<void> {
    const peer = this.peers.get(peerId);
    if (!peer) {
      return;
    }
    if (!peer.remoteDescriptionSet) {
      peer.pendingIceCandidates.push(candidate);
      return;
    }
    await peer.pc.addIceCandidate(candidate);
  }

  private handleHostWireMessage(entry: RemotePeerEntry, rawData: unknown): void {
    if (typeof rawData !== 'string') {
      return;
    }
    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(rawData);
    } catch {
      return;
    }
    const msg = parseP2PWireMessage(parsedJson);
    if (!msg) {
      return;
    }

    switch (msg.kind) {
      case 'peer_hello': {
        if (
          msg.requestedSlotId &&
          entry.assignedSlotId === null &&
          this.isSlotAssignable(msg.requestedSlotId)
        ) {
          this.assignPeerToSlot(entry.peerId, msg.requestedSlotId);
        } else {
          this.broadcastLobbySync();
        }
        break;
      }

      case 'peer_leave': {
        entry.connected = false;
        entry.assignedSlotId = null;
        entry.channel?.close();
        entry.pc.close();
        this.peers.delete(entry.peerId);
        this.broadcastLobbySync();
        this.emitRoomState();
        break;
      }

      case 'player_command': {
        if (!entry.channel || entry.channel.readyState !== 'open') {
          return;
        }
        if (!entry.assignedSlotId || msg.command.playerId !== entry.assignedSlotId) {
          this.sendWireMessage(entry.channel, {
            kind: 'command_ack',
            commandId: msg.commandId,
            result: {
              ok: false,
              reason: 'Rejected: command playerId does not match assigned peer slot',
            },
          });
          return;
        }
        if (this.status !== 'in_match' || !this.hostSim) {
          this.sendWireMessage(entry.channel, {
            kind: 'command_ack',
            commandId: msg.commandId,
            result: { ok: false, reason: 'Match has not started' },
          });
          return;
        }
        const result = this.hostSim.submitCommand(msg.command);
        this.sendWireMessage(entry.channel, {
          kind: 'command_ack',
          commandId: msg.commandId,
          result,
        });
        break;
      }

      case 'lobby_sync':
      case 'match_start':
      case 'state_snapshot':
      case 'command_ack':
        break;
    }
  }

  private async handleClientSignal(
    signal: RoomSignalEnvelope,
    requestedSlotId?: PlayerSlotId,
  ): Promise<void> {
    if (signal.fromPeerId === this.localPeerId) {
      return;
    }

    switch (signal.kind) {
      case 'offer': {
        if (signal.toPeerId !== this.localPeerId || !this.roomCode) {
          return;
        }
        this.hostPeerId = signal.fromPeerId;
        this.clientPc?.close();
        const pc = this.peerConnectionFactory({
          iceServers: [...this.iceServers],
        });
        this.clientPc = pc;
        this.clientRemoteDescriptionSet = false;

        pc.onicecandidate = (ev) => {
          if (ev.candidate && this.roomCode && this.hostPeerId) {
            this.signaling.send({
              kind: 'ice',
              roomCode: this.roomCode,
              fromPeerId: this.localPeerId,
              toPeerId: this.hostPeerId,
              candidate: toPlainIceCandidate(ev.candidate),
            });
          }
        };

        pc.ondatachannel = (ev) => {
          this.attachClientDataChannel(ev.channel, requestedSlotId);
        };

        await pc.setRemoteDescription(signal.sdp);
        this.clientRemoteDescriptionSet = true;
        while (this.clientPendingIce.length > 0) {
          const candidate = this.clientPendingIce.shift();
          if (candidate) {
            await pc.addIceCandidate(candidate);
          }
        }

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        this.signaling.send({
          kind: 'answer',
          roomCode: this.roomCode,
          fromPeerId: this.localPeerId,
          toPeerId: signal.fromPeerId,
          sdp: toPlainSessionDescription(answer),
        });
        break;
      }

      case 'ice': {
        if (signal.toPeerId !== this.localPeerId) {
          return;
        }
        if (!this.clientPc || !this.clientRemoteDescriptionSet) {
          this.clientPendingIce.push(signal.candidate);
          return;
        }
        await this.clientPc.addIceCandidate(signal.candidate);
        break;
      }

      case 'room_closed': {
        this.lastError = signal.reason ?? 'Host closed room';
        this.leaveRoom();
        break;
      }

      case 'join_request':
      case 'answer':
        break;
    }
  }

  private attachClientDataChannel(
    channel: DataChannelLike,
    requestedSlotId?: PlayerSlotId,
  ): void {
    this.clientChannel = channel;

    const handleOpen = () => {
      if (this.status === 'joining') {
        this.status = 'connected';
      }
      this.sendWireMessage(channel, {
        kind: 'peer_hello',
        peerId: this.localPeerId,
        ...(requestedSlotId !== undefined ? { requestedSlotId } : {}),
      });
      this.emitRoomState();
    };

    channel.onopen = handleOpen;
    channel.onclose = () => {
      if (this.status !== 'idle') {
        this.lastError = 'Disconnected from host';
        this.leaveRoom();
      }
    };
    channel.onmessage = (ev) => {
      this.handleClientWireMessage(ev.data);
    };

    if (channel.readyState === 'open') {
      handleOpen();
    }
  }

  private handleClientWireMessage(rawData: unknown): void {
    if (typeof rawData !== 'string') {
      return;
    }
    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(rawData);
    } catch {
      return;
    }
    const msg = parseP2PWireMessage(parsedJson);
    if (!msg) {
      return;
    }

    switch (msg.kind) {
      case 'lobby_sync':
        this.clientLobbyPresetId = msg.presetId;
        this.hostPeerId = msg.hostPeerId;
        this.clientLobbySlots = [...msg.slots];
        const mySlot = msg.slots.find((s) => s.peerId === this.localPeerId);
        if (mySlot) {
          this.localPlayerId = mySlot.slotId;
        }
        this.emitRoomState();
        break;

      case 'match_start':
        this.localPlayerId = msg.assignedSlotId;
        this.snapshotView = new SnapshotSimulationView(msg.initialSnapshot);
        this.status = 'in_match';
        this.emitRoomState();
        break;

      case 'state_snapshot':
        if (this.snapshotView) {
          this.snapshotView.applySnapshot(msg.snapshot);
        } else {
          this.snapshotView = new SnapshotSimulationView(msg.snapshot);
        }
        break;

      case 'command_ack':
        if (!msg.result.ok && msg.result.reason) {
          this.lastError = msg.result.reason;
        }
        break;

      case 'peer_hello':
      case 'peer_leave':
      case 'player_command':
        break;
    }
  }

  private findAvailableSlotForPeer(
    requestedSlotId?: PlayerSlotId,
  ): PlayerSlotId | null {
    if (requestedSlotId && this.isSlotAssignable(requestedSlotId)) {
      return requestedSlotId;
    }
    for (const slotId of PLAYER_SLOT_IDS) {
      if (
        this.lobbySetup.slots[slotId].kind === 'human' &&
        this.isSlotAssignable(slotId)
      ) {
        return slotId;
      }
    }
    return null;
  }

  private isSlotAssignable(slotId: PlayerSlotId): boolean {
    if (slotId === this.localPlayerId) {
      return false;
    }
    if (this.lobbySetup.slots[slotId].kind !== 'human') {
      return false;
    }
    for (const peer of this.peers.values()) {
      if (peer.assignedSlotId === slotId) {
        return false;
      }
    }
    return true;
  }

  private buildHostLobbySlots(): LobbyPeerSlotInfo[] {
    const slots: LobbyPeerSlotInfo[] = [];
    for (const slotId of PLAYER_SLOT_IDS) {
      const cfg = this.lobbySetup.slots[slotId];
      if (slotId === this.localPlayerId) {
        slots.push({
          slotId,
          kind: 'human',
          peerId: this.localPeerId,
          connected: true,
        });
        continue;
      }
      if (cfg.kind === 'ai') {
        slots.push({
          slotId,
          kind: 'ai',
          aiDifficulty: cfg.difficulty,
          peerId: null,
          connected: false,
        });
        continue;
      }
      if (cfg.kind === 'empty') {
        slots.push({
          slotId,
          kind: 'empty',
          peerId: null,
          connected: false,
        });
        continue;
      }
      let assignedPeer: RemotePeerEntry | undefined;
      for (const peer of this.peers.values()) {
        if (peer.assignedSlotId === slotId) {
          assignedPeer = peer;
          break;
        }
      }
      slots.push({
        slotId,
        kind: 'human',
        peerId: assignedPeer?.peerId ?? null,
        connected: assignedPeer?.connected ?? false,
      });
    }
    return slots;
  }

  private broadcastLobbySync(): void {
    if (this.role !== 'host' || !this.roomCode) {
      return;
    }
    const syncMsg: P2PWireMessage = {
      kind: 'lobby_sync',
      roomCode: this.roomCode,
      presetId: this.lobbySetup.presetId,
      hostPeerId: this.localPeerId,
      slots: this.buildHostLobbySlots(),
    };
    for (const peer of this.peers.values()) {
      if (peer.connected && peer.channel?.readyState === 'open') {
        this.sendWireMessage(peer.channel, syncMsg);
      }
    }
  }

  private sendWireMessage(
    channel: DataChannelLike,
    message: P2PWireMessage,
  ): void {
    if (channel.readyState !== 'open') {
      return;
    }
    channel.send(JSON.stringify(message));
  }

  private emitRoomState(): void {
    const snapshot = this.getRoomState();
    for (const listener of [...this.roomStateListeners]) {
      listener(snapshot);
    }
  }
}

function waitForIceGatherBrief(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
