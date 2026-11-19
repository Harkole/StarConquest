import * as THREE from 'three';
import type { ShipClassId } from '../../shared/config/index.ts';
import { createProceduralHullTextures } from './proceduralHullTextures.ts';

export type CombatShipClassId = Exclude<ShipClassId, 'harvester'>;

export interface ShipModelBuildOptions {
  /** Render in holographic construction wireframe mode. */
  readonly wireframe?: boolean;
  /** Parked/staged hangar variant: landing skids deployed, engine exhausts cold. */
  readonly staged?: boolean;
  /** Optional uniform scale override (defaults to canonical 1.0 ship scale). */
  readonly scale?: number;
}

/**
 * Shared 3D Combat Ship Model Builder following `docs/artstyle.md`.
 * Every combat ship is oriented along `+Z` (nose forward, `-Z` stern) to match
 * `HarvesterFleetRenderer` and future fleet navigation heading math.
 */
export class ShipModelLibrary {
  private readonly hullTextures = createProceduralHullTextures();

  // Standardized PBR Materials with procedural industrial hull textures per docs/artstyle.md
  private readonly primaryHullMat = new THREE.MeshStandardMaterial({
    name: 'hull_gunmetal_slate',
    color: 0x46505e,
    map: this.hullTextures.hullPlating.map,
    bumpMap: this.hullTextures.hullPlating.bumpMap,
    bumpScale: 0.06,
    roughnessMap: this.hullTextures.hullPlating.roughnessMap,
    metalness: 0.68,
    roughness: 0.56,
  });
  private readonly accentOchreMat = new THREE.MeshStandardMaterial({
    name: 'hull_weathered_ochre',
    color: 0xcd8734,
    map: this.hullTextures.weatheredOchre.map,
    bumpMap: this.hullTextures.weatheredOchre.bumpMap,
    bumpScale: 0.06,
    roughnessMap: this.hullTextures.weatheredOchre.roughnessMap,
    metalness: 0.55,
    roughness: 0.62,
  });
  private readonly darkFrameMat = new THREE.MeshStandardMaterial({
    name: 'hull_dark_charcoal',
    color: 0x242a33,
    map: this.hullTextures.darkRibbing.map,
    bumpMap: this.hullTextures.darkRibbing.bumpMap,
    bumpScale: 0.05,
    roughnessMap: this.hullTextures.darkRibbing.roughnessMap,
    metalness: 0.78,
    roughness: 0.5,
  });
  private readonly steelTrimMat = new THREE.MeshStandardMaterial({
    name: 'hull_steel_trim',
    color: 0x6b7c93,
    map: this.hullTextures.machinedSteel.map,
    bumpMap: this.hullTextures.machinedSteel.bumpMap,
    bumpScale: 0.04,
    roughnessMap: this.hullTextures.machinedSteel.roughnessMap,
    metalness: 0.76,
    roughness: 0.46,
  });
  private readonly turretBarrelMat = new THREE.MeshStandardMaterial({
    name: 'turret_barrel_steel',
    color: 0x8492a6,
    map: this.hullTextures.machinedSteel.map,
    bumpMap: this.hullTextures.machinedSteel.bumpMap,
    bumpScale: 0.05,
    roughnessMap: this.hullTextures.machinedSteel.roughnessMap,
    metalness: 0.84,
    roughness: 0.36,
  });
  private readonly cockpitCanopyMat = new THREE.MeshStandardMaterial({
    name: 'ship_cockpit_canopy',
    color: 0x7dd3fc,
    emissive: 0x0c4a6e,
    emissiveIntensity: 0.55,
    metalness: 0.25,
    roughness: 0.14,
  });
  private readonly warmCabinMat = new THREE.MeshStandardMaterial({
    name: 'ship_warm_cabin',
    color: 0xfbbf24,
    emissive: 0xd97706,
    emissiveIntensity: 0.85,
    metalness: 0.15,
    roughness: 0.2,
  });
  private readonly intakeCyanMat = new THREE.MeshStandardMaterial({
    name: 'ship_intake_cyan',
    color: 0x38bdf8,
    emissive: 0x0284c7,
    emissiveIntensity: 0.75,
    metalness: 0.2,
    roughness: 0.18,
  });
  private readonly engineCoreMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(0.35, 0.85, 1.35),
  });
  private readonly buildingWireframeMat = new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
    wireframe: true,
    transparent: true,
    opacity: 0.78,
  });

  private readonly geometries: THREE.BufferGeometry[] = [];

  // Light Fighter "Stinger" reusable geometries (canonical ~1.22u length x 1.04u wingspan)
  private readonly stingerMidHullGeom = this.registerGeom(
    new THREE.BoxGeometry(0.42, 0.28, 0.52),
  );
  private readonly stingerOchreBandGeom = this.registerGeom(
    new THREE.BoxGeometry(0.445, 0.295, 0.13),
  );
  private readonly stingerAftHullGeom = this.registerGeom(
    new THREE.BoxGeometry(0.34, 0.24, 0.28),
  );
  private readonly stingerNoseChinGeom = this.registerGeom(
    new THREE.BoxGeometry(0.32, 0.14, 0.36),
  );
  private readonly stingerCanopyMainGeom = this.registerGeom(
    new THREE.BoxGeometry(0.28, 0.17, 0.34),
  );
  private readonly stingerCanopySlopeGeom = this.registerGeom(
    new THREE.CylinderGeometry(0.11, 0.19, 0.24, 6).rotateX(Math.PI / 2),
  );
  private readonly stingerCanopyMullionGeom = this.registerGeom(
    new THREE.BoxGeometry(0.025, 0.19, 0.36),
  );
  private readonly stingerCanopyCrossBarGeom = this.registerGeom(
    new THREE.BoxGeometry(0.305, 0.024, 0.03),
  );
  private readonly stingerDorsalBlisterGeom = this.registerGeom(
    new THREE.BoxGeometry(0.12, 0.075, 0.16),
  );
  private readonly stingerStubWingGeom = this.registerGeom(
    new THREE.BoxGeometry(0.24, 0.09, 0.26),
  );
  private readonly stingerEnginePodGeom = this.registerGeom(
    new THREE.CylinderGeometry(0.088, 0.095, 0.32, 10).rotateX(Math.PI / 2),
  );
  private readonly stingerPodCollarGeom = this.registerGeom(
    new THREE.CylinderGeometry(0.098, 0.098, 0.045, 10).rotateX(Math.PI / 2),
  );
  private readonly stingerPodIntakeGeom = this.registerGeom(
    new THREE.CylinderGeometry(0.055, 0.082, 0.06, 10).rotateX(Math.PI / 2),
  );
  private readonly stingerNozzleBellGeom = this.registerGeom(
    new THREE.CylinderGeometry(0.052, 0.072, 0.09, 10).rotateX(Math.PI / 2),
  );
  private readonly stingerExhaustCoreGeom = this.registerGeom(
    new THREE.CylinderGeometry(0.042, 0.042, 0.03, 10).rotateX(Math.PI / 2),
  );
  private readonly stingerGimbalMountGeom = this.registerGeom(
    new THREE.BoxGeometry(0.12, 0.11, 0.16),
  );
  private readonly stingerCannonBarrelGeom = this.registerGeom(
    new THREE.CylinderGeometry(0.018, 0.022, 0.34, 8).rotateX(Math.PI / 2),
  );
  private readonly stingerCheekPodGeom = this.registerGeom(
    new THREE.CylinderGeometry(0.044, 0.052, 0.18, 8).rotateX(Math.PI / 2),
  );
  private readonly stingerLandingStrutGeom = this.registerGeom(
    new THREE.BoxGeometry(0.03, 0.09, 0.04),
  );
  private readonly stingerLandingSkidGeom = this.registerGeom(
    new THREE.BoxGeometry(0.05, 0.022, 0.2),
  );

  // Destroyer "Havoc" reusable geometries (canonical ~4.8u length x ~1.72u width x ~1.05u height, ~4x Stinger)
  private readonly havocForwardHullGeom = this.registerGeom(
    new THREE.BoxGeometry(0.92, 0.58, 2.35),
  );
  private readonly havocForwardSpineGeom = this.registerGeom(
    new THREE.BoxGeometry(0.46, 0.16, 2.15),
  );
  private readonly havocProwCavityGeom = this.registerGeom(
    new THREE.BoxGeometry(0.56, 0.4, 0.22),
  );
  private readonly havocProwWindowGeom = this.registerGeom(
    new THREE.BoxGeometry(0.18, 0.08, 0.06),
  );
  private readonly havocOchreStripeGeom = this.registerGeom(
    new THREE.BoxGeometry(0.955, 0.12, 1.85),
  );
  private readonly havocMidHullGeom = this.registerGeom(
    new THREE.BoxGeometry(1.16, 0.68, 1.25),
  );
  private readonly havocAftHullGeom = this.registerGeom(
    new THREE.BoxGeometry(1.02, 0.62, 1.15),
  );
  private readonly havocAftOchrePatchGeom = this.registerGeom(
    new THREE.BoxGeometry(0.98, 0.06, 0.42),
  );
  private readonly havocSideBridgeFrameGeom = this.registerGeom(
    new THREE.BoxGeometry(0.24, 0.46, 0.62),
  );
  private readonly havocSideBridgeGlassGeom = this.registerGeom(
    new THREE.BoxGeometry(0.26, 0.32, 0.46),
  );
  private readonly havocBridgeMullionGeom = this.registerGeom(
    new THREE.BoxGeometry(0.275, 0.04, 0.48),
  );
  private readonly havocTurretPedestalGeom = this.registerGeom(
    new THREE.CylinderGeometry(0.32, 0.4, 0.2, 8),
  );
  private readonly havocTurretHousingGeom = this.registerGeom(
    new THREE.BoxGeometry(0.42, 0.24, 0.56),
  );
  private readonly havocTurretBustleGeom = this.registerGeom(
    new THREE.BoxGeometry(0.36, 0.14, 0.22),
  );
  private readonly havocMainBarrelGeom = this.registerGeom(
    new THREE.CylinderGeometry(0.036, 0.044, 0.92, 8).rotateX(Math.PI / 2),
  );
  private readonly havocPdHousingGeom = this.registerGeom(
    new THREE.BoxGeometry(0.16, 0.12, 0.2),
  );
  private readonly havocPdBarrelGeom = this.registerGeom(
    new THREE.CylinderGeometry(0.018, 0.022, 0.28, 6).rotateX(Math.PI / 2),
  );
  private readonly havocPodMainGeom = this.registerGeom(
    new THREE.CylinderGeometry(0.2, 0.23, 1.05, 12).rotateX(Math.PI / 2),
  );
  private readonly havocPodCollarGeom = this.registerGeom(
    new THREE.CylinderGeometry(0.245, 0.245, 0.1, 12).rotateX(Math.PI / 2),
  );
  private readonly havocPodIntakeRimGeom = this.registerGeom(
    new THREE.CylinderGeometry(0.14, 0.2, 0.16, 12).rotateX(Math.PI / 2),
  );
  private readonly havocPodIntakeGlowGeom = this.registerGeom(
    new THREE.CylinderGeometry(0.11, 0.11, 0.04, 12).rotateX(Math.PI / 2),
  );
  private readonly havocPodNozzleGeom = this.registerGeom(
    new THREE.CylinderGeometry(0.14, 0.18, 0.24, 12).rotateX(Math.PI / 2),
  );
  private readonly havocExhaustCoreGeom = this.registerGeom(
    new THREE.CylinderGeometry(0.115, 0.115, 0.05, 12).rotateX(Math.PI / 2),
  );
  private readonly havocSternNozzleGeom = this.registerGeom(
    new THREE.CylinderGeometry(0.12, 0.16, 0.26, 10).rotateX(Math.PI / 2),
  );
  private readonly havocSternCoreGeom = this.registerGeom(
    new THREE.CylinderGeometry(0.095, 0.095, 0.05, 10).rotateX(Math.PI / 2),
  );
  private readonly havocPodPylonGeom = this.registerGeom(
    new THREE.BoxGeometry(0.32, 0.18, 0.65),
  );

  private registerGeom<T extends THREE.BufferGeometry>(geom: T): T {
    this.geometries.push(geom);
    return geom;
  }

  public dispose(): void {
    for (const g of this.geometries) {
      g.dispose();
    }
    this.primaryHullMat.dispose();
    this.accentOchreMat.dispose();
    this.darkFrameMat.dispose();
    this.steelTrimMat.dispose();
    this.turretBarrelMat.dispose();
    this.cockpitCanopyMat.dispose();
    this.warmCabinMat.dispose();
    this.intakeCyanMat.dispose();
    this.engineCoreMat.dispose();
    this.buildingWireframeMat.dispose();
    this.hullTextures.dispose();
  }

  /**
   * Builds the approved 3D model for a combat ship class (starting with Light Fighter "Stinger").
   */
  public buildShipMesh(
    shipClassId: CombatShipClassId,
    options: ShipModelBuildOptions = {},
  ): THREE.Group {
    switch (shipClassId) {
      case 'fighter':
        return this.buildStingerFighterMesh(options);
      case 'destroyer':
        return this.buildHavocDestroyerMesh(options);
      default:
        // Remaining 3 combat ship classes (cruiser, carrier, dreadnought) will be added one by one
        return this.buildHavocDestroyerMesh({ ...options, scale: options.scale ?? 1.0 });
    }
  }

  /**
   * Builds the Light Fighter "Stinger" (docs/artstyle.md #11):
   * - Compact heavy-industrial carrier/hub-borne interceptor (~1.22u long x 1.04u wide).
   * - Sloped multi-pane framed glass cockpit canopy (+Z nose) with gunmetal chin housing.
   * - Chunky gunmetal fuselage wrapped in its signature vertical Weathered Ochre band.
   * - Chin-mounted gimbaled twin-barrel machined steel autocannon + flanking cheek weapon pods.
   * - Short stub wings carrying 4 vertically stacked outboard Engine Cluster Pods,
   *   2 upper dorsal shoulder pods, and a 2x2 quad rear main thruster cluster.
   * - Optional staged/hangar configuration (cold engines + deployed ventral landing skids).
   */
  public buildStingerFighterMesh(options: ShipModelBuildOptions = {}): THREE.Group {
    const wireframe = options.wireframe ?? false;
    const staged = options.staged ?? false;
    const scale = options.scale ?? 1.0;

    const root = new THREE.Group();
    root.name = 'ship_fighter_stinger';

    const hullMat = wireframe ? this.buildingWireframeMat : this.primaryHullMat;
    const ochreMat = wireframe ? this.buildingWireframeMat : this.accentOchreMat;
    const frameMat = wireframe ? this.buildingWireframeMat : this.darkFrameMat;
    const trimMat = wireframe ? this.buildingWireframeMat : this.steelTrimMat;
    const barrelMat = wireframe ? this.buildingWireframeMat : this.turretBarrelMat;
    const canopyMat = wireframe ? this.buildingWireframeMat : this.cockpitCanopyMat;
    const exhaustMat = wireframe ? this.buildingWireframeMat : this.engineCoreMat;

    // 1. Core Chunky Fuselage, Signature Vertical Weathered Ochre Band & Dorsal Sensor Blister
    const midHull = new THREE.Mesh(this.stingerMidHullGeom, hullMat);
    midHull.position.set(0, 0.02, -0.04);
    root.add(midHull);

    const ochreBand = new THREE.Mesh(this.stingerOchreBandGeom, ochreMat);
    ochreBand.position.set(0, 0.02, 0.06);
    root.add(ochreBand);

    const aftHull = new THREE.Mesh(this.stingerAftHullGeom, hullMat);
    aftHull.position.set(0, 0.03, -0.34);
    root.add(aftHull);

    const dorsalBlister = new THREE.Mesh(this.stingerDorsalBlisterGeom, frameMat);
    dorsalBlister.position.set(0, 0.195, -0.26);
    root.add(dorsalBlister);

    const dorsalCap = new THREE.Mesh(this.stingerDorsalBlisterGeom, ochreMat);
    dorsalCap.scale.set(0.75, 0.38, 0.62);
    dorsalCap.position.set(0, 0.238, -0.26);
    root.add(dorsalCap);

    // 2. Faceted Multi-Pane Cockpit Canopy Module (+Z Nose) & Gunmetal Chin Housing
    const noseChin = new THREE.Mesh(this.stingerNoseChinGeom, hullMat);
    noseChin.position.set(0, -0.05, 0.3);
    root.add(noseChin);

    const canopyCore = new THREE.Mesh(this.stingerCanopyMainGeom, canopyMat);
    canopyCore.position.set(0, 0.075, 0.28);
    root.add(canopyCore);

    const canopySlope = new THREE.Mesh(this.stingerCanopySlopeGeom, canopyMat);
    canopySlope.position.set(0, 0.055, 0.43);
    root.add(canopySlope);

    // Dark structural canopy frame mullions (center & port/starboard ribs + forward crossbar)
    for (const mullionX of [-0.135, 0, 0.135]) {
      const mullion = new THREE.Mesh(this.stingerCanopyMullionGeom, frameMat);
      mullion.position.set(mullionX, 0.078, 0.29);
      root.add(mullion);
    }
    const crossBar = new THREE.Mesh(this.stingerCanopyCrossBarGeom, frameMat);
    crossBar.position.set(0, 0.155, 0.34);
    root.add(crossBar);

    // 3. Chin-Mounted Gimbaled Twin-Barrel Autocannon + Flanking Nose Cheek Pods
    const gimbalGroup = new THREE.Group();
    gimbalGroup.name = 'stinger_chin_turret';
    gimbalGroup.position.set(0, -0.145, 0.38);
    gimbalGroup.add(new THREE.Mesh(this.stingerGimbalMountGeom, frameMat));

    for (const barrelX of [-0.028, 0.028]) {
      const barrel = new THREE.Mesh(this.stingerCannonBarrelGeom, barrelMat);
      barrel.position.set(barrelX, -0.01, 0.22);
      gimbalGroup.add(barrel);
    }
    root.add(gimbalGroup);

    for (const side of [-1, 1]) {
      const cheekPod = new THREE.Mesh(this.stingerCheekPodGeom, trimMat);
      cheekPod.position.set(side * 0.2, -0.075, 0.32);
      root.add(cheekPod);
    }

    // 4. Short Stub Wings + 4 Vertically Stacked Outboard Engine Cluster Pods + 2 Upper Dorsal Shoulder Pods
    const addEnginePod = (x: number, y: number, z: number, podScale = 1.0): void => {
      const pod = new THREE.Group();
      pod.position.set(x, y, z);
      pod.scale.setScalar(podScale);

      pod.add(new THREE.Mesh(this.stingerEnginePodGeom, hullMat));

      const collar = new THREE.Mesh(this.stingerPodCollarGeom, frameMat);
      collar.position.set(0, 0, 0.02);
      pod.add(collar);

      const intake = new THREE.Mesh(this.stingerPodIntakeGeom, frameMat);
      intake.position.set(0, 0, 0.18);
      pod.add(intake);

      const nozzle = new THREE.Mesh(this.stingerNozzleBellGeom, frameMat);
      nozzle.position.set(0, 0, -0.19);
      pod.add(nozzle);

      if (!staged) {
        const core = new THREE.Mesh(this.stingerExhaustCoreGeom, exhaustMat);
        core.position.set(0, 0, -0.23);
        pod.add(core);
      }

      root.add(pod);
    };

    for (const side of [-1, 1]) {
      // Stub wing pylon
      const wing = new THREE.Mesh(this.stingerStubWingGeom, hullMat);
      wing.position.set(side * 0.31, -0.01, -0.14);
      root.add(wing);

      // Stacked upper + lower outboard Engine Cluster Pods (4 total)
      addEnginePod(side * 0.44, 0.055, -0.22, 0.92);
      addEnginePod(side * 0.44, -0.105, -0.22, 0.92);

      // Upper dorsal shoulder thruster pod (2 total)
      addEnginePod(side * 0.24, 0.165, -0.2, 0.85);
    }

    // 5. Quad Rear Main Engine Nozzles (2x2 stern cluster)
    for (const side of [-1, 1]) {
      for (const rowY of [-0.045, 0.095]) {
        const nozzle = new THREE.Mesh(this.stingerNozzleBellGeom, frameMat);
        nozzle.position.set(side * 0.095, rowY, -0.5);
        root.add(nozzle);

        if (!staged) {
          const core = new THREE.Mesh(this.stingerExhaustCoreGeom, exhaustMat);
          core.position.set(side * 0.095, rowY, -0.545);
          root.add(core);
        }
      }
    }

    // 6. Retractable Ventral Landing Skids (deployed when staged on Atlas/Carrier decks)
    if (staged) {
      for (const side of [-1, 1]) {
        const strut = new THREE.Mesh(this.stingerLandingStrutGeom, frameMat);
        strut.position.set(side * 0.14, -0.17, -0.22);
        root.add(strut);

        const skid = new THREE.Mesh(this.stingerLandingSkidGeom, trimMat);
        skid.position.set(side * 0.14, -0.22, -0.22);
        root.add(skid);
      }
    }

    if (scale !== 1.0) {
      root.scale.setScalar(scale);
    }

    return root;
  }

  /**
   * Builds the Destroyer "Havoc" (docs/artstyle.md #12):
   * - Hull-based scale: ~4.8u long x ~1.72u wide x ~1.05u tall (~4x Stinger Light Fighter).
   * - Elongated heavy-industrial rectangular bow (+Z) with central spine plating, weathered ochre
   *   flank stripes, recessed prow intake cavity, and warm amber bow navigation slits.
   * - Paired side-mounted multi-tier armored Command Bridge modules with warm amber windows.
   * - Prominent dorsal twin-barrel Medium Anti-Ship Turret (`havoc_dorsal_turret`) with machined
   *   steel grey barrels (`#8492a6`), plus 4 side-mounted and 2 ventral Light Flak PD turrets.
   * - 4 articulated outboard cylindrical Engine Cluster Pods (with glowing cyan intakes) plus
   *   a 2x2 quad rear main thruster bell cluster.
   */
  public buildHavocDestroyerMesh(options: ShipModelBuildOptions = {}): THREE.Group {
    const wireframe = options.wireframe ?? false;
    const staged = options.staged ?? false;
    const scale = options.scale ?? 1.0;

    const root = new THREE.Group();
    root.name = 'ship_destroyer_havoc';

    const hullMat = wireframe ? this.buildingWireframeMat : this.primaryHullMat;
    const ochreMat = wireframe ? this.buildingWireframeMat : this.accentOchreMat;
    const frameMat = wireframe ? this.buildingWireframeMat : this.darkFrameMat;
    const barrelMat = wireframe ? this.buildingWireframeMat : this.turretBarrelMat;
    const cabinMat = wireframe ? this.buildingWireframeMat : this.warmCabinMat;
    const intakeMat = wireframe ? this.buildingWireframeMat : this.intakeCyanMat;
    const exhaustMat = wireframe ? this.buildingWireframeMat : this.engineCoreMat;

    // 1. Elongated Rectangular Armored Bow, Central Spine Plating & Weathered Ochre Flank Stripes (+Z Bow)
    const forwardHull = new THREE.Mesh(this.havocForwardHullGeom, hullMat);
    forwardHull.position.set(0, 0, 1.15);
    root.add(forwardHull);

    const forwardSpine = new THREE.Mesh(this.havocForwardSpineGeom, frameMat);
    forwardSpine.position.set(0, 0.34, 1.05);
    root.add(forwardSpine);

    const ochreStripe = new THREE.Mesh(this.havocOchreStripeGeom, ochreMat);
    ochreStripe.position.set(0, 0.14, 1.12);
    root.add(ochreStripe);

    const prowCavity = new THREE.Mesh(this.havocProwCavityGeom, frameMat);
    prowCavity.position.set(0, -0.02, 2.26);
    root.add(prowCavity);

    const prowTopSlit = new THREE.Mesh(this.havocProwWindowGeom, cabinMat);
    prowTopSlit.position.set(0, 0.22, 2.34);
    root.add(prowTopSlit);

    const prowBotSlit = new THREE.Mesh(this.havocProwWindowGeom, cabinMat);
    prowBotSlit.scale.set(0.75, 0.8, 1.0);
    prowBotSlit.position.set(0, -0.2, 2.34);
    root.add(prowBotSlit);

    // 2. Mid-Aft Armored Hull, Aft Dorsal Ochre Armor Patches & Side-Mounted Command Bridge Modules
    const midHull = new THREE.Mesh(this.havocMidHullGeom, hullMat);
    midHull.position.set(0, 0.03, -0.42);
    root.add(midHull);

    const aftHull = new THREE.Mesh(this.havocAftHullGeom, hullMat);
    aftHull.position.set(0, 0.02, -1.52);
    root.add(aftHull);

    const aftOchreMid = new THREE.Mesh(this.havocAftOchrePatchGeom, ochreMat);
    aftOchreMid.position.set(0, 0.37, -1.22);
    root.add(aftOchreMid);

    const aftOchreRear = new THREE.Mesh(this.havocAftOchrePatchGeom, ochreMat);
    aftOchreRear.scale.set(0.75, 1.0, 0.72);
    aftOchreRear.position.set(0, 0.35, -1.92);
    root.add(aftOchreRear);

    // Paired Port & Starboard Armored Side Command Bridge Bays (warm amber multi-tier windows)
    for (const side of [-1, 1]) {
      const bridgeFrame = new THREE.Mesh(this.havocSideBridgeFrameGeom, frameMat);
      bridgeFrame.position.set(side * 0.56, 0.0, -0.45);
      root.add(bridgeFrame);

      const bridgeGlass = new THREE.Mesh(this.havocSideBridgeGlassGeom, cabinMat);
      bridgeGlass.position.set(side * 0.58, 0.0, -0.45);
      root.add(bridgeGlass);

      const mullion = new THREE.Mesh(this.havocBridgeMullionGeom, frameMat);
      mullion.position.set(side * 0.59, 0.0, -0.45);
      root.add(mullion);
    }

    // 3. Prominent Dorsal Twin-Barrel Medium Anti-Ship Turret (`havoc_dorsal_turret`)
    const pedestal = new THREE.Mesh(this.havocTurretPedestalGeom, frameMat);
    pedestal.position.set(0, 0.46, -0.25);
    root.add(pedestal);

    const dorsalTurretPivot = new THREE.Group();
    dorsalTurretPivot.name = 'havoc_dorsal_turret';
    dorsalTurretPivot.position.set(0, 0.62, -0.25);

    dorsalTurretPivot.add(new THREE.Mesh(this.havocTurretHousingGeom, hullMat));

    const bustle = new THREE.Mesh(this.havocTurretBustleGeom, ochreMat);
    bustle.position.set(0, 0.05, -0.32);
    dorsalTurretPivot.add(bustle);

    for (const barrelX of [-0.075, 0.075]) {
      const barrel = new THREE.Mesh(this.havocMainBarrelGeom, barrelMat);
      barrel.position.set(barrelX, 0.03, 0.65);
      dorsalTurretPivot.add(barrel);
    }
    root.add(dorsalTurretPivot);

    // 4. Side-Mounted (x4) & Ventral (x2) Light Flak Point-Defence Batteries
    const pdPivots: THREE.Group[] = [];
    for (const side of [-1, 1]) {
      for (const zPos of [1.25, 0.42]) {
        const pd = new THREE.Group();
        pd.position.set(side * 0.52, -0.05, zPos);
        pd.rotation.y = side * (Math.PI / 2);
        pd.add(new THREE.Mesh(this.havocPdHousingGeom, frameMat));
        for (const bx of [-0.032, 0.032]) {
          const b = new THREE.Mesh(this.havocPdBarrelGeom, barrelMat);
          b.position.set(bx, 0.01, 0.16);
          pd.add(b);
        }
        root.add(pd);
        pdPivots.push(pd);
      }
    }

    for (const zPos of [1.15, 0.35]) {
      const vpd = new THREE.Group();
      vpd.position.set(0, -0.34, zPos);
      vpd.add(new THREE.Mesh(this.havocPdHousingGeom, frameMat));
      for (const bx of [-0.032, 0.032]) {
        const b = new THREE.Mesh(this.havocPdBarrelGeom, barrelMat);
        b.position.set(bx, -0.02, 0.16);
        vpd.add(b);
      }
      root.add(vpd);
      pdPivots.push(vpd);
    }

    // Expose turret pivots for Step 4 combat target tracking (stationary while idle)
    root.userData.turretPivots = {
      dorsalTurretPivot,
      pdTurretPivots: pdPivots,
    };

    // 5. Quad Articulated Outboard Engine Cluster Pods (2x2 Port/Starboard) + Quad Stern Thrusters
    for (const side of [-1, 1]) {
      const pylon = new THREE.Mesh(this.havocPodPylonGeom, frameMat);
      pylon.position.set(side * 0.62, 0.0, -1.45);
      root.add(pylon);

      for (const podY of [0.24, -0.22]) {
        const pod = new THREE.Group();
        pod.position.set(side * 0.78, podY, -1.48);

        pod.add(new THREE.Mesh(this.havocPodMainGeom, hullMat));

        const collar = new THREE.Mesh(this.havocPodCollarGeom, frameMat);
        collar.position.set(0, 0, -0.08);
        pod.add(collar);

        const intakeRim = new THREE.Mesh(this.havocPodIntakeRimGeom, frameMat);
        intakeRim.position.set(0, 0, 0.56);
        pod.add(intakeRim);

        const intakeGlow = new THREE.Mesh(this.havocPodIntakeGlowGeom, intakeMat);
        intakeGlow.position.set(0, 0, 0.64);
        pod.add(intakeGlow);

        const nozzle = new THREE.Mesh(this.havocPodNozzleGeom, frameMat);
        nozzle.position.set(0, 0, -0.62);
        pod.add(nozzle);

        if (!staged) {
          const core = new THREE.Mesh(this.havocExhaustCoreGeom, exhaustMat);
          core.position.set(0, 0, -0.74);
          pod.add(core);
        }

        root.add(pod);
      }
    }

    // 2x2 Rear Stern Main Thruster Bells
    for (const side of [-1, 1]) {
      for (const rowY of [-0.15, 0.18]) {
        const sternNozzle = new THREE.Mesh(this.havocSternNozzleGeom, frameMat);
        sternNozzle.position.set(side * 0.28, rowY, -2.22);
        root.add(sternNozzle);

        if (!staged) {
          const core = new THREE.Mesh(this.havocSternCoreGeom, exhaustMat);
          core.position.set(side * 0.28, rowY, -2.35);
          root.add(core);
        }
      }
    }

    if (scale !== 1.0) {
      root.scale.setScalar(scale);
    }

    return root;
  }
}
