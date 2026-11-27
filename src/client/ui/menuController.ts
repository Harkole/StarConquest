import {
  MATCH_PRESETS,
  PLAYER_SLOT_IDS,
  normalizeMatchSetupConfig,
  type AIDifficultyId,
  type MatchPresetId,
  type MatchSetupConfig,
} from '../../shared/config/index.ts';
import type { PlayerSlotId } from '../../shared/protocol/commands.ts';
import type {
  ClientSimAdapter,
  MultiplayerRoomAdapter,
  WebRTCRoomState,
  WebRTCRoomStatus,
} from '../net/simAdapter.ts';
import { WebRTCPeerAdapter } from '../net/webrtcPeerAdapter.ts';
import { FACTION_PALETTES } from '../renderer/factionColors.ts';
import {
  SETUP_PRESET_IDS,
  applyPresetSelection,
  applySlotDifficultyChange,
  applySlotRoleChange,
  enforceSingleHumanSlot,
  escapeHtmlAttribute,
  isAIDifficultyId,
  isMatchPresetId,
  isPlayerSlotId,
  isPlayerSlotRole,
  renderPresetCardsHtml,
  renderSlotRowsHtml,
  type PlayerSlotRole,
} from './lobbySetupHelpers.ts';

export type MenuScreenModel =
  | { readonly kind: 'main_menu' }
  | { readonly kind: 'single_player_setup'; readonly presetId: MatchPresetId }
  | {
      readonly kind: 'host_room_lobby';
      readonly presetId: MatchPresetId;
      readonly roomCode: string | null;
    }
  | { readonly kind: 'join_room_lobby'; readonly roomCode: string };

export interface MenuLaunchRequest {
  readonly setup?: MatchSetupConfig;
  readonly simAdapter?: ClientSimAdapter;
  readonly roomCode?: string | null;
}

export interface MenuControllerOptions {
  readonly container: HTMLElement;
  readonly onOpenSinglePlayer: (presetId: MatchPresetId) => void;
  readonly onOpenHostRoom: (presetId: MatchPresetId) => void;
  readonly onOpenJoinRoom: () => void;
  readonly onLaunchTutorial: () => void;
  readonly onLaunchBattleSimulator: () => void;
  readonly onBackToMainMenu: () => void;
  readonly onStartMatch: (request: MenuLaunchRequest) => void;
  readonly createP2PAdapter?: () => MultiplayerRoomAdapter;
}

function toSetupPresetId(presetId: MatchPresetId): MatchPresetId {
  return (SETUP_PRESET_IDS as readonly string[]).includes(presetId)
    ? presetId
    : 'standard_tactical';
}

export class MenuController {
  private readonly container: HTMLElement;
  private readonly onOpenSinglePlayer: (presetId: MatchPresetId) => void;
  private readonly onOpenHostRoom: (presetId: MatchPresetId) => void;
  private readonly onOpenJoinRoom: () => void;
  private readonly onLaunchTutorial: () => void;
  private readonly onLaunchBattleSimulator: () => void;
  private readonly onBackToMainMenu: () => void;
  private readonly onStartMatch: (request: MenuLaunchRequest) => void;
  private readonly createP2PAdapter: () => MultiplayerRoomAdapter;

  private currentScreen: MenuScreenModel = { kind: 'main_menu' };
  private draftSetup: MatchSetupConfig = normalizeMatchSetupConfig('standard_tactical');
  private p2pAdapter: MultiplayerRoomAdapter | null = null;
  private unsubscribeRoomState: (() => void) | null = null;
  private lastRoomStatus: WebRTCRoomStatus = 'idle';
  private p2pStatusMessage: string | null = null;
  private manualTokenOutput: string | null = null;
  private joinRoomCodeInput = '';
  private isRendering = false;
  private disposed = false;

  constructor(options: MenuControllerOptions) {
    this.container = options.container;
    this.onOpenSinglePlayer = options.onOpenSinglePlayer;
    this.onOpenHostRoom = options.onOpenHostRoom;
    this.onOpenJoinRoom = options.onOpenJoinRoom;
    this.onLaunchTutorial = options.onLaunchTutorial;
    this.onLaunchBattleSimulator = options.onLaunchBattleSimulator;
    this.onBackToMainMenu = options.onBackToMainMenu;
    this.onStartMatch = options.onStartMatch;
    this.createP2PAdapter =
      options.createP2PAdapter ?? (() => new WebRTCPeerAdapter());
  }

