import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { SHIP_CLASSES, type CombatShipClassId } from '../../../shared/config/index.ts';
import type { CombatShipUnitState } from '../../../shared/sim/gameSimulation.ts';
import { CombatFleetRenderer } from '../combatFleetRenderer.ts';
import { StationModelLibrary } from '../stationModels.ts';
import { aimPlusXTurretPivots, extractTurretPivots } from '../turretPivots.ts';

function makeShip(
  id: string,
  shipClassId: CombatShipClassId,
  headingRadians: number,
  targetPos: { x: number; z: number },
): CombatShipUnitState {
  const cfg = SHIP_CLASSES[shipClassId];
  return {
    id,
    shipClassId,
    ownerId: 'player_1',
    homeDockyardId: 'dock_1',
    fleetId: 'fleet_1',
    inCombat: true,
    currentSystemId: 'sys_player_1',
    position: { x: 0, z: 0 },
    headingRadians,
    currentSpeed: 0,
    shields: cfg.maxShields,
    maxShields: cfg.maxShields,
    hull: cfg.maxHull,
    maxHull: cfg.maxHull,
    stance: 'aggressive',
    state: 'holding_position',
    targetSystemId: 'sys_player_1',
    targetPosition: { x: 0, z: 0 },
    patrolWaypoints: [],
    patrolIndex: 0,
    formationOffset: { x: 0, z: 0 },
    weaponCooldowns: [],
    lastDamageTakenAtSeconds: -99,
    currentTargetId: 'enemy_1',
    currentTargetPos: targetPos,
    tetherHostId: null,
    readyFighterCount: 0,
    fighterLaunchCooldownSeconds: 0,
    fighterRebuildProgressSeconds: 0,
  };
}

describe('CombatFleetRenderer active turret tracking', () => {
  it('rotates destroyer, cruiser, dreadnought, and carrier turrets toward currentTargetPos', () => {
    const renderer = new CombatFleetRenderer();
    const target = { x: 100, z: 0 };
    const headingRadians = 0.25;
    const expectedLocalYaw = Math.atan2(target.x, target.z) - headingRadians;

    const ships: CombatShipUnitState[] = [
      makeShip('ship_dd', 'destroyer', headingRadians, target),
      makeShip('ship_cr', 'cruiser', headingRadians, target),
      makeShip('ship_dn', 'dreadnought', headingRadians, target),
      makeShip('ship_ca', 'carrier', headingRadians, target),
    ];

    renderer.syncShips(ships, null, null, 1.0);

    const dorsalNames = [
      'havoc_dorsal_turret',
      'cruiser_dorsal_turret_fore',
      'cruiser_dorsal_turret_aft',
      'imperator_dorsal_turret_1',
      'imperator_dorsal_turret_2',
      'imperator_dorsal_turret_3',
    ];
    for (const turretName of dorsalNames) {
      const turret = renderer.rootGroup.getObjectByName(turretName);
      expect(turret, `${turretName} should exist`).toBeDefined();
      expect(turret!.rotation.y).toBeCloseTo(expectedLocalYaw, 5);
    }

    const carrierGroup = renderer.rootGroup.getObjectByName('ship_carrier_vanguard');
    expect(carrierGroup).toBeDefined();
    const carrierMeta = carrierGroup!.userData.turretPivots as {
      pdTurretPivots: THREE.Object3D[];
    };
    expect(carrierMeta.pdTurretPivots.length).toBeGreaterThan(0);
    for (const pivot of carrierMeta.pdTurretPivots) {
      expect(pivot.rotation.y).toBeCloseTo(expectedLocalYaw, 5);
    }

    renderer.dispose();
  });

  it('extracts and aims deep-space tower turrets along local +X toward target delta', () => {
    const stations = new StationModelLibrary();
    const pdTower = stations.buildStationMesh('point_defence_tower', true);
    const hbTower = stations.buildStationMesh('hull_breaker_tower', true);

    const dx = 30;
    const dz = 40;
    const expectedDir = new THREE.Vector3(dx, 0, dz).normalize();

    for (const tower of [pdTower, hbTower]) {
      const pivots = extractTurretPivots(tower.userData.turretPivots);
      expect(pivots).toHaveLength(4);

      aimPlusXTurretPivots(pivots, dx, dz);
      for (const pivot of pivots) {
        const aimedDir = new THREE.Vector3(1, 0, 0).applyAxisAngle(
          new THREE.Vector3(0, 1, 0),
          pivot.rotation.y,
        );
        expect(aimedDir.x).toBeCloseTo(expectedDir.x, 5);
        expect(aimedDir.z).toBeCloseTo(expectedDir.z, 5);
      }
    }

    stations.dispose();
  });
});
