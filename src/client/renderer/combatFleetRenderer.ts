import * as THREE from 'three';
import {
  SHIP_CLASSES,
  type CombatShipClassId,
} from '../../shared/config/index.ts';
import type { PlayerSlotId } from '../../shared/protocol/commands.ts';
import type {
  CombatShipUnitState,
  DockyardWaypoint,
} from '../../shared/sim/gameSimulation.ts';
import { FACTION_PALETTES } from './factionColors.ts';
import { ShipModelLibrary } from './shipModels.ts';

interface CombatShipRenderEntry {
  readonly group: THREE.Group;
  readonly selectionRing: THREE.Mesh;
  readonly hitMesh: THREE.Mesh;
  readonly turretPivots: readonly THREE.Object3D[];
  readonly healthBarGroup: THREE.Group;
  readonly hullFillMesh: THREE.Mesh;
  readonly shieldFillMesh: THREE.Mesh | null;
  readonly rebuildFillMesh: THREE.Mesh | null;
  readonly barWidth: number;
}

const HIT_RADIUS_BY_CLASS: Readonly<Record<CombatShipClassId, number>> = {
  fighter: 2.2,
  destroyer: 4.0,
  cruiser: 5.5,
  carrier: 7.2,
  dreadnought: 9.2,
};

const HEALTH_BAR_LAYOUT_BY_CLASS: Readonly<
  Record<CombatShipClassId, { readonly width: number; readonly offsetY: number }>
