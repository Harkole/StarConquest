import { describe, expect, it } from 'vitest';
import { GameSimulation } from '../../../shared/sim/gameSimulation.ts';
import { LocalSimAdapter } from '../../net/localSimAdapter.ts';
import type { SystemSceneManager } from '../../renderer/systemSceneManager.ts';
import {
  computeMainPanelSignature,
  createDefaultHudCollapsedState,
  isHudSectionId,
  mountSystemHud,
  toggleHudSection,
  type HudSectionId,
  type MainPanelSignatureParams,
} from '../systemHud.ts';

describe('systemHud — computeMainPanelSignature', () => {
  it('changes signature on final Harvester queue completion, platform completion, deep-space completion, and dock/reserve updates', () => {
    const sim = new GameSimulation('blitz_skirmish');
    const homeworld = sim.getPlanetState('system_starter_1_homeworld');
    const cnc = homeworld.structures[0];
    expect(cnc).toBeDefined();
    if (!cnc) {
      return;
    }

    const baseParams: MainPanelSignatureParams = {
      activeSystemId: 'system_starter_1',
      selectedPlanetId: homeworld.planet.id,
      selectedSlotIndex: 0,
      selectedHarvesterId: null,
      pendingDeepSpace: null,
      statusBannerMessage: '',
      wormholeStates: [{ id: 'wh_1', isOpen: false }],
    };

    // Stable when simulation state has not changed
    const idleSigA = computeMainPanelSignature(sim, baseParams);
    const idleSigB = computeMainPanelSignature(sim, baseParams);
    expect(idleSigA).toBe(idleSigB);

    // 1. Queue a Harvester, advance to 1s remaining, then finish -> signature MUST change on completion
    expect(
      sim.submitCommand({
        type: 'QUEUE_SHIP',
        playerId: 'player_1',
        dockyardOrRefineryId: cnc.id,
        shipClassId: 'harvester',
        autoRepeat: false,
      }).ok,
    ).toBe(true);
    sim.stepTick(8.2);
    const almostDoneQueueSig = computeMainPanelSignature(sim, baseParams);
    sim.stepTick(1.0);
    expect(cnc.productionQueue).toHaveLength(0);
    const finishedQueueSig = computeMainPanelSignature(sim, baseParams);
    expect(finishedQueueSig).not.toBe(almostDoneQueueSig);

    // 2. Build an orbital Refinery, advance to ~1s remaining, then finish -> signature MUST change on completion
    expect(
      sim.submitCommand({
        type: 'BUILD_ORBITAL_STRUCTURE',
        playerId: 'player_1',
        planetId: homeworld.planet.id,
        slotIndex: 2,
        structureId: 'refinery',
      }).ok,
    ).toBe(true);
    sim.stepTick(19.2);
    const almostDonePlatformSig = computeMainPanelSignature(sim, baseParams);
    sim.stepTick(1.2);
    const refinery = homeworld.structures.find((s) => s.structureId === 'refinery');
    expect(refinery?.isComplete).toBe(true);
    const finishedPlatformSig = computeMainPanelSignature(sim, baseParams);
    expect(finishedPlatformSig).not.toBe(almostDonePlatformSig);

    // 3. Build a deep-space Logistics Hub, advance to ~1s remaining, then finish -> signature MUST change
    const p1 = sim.getPlayerState('player_1');
    p1.ore = 2000;
    p1.crystal = 1000;
    expect(
      sim.submitCommand({
        type: 'BUILD_DEEP_SPACE_STRUCTURE',
        playerId: 'player_1',
        systemId: 'system_starter_1',
        position: { x: 500, z: 300 },
        structureId: 'logistics_hub',
      }).ok,
    ).toBe(true);
    sim.stepTick(19.2);
    const almostDoneHubSig = computeMainPanelSignature(sim, baseParams);
    sim.stepTick(1.2);
    const hub = sim.getDeepSpaceStructuresInSystem('system_starter_1')[0];
    expect(hub?.isComplete).toBe(true);
    const finishedHubSig = computeMainPanelSignature(sim, baseParams);
    expect(finishedHubSig).not.toBe(almostDoneHubSig);
  });

  it('keeps structural signature stable during continuous progress/cargo ticks so buttons are not recreated, and updates when Harvester membership changes', () => {
    const sim = new GameSimulation('standard_tactical');
    const homeworld = sim.getPlanetState('system_starter_1_homeworld');
    const cnc = homeworld.structures[0];
    expect(cnc).toBeDefined();
    if (!cnc) {
      return;
    }

    const cncParams: MainPanelSignatureParams = {
      activeSystemId: 'system_starter_1',
      selectedPlanetId: homeworld.planet.id,
      selectedSlotIndex: 0,
      selectedHarvesterId: null,
      pendingDeepSpace: null,
      statusBannerMessage: '',
      wormholeStates: [{ id: 'wh_1', isOpen: false }],
    };

    const initialSig = computeMainPanelSignature(sim, cncParams);
    const assigned = sim
      .getAllHarvesters()
      .find((h) => h.homeStructureId === cnc.id);
    expect(assigned).toBeDefined();
    if (!assigned) {
      return;
    }

    // Continuous cargo progress ticks must NOT trigger a full DOM innerHTML rebuild
    assigned.cargoAmount = 20;
    expect(computeMainPanelSignature(sim, cncParams)).toBe(initialSig);

    // Mid-build countdown progress on a queued Harvester must NOT trigger a full DOM rebuild either
    expect(
      sim.submitCommand({
        type: 'QUEUE_SHIP',
        playerId: 'player_1',
        dockyardOrRefineryId: cnc.id,
        shipClassId: 'harvester',
        autoRepeat: false,
      }).ok,
    ).toBe(true);
    const queuedSig = computeMainPanelSignature(sim, cncParams);
    expect(queuedSig).not.toBe(initialSig);

    sim.stepTick(3.0);
    expect(computeMainPanelSignature(sim, cncParams)).toBe(queuedSig);

    // Once the queued Harvester finishes and joins assigned Harvesters, structural signature MUST change
    sim.stepTick(6.5);
    expect(computeMainPanelSignature(sim, cncParams)).not.toBe(queuedSig);
  });

  it('updates structural signature when Dockyard Rally Point or combat fleet membership changes', () => {
    const sim = new GameSimulation('blitz_skirmish');
    const p1 = sim.getPlayerState('player_1');
    p1.ore = 2000;
    p1.crystal = 1000;
    const homeworld = sim.getPlanetState('system_starter_1_homeworld');

    expect(
      sim.submitCommand({
        type: 'BUILD_ORBITAL_STRUCTURE',
        playerId: 'player_1',
        planetId: homeworld.planet.id,
        slotIndex: 2,
        structureId: 'orbital_dockyard',
      }).ok,
    ).toBe(true);
    sim.stepTick(31);
    const dockyard = homeworld.structures.find(
      (s) => s.structureId === 'orbital_dockyard',
    );
    expect(dockyard).toBeDefined();
    if (!dockyard) return;

    const dockParams: MainPanelSignatureParams = {
      activeSystemId: 'system_starter_1',
      selectedPlanetId: homeworld.planet.id,
      selectedSlotIndex: 2,
      selectedHarvesterId: null,
      pendingDeepSpace: null,
      statusBannerMessage: '',
      wormholeStates: [{ id: 'wh_1', isOpen: false }],
    };

    const sigBeforeRally = computeMainPanelSignature(sim, dockParams);
    expect(
      sim.submitCommand({
        type: 'SET_RALLY_POINT',
        playerId: 'player_1',
        dockyardId: dockyard.id,
        targetSystemId: 'system_central_hub',
        targetPosition: { x: 200, z: 120 },
        stance: 'aggressive',
      }).ok,
    ).toBe(true);
    const sigAfterRally = computeMainPanelSignature(sim, dockParams);
    expect(sigAfterRally).not.toBe(sigBeforeRally);

    expect(
      sim.submitCommand({
        type: 'QUEUE_SHIP',
        playerId: 'player_1',
        dockyardOrRefineryId: dockyard.id,
        shipClassId: 'destroyer',
        autoRepeat: false,
      }).ok,
    ).toBe(true);
    const sigQueued = computeMainPanelSignature(sim, dockParams);
    expect(sigQueued).not.toBe(sigAfterRally);

    // Mid-build countdown tick must keep structural signature stable
    sim.stepTick(5.0);
    expect(computeMainPanelSignature(sim, dockParams)).toBe(sigQueued);

    // Ship launch changes structural signature
    sim.stepTick(7.5);
    expect(computeMainPanelSignature(sim, dockParams)).not.toBe(sigQueued);
  });
});

