import { describe, expect, it } from 'vitest';
import type {
  MatchPresetId,
  MatchSetupConfig,
  MatchSetupInput,
} from '../../../shared/config/index.ts';
import { CENTRAL_SUPER_EARTH_PLANET_ID } from '../../../shared/sim/gameSimulation.ts';
import { LocalSimAdapter } from '../../net/localSimAdapter.ts';
import {
  InMemorySignalingHub,
  createInMemorySignalingTransport,
} from '../../net/signaling.ts';
import type { ClientSimAdapter } from '../../net/simAdapter.ts';
import {
  WebRTCPeerAdapter,
  type DataChannelLike,
  type PeerConnectionFactory,
  type PeerConnectionLike,
} from '../../net/webrtcPeerAdapter.ts';
import {
  LobbyController,
  formatMatchClockSeconds,
  type LobbySceneManagerContract,
} from '../lobbyController.ts';
import {
  createClientAppShell,
  type MatchRuntimeFactoryParams,
} from '../../main.ts';

class FakeHtmlElement {
  public className = '';
  public dataset: Record<string, string> = {};
  public style: Record<string, string> = {};
  public textContent = '';
  public value = '';
  public children: FakeHtmlElement[] = [];
  private readonly classSet = new Set<string>();
  public readonly classList = {
    add: (cls: string): void => {
      this.classSet.add(cls);
    },
    remove: (cls: string): void => {
      this.classSet.delete(cls);
    },
    contains: (cls: string): boolean => this.classSet.has(cls),
  };
  private html = '';
  private readonly listeners = new Map<string, Set<() => void>>();
  private readonly interactiveBySelector = new Map<string, FakeHtmlElement[]>();

  public get innerHTML(): string {
    return this.html;
  }

  public set innerHTML(value: string) {
    this.html = value;
    this.interactiveBySelector.clear();
  }

  public append(...nodes: FakeHtmlElement[]): void {
    this.children.push(...nodes);
  }

  public addEventListener(type: string, cb: () => void): void {
    const set = this.listeners.get(type) ?? new Set();
    set.add(cb);
    this.listeners.set(type, set);
  }

  public click(): void {
    for (const fn of this.listeners.get('click') ?? []) {
      fn();
    }
  }

  public querySelector<T = FakeHtmlElement>(selector: string): T | null {
    const list = this.querySelectorAll<T>(selector);
    return list[0] ?? null;
  }

  public querySelectorAll<T = FakeHtmlElement>(selector: string): T[] {
    for (const child of this.children) {
      if (
        selector === `[data-hud-panel="${child.dataset.hudPanel ?? ''}"]`
      ) {
        return [child as unknown as T];
      }
    }

    const cached = this.interactiveBySelector.get(selector);
    if (cached) {
      return cached as unknown as T[];
    }

    const matches: FakeHtmlElement[] = [];
    if (selector === '[data-lobby-preset]') {
      const regex = /data-lobby-preset="([^"]+)"/g;
      for (const m of this.html.matchAll(regex)) {
        const el = new FakeHtmlElement();
        el.dataset.lobbyPreset = m[1]!;
        matches.push(el);
      }
    } else if (selector === '[data-lobby-role]') {
      const regex = /data-lobby-slot="([^"]+)"\s+data-lobby-role="([^"]+)"/g;
      for (const m of this.html.matchAll(regex)) {
        const el = new FakeHtmlElement();
        el.dataset.lobbySlot = m[1]!;
        el.dataset.lobbyRole = m[2]!;
        matches.push(el);
      }
    } else if (selector === '[data-lobby-difficulty]') {
      const regex =
        /data-lobby-slot="([^"]+)"\s+data-lobby-difficulty="([^"]+)"/g;
      for (const m of this.html.matchAll(regex)) {
        const el = new FakeHtmlElement();
        el.dataset.lobbySlot = m[1]!;
        el.dataset.lobbyDifficulty = m[2]!;
        matches.push(el);
      }
    } else if (selector.startsWith('[data-action="')) {
      const action = selector.slice('[data-action="'.length, -2);
      if (this.html.includes(`data-action="${action}"`)) {
        const el = new FakeHtmlElement();
        el.dataset.action = action;
        matches.push(el);
      }
    } else if (selector.startsWith('[data-menu-action="')) {
      const action = selector.slice('[data-menu-action="'.length, -2);
      const regex = new RegExp(`data-menu-action="${action}"`, 'g');
      for (const _m of this.html.matchAll(regex)) {
        const el = new FakeHtmlElement();
        el.dataset.menuAction = action;
        matches.push(el);
      }
    } else if (selector.startsWith('[data-lobby-standing="')) {
      const slot = selector.slice('[data-lobby-standing="'.length, -2);
      if (this.html.includes(`data-lobby-standing="${slot}"`)) {
        const el = new FakeHtmlElement();
        el.dataset.lobbyStanding = slot;
        matches.push(el);
      }
    } else if (selector === '[data-p2p-assign-slot]') {
      const regex =
        /data-p2p-assign-slot="([^"]+)"\s+data-p2p-peer-id="([^"]+)"/g;
      for (const m of this.html.matchAll(regex)) {
        const el = new FakeHtmlElement();
        el.dataset.p2pAssignSlot = m[1]!;
        el.dataset.p2pPeerId = m[2]!;
        matches.push(el);
      }
    } else if (selector === '[data-p2p-unassign-slot]') {
      const regex = /data-p2p-unassign-slot="([^"]+)"/g;
      for (const m of this.html.matchAll(regex)) {
        const el = new FakeHtmlElement();
        el.dataset.p2pUnassignSlot = m[1]!;
        matches.push(el);
      }
    } else if (selector === '[data-p2p-generated-token]') {
      const match = this.html.match(/data-p2p-generated-token\s+value="([^"]*)"/);
      if (match) {
        const el = new FakeHtmlElement();
        el.value = match[1]!;
        matches.push(el);
      }
    } else if (
      selector === '[data-p2p-join-input]' ||
      selector === '[data-p2p-token-input]' ||
      selector === '[data-p2p-room-code]' ||
      selector === '[data-p2p-status]'
    ) {
      const attr = selector.slice(1, -1);
      if (this.html.includes(attr)) {
        matches.push(new FakeHtmlElement());
      }
    }

    this.interactiveBySelector.set(selector, matches);
    return matches as unknown as T[];
  }
}

