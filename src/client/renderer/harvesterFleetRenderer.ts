import * as THREE from 'three';
import type { HarvesterUnitState } from '../../shared/sim/gameSimulation.ts';

export class HarvesterFleetRenderer {
  public readonly rootGroup = new THREE.Group();

  private readonly hullGeom = new THREE.BoxGeometry(2.8, 1.4, 5.2);
  private readonly cargoGeom = new THREE.CylinderGeometry(1.1, 1.1, 3.2, 8);
  private readonly engineGeom = new THREE.SphereGeometry(0.75, 8, 8);
  // Unit-length cylinder along +Z (0 .. 1) so scaling Z sets exact laser length
  private readonly beamGeom = new THREE.CylinderGeometry(0.18, 0.28, 1.0, 8);
  private readonly selectionRingGeom = new THREE.TorusGeometry(4.4, 0.22, 8, 32);
  private readonly targetRockRingGeom = new THREE.TorusGeometry(3.8, 0.18, 8, 28);
  // Larger invisible hit sphere for easy clicking in 3D space
  private readonly hitSphereGeom = new THREE.SphereGeometry(5.5, 12, 12);

  private readonly hullMat = new THREE.MeshStandardMaterial({
    color: 0xcbd5e1,
    metalness: 0.75,
    roughness: 0.3,
  });
  private readonly oreCargoMat = new THREE.MeshStandardMaterial({
    color: 0xd97706,
    emissive: 0x92400e,
    emissiveIntensity: 0.45,
    roughness: 0.5,
  });
  private readonly crystalCargoMat = new THREE.MeshStandardMaterial({
    color: 0x7dd3fc,
    emissive: 0x0284c7,
    emissiveIntensity: 0.45,
    roughness: 0.25,
  });
  private readonly engineMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(0.35, 0.85, 1.35),
  });
  private readonly beamMat = new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.78,
  });
  private readonly selectionRingMat = new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.9,
  });
  private readonly targetRockRingMat = new THREE.MeshBasicMaterial({
    color: 0xf59e0b,
    transparent: true,
    opacity: 0.75,
  });
  private readonly hitSphereMat = new THREE.MeshBasicMaterial({
    visible: false,
  });

  private readonly meshByHarvesterId = new Map<
    string,
    {
      readonly group: THREE.Group;
      readonly shipBody: THREE.Group;
      readonly cargoMesh: THREE.Mesh;
      readonly beamMesh: THREE.Mesh;
      readonly selectionRing: THREE.Mesh;
      readonly targetRockRing: THREE.Mesh;
      readonly hitMesh: THREE.Mesh;
    }
  >();

  constructor() {
    this.rootGroup.name = 'harvester_fleet_group';
    this.cargoGeom.rotateX(Math.PI / 2);
    this.beamGeom.rotateX(Math.PI / 2);
    this.beamGeom.translate(0, 0, 0.5);
    this.selectionRingGeom.rotateX(Math.PI / 2);
    this.targetRockRingGeom.rotateX(Math.PI / 2);
  }

  public syncHarvesters(
    harvesters: readonly HarvesterUnitState[],
    selectedHarvesterId: string | null = null,
  ): void {
    const activeIds = new Set<string>();

    for (const h of harvesters) {
      activeIds.add(h.id);
      let entry = this.meshByHarvesterId.get(h.id);
      if (!entry) {
        entry = this.createHarvesterMesh(h.id);
        this.meshByHarvesterId.set(h.id, entry);
        this.rootGroup.add(entry.group);
      }

      const shipY = h.targetRockWorldPos ? h.targetRockWorldPos.y : 1.5;
      entry.group.position.set(h.position.x, shipY, h.position.z);
      entry.shipBody.rotation.y = h.headingRadians;

      entry.cargoMesh.material =
        h.cargoType === 'ore' ? this.oreCargoMat : this.crystalCargoMat;
      const cargoScale = 0.25 + (h.cargoAmount / Math.max(1, h.cargoCapacity)) * 0.75;
      entry.cargoMesh.scale.set(cargoScale, cargoScale, cargoScale);

      const isSelected = h.id === selectedHarvesterId;
      entry.selectionRing.visible = isSelected;

      // Aim mining laser directly from the Harvester nose to the exact 3D asteroid/crystal
      if (h.state === 'mining' && h.targetRockWorldPos) {
        const noseOffset = new THREE.Vector3(
          Math.sin(h.headingRadians) * 2.6,
          0,
          Math.cos(h.headingRadians) * 2.6,
        );
        const targetVec = new THREE.Vector3(
          h.targetRockWorldPos.x - h.position.x,
          h.targetRockWorldPos.y - shipY,
          h.targetRockWorldPos.z - h.position.z,
        );
        const beamVector = targetVec.clone().sub(noseOffset);
        const beamLength = Math.max(1.0, beamVector.length());

        entry.beamMesh.visible = true;
        entry.beamMesh.position.copy(noseOffset);
        entry.beamMesh.lookAt(
          entry.group.position.x + targetVec.x,
          entry.group.position.y + targetVec.y,
          entry.group.position.z + targetVec.z,
        );
        entry.beamMesh.scale.set(1, 1, beamLength);

        entry.targetRockRing.visible = isSelected;
        entry.targetRockRing.position.copy(targetVec);
      } else {
        entry.beamMesh.visible = false;
        if (isSelected && h.targetRockWorldPos) {
          entry.targetRockRing.visible = true;
          entry.targetRockRing.position.set(
            h.targetRockWorldPos.x - h.position.x,
            h.targetRockWorldPos.y - shipY,
            h.targetRockWorldPos.z - h.position.z,
          );
        } else {
          entry.targetRockRing.visible = false;
        }
      }
    }

    for (const [id, entry] of this.meshByHarvesterId.entries()) {
      if (!activeIds.has(id)) {
        this.rootGroup.remove(entry.group);
        this.meshByHarvesterId.delete(id);
      }
    }
  }

  public pickHarvester(raycaster: THREE.Raycaster): string | null {
    const hitMeshes: THREE.Object3D[] = [];
    for (const entry of this.meshByHarvesterId.values()) {
      hitMeshes.push(entry.hitMesh);
    }
    const hits = raycaster.intersectObjects(hitMeshes, false);
    const first = hits[0];
    if (!first) {
      return null;
    }
    const harvesterId = first.object.userData.harvesterId as string | undefined;
    return harvesterId ?? null;
  }

  public dispose(): void {
    this.rootGroup.clear();
    this.meshByHarvesterId.clear();
    this.hullGeom.dispose();
    this.cargoGeom.dispose();
    this.engineGeom.dispose();
    this.beamGeom.dispose();
    this.selectionRingGeom.dispose();
    this.targetRockRingGeom.dispose();
    this.hitSphereGeom.dispose();
    this.hullMat.dispose();
    this.oreCargoMat.dispose();
    this.crystalCargoMat.dispose();
    this.engineMat.dispose();
    this.beamMat.dispose();
    this.selectionRingMat.dispose();
    this.targetRockRingMat.dispose();
    this.hitSphereMat.dispose();
  }

  private createHarvesterMesh(harvesterId: string): {
    readonly group: THREE.Group;
    readonly shipBody: THREE.Group;
    readonly cargoMesh: THREE.Mesh;
    readonly beamMesh: THREE.Mesh;
    readonly selectionRing: THREE.Mesh;
    readonly targetRockRing: THREE.Mesh;
    readonly hitMesh: THREE.Mesh;
  } {
    const group = new THREE.Group();
    const shipBody = new THREE.Group();
    group.add(shipBody);

    const hull = new THREE.Mesh(this.hullGeom, this.hullMat);
    shipBody.add(hull);

    const cargoMesh = new THREE.Mesh(this.cargoGeom, this.oreCargoMat);
    cargoMesh.position.set(0, 1.1, -0.4);
    shipBody.add(cargoMesh);

    const engineMesh = new THREE.Mesh(this.engineGeom, this.engineMat);
    engineMesh.position.set(0, 0, -2.8);
    shipBody.add(engineMesh);

    const beamMesh = new THREE.Mesh(this.beamGeom, this.beamMat);
    beamMesh.visible = false;
    group.add(beamMesh);

    const selectionRing = new THREE.Mesh(
      this.selectionRingGeom,
      this.selectionRingMat,
    );
    selectionRing.visible = false;
    group.add(selectionRing);

    const targetRockRing = new THREE.Mesh(
      this.targetRockRingGeom,
      this.targetRockRingMat,
    );
    targetRockRing.visible = false;
    group.add(targetRockRing);

    const hitMesh = new THREE.Mesh(this.hitSphereGeom, this.hitSphereMat);
    hitMesh.userData = { harvesterId };
    group.add(hitMesh);

    return {
      group,
      shipBody,
      cargoMesh,
      beamMesh,
      selectionRing,
      targetRockRing,
      hitMesh,
    };
  }
}