describe('systemHud — collapsible sections state', () => {
  const allSections: readonly HudSectionId[] = [
    'battle_sim',
    'orbital_ring',
  ];

  it('defaults battle_sim to collapsed and orbital_ring to expanded', () => {
    const state = createDefaultHudCollapsedState();
    expect(Object.keys(state).sort()).toEqual([...allSections].sort());
    expect(state.battle_sim).toBe(true);
    expect(state.orbital_ring).toBe(false);
  });

  it('toggles individual sections immutably without affecting sibling sections', () => {
    const initial = createDefaultHudCollapsedState();
    for (const id of allSections) {
      const toggled = toggleHudSection(initial, id);
      expect(toggled).not.toBe(initial);
      expect(toggled[id]).toBe(!initial[id]);
      for (const other of allSections) {
        if (other !== id) {
          expect(toggled[other]).toBe(initial[other]);
        }
      }
      const restored = toggleHudSection(toggled, id);
      expect(restored).toEqual(initial);
    }
  });

  it('validates section ids via isHudSectionId', () => {
    for (const id of allSections) {
      expect(isHudSectionId(id)).toBe(true);
    }
    expect(isHudSectionId('deep_space')).toBe(false);
    expect(isHudSectionId('galaxy')).toBe(false);
    expect(isHudSectionId('fleet')).toBe(false);
    expect(isHudSectionId('planets_wormholes')).toBe(false);
    expect(isHudSectionId(undefined)).toBe(false);
    expect(isHudSectionId('')).toBe(false);
    expect(isHudSectionId('unknown_section')).toBe(false);
  });
});