  public getDraftSetup(): MatchSetupConfig {
    return this.draftSetup;
  }

  public render(screen: MenuScreenModel): void {
    if (this.disposed) {
      return;
    }

    const prevKind = this.currentScreen.kind;
    this.currentScreen = screen;

    switch (screen.kind) {
      case 'main_menu':
        if (this.p2pAdapter) {
          this.teardownUnlaunchedP2P();
        }
        break;
      case 'single_player_setup':
        if (this.p2pAdapter) {
          this.teardownUnlaunchedP2P();
        }
        if (prevKind !== 'single_player_setup') {
          this.draftSetup = enforceSingleHumanSlot(
            applyPresetSelection(
              this.draftSetup,
              toSetupPresetId(screen.presetId),
            ),
          );
        }
        break;
      case 'host_room_lobby':
        if (prevKind !== 'host_room_lobby') {
          this.draftSetup = applyPresetSelection(
            this.draftSetup,
            toSetupPresetId(screen.presetId),
          );
          this.p2pStatusMessage = null;
          this.manualTokenOutput = null;
        }
        this.ensureHostRoom(screen.roomCode);
        break;
      case 'join_room_lobby':
        if (prevKind !== 'join_room_lobby') {
          if (this.p2pAdapter && this.p2pAdapter.getRoomState().role === 'host') {
            this.teardownUnlaunchedP2P();
          }
          this.joinRoomCodeInput = screen.roomCode;
          this.p2pStatusMessage = null;
          this.manualTokenOutput = null;
        }
        break;
      default: {
        const _exhaustive: never = screen;
        return _exhaustive;
      }
    }

    this.renderCurrentScreen();
  }