> = {
  fighter: { width: 2.4, offsetY: 1.5 },
  destroyer: { width: 4.2, offsetY: 2.4 },
  cruiser: { width: 5.8, offsetY: 3.4 },
  carrier: { width: 7.4, offsetY: 4.6 },
  dreadnought: { width: 9.6, offsetY: 6.2 },
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
  private readonly healthBarBgMat = new THREE.MeshBasicMaterial({
    color: 0x0f172a,
    transparent: true,
    opacity: 0.78,
    side: THREE.DoubleSide,
    depthTest: false,
  });
  private readonly hullBarMat = new THREE.MeshBasicMaterial({
    color: 0x22c55e,
    side: THREE.DoubleSide,
    depthTest: false,
  });
  private readonly shieldBarMat = new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
    side: THREE.DoubleSide,
    depthTest: false,
  });
  private readonly rebuildBarMat = new THREE.MeshBasicMaterial({
    color: 0xf59e0b,
    side: THREE.DoubleSide,
    depthTest: false,
  });
  private readonly factionRingMaterials = new Map<PlayerSlotId, THREE.MeshBasicMaterial>();
  private readonly factionPipMaterials = new Map<PlayerSlotId, THREE.MeshBasicMaterial>();

  private readonly unitBarPlaneGeom = new THREE.PlaneGeometry(1, 1);

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
    cameraQuaternion?: THREE.Quaternion,
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
      const isSelected =
        ship.id === selectedShipId ||
        (selectedFleetId !== null && ship.fleetId === selectedFleetId);
      entry.selectionRing.visible = isSelected;

      // Update 3D overhead Shield (blue, shielded ships only) & Hull (green) health bars
      const hullRatio = Math.max(0, Math.min(1, ship.hull / Math.max(1, ship.maxHull)));
      const shieldRatio =
        ship.maxShields > 0
          ? Math.max(0, Math.min(1, ship.shields / Math.max(1, ship.maxShields)))
          : 0;
      const rebuildRatio =
        ship.shipClassId === 'carrier' && ship.fighterRebuildProgressSeconds > 0
          ? Math.max(
              0,
              Math.min(
                1,
                ship.fighterRebuildProgressSeconds /
                  Math.max(0.1, SHIP_CLASSES.fighter.buildTimeSeconds),
              ),
            )
          : 0;
      const showBars =
        isSelected ||
        ship.inCombat ||
        hullRatio < 0.999 ||
        (ship.maxShields > 0 && shieldRatio < 0.999) ||
        rebuildRatio > 0;
      entry.healthBarGroup.visible = showBars;
      if (showBars) {
        if (cameraQuaternion) {
          // Counter-rotate ship yaw so the overhead bar always faces the camera cleanly
          entry.healthBarGroup.quaternion
            .setFromAxisAngle(new THREE.Vector3(0, 1, 0), -ship.headingRadians)
            .multiply(cameraQuaternion);
        }
        const hullW = Math.max(0.001, entry.barWidth * hullRatio);
        entry.hullFillMesh.scale.set(hullW, 0.42, 1);
        entry.hullFillMesh.position.x = -entry.barWidth * 0.5 + hullW * 0.5;
        entry.hullFillMesh.visible = hullRatio > 0;

        if (entry.shieldFillMesh) {
          const shieldW = Math.max(0.001, entry.barWidth * shieldRatio);
          entry.shieldFillMesh.scale.set(shieldW, 0.36, 1);
          entry.shieldFillMesh.position.x = -entry.barWidth * 0.5 + shieldW * 0.5;
          entry.shieldFillMesh.visible = shieldRatio > 0;
        }

        if (entry.rebuildFillMesh) {
          const rebuildW = Math.max(0.001, entry.barWidth * rebuildRatio);
          entry.rebuildFillMesh.scale.set(rebuildW, 0.3, 1);
          entry.rebuildFillMesh.position.x = -entry.barWidth * 0.5 + rebuildW * 0.5;
          entry.rebuildFillMesh.visible = rebuildRatio > 0;
        }
      }

      // Active turret target-tracking rotation toward live combat target
      if (ship.currentTargetPos && entry.turretPivots.length > 0) {
        const worldBearing = Math.atan2(
          ship.currentTargetPos.x - ship.position.x,
          ship.currentTargetPos.z - ship.position.z,
        );
        const localYaw = worldBearing - ship.headingRadians;
        for (const pivot of entry.turretPivots) {
          pivot.rotation.y = localYaw;
        }
      }
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
    this.unitBarPlaneGeom.dispose();
    this.selectionRingMat.dispose();
    this.hitSphereMat.dispose();
    this.rallyBeaconMat.dispose();
    this.patrolBeaconMat.dispose();
    this.patrolLineMat.dispose();
    this.healthBarBgMat.dispose();
    this.hullBarMat.dispose();
    this.shieldBarMat.dispose();
    this.rebuildBarMat.dispose();
    for (const mat of this.factionRingMaterials.values()) {
      mat.dispose();
    }
    this.factionRingMaterials.clear();
    for (const mat of this.factionPipMaterials.values()) {
      mat.dispose();
    }
    this.factionPipMaterials.clear();
    this.shipModels.dispose();
  }

  private getFactionRingMat(ownerId: PlayerSlotId): THREE.MeshBasicMaterial {
    let mat = this.factionRingMaterials.get(ownerId);
    if (!mat) {
      mat = new THREE.MeshBasicMaterial({
        color: FACTION_PALETTES[ownerId].tacticalHex,
        transparent: true,
        opacity: 0.42,
        side: THREE.DoubleSide,
      });
      this.factionRingMaterials.set(ownerId, mat);
    }
    return mat;
  }

  private getFactionPipMat(ownerId: PlayerSlotId): THREE.MeshBasicMaterial {
    let mat = this.factionPipMaterials.get(ownerId);
    if (!mat) {
      mat = new THREE.MeshBasicMaterial({
        color: FACTION_PALETTES[ownerId].tacticalHex,
        side: THREE.DoubleSide,
        depthTest: false,
      });
      this.factionPipMaterials.set(ownerId, mat);
    }
    return mat;
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
    const model = this.shipModels.buildShipMesh(ship.shipClassId, {
      ownerId: ship.ownerId,
    });
    group.add(model);

    const hitRadius = HIT_RADIUS_BY_CLASS[ship.shipClassId];
    const factionRingGeom = new THREE.RingGeometry(
      hitRadius * 0.68,
      hitRadius * 0.8,
      24,
    ).rotateX(-Math.PI / 2);
    this.geometries.push(factionRingGeom);
    const factionRing = new THREE.Mesh(
      factionRingGeom,
      this.getFactionRingMat(ship.ownerId),
    );
    factionRing.name = 'faction_ownership_ring';
    factionRing.position.set(0, -0.46, 0);
    group.add(factionRing);

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

    // Overhead Health Bars: green Hull bar for all ships, plus blue Shield bar ONLY for shielded ships (maxShields > 0)
    const barLayout = HEALTH_BAR_LAYOUT_BY_CLASS[ship.shipClassId];
    const hasShieldBar = ship.maxShields > 0;
    const healthBarGroup = new THREE.Group();
    healthBarGroup.name = 'ship_health_bars';
    healthBarGroup.position.set(0, barLayout.offsetY, 0);
    healthBarGroup.visible = false;

    const bgHeight = hasShieldBar ? 1.05 : 0.62;
    const bgMesh = new THREE.Mesh(this.unitBarPlaneGeom, this.healthBarBgMat);
    bgMesh.scale.set(barLayout.width + 0.3, bgHeight, 1);
    bgMesh.position.set(0, hasShieldBar ? 0.22 : 0, -0.02);
    bgMesh.renderOrder = 20;
    healthBarGroup.add(bgMesh);

    // Faction ownership color pip anchored to the left edge of the overhead bar
    const pipMesh = new THREE.Mesh(
      this.unitBarPlaneGeom,
      this.getFactionPipMat(ship.ownerId),
    );
    pipMesh.name = 'faction_owner_pip';
    pipMesh.scale.set(0.38, bgHeight, 1);
    pipMesh.position.set(-barLayout.width * 0.5 - 0.38, hasShieldBar ? 0.22 : 0, 0);
    pipMesh.renderOrder = 21;
    healthBarGroup.add(pipMesh);

    const hullFillMesh = new THREE.Mesh(this.unitBarPlaneGeom, this.hullBarMat);
    hullFillMesh.name = 'hull_health_bar';
    hullFillMesh.scale.set(barLayout.width, 0.42, 1);
    hullFillMesh.position.set(0, 0, 0);
    hullFillMesh.renderOrder = 21;
    healthBarGroup.add(hullFillMesh);

    let shieldFillMesh: THREE.Mesh | null = null;
    if (hasShieldBar) {
      shieldFillMesh = new THREE.Mesh(this.unitBarPlaneGeom, this.shieldBarMat);
      shieldFillMesh.name = 'shield_health_bar';
      shieldFillMesh.scale.set(barLayout.width, 0.36, 1);
      shieldFillMesh.position.set(0, 0.48, 0);
      shieldFillMesh.renderOrder = 21;
      healthBarGroup.add(shieldFillMesh);
    }

    let rebuildFillMesh: THREE.Mesh | null = null;
    if (ship.shipClassId === 'carrier') {
      rebuildFillMesh = new THREE.Mesh(this.unitBarPlaneGeom, this.rebuildBarMat);
      rebuildFillMesh.name = 'fighter_rebuild_bar';
      rebuildFillMesh.scale.set(barLayout.width, 0.3, 1);
      rebuildFillMesh.position.set(0, -0.44, 0);
      rebuildFillMesh.visible = false;
      rebuildFillMesh.renderOrder = 21;
      healthBarGroup.add(rebuildFillMesh);
    }

    group.add(healthBarGroup);

    const turretPivots = Array.isArray(model.userData.turretPivots)
      ? (model.userData.turretPivots as THREE.Object3D[])
      : [];
    return {
      group,
      selectionRing,
      hitMesh,
      turretPivots,
      healthBarGroup,
      hullFillMesh,
      shieldFillMesh,
      rebuildFillMesh,
      barWidth: barLayout.width,
    };
  }
}