describe('systemHud — fog-of-war intel projection', () => {
  it('hides unexplored system ownership/structures and tracks unexplored -> live -> last_known transitions in signature', () => {
    const sim = new GameSimulation('standard_tactical');
    const enemyHomeworld = sim.getPlanetState('system_starter_2_homeworld');
    expect(enemyHomeworld.ownerId).toBe('player_2');
    expect(enemyHomeworld.structures.length).toBeGreaterThan(0);

    const enemyParams: MainPanelSignatureParams = {
      playerId: 'player_1',
      activeSystemId: 'system_starter_2',
      selectedPlanetId: enemyHomeworld.planet.id,
      selectedSlotIndex: 0,
      selectedHarvesterId: null,
      pendingDeepSpace: null,
      statusBannerMessage: '',
      wormholeStates: [{ id: 'wh_2', isOpen: false }],
    };

    const unexploredView = sim.getPlayerSystemView('player_1', 'system_starter_2');
    expect(unexploredView.resourceSummary).toBeNull();
    const unexploredSig = computeMainPanelSignature(sim, enemyParams);
    expect(unexploredSig).toContain('system_starter_2_homeworld:unexplored:none:0');
    expect(unexploredSig).toContain('|unknown|');
    expect(unexploredSig).not.toContain('player_2');

    sim.stepTick(12);

    const p2Sig = computeMainPanelSignature(sim, {
      ...enemyParams,
      playerId: 'player_2',
    });
    expect(p2Sig).toContain('system_starter_2_homeworld:live:player_2:');
    expect(p2Sig).toContain('|known|');
    expect(p2Sig).not.toBe(unexploredSig);
  });
});

class FakeHudElement {
  public className = '';
  public dataset: Record<string, string> = {};
  public style: Record<string, string> = {};
  public textContent = '';
  public title = '';
  public parentElement: FakeHudElement | null = null;
  public children: FakeHudElement[] = [];
  private readonly attrs = new Map<string, string>();
  private readonly classSet = new Set<string>();
  public readonly classList = {
    add: (cls: string): void => {
      this.classSet.add(cls);
    },
    remove: (cls: string): void => {
      this.classSet.delete(cls);
    },
    toggle: (cls: string, force?: boolean): boolean => {
      const next = force !== undefined ? force : !this.classSet.has(cls);
      if (next) {
        this.classSet.add(cls);
      } else {
        this.classSet.delete(cls);
      }
      return next;
    },
    contains: (cls: string): boolean => this.classSet.has(cls),
  };
  private html = '';
  private readonly listeners = new Map<string, Set<() => void>>();
  private readonly interactiveBySelector = new Map<string, FakeHudElement[]>();

