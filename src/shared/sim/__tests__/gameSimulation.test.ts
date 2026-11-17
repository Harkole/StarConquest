import { describe, expect, it } from 'vitest';
import {
  CNC_UNLOAD_RATE_PER_SECOND,
  GameSimulation,
  HARVESTER_CARGO_CAPACITY,
  HARVESTER_EMPTY_SPEED,
  HARVESTER_FULL_SPEED,
  HARVESTER_MINING_DURATION_SECONDS,
  REFINERY_MAX_CONCURRENT_DOCKS,
  REFINERY_UNLOAD_RATE_PER_SECOND,
} from '../gameSimulation.ts';

describe('GameSimulation — Orbital Ring Builder, Economy & Harvesters', () => {
  it('initializes each player with Homeworld C&C on slots 0 & 1 and 1 free starting Harvester', () => {
    const sim = new GameSimulation('standard_tactical');
    const p1 = sim.getPlayerState('player_1');

    expect(p1.ore).toBe(500);
    expect(p1.crystal).toBe(250);
    expect(p1.supplyCap).toBe(30);

    const homeworldState = sim.getPlanetState('system_starter_1_homeworld');
    expect(homeworldState.ownerId).toBe('player_1');
    expect(homeworldState.structures).toHaveLength(1);
    const cnc = homeworldState.structures[0];
    expect(cnc?.structureId).toBe('command_and_control');
    expect(cnc?.occupiedSlots).toEqual([0, 1]);

    const p1Harvesters = sim
      .getAllHarvesters()
      .filter((h) => h.ownerId === 'player_1');
    expect(p1Harvesters).toHaveLength(1);
    expect(p1Harvesters[0]?.homeStructureId).toBe(cnc?.id);
  });

  it('enforces the Planetary Outpost rule on unclaimed secondary planets and Super-Earth', () => {
    const sim = new GameSimulation('blitz_skirmish');
    const superEarthId = 'system_central_hub_super_earth';

    const blockedRes = sim.submitCommand({
      type: 'BUILD_ORBITAL_STRUCTURE',
      playerId: 'player_1',
      planetId: superEarthId,
      slotIndex: 0,
      structureId: 'refinery',
    });
    expect(blockedRes.ok).toBe(false);

    const claimRes = sim.submitCommand({
      type: 'BUILD_ORBITAL_STRUCTURE',
      playerId: 'player_1',
      planetId: superEarthId,
      slotIndex: 0,
      structureId: 'planetary_outpost',
    });
    expect(claimRes.ok).toBe(true);
    expect(sim.getPlanetState(superEarthId).ownerId).toBe('player_1');

    const refineryRes = sim.submitCommand({
      type: 'BUILD_ORBITAL_STRUCTURE',
      playerId: 'player_1',
      planetId: superEarthId,
      slotIndex: 1,
      structureId: 'refinery',
    });
    expect(refineryRes.ok).toBe(true);
  });

  it('enforces 2-slot occupancy, spawns a free Harvester assigned to its Refinery, and allows paid Harvesters', () => {
    const sim = new GameSimulation('blitz_skirmish');
    const homeworldId = 'system_starter_1_homeworld';

    const overlapRes = sim.submitCommand({
      type: 'BUILD_ORBITAL_STRUCTURE',
      playerId: 'player_1',
      planetId: homeworldId,
      slotIndex: 1,
      structureId: 'orbital_dockyard',
    });
    expect(overlapRes.ok).toBe(false);

    const refRes = sim.submitCommand({
      type: 'BUILD_ORBITAL_STRUCTURE',
      playerId: 'player_1',
      planetId: homeworldId,
      slotIndex: 2,
      structureId: 'refinery',
    });
    expect(refRes.ok).toBe(true);

    sim.stepTick(25);

    const homeworld = sim.getPlanetState(homeworldId);
    const refinery = homeworld.structures.find((s) => s.structureId === 'refinery');
    expect(refinery).toBeDefined();

    const p1HarvestersAfterRefinery = sim
      .getAllHarvesters()
      .filter((h) => h.ownerId === 'player_1');
    expect(p1HarvestersAfterRefinery).toHaveLength(2);
    expect(p1HarvestersAfterRefinery[1]?.homeStructureId).toBe(refinery?.id);

    const queueRes = sim.submitCommand({
      type: 'QUEUE_SHIP',
      playerId: 'player_1',
      dockyardOrRefineryId: refinery?.id ?? homeworldId,
      shipClassId: 'harvester',
      autoRepeat: false,
    });
    expect(queueRes.ok).toBe(true);

    const p1HarvestersAfterQueue = sim
      .getAllHarvesters()
      .filter((h) => h.ownerId === 'player_1');
    expect(p1HarvestersAfterQueue).toHaveLength(3);
    expect(p1HarvestersAfterQueue[2]?.homeStructureId).toBe(refinery?.id);
  });

  it('enforces Harvester empty vs full speed, 12.5s mining, and C&C 4/s vs Refinery 10/s unload rates', () => {
    expect(HARVESTER_CARGO_CAPACITY).toBe(40);
    expect(HARVESTER_MINING_DURATION_SECONDS).toBeGreaterThanOrEqual(10);
    expect(HARVESTER_MINING_DURATION_SECONDS).toBeLessThanOrEqual(15);
    expect(HARVESTER_EMPTY_SPEED).toBeCloseTo(41.325, 2);
    expect(HARVESTER_FULL_SPEED).toBeCloseTo(27.55, 2);
    expect(CNC_UNLOAD_RATE_PER_SECOND).toBe(4);
    expect(REFINERY_UNLOAD_RATE_PER_SECOND).toBe(10);

    const sim = new GameSimulation('standard_tactical');
    const p1 = sim.getPlayerState('player_1');
    const initialTotalResources = p1.ore + p1.crystal;
    const h = sim.getAllHarvesters().find((u) => u.ownerId === 'player_1');
    expect(h).toBeDefined();
    expect(h?.currentSpeed).toBeCloseTo(HARVESTER_EMPTY_SPEED, 2);

    let observedMiningState = false;
    let observedReturnFullSpeed = false;
    let observedUnloadingState = false;

    for (let i = 0; i < 85; i++) {
      sim.stepTick(1.0);
      if (h?.state === 'mining') {
        observedMiningState = true;
        expect(h.targetRockWorldPos).not.toBeNull();
      }
      if (h?.state === 'returning_to_dropoff' && h.cargoAmount >= 40) {
        observedReturnFullSpeed = true;
        expect(h.currentSpeed).toBeCloseTo(HARVESTER_FULL_SPEED, 2);
      }
      if (h?.state === 'unloading') {
        observedUnloadingState = true;
      }
    }

    expect(observedMiningState).toBe(true);
    expect(observedReturnFullSpeed).toBe(true);
    expect(observedUnloadingState).toBe(true);
    expect(p1.ore + p1.crystal).toBeGreaterThan(initialTotalResources);
  });

  it('limits a Refinery to 2 simultaneous unloading Harvesters (queueing the 3rd), supports resource focus, and reassigns on platform loss', () => {
    const sim = new GameSimulation('blitz_skirmish');
    const homeworldId = 'system_starter_1_homeworld';
    const homeworld = sim.getPlanetState(homeworldId);
    const cnc = homeworld.structures.find(
      (s) => s.structureId === 'command_and_control',
    );
    expect(cnc).toBeDefined();

    // Build a Refinery on slot 2 (spawns 1st refinery harvester)
    expect(
      sim.submitCommand({
        type: 'BUILD_ORBITAL_STRUCTURE',
        playerId: 'player_1',
        planetId: homeworldId,
        slotIndex: 2,
        structureId: 'refinery',
      }).ok,
    ).toBe(true);
    sim.stepTick(25);

    const refinery = homeworld.structures.find((s) => s.structureId === 'refinery');
    expect(refinery).toBeDefined();
    if (!refinery || !cnc) {
      return;
    }

    // Queue 2 more Harvesters from that Refinery -> 3 Harvesters share this Refinery home
    for (let i = 0; i < 2; i++) {
      expect(
        sim.submitCommand({
          type: 'QUEUE_SHIP',
          playerId: 'player_1',
          dockyardOrRefineryId: refinery.id,
          shipClassId: 'harvester',
          autoRepeat: false,
        }).ok,
      ).toBe(true);
    }

    // Set Refinery target focus to Crystal Only
    expect(
      sim.submitCommand({
        type: 'SET_REFINERY_TARGET',
        playerId: 'player_1',
        structureId: refinery.id,
        targetResource: 'crystal',
      }).ok,
    ).toBe(true);

    const refHarvesters = sim
      .getAllHarvesters()
      .filter((h) => h.homeStructureId === refinery.id);
    expect(refHarvesters).toHaveLength(3);
    for (const h of refHarvesters) {
      expect(h.cargoType).toBe('crystal');
    }

    // Place all 3 Harvesters right next to the Refinery with full 40-unit loads
    const refPos = sim.getStructureWorldPosition(homeworld, refinery);
    for (const h of refHarvesters) {
      h.position = { x: refPos.x, z: refPos.z };
      h.cargoAmount = 40;
      h.state = 'returning_to_dropoff';
    }

    sim.stepTick(0.5);

    // Exactly 2 Harvesters should be unloading, and the 3rd must wait in the queue!
    expect(REFINERY_MAX_CONCURRENT_DOCKS).toBe(2);
    expect(refinery.activeDockingHarvesterIds).toHaveLength(2);
    expect(refinery.queuedDockingHarvesterIds).toHaveLength(1);
    const waitingHarvester = refHarvesters.find(
      (h) => h.state === 'waiting_to_unload',
    );
    expect(waitingHarvester).toBeDefined();

    // Advance 4 seconds (at 10 u/s, the first 2 finish unloading 40 units and the 3rd enters dock)
    for (let i = 0; i < 8; i++) {
      sim.stepTick(0.5);
    }
    expect(waitingHarvester?.state).toBe('unloading');

    // Destroy the Refinery -> all 3 Harvesters automatically fall back to the closest friendly platform (C&C)
    expect(sim.destroyOrbitalStructure(refinery.id)).toBe(true);
    for (const h of refHarvesters) {
      expect(h.homeStructureId).toBe(cnc.id);
    }
  });

  it('caps Command & Control concurrent Harvester docks at 1 in Standard/Grand and 2 in Blitz Skirmish', () => {
    // 1. Standard Tactical -> C&C cap = 1
    const stdSim = new GameSimulation('standard_tactical');
    const stdHome = stdSim.getPlanetState('system_starter_1_homeworld');
    const stdCnc = stdHome.structures[0];
    expect(stdCnc).toBeDefined();
    if (!stdCnc) {
      return;
    }
    expect(stdSim.getMaxConcurrentDocks(stdCnc)).toBe(1);

    stdSim.submitCommand({
      type: 'QUEUE_SHIP',
      playerId: 'player_1',
      dockyardOrRefineryId: stdCnc.id,
      shipClassId: 'harvester',
      autoRepeat: false,
    });

    const stdPos = stdSim.getStructureWorldPosition(stdHome, stdCnc);
    const stdHarvesters = stdSim
      .getAllHarvesters()
      .filter((h) => h.ownerId === 'player_1');
    expect(stdHarvesters).toHaveLength(2);
    for (const h of stdHarvesters) {
      h.position = { x: stdPos.x, z: stdPos.z };
      h.cargoAmount = 40;
      h.state = 'returning_to_dropoff';
    }
    stdSim.stepTick(0.5);
    expect(stdCnc.activeDockingHarvesterIds).toHaveLength(1);
    expect(stdCnc.queuedDockingHarvesterIds).toHaveLength(1);

    // 2. Blitz Skirmish -> C&C cap = 2
    const blitzSim = new GameSimulation('blitz_skirmish');
    const blitzHome = blitzSim.getPlanetState('system_starter_1_homeworld');
    const blitzCnc = blitzHome.structures[0];
    expect(blitzCnc).toBeDefined();
    if (!blitzCnc) {
      return;
    }
    expect(blitzSim.getMaxConcurrentDocks(blitzCnc)).toBe(2);

    for (let i = 0; i < 2; i++) {
      blitzSim.submitCommand({
        type: 'QUEUE_SHIP',
        playerId: 'player_1',
        dockyardOrRefineryId: blitzCnc.id,
        shipClassId: 'harvester',
        autoRepeat: false,
      });
    }

    const blitzPos = blitzSim.getStructureWorldPosition(blitzHome, blitzCnc);
    const blitzHarvesters = blitzSim
      .getAllHarvesters()
      .filter((h) => h.ownerId === 'player_1');
    expect(blitzHarvesters).toHaveLength(3);
    for (const h of blitzHarvesters) {
      h.position = { x: blitzPos.x, z: blitzPos.z };
      h.cargoAmount = 40;
      h.state = 'returning_to_dropoff';
    }
    blitzSim.stepTick(0.5);
    expect(blitzCnc.activeDockingHarvesterIds).toHaveLength(2);
    expect(blitzCnc.queuedDockingHarvesterIds).toHaveLength(1);
  });
});
