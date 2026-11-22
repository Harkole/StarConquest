import * as THREE from 'three';
import type { PlayerSlotId } from '../../shared/protocol/commands.ts';
import type { HarvesterUnitState } from '../../shared/sim/gameSimulation.ts';
import { FACTION_PALETTES } from './factionColors.ts';
import { createProceduralHullTextures } from './proceduralHullTextures.ts';

interface HarvesterRenderInstance {
  readonly group: THREE.Group;
  readonly shipBody: THREE.Group;
  readonly drillGroup: THREE.Group;
  readonly cargoWindowMeshes: readonly THREE.Mesh[];
  readonly beamGroup: THREE.Group;
  readonly coreBeamMesh: THREE.Mesh;
  readonly outerBeamMesh: THREE.Mesh;
  readonly impactSparkGroup: THREE.Group;
  readonly selectionRing: THREE.Mesh;
  readonly targetRockRing: THREE.Mesh;
  readonly hitMesh: THREE.Mesh;
  readonly cargoWindowMat: THREE.MeshStandardMaterial;
}

/**
 * Renders the StarConquest "Prospector" Class Mining Frigate following `docs/artstyle.md`:
 * - Gunmetal Slate (#3e4652) main spine, Weathered Ochre (#c27d2c) cheek/engine armor,
 *   and Dark Charcoal Iron (#1e232a) structural ribbing.
 * - Elevated cockpit module with warm amber (#fbbf24) interior windows, floodlights, and dorsal antenna.
 * - Nose-mounted articulating mining drill barrel with upper/lower stabilizer prongs.
 * - 8 side-mounted ribbed cargo pods (2x2 on port & starboard) with dynamic Ore/Crystal containment glow.
 * - Outboard wing pylons with thruster nacelles and underslung auxiliary pods.
 * - Quad rear engine cluster + 3 ventral landing gear skids.
 * - Dual-layer mining laser (cyan-white core + warm amber sheath) + molten asteroid impact flare.
 */
export class HarvesterFleetRenderer {
  public readonly rootGroup = new THREE.Group();

  private readonly hullTextures = createProceduralHullTextures();

