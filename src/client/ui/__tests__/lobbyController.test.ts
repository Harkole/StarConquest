import { describe, expect, it } from 'vitest';
import type {
  MatchPresetId,
  MatchSetupConfig,
  MatchSetupInput,
} from '../../../shared/config/index.ts';
import { CENTRAL_SUPER_EARTH_PLANET_ID } from '../../../shared/sim/gameSimulation.ts';
import { LocalSimAdapter } from '../../net/localSimAdapter.ts';
import {
  LobbyController,
  formatMatchClockSeconds,
  type LobbySceneManagerContract,
} from '../lobbyController.ts';

class FakeHtmlElement {
  public className = '';
  public dataset: Record<string, string> = {};
  public style: Record<string, string> = {};
  public textContent = '';
  public children: FakeHtmlElement[] = [];
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
    } else if (selector.startsWith('[data-lobby-standing="')) {
      const slot = selector.slice('[data-lobby-standing="'.length, -2);
      if (this.html.includes(`data-lobby-standing="${slot}"`)) {
        const el = new FakeHtmlElement();
        el.dataset.lobbyStanding = slot;
        matches.push(el);
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
});