function withFakeDocument<T>(fn: () => T): T {
  const prevDoc = (globalThis as { document?: unknown }).document;
  (globalThis as { document?: unknown }).document = {
    createElement: () => new FakeHtmlElement(),
  };
  try {
    return fn();
  } finally {
    (globalThis as { document?: unknown }).document = prevDoc;
  }
}

describe('LocalSimAdapter & LobbyController', () => {
  it('spawns StandardAIBot only for AI slots with configured difficulties and reconfigures on resetMatch', () => {
    const adapter = new LocalSimAdapter('standard_tactical');
    expect(adapter.localPlayerId).toBe('player_1');
    expect(adapter.getAIBots()).toHaveLength(3);
    expect(adapter.getAIBots().map((b) => b.playerId)).toEqual([
      'player_2',
      'player_3',
      'player_4',
    ]);

    const nextSetup = adapter.resetMatch({
      presetId: 'grand_conquest',
      localPlayerId: 'player_2',
      slots: {
        player_1: { kind: 'ai', difficulty: 'admiral' },
        player_2: { kind: 'human' },
        player_3: { kind: 'ai', difficulty: 'cadet' },
        player_4: { kind: 'empty' },
      },
    });

    expect(nextSetup.presetId).toBe('grand_conquest');
    expect(adapter.localPlayerId).toBe('player_2');
    expect(adapter.getAIBots()).toHaveLength(2);
    expect(
      adapter.getAIBots().map((b) => ({
        playerId: b.playerId,
        difficulty: b.difficulty,
      })),
    ).toEqual([
      { playerId: 'player_1', difficulty: 'admiral' },
      { playerId: 'player_3', difficulty: 'cadet' },
    ]);
    expect(
      adapter.simulation.getPlanetState('system_starter_4_homeworld').ownerId,
    ).toBeNull();
  });

  it('configures match presets, Human/AI/Empty slots, and launches a reset match via LobbyController', () => {
    withFakeDocument(() => {
      const adapter = new LocalSimAdapter('standard_tactical');
      let launchedConfig: MatchSetupConfig | null = null;

      const sceneManager: LobbySceneManagerContract = {
        simAdapter: adapter,
        resetMatch(
          presetOrSetup: MatchPresetId | MatchSetupInput,
        ): MatchSetupConfig {
          return adapter.resetMatch(presetOrSetup);
        },
      };

      const hostContainer = new FakeHtmlElement();
      const lobby = new LobbyController({
        hostContainer: hostContainer as unknown as HTMLElement,
        sceneManager,
        onMatchLaunched: (setup) => {
          launchedConfig = setup;
        },
      });

      expect(lobby.isLobbyOpen()).toBe(false);
      lobby.openLobby();
      expect(lobby.isLobbyOpen()).toBe(true);

      const rootEl = hostContainer.children[0]!;
      const drawerEl = rootEl.querySelector('[data-hud-panel="lobby-drawer"]')!;
      expect(drawerEl.style.display).toBe('flex');

      const grandPresetBtn = drawerEl
        .querySelectorAll('[data-lobby-preset]')
        .find((b) => b.dataset.lobbyPreset === 'grand_conquest')!;
      grandPresetBtn.click();
      expect(lobby.getDraftSetup().presetId).toBe('grand_conquest');

      const p2AdmiralBtn = drawerEl
        .querySelectorAll('[data-lobby-difficulty]')
        .find(
          (b) =>
            b.dataset.lobbySlot === 'player_2' &&
            b.dataset.lobbyDifficulty === 'admiral',
        )!;
      p2AdmiralBtn.click();
      expect(lobby.getDraftSetup().slots.player_2).toEqual({
        kind: 'ai',
        difficulty: 'admiral',
      });

      const p4EmptyBtn = drawerEl
        .querySelectorAll('[data-lobby-role]')
        .find(
          (b) =>
            b.dataset.lobbySlot === 'player_4' &&
            b.dataset.lobbyRole === 'empty',
        )!;
      p4EmptyBtn.click();
      expect(lobby.getDraftSetup().slots.player_4).toEqual({ kind: 'empty' });

      const launchBtn = drawerEl.querySelector('[data-action="launch-match"]')!;
      launchBtn.click();

      expect(lobby.isLobbyOpen()).toBe(false);
      expect(launchedConfig).not.toBeNull();
      expect(adapter.simulation.presetId).toBe('grand_conquest');
      expect(adapter.simulation.isPlayerSlotActive('player_4')).toBe(false);
    });
  });

  it('renders live King of the Hill telemetry and Victory/Defeat outcome banners with spectator dismiss', () => {
    expect(formatMatchClockSeconds(600)).toBe('10:00');
    expect(formatMatchClockSeconds(125)).toBe('02:05');

    withFakeDocument(() => {
      const adapter = new LocalSimAdapter({
        presetId: 'grand_conquest',
        slots: {
          player_1: { kind: 'human' },
          player_2: { kind: 'ai', difficulty: 'standard' },
          player_3: { kind: 'empty' },
          player_4: { kind: 'empty' },
        },
      });

      const sceneManager: LobbySceneManagerContract = {
        simAdapter: adapter,
        resetMatch: (s) => adapter.resetMatch(s),
      };

      const hostContainer = new FakeHtmlElement();
      const lobby = new LobbyController({
        hostContainer: hostContainer as unknown as HTMLElement,
        sceneManager,
      });

      const rootEl = hostContainer.children[0]!;
      const kothBanner = rootEl.querySelector(
        '[data-hud-panel="koth-telemetry-banner"]',
      )!;
      const outcomeBanner = rootEl.querySelector(
        '[data-hud-panel="match-outcome-banner"]',
      )!;

      expect(kothBanner.style.display).toBe('flex');
      expect(outcomeBanner.style.display).toBe('none');

      adapter.submitPlayerCommand({
        type: 'BUILD_ORBITAL_STRUCTURE',
        playerId: 'player_1',
        planetId: CENTRAL_SUPER_EARTH_PLANET_ID,
        slotIndex: 0,
        structureId: 'planetary_outpost',
      });
      adapter.simulation.stepTick(25);
      adapter.simulation.stepTick(120);
      lobby.syncTelemetry();

      expect(kothBanner.innerHTML).toContain('Player 1 (Purple)');
      expect(kothBanner.innerHTML).toContain('02:00 / 10:00');

      const p2Home = adapter.simulation.getPlanetState(
        'system_starter_2_homeworld',
      );
      const p2Cnc = p2Home.structures.find(
        (s) => s.structureId === 'command_and_control',
      )!;
      adapter.simulation.destroyOrbitalStructure(p2Cnc.id);
      lobby.syncTelemetry();

      expect(outcomeBanner.style.display).toBe('flex');
      expect(outcomeBanner.innerHTML).toContain('VICTORY');
      expect(outcomeBanner.innerHTML).toContain(
        'Last Command & Control Standing',
      );

      const dismissBtn = outcomeBanner.querySelector(
        '[data-action="dismiss-outcome-banner"]',
      )!;
      dismissBtn.click();
      expect(outcomeBanner.style.display).toBe('none');
    });
  });

  it('supports the tutorial preset card and quick-launch via launchTutorialMatch()', () => {
    withFakeDocument(() => {
      const adapter = new LocalSimAdapter('standard_tactical');
      let launchedConfig: MatchSetupConfig | null = null;

      const sceneManager: LobbySceneManagerContract = {
        simAdapter: adapter,
        resetMatch(
          presetOrSetup: MatchPresetId | MatchSetupInput,
        ): MatchSetupConfig {
          return adapter.resetMatch(presetOrSetup);
        },
      };

      const hostContainer = new FakeHtmlElement();
      const lobby = new LobbyController({
        hostContainer: hostContainer as unknown as HTMLElement,
        sceneManager,
        onMatchLaunched: (setup) => {
          launchedConfig = setup;
        },
      });

      lobby.openLobby();
      const rootEl = hostContainer.children[0]!;
      const drawerEl = rootEl.querySelector('[data-hud-panel="lobby-drawer"]')!;

      const tutorialPresetBtn = drawerEl
        .querySelectorAll('[data-lobby-preset]')
        .find((b) => b.dataset.lobbyPreset === 'tutorial')!;
      expect(tutorialPresetBtn).toBeDefined();
      tutorialPresetBtn.click();

      expect(lobby.getDraftSetup()).toEqual({
        presetId: 'tutorial',
        localPlayerId: 'player_1',
        slots: {
          player_1: { kind: 'human' },
          player_2: { kind: 'ai', difficulty: 'cadet' },
          player_3: { kind: 'empty' },
          player_4: { kind: 'empty' },
        },
      });

      const launchTutorialBtn = drawerEl.querySelector(
        '[data-action="launch-tutorial"]',
      )!;
      expect(launchTutorialBtn).toBeDefined();
      launchTutorialBtn.click();

      expect(lobby.isLobbyOpen()).toBe(false);
      expect(launchedConfig).not.toBeNull();
      expect(launchedConfig!.presetId).toBe('tutorial');
      expect(adapter.simulation.presetId).toBe('tutorial');
      expect(adapter.getAIBots().map((b) => b.difficulty)).toEqual(['cadet']);
    });
  });

  it('hosts an online P2P room, syncs preset/slot changes, assigns a remote peer, and launches match_start', async () => {
    await withFakeDocument(async () => {
      const hub = new InMemorySignalingHub();
      const pcRegistry = new FakePeerConnectionRegistry();
      const factory = pcRegistry.createFactory();

      let currentAdapter: ClientSimAdapter = new LocalSimAdapter('standard_tactical');
      const hostP2P = new WebRTCPeerAdapter({
        localPeerId: 'host-1',
        signalingTransport: createInMemorySignalingTransport(hub),
        peerConnectionFactory: factory,
      });

      const sceneManager: LobbySceneManagerContract = {
        get simAdapter() {
          return currentAdapter;
        },
        setSimAdapter(next) {
          currentAdapter = next;
        },
        resetMatch: (s) => currentAdapter.resetMatch(s),
      };

      const hostContainer = new FakeHtmlElement();
      const lobby = new LobbyController({
        hostContainer: hostContainer as unknown as HTMLElement,
        sceneManager,
        createP2PAdapter: () => hostP2P,
      });

      lobby.openLobby();
      const code = lobby.hostOnlineRoom('SC-TEST');
      expect(code).toBe('SC-TEST');
      expect(currentAdapter.mode).toBe('p2p_host');

      const rootEl = hostContainer.children[0]!;
      const drawerEl = rootEl.querySelector('[data-hud-panel="lobby-drawer"]')!;
      expect(drawerEl.innerHTML).toContain('SC-TEST');
      expect(drawerEl.innerHTML).toContain('Host (Local Commander)');

      lobby.setDraftPreset('blitz_skirmish');
      expect(hostP2P.getRoomState().presetId).toBe('blitz_skirmish');

      lobby.setDraftSlotRole('player_2', 'human');
      expect(hostP2P.getRoomState().slots.find((s) => s.slotId === 'player_2')?.kind).toBe(
        'human',
      );
      expect(drawerEl.innerHTML).toContain('Open Remote Slot');

      const peer2 = new WebRTCPeerAdapter({
        localPeerId: 'peer-2',
        signalingTransport: createInMemorySignalingTransport(hub),
        peerConnectionFactory: factory,
      });
      await peer2.joinRoom('SC-TEST');
      await flushMicrotasks();

      expect(hostP2P.getRoomState().peers).toHaveLength(1);
      expect(drawerEl.innerHTML).toContain('data-p2p-unassign-slot="player_2"');

      const unassignBtn = drawerEl
        .querySelectorAll('[data-p2p-unassign-slot]')
        .find((b) => b.dataset.p2pUnassignSlot === 'player_2')!;
      expect(unassignBtn).toBeDefined();
      unassignBtn.click();
      await flushMicrotasks();

      expect(hostP2P.getRoomState().peers[0]!.assignedSlotId).toBeNull();
      expect(drawerEl.innerHTML).toContain('data-p2p-assign-slot="player_2"');

      const assignBtn = drawerEl
        .querySelectorAll('[data-p2p-assign-slot]')
        .find(
          (b) =>
            b.dataset.p2pAssignSlot === 'player_2' &&
            b.dataset.p2pPeerId === 'peer-2',
        )!;
      expect(assignBtn).toBeDefined();
      assignBtn.click();
      await flushMicrotasks();

      expect(peer2.getRoomState().localPlayerId).toBe('player_2');
      expect(drawerEl.innerHTML).toContain('data-p2p-unassign-slot="player_2"');

      const launched = lobby.launchDraftMatch();
      await flushMicrotasks();

      expect(launched.presetId).toBe('blitz_skirmish');
      expect(hostP2P.getRoomState().status).toBe('in_match');
      expect(peer2.getRoomState().status).toBe('in_match');
      expect(peer2.simulation.presetId).toBe('blitz_skirmish');
    });
  });

  it('joins an online P2P room as a peer, receives lobby_sync and match_start, and restores local mode on leaveOnlineRoom()', async () => {
    await withFakeDocument(async () => {
      const hub = new InMemorySignalingHub();
      const pcRegistry = new FakePeerConnectionRegistry();
      const factory = pcRegistry.createFactory();

      const hostP2P = new WebRTCPeerAdapter({
        localPeerId: 'host-1',
        signalingTransport: createInMemorySignalingTransport(hub),
        peerConnectionFactory: factory,
      });
      hostP2P.hostRoom({
        roomCode: 'SC-JOIN',
        presetOrSetup: {
          presetId: 'grand_conquest',
          localPlayerId: 'player_1',
          slots: {
            player_1: { kind: 'human' },
            player_2: { kind: 'human' },
            player_3: { kind: 'ai', difficulty: 'standard' },
            player_4: { kind: 'empty' },
          },
        },
      });

      let currentAdapter: ClientSimAdapter = new LocalSimAdapter('standard_tactical');
      let peerLaunchedSetup: MatchSetupConfig | null = null;
      const peerP2P = new WebRTCPeerAdapter({
        localPeerId: 'peer-2',
        signalingTransport: createInMemorySignalingTransport(hub),
        peerConnectionFactory: factory,
      });

      const sceneManager: LobbySceneManagerContract = {
        get simAdapter() {
          return currentAdapter;
        },
        setSimAdapter(next) {
          currentAdapter = next;
        },
        resetMatch: (s) => currentAdapter.resetMatch(s),
      };

      const hostContainer = new FakeHtmlElement();
      const lobby = new LobbyController({
        hostContainer: hostContainer as unknown as HTMLElement,
        sceneManager,
        createP2PAdapter: () => peerP2P,
        onMatchLaunched: (setup) => {
          peerLaunchedSetup = setup;
        },
      });

      lobby.openLobby();
      await lobby.joinOnlineRoom('SC-JOIN');
      await flushMicrotasks();

      expect(currentAdapter.mode).toBe('p2p_client');
      const rootEl = hostContainer.children[0]!;
      const drawerEl = rootEl.querySelector('[data-hud-panel="lobby-drawer"]')!;
      expect(drawerEl.innerHTML).toContain('Connected to Room SC-JOIN');
      expect(drawerEl.innerHTML).toContain('YOU (Remote)');

      hostP2P.assignPeerToSlot('peer-2', 'player_2');
      await flushMicrotasks();
      hostP2P.launchMatch();
      await flushMicrotasks();

      expect(lobby.isLobbyOpen()).toBe(false);
      expect(peerLaunchedSetup).not.toBeNull();
      expect(peerLaunchedSetup!.presetId).toBe('grand_conquest');
      expect(peerP2P.getRoomState().status).toBe('in_match');

      lobby.leaveOnlineRoom();
      expect(currentAdapter.mode).toBe('local');
    });
  });
});

