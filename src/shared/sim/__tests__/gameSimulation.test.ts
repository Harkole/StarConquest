import { describe, expect, it } from 'vitest';
import {
  CENTRAL_HUB_ENRICHED_MINING_MULTIPLIER,
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
});
