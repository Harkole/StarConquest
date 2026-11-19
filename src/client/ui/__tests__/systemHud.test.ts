import { describe, expect, it } from 'vitest';
import { GameSimulation } from '../../../shared/sim/gameSimulation.ts';
import {
  computeMainPanelSignature,
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
});
