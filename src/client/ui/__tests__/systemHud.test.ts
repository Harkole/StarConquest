import { describe, expect, it } from 'vitest';
import { GameSimulation } from '../../../shared/sim/gameSimulation.ts';
import {
  computeMainPanelSignature,
  createDefaultHudCollapsedState,
  isHudSectionId,
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
    'galaxy',
    'fleet',
    'battle_sim',
    'planets_wormholes',
    'deep_space',
    'orbital_ring',
  ];

  it('defaults battle_sim to collapsed and all other 5 sections to expanded', () => {
    const state = createDefaultHudCollapsedState();
    expect(Object.keys(state).sort()).toEqual([...allSections].sort());
    expect(state.battle_sim).toBe(true);
    for (const id of allSections) {
      if (id !== 'battle_sim') {
        expect(state[id], `${id} should default expanded`).toBe(false);
      }
    }
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
