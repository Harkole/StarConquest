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

  // Cruiser reusable geometries (canonical ~7.5u length x ~2.55u width x ~1.65u height, ~1.56x Havoc)
  private readonly cruiserForeHullGeom = this.registerGeom(
    new THREE.BoxGeometry(1.38, 0.88, 3.65),
  );
  private readonly cruiserAftHullGeom = this.registerGeom(
    new THREE.BoxGeometry(1.56, 0.96, 3.35),
  );
  private readonly cruiserDorsalSpineGeom = this.registerGeom(
    new THREE.BoxGeometry(0.76, 0.24, 5.15),
  );
  private readonly cruiserOchreStripeGeom = this.registerGeom(
    new THREE.BoxGeometry(1.43, 0.16, 2.95),
  );
  private readonly cruiserAftOchreBandGeom = this.registerGeom(
    new THREE.BoxGeometry(1.6, 0.14, 1.15),
  );
  private readonly cruiserProwCavityGeom = this.registerGeom(
    new THREE.BoxGeometry(0.84, 0.58, 0.34),
  );
  private readonly cruiserProwSlitGeom = this.registerGeom(
    new THREE.BoxGeometry(0.28, 0.11, 0.08),
  );
  private readonly cruiserSideBulkheadGeom = this.registerGeom(
    new THREE.CylinderGeometry(0.42, 0.46, 0.24, 8).rotateZ(Math.PI / 2),
  );
  private readonly cruiserBridgeBayGeom = this.registerGeom(
    new THREE.BoxGeometry(0.22, 0.44, 0.68),
  );
  private readonly cruiserBarbetteGeom = this.registerGeom(
    new THREE.CylinderGeometry(0.46, 0.56, 0.26, 12),
  );
  private readonly cruiserHeavyTurretHousingGeom = this.registerGeom(
    new THREE.BoxGeometry(0.62, 0.34, 0.78),
  );
  private readonly cruiserHeavyTurretCapGeom = this.registerGeom(
    new THREE.BoxGeometry(0.52, 0.14, 0.44),
  );
  private readonly cruiserHeavyBarrelGeom = this.registerGeom(
    new THREE.CylinderGeometry(0.052, 0.062, 1.32, 8).rotateX(Math.PI / 2),
  );
  private readonly cruiserPodMainGeom = this.registerGeom(
    new THREE.CylinderGeometry(0.3, 0.34, 1.55, 12).rotateX(Math.PI / 2),
  );
  private readonly cruiserPodCollarGeom = this.registerGeom(
    new THREE.CylinderGeometry(0.365, 0.365, 0.14, 12).rotateX(Math.PI / 2),
  );
  private readonly cruiserPodIntakeRimGeom = this.registerGeom(
    new THREE.CylinderGeometry(0.22, 0.3, 0.22, 12).rotateX(Math.PI / 2),
  );
  private readonly cruiserPodIntakeGlowGeom = this.registerGeom(
    new THREE.CylinderGeometry(0.18, 0.18, 0.05, 12).rotateX(Math.PI / 2),
  );
  private readonly cruiserPodNozzleGeom = this.registerGeom(
    new THREE.CylinderGeometry(0.22, 0.27, 0.34, 12).rotateX(Math.PI / 2),
  );
  private readonly cruiserExhaustCoreGeom = this.registerGeom(
    new THREE.CylinderGeometry(0.18, 0.18, 0.06, 12).rotateX(Math.PI / 2),
  );
  private readonly cruiserSternNozzleGeom = this.registerGeom(
    new THREE.CylinderGeometry(0.18, 0.23, 0.36, 10).rotateX(Math.PI / 2),
  );
  private readonly cruiserSternCoreGeom = this.registerGeom(
    new THREE.CylinderGeometry(0.14, 0.14, 0.06, 10).rotateX(Math.PI / 2),
  );
  private readonly cruiserPodPylonGeom = this.registerGeom(
    new THREE.BoxGeometry(0.46, 0.26, 0.96),
  );

  // Dreadnought "Imperator" reusable geometries (canonical ~14.5u length x ~5.1u width x ~3.8u height)
  private readonly imperatorJawUpperGeom = this.registerGeom(
    new THREE.BoxGeometry(2.45, 0.56, 4.4),
  );
  private readonly imperatorJawLowerGeom = this.registerGeom(
    new THREE.BoxGeometry(2.3, 0.48, 4.25),
  );
  private readonly imperatorSpinalCoreGeom = this.registerGeom(
    new THREE.CylinderGeometry(0.44, 0.48, 3.85, 12).rotateX(Math.PI / 2),
  );
  private readonly imperatorSpinalRingGeom = this.registerGeom(
    new THREE.CylinderGeometry(0.62, 0.62, 0.16, 12).rotateX(Math.PI / 2),
  );
  private readonly imperatorSpinalMuzzleGeom = this.registerGeom(
    new THREE.CylinderGeometry(0.68, 0.58, 0.48, 12).rotateX(Math.PI / 2),
  );
  private readonly imperatorForeHullGeom = this.registerGeom(
    new THREE.BoxGeometry(2.75, 1.72, 5.2),
  );
  private readonly imperatorOchreStripeGeom = this.registerGeom(
    new THREE.BoxGeometry(2.84, 0.26, 7.6),
  );
  private readonly imperatorCitadelFlareGeom = this.registerGeom(
    new THREE.CylinderGeometry(2.55, 2.75, 1.85, 6),
  );
  private readonly imperatorAftHullGeom = this.registerGeom(
    new THREE.BoxGeometry(2.85, 1.75, 4.4),
  );
  private readonly imperatorAftOchreDeckGeom = this.registerGeom(
    new THREE.BoxGeometry(2.7, 0.14, 1.85),
  );
  private readonly imperatorBridgeTier1Geom = this.registerGeom(
    new THREE.BoxGeometry(2.25, 0.68, 2.55),
  );
  private readonly imperatorBridgeTier2Geom = this.registerGeom(
    new THREE.BoxGeometry(1.75, 0.58, 1.95),
  );
  private readonly imperatorBridgeTier3Geom = this.registerGeom(
    new THREE.BoxGeometry(1.25, 0.48, 1.35),
  );
  private readonly imperatorBridgeCrownGeom = this.registerGeom(
    new THREE.BoxGeometry(0.76, 0.36, 0.85),
  );
  private readonly imperatorBridgeWindowGeom = this.registerGeom(
    new THREE.BoxGeometry(1.82, 0.14, 2.02),
  );
  private readonly imperatorBridgeMastGeom = this.registerGeom(
    new THREE.CylinderGeometry(0.03, 0.055, 0.85, 6),
  );
  private readonly imperatorTurretBaseGeom = this.registerGeom(
    new THREE.CylinderGeometry(0.54, 0.66, 0.28, 10),
  );
  private readonly imperatorTurretHousingGeom = this.registerGeom(
    new THREE.BoxGeometry(0.76, 0.4, 0.92),
  );
  private readonly imperatorTurretBarrelGeom = this.registerGeom(
    new THREE.CylinderGeometry(0.068, 0.082, 1.55, 8).rotateX(Math.PI / 2),
  );
  private readonly imperatorBroadsideHousingGeom = this.registerGeom(
    new THREE.BoxGeometry(0.36, 0.26, 0.46),
  );
  private readonly imperatorBroadsideBarrelGeom = this.registerGeom(
    new THREE.CylinderGeometry(0.036, 0.044, 0.65, 6).rotateX(Math.PI / 2),
  );
  private readonly imperatorPodMainGeom = this.registerGeom(
    new THREE.CylinderGeometry(0.62, 0.72, 3.15, 14).rotateX(Math.PI / 2),
  );
  private readonly imperatorPodCollarGeom = this.registerGeom(
    new THREE.CylinderGeometry(0.77, 0.77, 0.24, 14).rotateX(Math.PI / 2),
  );
  private readonly imperatorPodIntakeGeom = this.registerGeom(
    new THREE.CylinderGeometry(0.42, 0.62, 0.42, 14).rotateX(Math.PI / 2),
  );
  private readonly imperatorPodNozzleGeom = this.registerGeom(
    new THREE.CylinderGeometry(0.46, 0.58, 0.62, 14).rotateX(Math.PI / 2),
  );
  private readonly imperatorExhaustCoreGeom = this.registerGeom(
    new THREE.CylinderGeometry(0.38, 0.38, 0.1, 14).rotateX(Math.PI / 2),
  );
  private readonly imperatorSternNozzleGeom = this.registerGeom(
    new THREE.CylinderGeometry(0.32, 0.42, 0.65, 12).rotateX(Math.PI / 2),
  );
  private readonly imperatorSternCoreGeom = this.registerGeom(
    new THREE.CylinderGeometry(0.26, 0.26, 0.09, 12).rotateX(Math.PI / 2),
  );
  private readonly imperatorPodPylonGeom = this.registerGeom(
    new THREE.BoxGeometry(0.95, 0.55, 1.95),
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
      case 'cruiser':
        return this.buildCruiserMesh(options);
      case 'dreadnought':
        return this.buildImperatorDreadnoughtMesh(options);
      default:
        // Remaining 1 combat ship class (carrier) will be added next
        return this.buildCruiserMesh({ ...options, scale: options.scale ?? 1.0 });
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

  /**
   * Builds the Cruiser (docs/artstyle.md #13):
   * - Hull-based scale: ~7.5u long x ~2.55u wide x ~1.65u tall (~1.56x Havoc Destroyer, ~6.2x Stinger).
   * - Shielded & armored fleet backbone with continuous dorsal spine ridge, horizontal weathered
   *   ochre flank stripes, octagonal armored mid-aft side bulkheads, and recessed warm-amber bridge bays.
   * - Twin elevated dorsal Heavy Turrets (`cruiser_dorsal_turret_fore` & `cruiser_dorsal_turret_aft`)
   *   with machined steel grey (`#8492a6`) dual heavy barrels.
   * - Dense Rapid Point-Defence Arrays: 6 side-mounted (3 per broadside), 2 ventral, and 1 bow dorsal
   *   twin-barrel PD turret (22 machined steel barrels total), exposed via `userData.turretPivots`.
   * - Heavy 2x2 quad outboard Engine Cluster Pods (with glowing cyan intakes) + 2x2 stern thrusters.
   */
  public buildCruiserMesh(options: ShipModelBuildOptions = {}): THREE.Group {
    const wireframe = options.wireframe ?? false;
    const staged = options.staged ?? false;
    const scale = options.scale ?? 1.0;

    const root = new THREE.Group();
    root.name = 'ship_cruiser';

    const hullMat = wireframe ? this.buildingWireframeMat : this.primaryHullMat;
    const ochreMat = wireframe ? this.buildingWireframeMat : this.accentOchreMat;
    const frameMat = wireframe ? this.buildingWireframeMat : this.darkFrameMat;
    const trimMat = wireframe ? this.buildingWireframeMat : this.steelTrimMat;
    const barrelMat = wireframe ? this.buildingWireframeMat : this.turretBarrelMat;
    const cabinMat = wireframe ? this.buildingWireframeMat : this.warmCabinMat;
    const intakeMat = wireframe ? this.buildingWireframeMat : this.intakeCyanMat;
    const exhaustMat = wireframe ? this.buildingWireframeMat : this.engineCoreMat;

    // 1. Heavy Broadside Armored Hull, Continuous Dorsal Spine Ridge & Weathered Ochre Stripes (+Z Bow)
    const foreHull = new THREE.Mesh(this.cruiserForeHullGeom, hullMat);
    foreHull.position.set(0, 0, 1.85);
    root.add(foreHull);

    const aftHull = new THREE.Mesh(this.cruiserAftHullGeom, hullMat);
    aftHull.position.set(0, 0.04, -1.62);
    root.add(aftHull);

    const dorsalSpine = new THREE.Mesh(this.cruiserDorsalSpineGeom, frameMat);
    dorsalSpine.position.set(0, 0.56, 0.05);
    root.add(dorsalSpine);

    const ochreStripe = new THREE.Mesh(this.cruiserOchreStripeGeom, ochreMat);
    ochreStripe.position.set(0, 0.22, 1.85);
    root.add(ochreStripe);

    const aftOchreBand = new THREE.Mesh(this.cruiserAftOchreBandGeom, ochreMat);
    aftOchreBand.position.set(0, 0.34, -2.35);
    root.add(aftOchreBand);

    const prowCavity = new THREE.Mesh(this.cruiserProwCavityGeom, frameMat);
    prowCavity.position.set(0, -0.02, 3.58);
    root.add(prowCavity);

    const prowTopSlit = new THREE.Mesh(this.cruiserProwSlitGeom, cabinMat);
    prowTopSlit.position.set(0, 0.33, 3.68);
    root.add(prowTopSlit);

    const prowBotSlit = new THREE.Mesh(this.cruiserProwSlitGeom, cabinMat);
    prowBotSlit.scale.set(0.75, 0.85, 1.0);
    prowBotSlit.position.set(0, -0.28, 3.68);
    root.add(prowBotSlit);

    // Paired Octagonal Armored Side Bulkheads & Recessed Warm-Amber Bridge Observation Bays
    for (const side of [-1, 1]) {
      const bulkhead = new THREE.Mesh(this.cruiserSideBulkheadGeom, trimMat);
      bulkhead.position.set(side * 0.78, -0.04, -1.05);
      root.add(bulkhead);

      const bridgeBay = new THREE.Mesh(this.cruiserBridgeBayGeom, cabinMat);
      bridgeBay.position.set(side * 0.75, 0.06, -0.45);
      root.add(bridgeBay);
    }

    // 2. Twin Elevated Dorsal Heavy Turret Emplacements (Fore & Aft)
    const heavyTurretPivots: THREE.Group[] = [];
    const heavySpecs: readonly { readonly name: string; readonly z: number }[] = [
      { name: 'cruiser_dorsal_turret_fore', z: 1.45 },
      { name: 'cruiser_dorsal_turret_aft', z: -1.85 },
    ];
    for (const spec of heavySpecs) {
      const barbette = new THREE.Mesh(this.cruiserBarbetteGeom, frameMat);
      barbette.position.set(0, 0.74, spec.z);
      root.add(barbette);

      const turretPivot = new THREE.Group();
      turretPivot.name = spec.name;
      turretPivot.position.set(0, 0.96, spec.z);

      turretPivot.add(new THREE.Mesh(this.cruiserHeavyTurretHousingGeom, hullMat));

      const cap = new THREE.Mesh(this.cruiserHeavyTurretCapGeom, trimMat);
      cap.position.set(0, 0.2, -0.06);
      turretPivot.add(cap);

      for (const barrelX of [-0.11, 0.11]) {
        const barrel = new THREE.Mesh(this.cruiserHeavyBarrelGeom, barrelMat);
        barrel.position.set(barrelX, 0.03, 0.92);
        turretPivot.add(barrel);
      }

      root.add(turretPivot);
      heavyTurretPivots.push(turretPivot);
    }

    // 3. Dense Rapid Point-Defence Arrays (6 Broadside + 2 Ventral + 1 Bow Dorsal = 9 Twin-Barrel PD Turrets)
    const pdTurretPivots: THREE.Group[] = [];
    for (const side of [-1, 1]) {
      for (const zPos of [2.45, 1.35, 0.25]) {
        const pd = new THREE.Group();
        pd.position.set(side * 0.74, -0.08, zPos);
        pd.rotation.y = side * (Math.PI / 2);
        pd.add(new THREE.Mesh(this.havocPdHousingGeom, frameMat));
        for (const bx of [-0.035, 0.035]) {
          const b = new THREE.Mesh(this.havocPdBarrelGeom, barrelMat);
          b.position.set(bx, 0.01, 0.17);
          pd.add(b);
        }
        root.add(pd);
        pdTurretPivots.push(pd);
      }
    }

    for (const zPos of [2.15, 0.95]) {
      const vpd = new THREE.Group();
      vpd.position.set(0, -0.48, zPos);
      vpd.add(new THREE.Mesh(this.havocPdHousingGeom, frameMat));
      for (const bx of [-0.035, 0.035]) {
        const b = new THREE.Mesh(this.havocPdBarrelGeom, barrelMat);
        b.position.set(bx, -0.02, 0.17);
        vpd.add(b);
      }
      root.add(vpd);
      pdTurretPivots.push(vpd);
    }

    const bowPd = new THREE.Group();
    bowPd.position.set(0, 0.49, 3.05);
    bowPd.add(new THREE.Mesh(this.havocPdHousingGeom, frameMat));
    for (const bx of [-0.035, 0.035]) {
      const b = new THREE.Mesh(this.havocPdBarrelGeom, barrelMat);
      b.position.set(bx, 0.02, 0.17);
      bowPd.add(b);
    }
    root.add(bowPd);
    pdTurretPivots.push(bowPd);

    root.userData.turretPivots = {
      heavyTurretPivots,
      pdTurretPivots,
    };

    // 4. Heavy 2x2 Quad Outboard Engine Cluster Pods (Glowing Cyan Intakes) + 2x2 Stern Main Thrusters
    for (const side of [-1, 1]) {
      const pylon = new THREE.Mesh(this.cruiserPodPylonGeom, frameMat);
      pylon.position.set(side * 0.92, 0.0, -2.35);
      root.add(pylon);

      for (const podY of [0.36, -0.34]) {
        const pod = new THREE.Group();
        pod.position.set(side * 1.15, podY, -2.38);

        pod.add(new THREE.Mesh(this.cruiserPodMainGeom, hullMat));

        const collar = new THREE.Mesh(this.cruiserPodCollarGeom, frameMat);
        collar.position.set(0, 0, -0.12);
        pod.add(collar);

        const intakeRim = new THREE.Mesh(this.cruiserPodIntakeRimGeom, frameMat);
        intakeRim.position.set(0, 0, 0.82);
        pod.add(intakeRim);

        const intakeGlow = new THREE.Mesh(this.cruiserPodIntakeGlowGeom, intakeMat);
        intakeGlow.position.set(0, 0, 0.93);
        pod.add(intakeGlow);

        const nozzle = new THREE.Mesh(this.cruiserPodNozzleGeom, frameMat);
        nozzle.position.set(0, 0, -0.9);
        pod.add(nozzle);

        if (!staged) {
          const core = new THREE.Mesh(this.cruiserExhaustCoreGeom, exhaustMat);
          core.position.set(0, 0, -1.08);
          pod.add(core);
        }

        root.add(pod);
      }
    }

    for (const side of [-1, 1]) {
      for (const rowY of [-0.22, 0.26]) {
        const sternNozzle = new THREE.Mesh(this.cruiserSternNozzleGeom, frameMat);
        sternNozzle.position.set(side * 0.42, rowY, -3.45);
        root.add(sternNozzle);

        if (!staged) {
          const core = new THREE.Mesh(this.cruiserSternCoreGeom, exhaustMat);
          core.position.set(side * 0.42, rowY, -3.64);
          root.add(core);
        }
      }
    }

    if (scale !== 1.0) {
      root.scale.setScalar(scale);
    }

    return root;
  }

  /**
   * Builds the Dreadnought "Imperator" (docs/artstyle.md #14):
   * - Colossal siege capital (~14.5u long x ~5.1u wide x ~3.8u tall, ~12x Stinger, ~3x Havoc).
   * - Split armored jaw prow (+Z) housing the Integrated Glowing Spinal Siege Battery
   *   (ice-blue HDR accelerator core wrapped in dark containment rib rings & muzzle crown).
   * - 3 stepped dorsal superfiring twin-barrel Heavy Turrets (`imperator_dorsal_turret_1..3`),
   *   6 broadside twin-barrel turrets, and 2 ventral turrets (22 machined steel grey barrels).
   * - Wide diamond-flared mid-aft armored citadel supporting a towering 4-tier Command Bridge
   *   Superstructure with glowing panoramic window bands and twin communications masts.
   * - 4 colossal outboard Engine Cluster Pods (2x2 port/starboard) + 6-nozzle stern main bank.
   */
  public buildImperatorDreadnoughtMesh(options: ShipModelBuildOptions = {}): THREE.Group {
    const wireframe = options.wireframe ?? false;
    const staged = options.staged ?? false;
    const scale = options.scale ?? 1.0;

    const root = new THREE.Group();
    root.name = 'ship_dreadnought_imperator';

    const hullMat = wireframe ? this.buildingWireframeMat : this.primaryHullMat;
    const ochreMat = wireframe ? this.buildingWireframeMat : this.accentOchreMat;
    const frameMat = wireframe ? this.buildingWireframeMat : this.darkFrameMat;
    const trimMat = wireframe ? this.buildingWireframeMat : this.steelTrimMat;
    const barrelMat = wireframe ? this.buildingWireframeMat : this.turretBarrelMat;
    const cabinMat = wireframe ? this.buildingWireframeMat : this.warmCabinMat;
    const intakeMat = wireframe ? this.buildingWireframeMat : this.intakeCyanMat;
    const exhaustMat = wireframe ? this.buildingWireframeMat : this.engineCoreMat;

    // 1. Split Armored Jaw Prow & Integrated Glowing Spinal Siege Battery (+Z Bow)
    const upperJaw = new THREE.Mesh(this.imperatorJawUpperGeom, hullMat);
    upperJaw.position.set(0, 0.74, 4.95);
    root.add(upperJaw);

    const lowerJaw = new THREE.Mesh(this.imperatorJawLowerGeom, hullMat);
    lowerJaw.position.set(0, -0.7, 4.88);
    root.add(lowerJaw);

    const spinalGroup = new THREE.Group();
    spinalGroup.name = 'imperator_spinal_siege_battery';
    const spinalCore = new THREE.Mesh(
      this.imperatorSpinalCoreGeom,
      staged ? intakeMat : exhaustMat,
    );
    spinalCore.position.set(0, 0.02, 4.75);
    spinalGroup.add(spinalCore);

    for (const ringZ of [3.55, 4.25, 4.95, 5.65]) {
      const ring = new THREE.Mesh(this.imperatorSpinalRingGeom, frameMat);
      ring.position.set(0, 0.02, ringZ);
      spinalGroup.add(ring);
    }

    const spinalMuzzle = new THREE.Mesh(this.imperatorSpinalMuzzleGeom, frameMat);
    spinalMuzzle.position.set(0, 0.02, 6.45);
    spinalGroup.add(spinalMuzzle);
    root.add(spinalGroup);

    // 2. Massive Forward Hull, Diamond-Flared Mid-Aft Citadel & Aft Hull
    const foreHull = new THREE.Mesh(this.imperatorForeHullGeom, hullMat);
    foreHull.position.set(0, 0.04, 1.55);
    root.add(foreHull);

    const ochreStripe = new THREE.Mesh(this.imperatorOchreStripeGeom, ochreMat);
    ochreStripe.position.set(0, 0.42, 2.95);
    root.add(ochreStripe);

    const citadelFlare = new THREE.Mesh(this.imperatorCitadelFlareGeom, hullMat);
    citadelFlare.position.set(0, 0.06, -1.85);
    root.add(citadelFlare);

    const aftHull = new THREE.Mesh(this.imperatorAftHullGeom, hullMat);
    aftHull.position.set(0, 0.04, -4.25);
    root.add(aftHull);

    const aftOchreDeck = new THREE.Mesh(this.imperatorAftOchreDeckGeom, ochreMat);
    aftOchreDeck.position.set(0, 0.96, -4.85);
    root.add(aftOchreDeck);

    // 3. Towering 4-Tier Battleship Command Bridge Superstructure
    const bridgeGroup = new THREE.Group();
    bridgeGroup.name = 'imperator_command_citadel';
    bridgeGroup.position.set(0, 0.98, -1.85);

    const tier1 = new THREE.Mesh(this.imperatorBridgeTier1Geom, hullMat);
    tier1.position.set(0, 0.34, 0);
    bridgeGroup.add(tier1);

    const tier1Win = new THREE.Mesh(this.imperatorBridgeWindowGeom, cabinMat);
    tier1Win.scale.set(1.26, 1.0, 1.28);
    tier1Win.position.set(0, 0.44, 0);
    bridgeGroup.add(tier1Win);

    const tier2 = new THREE.Mesh(this.imperatorBridgeTier2Geom, frameMat);
    tier2.position.set(0, 0.96, -0.08);
    bridgeGroup.add(tier2);

    const tier2Win = new THREE.Mesh(this.imperatorBridgeWindowGeom, intakeMat);
    tier2Win.position.set(0, 1.04, -0.08);
    bridgeGroup.add(tier2Win);

    const tier3 = new THREE.Mesh(this.imperatorBridgeTier3Geom, hullMat);
    tier3.position.set(0, 1.48, -0.14);
    bridgeGroup.add(tier3);

    const tier3Win = new THREE.Mesh(this.imperatorBridgeWindowGeom, intakeMat);
    tier3Win.scale.set(0.72, 0.85, 0.72);
    tier3Win.position.set(0, 1.56, -0.14);
    bridgeGroup.add(tier3Win);

    const crown = new THREE.Mesh(this.imperatorBridgeCrownGeom, ochreMat);
    crown.position.set(0, 1.88, -0.18);
    bridgeGroup.add(crown);

    for (const mastX of [-0.22, 0.22]) {
      const mast = new THREE.Mesh(this.imperatorBridgeMastGeom, trimMat);
      mast.position.set(mastX, 2.42, -0.24);
      bridgeGroup.add(mast);
    }

    root.add(bridgeGroup);

    // 4. Three Stepped Dorsal Heavy Turrets + Six Broadside & Two Ventral Secondary Turrets
    const dorsalTurretPivots: THREE.Group[] = [];
    const dorsalSpecs: readonly { readonly name: string; readonly y: number; readonly z: number }[] = [
      { name: 'imperator_dorsal_turret_1', y: 1.08, z: 3.1 },
      { name: 'imperator_dorsal_turret_2', y: 1.16, z: 1.45 },
      { name: 'imperator_dorsal_turret_3', y: 1.24, z: -0.15 },
    ];
    for (const spec of dorsalSpecs) {
      const base = new THREE.Mesh(this.imperatorTurretBaseGeom, frameMat);
      base.position.set(0, spec.y - 0.14, spec.z);
      root.add(base);

      const pivot = new THREE.Group();
      pivot.name = spec.name;
      pivot.position.set(0, spec.y + 0.1, spec.z);
      pivot.add(new THREE.Mesh(this.imperatorTurretHousingGeom, hullMat));

      for (const bx of [-0.14, 0.14]) {
        const barrel = new THREE.Mesh(this.imperatorTurretBarrelGeom, barrelMat);
        barrel.position.set(bx, 0.04, 1.05);
        pivot.add(barrel);
      }
      root.add(pivot);
      dorsalTurretPivots.push(pivot);
    }

    const broadsideTurretPivots: THREE.Group[] = [];
    for (const side of [-1, 1]) {
      for (const zPos of [3.2, 1.55, -0.15]) {
        const bTurret = new THREE.Group();
        bTurret.position.set(side * 1.45, -0.05, zPos);
        bTurret.rotation.y = side * (Math.PI / 2);
        bTurret.add(new THREE.Mesh(this.imperatorBroadsideHousingGeom, frameMat));
        for (const bx of [-0.075, 0.075]) {
          const barrel = new THREE.Mesh(this.imperatorBroadsideBarrelGeom, barrelMat);
          barrel.position.set(bx, 0.02, 0.42);
          bTurret.add(barrel);
        }
        root.add(bTurret);
        broadsideTurretPivots.push(bTurret);
      }
    }

    for (const zPos of [2.45, 0.45]) {
      const vTurret = new THREE.Group();
      vTurret.position.set(0, -0.92, zPos);
      vTurret.add(new THREE.Mesh(this.imperatorBroadsideHousingGeom, frameMat));
      for (const bx of [-0.075, 0.075]) {
        const barrel = new THREE.Mesh(this.imperatorBroadsideBarrelGeom, barrelMat);
        barrel.position.set(bx, -0.02, 0.42);
        vTurret.add(barrel);
      }
      root.add(vTurret);
      broadsideTurretPivots.push(vTurret);
    }

    root.userData.turretPivots = {
      dorsalTurretPivots,
      broadsideTurretPivots,
    };

    // 5. Colossal Quad Outboard Engine Cluster Pods (2x2 Port/Starboard) + 6-Nozzle Stern Main Bank
    for (const side of [-1, 1]) {
      const pylon = new THREE.Mesh(this.imperatorPodPylonGeom, frameMat);
      pylon.position.set(side * 1.68, 0.0, -4.55);
      root.add(pylon);

      for (const podY of [0.76, -0.72]) {
        const pod = new THREE.Group();
        pod.position.set(side * 2.15, podY, -4.65);

        pod.add(new THREE.Mesh(this.imperatorPodMainGeom, hullMat));

        const collar = new THREE.Mesh(this.imperatorPodCollarGeom, frameMat);
        collar.position.set(0, 0, -0.25);
        pod.add(collar);

        const intake = new THREE.Mesh(this.imperatorPodIntakeGeom, frameMat);
        intake.position.set(0, 0, 1.65);
        pod.add(intake);

        const nozzle = new THREE.Mesh(this.imperatorPodNozzleGeom, frameMat);
        nozzle.position.set(0, 0, -1.82);
        pod.add(nozzle);

        if (!staged) {
          const core = new THREE.Mesh(this.imperatorExhaustCoreGeom, exhaustMat);
          core.position.set(0, 0, -2.14);
          pod.add(core);
        }

        root.add(pod);
      }
    }

    // 3x2 Rear Stern Main Thruster Bank
    for (const side of [-1, 1]) {
      for (const rowY of [-0.55, 0.05, 0.65]) {
        const sternNozzle = new THREE.Mesh(this.imperatorSternNozzleGeom, frameMat);
        sternNozzle.position.set(side * 0.72, rowY, -6.58);
        root.add(sternNozzle);

        if (!staged) {
          const core = new THREE.Mesh(this.imperatorSternCoreGeom, exhaustMat);
          core.position.set(side * 0.72, rowY, -6.92);
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
