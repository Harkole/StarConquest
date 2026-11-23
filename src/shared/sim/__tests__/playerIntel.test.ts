import { describe, expect, it } from 'vitest';
import { GameSimulation } from '../gameSimulation.ts';

describe('PlayerIntelRegistry & Fog of War', () => {
  it('enforces open_occupied_systems in blitz_skirmish: occupied systems are fully visible, unoccupied systems hide hostiles and depletion', () => {
    const sim = new GameSimulation('blitz_skirmish');

    const p1HomeView = sim.getPlayerSystemView('player_1', 'system_starter_1');
    expect(p1HomeView.fogMode).toBe('open_occupied_systems');
    expect(p1HomeView.coverage.kind).toBe('full_system');
    expect(p1HomeView.isExplored).toBe(true);
    expect(p1HomeView.resourceSummary).not.toBeNull();

    const intruder = sim.spawnCombatShipDirect(
      'player_2',
      'system_starter_1',
      { x: 1600, z: 1600 },
      'destroyer',
    );
    const homeWithIntruder = sim.getPlayerSystemView('player_1', 'system_starter_1');
    expect(homeWithIntruder.combatShips.some((s) => s.id === intruder.id)).toBe(true);

    const p2SystemView = sim.getPlayerSystemView('player_1', 'system_starter_2');
    expect(p2SystemView.coverage.kind).toBe('unexplored');
    expect(p2SystemView.isExplored).toBe(false);
    expect(p2SystemView.combatShips).toHaveLength(0);
    expect(p2SystemView.harvesters).toHaveLength(0);
    expect(p2SystemView.resourceSummary).toBeNull();
    expect(p2SystemView.planets.every((p) => p.visibility === 'unexplored' && p.structures.length === 0)).toBe(true);

    const p2Belts = sim.getMiningBeltsInSystem('system_starter_2');
    const targetBelt = p2Belts[0]!;
    targetBelt.remainingReserves = 0;
    const p2ViewAfterDepletion = sim.getPlayerSystemView('player_1', 'system_starter_2');
    const projectedBelt = p2ViewAfterDepletion.miningBelts.find((b) => b.belt.id === targetBelt.id);
    expect(projectedBelt?.visibility).toBe('unexplored');
    expect(projectedBelt?.observedRemainingReserves).toBe(targetBelt.initialReserves);

    sim.spawnCombatShipDirect('player_1', 'system_central_hub', { x: 0, z: 0 }, 'fighter');
    sim.stepTick(0.1);
    const hubView = sim.getPlayerSystemView('player_1', 'system_central_hub');
    expect(hubView.coverage.kind).toBe('full_system');
    expect(hubView.resourceSummary).not.toBeNull();
  });

  it('enforces sensor_range in standard_tactical and reveals entities/depletion when sensors enter range', () => {
    const sim = new GameSimulation('standard_tactical');

    const initialHome = sim.getPlayerSystemView('player_1', 'system_starter_1');
    expect(initialHome.fogMode).toBe('sensor_range');
    expect(initialHome.coverage.kind).toBe('circles');

    const farHostile = sim.spawnCombatShipDirect(
      'player_2',
      'system_starter_1',
      { x: 1400, z: -1200 },
      'cruiser',
    );
    sim.stepTick(0.1);

    expect(
      sim.getPlayerSystemView('player_1', 'system_starter_1').combatShips.some((s) => s.id === farHostile.id),
    ).toBe(false);

    const hubBelts = sim.getMiningBeltsInSystem('system_central_hub');
    const hubBelt = hubBelts[0]!;
    hubBelt.remainingReserves = 123;
    const hubUnexplored = sim.getPlayerSystemView('player_1', 'system_central_hub');
    expect(hubUnexplored.resourceSummary).toBeNull();
    expect(
      hubUnexplored.miningBelts.find((b) => b.belt.id === hubBelt.id)?.observedRemainingReserves,
    ).toBe(hubBelt.initialReserves);

    const scout = sim.spawnCombatShipDirect(
      'player_1',
      'system_starter_1',
      { x: 1350, z: -1200 },
      'destroyer',
    );
    sim.spawnCombatShipDirect(
      'player_1',
      'system_central_hub',
      { x: hubBelt.position.x, z: hubBelt.position.z },
      'destroyer',
    );
    sim.stepTick(0.1);

    const homeAfterScout = sim.getPlayerSystemView('player_1', 'system_starter_1');
    expect(homeAfterScout.combatShips.some((s) => s.id === farHostile.id)).toBe(true);
    expect(homeAfterScout.combatShips.some((s) => s.id === scout.id)).toBe(true);

    const hubAfterScout = sim.getPlayerSystemView('player_1', 'system_central_hub');
    const seenBelt = hubAfterScout.miningBelts.find((b) => b.belt.id === hubBelt.id);
    expect(seenBelt?.visibility).toBe('live');
    expect(seenBelt?.observedRemainingReserves).toBe(123);
    expect(hubAfterScout.resourceSummary).not.toBeNull();
  });

  it('maintains last-known-intel ghosts for orbital and deep-space structures and clears them only when sensors re-verify destruction', () => {
    const sim = new GameSimulation('standard_tactical');
    const p2 = sim.getPlayerState('player_2');
    p2.ore = 2000;
    p2.crystal = 1000;

    const hubBuild = sim.submitCommand({
      type: 'BUILD_DEEP_SPACE_STRUCTURE',
      playerId: 'player_2',
      systemId: 'system_central_hub',
      position: { x: 1200, z: 1200 },
      structureId: 'logistics_hub',
    });
    expect(hubBuild.ok).toBe(true);
    const hostileDs = sim.getDeepSpaceStructuresInSystem('system_central_hub')[0]!;

    const outpostBuild = sim.submitCommand({
      type: 'BUILD_ORBITAL_STRUCTURE',
      playerId: 'player_2',
      planetId: 'system_central_hub_lava_1',
      slotIndex: 0,
      structureId: 'planetary_outpost',
    });
    expect(outpostBuild.ok).toBe(true);

    const scout = sim.spawnCombatShipDirect(
      'player_1',
      'system_central_hub',
      { x: 960, z: 840 },
      'destroyer',
    );
    sim.stepTick(0.1);

    let view = sim.getPlayerSystemView('player_1', 'system_central_hub');
    let pyreView = view.planets.find((p) => p.planet.id === 'system_central_hub_lava_1')!;
    expect(pyreView.visibility).toBe('live');
    expect(pyreView.structures.some((s) => s.kind === 'live')).toBe(true);

    scout.position = { x: 1200, z: 1200 };
    scout.targetPosition = { x: 1200, z: 1200 };
    sim.stepTick(0.1);

    view = sim.getPlayerSystemView('player_1', 'system_central_hub');
    expect(view.deepSpaceStructures.some((s) => s.kind === 'live' && s.structure.id === hostileDs.id)).toBe(true);

    scout.position = { x: -1500, z: -1500 };
    scout.targetPosition = { x: -1500, z: -1500 };
    sim.stepTick(0.1);

    view = sim.getPlayerSystemView('player_1', 'system_central_hub');
    pyreView = view.planets.find((p) => p.planet.id === 'system_central_hub_lava_1')!;
    expect(pyreView.visibility).toBe('last_known');
    expect(pyreView.structures.some((s) => s.kind === 'ghost' && s.structureId === 'planetary_outpost')).toBe(true);

    const dsGhost = view.deepSpaceStructures.find((s) => s.kind === 'ghost' && s.id === hostileDs.id);
    expect(dsGhost).toBeDefined();

    hostileDs.hull = 0;
    const pyreState = sim.getPlanetState('system_central_hub_lava_1');
    const outpostId = pyreState.structures[0]!.id;
    sim.destroyOrbitalStructure(outpostId);
    sim.stepTick(0.1);

    view = sim.getPlayerSystemView('player_1', 'system_central_hub');
    expect(view.deepSpaceStructures.some((s) => s.kind === 'ghost' && s.id === hostileDs.id)).toBe(true);
    pyreView = view.planets.find((p) => p.planet.id === 'system_central_hub_lava_1')!;
    expect(pyreView.visibility).toBe('last_known');
    expect(pyreView.structures.some((s) => s.kind === 'ghost')).toBe(true);

    scout.position = { x: 960, z: 840 };
    scout.targetPosition = { x: 960, z: 840 };
    sim.stepTick(0.1);
    view = sim.getPlayerSystemView('player_1', 'system_central_hub');
    pyreView = view.planets.find((p) => p.planet.id === 'system_central_hub_lava_1')!;
    expect(pyreView.visibility).toBe('live');
    expect(pyreView.structures).toHaveLength(0);

    scout.position = { x: 1200, z: 1200 };
    scout.targetPosition = { x: 1200, z: 1200 };
    sim.stepTick(0.1);

    view = sim.getPlayerSystemView('player_1', 'system_central_hub');
    expect(
      view.deepSpaceStructures.some(
        (s) => (s.kind === 'live' ? s.structure.id : s.id) === hostileDs.id,
      ),
    ).toBe(false);
    pyreView = view.planets.find((p) => p.planet.id === 'system_central_hub_lava_1')!;
    expect(pyreView.visibility).toBe('last_known');
    expect(pyreView.structures).toHaveLength(0);
  });

  it('filters consumeCombatEvents(viewerId) to events visible to that player', () => {
    const sim = new GameSimulation('standard_tactical');

    sim.spawnCombatShipDirect('player_2', 'system_central_hub', { x: 1200, z: 1200 }, 'cruiser');
    sim.spawnCombatShipDirect('player_3', 'system_central_hub', { x: 1240, z: 1200 }, 'cruiser');

    for (let i = 0; i < 10; i++) {
      sim.stepTick(0.2);
    }

    const p1Events = sim.consumeCombatEvents('player_1');
    expect(p1Events).toHaveLength(0);
  });

  it('ORDER_FLEET_ATTACK pursues targetEntityId, focus-fires it over decoys, and clears attackTargetId on destruction', () => {
    const sim = new GameSimulation('blitz_skirmish');

    const fleetRes = sim.submitCommand({
      type: 'CREATE_FLEET',
      playerId: 'player_1',
      name: 'Strike Group',
      rallySystemId: 'system_central_hub',
      rallyPosition: { x: 0, z: 0 },
      stance: 'aggressive',
    });
    expect(fleetRes.ok).toBe(true);
    const fleet = sim.getFleetsForPlayer('player_1')[0]!;

    const attacker = sim.spawnCombatShipDirect(
      'player_1',
      'system_central_hub',
      { x: 0, z: 0 },
      'cruiser',
      'aggressive',
      null,
      fleet.id,
    );

    const decoy = sim.spawnCombatShipDirect(
      'player_2',
      'system_central_hub',
      { x: 70, z: 0 },
      'fighter',
    );
    const target = sim.spawnCombatShipDirect(
      'player_2',
      'system_central_hub',
      { x: 110, z: 0 },
      'carrier',
    );

    const attackCmd = sim.submitCommand({
      type: 'ORDER_FLEET_ATTACK',
      playerId: 'player_1',
      fleetId: fleet.id,
      targetSystemId: 'system_central_hub',
      targetPosition: { x: 110, z: 0 },
      targetEntityId: target.id,
    });
    expect(attackCmd.ok).toBe(true);
    expect(fleet.attackTargetId).toBe(target.id);

    target.position = { x: 120, z: 20 };
    sim.stepTick(0.1);

    expect(fleet.orderPosition.x).toBeCloseTo(120, 5);
    expect(fleet.orderPosition.z).toBeCloseTo(20, 5);
    expect(attacker.currentTargetId).toBe(target.id);
    expect(decoy.hull).toBeGreaterThan(0);

    target.hull = 0;
    sim.stepTick(0.1);
    expect(fleet.attackTargetId).toBeNull();
  });

  it('does not engage hostiles outside all friendly sensor rings in sensor_range mode', () => {
    const sim = new GameSimulation('standard_tactical');

    const aggressiveShip = sim.spawnCombatShipDirect(
      'player_1',
      'system_central_hub',
      { x: 0, z: 0 },
      'destroyer',
    );
    aggressiveShip.stance = 'aggressive';

    const hiddenHostile = sim.spawnCombatShipDirect(
      'player_2',
      'system_central_hub',
      { x: 900, z: 0 },
      'destroyer',
    );

    sim.stepTick(0.1);
    expect(aggressiveShip.inCombat).toBe(false);
    expect(aggressiveShip.currentTargetId).toBeNull();

    sim.spawnCombatShipDirect(
      'player_1',
      'system_central_hub',
      { x: 850, z: 0 },
      'fighter',
    );

    sim.stepTick(0.1);
    expect(aggressiveShip.inCombat).toBe(true);
    expect(aggressiveShip.currentTargetId).toBe(hiddenHostile.id);
  });
});
