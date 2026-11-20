import * as THREE from 'three';
import type { CombatShipClassId } from '../../shared/config/index.ts';
import type {
  CombatShipUnitState,
  DockyardWaypoint,
} from '../../shared/sim/gameSimulation.ts';
import { ShipModelLibrary } from './shipModels.ts';

interface CombatShipRenderEntry {
  readonly group: THREE.Group;
  readonly selectionRing: THREE.Mesh;
  readonly hitMesh: THREE.Mesh;
}

const HIT_RADIUS_BY_CLASS: Readonly<Record<CombatShipClassId, number>> = {
  fighter: 2.2,
  destroyer: 4.0,
  cruiser: 5.5,
  carrier: 7.2,
  dreadnought: 9.2,
};

/**
 * Renders all live combat ships (`fighter`, `destroyer`, `cruiser`, `carrier`, `dreadnought`)
 * in the currently active star system using approved `ShipModelLibrary` 3D models, plus
 * 3D Rally Point beacons and Patrol Route waypoint overlays.
 */
export class CombatFleetRenderer {
  public readonly rootGroup = new THREE.Group();

  private readonly shipModels = new ShipModelLibrary();
  private readonly shipsGroup = new THREE.Group();
  private readonly ordersOverlayGroup = new THREE.Group();
  private readonly entries = new Map<string, CombatShipRenderEntry>();