  public get innerHTML(): string {
    return this.html;
  }

  public set innerHTML(value: string) {
    this.html = value;
    this.interactiveBySelector.clear();
  }

  public append(...nodes: FakeHudElement[]): void {
    for (const node of nodes) {
      node.parentElement = this;
      this.children.push(node);
    }
  }

  public remove(): void {}

  public setAttribute(name: string, value: string): void {
    this.attrs.set(name, value);
  }

  public removeAttribute(name: string): void {
    this.attrs.delete(name);
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

  public getBoundingClientRect(): { right: number; top: number; left: number; bottom: number } {
    return { left: 0, top: 0, right: 400, bottom: 600 };
  }

  public querySelector<T = FakeHudElement>(selector: string): T | null {
    const list = this.querySelectorAll<T>(selector);
    return list[0] ?? null;
  }

  public querySelectorAll<T = FakeHudElement>(selector: string): T[] {
    let matches = this.interactiveBySelector.get(selector);
    if (!matches) {
      matches = [];
      if (selector.startsWith('[data-action="')) {
        const action = selector.slice('[data-action="'.length, -2);
        if (this.html.includes(`data-action="${action}"`)) {
          const el = new FakeHudElement();
          el.dataset.action = action;
          matches.push(el);
        }
      } else if (selector === '[data-place-deepspace]') {
        const regex = /data-place-deepspace="([^"]+)"/g;
        for (const m of this.html.matchAll(regex)) {
          const el = new FakeHudElement();
          el.dataset.placeDeepspace = m[1]!;
          matches.push(el);
        }
      }
      this.interactiveBySelector.set(selector, matches);
    }
    const childMatches = this.children.flatMap((child) =>
      child.querySelectorAll<FakeHudElement>(selector),
    );
    return [...matches, ...childMatches] as unknown as T[];
  }
}