describe('MenuController & createClientAppShell pre-match flows', () => {
  it('navigates MainMenu -> SinglePlayerSetup, edits preset and 4 slots, and passes full MatchSetupConfig to createMatchRuntime', () => {
    const canvas = new FakeHtmlElement();
    const hudContainer = new FakeHtmlElement();
    let capturedParams: MatchRuntimeFactoryParams | null = null;
    let disposedCount = 0;

    const app = createClientAppShell({
      canvas: canvas as unknown as HTMLCanvasElement,
      hudContainer: hudContainer as unknown as HTMLElement,
      createMatchRuntime: (params) => {
        capturedParams = params;
        return {
          dispose: () => {
            disposedCount += 1;
          },
        };
      },
    });

    expect(app.getState()).toEqual({ kind: 'main_menu' });
    expect(app.isRuntimeActive()).toBe(false);
    expect(canvas.style.display).toBe('none');
    expect(hudContainer.classList.contains('menu-active')).toBe(true);
    expect(hudContainer.innerHTML).toContain('data-app-screen="main_menu"');

    hudContainer.querySelector('[data-menu-action="open-single-player"]')!.click();
    expect(app.getState().kind).toBe('single_player_setup');
    expect(app.isRuntimeActive()).toBe(false);
    expect(hudContainer.innerHTML).toContain('data-app-screen="single_player_setup"');

    hudContainer
      .querySelectorAll('[data-lobby-preset]')
      .find((b) => b.dataset.lobbyPreset === 'grand_conquest')!
      .click();

    hudContainer
      .querySelectorAll('[data-lobby-difficulty]')
      .find(
        (b) =>
          b.dataset.lobbySlot === 'player_2' &&
          b.dataset.lobbyDifficulty === 'admiral',
      )!
      .click();

    hudContainer
      .querySelectorAll('[data-lobby-role]')
      .find(
        (b) =>
          b.dataset.lobbySlot === 'player_4' &&
          b.dataset.lobbyRole === 'empty',
      )!
      .click();

    hudContainer.querySelector('[data-menu-action="start-match"]')!.click();

    expect(app.getState().kind).toBe('in_match');
    expect(app.isRuntimeActive()).toBe(true);
    expect(canvas.style.display).toBe('block');
    expect(hudContainer.classList.contains('menu-active')).toBe(false);
    expect(capturedParams).not.toBeNull();
    expect(capturedParams!.session.sessionKind).toBe('single_player');
    expect(capturedParams!.session.presetId).toBe('grand_conquest');
    expect(capturedParams!.matchSetup).toEqual({
      presetId: 'grand_conquest',
      localPlayerId: 'player_1',
      slots: {
        player_1: { kind: 'human' },
        player_2: { kind: 'ai', difficulty: 'admiral' },
        player_3: { kind: 'ai', difficulty: 'standard' },
        player_4: { kind: 'empty' },
      },
    });

    capturedParams!.onQuitToMainMenu();
    expect(disposedCount).toBe(1);
    expect(app.getState()).toEqual({ kind: 'main_menu' });
    expect(app.isRuntimeActive()).toBe(false);
    expect(hudContainer.classList.contains('menu-active')).toBe(true);
    app.dispose();
  });

  it('hosts a WebRTC room from MainMenu, syncs preset/slots, assigns remote peer, and hands p2p_host adapter to createMatchRuntime', async () => {
    const hub = new InMemorySignalingHub();
    const pcRegistry = new FakePeerConnectionRegistry();
    const factory = pcRegistry.createFactory();

    const hostP2P = new WebRTCPeerAdapter({
      localPeerId: 'host-menu',
      signalingTransport: createInMemorySignalingTransport(hub),
      peerConnectionFactory: factory,
    });

    const canvas = new FakeHtmlElement();
    const hudContainer = new FakeHtmlElement();
    let capturedParams: MatchRuntimeFactoryParams | null = null;

    const app = createClientAppShell({
      canvas: canvas as unknown as HTMLCanvasElement,
      hudContainer: hudContainer as unknown as HTMLElement,
      createP2PAdapter: () => hostP2P,
      createMatchRuntime: (params) => {
        capturedParams = params;
        return {
          dispose: () => {
            if (params.simAdapter && 'leaveRoom' in params.simAdapter) {
              (params.simAdapter as WebRTCPeerAdapter).leaveRoom();
            }
          },
        };
      },
    });

    hudContainer.querySelector('[data-menu-action="open-host-room"]')!.click();
    expect(app.getState().kind).toBe('host_room_lobby');
    expect(hostP2P.getRoomState().role).toBe('host');
    expect(hostP2P.getRoomState().status).toBe('hosting');
    const roomCode = hostP2P.getRoomState().roomCode!;
    expect(roomCode.length).toBeGreaterThan(0);
    expect(hudContainer.innerHTML).toContain(roomCode);

    hudContainer
      .querySelectorAll('[data-lobby-preset]')
      .find((b) => b.dataset.lobbyPreset === 'blitz_skirmish')!
      .click();
    expect(hostP2P.getRoomState().presetId).toBe('blitz_skirmish');

    hudContainer
      .querySelectorAll('[data-lobby-role]')
      .find(
        (b) =>
          b.dataset.lobbySlot === 'player_2' &&
          b.dataset.lobbyRole === 'human',
      )!
      .click();

    const remotePeer = new WebRTCPeerAdapter({
      localPeerId: 'peer-remote',
      signalingTransport: createInMemorySignalingTransport(hub),
      peerConnectionFactory: factory,
    });
    await remotePeer.joinRoom(roomCode);
    await flushMicrotasks();

    expect(hostP2P.getRoomState().peers).toHaveLength(1);
    hudContainer
      .querySelectorAll('[data-p2p-unassign-slot]')
      .find((b) => b.dataset.p2pUnassignSlot === 'player_2')!
      .click();
    await flushMicrotasks();
    expect(hostP2P.getRoomState().peers[0]!.assignedSlotId).toBeNull();

    hudContainer
      .querySelectorAll('[data-p2p-assign-slot]')
      .find(
        (b) =>
          b.dataset.p2pAssignSlot === 'player_2' &&
          b.dataset.p2pPeerId === 'peer-remote',
      )!
      .click();
    await flushMicrotasks();
    expect(remotePeer.getRoomState().localPlayerId).toBe('player_2');

    hudContainer.querySelector('[data-action="launch-match"]')!.click();
    await flushMicrotasks();

    expect(app.getState().kind).toBe('in_match');
    expect(capturedParams).not.toBeNull();
    expect(capturedParams!.session.sessionKind).toBe('p2p_host');
    expect(capturedParams!.session.roomCode).toBe(roomCode);
    expect(capturedParams!.simAdapter).toBe(hostP2P);
    expect(hostP2P.getRoomState().status).toBe('in_match');
    expect(remotePeer.getRoomState().status).toBe('in_match');

    app.dispose();
    expect(hostP2P.getRoomState().status).toBe('idle');
    remotePeer.leaveRoom();
  });

  it('joins a WebRTC room by code, auto-enters match on host launch with p2p_client adapter, and cleans up on Disconnect', async () => {
    const hub = new InMemorySignalingHub();
    const pcRegistry = new FakePeerConnectionRegistry();
    const factory = pcRegistry.createFactory();

    const hostP2P = new WebRTCPeerAdapter({
      localPeerId: 'host-join-test',
      signalingTransport: createInMemorySignalingTransport(hub),
      peerConnectionFactory: factory,
    });
    hostP2P.hostRoom({
      roomCode: 'SC-MENU',
      presetOrSetup: {
        presetId: 'grand_conquest',
        localPlayerId: 'player_1',
        slots: {
          player_1: { kind: 'human' },
          player_2: { kind: 'human' },
          player_3: { kind: 'ai', difficulty: 'standard' },
          player_4: { kind: 'empty' },
        },
      },
    });

    const createdPeers: WebRTCPeerAdapter[] = [];
    const canvas = new FakeHtmlElement();
    const hudContainer = new FakeHtmlElement();
    let capturedParams: MatchRuntimeFactoryParams | null = null;

    const app = createClientAppShell({
      canvas: canvas as unknown as HTMLCanvasElement,
      hudContainer: hudContainer as unknown as HTMLElement,
      createP2PAdapter: () => {
        const peer = new WebRTCPeerAdapter({
          localPeerId: `peer-${createdPeers.length + 1}`,
          signalingTransport: createInMemorySignalingTransport(hub),
          peerConnectionFactory: factory,
        });
        createdPeers.push(peer);
        return peer;
      },
      createMatchRuntime: (params) => {
        capturedParams = params;
        return { dispose: () => {} };
      },
    });

    hudContainer.querySelector('[data-menu-action="open-join-room"]')!.click();
    expect(app.getState().kind).toBe('join_room_lobby');

    const joinInput = hudContainer.querySelector('[data-p2p-join-input]')!;
    joinInput.value = 'SC-MENU';
    hudContainer.querySelector('[data-action="join-p2p-room"]')!.click();
    await flushMicrotasks();

    const firstPeer = createdPeers[0]!;
    expect(firstPeer.getRoomState().status).toBe('connected');
    expect(hudContainer.innerHTML).toContain('Connected to Room SC-MENU');
    expect(hudContainer.innerHTML).toContain('Disconnect');

    hudContainer.querySelector('[data-menu-action="back-to-main"]')!.click();
    expect(app.getState()).toEqual({ kind: 'main_menu' });
    expect(firstPeer.getRoomState().status).toBe('idle');

    hudContainer.querySelector('[data-menu-action="open-join-room"]')!.click();
    const joinInput2 = hudContainer.querySelector('[data-p2p-join-input]')!;
    joinInput2.value = 'SC-MENU';
    hudContainer.querySelector('[data-action="join-p2p-room"]')!.click();
    await flushMicrotasks();

    const secondPeer = createdPeers[1]!;
    expect(secondPeer.getRoomState().status).toBe('connected');

    hostP2P.launchMatch();
    await flushMicrotasks();

    expect(app.getState().kind).toBe('in_match');
    expect(capturedParams).not.toBeNull();
    expect(capturedParams!.session.sessionKind).toBe('p2p_client');
    expect(capturedParams!.session.presetId).toBe('grand_conquest');
    expect(capturedParams!.simAdapter).toBe(secondPeer);
    expect(secondPeer.getRoomState().status).toBe('in_match');

    app.dispose();
    secondPeer.leaveRoom();
    hostP2P.leaveRoom();
  });

  it('supports manual invite token acceptance in JoinRoomLobby', async () => {
    const pcRegistry = new FakePeerConnectionRegistry();
    const factory = pcRegistry.createFactory();

    const hostP2P = new WebRTCPeerAdapter({
      localPeerId: 'host-manual',
      peerConnectionFactory: factory,
    });
    hostP2P.hostRoom({ roomCode: 'SC-MAN' });
    const inviteToken = await hostP2P.createManualInviteToken('player_2');

    const peerP2P = new WebRTCPeerAdapter({
      localPeerId: 'peer-manual',
      peerConnectionFactory: factory,
    });

    const canvas = new FakeHtmlElement();
    const hudContainer = new FakeHtmlElement();
    const app = createClientAppShell({
      canvas: canvas as unknown as HTMLCanvasElement,
      hudContainer: hudContainer as unknown as HTMLElement,
      createP2PAdapter: () => peerP2P,
      createMatchRuntime: () => ({ dispose: () => {} }),
    });

    hudContainer.querySelector('[data-menu-action="open-join-room"]')!.click();
    const tokenInput = hudContainer.querySelector('[data-p2p-token-input]')!;
    tokenInput.value = inviteToken;
    hudContainer.querySelector('[data-action="accept-manual-invite"]')!.click();
    await new Promise<void>((resolve) => setTimeout(resolve, 220));
    await flushMicrotasks();

    const generated = hudContainer.querySelector('[data-p2p-generated-token]');
    expect(generated).not.toBeNull();
    expect(generated!.value.length).toBeGreaterThan(0);

    await hostP2P.applyManualAnswerToken(generated!.value);
    await flushMicrotasks();
    expect(peerP2P.getRoomState().status).toBe('connected');

    app.dispose();
    hostP2P.leaveRoom();
  });

  it('launches Guided Tutorial and Battle Simulator directly from MainMenu', () => {
    const canvas = new FakeHtmlElement();
    const hudContainer = new FakeHtmlElement();
    const sessions: MatchRuntimeFactoryParams['session'][] = [];

    const app = createClientAppShell({
      canvas: canvas as unknown as HTMLCanvasElement,
      hudContainer: hudContainer as unknown as HTMLElement,
      createMatchRuntime: (params) => {
        sessions.push(params.session);
        return { dispose: () => {} };
      },
    });

    hudContainer.querySelector('[data-menu-action="launch-tutorial"]')!.click();
    expect(app.getState().kind).toBe('in_match');
    expect(sessions[0]).toEqual({
      sessionKind: 'guided_tutorial',
      presetId: 'tutorial',
      isMultiplayer: false,
      roomCode: null,
    });

    app.dispatch({ type: 'PAUSE_MATCH' });
    app.dispatch({ type: 'BACK_TO_MAIN_MENU' });

    hudContainer.querySelector('[data-menu-action="launch-battle-sim"]')!.click();
    expect(app.getState().kind).toBe('in_match');
    expect(sessions[1]).toEqual({
      sessionKind: 'battle_simulator',
      presetId: 'standard_tactical',
      isMultiplayer: false,
      roomCode: null,
    });

    app.dispose();
  });

  it('renders MainMenu action cards in the 3x2 grid order with the GitHub Issues Feedback link', () => {
    const canvas = new FakeHtmlElement();
    const hudContainer = new FakeHtmlElement();

    const app = createClientAppShell({
      canvas: canvas as unknown as HTMLCanvasElement,
      hudContainer: hudContainer as unknown as HTMLElement,
      createMatchRuntime: () => ({ dispose: () => {} }),
    });

    const renderedActions = Array.from(
      hudContainer.innerHTML.matchAll(/data-menu-action="([^"]+)"/g),
      (match) => match[1],
    );
    expect(renderedActions).toEqual([
      'launch-tutorial',
      'open-single-player',
      'open-host-room',
      'open-join-room',
      'launch-battle-sim',
      'open-feedback',
    ]);

    expect(hudContainer.innerHTML).toMatch(
      /class="menu-action-card primary"\s+data-menu-action="open-single-player"/,
    );
    expect(hudContainer.innerHTML).toMatch(
      /<a[\s\S]*data-menu-action="open-feedback"[\s\S]*href="https:\/\/github\.com\/Harkole\/StarConquest\/issues"[\s\S]*target="_blank"[\s\S]*rel="noopener noreferrer"/,
    );

    app.dispose();
  });

  it('enforces a single exclusive Human slot in SinglePlayerSetup by swapping previous Human to AI and preserving untouched slots', () => {
    const canvas = new FakeHtmlElement();
    const hudContainer = new FakeHtmlElement();
    let capturedParams: MatchRuntimeFactoryParams | null = null;

    const app = createClientAppShell({
      canvas: canvas as unknown as HTMLCanvasElement,
      hudContainer: hudContainer as unknown as HTMLElement,
      createMatchRuntime: (params) => {
        capturedParams = params;
        return { dispose: () => {} };
      },
    });

    hudContainer.querySelector('[data-menu-action="open-single-player"]')!.click();
    expect(app.getState().kind).toBe('single_player_setup');

    // Customize untouched slots: player_3 -> Admiral AI, player_4 -> Empty
    hudContainer
      .querySelectorAll('[data-lobby-difficulty]')
      .find(
        (b) =>
          b.dataset.lobbySlot === 'player_3' &&
          b.dataset.lobbyDifficulty === 'admiral',
      )!
      .click();
    hudContainer
      .querySelectorAll('[data-lobby-role]')
      .find(
        (b) =>
          b.dataset.lobbySlot === 'player_4' &&
          b.dataset.lobbyRole === 'empty',
      )!
      .click();

    // Attempting to change the sole Human slot (player_1) to AI or Empty must not leave zero Human slots
    hudContainer
      .querySelectorAll('[data-lobby-role]')
      .find(
        (b) =>
          b.dataset.lobbySlot === 'player_1' &&
          b.dataset.lobbyRole === 'ai',
      )!
      .click();
    hudContainer
      .querySelectorAll('[data-lobby-role]')
      .find(
        (b) =>
          b.dataset.lobbySlot === 'player_1' &&
          b.dataset.lobbyRole === 'empty',
      )!
      .click();

    // Swap Human to player_2 -> player_1 becomes AI Bot, player_3 and player_4 stay untouched
    hudContainer
      .querySelectorAll('[data-lobby-role]')
      .find(
        (b) =>
          b.dataset.lobbySlot === 'player_2' &&
          b.dataset.lobbyRole === 'human',
      )!
      .click();

    hudContainer.querySelector('[data-menu-action="start-match"]')!.click();

    expect(capturedParams).not.toBeNull();
    expect(capturedParams!.matchSetup).toEqual({
      presetId: 'standard_tactical',
      localPlayerId: 'player_2',
      slots: {
        player_1: { kind: 'ai', difficulty: 'standard' },
        player_2: { kind: 'human' },
        player_3: { kind: 'ai', difficulty: 'admiral' },
        player_4: { kind: 'empty' },
      },
    });

    // Return to SinglePlayerSetup and swap Human onto the Empty slot (player_4)
    capturedParams!.onQuitToMainMenu();
    hudContainer.querySelector('[data-menu-action="open-single-player"]')!.click();
    hudContainer
      .querySelectorAll('[data-lobby-role]')
      .find(
        (b) =>
          b.dataset.lobbySlot === 'player_4' &&
          b.dataset.lobbyRole === 'human',
      )!
      .click();
    hudContainer.querySelector('[data-menu-action="start-match"]')!.click();

    expect(capturedParams!.matchSetup).toEqual({
      presetId: 'standard_tactical',
      localPlayerId: 'player_4',
      slots: {
        player_1: { kind: 'ai', difficulty: 'standard' },
        player_2: { kind: 'ai', difficulty: 'standard' },
        player_3: { kind: 'ai', difficulty: 'admiral' },
        player_4: { kind: 'human' },
      },
    });

    app.dispose();
  });
});

