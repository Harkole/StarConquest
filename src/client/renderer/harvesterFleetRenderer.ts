import * as THREE from 'three';
import type { HarvesterUnitState } from '../../shared/sim/gameSimulation.ts';

export class HarvesterFleetRenderer {
  public readonly rootGroup = new THREE.Group();

  private readonly hullGeom = new THREE.BoxGeometry(2.8, 1.4, 5.2);
  private readonly cargoGeom = new THREE.CylinderGeometry(1.1, 1.1, 3.2, 8);
  private readonly engineGeom = new THREE.SphereGeometry(0.75, 8, 8);
  private readonly beamGeom = new THREE.CylinderGeometry(0.18, 0.35, 16, 8);

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
    color: new THREE.Color(0.35, 0.85, 1.35), // Triggers subtle HDR engine bloom
  });
  private readonly beamMat = new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.65,
  });

  private readonly meshByHarvesterId = new Map<
    string,
    {
      readonly group: THREE.Group;
      readonly cargoMesh: THREE.Mesh;
      readonly beamMesh: THREE.Mesh;
    }
  >();

  constructor() {
    this.rootGroup.name = 'harvester_fleet_group';
    this.cargoGeom.rotateX(Math.PI / 2);
    this.beamGeom.rotateX(Math.PI / 2);
    this.beamGeom.translate(0, 0, 8);
  }

  public syncHarvesters(harvesters: readonly HarvesterUnitState[]): void {
    const activeIds = new Set<string>();

    for (const h of harvesters) {
      activeIds.add(h.id);
      let entry = this.meshByHarvesterId.get(h.id);
      if (!entry) {
        entry = this.createHarvesterMesh();
        this.meshByHarvesterId.set(h.id, entry);
        this.rootGroup.add(entry.group);
      }

      entry.group.position.set(h.position.x, 1.5, h.position.z);
      entry.group.rotation.y = h.headingRadians;

      entry.cargoMesh.material =
        h.cargoType === 'ore' ? this.oreCargoMat : this.crystalCargoMat;
      const cargoScale = 0.35 + (h.cargoAmount / Math.max(1, h.cargoCapacity)) * 0.65;
      entry.cargoMesh.scale.set(cargoScale, cargoScale, cargoScale);

      entry.beamMesh.visible = h.state === 'mining';
    }

    for (const [id, entry] of this.meshByHarvesterId.entries()) {
      if (!activeIds.has(id)) {
        this.rootGroup.remove(entry.group);
        this.meshByHarvesterId.delete(id);
      }
    }
  }

  public dispose(): void {
    this.rootGroup.clear();
    this.meshByHarvesterId.clear();
    this.hullGeom.dispose();
    this.cargoGeom.dispose();
    this.engineGeom.dispose();
    this.beamGeom.dispose();
    this.hullMat.dispose();
    this.oreCargoMat.dispose();
    this.crystalCargoMat.dispose();
    this.engineMat.dispose();
    this.beamMat.dispose();
  }

  private createHarvesterMesh(): {
    readonly group: THREE.Group;
    readonly cargoMesh: THREE.Mesh;
    readonly beamMesh: THREE.Mesh;
  } {
    const group = new THREE.Group();

    const hull = new THREE.Mesh(this.hullGeom, this.hullMat);
    group.add(hull);

    const cargoMesh = new THREE.Mesh(this.cargoGeom, this.oreCargoMat);
    cargoMesh.position.set(0, 1.1, -0.4);
    group.add(cargoMesh);

    const engineMesh = new THREE.Mesh(this.engineGeom, this.engineMat);
    engineMesh.position.set(0, 0, -2.8);
    group.add(engineMesh);

    const beamMesh = new THREE.Mesh(this.beamGeom, this.beamMat);
    beamMesh.visible = false;
    group.add(beamMesh);

    return { group, cargoMesh, beamMesh };
  }
}