describe('systemHud — battle simulator section visibility', () => {
  function runWithFakeDom<T>(fn: () => T): T {
    const prevDoc = (globalThis as { document?: unknown }).document;
    const prevWin = (globalThis as { window?: unknown }).window;
    (globalThis as { document?: unknown }).document = {
      createElement: () => new FakeHudElement(),
    };
    (globalThis as { window?: unknown }).window = {
      innerWidth: 1440,
      setInterval: () => 1,
      clearInterval: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
    };
    try {
      return fn();
    } finally {
      (globalThis as { document?: unknown }).document = prevDoc;
      (globalThis as { window?: unknown }).window = prevWin;
    }
  }

  function createFakeSceneManager(adapter: LocalSimAdapter): SystemSceneManager {
    const activeSystem = adapter.simulation.galaxy.systems[0]!;
    let pendingDeepSpace: string | null = null;
    let selectedPlanetId: string | null = activeSystem.planets[0]?.id ?? null;
    let selectedFleetId: string | null = null;
    let selectedHarvesterId: string | null = null;
    let selectedDeepSpaceId: string | null = null;
    const selectionCallbacks: Array<() => void> = [];
    const notify = (): void => {
      for (const cb of selectionCallbacks) {
        cb();
      }
    };
    return {
      simAdapter: adapter,
      getActiveSystem: () => activeSystem,
      getSelectedPlanetId: () => selectedPlanetId,
      getSelectedHarvesterId: () => selectedHarvesterId,
      getSelectedFleetId: () => selectedFleetId,
      getSelectedDeepSpaceId: () => selectedDeepSpaceId,
      getPendingDeepSpacePlacement: () => pendingDeepSpace,
      startDeepSpacePlacement: (dsId: string | null) => {
        pendingDeepSpace = dsId;
      },
      clearSelection: () => {
        selectedPlanetId = null;
        selectedFleetId = null;
        selectedHarvesterId = null;
        selectedDeepSpaceId = null;
        notify();
      },
      getPendingFleetOrder: () => null,
      getPendingRallyDockyardId: () => null,
      getActiveWormholes: () => [],
      getLastMatchSystemId: () => activeSystem.id,
      onSelectionChange: (cb: () => void) => {
        selectionCallbacks.push(cb);
      },
      triggerSelectionChange: () => {
        notify();
      },
      onDeepSpacePlacementResult: () => {},
      loadSystem: () => {},
      focusPlanet: (planetId: string) => {
        selectedPlanetId = planetId;
        selectedFleetId = null;
        selectedHarvesterId = null;
        selectedDeepSpaceId = null;
        notify();
      },
      selectHarvester: (hId: string | null) => {
        selectedHarvesterId = hId;
        if (hId) {
          selectedPlanetId = null;
          selectedFleetId = null;
          selectedDeepSpaceId = null;
        }
        notify();
      },
      selectAndPinHarvester: (hId: string | null) => {
        selectedHarvesterId = hId;
        if (hId) {
          selectedPlanetId = null;
          selectedFleetId = null;
          selectedDeepSpaceId = null;
        }
        notify();
      },
      selectFleet: (fId: string | null) => {
        selectedFleetId = fId;
        if (fId) {
          selectedPlanetId = null;
          selectedHarvesterId = null;
          selectedDeepSpaceId = null;
        }
        notify();
      },
      focusFleet: (fId: string) => {
        selectedFleetId = fId;
        selectedPlanetId = null;
        selectedHarvesterId = null;
        selectedDeepSpaceId = null;
        notify();
      },
      focusDeepSpaceStructure: (dsId: string) => {
        selectedDeepSpaceId = dsId;
        selectedPlanetId = null;
        selectedFleetId = null;
        selectedHarvesterId = null;
        notify();
      },
      focusWorldPoint: () => {},
      focusWormhole: () => {},
      enterSystemOverview: () => {},
      cameraController: {
        isPinned: () => false,
      },
      resetMatch: (presetOrSetup: Parameters<LocalSimAdapter['resetMatch']>[0]) =>
        adapter.resetMatch(presetOrSetup),
    } as unknown as SystemSceneManager;
  }

  function readSubtreeHtml(node: FakeHudElement): string {
    return [node.innerHTML, ...node.children.map((c) => readSubtreeHtml(c))].join('');
  }

  it('mounts the five perimeter HUD regions and controls battle_sim visibility inside hud-bottom-inspector', () => {
    runWithFakeDom(() => {
      const adapter = new LocalSimAdapter('standard_tactical');
      const sceneManager = createFakeSceneManager(adapter);

      const normalContainer = new FakeHudElement();
      const normalHud = mountSystemHud(
        normalContainer as unknown as HTMLElement,
        adapter.simulation.galaxy,
        sceneManager,
      );
      expect(normalContainer.children.map((c) => c.className)).toEqual([
        'hud-top-bar',
        'hud-left-outliner',
        'hud-bottom-inspector',
        'hud-quick-dock',
        'hud-top-right-slot',
      ]);
      const normalBottomInspector = normalContainer.children.find(
        (c) => c.className === 'hud-bottom-inspector',
      )!;
      const normalInspectorHtml = readSubtreeHtml(normalBottomInspector);
      expect(normalInspectorHtml).not.toContain('data-hud-section="battle_sim"');
      expect(normalInspectorHtml).not.toContain('Launch Battle in Void Arena');

      const quickDock = normalContainer.children.find(
        (c) => c.className === 'hud-quick-dock',
      )!;
      expect(quickDock.innerHTML).toContain('data-action="toggle-hub-mining"');
      expect(quickDock.innerHTML).toContain('data-action="overview"');
      expect(quickDock.innerHTML).toContain('data-place-deepspace="logistics_hub"');
      expect(quickDock.innerHTML).toContain('data-place-deepspace="point_defence_tower"');
      expect(quickDock.innerHTML).toContain('data-place-deepspace="hull_breaker_tower"');
      expect(normalInspectorHtml).not.toContain('data-place-deepspace=');
      expect(normalInspectorHtml).not.toContain('Deep-Space Installations');
      normalHud.dispose();

      let quitCalls = 0;
      const simContainer = new FakeHudElement();
      const simHud = mountSystemHud(
        simContainer as unknown as HTMLElement,
        adapter.simulation.galaxy,
        sceneManager,
        undefined,
        {
          isBattleSimulator: true,
          onQuitToMainMenu: () => {
            quitCalls += 1;
          },
        },
      );
      const simBottomInspector = simContainer.children.find(
        (c) => c.className === 'hud-bottom-inspector',
      )!;
      const simInspectorHtml = readSubtreeHtml(simBottomInspector);
      expect(simInspectorHtml).toContain('data-hud-section="battle_sim"');
      expect(simInspectorHtml).toContain('Launch Battle in Void Arena');
      expect(simInspectorHtml).toContain('Return to Main Menu');

      const exitBtn = simBottomInspector.querySelector('[data-action="exit-battle-sim"]');
      expect(exitBtn).not.toBeNull();
      exitBtn!.click();
      expect(quitCalls).toBe(1);
      simHud.dispose();
    });
  });

  it('places Deep-Space controls in hud-quick-dock with Logistics Hub radius gating and cancel action', () => {
    runWithFakeDom(() => {
      const adapter = new LocalSimAdapter('standard_tactical');
      const sceneManager = createFakeSceneManager(adapter);
      const container = new FakeHudElement();

      const hud = mountSystemHud(
        container as unknown as HTMLElement,
        adapter.simulation.galaxy,
        sceneManager,
      );

      const quickDock = container.children.find(
        (c) => c.className === 'hud-quick-dock',
      )!;
      const bottomInspector = container.children.find(
        (c) => c.className === 'hud-bottom-inspector',
      )!;

      // Deep-space placement lives in quick dock, never in bottom inspector
      expect(readSubtreeHtml(bottomInspector)).not.toContain('data-place-deepspace=');
      expect(quickDock.innerHTML).toMatch(
        /data-place-deepspace="logistics_hub"[^>]*>(?!.*disabled)/,
      );
      expect(quickDock.innerHTML).toMatch(
        /data-place-deepspace="point_defence_tower"[^>]*disabled/,
      );
      expect(quickDock.innerHTML).toMatch(
        /data-place-deepspace="hull_breaker_tower"[^>]*disabled/,
      );

      // Clicking Place Logistics Hub activates placement and renders Cancel Placement in quick dock
      const hubBtn = quickDock
        .querySelectorAll('[data-place-deepspace]')
        .find((b) => b.dataset.placeDeepspace === 'logistics_hub')!;
      hubBtn.click();
      expect(sceneManager.getPendingDeepSpacePlacement()).toBe('logistics_hub');
      expect(quickDock.innerHTML).toContain('data-action="cancel-deepspace"');

      const cancelBtn = quickDock.querySelector('[data-action="cancel-deepspace"]')!;
      cancelBtn.click();
      expect(sceneManager.getPendingDeepSpacePlacement()).toBeNull();
      expect(quickDock.innerHTML).not.toContain('data-action="cancel-deepspace"');

      // Completing a friendly Logistics Hub unlocks PD Tower and Hull Breaker buttons
      const p1 = adapter.simulation.getPlayerState('player_1');
      p1.ore = 2000;
      p1.crystal = 1000;
      expect(
        adapter.simulation.submitCommand({
          type: 'BUILD_DEEP_SPACE_STRUCTURE',
          playerId: 'player_1',
          systemId: 'system_starter_1',
          position: { x: 500, z: 300 },
          structureId: 'logistics_hub',
        }).ok,
      ).toBe(true);
      adapter.simulation.stepTick(21);

      (sceneManager as unknown as { triggerSelectionChange: () => void }).triggerSelectionChange();

      expect(quickDock.innerHTML).not.toMatch(
        /data-place-deepspace="point_defence_tower"[^>]*disabled/,
      );
      expect(quickDock.innerHTML).not.toMatch(
        /data-place-deepspace="hull_breaker_tower"[^>]*disabled/,
      );

      hud.dispose();
    });
  });

  it('renders contextual bottom inspector strictly per selection (planet, fleet-only with stacked hull cards, deep_space, harvester, and empty hint collapse)', () => {
    runWithFakeDom(() => {
      const adapter = new LocalSimAdapter('standard_tactical');
      const p1 = adapter.simulation.getPlayerState('player_1');
      p1.ore = 2000;
      p1.crystal = 1000;

      expect(
        adapter.simulation.submitCommand({
          type: 'CREATE_FLEET',
          playerId: 'player_1',
          rallySystemId: 'system_starter_1',
          rallyPosition: { x: 180, z: 120 },
          stance: 'aggressive',
          autoResupply: true,
        }).ok,
      ).toBe(true);
      const fleet = adapter.simulation.getFleetsForPlayer('player_1')[0]!;

      expect(
        adapter.simulation.submitCommand({
          type: 'BUILD_DEEP_SPACE_STRUCTURE',
          playerId: 'player_1',
          systemId: 'system_starter_1',
          position: { x: 500, z: 300 },
          structureId: 'logistics_hub',
        }).ok,
      ).toBe(true);
      const hub = adapter.simulation.getDeepSpaceStructuresInSystem('system_starter_1')[0]!;
      const harvester = adapter.simulation.getAllHarvesters().find((h) => h.ownerId === 'player_1')!;

      const sceneManager = createFakeSceneManager(adapter);
      const container = new FakeHudElement();
      const hud = mountSystemHud(
        container as unknown as HTMLElement,
        adapter.simulation.galaxy,
        sceneManager,
      );

      const bottomInspector = container.children.find(
        (c) => c.className === 'hud-bottom-inspector',
      )!;

      // 1. Default selection: Planet (shows Orbital Ring Builder, no Fleet details)
      const planetHtml = readSubtreeHtml(bottomInspector);
      expect(planetHtml).toContain('data-inspector-kind="planet"');
      expect(planetHtml).toContain('Orbital Ring Builder');
      expect(planetHtml).toContain('data-slot-index=');
      expect(planetHtml).not.toContain('data-inspector-kind="fleet"');
      expect(bottomInspector.classList.contains('is-empty')).toBe(false);

      // 2. Fleet selected: strictly Fleet-only (stacked hull cards incl. Dreadnought, zero Orbital Ring Builder)
      sceneManager.focusFleet(fleet.id);
      const fleetHtml = readSubtreeHtml(bottomInspector);
      expect(fleetHtml).toContain('data-inspector-kind="fleet"');
      expect(fleetHtml).toContain('fleet-hull-grid');
      expect(fleetHtml).toContain('data-fleet-hull-card="dreadnought"');
      expect(fleetHtml).toContain('data-fleet-inc="destroyer"');
      expect(fleetHtml).toContain('data-fleet-inc="dreadnought"');
      expect(fleetHtml).not.toContain('Orbital Ring Builder');
      expect(fleetHtml).not.toContain('data-slot-index=');
      expect(bottomInspector.classList.contains('is-empty')).toBe(false);

      // 3. Deep-Space Structure selected: strictly Deep-Space details
      sceneManager.focusDeepSpaceStructure(hub.id);
      const dsHtml = readSubtreeHtml(bottomInspector);
      expect(dsHtml).toContain('data-inspector-kind="deep_space"');
      expect(dsHtml).toContain('Logistics Hub');
      expect(dsHtml).not.toContain('Orbital Ring Builder');
      expect(dsHtml).not.toContain('data-inspector-kind="fleet"');

      // 4. Harvester selected: strictly Harvester telemetry
      sceneManager.selectAndPinHarvester(harvester.id);
      const harvHtml = readSubtreeHtml(bottomInspector);
      expect(harvHtml).toContain('harvester-telemetry-card');
      expect(harvHtml).not.toContain('Orbital Ring Builder');
      expect(harvHtml).not.toContain('data-inspector-kind="fleet"');
      expect(harvHtml).not.toContain('data-inspector-kind="deep_space"');

      // 5. Empty selection: collapses to hint pill
      sceneManager.clearSelection();
      const emptyHtml = readSubtreeHtml(bottomInspector);
      expect(emptyHtml).toContain('data-inspector-kind="none"');
      expect(emptyHtml).toContain('hud-empty-hint-pill');
      expect(emptyHtml).not.toContain('Orbital Ring Builder');
      expect(emptyHtml).not.toContain('data-inspector-kind="fleet"');
      expect(bottomInspector.classList.contains('is-empty')).toBe(true);

      hud.dispose();
    });
  });
});