  public dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.teardownUnlaunchedP2P();
  }

  private ensureP2PAdapter(): MultiplayerRoomAdapter {
    if (!this.p2pAdapter) {
      this.p2pAdapter = this.createP2PAdapter();
      this.lastRoomStatus = this.p2pAdapter.getRoomState().status;
      this.unsubscribeRoomState = this.p2pAdapter.onRoomStateChange((state) => {
        this.handleRoomStateChange(state);
      });
    }
    return this.p2pAdapter;
  }

  private ensureHostRoom(requestedRoomCode: string | null): void {
    const currentState = this.p2pAdapter?.getRoomState();
    if (
      currentState &&
      currentState.role === 'host' &&
      currentState.status !== 'idle'
    ) {
      return;
    }
    if (this.p2pAdapter) {
      this.teardownUnlaunchedP2P();
    }
    const p2p = this.ensureP2PAdapter();
    this.isRendering = true;
    try {
      p2p.hostRoom({
        presetOrSetup: this.draftSetup,
        ...(requestedRoomCode !== null && requestedRoomCode.trim() !== ''
          ? { roomCode: requestedRoomCode }
          : {}),
      });
    } finally {
      this.isRendering = false;
    }
  }

  private detachP2POwnership(): MultiplayerRoomAdapter | null {
    if (this.unsubscribeRoomState) {
      this.unsubscribeRoomState();
      this.unsubscribeRoomState = null;
    }
    const adapter = this.p2pAdapter;
    this.p2pAdapter = null;
    this.lastRoomStatus = 'idle';
    this.p2pStatusMessage = null;
    this.manualTokenOutput = null;
    return adapter;
  }

  private teardownUnlaunchedP2P(): void {
    const adapter = this.detachP2POwnership();
    adapter?.leaveRoom();
  }

  private handleRoomStateChange(state: WebRTCRoomState): void {
    const prevStatus = this.lastRoomStatus;
    this.lastRoomStatus = state.status;

    if (state.lastError) {
      this.p2pStatusMessage = state.lastError;
    }

    if (
      state.role === 'client' &&
      state.status === 'in_match' &&
      prevStatus !== 'in_match'
    ) {
      const adapter = this.detachP2POwnership();
      if (!adapter) {
        return;
      }
      const setup = normalizeMatchSetupConfig(adapter.simulation.getMatchSetup());
      this.draftSetup = setup;
      this.onStartMatch({
        setup,
        simAdapter: adapter,
        roomCode: state.roomCode,
      });
      return;
    }

    if (!this.isRendering && !this.disposed) {
      this.renderCurrentScreen();
    }
  }

  private isHostingP2PRoom(): boolean {
    const state = this.p2pAdapter?.getRoomState();
    return Boolean(state && state.role === 'host' && state.status !== 'idle');
  }

  private syncHostLobbySetup(): void {
    if (this.isHostingP2PRoom()) {
      this.p2pAdapter?.setLobbySetup(this.draftSetup);
    }
  }

  private setDraftPreset(presetId: MatchPresetId): void {
    this.draftSetup = applyPresetSelection(this.draftSetup, presetId);
    this.syncHostLobbySetup();
    this.renderCurrentScreen();
  }

  private setDraftSlotRole(slotId: PlayerSlotId, role: PlayerSlotRole): void {
    this.draftSetup = applySlotRoleChange(this.draftSetup, slotId, role, {
      keepHostLocal: this.isHostingP2PRoom(),
      singleHumanOnly: this.currentScreen.kind === 'single_player_setup',
    });
    this.syncHostLobbySetup();
    this.renderCurrentScreen();
  }

  private setDraftSlotDifficulty(
    slotId: PlayerSlotId,
    difficulty: AIDifficultyId,
  ): void {
    this.draftSetup = applySlotDifficultyChange(
      this.draftSetup,
      slotId,
      difficulty,
    );
    this.syncHostLobbySetup();
    this.renderCurrentScreen();
  }

  private assignPeerToSlot(peerId: string, slotId: PlayerSlotId): void {
    if (!this.p2pAdapter) {
      return;
    }
    const assigned = this.p2pAdapter.assignPeerToSlot(peerId, slotId);
    if (assigned) {
      this.draftSetup = normalizeMatchSetupConfig({
        ...this.draftSetup,
        slots: {
          ...this.draftSetup.slots,
          [slotId]: { kind: 'human' },
        },
      });
      this.renderCurrentScreen();
    }
  }

  private unassignPeerSlot(slotId: PlayerSlotId): void {
    if (!this.p2pAdapter) {
      return;
    }
    this.p2pAdapter.unassignSlot(slotId);
    this.renderCurrentScreen();
  }

  private launchHostedMatch(): void {
    if (!this.p2pAdapter) {
      return;
    }
    const roomCode = this.p2pAdapter.getRoomState().roomCode;
    const launched = this.p2pAdapter.launchMatch();
    const adapter = this.detachP2POwnership();
    this.draftSetup = launched;
    this.onStartMatch({
      setup: launched,
      ...(adapter ? { simAdapter: adapter } : {}),
      roomCode,
    });
  }

  private async joinOnlineRoom(roomCode: string): Promise<void> {
    const normalized = roomCode.trim().toUpperCase();
    this.joinRoomCodeInput = normalized;
    if (!normalized) {
      this.p2pStatusMessage = 'Enter a valid Room Code to join.';
      this.renderCurrentScreen();
      return;
    }
    const p2p = this.ensureP2PAdapter();
    this.p2pStatusMessage = null;
    this.manualTokenOutput = null;
    await p2p.joinRoom(normalized);
    if (!this.disposed && this.currentScreen.kind === 'join_room_lobby') {
      this.renderCurrentScreen();
    }
  }

  private handleBackToMain(): void {
    this.teardownUnlaunchedP2P();
    this.onBackToMainMenu();
  }

  private renderCurrentScreen(): void {
    this.isRendering = true;
    try {
      const screen = this.currentScreen;
      switch (screen.kind) {
        case 'main_menu':
          this.renderMainMenu();
          break;
        case 'single_player_setup':
          this.renderSinglePlayerSetup();
          break;
        case 'host_room_lobby':
          this.renderHostRoomLobby();
          break;
        case 'join_room_lobby':
          this.renderJoinRoomLobby();
          break;
        default: {
          const _exhaustive: never = screen;
          return _exhaustive;
        }
      }
    } finally {
      this.isRendering = false;
    }
  }

  private renderMainMenu(): void {
    this.container.innerHTML = `
      <div class="menu-backdrop" data-app-screen="main_menu">
        <div class="menu-panel">
          <div class="menu-hero">
            <div class="hud-label" style="margin-bottom: 4px;">5-SYSTEM HUB-AND-SPOKE SPACE RTS</div>
            <h1 class="menu-title">STARCONQUEST</h1>
            <p class="menu-subtitle">
              Command orbital industry, shape fleet doctrines, and seize the Central Nexus.
            </p>
          </div>
          <div class="menu-actions-grid">
            <button type="button" class="menu-action-card" data-menu-action="launch-tutorial">
              <span class="menu-action-title">Guided Tutorial</span>
              <span class="menu-action-desc">8-step interactive coach vs. defensive Cadet AI (10-15 min).</span>
            </button>
            <button type="button" class="menu-action-card primary" data-menu-action="open-single-player">
              <span class="menu-action-title">Start Single Player</span>
              <span class="menu-action-desc">Configure match mode, 4-sector slots, and AI difficulty levels.</span>
            </button>
            <button type="button" class="menu-action-card" data-menu-action="open-host-room">
              <span class="menu-action-title">Host Online Room</span>
              <span class="menu-action-desc">Open a player-hosted WebRTC lobby for up to 4 commanders.</span>
            </button>
            <button type="button" class="menu-action-card" data-menu-action="open-join-room">
              <span class="menu-action-title">Join Online Room</span>
              <span class="menu-action-desc">Connect with a Room Code or cross-network Manual Invite Token.</span>
            </button>
            <button type="button" class="menu-action-card" data-menu-action="launch-battle-sim">
              <span class="menu-action-title">Battle Simulator</span>
              <span class="menu-action-desc">Test fleet compositions directly in the isolated Void Arena.</span>
            </button>
            <a
              class="menu-action-card"
              data-menu-action="open-feedback"
              href="https://github.com/Harkole/StarConquest/issues"
              target="_blank"
              rel="noopener noreferrer"
            >
              <span class="menu-action-title">Feedback</span>
              <span class="menu-action-desc">Report bugs, suggest features, or share balance feedback on GitHub.</span>
            </a>
          </div>
        </div>
      </div>
    `;

    this.container
      .querySelector<HTMLButtonElement>('[data-menu-action="open-single-player"]')
      ?.addEventListener('click', () => {
        this.onOpenSinglePlayer(toSetupPresetId(this.draftSetup.presetId));
      });
    this.container
      .querySelector<HTMLButtonElement>('[data-menu-action="open-host-room"]')
      ?.addEventListener('click', () => {
        this.onOpenHostRoom(toSetupPresetId(this.draftSetup.presetId));
      });
    this.container
      .querySelector<HTMLButtonElement>('[data-menu-action="open-join-room"]')
      ?.addEventListener('click', () => {
        this.onOpenJoinRoom();
      });
    this.container
      .querySelector<HTMLButtonElement>('[data-menu-action="launch-tutorial"]')
      ?.addEventListener('click', () => {
        this.onLaunchTutorial();
      });
    this.container
      .querySelector<HTMLButtonElement>('[data-menu-action="launch-battle-sim"]')
      ?.addEventListener('click', () => {
        this.onLaunchBattleSimulator();
      });
  }

  private renderSinglePlayerSetup(): void {
    const presetCardsHtml = renderPresetCardsHtml({
      presetIds: SETUP_PRESET_IDS,
      activePresetId: this.draftSetup.presetId,
    });
    const slotRowsHtml = renderSlotRowsHtml({
      draftSetup: this.draftSetup,
      singleHumanOnly: true,
    });
    const draftPreset = MATCH_PRESETS[this.draftSetup.presetId];
    const aiCount = PLAYER_SLOT_IDS.filter(
      (id) => this.draftSetup.slots[id].kind === 'ai',
    ).length;
    const emptyCount = PLAYER_SLOT_IDS.filter(
      (id) => this.draftSetup.slots[id].kind === 'empty',
    ).length;
    const localLabel = FACTION_PALETTES[this.draftSetup.localPlayerId].label;

    this.container.innerHTML = `
      <div class="menu-backdrop" data-app-screen="single_player_setup">
        <div class="menu-panel menu-panel--wide">
          <div class="lobby-drawer-header">
            <div>
              <div class="hud-label" style="margin-bottom: 2px;">SINGLE PLAYER SKIRMISH</div>
              <h1 class="menu-section-title">Configure Match Mode & Galaxy Slots</h1>
            </div>
            <button type="button" class="hud-btn" data-menu-action="back-to-main">
              Back
            </button>
          </div>

          <div>
            <div class="hud-label">1. Select Match Mode Preset</div>
            <div class="lobby-preset-grid">
              ${presetCardsHtml}
            </div>
          </div>

          <div>
            <div class="hud-label">2. Configure 4-Player Galaxy Slots (Human / AI Difficulty / Empty Sector)</div>
            <div class="lobby-slots-list">
              ${slotRowsHtml}
            </div>
          </div>

          <div class="menu-footer">
            <div style="font-size: 0.74rem; color: #cbd5e1;">
              Preset: <strong>${draftPreset.displayName}</strong> • Commander: <strong>${localLabel}</strong> • AI Opponents: <strong>${aiCount}</strong> • Empty Sectors: <strong>${emptyCount}</strong>
            </div>
            <div class="hud-btn-row">
              <button type="button" class="hud-btn" data-menu-action="back-to-main">
                Back
              </button>
              <button type="button" class="hud-btn active" data-menu-action="start-match" style="font-weight: 700;">
                Start Match
              </button>
            </div>
          </div>
        </div>
      </div>
    `;

    this.wirePresetAndSlotEvents();
    this.wireBackButtons();

    this.container
      .querySelector<HTMLButtonElement>('[data-menu-action="start-match"]')
      ?.addEventListener('click', () => {
        this.onStartMatch({ setup: this.draftSetup });
      });
  }

  private renderHostRoomLobby(): void {
    const roomState = this.p2pAdapter?.getRoomState() ?? null;
    const roomCode = roomState?.roomCode ?? '';
    const connectedPeers = roomState
      ? roomState.peers.filter((p) => p.connected).length
      : 0;
    const statusText =
      this.p2pStatusMessage ??
      roomState?.lastError ??
      'Share Room Code or Invite Token, then assign connected peers to Human slots.';
    const manualTokenBox = this.manualTokenOutput
      ? `
        <div class="lobby-p2p-row">
          <span style="font-size: 0.7rem; color: #94a3b8;">Generated Invite Token:</span>
          <input type="text" class="lobby-p2p-input" data-p2p-generated-token value="${escapeHtmlAttribute(this.manualTokenOutput)}" readonly />
        </div>
      `
      : '';

    const presetCardsHtml = renderPresetCardsHtml({
      presetIds: SETUP_PRESET_IDS,
      activePresetId: this.draftSetup.presetId,
    });
    const slotRowsHtml = renderSlotRowsHtml({
      draftSetup: this.draftSetup,
      roomState,
    });
    const draftPreset = MATCH_PRESETS[this.draftSetup.presetId];

    this.container.innerHTML = `
      <div class="menu-backdrop" data-app-screen="host_room_lobby">
        <div class="menu-panel menu-panel--wide">
          <div class="lobby-drawer-header">
            <div>
              <div class="hud-label" style="margin-bottom: 2px;">ONLINE P2P MULTIPLAYER (WEBRTC HOST)</div>
              <h1 class="menu-section-title">Host Online Room</h1>
            </div>
            <div class="hud-btn-row">
              <span class="hud-badge">${connectedPeers} / 3 Peers</span>
              <button type="button" class="hud-btn" data-menu-action="back-to-main">
                Close Room
              </button>
            </div>
          </div>

          <div class="lobby-p2p-panel" data-hud-panel="lobby-p2p-panel">
            <div class="lobby-p2p-header">
              <div style="display: flex; align-items: center; gap: 8px;">
                <span class="hud-label" style="margin: 0;">ROOM CODE</span>
                <span class="hud-badge" data-p2p-room-code style="background: rgba(14, 165, 233, 0.25); color: #7dd3fc; font-weight: 700;">${escapeHtmlAttribute(roomCode)}</span>
                <button type="button" class="hud-btn" data-action="copy-room-code">
                  Copy
                </button>
              </div>
              <span style="font-size: 0.72rem; color: #94a3b8;">Player-Hosted • Up to 4 Commanders</span>
            </div>
            <div class="lobby-p2p-row">
              <button type="button" class="hud-btn" data-action="create-manual-invite">
                Create Invite Token
              </button>
              <input type="text" class="lobby-p2p-input" data-p2p-token-input placeholder="Paste Peer Answer Token" />
              <button type="button" class="hud-btn" data-action="apply-manual-answer">
                Apply Answer Token
              </button>
            </div>
            ${manualTokenBox}
            <div class="menu-help-note">
              Same machine or browser tabs: share the <strong>${escapeHtmlAttribute(roomCode || 'SC-XXXX')}</strong> Room Code. Across networks: click <strong>Create Invite Token</strong>, send it to your peer, then paste their Answer Token and click <strong>Apply Answer Token</strong>.
            </div>
            <div class="lobby-p2p-status" data-p2p-status>${statusText}</div>
          </div>

          <div>
            <div class="hud-label">1. Select Match Mode Preset</div>
            <div class="lobby-preset-grid">
              ${presetCardsHtml}
            </div>
          </div>

          <div>
            <div class="hud-label">2. Configure 4-Player Galaxy Slots & Assign Remote Peers</div>
            <div class="lobby-slots-list">
              ${slotRowsHtml}
            </div>
          </div>

          <div class="menu-footer">
            <div style="font-size: 0.74rem; color: #cbd5e1;">
              Room: <strong>${escapeHtmlAttribute(roomCode)}</strong> • Preset: <strong>${draftPreset.displayName}</strong> • Connected Peers: <strong>${connectedPeers} / 3</strong>
            </div>
            <div class="hud-btn-row">
              <button type="button" class="hud-btn" data-menu-action="back-to-main">
                Close Room
              </button>
              <button type="button" class="hud-btn active" data-action="launch-match" style="font-weight: 700;">
                Launch Match
              </button>
            </div>
          </div>
        </div>
      </div>
    `;

    this.wirePresetAndSlotEvents();
    this.wireHostP2PEvents();
    this.wireBackButtons();
  }

  private renderJoinRoomLobby(): void {
    const roomState = this.p2pAdapter?.getRoomState() ?? null;
    const isConnectedPeer = Boolean(
      roomState && roomState.role === 'client' && roomState.status !== 'idle',
    );
    const statusText =
      this.p2pStatusMessage ??
      roomState?.lastError ??
      (isConnectedPeer && roomState
        ? `Assigned Slot: ${FACTION_PALETTES[roomState.localPlayerId].label}. Waiting for host to launch match.`
        : 'Enter a Room Code or paste a Manual Invite Token from the host.');
    const manualTokenBox = this.manualTokenOutput
      ? `
        <div class="lobby-p2p-row">
          <span style="font-size: 0.7rem; color: #94a3b8;">Generated Answer Token (send to host):</span>
          <input type="text" class="lobby-p2p-input" data-p2p-generated-token value="${escapeHtmlAttribute(this.manualTokenOutput)}" readonly />
        </div>
      `
      : '';

    const connectedLobbyHtml =
      isConnectedPeer && roomState
        ? `
          <div>
            <div class="hud-label">Host Match Mode (Read-Only)</div>
            <div class="lobby-preset-grid">
              ${renderPresetCardsHtml({
                presetIds: SETUP_PRESET_IDS,
                activePresetId: toSetupPresetId(roomState.presetId),
                disabled: true,
              })}
            </div>
          </div>
          <div>
            <div class="hud-label">4-Player Galaxy Slots (Read-Only)</div>
            <div class="lobby-slots-list">
              ${renderSlotRowsHtml({
                draftSetup: this.draftSetup,
                roomState,
                disabled: true,
              })}
            </div>
          </div>
        `
        : '';

    const leaveLabel = isConnectedPeer ? 'Disconnect' : 'Back';
    const roomBadgeText =
      isConnectedPeer && roomState
        ? roomState.status === 'joining'
          ? `Joining ${roomState.roomCode ?? 'ROOM'}...`
          : `Connected to Room ${roomState.roomCode ?? 'ROOM'}`
        : 'Not Connected';

    this.container.innerHTML = `
      <div class="menu-backdrop" data-app-screen="join_room_lobby">
        <div class="menu-panel menu-panel--wide">
          <div class="lobby-drawer-header">
            <div>
              <div class="hud-label" style="margin-bottom: 2px;">ONLINE P2P MULTIPLAYER (WEBRTC PEER)</div>
              <h1 class="menu-section-title">Join Online Room</h1>
            </div>
            <div class="hud-btn-row">
              <span class="hud-badge" data-p2p-room-code>${escapeHtmlAttribute(roomBadgeText)}</span>
              <button type="button" class="hud-btn" data-menu-action="back-to-main">
                ${leaveLabel}
              </button>
            </div>
          </div>

          <div class="lobby-p2p-panel" data-hud-panel="lobby-p2p-panel">
            <div class="lobby-p2p-row">
              <input
                type="text"
                class="lobby-p2p-input"
                data-p2p-join-input
                placeholder="Room Code (e.g. SC-XXXX)"
                maxlength="12"
                value="${escapeHtmlAttribute(this.joinRoomCodeInput)}"
              />
              <button type="button" class="hud-btn active" data-action="join-p2p-room">
                Join Room
              </button>
            </div>
            <div class="lobby-p2p-row">
              <input
                type="text"
                class="lobby-p2p-input"
                data-p2p-token-input
                placeholder="Paste Manual Invite Token from Host"
              />
              <button type="button" class="hud-btn" data-action="accept-manual-invite">
                Accept Invite Token
              </button>
            </div>
            ${manualTokenBox}
            <div class="menu-help-note">
              Same machine or browser tabs: enter the host's <strong>SC-XXXX</strong> Room Code and click <strong>Join Room</strong>. Across networks: paste the host's Invite Token, click <strong>Accept Invite Token</strong>, and send back the generated Answer Token.
            </div>
            <div class="lobby-p2p-status" data-p2p-status>${statusText}</div>
          </div>

          ${connectedLobbyHtml}

          <div class="menu-footer">
            <div style="font-size: 0.74rem; color: #cbd5e1;">
              ${isConnectedPeer ? 'Match starts automatically when the host launches.' : 'Ready to connect to a player-hosted room.'}
            </div>
            <button type="button" class="hud-btn" data-menu-action="back-to-main">
              ${leaveLabel}
            </button>
          </div>
        </div>
      </div>
    `;

    this.wireJoinP2PEvents();
    this.wireBackButtons();
  }

  private wireBackButtons(): void {
    this.container
      .querySelectorAll<HTMLButtonElement>('[data-menu-action="back-to-main"]')
      .forEach((btn) => {
        btn.addEventListener('click', () => {
          this.handleBackToMain();
        });
      });
  }

  private wirePresetAndSlotEvents(): void {
    this.container
      .querySelectorAll<HTMLButtonElement>('[data-lobby-preset]')
      .forEach((btn) => {
        btn.addEventListener('click', () => {
          const presetId = btn.dataset.lobbyPreset;
          if (isMatchPresetId(presetId)) {
            this.setDraftPreset(presetId);
          }
        });
      });

    this.container
      .querySelectorAll<HTMLButtonElement>('[data-lobby-role]')
      .forEach((btn) => {
        btn.addEventListener('click', () => {
          const slotId = btn.dataset.lobbySlot;
          const role = btn.dataset.lobbyRole;
          if (isPlayerSlotId(slotId) && isPlayerSlotRole(role)) {
            this.setDraftSlotRole(slotId, role);
          }
        });
      });

    this.container
      .querySelectorAll<HTMLButtonElement>('[data-lobby-difficulty]')
      .forEach((btn) => {
        btn.addEventListener('click', () => {
          const slotId = btn.dataset.lobbySlot;
          const diff = btn.dataset.lobbyDifficulty;
          if (isPlayerSlotId(slotId) && isAIDifficultyId(diff)) {
            this.setDraftSlotDifficulty(slotId, diff);
          }
        });
      });
  }

  private wireHostP2PEvents(): void {
    this.container
      .querySelector<HTMLButtonElement>('[data-action="copy-room-code"]')
      ?.addEventListener('click', () => {
        const code = this.p2pAdapter?.getRoomState().roomCode ?? '';
        if (!code) {
          return;
        }
        try {
          void globalThis.navigator?.clipboard?.writeText?.(code);
          this.p2pStatusMessage = `Copied room code ${code}.`;
          this.renderCurrentScreen();
        } catch {
          this.p2pStatusMessage = `Room code: ${code}`;
          this.renderCurrentScreen();
        }
      });

    this.container
      .querySelector<HTMLButtonElement>('[data-action="create-manual-invite"]')
      ?.addEventListener('click', () => {
        if (!this.p2pAdapter) {
          return;
        }
        void this.p2pAdapter
          .createManualInviteToken()
          .then((token) => {
            this.manualTokenOutput = token;
            this.p2pStatusMessage =
              'Invite token created. Share it with a remote peer.';
            this.renderCurrentScreen();
          })
          .catch((err: unknown) => {
            this.p2pStatusMessage =
              err instanceof Error ? err.message : 'Failed to create invite token.';
            this.renderCurrentScreen();
          });
      });

    this.container
      .querySelector<HTMLButtonElement>('[data-action="apply-manual-answer"]')
      ?.addEventListener('click', () => {
        if (!this.p2pAdapter) {
          return;
        }
        const tokenInput = this.container.querySelector<HTMLInputElement>(
          '[data-p2p-token-input]',
        );
        const token = tokenInput?.value?.trim() ?? '';
        if (!token) {
          this.p2pStatusMessage = 'Paste a peer answer token first.';
          this.renderCurrentScreen();
          return;
        }
        void this.p2pAdapter
          .applyManualAnswerToken(token)
          .then(() => {
            this.p2pStatusMessage = 'Peer answer token applied.';
            this.renderCurrentScreen();
          })
          .catch((err: unknown) => {
            this.p2pStatusMessage =
              err instanceof Error ? err.message : 'Invalid answer token.';
            this.renderCurrentScreen();
          });
      });

    this.container
      .querySelectorAll<HTMLButtonElement>('[data-p2p-assign-slot]')
      .forEach((btn) => {
        btn.addEventListener('click', () => {
          const slotId = btn.dataset.p2pAssignSlot;
          const peerId = btn.dataset.p2pPeerId;
          if (isPlayerSlotId(slotId) && peerId) {
            this.assignPeerToSlot(peerId, slotId);
          }
        });
      });

    this.container
      .querySelectorAll<HTMLButtonElement>('[data-p2p-unassign-slot]')
      .forEach((btn) => {
        btn.addEventListener('click', () => {
          const slotId = btn.dataset.p2pUnassignSlot;
          if (isPlayerSlotId(slotId)) {
            this.unassignPeerSlot(slotId);
          }
        });
      });

    this.container
      .querySelector<HTMLButtonElement>('[data-action="launch-match"]')
      ?.addEventListener('click', () => {
        this.launchHostedMatch();
      });
  }

  private wireJoinP2PEvents(): void {
    this.container
      .querySelector<HTMLButtonElement>('[data-action="join-p2p-room"]')
      ?.addEventListener('click', () => {
        const inputEl = this.container.querySelector<HTMLInputElement>(
          '[data-p2p-join-input]',
        );
        const code = inputEl?.value ?? '';
        void this.joinOnlineRoom(code);
      });

    this.container
      .querySelector<HTMLButtonElement>('[data-action="accept-manual-invite"]')
      ?.addEventListener('click', () => {
        const tokenInput = this.container.querySelector<HTMLInputElement>(
          '[data-p2p-token-input]',
        );
        const token = tokenInput?.value?.trim() ?? '';
        if (!token) {
          this.p2pStatusMessage = 'Paste a manual invite token first.';
          this.renderCurrentScreen();
          return;
        }
        const p2p = this.ensureP2PAdapter();
        void p2p
          .acceptManualInviteToken(token)
          .then((answerToken) => {
            this.manualTokenOutput = answerToken;
            this.p2pStatusMessage =
              'Answer token generated. Send it back to the host.';
            this.renderCurrentScreen();
          })
          .catch((err: unknown) => {
            this.p2pStatusMessage =
              err instanceof Error ? err.message : 'Invalid manual invite token.';
            this.renderCurrentScreen();
          });
      });
  }
}