  private readonly selectionRingMat = new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.9,
    side: THREE.DoubleSide,
  });
  private readonly hitSphereMat = new THREE.MeshBasicMaterial({
    visible: false,
  });
  private readonly rallyBeaconMat = new THREE.MeshBasicMaterial({
    color: 0x22c55e,
    transparent: true,
    opacity: 0.75,
    side: THREE.DoubleSide,
  });
  private readonly patrolBeaconMat = new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.78,
    side: THREE.DoubleSide,
  });
  private readonly patrolLineMat = new THREE.LineBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.65,
  });

  private readonly rallyRingGeom = new THREE.RingGeometry(4.5, 6.2, 32).rotateX(
    -Math.PI / 2,
  );
  private readonly patrolRingGeom = new THREE.RingGeometry(3.6, 5.0, 24).rotateX(
    -Math.PI / 2,
  );
  private readonly geometries: THREE.BufferGeometry[] = [];
  private lastOrdersSignature = '';

  constructor() {
    this.rootGroup.add(this.shipsGroup);
    this.rootGroup.add(this.ordersOverlayGroup);
  }

  public syncShips(
    shipsInSystem: readonly CombatShipUnitState[],
    selectedShipId: string | null,
    selectedFleetId: string | null,
    _elapsedSeconds = 0,
  ): void {
    const activeIds = new Set<string>();

    for (const ship of shipsInSystem) {
      activeIds.add(ship.id);
      let entry = this.entries.get(ship.id);
      if (!entry) {
        entry = this.createShipEntry(ship);
        this.entries.set(ship.id, entry);
        this.shipsGroup.add(entry.group);
      }

      entry.group.position.set(ship.position.x, 1.6, ship.position.z);
      entry.group.rotation.y = ship.headingRadians;
      entry.selectionRing.visible =
        ship.id === selectedShipId ||
        (selectedFleetId !== null && ship.fleetId === selectedFleetId);
    }

    for (const [id, entry] of this.entries.entries()) {
      if (!activeIds.has(id)) {
        this.shipsGroup.remove(entry.group);
        this.entries.delete(id);
      }
    }
  }

  public syncOrdersOverlay(
    activeSystemId: string,
    rallyPoints: readonly { readonly x: number; readonly z: number }[],
    patrolRoutes: readonly (readonly DockyardWaypoint[])[],
  ): void {
    const sig =
      activeSystemId +
      '|R:' +
      rallyPoints.map((p) => `${Math.round(p.x)},${Math.round(p.z)}`).join(';') +
      '|P:' +
      patrolRoutes
        .map((route) =>
          route
            .filter((wp) => wp.systemId === activeSystemId)
            .map((wp) => `${Math.round(wp.position.x)},${Math.round(wp.position.z)}`)
            .join('>'),
        )
        .join(';');

    if (sig === this.lastOrdersSignature) {
      return;
    }
    this.lastOrdersSignature = sig;
    this.clearOverlayGroup();

    for (const rp of rallyPoints) {
      const ring = new THREE.Mesh(this.rallyRingGeom, this.rallyBeaconMat);
      ring.position.set(rp.x, 0.35, rp.z);
      this.ordersOverlayGroup.add(ring);
    }

    for (const route of patrolRoutes) {
      const localWps = route.filter((wp) => wp.systemId === activeSystemId);
      if (localWps.length === 0) {
        continue;
      }
      for (const wp of localWps) {
        const ring = new THREE.Mesh(this.patrolRingGeom, this.patrolBeaconMat);
        ring.position.set(wp.position.x, 0.35, wp.position.z);
        this.ordersOverlayGroup.add(ring);
      }
      if (localWps.length >= 2) {
        const pts = localWps.map(
          (wp) => new THREE.Vector3(wp.position.x, 0.45, wp.position.z),
        );
        // Close loop when all waypoints are in this system
        if (localWps.length === route.length) {
          pts.push(pts[0]!.clone());
        }
        const lineGeom = new THREE.BufferGeometry().setFromPoints(pts);
        const line = new THREE.Line(lineGeom, this.patrolLineMat);
        line.userData.ownedGeometry = lineGeom;
        this.ordersOverlayGroup.add(line);
      }
    }
  }

  public pickCombatShip(raycaster: THREE.Raycaster): string | null {
    const hitMeshes = Array.from(this.entries.values()).map((e) => e.hitMesh);
    if (hitMeshes.length === 0) {
      return null;
    }
    const hits = raycaster.intersectObjects(hitMeshes, false);
    const first = hits[0];
    if (!first) {
      return null;
    }
    return (first.object.userData.combatShipId as string | undefined) ?? null;
  }

  public dispose(): void {
    this.clearOverlayGroup();
    this.shipsGroup.clear();
    this.entries.clear();
    for (const g of this.geometries) {
      g.dispose();
    }
    this.rallyRingGeom.dispose();
    this.patrolRingGeom.dispose();
    this.selectionRingMat.dispose();
    this.hitSphereMat.dispose();
    this.rallyBeaconMat.dispose();
    this.patrolBeaconMat.dispose();
    this.patrolLineMat.dispose();
    this.shipModels.dispose();
  }

  private clearOverlayGroup(): void {
    for (const child of this.ordersOverlayGroup.children) {
      const owned = child.userData.ownedGeometry as THREE.BufferGeometry | undefined;
      if (owned) {
        owned.dispose();
      }
    }
    this.ordersOverlayGroup.clear();
  }

  private createShipEntry(ship: CombatShipUnitState): CombatShipRenderEntry {
    const group = new THREE.Group();
    const model = this.shipModels.buildShipMesh(ship.shipClassId);
    group.add(model);

    const hitRadius = HIT_RADIUS_BY_CLASS[ship.shipClassId];
    const ringGeom = new THREE.RingGeometry(hitRadius * 0.85, hitRadius * 1.02, 28).rotateX(
      -Math.PI / 2,
    );
    this.geometries.push(ringGeom);
    const selectionRing = new THREE.Mesh(ringGeom, this.selectionRingMat);
    selectionRing.position.set(0, -0.4, 0);
    selectionRing.visible = false;
    group.add(selectionRing);

    const hitGeom = new THREE.SphereGeometry(hitRadius, 8, 8);
    this.geometries.push(hitGeom);
    const hitMesh = new THREE.Mesh(hitGeom, this.hitSphereMat);
    hitMesh.userData.combatShipId = ship.id;
    group.add(hitMesh);

    return { group, selectionRing, hitMesh };
  }
}