class FakeDataChannel implements DataChannelLike {
  public readonly label: string;
  public readyState: RTCDataChannelState = 'connecting';
  public onopen: (() => void) | null = null;
  public onclose: (() => void) | null = null;
  public onerror: (() => void) | null = null;
  public onmessage: ((event: { readonly data: unknown }) => void) | null = null;
  public peer: FakeDataChannel | null = null;

  constructor(label: string) {
    this.label = label;
  }

  public open(): void {
    if (this.readyState === 'open') {
      return;
    }
    this.readyState = 'open';
    this.onopen?.();
  }

  public send(data: string): void {
    if (this.readyState !== 'open') {
      throw new Error('FakeDataChannel is not open');
    }
    const peer = this.peer;
    if (peer && peer.readyState === 'open') {
      peer.onmessage?.({ data });
    }
  }

  public close(): void {
    if (this.readyState === 'closed') {
      return;
    }
    this.readyState = 'closed';
    this.onclose?.();
    if (this.peer && this.peer.readyState !== 'closed') {
      this.peer.close();
    }
  }
}

class FakePeerConnectionRegistry {
  private counter = 0;
  private readonly pcs = new Map<string, FakePeerConnection>();

  public createFactory(): PeerConnectionFactory {
    return () => {
      this.counter += 1;
      const id = `pc-${this.counter}`;
      const pc = new FakePeerConnection(id, this);
      this.pcs.set(id, pc);
      return pc;
    };
  }

