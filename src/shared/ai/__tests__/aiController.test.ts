import { describe, expect, it } from 'vitest';
import { AI_DIFFICULTY_PROFILES } from '../../config/index.ts';
import {
  CENTRAL_SUPER_EARTH_PLANET_ID,
  GameSimulation,
} from '../../sim/gameSimulation.ts';
import {
  StandardAIBot,
  buildAIBotRuntimeSnapshot,
  computeDesiredAIFleetTemplate,
  evaluateAIBotCommands,
  findAvailableOrbitalSlot,
  findValidDeepSpaceBuildPosition,
} from '../aiController.ts';

describe('Table-Driven Macro AI Controller', () => {
  it('finds valid 1-slot and 2-slot orbital slots and rejects isolated 1-slot gaps for 2-slot structures', () => {
    const sim = new GameSimulation('blitz_skirmish');
    const p1 = sim.getPlayerState('player_1');
    p1.ore = 5000;
    p1.crystal = 5000;

    const smallPlanet = sim
      .getPlanetsInSystem('system_starter_1')
      .find((p) => p.planet.orbitalSlots === 6)!;

    expect(findAvailableOrbitalSlot(smallPlanet, 1)).toBe(0);
    expect(findAvailableOrbitalSlot(smallPlanet, 2)).toBe(0);

    expect(
      sim.submitCommand({
        type: 'BUILD_ORBITAL_STRUCTURE',
        playerId: 'player_1',
        planetId: smallPlanet.planet.id,
        slotIndex: 0,
        structureId: 'planetary_outpost',
      }).ok,
    ).toBe(true);

    for (const idx of [2, 4]) {
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

    expect(findAvailableOrbitalSlot(smallPlanet, 1)).toBe(1);
    expect(findAvailableOrbitalSlot(smallPlanet, 2)).toBeNull();
  });

  it('shifts desired fleet templates across the 5-class RPS counter matrix based on observed enemy hulls', () => {
    const sim = new GameSimulation('blitz_skirmish');
    const p2 = sim.getPlayerState('player_2');
    p2.techModulesCompleted = 2;

    const baseSnapshot = buildAIBotRuntimeSnapshot(
      sim.galaxy,
      sim,
      'player_2',
    );
    const baseTemplate = computeDesiredAIFleetTemplate(
      baseSnapshot,
      AI_DIFFICULTY_PROFILES.standard,
    );
    expect(baseTemplate.carrier).toBe(1);
    expect(baseTemplate.cruiser).toBe(3);
    expect(baseTemplate.dreadnought).toBe(1);

    sim.spawnCombatShipDirect(
      'player_1',
      'system_central_hub',
      { x: 200, z: 200 },
      'dreadnought',
    );
    sim.spawnCombatShipDirect(
      'player_1',
      'system_central_hub',
      { x: 230, z: 200 },
      'dreadnought',
    );
    const antiDreadSnapshot = buildAIBotRuntimeSnapshot(
      sim.galaxy,
      sim,
      'player_2',
    );
    const antiDreadTemplate = computeDesiredAIFleetTemplate(
      antiDreadSnapshot,
      AI_DIFFICULTY_PROFILES.standard,
    );
    expect(antiDreadTemplate.carrier).toBeGreaterThan(baseTemplate.carrier);

    for (let i = 0; i < 6; i++) {
      sim.spawnCombatShipDirect(
        'player_1',
        'system_central_hub',
        { x: 260 + i * 8, z: 220 },
        'fighter',
      );
    }
    const antiFighterSnapshot = buildAIBotRuntimeSnapshot(
      sim.galaxy,
      sim,
      'player_2',
    );
    const antiFighterTemplate = computeDesiredAIFleetTemplate(
      antiFighterSnapshot,
      AI_DIFFICULTY_PROFILES.standard,
    );
    expect(antiFighterTemplate.cruiser).toBeGreaterThan(baseTemplate.cruiser);

    for (let i = 0; i < 4; i++) {
      sim.spawnCombatShipDirect(
        'player_1',
        'system_central_hub',
        { x: 300 + i * 15, z: 260 },
        'cruiser',
      );
    }
    const antiCruiserSnapshot = buildAIBotRuntimeSnapshot(
      sim.galaxy,
      sim,
      'player_2',
    );
    const antiCruiserTemplate = computeDesiredAIFleetTemplate(
      antiCruiserSnapshot,
      AI_DIFFICULTY_PROFILES.standard,
    );
    expect(antiCruiserTemplate.dreadnought).toBeGreaterThan(
      baseTemplate.dreadnought,
    );
  });

  it('finds valid deep-space build coordinates for Logistics Hubs and tethered Defence Towers', () => {
    const sim = new GameSimulation('blitz_skirmish');
    const p2 = sim.getPlayerState('player_2');
    p2.ore = 3000;
    p2.crystal = 2000;

    const wh = sim.galaxy.wormholes.find(
      (w) => w.fromSystemId === 'system_starter_2',
    )!;
    const anchor = {
      x: wh.fromPosition.x * 0.72,
      z: wh.fromPosition.z * 0.72,
    };

    const hubPos = findValidDeepSpaceBuildPosition(
      sim,
      'player_2',
      'system_starter_2',
      anchor,
      'logistics_hub',
      48,
      240,
    );
    expect(hubPos).not.toBeNull();
    expect(
      sim.submitCommand({
        type: 'BUILD_DEEP_SPACE_STRUCTURE',
        playerId: 'player_2',
        systemId: 'system_starter_2',
        position: hubPos!,
        structureId: 'logistics_hub',
      }).ok,
    ).toBe(true);

    sim.stepTick(21);

    const towerPos = findValidDeepSpaceBuildPosition(
      sim,
      'player_2',
      'system_starter_2',
      hubPos!,
      'point_defence_tower',
      46,
      165,
    );
    expect(towerPos).not.toBeNull();
    expect(
      sim.submitCommand({
        type: 'BUILD_DEEP_SPACE_STRUCTURE',
        playerId: 'player_2',
        systemId: 'system_starter_2',
        position: towerPos!,
        structureId: 'point_defence_tower',
      }).ok,
    ).toBe(true);
  });

  it('executes full macro economy, orbital expansion, deep-space fortification, and fleet combat via GameCommands', () => {
    const sim = new GameSimulation({
      presetId: 'blitz_skirmish',
      slots: {
        player_1: { kind: 'ai', difficulty: 'admiral' },
        player_2: { kind: 'ai', difficulty: 'standard' },
        player_3: { kind: 'ai', difficulty: 'cadet' },
        player_4: { kind: 'empty' },
      },
    });

    const bots = [
      new StandardAIBot('player_1', 'admiral'),
      new StandardAIBot('player_2', 'standard'),
      new StandardAIBot('player_3', 'cadet'),
    ];

    for (const bot of bots) {
      const p = sim.getPlayerState(bot.playerId);
      p.ore = 4500;
      p.crystal = 3500;
    }

    const commandCountsByType = new Map<string, number>();

    for (let tick = 0; tick < 360; tick++) {
      sim.stepTick(1.0);
      for (const bot of bots) {
        const cmds = bot.decideNextCommands(sim.galaxy, sim.currentTick, sim);
        for (const cmd of cmds) {
          const res = sim.submitCommand(cmd);
          expect(res.ok).toBe(true);
          commandCountsByType.set(
            cmd.type,
            (commandCountsByType.get(cmd.type) ?? 0) + 1,
          );
        }
      }
    }

    expect(
      commandCountsByType.get('BUILD_ORBITAL_STRUCTURE') ?? 0,
    ).toBeGreaterThan(6);
    expect(
      commandCountsByType.get('BUILD_DEEP_SPACE_STRUCTURE') ?? 0,
    ).toBeGreaterThan(1);
    expect(commandCountsByType.get('CREATE_FLEET') ?? 0).toBeGreaterThanOrEqual(
      3,
    );
    expect(
      commandCountsByType.get('UPDATE_FLEET_TEMPLATE') ?? 0,
    ).toBeGreaterThanOrEqual(3);

    const p1Snap = buildAIBotRuntimeSnapshot(sim.galaxy, sim, 'player_1');
    expect(p1Snap.structureCounts.refinery).toBeGreaterThanOrEqual(2);
    expect(p1Snap.structureCounts.orbital_dockyard).toBeGreaterThanOrEqual(1);
    expect(p1Snap.structureCounts.tech_module).toBeGreaterThanOrEqual(1);
    expect(p1Snap.ownedPlanets.length).toBeGreaterThan(1);
    expect(p1Snap.harvesterCount).toBeGreaterThan(2);

    const superEarth = sim.getPlanetState(CENTRAL_SUPER_EARTH_PLANET_ID);
    expect(superEarth.ownerId).not.toBeNull();

    const p1DeepSpace = [
      ...sim.getDeepSpaceStructuresInSystem('system_starter_1'),
      ...sim.getDeepSpaceStructuresInSystem('system_central_hub'),
    ].filter((ds) => ds.ownerId === 'player_1');
    expect(
      p1DeepSpace.some((ds) => ds.structureId === 'logistics_hub'),
    ).toBe(true);
    expect(
      p1DeepSpace.some(
        (ds) =>
          ds.structureId === 'point_defence_tower' ||
          ds.structureId === 'hull_breaker_tower',
      ),
    ).toBe(true);

    expect(sim.getAllCombatShips().length).toBeGreaterThan(4);

    sim.spawnCombatShipDirect(
      'player_1',
      'system_starter_2',
      { x: 240, z: -180 },
      'cruiser',
      'aggressive',
    );
    const defenseCmds = evaluateAIBotCommands(
      sim.galaxy,
      sim,
      'player_2',
      AI_DIFFICULTY_PROFILES.standard,
    );
    expect(
      defenseCmds.some(
        (c) =>
          c.type === 'ORDER_FLEET_ATTACK' &&
          c.targetSystemId === 'system_starter_2',
      ),
    ).toBe(true);
  });

  it('keeps Cadet AI defensive in its home system during Guided Tutorial until provoked', () => {
    const sim = new GameSimulation('tutorial');
    const p2 = sim.getPlayerState('player_2');
    p2.ore = 0;
    p2.crystal = 0;

    expect(
      sim.submitCommand({
        type: 'CREATE_FLEET',
        playerId: 'player_2',
        rallySystemId: 'system_starter_2',
        rallyPosition: { x: 180, z: 120 },
        stance: 'aggressive',
      }).ok,
    ).toBe(true);
    const fleet = sim.getFleetsForPlayer('player_2')[0]!;
    for (let i = 0; i < 4; i++) {
      const ship = sim.spawnCombatShipDirect(
        'player_2',
        'system_starter_2',
        { x: 180 + i * 15, z: 120 },
        'destroyer',
        'aggressive',
      );
      ship.fleetId = fleet.id;
    }

    // Unprovoked in Guided Tutorial: Cadet AI must NOT issue offensive orders outside its home system
    const unprovokedCmds = evaluateAIBotCommands(
      sim.galaxy,
      sim,
      'player_2',
      AI_DIFFICULTY_PROFILES.cadet,
    );
    const offensiveCmds = unprovokedCmds.filter(
      (c) =>
        (c.type === 'ORDER_FLEET_ATTACK' || c.type === 'ORDER_FLEET_MOVE') &&
        c.targetSystemId !== 'system_starter_2',
    );
    expect(offensiveCmds).toHaveLength(0);

    // Once player enters Sector 2, Cadet AI defends its home system immediately
    sim.spawnCombatShipDirect(
      'player_1',
      'system_starter_2',
      { x: 300, z: 0 },
      'cruiser',
      'aggressive',
    );
    const provokedCmds = evaluateAIBotCommands(
      sim.galaxy,
      sim,
      'player_2',
      AI_DIFFICULTY_PROFILES.cadet,
    );
    expect(
      provokedCmds.some(
        (c) =>
          c.type === 'ORDER_FLEET_ATTACK' &&
          c.targetSystemId === 'system_starter_2',
      ),
    ).toBe(true);
  });
});

