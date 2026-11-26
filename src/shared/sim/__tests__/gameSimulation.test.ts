import { describe, expect, it } from 'vitest';
import { ORBITAL_STRUCTURES, normalizeMatchSetupConfig } from '../../config/index.ts';
import {
  CENTRAL_HUB_ENRICHED_MINING_MULTIPLIER,
  CENTRAL_SUPER_EARTH_PLANET_ID,
  CNC_UNLOAD_RATE_PER_SECOND,
  GameSimulation,
  HARVESTER_CARGO_CAPACITY,
  HARVESTER_EMPTY_SPEED,
  HARVESTER_FULL_SPEED,
  HARVESTER_MINING_DURATION_SECONDS,
  MAX_SHIP_PRODUCTION_QUEUE_SIZE,
  MIN_DEEP_SPACE_WORMHOLE_CLEARANCE,
  MIN_HUB_TO_TOWER_SPACING,
  MIN_LOGISTICS_HUB_SPACING,
  MIN_TOWER_TO_TOWER_SPACING,
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

    // Build takes 9s per Harvester (not instant)
    sim.stepTick(9);

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

  it('limits a Refinery to 2 simultaneous unloading Harvesters in Standard Tactical (queueing the 3rd), supports resource focus, and reassigns on platform loss', () => {
    const sim = new GameSimulation('standard_tactical');
    const p1 = sim.getPlayerState('player_1');
    p1.ore = 800;
    p1.crystal = 400;
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

    // Set Refinery target focus to Crystal Only before queuing additional Harvesters
    expect(
      sim.submitCommand({
        type: 'SET_REFINERY_TARGET',
        playerId: 'player_1',
        structureId: refinery.id,
        targetResource: 'crystal',
      }).ok,
    ).toBe(true);

    // Queue 2 more Harvesters from that Refinery (9s each sequentially -> 18s)
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
    sim.stepTick(9);
    sim.stepTick(9);

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
    stdSim.stepTick(9);

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
    blitzSim.stepTick(9);
    blitzSim.stepTick(9);

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

  it('enforces 9s sequential Harvester build queue (max 5), upfront resource deduction, and immediate refund on cancel', () => {
    const sim = new GameSimulation('blitz_skirmish');
    const homeworld = sim.getPlanetState('system_starter_1_homeworld');
    const cnc = homeworld.structures[0];
    expect(cnc).toBeDefined();
    if (!cnc) {
      return;
    }

    const p1 = sim.getPlayerState('player_1');
    const startingOre = p1.ore; // 800
    const startingCrystal = p1.crystal; // 400

    // Queue 5 Harvesters (max queue size = 5)
    expect(MAX_SHIP_PRODUCTION_QUEUE_SIZE).toBe(5);
    for (let i = 0; i < 5; i++) {
      const res = sim.submitCommand({
        type: 'QUEUE_SHIP',
        playerId: 'player_1',
        dockyardOrRefineryId: cnc.id,
        shipClassId: 'harvester',
        autoRepeat: false,
      });
      expect(res.ok).toBe(true);
    }

    // Resources taken immediately upon ordering (5 * 100 Ore, 5 * 20 Crystal)
    expect(p1.ore).toBe(startingOre - 500);
    expect(p1.crystal).toBe(startingCrystal - 100);
    expect(cnc.productionQueue).toHaveLength(5);

    // 6th order must be rejected because queue is capped at 5
    const overflowRes = sim.submitCommand({
      type: 'QUEUE_SHIP',
      playerId: 'player_1',
      dockyardOrRefineryId: cnc.id,
      shipClassId: 'harvester',
      autoRepeat: false,
    });
    expect(overflowRes.ok).toBe(false);

    // Cancel the 5th queued item -> resources immediately refunded!
    const lastItem = cnc.productionQueue[4];
    expect(lastItem).toBeDefined();
    if (lastItem) {
      const cancelRes = sim.submitCommand({
        type: 'CANCEL_QUEUED_SHIP',
        playerId: 'player_1',
        structureId: cnc.id,
        queueItemId: lastItem.id,
      });
      expect(cancelRes.ok).toBe(true);
      expect(cnc.productionQueue).toHaveLength(4);
      expect(p1.ore).toBe(startingOre - 400);
      expect(p1.crystal).toBe(startingCrystal - 80);
    }

    // After 5 seconds, first Harvester is still building (only 1 built at a time)
    sim.stepTick(5);
    expect(cnc.productionQueue).toHaveLength(4);
    expect(
      sim.getAllHarvesters().filter((h) => h.ownerId === 'player_1'),
    ).toHaveLength(1);

    // After 4 more seconds (total 9s), first Harvester finishes and spawns
    sim.stepTick(4);
    expect(cnc.productionQueue).toHaveLength(3);
    expect(
      sim.getAllHarvesters().filter((h) => h.ownerId === 'player_1'),
    ).toHaveLength(2);
  });

  it('enforces symmetrical Ore-heavy / Crystal-scarce starter systems, automatic wormhole expansion on Crystal depletion, and 1.6x Central Nexus yield', () => {
    const sim = new GameSimulation('standard_tactical');

    // 1. All 4 starter systems must have the exact same fair Ore-heavy / Crystal-scarce reserve totals
    const s1 = sim.getSystemResourceSummary('system_starter_1');
    const s2 = sim.getSystemResourceSummary('system_starter_2');
    const s3 = sim.getSystemResourceSummary('system_starter_3');
    const s4 = sim.getSystemResourceSummary('system_starter_4');
    const hub = sim.getSystemResourceSummary('system_central_hub');

    for (const starter of [s1, s2, s3, s4]) {
      expect(starter.initialOre).toBe(s1.initialOre);
      expect(starter.initialCrystal).toBe(s1.initialCrystal);
      expect(starter.initialOre).toBeGreaterThan(starter.initialCrystal * 4);
      expect(starter.extractionMultiplier).toBe(1.0);
    }

    expect(hub.initialCrystal).toBeGreaterThan(s1.initialCrystal * 15);
    expect(hub.extractionMultiplier).toBe(CENTRAL_HUB_ENRICHED_MINING_MULTIPLIER);
    expect(CENTRAL_HUB_ENRICHED_MINING_MULTIPLIER).toBe(1.6);

    // 2. When starter system Crystals run dry, a Crystal-focused Harvester automatically transits to Central Nexus
    const homeworld = sim.getPlanetState('system_starter_1_homeworld');
    const cnc = homeworld.structures[0];
    expect(cnc).toBeDefined();
    if (!cnc) {
      return;
    }

    sim.submitCommand({
      type: 'SET_REFINERY_TARGET',
      playerId: 'player_1',
      structureId: cnc.id,
      targetResource: 'crystal',
    });

    // Deplete all Crystal nodes in Starter System 1 (leaving Ore nodes intact)
    for (const belt of sim.getMiningBeltsInSystem('system_starter_1')) {
      if (belt.resourceType === 'crystal') {
        belt.remainingReserves = 0;
      }
    }

    const p1Harvester = sim.getAllHarvesters().find((h) => h.ownerId === 'player_1');
    expect(p1Harvester).toBeDefined();
    if (!p1Harvester) {
      return;
    }

    sim.stepTick(0.5);
    // Instead of mining Ore at home when Crystal is depleted, Harvester automatically heads to the wormhole!
    expect(p1Harvester.state).toBe('transiting_to_hub');

    // 3. Verify 1.6x enriched extraction speed in Central Nexus (40 cargo in ~7.8125s instead of 12.5s)
    const hubCrystalBelt = sim
      .getMiningBeltsInSystem('system_central_hub')
      .find((b) => b.resourceType === 'crystal');
    expect(hubCrystalBelt).toBeDefined();
    if (!hubCrystalBelt) {
      return;
    }

    p1Harvester.currentSystemId = 'system_central_hub';
    p1Harvester.targetBeltId = hubCrystalBelt.id;
    p1Harvester.cargoType = 'crystal';
    p1Harvester.cargoAmount = 0;
    p1Harvester.state = 'mining';

    // After 7.9 seconds of mining in Central Nexus (< 12.5s starter duration), 40-unit bay is completely full!
    sim.stepTick(7.9);
    expect(p1Harvester.cargoAmount).toBe(40);
    expect(p1Harvester.state).toBe('returning_to_dropoff');
  });

  it('builds a free-floating Logistics Hub at a player-chosen deep-space coordinate, grants +15 supply, and enforces the 180u tower radius', () => {
    const sim = new GameSimulation('blitz_skirmish');
    const p1 = sim.getPlayerState('player_1');
    const initialSupplyCap = p1.supplyCap;

    // 1. Reject placement overlapping the Homeworld's orbital ring (0, 0)
    const tooCloseRes = sim.submitCommand({
      type: 'BUILD_DEEP_SPACE_STRUCTURE',
      playerId: 'player_1',
      systemId: 'system_starter_1',
      position: { x: 20, z: 10 },
      structureId: 'logistics_hub',
    });
    expect(tooCloseRes.ok).toBe(false);

    // 2. Reject building a Point Defence Tower before a Logistics Hub is completed nearby
    const unanchoredTowerRes = sim.submitCommand({
      type: 'BUILD_DEEP_SPACE_STRUCTURE',
      playerId: 'player_1',
      systemId: 'system_starter_1',
      position: { x: 520, z: 320 },
      structureId: 'point_defence_tower',
    });
    expect(unanchoredTowerRes.ok).toBe(false);

    // 3. Place a Logistics Hub at a chosen deep-space location (500, 300)
    const hubRes = sim.submitCommand({
      type: 'BUILD_DEEP_SPACE_STRUCTURE',
      playerId: 'player_1',
      systemId: 'system_starter_1',
      position: { x: 500, z: 300 },
      structureId: 'logistics_hub',
    });
    expect(hubRes.ok).toBe(true);

    const dsStructures = sim.getDeepSpaceStructuresInSystem('system_starter_1');
    expect(dsStructures).toHaveLength(1);
    expect(dsStructures[0]?.isComplete).toBe(false);
    expect(dsStructures[0]?.position).toEqual({ x: 500, z: 300 });

    // 4. Advance 20s construction timer -> Logistics Hub completes and grants +15 Fleet Supply
    sim.stepTick(20);
    expect(dsStructures[0]?.isComplete).toBe(true);
    expect(p1.supplyCap).toBe(initialSupplyCap + 15);

    // 5. Place a Point Defence Tower within 180u of the completed Logistics Hub (560, 340 -> dist ~72u)
    const validTowerRes = sim.submitCommand({
      type: 'BUILD_DEEP_SPACE_STRUCTURE',
      playerId: 'player_1',
      systemId: 'system_starter_1',
      position: { x: 560, z: 340 },
      structureId: 'point_defence_tower',
    });
    expect(validTowerRes.ok).toBe(true);
    expect(sim.getDeepSpaceStructuresInSystem('system_starter_1')).toHaveLength(2);
  });

  it('enforces per-structure deep-space spacing, wormhole clearance, and prevents repeated-click Logistics Hub clustering', () => {
    const sim = new GameSimulation('blitz_skirmish');
    const p1 = sim.getPlayerState('player_1');
    p1.ore = 5000;
    p1.crystal = 5000;

    // 1. Place Logistics Hub #1 at (1888, 254)
    const hub1Pos = { x: 1888, z: 254 };
    const hub1Res = sim.submitCommand({
      type: 'BUILD_DEEP_SPACE_STRUCTURE',
      playerId: 'player_1',
      systemId: 'system_starter_1',
      position: hub1Pos,
      structureId: 'logistics_hub',
    });
    expect(hub1Res.ok).toBe(true);

    // 2. Repeated clicks near hub1Pos — including (-54, -16) at ~56u and (-21, -33) at ~39u — must all fail (< 120u)
    const oreBefore = p1.ore;
    for (const pos of [
      { x: hub1Pos.x, z: hub1Pos.z },
      { x: hub1Pos.x - 54, z: hub1Pos.z - 16 },
      { x: hub1Pos.x - 21, z: hub1Pos.z - 33 },
      { x: hub1Pos.x + MIN_LOGISTICS_HUB_SPACING - 1, z: hub1Pos.z },
    ]) {
      const preview = sim.validateDeepSpacePlacement(
        'player_1',
        'system_starter_1',
        pos,
        'logistics_hub',
      );
      expect(preview.ok).toBe(false);
      expect(preview.reason).toContain(`${MIN_LOGISTICS_HUB_SPACING}u`);

      const attempt = sim.submitCommand({
        type: 'BUILD_DEEP_SPACE_STRUCTURE',
        playerId: 'player_1',
        systemId: 'system_starter_1',
        position: pos,
        structureId: 'logistics_hub',
      });
      expect(attempt.ok).toBe(false);
    }
    expect(p1.ore).toBe(oreBefore);
    expect(sim.getDeepSpaceStructuresInSystem('system_starter_1')).toHaveLength(1);

    // 3. Placing a second Logistics Hub at >= MIN_LOGISTICS_HUB_SPACING (120u) succeeds
    const hub2Res = sim.submitCommand({
      type: 'BUILD_DEEP_SPACE_STRUCTURE',
      playerId: 'player_1',
      systemId: 'system_starter_1',
      position: { x: hub1Pos.x + MIN_LOGISTICS_HUB_SPACING, z: hub1Pos.z },
      structureId: 'logistics_hub',
    });
    expect(hub2Res.ok).toBe(true);

    // 4. Reject placement directly inside a wormhole mouth (< MIN_DEEP_SPACE_WORMHOLE_CLEARANCE)
    const starterWormhole = sim.galaxy.wormholes.find(
      (w) => w.fromSystemId === 'system_starter_1',
    );
    expect(starterWormhole).toBeDefined();
    if (starterWormhole) {
      const whRes = sim.validateDeepSpacePlacement(
        'player_1',
        'system_starter_1',
        {
          x: starterWormhole.fromPosition.x + MIN_DEEP_SPACE_WORMHOLE_CLEARANCE - 5,
          z: starterWormhole.fromPosition.z,
        },
        'logistics_hub',
      );
      expect(whRes.ok).toBe(false);
      expect(whRes.reason).toContain('wormhole');
    }

    // 5. Complete hubs and verify hub-to-tower (42u) and tower-to-tower (30u) spacing rules
    sim.stepTick(20);
    const tooCloseToHub = sim.submitCommand({
      type: 'BUILD_DEEP_SPACE_STRUCTURE',
      playerId: 'player_1',
      systemId: 'system_starter_1',
      position: { x: hub1Pos.x + MIN_HUB_TO_TOWER_SPACING - 5, z: hub1Pos.z },
      structureId: 'point_defence_tower',
    });
    expect(tooCloseToHub.ok).toBe(false);

    const tower1 = sim.submitCommand({
      type: 'BUILD_DEEP_SPACE_STRUCTURE',
      playerId: 'player_1',
      systemId: 'system_starter_1',
      position: { x: hub1Pos.x, z: hub1Pos.z + MIN_HUB_TO_TOWER_SPACING + 5 },
      structureId: 'point_defence_tower',
    });
    expect(tower1.ok).toBe(true);

    const tooCloseToTower = sim.submitCommand({
      type: 'BUILD_DEEP_SPACE_STRUCTURE',
      playerId: 'player_1',
      systemId: 'system_starter_1',
      position: { x: hub1Pos.x + MIN_TOWER_TO_TOWER_SPACING - 5, z: hub1Pos.z + MIN_HUB_TO_TOWER_SPACING + 5 },
      structureId: 'hull_breaker_tower',
    });
    expect(tooCloseToTower.ok).toBe(false);

    const tower2 = sim.submitCommand({
      type: 'BUILD_DEEP_SPACE_STRUCTURE',
      playerId: 'player_1',
      systemId: 'system_starter_1',
      position: { x: hub1Pos.x + MIN_TOWER_TO_TOWER_SPACING + 2, z: hub1Pos.z + MIN_HUB_TO_TOWER_SPACING + 5 },
      structureId: 'hull_breaker_tower',
    });
    expect(tower2.ok).toBe(true);
  });

  it('falls back to the preceding empty slot for 2-slot orbital platforms and reports 1-indexed slot numbers on failure', () => {
    const sim = new GameSimulation('blitz_skirmish');
    const p1 = sim.getPlayerState('player_1');
    p1.ore = 5000;
    p1.crystal = 5000;

    // Pick a 6-slot Small secondary planet in Starter System 1
    const smallPlanet = sim
      .getPlanetsInSystem('system_starter_1')
      .find((p) => p.planet.orbitalSlots === 6);
    expect(smallPlanet).toBeDefined();
    if (!smallPlanet) {
      return;
    }

    // Claim Slot 1 (index 0) with Outpost, occupy Slot 2 (1), Slot 3 (2), and Slot 6 (5) — leaving Slots 4 (3) & 5 (4) empty
    expect(
      sim.submitCommand({
        type: 'BUILD_ORBITAL_STRUCTURE',
        playerId: 'player_1',
        planetId: smallPlanet.planet.id,
        slotIndex: 0,
        structureId: 'planetary_outpost',
      }).ok,
    ).toBe(true);
    for (const idx of [1, 2, 5]) {
      expect(
        sim.submitCommand({
          type: 'BUILD_ORBITAL_STRUCTURE',
          playerId: 'player_1',
          planetId: smallPlanet.planet.id,
          slotIndex: idx,
          structureId: 'refinery',
        }).ok,
      ).toBe(true);
    }

    // Clicking an occupied slot (Slot 6, index 5) reports 1-indexed "slot 6"
    const occupiedRes = sim.submitCommand({
      type: 'BUILD_ORBITAL_STRUCTURE',
      playerId: 'player_1',
      planetId: smallPlanet.planet.id,
      slotIndex: 5,
      structureId: 'orbital_dockyard',
    });
    expect(occupiedRes.ok).toBe(false);
    expect(occupiedRes.reason).toContain('slot 6');

    // Selecting Slot 5 (index 4) when Slot 6 (5) is occupied falls back to [3, 4] (Slots 4 & 5)
    const fallbackRes = sim.submitCommand({
      type: 'BUILD_ORBITAL_STRUCTURE',
      playerId: 'player_1',
      planetId: smallPlanet.planet.id,
      slotIndex: 4,
      structureId: 'orbital_dockyard',
    });
    expect(fallbackRes.ok).toBe(true);

    const dockyard = smallPlanet.structures.find(
      (s) => s.structureId === 'orbital_dockyard',
    );
    expect(dockyard?.primarySlotIndex).toBe(3);
    expect(dockyard?.occupiedSlots).toEqual([3, 4]);

    // Test isolated single empty slot on Homeworld (10 slots): occupy slots 2 & 4, try 2-slot on slot 3 (index 3)
    const homeworld = sim.getPlanetState('system_starter_1_homeworld');
    expect(
      sim.submitCommand({
        type: 'BUILD_ORBITAL_STRUCTURE',
        playerId: 'player_1',
        planetId: homeworld.planet.id,
        slotIndex: 2,
        structureId: 'refinery',
      }).ok,
    ).toBe(true);
    expect(
      sim.submitCommand({
        type: 'BUILD_ORBITAL_STRUCTURE',
        playerId: 'player_1',
        planetId: homeworld.planet.id,
        slotIndex: 4,
        structureId: 'refinery',
      }).ok,
    ).toBe(true);

    const isolatedRes = sim.submitCommand({
      type: 'BUILD_ORBITAL_STRUCTURE',
      playerId: 'player_1',
      planetId: homeworld.planet.id,
      slotIndex: 3,
      structureId: 'heavy_defense_platform',
    });
    expect(isolatedRes.ok).toBe(false);
    expect(isolatedRes.reason).toContain('slot 4');
    expect(isolatedRes.reason).toContain('slots 3 and 5');
  });

  it('scales C&C and Refinery unload rates by harvestRateMultiplier and doubles Refinery concurrent docks to 4 in Blitz Skirmish', () => {
    const blitzSim = new GameSimulation('blitz_skirmish');
    const p1 = blitzSim.getPlayerState('player_1');
    p1.ore = 3000;
    p1.crystal = 1500;

    const homeworld = blitzSim.getPlanetState('system_starter_1_homeworld');
    const cnc = homeworld.structures[0];
    expect(cnc).toBeDefined();
    if (!cnc) {
      return;
    }

    // Build a Refinery on slot 2
    expect(
      blitzSim.submitCommand({
        type: 'BUILD_ORBITAL_STRUCTURE',
        playerId: 'player_1',
        planetId: homeworld.planet.id,
        slotIndex: 2,
        structureId: 'refinery',
      }).ok,
    ).toBe(true);
    blitzSim.stepTick(25);

    const refinery = homeworld.structures.find((s) => s.structureId === 'refinery');
    expect(refinery).toBeDefined();
    if (!refinery) {
      return;
    }

    // 1. Verify scaled unload rates (1.6x) and doubled dock caps (C&C: 2, Refinery: 4)
    expect(blitzSim.getPlatformUnloadRatePerSecond(cnc)).toBeCloseTo(
      CNC_UNLOAD_RATE_PER_SECOND * 1.6,
      5,
    );
    expect(blitzSim.getPlatformUnloadRatePerSecond(refinery)).toBeCloseTo(
      REFINERY_UNLOAD_RATE_PER_SECOND * 1.6,
      5,
    );
    expect(blitzSim.getMaxConcurrentDocks(cnc)).toBe(2);
    expect(blitzSim.getMaxConcurrentDocks(refinery)).toBe(4);

    // 2. Queue 4 more Harvesters at the Refinery (5 total assigned to this Refinery)
    for (let i = 0; i < 4; i++) {
      expect(
        blitzSim.submitCommand({
          type: 'QUEUE_SHIP',
          playerId: 'player_1',
          dockyardOrRefineryId: refinery.id,
          shipClassId: 'harvester',
          autoRepeat: false,
        }).ok,
      ).toBe(true);
    }
    for (let i = 0; i < 4; i++) {
      blitzSim.stepTick(9);
    }

    const refHarvesters = blitzSim
      .getAllHarvesters()
      .filter((h) => h.homeStructureId === refinery.id);
    expect(refHarvesters).toHaveLength(5);

    // 3. Dock all 5 full Harvesters simultaneously -> 4 unload in parallel, 5th queues
    const refPos = blitzSim.getStructureWorldPosition(homeworld, refinery);
    for (const h of refHarvesters) {
      h.position = { x: refPos.x, z: refPos.z };
      h.cargoAmount = 40;
      h.cargoType = 'ore';
      h.state = 'returning_to_dropoff';
    }
    blitzSim.stepTick(0.5);
    expect(refinery.activeDockingHarvesterIds).toHaveLength(4);
    expect(refinery.queuedDockingHarvesterIds).toHaveLength(1);

    // 4. At 16/s (40 cargo in 2.5s), after 2.5s total (5 more 0.5s ticks), all 4 finish and the 5th enters dock
    const waiting = refHarvesters.find((h) => h.state === 'waiting_to_unload');
    expect(waiting).toBeDefined();
    for (let i = 0; i < 5; i++) {
      blitzSim.stepTick(0.5);
    }
    expect(waiting?.state).toBe('unloading');
  });

  it('builds combat ships from Orbital Dockyard with tech/supply/hub gating, autoRepeat, cross-system Rally Points, and Patrol Routes', () => {
    const sim = new GameSimulation('blitz_skirmish');
    const p1 = sim.getPlayerState('player_1');
    p1.ore = 6000;
    p1.crystal = 4000;

    const homeworld = sim.getPlanetState('system_starter_1_homeworld');

    // 1. Build a 2-slot Orbital Dockyard on slots 2 & 3
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
    expect(dockyard?.isComplete).toBe(true);
    if (!dockyard) {
      return;
    }

    // 2. Tech & Fighter gating: Cruiser requires 1 Tech Module, Fighter requires Logistics Hub or Carrier
    const cruiserBlocked = sim.submitCommand({
      type: 'QUEUE_SHIP',
      playerId: 'player_1',
      dockyardOrRefineryId: dockyard.id,
      shipClassId: 'cruiser',
      autoRepeat: false,
    });
    expect(cruiserBlocked.ok).toBe(false);
    expect(cruiserBlocked.reason).toContain('Tech Module');

    const fighterBlocked = sim.submitCommand({
      type: 'QUEUE_SHIP',
      playerId: 'player_1',
      dockyardOrRefineryId: dockyard.id,
      shipClassId: 'fighter',
      autoRepeat: false,
    });
    expect(fighterBlocked.ok).toBe(false);
    expect(fighterBlocked.reason).toContain('Logistics Hub');

    // 3. Queue a Destroyer (supply 2) and cancel it -> refunds Ore, Crystal, AND Fleet Supply
    const oreBeforeQueue = p1.ore;
    const supplyBeforeQueue = p1.supplyUsed;
    expect(
      sim.submitCommand({
        type: 'QUEUE_SHIP',
        playerId: 'player_1',
        dockyardOrRefineryId: dockyard.id,
        shipClassId: 'destroyer',
        autoRepeat: false,
      }).ok,
    ).toBe(true);
    expect(p1.supplyUsed).toBe(supplyBeforeQueue + 2);
    const queuedId = dockyard.productionQueue[0]?.id ?? '';
    expect(
      sim.submitCommand({
        type: 'CANCEL_QUEUED_SHIP',
        playerId: 'player_1',
        structureId: dockyard.id,
        queueItemId: queuedId,
      }).ok,
    ).toBe(true);
    expect(p1.ore).toBe(oreBeforeQueue);
    expect(p1.supplyUsed).toBe(supplyBeforeQueue);

    // 4. Set a Cross-System Rally Point into Central Nexus and queue Destroyer with autoRepeat: true
    expect(
      sim.submitCommand({
        type: 'SET_RALLY_POINT',
        playerId: 'player_1',
        dockyardId: dockyard.id,
        targetSystemId: 'system_central_hub',
        targetPosition: { x: 240, z: 180 },
        stance: 'aggressive',
      }).ok,
    ).toBe(true);

    expect(
      sim.submitCommand({
        type: 'QUEUE_SHIP',
        playerId: 'player_1',
        dockyardOrRefineryId: dockyard.id,
        shipClassId: 'destroyer',
        autoRepeat: true,
      }).ok,
    ).toBe(true);

    // Advance 12.5s -> 1st Destroyer spawns AND autoRepeat queues a 2nd Destroyer automatically!
    sim.stepTick(12.5);
    const ships = sim.getAllCombatShips();
    expect(ships).toHaveLength(1);
    expect(ships[0]?.shipClassId).toBe('destroyer');
    expect(ships[0]?.state).toBe('transiting_wormhole');
    expect(dockyard.productionQueue).toHaveLength(1);
    expect(dockyard.productionQueue[0]?.autoRepeat).toBe(true);

    // Cancel the auto-repeat item so we can test navigation of ship #1 cleanly
    sim.submitCommand({
      type: 'CANCEL_QUEUED_SHIP',
      playerId: 'player_1',
      structureId: dockyard.id,
      queueItemId: dockyard.productionQueue[0]!.id,
    });

    // Advance ticks until Destroyer #1 transits the wormhole into Central Nexus and reaches the rally point
    const destroyer = ships[0]!;
    for (let i = 0; i < 120; i++) {
      sim.stepTick(0.5);
    }
    expect(destroyer.currentSystemId).toBe('system_central_hub');
    expect(destroyer.state).toBe('holding_position');

    // 5. Issue a 2-waypoint Patrol Route in Central Nexus -> ship enters patrolling and cycles waypoints
    expect(
      sim.submitCommand({
        type: 'SET_PATROL_ROUTE',
        playerId: 'player_1',
        dockyardId: dockyard.id,
        waypoints: [
          { systemId: 'system_central_hub', position: { x: 260, z: 200 } },
          { systemId: 'system_central_hub', position: { x: 360, z: 200 } },
        ],
        stance: 'hold_the_line',
      }).ok,
    ).toBe(true);
    expect(destroyer.state).toBe('patrolling');
    expect(destroyer.stance).toBe('hold_the_line');

    let sawIndexOne = false;
    for (let i = 0; i < 30; i++) {
      sim.stepTick(0.5);
      if (destroyer.patrolIndex === 1) {
        sawIndexOne = true;
      }
    }
    expect(sawIndexOne).toBe(true);
  });

  it('manages Fleets with distributed smallest-first dual-bay production, formation cruise speed, auto-resupply, split, and merge', () => {
    const sim = new GameSimulation('blitz_skirmish');
    const p1 = sim.getPlayerState('player_1');
    p1.ore = 8000;
    p1.crystal = 5000;

    const homeworld = sim.getPlanetState('system_starter_1_homeworld');

    // Build 1 Tech Module (slot 4) and 1 Orbital Dockyard (slots 2 & 3)
    expect(
      sim.submitCommand({
        type: 'BUILD_ORBITAL_STRUCTURE',
        playerId: 'player_1',
        planetId: homeworld.planet.id,
        slotIndex: 4,
        structureId: 'tech_module',
      }).ok,
    ).toBe(true);
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
    )!;
    expect(dockyard.isComplete).toBe(true);

    // 1. Create a Fleet with Rally Point and Auto-Resupply ON, requesting 1 Cruiser + 2 Destroyers
    expect(
      sim.submitCommand({
        type: 'CREATE_FLEET',
        playerId: 'player_1',
        name: 'Alpha Strike',
        rallySystemId: 'system_starter_1',
        rallyPosition: { x: 220, z: 120 },
        stance: 'aggressive',
        autoResupply: true,
      }).ok,
    ).toBe(true);

    const fleet = sim.getFleetsForPlayer('player_1')[0]!;
    expect(fleet.name).toBe('Alpha Strike');
    expect(fleet.autoResupply).toBe(true);

    expect(
      sim.submitCommand({
        type: 'UPDATE_FLEET_TEMPLATE',
        playerId: 'player_1',
        fleetId: fleet.id,
        desiredCounts: { destroyer: 2, cruiser: 1 },
      }).ok,
    ).toBe(true);

    // 2. Next tick: Dockyard's 2 parallel bays immediately queue the 2 smallest ships first (both Destroyers!)
    sim.stepTick(0.5);
    expect(dockyard.productionQueue).toHaveLength(2);
    expect(dockyard.productionQueue[0]?.shipClassId).toBe('destroyer');
    expect(dockyard.productionQueue[1]?.shipClassId).toBe('destroyer');

    // 3. Advance 12s -> BOTH Destroyers finish in parallel (dual-bay construction!), and Cruiser starts immediately!
    sim.stepTick(12.0);
    const firstBatch = sim.getShipsInFleet(fleet.id);
    expect(firstBatch).toHaveLength(2);
    // Regression check: BOTH parallel-spawned ships must target the fleet's green rally point (not a mid-transit sibling)
    for (const s of firstBatch) {
      expect(s.targetSystemId).toBe('system_starter_1');
      expect(s.targetPosition).toEqual({ x: 220, z: 120 });
    }
    expect(dockyard.productionQueue).toHaveLength(1);
    expect(dockyard.productionQueue[0]?.shipClassId).toBe('cruiser');

    // 4. Advance 20.5s -> Cruiser completes and joins the fleet (now 2 Destroyers + 1 Cruiser)
    sim.stepTick(20.5);
    const fleetShips = sim.getShipsInFleet(fleet.id);
    expect(fleetShips).toHaveLength(3);
    for (const s of fleetShips) {
      expect(s.targetPosition).toEqual({ x: 220, z: 120 });
    }

    // Advance until all 3 ships reach the rally point formation
    for (let i = 0; i < 40; i++) {
      sim.stepTick(0.5);
    }
    for (const s of fleetShips) {
      expect(s.state).toBe('holding_position');
      expect(Math.hypot(s.position.x - 220, s.position.z - 120)).toBeLessThan(35);
    }

    // Formation cruise speed equals the slowest ship (Cruiser = 44 u/s, not Destroyer = 68 u/s)
    expect(sim.getFleetCruiseSpeed(fleet.id)).toBe(44);

    // 5. Move entire fleet to (420, 260) and test Auto-Resupply when 1 Destroyer is destroyed
    expect(
      sim.submitCommand({
        type: 'ORDER_FLEET_MOVE',
        playerId: 'player_1',
        fleetId: fleet.id,
        targetSystemId: 'system_starter_1',
        targetPosition: { x: 420, z: 260 },
      }).ok,
    ).toBe(true);

    const destroyerToLose = fleetShips.find((s) => s.shipClassId === 'destroyer')!;
    expect(sim.destroyCombatShip(destroyerToLose.id)).toBe(true);
    expect(sim.getShipsInFleet(fleet.id)).toHaveLength(2);

    // Next tick: Auto-Resupply ON automatically queues a replacement Destroyer at the nearest Dockyard!
    sim.stepTick(0.5);
    expect(dockyard.productionQueue).toHaveLength(1);
    expect(dockyard.productionQueue[0]?.shipClassId).toBe('destroyer');
    expect(dockyard.productionQueue[0]?.targetFleetId).toBe(fleet.id);

    // Complete replacement -> fleet returns to 3 ships!
    sim.stepTick(12.0);
    expect(sim.getShipsInFleet(fleet.id)).toHaveLength(3);

    // 6. Test Split Fleet & Merge Fleets
    expect(
      sim.submitCommand({
        type: 'SPLIT_FLEET',
        playerId: 'player_1',
        sourceFleetId: fleet.id,
        newFleetName: 'Bravo Detachment',
      }).ok,
    ).toBe(true);
    const allFleets = sim.getFleetsForPlayer('player_1');
    expect(allFleets).toHaveLength(2);
    const bravo = allFleets.find((f) => f.name === 'Bravo Detachment')!;
    expect(sim.getShipsInFleet(bravo.id).length).toBeGreaterThan(0);

    expect(
      sim.submitCommand({
        type: 'MERGE_FLEETS',
        playerId: 'player_1',
        sourceFleetId: bravo.id,
        targetFleetId: fleet.id,
      }).ok,
    ).toBe(true);
    expect(sim.getFleetsForPlayer('player_1')).toHaveLength(1);
    expect(sim.getShipsInFleet(fleet.id)).toHaveLength(3);

    // 7. Test Orbital Dockyard Fleet Building toggle (defaults to enabled; disabling pauses fleet queueing)
    expect(dockyard.fleetProductionEnabled).toBe(true);
    expect(
      sim.submitCommand({
        type: 'SET_DOCKYARD_FLEET_BUILDING',
        playerId: 'player_1',
        dockyardId: dockyard.id,
        enabled: false,
      }).ok,
    ).toBe(true);
    expect(dockyard.fleetProductionEnabled).toBe(false);

    // Request an extra Destroyer -> disabled dockyard must NOT pick it up
    expect(
      sim.submitCommand({
        type: 'UPDATE_FLEET_TEMPLATE',
        playerId: 'player_1',
        fleetId: fleet.id,
        desiredCounts: { destroyer: 3 },
      }).ok,
    ).toBe(true);
    sim.stepTick(0.5);
    expect(dockyard.productionQueue).toHaveLength(0);

    // Re-enabling fleet building immediately resumes queueing
    expect(
      sim.submitCommand({
        type: 'SET_DOCKYARD_FLEET_BUILDING',
        playerId: 'player_1',
        dockyardId: dockyard.id,
        enabled: true,
      }).ok,
    ).toBe(true);
    sim.stepTick(0.5);
    expect(dockyard.productionQueue).toHaveLength(1);
    expect(dockyard.productionQueue[0]?.shipClassId).toBe('destroyer');
  });

  it('resolves 5-class RPS combat, stances (Aggressive/Hold/Passive), Carrier fighter tethers, shield impact events, and C&C defeat', () => {
    // 1. Stances: Passive never fires; Hold the Line holds position; Aggressive pursues in-system
    const stanceSim = new GameSimulation('blitz_skirmish');
    const passiveCruiser = stanceSim.spawnCombatShipDirect(
      'player_1',
      'system_central_hub',
      { x: 200, z: 200 },
      'cruiser',
      'passive',
    );
    const enemyTarget = stanceSim.spawnCombatShipDirect(
      'player_2',
      'system_central_hub',
      { x: 260, z: 200 },
      'destroyer',
      'passive',
    );
    stanceSim.stepTick(2.0);
    expect(enemyTarget.hull).toBe(enemyTarget.maxHull);
    expect(passiveCruiser.inCombat).toBe(false);

    // Switch to hold_the_line -> fires immediately in range without moving
    passiveCruiser.stance = 'hold_the_line';
    const holdStartPos = { ...passiveCruiser.position };
    stanceSim.stepTick(2.0);
    expect(enemyTarget.hull).toBeLessThan(enemyTarget.maxHull);
    expect(passiveCruiser.position.x).toBeCloseTo(holdStartPos.x, 3);
    expect(stanceSim.isPlayerInActiveCombat('player_1')).toBe(true);

    // Aggressive ship pursues a distant hostile in the same system
    const aggressiveDestroyer = stanceSim.spawnCombatShipDirect(
      'player_1',
      'system_central_hub',
      { x: 600, z: 200 },
      'destroyer',
      'aggressive',
    );
    const startDist = Math.hypot(
      aggressiveDestroyer.position.x - enemyTarget.position.x,
      aggressiveDestroyer.position.z - enemyTarget.position.z,
    );
    stanceSim.stepTick(2.0);
    const afterDist = Math.hypot(
      aggressiveDestroyer.position.x - enemyTarget.position.x,
      aggressiveDestroyer.position.z - enemyTarget.position.z,
    );
    expect(afterDist).toBeLessThan(startDist - 50);

    // 2. RPS: Fighter swarm strips shields & defeats a lone Dreadnought, emitting weapon_fire + shield_impact + hull_explosion
    const fighterSim = new GameSimulation('blitz_skirmish');
    for (let i = 0; i < 12; i++) {
      fighterSim.spawnCombatShipDirect(
        'player_1',
        'system_central_hub',
        { x: 300 + (i % 4) * 10, z: 300 + Math.floor(i / 4) * 10 },
        'fighter',
        'aggressive',
      );
    }
    const loneDread = fighterSim.spawnCombatShipDirect(
      'player_2',
      'system_central_hub',
      { x: 340, z: 310 },
      'dreadnought',
      'hold_the_line',
    );

    let sawWeaponFire = false;
    let sawShieldImpact = false;
    let sawExplosion = false;
    for (let t = 0; t < 60; t++) {
      fighterSim.stepTick(0.5);
      for (const ev of fighterSim.consumeCombatEvents()) {
        if (ev.type === 'weapon_fire') sawWeaponFire = true;
        if (ev.type === 'shield_impact') sawShieldImpact = true;
        if (ev.type === 'hull_explosion') sawExplosion = true;
      }
      if (!fighterSim.getCombatShipById(loneDread.id)) {
        break;
      }
    }
    expect(fighterSim.getCombatShipById(loneDread.id)).toBeUndefined();
    expect(sawWeaponFire).toBe(true);
    expect(sawShieldImpact).toBe(true);
    expect(sawExplosion).toBe(true);

    // 3. RPS: 2 Cruisers shred 6 Fighters with rapid Point Defence
    const pdSim = new GameSimulation('blitz_skirmish');
    pdSim.spawnCombatShipDirect('player_1', 'system_central_hub', { x: 200, z: 200 }, 'cruiser', 'hold_the_line');
    pdSim.spawnCombatShipDirect('player_1', 'system_central_hub', { x: 215, z: 215 }, 'cruiser', 'hold_the_line');
    for (let i = 0; i < 6; i++) {
      pdSim.spawnCombatShipDirect(
        'player_2',
        'system_central_hub',
        { x: 250 + i * 6, z: 200 },
        'fighter',
        'aggressive',
      );
    }
    for (let t = 0; t < 40; t++) {
      pdSim.stepTick(0.5);
    }
    const remainingP2Fighters = pdSim
      .getAllCombatShips()
      .filter((s) => s.ownerId === 'player_2');
    const remainingP1Cruisers = pdSim
      .getAllCombatShips()
      .filter((s) => s.ownerId === 'player_1');
    expect(remainingP2Fighters).toHaveLength(0);
    expect(remainingP1Cruisers).toHaveLength(2);

    // 4. Carrier holds standoff (>= 240u), keeps 4 ready Fighters docked when clear, scrambles rapidly on contact,
    //    rebuilds destroyed squadrons 1-at-a-time (0 -> 7s resetting per missing wing), and destroying Carrier strands them
    const carrierSim = new GameSimulation('blitz_skirmish');
    const carrier = carrierSim.spawnCombatShipDirect(
      'player_1',
      'system_central_hub',
      { x: 400, z: 400 },
      'carrier',
      'aggressive',
    );
    expect(carrier.readyFighterCount).toBe(4);
    expect(carrier.fighterRebuildProgressSeconds).toBe(0);
    // No enemies nearby -> Fighters stay docked in the Carrier hangar
    carrierSim.stepTick(10.0);
    expect(
      carrierSim
        .getAllCombatShips()
        .filter((s) => s.shipClassId === 'fighter' && s.tetherHostId === carrier.id),
    ).toHaveLength(0);

    // Hostile Dreadnought enters scramble range (passive so it stays alive while wings scramble)
    const hostileTarget = carrierSim.spawnCombatShipDirect(
      'player_2',
      'system_central_hub',
      { x: 700, z: 400 },
      'dreadnought',
      'passive',
    );
    hostileTarget.hull = 20000;
    // Rapid hangar scramble launches all 4 ready squadrons within ~4s
    for (let t = 0; t < 8; t++) {
      carrierSim.stepTick(0.5);
    }
    const launchedWings = carrierSim
      .getAllCombatShips()
      .filter((s) => s.shipClassId === 'fighter' && s.tetherHostId === carrier.id);
    expect(launchedWings).toHaveLength(4);
    expect(carrier.readyFighterCount).toBe(0);
    expect(carrier.fighterRebuildProgressSeconds).toBe(0);

    // Aggressive Carrier holds standoff (~280u) instead of closing into PD range
    for (let t = 0; t < 10; t++) {
      carrierSim.stepTick(0.5);
    }
    const carrierDist = Math.hypot(
      carrier.position.x - hostileTarget.position.x,
      carrier.position.z - hostileTarget.position.z,
    );
    expect(carrierDist).toBeGreaterThanOrEqual(240);

    // Destroy 2 squadrons -> sequential 1-at-a-time rebuild (7s per squadron, resetting for the 2nd)
    expect(carrierSim.destroyCombatShip(launchedWings[0]!.id)).toBe(true);
    expect(carrierSim.destroyCombatShip(launchedWings[1]!.id)).toBe(true);
    carrierSim.stepTick(3.5);
    expect(carrier.fighterRebuildProgressSeconds).toBeCloseTo(3.5, 2);
    // Finish 1st rebuild (7.0s total) -> 3rd wing returns, progress resets for 2nd missing wing
    carrierSim.stepTick(3.6);
    expect(
      carrierSim
        .getAllCombatShips()
        .filter((s) => s.shipClassId === 'fighter' && s.tetherHostId === carrier.id).length +
        carrier.readyFighterCount,
    ).toBe(3);
    expect(carrier.fighterRebuildProgressSeconds).toBeLessThan(1.0);
    // Finish 2nd rebuild -> all 4 squadrons restored, rebuild bar clears to 0
    for (let t = 0; t < 16; t++) {
      carrierSim.stepTick(0.5);
    }
    expect(
      carrierSim
        .getAllCombatShips()
        .filter((s) => s.shipClassId === 'fighter' && s.tetherHostId === carrier.id).length +
        carrier.readyFighterCount,
    ).toBe(4);
    expect(carrier.fighterRebuildProgressSeconds).toBe(0);

    // Clear hostile -> all 4 launched Fighter squadrons must fly back and redock in the Carrier hangar
    expect(carrierSim.destroyCombatShip(hostileTarget.id)).toBe(true);
    for (let t = 0; t < 30; t++) {
      carrierSim.stepTick(0.5);
    }
    expect(
      carrierSim
        .getAllCombatShips()
        .filter((s) => s.shipClassId === 'fighter' && s.tetherHostId === carrier.id),
    ).toHaveLength(0);
    expect(carrier.readyFighterCount).toBe(4);

    // Also verify all 4 surviving wings (including outer formationOffset indices) redock even when Carrier is moving
    const movingSim = new GameSimulation('blitz_skirmish');
    const moveCarrier = movingSim.spawnCombatShipDirect(
      'player_1',
      'system_central_hub',
      { x: 400, z: 400 },
      'carrier',
      'aggressive',
    );
    const moveHostile = movingSim.spawnCombatShipDirect(
      'player_2',
      'system_central_hub',
      { x: 680, z: 400 },
      'dreadnought',
      'passive',
    );
    moveHostile.hull = 20000;
    for (let t = 0; t < 8; t++) {
      movingSim.stepTick(0.5);
    }
    expect(
      movingSim
        .getAllCombatShips()
        .filter((s) => s.shipClassId === 'fighter' && s.tetherHostId === moveCarrier.id),
    ).toHaveLength(4);
    expect(movingSim.destroyCombatShip(moveHostile.id)).toBe(true);
    // Order Carrier to move across the system while fighters are returning
    moveCarrier.targetPosition = { x: -400, z: -200 };
    for (let t = 0; t < 40; t++) {
      movingSim.stepTick(0.5);
    }
    expect(
      movingSim
        .getAllCombatShips()
        .filter((s) => s.shipClassId === 'fighter' && s.tetherHostId === moveCarrier.id),
    ).toHaveLength(0);
    expect(moveCarrier.readyFighterCount).toBe(4);

    // Re-launch when another hostile arrives, then destroy the Carrier -> next tick cleans up stranded Fighters
    const secondHostile = carrierSim.spawnCombatShipDirect(
      'player_2',
      'system_central_hub',
      { x: 700, z: 400 },
      'dreadnought',
      'passive',
    );
    for (let t = 0; t < 8; t++) {
      carrierSim.stepTick(0.5);
    }
    expect(
      carrierSim
        .getAllCombatShips()
        .filter((s) => s.shipClassId === 'fighter' && s.tetherHostId === carrier.id).length,
    ).toBeGreaterThan(0);
    expect(secondHostile.hull).toBeGreaterThan(0);

    // Destroy the Carrier -> next tick cleans up stranded Fighters with no Hub/Carrier left
    expect(carrierSim.destroyCombatShip(carrier.id)).toBe(true);
    carrierSim.stepTick(0.5);
    expect(
      carrierSim.getAllCombatShips().filter((s) => s.shipClassId === 'fighter'),
    ).toHaveLength(0);

    // 5. Destroying a player's Homeworld C&C marks that player defeated
    const defeatSim = new GameSimulation('blitz_skirmish');
    const p2Home = defeatSim.getPlanetState('system_starter_2_homeworld');
    const p2Cnc = p2Home.structures.find((s) => s.structureId === 'command_and_control')!;
    const cncPos = defeatSim.getStructureWorldPosition(p2Home, p2Cnc);
    p2Cnc.shields = 0;
    p2Cnc.hull = 200;
    defeatSim.spawnCombatShipDirect(
      'player_1',
      'system_starter_2',
      { x: cncPos.x + 80, z: cncPos.z },
      'dreadnought',
      'aggressive',
    );
    expect(defeatSim.isPlayerDefeated('player_2')).toBe(false);
    for (let i = 0; i < 6; i++) {
      defeatSim.stepTick(0.5);
    }
    expect(defeatSim.isPlayerDefeated('player_2')).toBe(true);

    // 6. Fleet Battle Simulator runs in isolated void system (`system_battle_void`) and tracks damage & survival stats
    const simArena = new GameSimulation('standard_tactical');
    const launch = simArena.launchFleetBattleSimulator(
      { cruiser: 2 },
      { destroyer: 1 },
    );
    expect(launch.systemId).toBe('system_battle_void');
    expect(launch.friendlySpawned).toBe(2);
    expect(launch.hostileSpawned).toBe(1);
    expect(simArena.getCombatShipsInSystem('system_starter_1')).toHaveLength(0);
    expect(simArena.getCombatShipsInSystem('system_battle_void')).toHaveLength(3);

    for (let t = 0; t < 40; t++) {
      simArena.stepTick(0.5);
      if (simArena.getBattleSimulatorStats()?.status !== 'running') {
        break;
      }
    }
    const finalStats = simArena.getBattleSimulatorStats();
    expect(finalStats?.status).toBe('friendly_victory');
    expect(finalStats?.friendly.survivingShips).toBeGreaterThan(0);
    expect(finalStats?.hostile.survivingShips).toBe(0);
    expect(finalStats?.friendly.hullDamageDealt).toBeGreaterThan(0);
    expect(finalStats?.friendly.shipsDestroyed).toBe(1);
    expect(simArena.clearBattleSimulatorShips()).toBeGreaterThan(0);
    expect(simArena.getCombatShipsInSystem('system_battle_void')).toHaveLength(0);

    // 7. Combat movement & LOS: Dreadnoughts turn bow-on for Spinal Siege vs Capitals/Structures,
    //    broadside for Heavy Turrets vs Cruisers/Destroyers, Fighters orbit closely, and LOS blocks friendly hulls
    const tacticsSim = new GameSimulation('blitz_skirmish');
    const dreadVsCruiser = tacticsSim.spawnCombatShipDirect(
      'player_1',
      'system_central_hub',
      { x: 300, z: 300 },
      'dreadnought',
      'hold_the_line',
    );
    dreadVsCruiser.headingRadians = Math.PI / 2;
    const enemyCruiser = tacticsSim.spawnCombatShipDirect(
      'player_2',
      'system_central_hub',
      { x: 450, z: 300 },
      'cruiser',
      'passive',
    );
    enemyCruiser.hull = 5000;

    for (let i = 0; i < 12; i++) {
      tacticsSim.stepTick(0.2);
    }
    // Against a Cruiser, Dreadnought turns broadside to focus its dorsal & broadside heavy turrets
    const bearingToCruiser = Math.atan2(
      enemyCruiser.position.x - dreadVsCruiser.position.x,
      enemyCruiser.position.z - dreadVsCruiser.position.z,
    );
    const broadsideAngle = Math.abs(
      Math.atan2(
        Math.sin(dreadVsCruiser.headingRadians - bearingToCruiser),
        Math.cos(dreadVsCruiser.headingRadians - bearingToCruiser),
      ),
    );
    expect(broadsideAngle).toBeGreaterThan(Math.PI / 2 - 0.15);

    // Against an enemy Dreadnought, Dreadnought turns bow-on for its forward Spinal Siege Battery
    const siegeSim = new GameSimulation('blitz_skirmish');
    const siegeDread = siegeSim.spawnCombatShipDirect(
      'player_1',
      'system_central_hub',
      { x: 300, z: 300 },
      'dreadnought',
      'hold_the_line',
    );
    siegeDread.headingRadians = 0; // Starts side-on
    const enemyDread = siegeSim.spawnCombatShipDirect(
      'player_2',
      'system_central_hub',
      { x: 450, z: 300 },
      'dreadnought',
      'passive',
    );
    enemyDread.hull = 5000;
    for (let i = 0; i < 12; i++) {
      siegeSim.stepTick(0.2);
    }
    const bearingToEnemy = Math.atan2(
      enemyDread.position.x - siegeDread.position.x,
      enemyDread.position.z - siegeDread.position.z,
    );
    const bowOffAngle = Math.abs(
      Math.atan2(
        Math.sin(siegeDread.headingRadians - bearingToEnemy),
        Math.cos(siegeDread.headingRadians - bearingToEnemy),
      ),
    );
    expect(bowOffAngle).toBeLessThan(0.2);

    // Fighter orbits around target continuously (never stationary) while facing the target
    const fighter = siegeSim.spawnCombatShipDirect(
      'player_1',
      'system_central_hub',
      { x: 470, z: 300 },
      'fighter',
      'aggressive',
    );
    const posBefore = { ...fighter.position };
    siegeSim.stepTick(0.2);
    const moved = Math.hypot(
      fighter.position.x - posBefore.x,
      fighter.position.z - posBefore.z,
    );
    expect(moved).toBeGreaterThan(5);
    const fighterBearing = Math.atan2(
      enemyDread.position.x - fighter.position.x,
      enemyDread.position.z - fighter.position.z,
    );
    expect(fighter.headingRadians).toBeCloseTo(fighterBearing, 2);

    // Friendly hull directly between shooter and enemy blocks LOS (no friendly-fire shoot-through)
    const losSim = new GameSimulation('blitz_skirmish');
    const shooter = losSim.spawnCombatShipDirect(
      'player_1',
      'system_central_hub',
      { x: 200, z: 200 },
      'cruiser',
      'hold_the_line',
    );
    losSim.spawnCombatShipDirect(
      'player_1',
      'system_central_hub',
      { x: 250, z: 200 },
      'dreadnought',
      'passive',
    );
    const blockedEnemy = losSim.spawnCombatShipDirect(
      'player_2',
      'system_central_hub',
      { x: 300, z: 200 },
      'destroyer',
      'passive',
    );
    expect(shooter).toBeDefined();
    losSim.stepTick(2.0);
    expect(blockedEnemy.hull).toBe(blockedEnemy.maxHull);

    // 8. Fleet Flee command routes ships at full individual speed to nearest Logistics Hub / Outpost / C&C
    const fleeSim = new GameSimulation('blitz_skirmish');
    const p1Flee = fleeSim.getPlayerState('player_1');
    p1Flee.ore = 2000;
    p1Flee.crystal = 1000;
    expect(
      fleeSim.submitCommand({
        type: 'BUILD_DEEP_SPACE_STRUCTURE',
        playerId: 'player_1',
        systemId: 'system_starter_1',
        position: { x: 420, z: 200 },
        structureId: 'logistics_hub',
      }).ok,
    ).toBe(true);
    fleeSim.stepTick(21);

    expect(
      fleeSim.submitCommand({
        type: 'CREATE_FLEET',
        playerId: 'player_1',
        rallySystemId: 'system_starter_1',
        rallyPosition: { x: 520, z: 200 },
      }).ok,
    ).toBe(true);
    const fleeingFleet = fleeSim.getFleetsForPlayer('player_1')[0]!;
    const ddFlee = fleeSim.spawnCombatShipDirect(
      'player_1',
      'system_starter_1',
      { x: 520, z: 200 },
      'destroyer',
      'aggressive',
      null,
      fleeingFleet.id,
    );
    const dnFlee = fleeSim.spawnCombatShipDirect(
      'player_1',
      'system_starter_1',
      { x: 530, z: 210 },
      'dreadnought',
      'aggressive',
      null,
      fleeingFleet.id,
    );

    expect(
      fleeSim.submitCommand({
        type: 'ORDER_FLEET_FLEE',
        playerId: 'player_1',
        fleetId: fleeingFleet.id,
      }).ok,
    ).toBe(true);
    expect(fleeingFleet.orderType).toBe('flee');
    // Nearest sanctuary is the completed Logistics Hub at (420, 200), closer than Homeworld C&C at (0, 0)
    expect(fleeingFleet.orderPosition).toEqual({ x: 420, z: 200 });
    expect(ddFlee.isFleeing).toBe(true);
    expect(dnFlee.isFleeing).toBe(true);

    // Destroyer runs at full 68 u/s (faster than Dreadnought's 18 u/s) and clears isFleeing on arrival
    const ddStartX = ddFlee.position.x;
    const dnStartX = dnFlee.position.x;
    fleeSim.stepTick(1.0);
    expect(ddStartX - ddFlee.position.x).toBeGreaterThan(dnStartX - dnFlee.position.x + 30);
    for (let i = 0; i < 15; i++) {
      fleeSim.stepTick(0.5);
    }
    expect(ddFlee.isFleeing).toBe(false);

    // 9. Inter-ship separation keeps neighboring combat hulls from overlapping/merging in flight & formation
    const sepSim = new GameSimulation('blitz_skirmish');
    const crA = sepSim.spawnCombatShipDirect(
      'player_1',
      'system_central_hub',
      { x: 350, z: 350 },
      'cruiser',
      'hold_the_line',
    );
    const crB = sepSim.spawnCombatShipDirect(
      'player_1',
      'system_central_hub',
      { x: 350, z: 350 },
      'cruiser',
      'hold_the_line',
    );
    for (let i = 0; i < 6; i++) {
      sepSim.stepTick(0.25);
    }
    const sepDist = Math.hypot(
      crA.position.x - crB.position.x,
      crA.position.z - crB.position.z,
    );
    // Two Cruisers (10u clearance radius each -> 20u combined clearance) separate cleanly without clipping
    expect(sepDist).toBeGreaterThanOrEqual(19.0);

    // 10. Fleet Focus Anchor focuses on the single ship or majority spatial cluster (no drift from distant reinforcements)
    const anchorSim = new GameSimulation('blitz_skirmish');
    expect(
      anchorSim.submitCommand({
        type: 'CREATE_FLEET',
        playerId: 'player_1',
        rallySystemId: 'system_starter_1',
        rallyPosition: { x: 500, z: 500 },
      }).ok,
    ).toBe(true);
    const anchorFleet = anchorSim.getFleetsForPlayer('player_1')[0]!;
    anchorSim.spawnCombatShipDirect(
      'player_1',
      'system_starter_1',
      { x: 500, z: 500 },
      'cruiser',
      'hold_the_line',
      null,
      anchorFleet.id,
    );
    // Single ship -> exact ship position
    expect(anchorSim.getFleetLiveAnchor(anchorFleet.id)?.position).toEqual({ x: 500, z: 500 });

    // Add 2 more ships to the main cluster + 1 distant reinforcement en route at (50, 50)
    anchorSim.spawnCombatShipDirect(
      'player_1',
      'system_starter_1',
      { x: 520, z: 500 },
      'cruiser',
      'hold_the_line',
      null,
      anchorFleet.id,
    );
    anchorSim.spawnCombatShipDirect(
      'player_1',
      'system_starter_1',
      { x: 510, z: 520 },
      'destroyer',
      'hold_the_line',
      null,
      anchorFleet.id,
    );
    anchorSim.spawnCombatShipDirect(
      'player_1',
      'system_starter_1',
      { x: 50, z: 50 },
      'destroyer',
      'hold_the_line',
      null,
      anchorFleet.id,
    );
    const clusterAnchor = anchorSim.getFleetLiveAnchor(anchorFleet.id);
    expect(clusterAnchor?.systemId).toBe('system_starter_1');
    expect(clusterAnchor!.position.x).toBeCloseTo(510, 1);
    expect(clusterAnchor!.position.z).toBeCloseTo(506.67, 1);
  });

  it('leaves empty player slot starter systems and wormholes intact with unclaimed colonizable Large homeworlds', () => {
    const normalized = normalizeMatchSetupConfig({
      presetId: 'standard_tactical',
      slots: {
        player_1: { kind: 'empty' },
        player_2: { kind: 'empty' },
        player_3: { kind: 'empty' },
        player_4: { kind: 'empty' },
      },
    });
    expect(normalized.slots.player_1.kind).toBe('human');

    const sim = new GameSimulation({
      presetId: 'blitz_skirmish',
      slots: {
        player_1: { kind: 'human' },
        player_2: { kind: 'ai', difficulty: 'admiral' },
        player_3: { kind: 'empty' },
        player_4: { kind: 'empty' },
      },
    });

    expect(sim.isPlayerSlotActive('player_1')).toBe(true);
    expect(sim.isPlayerSlotActive('player_2')).toBe(true);
    expect(sim.isPlayerSlotActive('player_3')).toBe(false);
    expect(sim.isPlayerSlotActive('player_4')).toBe(false);
    expect(sim.getMatchOutcome().activeContenderIds).toEqual([
      'player_1',
      'player_2',
    ]);

    expect(
      sim.galaxy.wormholes.some((w) => w.fromSystemId === 'system_starter_4'),
    ).toBe(true);
    const emptyHomeworld = sim.getPlanetState('system_starter_4_homeworld');
    expect(emptyHomeworld.ownerId).toBeNull();
    expect(emptyHomeworld.structures).toHaveLength(0);
    expect(
      sim.getAllHarvesters().filter((h) => h.ownerId === 'player_4'),
    ).toHaveLength(0);

    const claimAttemptWithoutOutpost = sim.submitCommand({
      type: 'BUILD_ORBITAL_STRUCTURE',
      playerId: 'player_1',
      planetId: 'system_starter_4_homeworld',
      slotIndex: 0,
      structureId: 'refinery',
    });
    expect(claimAttemptWithoutOutpost.ok).toBe(false);

    const outpostClaim = sim.submitCommand({
      type: 'BUILD_ORBITAL_STRUCTURE',
      playerId: 'player_1',
      planetId: 'system_starter_4_homeworld',
      slotIndex: 0,
      structureId: 'planetary_outpost',
    });
    expect(outpostClaim.ok).toBe(true);
    expect(emptyHomeworld.ownerId).toBe('player_1');

    const refineryOnEmptyHomeworld = sim.submitCommand({
      type: 'BUILD_ORBITAL_STRUCTURE',
      playerId: 'player_1',
      planetId: 'system_starter_4_homeworld',
      slotIndex: 1,
      structureId: 'refinery',
    });
    expect(refineryOnEmptyHomeworld.ok).toBe(true);
  });

  it('tracks Last Command & Control Standing victory and defeat transitions across active contenders', () => {
    const victorySim = new GameSimulation({
      presetId: 'standard_tactical',
      localPlayerId: 'player_1',
      slots: {
        player_1: { kind: 'human' },
        player_2: { kind: 'ai', difficulty: 'standard' },
        player_3: { kind: 'empty' },
        player_4: { kind: 'empty' },
      },
    });
    expect(victorySim.getMatchOutcome().status).toBe('in_progress');

    const p2Home = victorySim.getPlanetState('system_starter_2_homeworld');
    const p2Cnc = p2Home.structures.find(
      (s) => s.structureId === 'command_and_control',
    )!;
    expect(victorySim.destroyOrbitalStructure(p2Cnc.id)).toBe(true);

    const wonOutcome = victorySim.getMatchOutcome();
    expect(wonOutcome.status).toBe('victory');
    expect(wonOutcome.winnerId).toBe('player_1');
    expect(wonOutcome.victoryCondition).toBe('last_cnc_standing');

    const defeatSim = new GameSimulation({
      presetId: 'standard_tactical',
      localPlayerId: 'player_1',
      slots: {
        player_1: { kind: 'human' },
        player_2: { kind: 'ai', difficulty: 'admiral' },
        player_3: { kind: 'empty' },
        player_4: { kind: 'empty' },
      },
    });
    const p1Home = defeatSim.getPlanetState('system_starter_1_homeworld');
    const p1Cnc = p1Home.structures.find(
      (s) => s.structureId === 'command_and_control',
    )!;
    expect(defeatSim.destroyOrbitalStructure(p1Cnc.id)).toBe(true);

    const lostOutcome = defeatSim.getMatchOutcome();
    expect(lostOutcome.status).toBe('defeat');
    expect(lostOutcome.winnerId).toBe('player_2');
    expect(lostOutcome.victoryCondition).toBe('last_cnc_standing');
  });

  it('tracks Grand Conquest 600s Central Super-Earth King of the Hill timer, contest pause, structure loss reset, and victory', () => {
    const sim = new GameSimulation({
      presetId: 'grand_conquest',
      localPlayerId: 'player_1',
      slots: {
        player_1: { kind: 'human' },
        player_2: { kind: 'ai', difficulty: 'standard' },
        player_3: { kind: 'empty' },
        player_4: { kind: 'empty' },
      },
    });

    const p1 = sim.getPlayerState('player_1');
    p1.ore = 2000;
    p1.crystal = 1000;

    expect(sim.getMatchOutcome().kingOfTheHill.enabled).toBe(true);
    expect(sim.getMatchOutcome().kingOfTheHill.requiredSeconds).toBe(600);

    expect(
      sim.submitCommand({
        type: 'BUILD_ORBITAL_STRUCTURE',
        playerId: 'player_1',
        planetId: CENTRAL_SUPER_EARTH_PLANET_ID,
        slotIndex: 0,
        structureId: 'planetary_outpost',
      }).ok,
    ).toBe(true);

    sim.stepTick(25);
    expect(sim.getMatchOutcome().kingOfTheHill.controllerId).toBe('player_1');

    sim.stepTick(250);
    expect(sim.getMatchOutcome().kingOfTheHill.heldSeconds).toBeCloseTo(250, 2);
    expect(sim.getMatchOutcome().kingOfTheHill.remainingSeconds).toBeCloseTo(
      350,
      2,
    );

    const intruder = sim.spawnCombatShipDirect(
      'player_2',
      'system_central_hub',
      { x: 260, z: 0 },
      'destroyer',
      'passive',
    );
    sim.stepTick(40);
    expect(sim.getMatchOutcome().kingOfTheHill.isContested).toBe(true);
    expect(sim.getMatchOutcome().kingOfTheHill.heldSeconds).toBeCloseTo(250, 2);

    expect(sim.destroyCombatShip(intruder.id)).toBe(true);
    sim.stepTick(50);
    expect(sim.getMatchOutcome().kingOfTheHill.isContested).toBe(false);
    expect(sim.getMatchOutcome().kingOfTheHill.heldSeconds).toBeCloseTo(300, 2);

    const superEarth = sim.getPlanetState(CENTRAL_SUPER_EARTH_PLANET_ID);
    const outpost = superEarth.structures[0]!;
    expect(sim.destroyOrbitalStructure(outpost.id)).toBe(true);
    expect(sim.getMatchOutcome().kingOfTheHill.controllerId).toBeNull();
    expect(sim.getMatchOutcome().kingOfTheHill.heldSeconds).toBe(0);

    expect(
      sim.submitCommand({
        type: 'BUILD_ORBITAL_STRUCTURE',
        playerId: 'player_1',
        planetId: CENTRAL_SUPER_EARTH_PLANET_ID,
        slotIndex: 0,
        structureId: 'planetary_outpost',
      }).ok,
    ).toBe(true);
    sim.stepTick(25);
    sim.stepTick(600);

    const finalOutcome = sim.getMatchOutcome();
    expect(finalOutcome.status).toBe('victory');
    expect(finalOutcome.winnerId).toBe('player_1');
    expect(finalOutcome.victoryCondition).toBe('king_of_the_hill');
    expect(finalOutcome.kingOfTheHill.remainingSeconds).toBe(0);
  });

  it('cancels under-construction orbital platforms with 100% refund and decommissions completed platforms with 50% salvage', () => {
    const sim = new GameSimulation('blitz_skirmish');
    const homeworld = sim.getPlanetState('system_starter_1_homeworld');
    const p1 = sim.getPlayerState('player_1');

    const startOre = p1.ore;
    const startCrystal = p1.crystal;

    // 1. Build an Orbital Dockyard and cancel before completion -> 100% refund & slots freed
    expect(
      sim.submitCommand({
        type: 'BUILD_ORBITAL_STRUCTURE',
        playerId: 'player_1',
        planetId: homeworld.planet.id,
        slotIndex: 2,
        structureId: 'orbital_dockyard',
      }).ok,
    ).toBe(true);

    const dockyard = homeworld.structures.find(
      (s) => s.structureId === 'orbital_dockyard',
    )!;
    expect(dockyard.isComplete).toBe(false);
    expect(p1.ore).toBe(startOre - ORBITAL_STRUCTURES.orbital_dockyard.cost.ore);

    // Cannot decommission while still under construction
    expect(
      sim.submitCommand({
        type: 'DECOMMISSION_ORBITAL_STRUCTURE',
        playerId: 'player_1',
        structureId: dockyard.id,
      }).ok,
    ).toBe(false);

    expect(
      sim.submitCommand({
        type: 'CANCEL_ORBITAL_STRUCTURE',
        playerId: 'player_1',
        structureId: dockyard.id,
      }).ok,
    ).toBe(true);

    expect(p1.ore).toBe(startOre);
    expect(p1.crystal).toBe(startCrystal);
    expect(
      homeworld.structures.some((s) => s.id === dockyard.id),
    ).toBe(false);

    // 2. Build and complete a Tech Module, then decommission -> 50% salvage & tech/supply reverted
    const supplyBeforeTech = p1.supplyCap;
    expect(
      sim.submitCommand({
        type: 'BUILD_ORBITAL_STRUCTURE',
        playerId: 'player_1',
        planetId: homeworld.planet.id,
        slotIndex: 2,
        structureId: 'tech_module',
      }).ok,
    ).toBe(true);

    sim.stepTick(ORBITAL_STRUCTURES.tech_module.buildTimeSeconds);
    const techMod = homeworld.structures.find(
      (s) => s.structureId === 'tech_module',
    )!;
    expect(techMod.isComplete).toBe(true);
    expect(p1.techModulesCompleted).toBe(1);
    expect(p1.supplyCap).toBe(
      supplyBeforeTech + ORBITAL_STRUCTURES.tech_module.supplyProvided,
    );

    // Cannot cancel once complete
    expect(
      sim.submitCommand({
        type: 'CANCEL_ORBITAL_STRUCTURE',
        playerId: 'player_1',
        structureId: techMod.id,
      }).ok,
    ).toBe(false);

    const oreBeforeDecomm = p1.ore;
    const crystalBeforeDecomm = p1.crystal;
    expect(
      sim.submitCommand({
        type: 'DECOMMISSION_ORBITAL_STRUCTURE',
        playerId: 'player_1',
        structureId: techMod.id,
      }).ok,
    ).toBe(true);

    expect(p1.ore).toBe(
      oreBeforeDecomm + Math.round(ORBITAL_STRUCTURES.tech_module.cost.ore * 0.5),
    );
    expect(p1.crystal).toBe(
      crystalBeforeDecomm +
        Math.round(ORBITAL_STRUCTURES.tech_module.cost.crystal * 0.5),
    );
    expect(p1.techModulesCompleted).toBe(0);
    expect(p1.supplyCap).toBe(supplyBeforeTech);
    expect(
      homeworld.structures.some((s) => s.id === techMod.id),
    ).toBe(false);

    // 3. Command & Control cannot be decommissioned
    const cnc = homeworld.structures.find(
      (s) => s.structureId === 'command_and_control',
    )!;
    expect(
      sim.submitCommand({
        type: 'DECOMMISSION_ORBITAL_STRUCTURE',
        playerId: 'player_1',
        structureId: cnc.id,
      }).ok,
    ).toBe(false);
  });
});
