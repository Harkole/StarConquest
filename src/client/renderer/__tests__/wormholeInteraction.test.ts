import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { LocalSimAdapter } from '../../net/localSimAdapter.ts';
import type {
  CameraTargetProvider,
  OrbitalCameraController,
} from '../orbitalCamera.ts';
import {
  getWormholePickRadius,
  WORMHOLE_DORMANT_PICK_RADIUS,
  WORMHOLE_OPEN_PICK_RADIUS,
} from '../spaceEnvironmentFactory.ts';
import { SystemSceneManager } from '../systemSceneManager.ts';

function createCameraControllerStub(): {
  readonly controller: OrbitalCameraController;
  getLastTarget(): { readonly x: number; readonly z: number } | null;
  getLastDistance(): number | null;
} {
  let lastTarget: { readonly x: number; readonly z: number } | null = null;
  let lastDistance: number | null = null;
  let pinned = false;

  const stub = {
    camera: new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 20000),
    focusOn(x: number, z: number, distance = 120): void {
      pinned = false;
      lastTarget = { x, z };
      lastDistance = distance;
    },
    pinToTarget(provider: CameraTargetProvider, distance?: number): void {
      pinned = true;
      const initial = provider();
      if (initial) {
        lastTarget = { x: initial.x, z: initial.z };
      }
      if (distance !== undefined) {
        lastDistance = distance;
      }
    },
    clearPin(): void {
      pinned = false;
    },
    isPinned(): boolean {
      return pinned;
    },
  };

  return {
    controller: stub as unknown as OrbitalCameraController,
    getLastTarget: () => lastTarget,
    getLastDistance: () => lastDistance,
  };
}

describe('wormhole picking and transit interactions', () => {
  it('interpolates and clamps wormhole pick radius between dormant and open bounds', () => {
    expect(getWormholePickRadius(0)).toBe(WORMHOLE_DORMANT_PICK_RADIUS);
    expect(getWormholePickRadius(1)).toBe(WORMHOLE_OPEN_PICK_RADIUS);
    expect(getWormholePickRadius(0.5)).toBeCloseTo(
      (WORMHOLE_DORMANT_PICK_RADIUS + WORMHOLE_OPEN_PICK_RADIUS) / 2,
      6,
    );
    expect(getWormholePickRadius(-0.5)).toBe(WORMHOLE_DORMANT_PICK_RADIUS);
    expect(getWormholePickRadius(2.5)).toBe(WORMHOLE_OPEN_PICK_RADIUS);
  });

  it('switches systems and focuses the wormhole exit point on camera transit', () => {
    const simAdapter = new LocalSimAdapter('blitz_skirmish');
    const scene = new THREE.Scene();
    const cam = createCameraControllerStub();
    const sceneManager = new SystemSceneManager(
      scene,
      simAdapter.simulation.galaxy,
      cam.controller,
      simAdapter,
    );

    const activeWormholes = sceneManager.getActiveWormholes();
    expect(activeWormholes.length).toBeGreaterThan(0);
    const wh = activeWormholes[0]!;
    const expectedDestSystemId = wh.destinationSystemId;
    const expectedExit = wh.exitPosition;

    expect(sceneManager.transitCameraThroughWormhole('nonexistent_wh')).toBe(false);
    expect(sceneManager.getActiveSystem().id).toBe('system_starter_1');

    expect(sceneManager.transitCameraThroughWormhole(wh.wormholeId)).toBe(true);
    expect(sceneManager.getActiveSystem().id).toBe(expectedDestSystemId);
    expect(cam.getLastTarget()).toEqual({
      x: expectedExit.x,
      z: expectedExit.z,
    });
    expect(cam.getLastDistance()).toBe(92);
  });

  it('orders the selected fleet through a wormhole to hold at the exit point in the connected system', () => {
    const simAdapter = new LocalSimAdapter('blitz_skirmish');
    const sim = simAdapter.simulation;
    const p1 = sim.getPlayerState('player_1');
    p1.ore = 2000;
    p1.crystal = 1000;

    const scene = new THREE.Scene();
    const cam = createCameraControllerStub();
    const sceneManager = new SystemSceneManager(
      scene,
      sim.galaxy,
      cam.controller,
      simAdapter,
    );

    const wh = sceneManager.getActiveWormholes()[0]!;
    expect(sceneManager.orderSelectedFleetThroughWormhole(wh.wormholeId)).toBe(false);

    expect(
      simAdapter.submitPlayerCommand({
        type: 'BUILD_ORBITAL_STRUCTURE',
        playerId: 'player_1',
        planetId: 'system_starter_1_homeworld',
        slotIndex: 2,
        structureId: 'orbital_dockyard',
      }).ok,
    ).toBe(true);
    sim.stepTick(31);

    expect(
      simAdapter.submitPlayerCommand({
        type: 'CREATE_FLEET',
        playerId: 'player_1',
        rallySystemId: 'system_starter_1',
        rallyPosition: { x: 180, z: 0 },
        stance: 'hold_the_line',
        autoResupply: false,
      }).ok,
    ).toBe(true);

    const fleet = sim.getFleetsForPlayer('player_1')[0]!;
    expect(
      simAdapter.submitPlayerCommand({
        type: 'UPDATE_FLEET_TEMPLATE',
        playerId: 'player_1',
        fleetId: fleet.id,
        desiredCounts: { destroyer: 1 },
      }).ok,
    ).toBe(true);
    for (let i = 0; i < 40; i++) {
      sim.stepTick(0.5);
    }

    const fleetShipsBefore = sim.getShipsInFleet(fleet.id);
    expect(fleetShipsBefore).toHaveLength(1);
    expect(fleetShipsBefore[0]!.currentSystemId).toBe('system_starter_1');

    const notifications: { readonly message: string; readonly ok: boolean }[] = [];
    sceneManager.onDeepSpacePlacementResult((message, ok) => {
      notifications.push({ message, ok });
    });

    sceneManager.selectFleet(fleet.id);
    expect(sceneManager.orderSelectedFleetThroughWormhole(wh.wormholeId)).toBe(true);

    expect(notifications).toHaveLength(1);
    expect(notifications[0]!.ok).toBe(true);
    expect(notifications[0]!.message).toContain(fleet.name);
    expect(notifications[0]!.message).toContain('Central Nexus');

    const updatedFleet = sim.getFleetById(fleet.id)!;
    expect(updatedFleet.orderType).toBe('move');
    expect(updatedFleet.orderSystemId).toBe(wh.destinationSystemId);
    expect(updatedFleet.orderPosition).toEqual({
      x: Math.round(wh.exitPosition.x),
      z: Math.round(wh.exitPosition.z),
    });

    for (let i = 0; i < 600; i++) {
      sim.stepTick(0.2);
    }

    const shipAfter = sim.getShipsInFleet(fleet.id)[0]!;
    expect(shipAfter.currentSystemId).toBe(wh.destinationSystemId);
    expect(shipAfter.state).toBe('holding_position');
    const distToExit = Math.hypot(
      shipAfter.position.x - wh.exitPosition.x,
      shipAfter.position.z - wh.exitPosition.z,
    );
    expect(distToExit).toBeLessThan(40);
  });
});
