import { describe, expect, it } from 'vitest';
import { GameSimulation } from '../../sim/gameSimulation.ts';
import { SnapshotSimulationView } from '../../sim/snapshotSimulationView.ts';
import {
  isStateSnapshot,
  parseP2PWireMessage,
  type P2PWireMessage,
  type StateSnapshot,
} from '../index.ts';

function createStandardTwoPlayerSim(): GameSimulation {
  return new GameSimulation({
    presetId: 'standard_tactical',
    localPlayerId: 'player_1',
    slots: {
      player_1: { kind: 'human' },
      player_2: { kind: 'human' },
      player_3: { kind: 'empty' },
      player_4: { kind: 'empty' },
    },
  });
}

describe('protocol StateSnapshot & P2PWireMessage', () => {
  it('buildStateSnapshot enforces per-player Fog of War and isolates economy/fleets/combatEvents', () => {
    const sim = createStandardTwoPlayerSim();

    // Player 1 creates a fleet in system_starter_1; Player 2 creates a fleet in system_starter_2
    const p1FleetRes = sim.submitCommand({
      type: 'CREATE_FLEET',
      playerId: 'player_1',
      name: 'Alpha Wing',
      rallySystemId: 'system_starter_1',
      rallyPosition: { x: 100, z: 100 },
    });
    expect(p1FleetRes.ok).toBe(true);

    const p2FleetRes = sim.submitCommand({
      type: 'CREATE_FLEET',
      playerId: 'player_2',
      name: 'Crimson Fleet',
      rallySystemId: 'system_starter_2',
      rallyPosition: { x: 100, z: 100 },
    });
    expect(p2FleetRes.ok).toBe(true);

    // Spawn an enemy ship in system_starter_2 (far outside player_1's sensors)
    const p2Ship = sim.spawnCombatShipDirect(
      'player_2',
      'system_starter_2',
      { x: 250, z: 250 },
      'destroyer',
    );
    expect(p2Ship.ownerId).toBe('player_2');

    // Also spawn a player_1 ship in system_starter_1
    const p1Ship = sim.spawnCombatShipDirect(
      'player_1',
      'system_starter_1',
      { x: 120, z: 120 },
      'cruiser',
    );
    expect(p1Ship.ownerId).toBe('player_1');

    // Step simulation so intel registry updates
    sim.stepTick(0.1);

    // Trigger combat events in system_starter_1
    const p1Intruder = sim.spawnCombatShipDirect(
      'player_2',
      'system_starter_1',
      { x: 140, z: 120 },
      'fighter',
    );
    expect(p1Intruder.ownerId).toBe('player_2');

    // Step a few ticks so weapon fire combat events are emitted in system_starter_1
    for (let i = 0; i < 15; i += 1) {
      sim.stepTick(0.1);
    }

    const drainedByViewer = sim.drainCombatEventsForViewers(['player_1', 'player_2']);
    const p1Events = drainedByViewer.get('player_1') ?? [];
    const p2Events = drainedByViewer.get('player_2') ?? [];

    // Subsequent drain must be empty since events were drained once
    const secondDrain = sim.drainCombatEventsForViewers(['player_1', 'player_2']);
    expect(secondDrain.get('player_1')).toEqual([]);
    expect(secondDrain.get('player_2')).toEqual([]);

    const snap1 = sim.buildStateSnapshot('player_1', p1Events);
    const snap2 = sim.buildStateSnapshot('player_2', p2Events);

    // Viewer economy & fleets are strictly isolated
    expect(snap1.viewerId).toBe('player_1');
    expect(snap1.viewerEconomy.playerId).toBe('player_1');
    expect(snap1.viewerFleets.every((f) => f.ownerId === 'player_1')).toBe(true);
    expect(snap1.viewerFleets.some((f) => f.name === 'Crimson Fleet')).toBe(false);

    expect(snap2.viewerId).toBe('player_2');
    expect(snap2.viewerEconomy.playerId).toBe('player_2');
    expect(snap2.viewerFleets.every((f) => f.ownerId === 'player_2')).toBe(true);
    expect(snap2.viewerFleets.some((f) => f.name === 'Alpha Wing')).toBe(false);

    // In sensor_range mode, player_1 must NOT see system_starter_2's ships or structures
    const p1ViewOfSys2 = snap1.systems['system_starter_2'];
    expect(p1ViewOfSys2).toBeDefined();
    expect(p1ViewOfSys2?.isExplored).toBe(false);
    expect(p1ViewOfSys2?.combatShips).toHaveLength(0);
    expect(p1ViewOfSys2?.planets.every((p) => p.visibility === 'unexplored')).toBe(true);

    // Combat events in system_starter_1 are visible to player_1 (and player_2 owns the intruder so p2 sees events involving its own ship,
    // while events strictly between non-p2 units outside p2 sensors would be hidden).
    expect(snap1.combatEvents.length).toBeGreaterThan(0);
    expect(snap1.combatEvents.every((e) => e.systemId === 'system_starter_1')).toBe(true);
    expect(p2Events.every((e) => e.systemId === 'system_starter_1')).toBe(true);
  });

  it('survives JSON.parse(JSON.stringify(snapshot)) round-trip and validates via isStateSnapshot & parseP2PWireMessage', () => {
    const sim = createStandardTwoPlayerSim();
    sim.stepTick(0.1);
    const snapshot = sim.buildStateSnapshot('player_1');

    const roundTripped: unknown = JSON.parse(JSON.stringify(snapshot));
    expect(isStateSnapshot(roundTripped)).toBe(true);

    const wireMessages: readonly P2PWireMessage[] = [
      { kind: 'peer_hello', peerId: 'peer-abc', requestedSlotId: 'player_2' },
      { kind: 'peer_leave', peerId: 'peer-abc', reason: 'disconnect' },
      {
        kind: 'lobby_sync',
        roomCode: 'STAR-42',
        presetId: 'standard_tactical',
        hostPeerId: 'host-1',
        slots: [
          { slotId: 'player_1', kind: 'human', peerId: 'host-1', connected: true },
          { slotId: 'player_2', kind: 'human', peerId: 'peer-abc', connected: true },
          { slotId: 'player_3', kind: 'ai', aiDifficulty: 'standard', peerId: null, connected: false },
          { slotId: 'player_4', kind: 'empty', peerId: null, connected: false },
        ],
      },
      {
        kind: 'match_start',
        assignedSlotId: 'player_2',
        matchSetup: sim.getMatchSetup(),
        initialSnapshot: snapshot,
      },
      { kind: 'state_snapshot', snapshot },
      {
        kind: 'player_command',
        commandId: 'cmd-1',
        command: {
          type: 'CREATE_FLEET',
          playerId: 'player_2',
          name: 'Vanguard',
          rallySystemId: 'system_starter_2',
          rallyPosition: { x: 50, z: -50 },
        },
      },
      {
        kind: 'command_ack',
        commandId: 'cmd-1',
        result: { ok: true },
      },
    ];

    for (const msg of wireMessages) {
      const parsed = parseP2PWireMessage(JSON.parse(JSON.stringify(msg)));
      expect(parsed).toEqual(msg);
    }

    // Reject malformed inputs
    expect(parseP2PWireMessage(null)).toBeNull();
    expect(parseP2PWireMessage('not-an-object')).toBeNull();
    expect(parseP2PWireMessage({ kind: 'unknown_kind' })).toBeNull();
    expect(parseP2PWireMessage({ kind: 'peer_hello', peerId: '' })).toBeNull();
    expect(parseP2PWireMessage({ kind: 'state_snapshot', snapshot: { version: 2 } })).toBeNull();
    expect(
      parseP2PWireMessage({
        kind: 'player_command',
        commandId: 'cmd-bad',
        command: { type: 'BUILD_ORBITAL_STRUCTURE', playerId: 'player_99' },
      }),
    ).toBeNull();
  });

  it('SnapshotSimulationView reads planets, structures, fleets, ships, economy, and combat events', () => {
    const sim = createStandardTwoPlayerSim();
    sim.submitCommand({
      type: 'CREATE_FLEET',
      playerId: 'player_1',
      name: 'Home Guard',
      rallySystemId: 'system_starter_1',
      rallyPosition: { x: 150, z: -80 },
    });
    const fleet = sim.getFleetsForPlayer('player_1')[0]!;
    const ship = sim.spawnCombatShipDirect(
      'player_1',
      'system_starter_1',
      { x: 150, z: -80 },
      'destroyer',
      'aggressive',
      null,
      fleet.id,
    );
    sim.stepTick(0.1);

    const initialSnap: StateSnapshot = JSON.parse(
      JSON.stringify(sim.buildStateSnapshot('player_1')),
    );
    const view = new SnapshotSimulationView(initialSnap);

    expect(view.presetId).toBe('standard_tactical');
    expect(view.currentTick).toBe(sim.currentTick);
    expect(view.getPlayerState('player_1').ore).toBe(sim.getPlayerState('player_1').ore);
    expect(view.getFleetsForPlayer('player_1')).toHaveLength(1);
    expect(view.getFleetById(fleet.id)?.name).toBe('Home Guard');
    expect(view.getShipsInFleet(fleet.id)).toHaveLength(1);
    expect(view.getCombatShipById(ship.id)?.id).toBe(ship.id);
    expect(view.getFleetLiveAnchor(fleet.id)).toEqual(
      sim.getFleetLiveAnchor(fleet.id),
    );

    const planets = view.getPlanetsInSystem('system_starter_1');
    expect(planets.length).toBeGreaterThan(0);
    const homeworld = view.getPlanetState('system_starter_1_homeworld');
    expect(homeworld.ownerId).toBe('player_1');
    const cnc = homeworld.structures.find((s) => s.structureId === 'command_and_control');
    expect(cnc).toBeDefined();
    expect(view.getStructureById(cnc!.id)?.structure.id).toBe(cnc!.id);
    expect(view.getMaxConcurrentDocks(cnc!)).toBe(sim.getMaxConcurrentDocks(cnc!));
    expect(view.getPlatformUnloadRatePerSecond(cnc!)).toBe(
      sim.getPlatformUnloadRatePerSecond(cnc!),
    );

    // Apply a subsequent snapshot with combat events
    const nextSnap: StateSnapshot = {
      ...initialSnap,
      tick: initialSnap.tick + 1,
      elapsedSeconds: initialSnap.elapsedSeconds + 0.1,
      combatEvents: [
        {
          id: 99,
          type: 'weapon_fire',
          systemId: 'system_starter_1',
          fromPos: { x: 150, z: -80 },
          toPos: { x: 180, z: -80 },
          ownerId: 'player_1',
          timestampSeconds: initialSnap.elapsedSeconds + 0.1,
        },
      ],
    };
    view.applySnapshot(nextSnap);
    expect(view.currentTick).toBe(initialSnap.tick + 1);
    const consumed = view.consumeCombatEvents('player_1');
    expect(consumed).toHaveLength(1);
    expect(consumed[0]?.id).toBe(99);
    expect(view.consumeCombatEvents('player_1')).toHaveLength(0);
  });
});
