import type {
  MatchPresetId,
  MatchSetupConfig,
  MatchSetupInput,
} from '../../shared/config/index.ts';
import type {
  GameCommand,
  PlayerSlotId,
} from '../../shared/protocol/commands.ts';
import type { LobbyPeerSlotInfo } from '../../shared/protocol/snapshots.ts';
import type { CommandResult } from '../../shared/sim/gameSimulation.ts';
import type { SimulationView } from '../../shared/sim/simulationView.ts';

export type SimAdapterMode = 'local' | 'p2p_host' | 'p2p_client';

export interface ClientSimAdapter {
  readonly mode: SimAdapterMode;
  readonly localPlayerId: PlayerSlotId;
  readonly simulation: SimulationView;
  simSpeedMultiplier: number;
  submitPlayerCommand(command: GameCommand): CommandResult;
  update(deltaSeconds: number): void;
  resetMatch(presetOrSetup: MatchPresetId | MatchSetupInput): MatchSetupConfig;
}

export type WebRTCRoomStatus =
  | 'idle'
  | 'hosting'
  | 'joining'
  | 'connected'
  | 'in_match';

export interface WebRTCRoomPeerInfo {
  readonly peerId: string;
  readonly label: string;
  readonly assignedSlotId: PlayerSlotId | null;
  readonly connected: boolean;
}

export interface WebRTCRoomState {
  readonly status: WebRTCRoomStatus;
  readonly role: 'host' | 'client';
  readonly roomCode: string | null;
  readonly localPeerId: string;
  readonly localPlayerId: PlayerSlotId;
  readonly hostPeerId: string | null;
  readonly presetId: MatchPresetId;
  readonly slots: readonly LobbyPeerSlotInfo[];
  readonly peers: readonly WebRTCRoomPeerInfo[];
  readonly lastError: string | null;
}

export interface HostRoomOptions {
  readonly presetOrSetup?: MatchPresetId | MatchSetupInput;
  readonly roomCode?: string;
  readonly snapshotIntervalSeconds?: number;
}

export interface JoinRoomOptions {
  readonly peerId?: string;
  readonly requestedSlotId?: PlayerSlotId;
}

export interface MultiplayerRoomAdapter extends ClientSimAdapter {
  hostRoom(options?: HostRoomOptions): MatchSetupConfig;
  joinRoom(roomCode: string, options?: JoinRoomOptions): Promise<void>;
  leaveRoom(): void;
  assignPeerToSlot(peerId: string, slotId: PlayerSlotId): boolean;
  unassignSlot(slotId: PlayerSlotId): void;
  setLobbySetup(presetOrSetup: MatchPresetId | MatchSetupInput): MatchSetupConfig;
  launchMatch(): MatchSetupConfig;
  getRoomState(): WebRTCRoomState;
  onRoomStateChange(listener: (state: WebRTCRoomState) => void): () => void;
  createManualInviteToken(slotId?: PlayerSlotId): Promise<string>;
  acceptManualInviteToken(token: string): Promise<string>;
  applyManualAnswerToken(token: string): Promise<void>;
}
