import { describe, expect, it } from 'vitest';
import {
  GameSimulation,
  HARVESTER_CARGO_CAPACITY,
  HARVESTER_EMPTY_SPEED,
  HARVESTER_FULL_SPEED,
  HARVESTER_MINING_DURATION_SECONDS,
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
    expect(homeworldState.structures[0]?.structureId).toBe('command_and_control');
    expect(homeworldState.structures[0]?.occupiedSlots).toEqual([0, 1]);

    const p1Harvesters = sim
      .getAllHarvesters()
      .filter((h) => h.ownerId === 'player_1');
    expect(p1Harvesters).toHaveLength(1);
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

  it('enforces 2-slot occupancy, spawns a free Harvester when a Refinery completes, and allows paid Harvesters', () => {
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

    const p1HarvestersAfterRefinery = sim
      .getAllHarvesters()
      .filter((h) => h.ownerId === 'player_1');
    expect(p1HarvestersAfterRefinery).toHaveLength(2);

    const queueRes = sim.submitCommand({
      type: 'QUEUE_SHIP',
      playerId: 'player_1',
      dockyardOrRefineryId: homeworldId,
      shipClassId: 'harvester',
      autoRepeat: false,
    });
    expect(queueRes.ok).toBe(true);

    const p1HarvestersAfterQueue = sim
      .getAllHarvesters()
      .filter((h) => h.ownerId === 'player_1');
    expect(p1HarvestersAfterQueue).toHaveLength(3);
  });

  it('enforces Harvester empty vs full speed, 10–15s mining duration for 40 cargo, and single-rock tracking', () => {
    expect(HARVESTER_CARGO_CAPACITY).toBe(40);
    expect(HARVESTER_MINING_DURATION_SECONDS).toBeGreaterThanOrEqual(10);
    expect(HARVESTER_MINING_DURATION_SECONDS).toBeLessThanOrEqual(15);
    expect(HARVESTER_EMPTY_SPEED).toBeCloseTo(41.325, 2);
    expect(HARVESTER_FULL_SPEED).toBeCloseTo(27.55, 2);

    const sim = new GameSimulation('standard_tactical');
    const p1 = sim.getPlayerState('player_1');
    const initialTotalResources = p1.ore + p1.crystal;
    const h = sim.getAllHarvesters().find((u) => u.ownerId === 'player_1');
    expect(h).toBeDefined();
    expect(h?.currentSpeed).toBeCloseTo(HARVESTER_EMPTY_SPEED, 2);

    let observedMiningState = false;
    let observedReturnFullSpeed = false;

    for (let i = 0; i < 65; i++) {
      sim.stepTick(1.0);
      if (h?.state === 'mining') {
        observedMiningState = true;
        expect(h.targetRockWorldPos).not.toBeNull();
      }
      if (h?.state === 'returning_to_dropoff' && h.cargoAmount >= 40) {
        observedReturnFullSpeed = true;
        expect(h.currentSpeed).toBeCloseTo(HARVESTER_FULL_SPEED, 2);
      }
    }

    expect(observedMiningState).toBe(true);
    expect(observedReturnFullSpeed).toBe(true);
    expect(p1.ore + p1.crystal).toBeGreaterThan(initialTotalResources);
  });
});
