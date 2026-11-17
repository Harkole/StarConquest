import { describe, expect, it } from 'vitest';
import { GameSimulation } from '../gameSimulation.ts';

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

    // Cannot build a Refinery on an unclaimed planet before claiming it with an Outpost
    const blockedRes = sim.submitCommand({
      type: 'BUILD_ORBITAL_STRUCTURE',
      playerId: 'player_1',
      planetId: superEarthId,
      slotIndex: 0,
      structureId: 'refinery',
    });
    expect(blockedRes.ok).toBe(false);

    // Building a 1-slot Planetary Outpost claims the Super-Earth
    const claimRes = sim.submitCommand({
      type: 'BUILD_ORBITAL_STRUCTURE',
      playerId: 'player_1',
      planetId: superEarthId,
      slotIndex: 0,
      structureId: 'planetary_outpost',
    });
    expect(claimRes.ok).toBe(true);
    expect(sim.getPlanetState(superEarthId).ownerId).toBe('player_1');

    // Now building a Refinery on slot 1 succeeds
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

    // Slot 1 is occupied by C&C (0, 1), so building a 2-slot Dockyard on slot 1 must fail
    const overlapRes = sim.submitCommand({
      type: 'BUILD_ORBITAL_STRUCTURE',
      playerId: 'player_1',
      planetId: homeworldId,
      slotIndex: 1,
      structureId: 'orbital_dockyard',
    });
    expect(overlapRes.ok).toBe(false);

    // Build a 1-slot Refinery on slot 2
    const refRes = sim.submitCommand({
      type: 'BUILD_ORBITAL_STRUCTURE',
      playerId: 'player_1',
      planetId: homeworldId,
      slotIndex: 2,
      structureId: 'refinery',
    });
    expect(refRes.ok).toBe(true);

    // Advance 25 seconds to complete the Refinery (20s build time)
    sim.stepTick(25);

    const p1HarvestersAfterRefinery = sim
      .getAllHarvesters()
      .filter((h) => h.ownerId === 'player_1');
    expect(p1HarvestersAfterRefinery).toHaveLength(2);

    // Queue an extra paid Harvester at the Homeworld
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

  it('runs the automated Harvester mining loop and deposits Ore and Crystals', () => {
    const sim = new GameSimulation('blitz_skirmish');
    const p1 = sim.getPlayerState('player_1');
    const initialTotalResources = p1.ore + p1.crystal;

    // Simulate 60 seconds in 1-second ticks so the Harvester flies to belt, mines, and returns
    for (let i = 0; i < 60; i++) {
      sim.stepTick(1.0);
    }

    const updatedTotalResources = p1.ore + p1.crystal;
    expect(updatedTotalResources).toBeGreaterThan(initialTotalResources);
  });
});