  // Standardized PBR Materials with procedural industrial hull textures per docs/artstyle.md
  private readonly primaryHullMat = new THREE.MeshStandardMaterial({
    name: 'hull_gunmetal_slate',
    color: 0x46505e,
    map: this.hullTextures.hullPlating.map,
    bumpMap: this.hullTextures.hullPlating.bumpMap,
    bumpScale: 0.08,
    roughnessMap: this.hullTextures.hullPlating.roughnessMap,
    metalness: 0.68,
    roughness: 0.58,
  });
  private readonly accentOchreMat = new THREE.MeshStandardMaterial({
    name: 'hull_weathered_ochre',
    color: 0xcd8734,
    map: this.hullTextures.weatheredOchre.map,
    bumpMap: this.hullTextures.weatheredOchre.bumpMap,
    bumpScale: 0.08,
    roughnessMap: this.hullTextures.weatheredOchre.roughnessMap,
    metalness: 0.55,
    roughness: 0.64,
  });
  private readonly darkFrameMat = new THREE.MeshStandardMaterial({
    name: 'hull_dark_charcoal',
    color: 0x242a33,
    map: this.hullTextures.darkRibbing.map,
    bumpMap: this.hullTextures.darkRibbing.bumpMap,
    bumpScale: 0.07,
    roughnessMap: this.hullTextures.darkRibbing.roughnessMap,
    metalness: 0.78,
    roughness: 0.52,
  });
  private readonly steelTrimMat = new THREE.MeshStandardMaterial({
    name: 'hull_steel_trim',
    color: 0x6b7c93,
    map: this.hullTextures.machinedSteel.map,
    bumpMap: this.hullTextures.machinedSteel.bumpMap,
    bumpScale: 0.05,
    roughnessMap: this.hullTextures.machinedSteel.roughnessMap,
    metalness: 0.76,
    roughness: 0.48,
  });
  private readonly cockpitGlassMat = new THREE.MeshStandardMaterial({
    color: 0xfbbf24,
    emissive: 0xd97706,
    emissiveIntensity: 0.9,
    metalness: 0.15,
    roughness: 0.2,
  });
  private readonly cyanSensorMat = new THREE.MeshStandardMaterial({
    color: 0x38bdf8,
    emissive: 0x0284c7,
    emissiveIntensity: 0.85,
    metalness: 0.2,
    roughness: 0.2,
  });
  private readonly engineCoreMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(0.35, 0.85, 1.35),
  });
  private readonly beaconRedMat = new THREE.MeshBasicMaterial({
    color: 0xef4444,
  });

  // Dual-layer mining laser & molten impact materials
  private readonly coreBeamMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(0.75, 0.95, 1.45),
    transparent: true,
    opacity: 0.95,
  });
  private readonly outerSheathMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(1.25, 0.55, 0.15),
    transparent: true,
    opacity: 0.55,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  private readonly impactCoreMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(1.4, 0.82, 0.32),
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

  // Shared Geometries
  private readonly coreBeamGeom = new THREE.CylinderGeometry(0.11, 0.16, 1.0, 10);
  private readonly outerBeamGeom = new THREE.CylinderGeometry(0.28, 0.44, 1.0, 12);
  private readonly impactCoreGeom = new THREE.SphereGeometry(0.85, 12, 12);
  private readonly impactRingGeom = new THREE.TorusGeometry(1.55, 0.16, 8, 24);
  private readonly selectionRingGeom = new THREE.TorusGeometry(5.6, 0.22, 8, 36);
  private readonly factionRingGeom = new THREE.RingGeometry(4.2, 4.75, 24);
  private readonly targetRockRingGeom = new THREE.TorusGeometry(3.8, 0.18, 8, 28);
  private readonly hitSphereGeom = new THREE.SphereGeometry(6.2, 12, 12);
  private readonly sharedGeometries: THREE.BufferGeometry[] = [];
  private readonly factionMaterials = new Map<
    PlayerSlotId,
    {
      readonly accentMat: THREE.MeshStandardMaterial;
      readonly engineMat: THREE.MeshBasicMaterial;
      readonly ringMat: THREE.MeshBasicMaterial;
    }
  >();

  private readonly meshByHarvesterId = new Map<string, HarvesterRenderInstance>();

  constructor() {
    this.rootGroup.name = 'harvester_fleet_group';
    this.coreBeamGeom.rotateX(Math.PI / 2);
    this.coreBeamGeom.translate(0, 0, 0.5);
    this.outerBeamGeom.rotateX(Math.PI / 2);
    this.outerBeamGeom.translate(0, 0, 0.5);
    this.selectionRingGeom.rotateX(Math.PI / 2);
    this.factionRingGeom.rotateX(-Math.PI / 2);
    this.targetRockRingGeom.rotateX(Math.PI / 2);

    this.sharedGeometries.push(
      this.coreBeamGeom,
      this.outerBeamGeom,
      this.impactCoreGeom,
      this.impactRingGeom,
      this.selectionRingGeom,
      this.factionRingGeom,
      this.targetRockRingGeom,
      this.hitSphereGeom,
    );
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
        entry = this.createProspectorMesh(h.id, h.ownerId);
        this.meshByHarvesterId.set(h.id, entry);
        this.rootGroup.add(entry.group);
      }

      const shipY = h.targetRockWorldPos ? h.targetRockWorldPos.y : 1.5;
      entry.group.position.set(h.position.x, shipY, h.position.z);
      entry.shipBody.rotation.y = h.headingRadians;

      // Update the 8 side cargo pod containment windows based on resource type & fill ratio
      const fillRatio = Math.min(
        1,
        Math.max(0, h.cargoAmount / Math.max(1, h.cargoCapacity)),
      );
      if (h.cargoType === 'ore') {
        entry.cargoWindowMat.color.setHex(0xf59e0b);
        entry.cargoWindowMat.emissive.setHex(0xb45309);
      } else {
        entry.cargoWindowMat.color.setHex(0x38bdf8);
        entry.cargoWindowMat.emissive.setHex(0x0284c7);
      }
      entry.cargoWindowMat.emissiveIntensity = 0.22 + fillRatio * 0.78;

      const isSelected = h.id === selectedHarvesterId;
      entry.selectionRing.visible = isSelected;

      // Aim articulating nose drill & dual-layer mining laser at target asteroid/crystal
      if (h.state === 'mining' && h.targetRockWorldPos) {
        const drillWorldOrigin = new THREE.Vector3(
          h.position.x + Math.sin(h.headingRadians) * 4.4,
          shipY - 0.1,
          h.position.z + Math.cos(h.headingRadians) * 4.4,
        );
        const targetWorld = new THREE.Vector3(
          h.targetRockWorldPos.x,
          h.targetRockWorldPos.y,
          h.targetRockWorldPos.z,
        );
        const localBeamStart = new THREE.Vector3(
          drillWorldOrigin.x - h.position.x,
          drillWorldOrigin.y - shipY,
          drillWorldOrigin.z - h.position.z,
        );
        const localTarget = new THREE.Vector3(
          targetWorld.x - h.position.x,
          targetWorld.y - shipY,
          targetWorld.z - h.position.z,
        );
        const beamLength = Math.max(0.8, drillWorldOrigin.distanceTo(targetWorld));

        entry.beamGroup.visible = true;
        entry.beamGroup.position.copy(localBeamStart);
        entry.beamGroup.lookAt(targetWorld);
        entry.coreBeamMesh.scale.set(1, 1, beamLength);
        entry.outerBeamMesh.scale.set(1, 1, beamLength);

        entry.impactSparkGroup.visible = true;
        entry.impactSparkGroup.position.copy(localTarget);
        entry.impactSparkGroup.rotation.y += 0.18;
        entry.impactSparkGroup.rotation.z += 0.12;

        entry.targetRockRing.visible = isSelected;
        entry.targetRockRing.position.copy(localTarget);
      } else {
        entry.beamGroup.visible = false;
        entry.impactSparkGroup.visible = false;
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
        entry.cargoWindowMat.dispose();
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
    for (const entry of this.meshByHarvesterId.values()) {
      entry.cargoWindowMat.dispose();
    }
    this.rootGroup.clear();
    this.meshByHarvesterId.clear();
    for (const g of this.sharedGeometries) {
      g.dispose();
    }
    this.primaryHullMat.dispose();
    this.accentOchreMat.dispose();
    this.darkFrameMat.dispose();
    this.steelTrimMat.dispose();
    this.cockpitGlassMat.dispose();
    this.cyanSensorMat.dispose();
    this.engineCoreMat.dispose();
    this.beaconRedMat.dispose();
    this.coreBeamMat.dispose();
    this.outerSheathMat.dispose();
    this.impactCoreMat.dispose();
    this.selectionRingMat.dispose();
    this.targetRockRingMat.dispose();
    this.hitSphereMat.dispose();
    for (const bundle of this.factionMaterials.values()) {
      bundle.accentMat.dispose();
      bundle.engineMat.dispose();
      bundle.ringMat.dispose();
    }
    this.factionMaterials.clear();
    this.hullTextures.dispose();
  }

  private getFactionMaterials(ownerId: PlayerSlotId): {
    readonly accentMat: THREE.MeshStandardMaterial;
    readonly engineMat: THREE.MeshBasicMaterial;
    readonly ringMat: THREE.MeshBasicMaterial;
  } {
    let bundle = this.factionMaterials.get(ownerId);
    if (!bundle) {
      const palette = FACTION_PALETTES[ownerId];
      bundle = {
        accentMat: new THREE.MeshStandardMaterial({
          name: `harvester_faction_accent_${ownerId}`,
          color: palette.accentHex,
          map: this.hullTextures.weatheredOchre.map,
          bumpMap: this.hullTextures.weatheredOchre.bumpMap,
          bumpScale: 0.08,
          roughnessMap: this.hullTextures.weatheredOchre.roughnessMap,
          metalness: 0.55,
          roughness: 0.64,
        }),
        engineMat: new THREE.MeshBasicMaterial({
          color: new THREE.Color(
            palette.engineColor[0],
            palette.engineColor[1],
            palette.engineColor[2],
          ),
        }),
        ringMat: new THREE.MeshBasicMaterial({
          color: palette.tacticalHex,
          transparent: true,
          opacity: 0.42,
          side: THREE.DoubleSide,
        }),
      };
      this.factionMaterials.set(ownerId, bundle);
    }
    return bundle;
  }

  private registerGeom<T extends THREE.BufferGeometry>(geom: T): T {
    this.sharedGeometries.push(geom);
    return geom;
  }

  private createProspectorMesh(
    harvesterId: string,
    ownerId: PlayerSlotId,
  ): HarvesterRenderInstance {
    const group = new THREE.Group();
    const shipBody = new THREE.Group();
    group.add(shipBody);

    const cargoWindowMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x0284c7,
      emissiveIntensity: 0.45,
      metalness: 0.2,
      roughness: 0.2,
    });
    const cargoWindowMeshes: THREE.Mesh[] = [];

    // 1. Main Fuselage Spine (Gunmetal Slate) & Forward Nose Housing
    const mainSpineGeom = this.registerGeom(new THREE.BoxGeometry(2.1, 1.55, 5.2));
    const mainSpine = new THREE.Mesh(mainSpineGeom, this.primaryHullMat);
    mainSpine.position.set(0, 0, -0.2);
    shipBody.add(mainSpine);

    const noseBlockGeom = this.registerGeom(new THREE.BoxGeometry(1.65, 1.15, 1.5));
    const noseBlock = new THREE.Mesh(noseBlockGeom, this.primaryHullMat);
    noseBlock.position.set(0, -0.1, 2.55);
    shipBody.add(noseBlock);

    // Weathered Ochre Cheek Armor Plates (Port & Starboard forward shoulders)
    const cheekArmorGeom = this.registerGeom(new THREE.BoxGeometry(0.42, 1.18, 2.05));
    for (const side of [-1, 1]) {
      const cheek = new THREE.Mesh(cheekArmorGeom, this.accentOchreMat);
      cheek.position.set(side * 1.08, -0.06, 1.45);
      shipBody.add(cheek);
    }

    // Weathered Ochre Rear Engine Cowling Armor
    const rearCowlingGeom = this.registerGeom(new THREE.BoxGeometry(2.35, 1.62, 1.25));
    const rearCowling = new THREE.Mesh(rearCowlingGeom, this.accentOchreMat);
    rearCowling.position.set(0, 0.04, -2.25);
    shipBody.add(rearCowling);

    // 2. Articulating Mining Drill Assembly (+Z Nose)
    const drillGroup = new THREE.Group();
    drillGroup.position.set(0, -0.12, 3.25);
    shipBody.add(drillGroup);

    const drillCollarGeom = this.registerGeom(
      new THREE.CylinderGeometry(0.46, 0.56, 0.55, 8),
    );
    drillCollarGeom.rotateX(Math.PI / 2);
    drillGroup.add(new THREE.Mesh(drillCollarGeom, this.darkFrameMat));

    const drillBarrelGeom = this.registerGeom(
      new THREE.CylinderGeometry(0.22, 0.34, 1.35, 10),
    );
    drillBarrelGeom.rotateX(Math.PI / 2);
    const drillBarrel = new THREE.Mesh(drillBarrelGeom, this.steelTrimMat);
    drillBarrel.position.set(0, 0, 0.72);
    drillGroup.add(drillBarrel);

    const prongGeom = this.registerGeom(new THREE.BoxGeometry(0.12, 0.12, 1.15));
    for (const vSide of [-1, 1]) {
      const prong = new THREE.Mesh(prongGeom, this.darkFrameMat);
      prong.position.set(0, vSide * 0.32, 0.65);
      drillGroup.add(prong);
    }

    const muzzleRingGeom = this.registerGeom(
      new THREE.TorusGeometry(0.24, 0.06, 8, 16),
    );
    const muzzleRing = new THREE.Mesh(muzzleRingGeom, this.cyanSensorMat);
    muzzleRing.position.set(0, 0, 1.38);
    drillGroup.add(muzzleRing);

    // 3. Elevated Cockpit Module (Warm Cabin Amber Windows + Canopy Struts + Dorsal Antenna)
    const cockpitGroup = new THREE.Group();
    cockpitGroup.position.set(0, 0.96, 1.05);
    shipBody.add(cockpitGroup);

    const cockpitShellGeom = this.registerGeom(new THREE.BoxGeometry(1.42, 0.68, 1.65));
    cockpitGroup.add(new THREE.Mesh(cockpitShellGeom, this.primaryHullMat));

    const cabinGlassGeom = this.registerGeom(new THREE.BoxGeometry(1.26, 0.46, 1.35));
    const cabinGlass = new THREE.Mesh(cabinGlassGeom, this.cockpitGlassMat);
    cabinGlass.position.set(0, 0.04, 0.12);
    cockpitGroup.add(cabinGlass);

    // Dark canopy frame bars over the warm amber glass
    const frameBarGeom = this.registerGeom(new THREE.BoxGeometry(1.32, 0.07, 0.08));
    const frontFrameBar = new THREE.Mesh(frameBarGeom, this.darkFrameMat);
    frontFrameBar.position.set(0, 0.24, 0.78);
    cockpitGroup.add(frontFrameBar);

    // Twin overhead floodlight blisters + Dorsal circular hatch & Antenna Mast
    const blisterGeom = this.registerGeom(new THREE.BoxGeometry(0.28, 0.14, 0.36));
    for (const side of [-1, 1]) {
      const blister = new THREE.Mesh(blisterGeom, this.darkFrameMat);
      blister.position.set(side * 0.34, 0.38, 0.15);
      cockpitGroup.add(blister);
    }

    const dorsalHatchGeom = this.registerGeom(
      new THREE.CylinderGeometry(0.48, 0.52, 0.18, 12),
    );
    const dorsalHatch = new THREE.Mesh(dorsalHatchGeom, this.steelTrimMat);
    dorsalHatch.position.set(0, 0.85, -0.55);
    shipBody.add(dorsalHatch);

    const antennaMastGeom = this.registerGeom(
      new THREE.CylinderGeometry(0.03, 0.05, 1.05, 6),
    );
    const antennaMast = new THREE.Mesh(antennaMastGeom, this.steelTrimMat);
    antennaMast.position.set(-0.22, 1.38, -0.15);
    shipBody.add(antennaMast);

    const beaconTipGeom = this.registerGeom(new THREE.SphereGeometry(0.08, 8, 8));
    const beaconTip = new THREE.Mesh(beaconTipGeom, this.beaconRedMat);
    beaconTip.position.set(-0.22, 1.92, -0.15);
    shipBody.add(beaconTip);

    // 4. 8 Ribbed Side Cargo Pods (2x2 Upper/Lower on Port & Starboard)
    const podCasingGeom = this.registerGeom(new THREE.BoxGeometry(0.92, 0.72, 1.18));
    const podWindowGeom = this.registerGeom(new THREE.BoxGeometry(0.96, 0.44, 0.88));
    const podRibGeom = this.registerGeom(new THREE.BoxGeometry(1.0, 0.78, 0.12));

    const podZOffsets = [-0.05, -1.42];
    const podYOffsets = [0.46, -0.46];

    for (const side of [-1, 1]) {
      for (const yOff of podYOffsets) {
        for (const zOff of podZOffsets) {
          const podGroup = new THREE.Group();
          podGroup.position.set(side * 1.56, yOff, zOff);

          podGroup.add(new THREE.Mesh(podCasingGeom, this.primaryHullMat));

          const winMesh = new THREE.Mesh(podWindowGeom, cargoWindowMat);
          podGroup.add(winMesh);
          cargoWindowMeshes.push(winMesh);

          for (const ribZ of [-0.36, 0.0, 0.36]) {
            const rib = new THREE.Mesh(podRibGeom, this.darkFrameMat);
            rib.position.set(0, 0, ribZ);
            podGroup.add(rib);
          }

          shipBody.add(podGroup);
        }
      }
    }

    // 5. Outboard Wing Pylons & Thruster Nacelles (Port & Starboard)
    const wingStrutGeom = this.registerGeom(new THREE.BoxGeometry(1.65, 0.26, 0.78));
    const nacelleBodyGeom = this.registerGeom(new THREE.BoxGeometry(0.82, 0.88, 1.85));
    const nacelleBandGeom = this.registerGeom(new THREE.BoxGeometry(0.86, 0.92, 0.55));
    const nacelleIntakeGeom = this.registerGeom(new THREE.BoxGeometry(0.46, 0.16, 0.1));
    const underPodGeom = this.registerGeom(
      new THREE.CylinderGeometry(0.26, 0.28, 1.25, 10),
    );
    underPodGeom.rotateX(Math.PI / 2);

    for (const side of [-1, 1]) {
      const strut = new THREE.Mesh(wingStrutGeom, this.darkFrameMat);
      strut.position.set(side * 2.35, 0.0, -1.15);
      shipBody.add(strut);

      const nacelleGroup = new THREE.Group();
      nacelleGroup.position.set(side * 3.18, -0.04, -1.25);

      nacelleGroup.add(new THREE.Mesh(nacelleBodyGeom, this.primaryHullMat));
      const band = new THREE.Mesh(nacelleBandGeom, this.accentOchreMat);
      band.position.set(0, 0, -0.15);
      nacelleGroup.add(band);

      const intake = new THREE.Mesh(nacelleIntakeGeom, this.cyanSensorMat);
      intake.position.set(0, 0.18, 0.92);
      nacelleGroup.add(intake);

      const underPod = new THREE.Mesh(underPodGeom, this.darkFrameMat);
      underPod.position.set(0, -0.66, 0.05);
      nacelleGroup.add(underPod);

      shipBody.add(nacelleGroup);
    }

    // 6. Rear Quad Engine Cluster (-Z Stern) & Ventral Utility Landing Gear
    const nozzleBellGeom = this.registerGeom(
      new THREE.CylinderGeometry(0.36, 0.46, 0.65, 12),
    );
    nozzleBellGeom.rotateX(Math.PI / 2);
    const nozzleCoreGeom = this.registerGeom(new THREE.SphereGeometry(0.3, 10, 10));

    for (const ex of [-0.58, 0.58]) {
      for (const ey of [-0.36, 0.36]) {
        const bell = new THREE.Mesh(nozzleBellGeom, this.darkFrameMat);
        bell.position.set(ex, ey, -3.05);
        shipBody.add(bell);

        const core = new THREE.Mesh(nozzleCoreGeom, this.engineCoreMat);
        core.position.set(ex, ey, -3.32);
        shipBody.add(core);
      }
    }

    // 3 Ventral Landing Gear Skids (1 front chin, 2 aft)
    const gearLegGeom = this.registerGeom(
      new THREE.CylinderGeometry(0.08, 0.1, 0.55, 6),
    );
    const gearPadGeom = this.registerGeom(new THREE.BoxGeometry(0.38, 0.1, 0.56));
    const gearCoords: readonly [number, number][] = [
      [0, 1.85],
      [-0.85, -1.65],
      [0.85, -1.65],
    ];
    for (const [gx, gz] of gearCoords) {
      const leg = new THREE.Mesh(gearLegGeom, this.darkFrameMat);
      leg.position.set(gx, -0.95, gz);
      shipBody.add(leg);

      const pad = new THREE.Mesh(gearPadGeom, this.steelTrimMat);
      pad.position.set(gx, -1.22, gz);
      shipBody.add(pad);
    }

    // 7. Dual-Layer Mining Laser & Asteroid Impact Spark
    const beamGroup = new THREE.Group();
    beamGroup.visible = false;
    const coreBeamMesh = new THREE.Mesh(this.coreBeamGeom, this.coreBeamMat);
    const outerBeamMesh = new THREE.Mesh(this.outerBeamGeom, this.outerSheathMat);
    beamGroup.add(coreBeamMesh, outerBeamMesh);
    group.add(beamGroup);

    const impactSparkGroup = new THREE.Group();
    impactSparkGroup.visible = false;
    impactSparkGroup.add(new THREE.Mesh(this.impactCoreGeom, this.impactCoreMat));
    impactSparkGroup.add(new THREE.Mesh(this.impactRingGeom, this.outerSheathMat));
    group.add(impactSparkGroup);

    const selectionRing = new THREE.Mesh(
      this.selectionRingGeom,
      this.selectionRingMat,
    );
    selectionRing.visible = false;
    group.add(selectionRing);

    // Apply per-faction hull accent, engine tint, and subtle ownership base ring
    const factionMats = this.getFactionMaterials(ownerId);
    shipBody.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) {
        return;
      }
      if (obj.material === this.accentOchreMat) {
        obj.material = factionMats.accentMat;
      } else if (obj.material === this.engineCoreMat) {
        obj.material = factionMats.engineMat;
      }
    });
    const factionRing = new THREE.Mesh(this.factionRingGeom, factionMats.ringMat);
    factionRing.name = 'harvester_faction_ring';
    factionRing.position.set(0, -1.25, 0);
    group.add(factionRing);

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
      drillGroup,
      cargoWindowMeshes,
      beamGroup,
      coreBeamMesh,
      outerBeamMesh,
      impactSparkGroup,
      selectionRing,
      targetRockRing,
      hitMesh,
      cargoWindowMat,
    };
  }
}