  public get(id: string): FakePeerConnection | undefined {
    return this.pcs.get(id);
  }
}

class FakePeerConnection implements PeerConnectionLike {
  public readonly id: string;
  private readonly registry: FakePeerConnectionRegistry;

  public onicecandidate:
    | ((event: { readonly candidate: RTCIceCandidateInit | null }) => void)
    | null = null;
  public ondatachannel:
    | ((event: { readonly channel: DataChannelLike }) => void)
    | null = null;
  public onconnectionstatechange: (() => void) | null = null;

  public readonly localChannels: FakeDataChannel[] = [];
  private channelsPaired = false;

  constructor(id: string, registry: FakePeerConnectionRegistry) {
    this.id = id;
    this.registry = registry;
  }

  public createDataChannel(label: string): DataChannelLike {
    const ch = new FakeDataChannel(label);
    this.localChannels.push(ch);
    return ch;
  }

  public async createOffer(): Promise<RTCSessionDescriptionInit> {
    return { type: 'offer', sdp: `fake-offer:${this.id}` };
  }

  public async createAnswer(): Promise<RTCSessionDescriptionInit> {
    return { type: 'answer', sdp: `fake-answer:${this.id}` };
  }

  public async setLocalDescription(): Promise<void> {
    this.onicecandidate?.({
      candidate: { candidate: `candidate:${this.id}`, sdpMid: '0', sdpMLineIndex: 0 },
    });
  }

  public async setRemoteDescription(desc: RTCSessionDescriptionInit): Promise<void> {
    const sdp = desc.sdp ?? '';
    const colonIdx = sdp.indexOf(':');
    if (colonIdx !== -1) {
      const remoteId = sdp.slice(colonIdx + 1);
      const remote = this.registry.get(remoteId);
      if (remote && desc.type === 'answer') {
        this.pairDataChannelsWith(remote);
      }
    }
  }

  public async addIceCandidate(): Promise<void> {}

  public close(): void {
    for (const ch of this.localChannels) {
      ch.close();
    }
  }

  private pairDataChannelsWith(remote: FakePeerConnection): void {
    if (this.channelsPaired) {
      return;
    }
    this.channelsPaired = true;
    for (const hostCh of this.localChannels) {
      const peerCh = new FakeDataChannel(hostCh.label);
      hostCh.peer = peerCh;
      peerCh.peer = hostCh;
      remote.localChannels.push(peerCh);
      remote.ondatachannel?.({ channel: peerCh });
      hostCh.open();
      peerCh.open();
    }
  }
}

async function flushMicrotasks(): Promise<void> {
  for (let i = 0; i < 6; i++) {
    await Promise.resolve();
  }
}

