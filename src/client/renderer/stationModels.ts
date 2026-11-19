import * as THREE from 'three';
import type {
  DeepSpaceStructureId,
  OrbitalStructureId,
} from '../../shared/config/index.ts';
import { createProceduralHullTextures } from './proceduralHullTextures.ts';
import { ShipModelLibrary } from './shipModels.ts';

export type StationOrDeepSpaceStructureId = OrbitalStructureId | DeepSpaceStructureId;

/**
 * Radial standoff beyond `orbitalRingRadius` for the Aegis Heavy Orbital Defense Platform's
 * 3 remote vertical sentry turrets. Exceeds the outward reach of the largest orbital structure
 * (Titan Orbital Dockyard slipways at ~19.5u) plus sentry radius and safety clearance.
 */
export const AEGIS_REMOTE_SENTRY_STANDOFF_OFFSET = 28;

/**
 * Shared 3D Orbital Platform & Station Model Builder following `docs/artstyle.md`.
 */
export class StationModelLibrary {
  private readonly hullTextures = createProceduralHullTextures();
  private readonly shipModels = new ShipModelLibrary();

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
  private readonly turretBarrelMat = new THREE.MeshStandardMaterial({
    name: 'turret_barrel_steel',
    color: 0x8492a6,
    map: this.hullTextures.machinedSteel.map,
    bumpMap: this.hullTextures.machinedSteel.bumpMap,
    bumpScale: 0.06,
    roughnessMap: this.hullTextures.machinedSteel.roughnessMap,
    metalness: 0.84,
    roughness: 0.38,
  });
  private readonly crimsonProwMat = new THREE.MeshStandardMaterial({
    name: 'hull_crimson_prow',
    color: 0xc22222,
    map: this.hullTextures.hullPlating.map,
    bumpMap: this.hullTextures.hullPlating.bumpMap,
    bumpScale: 0.06,
    roughnessMap: this.hullTextures.hullPlating.roughnessMap,
    metalness: 0.45,
    roughness: 0.64,
  });
  private readonly solarPanelMat = new THREE.MeshStandardMaterial({
    color: 0x1e3a5f,
    metalness: 0.65,
    roughness: 0.25,
  });
  private readonly observationWindowMat = new THREE.MeshStandardMaterial({
    color: 0x38bdf8,
    emissive: 0x0284c7,
    emissiveIntensity: 0.8,
    metalness: 0.2,
    roughness: 0.18,
  });
  private readonly warmCabinMat = new THREE.MeshStandardMaterial({
    color: 0xfbbf24,
    emissive: 0xd97706,
    emissiveIntensity: 0.85,
    metalness: 0.15,
    roughness: 0.2,
  });
  private readonly beaconRedMat = new THREE.MeshBasicMaterial({
    color: 0xef4444,
  });
  private readonly moltenHeatSinkMat = new THREE.MeshStandardMaterial({
    color: 0xfb923c,
    emissive: 0xea580c,
    emissiveIntensity: 0.95,
    metalness: 0.25,
    roughness: 0.25,
  });
  private readonly geodesicLatticeMat = new THREE.MeshBasicMaterial({
    color: 0x1e232a,
    wireframe: true,
    transparent: true,
    opacity: 0.65,
  });
  private readonly dockForceFieldMat = new THREE.MeshBasicMaterial({
    color: 0x7dd3fc,
    transparent: true,
    opacity: 0.72,
  });
  private readonly dockLaserScannerMat = new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.65,
    side: THREE.DoubleSide,
  });
  private readonly dockWeldingFlareMat = new THREE.MeshBasicMaterial({
    color: 0xe0f2fe,
  });
  private readonly techQuantumVioletMat = new THREE.MeshStandardMaterial({
    color: 0xc084fc,
    emissive: 0x7e22ce,
    emissiveIntensity: 0.95,
    metalness: 0.25,
    roughness: 0.2,
  });
  private readonly techHoloWireframeMat = new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
    wireframe: true,
    transparent: true,
    opacity: 0.85,
  });
  private readonly techHoloSurfaceMat = new THREE.MeshBasicMaterial({
    color: 0x0ea5e9,
    transparent: true,
    opacity: 0.36,
    side: THREE.DoubleSide,
  });
  private readonly techTranslucentDomeMat = new THREE.MeshStandardMaterial({
    color: 0x38bdf8,
    emissive: 0x0284c7,
    emissiveIntensity: 0.55,
    metalness: 0.2,
    roughness: 0.15,
    transparent: true,
    opacity: 0.58,
  });

  // Wireframe & Baseline Materials
  private readonly buildingWireframeMat = new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
    wireframe: true,
    transparent: true,
    opacity: 0.75,
  });

  private readonly geometries: THREE.BufferGeometry[] = [];

  // Aegis 2-Slot Heavy Orbital Defense Platform & Remote Vertical Sentry Turrets reusable geometries
  private readonly aegisCentralBridgeGeom = this.registerGeom(
    new THREE.BoxGeometry(4.2, 1.35, 4.6),
  );
  private readonly aegisFireControlBaseGeom = this.registerGeom(
    new THREE.CylinderGeometry(1.55, 1.95, 1.15, 8),
  );
  private readonly aegisLobeLowerDeckGeom = this.registerGeom(
    new THREE.CylinderGeometry(5.1, 5.6, 0.95, 8).rotateY(Math.PI / 8),
  );
  private readonly aegisLobeMidTierGeom = this.registerGeom(
    new THREE.CylinderGeometry(3.75, 4.45, 1.05, 8).rotateY(Math.PI / 8),
  );
  private readonly aegisLobeUpperMountGeom = this.registerGeom(
    new THREE.CylinderGeometry(2.35, 2.95, 0.85, 8).rotateY(Math.PI / 8),
  );
  private readonly aegisLobeVentralHullGeom = this.registerGeom(
    new THREE.CylinderGeometry(3.8, 1.85, 1.15, 8).rotateY(Math.PI / 8),
  );
  private readonly aegisRadiatorBankGeom = this.registerGeom(
    new THREE.BoxGeometry(1.65, 0.36, 0.85),
  );
  private readonly aegisAmmoHoistPipeGeom = this.registerGeom(
    new THREE.CylinderGeometry(0.18, 0.18, 2.35, 8),
  );
  private readonly aegisSpinalBreechGeom = this.registerGeom(
    new THREE.BoxGeometry(2.15, 1.15, 2.45),
  );
  private readonly aegisSpinalAmmoFeedGeom = this.registerGeom(
    new THREE.BoxGeometry(2.55, 0.82, 1.15),
  );
  private readonly aegisSpinalPlasmaBarrelGeom = this.registerGeom(
    new THREE.CylinderGeometry(0.18, 0.24, 3.1, 8),
  );
  private readonly aegisSpinalMuzzleCollarGeom = this.registerGeom(
    new THREE.CylinderGeometry(0.26, 0.26, 0.34, 8),
  );
  private readonly aegisMacroTurretHousingGeom = this.registerGeom(
    new THREE.BoxGeometry(1.05, 0.62, 1.25),
  );
  private readonly aegisMacroBarrelGeom = this.registerGeom(
    new THREE.CylinderGeometry(0.09, 0.12, 1.65, 8),
  );
  private readonly aegisShieldEmitterPylonGeom = this.registerGeom(
    new THREE.CylinderGeometry(0.16, 0.28, 0.95, 6),
  );
  // Vertical Sentry Column & Turret geometries (Aegis remote turrets + Deep-Space Defence Towers)
  private readonly aegisSentrySpineGeom = this.registerGeom(
    new THREE.CylinderGeometry(0.84, 0.92, 4.4, 12),
  );
  private readonly aegisSentryRibCollarGeom = this.registerGeom(
    new THREE.CylinderGeometry(0.98, 0.98, 0.24, 12),
  );
  private readonly aegisSentryConduitStripGeom = this.registerGeom(
    new THREE.BoxGeometry(0.14, 4.2, 0.16),
  );
  private readonly aegisSentryCrownCollarGeom = this.registerGeom(
    new THREE.CylinderGeometry(1.42, 1.18, 0.62, 12),
  );
  private readonly aegisSentryTopTurretGeom = this.registerGeom(
    new THREE.BoxGeometry(1.15, 0.68, 1.45),
  );
  private readonly aegisSentryReactorBaseGeom = this.registerGeom(
    new THREE.CylinderGeometry(1.18, 1.36, 1.25, 12),
  );
  private readonly aegisSentryTurretRingGeom = this.registerGeom(
    new THREE.CylinderGeometry(1.06, 1.06, 0.34, 12),
  );
  private readonly aegisSentryThrusterNozzleGeom = this.registerGeom(
    new THREE.CylinderGeometry(0.16, 0.22, 0.78, 8),
  );
  private readonly aegisSentryPdBarrelGeom = this.registerGeom(
    new THREE.CylinderGeometry(0.055, 0.07, 0.82, 6),
  );

  // Atlas Deep-Space Logistics Hub reusable geometries (free-floating radial carrier & fabrication hub)
  private readonly hubBaseApronGeom = this.registerGeom(
    new THREE.CylinderGeometry(8.2, 9.6, 1.35, 16),
  );
  private readonly hubInnerPlateauGeom = this.registerGeom(
    new THREE.CylinderGeometry(4.9, 6.2, 1.05, 16),
  );
  private readonly hubVentralReactorGeom = this.registerGeom(
    new THREE.CylinderGeometry(4.2, 2.1, 1.65, 8).rotateY(Math.PI / 8),
  );
  private readonly hubVentralThrusterGeom = this.registerGeom(
    new THREE.CylinderGeometry(0.32, 0.44, 0.85, 8),
  );
  private readonly hubHangarCourtGeom = this.registerGeom(
    new THREE.BoxGeometry(4.4, 0.34, 3.6),
  );
  private readonly hubHangarBermGeom = this.registerGeom(
    new THREE.BoxGeometry(4.55, 0.48, 0.28),
  );
  private readonly hubCatapultRailGeom = this.registerGeom(
    new THREE.BoxGeometry(4.1, 0.14, 0.14),
  );
  private readonly hubHangarPortalGeom = this.registerGeom(
    new THREE.BoxGeometry(0.24, 0.82, 3.2),
  );
  private readonly hubSpireTrunkGeom = this.registerGeom(
    new THREE.CylinderGeometry(1.95, 2.75, 5.4, 12),
  );
  private readonly hubTierDisc1Geom = this.registerGeom(
    new THREE.CylinderGeometry(4.8, 4.3, 0.52, 16),
  );
  private readonly hubTierDisc2Geom = this.registerGeom(
    new THREE.CylinderGeometry(4.15, 3.65, 0.48, 16),
  );
  private readonly hubTierDisc3Geom = this.registerGeom(
    new THREE.CylinderGeometry(3.35, 2.95, 0.44, 16),
  );
  private readonly hubCommandNeedleGeom = this.registerGeom(
    new THREE.CylinderGeometry(0.08, 0.48, 2.8, 8),
  );

  // Minerva C&C Tech & Specialization Module reusable geometries (1-slot curved R&D platform)
  private readonly techDataConduitPipeGeom = this.registerGeom(
    new THREE.CylinderGeometry(0.14, 0.14, 2.08, 8),
  );
  private readonly techDataCoreBlockGeom = this.registerGeom(
    new THREE.BoxGeometry(0.54, 0.68, 0.42),
  );
  private readonly techRelaySpireGeom = this.registerGeom(
    new THREE.CylinderGeometry(0.04, 0.11, 2.15, 6),
  );
  private readonly techPrismNodeBaseGeom = this.registerGeom(
    new THREE.CylinderGeometry(0.32, 0.42, 0.24, 8),
  );
  private readonly techPrismOrbGeom = this.registerGeom(
    new THREE.OctahedronGeometry(0.24, 1),
  );
  private readonly techCruciformHubGeom = this.registerGeom(
    new THREE.BoxGeometry(0.58, 0.56, 0.58),
  );
  private readonly techCruciformWingGeom = this.registerGeom(
    new THREE.BoxGeometry(0.68, 0.48, 0.42),
  );
  private readonly techHoloTableGeom = this.registerGeom(
    new THREE.BoxGeometry(1.75, 0.08, 1.55),
  );
  private readonly techHoloHullMainGeom = this.registerGeom(
    new THREE.BoxGeometry(0.68, 0.34, 1.35),
  );
  private readonly techHoloHullBowGeom = this.registerGeom(
    new THREE.ConeGeometry(0.38, 0.78, 5),
  );
  private readonly techHoloHullWingGeom = this.registerGeom(
    new THREE.BoxGeometry(1.32, 0.08, 0.58),
  );
  private readonly techHoloMiniShipGeom = this.registerGeom(
    new THREE.ConeGeometry(0.14, 0.42, 4),
  );

  // Titan Orbital Dockyard reusable geometries (2-slot curved fabrication core + twin outward slipways)
  private readonly dockRearCoreSegGeom = this.registerGeom(
    new THREE.BoxGeometry(4.4, 2.2, 4.4),
  );
  private readonly dockRearUpperDeckGeom = this.registerGeom(
    new THREE.BoxGeometry(3.4, 0.85, 4.1),
  );
  private readonly dockSiloGeom = this.registerGeom(
    new THREE.CylinderGeometry(0.42, 0.46, 1.15, 10),
  );
  private readonly dockFabDomeCoreGeom = this.registerGeom(
    new THREE.IcosahedronGeometry(1.75, 2),
  );
  private readonly dockFabDomeLatticeGeom = this.registerGeom(
    new THREE.IcosahedronGeometry(1.79, 2),
  );
  private readonly dockControlTowerBaseGeom = this.registerGeom(
    new THREE.CylinderGeometry(1.1, 1.35, 1.6, 8),
  );
  private readonly dockControlTowerShaftGeom = this.registerGeom(
    new THREE.CylinderGeometry(0.72, 0.92, 1.8, 8),
  );
  private readonly dockControlRadarSphereGeom = this.registerGeom(
    new THREE.IcosahedronGeometry(0.75, 1),
  );
  private readonly dockForceFieldPortalGeom = this.registerGeom(
    new THREE.BoxGeometry(0.24, 1.75, 3.8),
  );
  private readonly dockPortalFrameTopGeom = this.registerGeom(
    new THREE.BoxGeometry(0.55, 0.32, 4.2),
  );
  private readonly dockOuterPierGeom = this.registerGeom(
    new THREE.BoxGeometry(14.6, 1.65, 2.5),
  );
  private readonly dockCenterPierGeom = this.registerGeom(
    new THREE.BoxGeometry(14.2, 1.85, 2.8),
  );
  private readonly dockVentralSpineGeom = this.registerGeom(
    new THREE.CylinderGeometry(1.35, 0.85, 13.4, 8),
  );
  private readonly dockSlipwayFloorGeom = this.registerGeom(
    new THREE.BoxGeometry(13.6, 0.34, 5.4),
  );
  private readonly dockSmallCraftAlcoveGeom = this.registerGeom(
    new THREE.BoxGeometry(3.4, 0.75, 1.45),
  );
  private readonly dockThermalRailGeom = this.registerGeom(
    new THREE.BoxGeometry(13.8, 0.18, 0.22),
  );
  private readonly dockElevatorTrackGeom = this.registerGeom(
    new THREE.BoxGeometry(0.32, 2.6, 0.42),
  );
  private readonly dockElevatorCageGeom = this.registerGeom(
    new THREE.BoxGeometry(0.46, 0.48, 0.56),
  );
  private readonly dockGantryPylonGeom = this.registerGeom(
    new THREE.BoxGeometry(0.58, 3.6, 0.58),
  );
  private readonly dockGantryCrossBeamGeom = this.registerGeom(
    new THREE.BoxGeometry(0.52, 0.48, 6.2),
  );
  private readonly dockGantryCantileverGeom = this.registerGeom(
    new THREE.BoxGeometry(0.26, 0.26, 3.2),
  );
  private readonly dockCraneCabGeom = this.registerGeom(
    new THREE.BoxGeometry(0.72, 0.65, 0.78),
  );
  private readonly dockCraneArmGeom = this.registerGeom(
    new THREE.BoxGeometry(0.18, 1.35, 0.18),
  );
  private readonly dockWeldingFlareGeom = this.registerGeom(
    new THREE.SphereGeometry(0.22, 8, 8),
  );
  private readonly dockLaserScannerPlaneGeom = this.registerGeom(
    new THREE.BoxGeometry(0.16, 2.1, 4.4),
  );
  private readonly dockRunwayStrobeGeom = this.registerGeom(
    new THREE.BoxGeometry(0.48, 0.12, 0.24),
  );

  // Vanguard Planetary Outpost reusable geometries (curved rectangular 1-slot bastion)
  private readonly outpostDeckSegGeom = this.registerGeom(
    new THREE.BoxGeometry(5.2, 0.44, 2.15),
  );
  private readonly outpostEndProwGeom = this.registerGeom(
    new THREE.CylinderGeometry(2.15, 2.48, 0.44, 6),
  );
  private readonly outpostBermWallGeom = this.registerGeom(
    new THREE.BoxGeometry(0.46, 0.36, 2.12),
  );
  private readonly outpostThermalChannelGeom = this.registerGeom(
    new THREE.BoxGeometry(0.16, 0.24, 1.98),
  );
  private readonly outpostVentralHullGeom = this.registerGeom(
    new THREE.CylinderGeometry(1.75, 0.95, 0.88, 8),
  );
  private readonly outpostCommandBaseGeom = this.registerGeom(
    new THREE.CylinderGeometry(1.78, 2.18, 0.78, 8),
  );
  private readonly outpostCommandTierGeom = this.registerGeom(
    new THREE.CylinderGeometry(1.42, 1.72, 0.52, 8),
  );
  private readonly outpostSensorDomeCoreGeom = this.registerGeom(
    new THREE.IcosahedronGeometry(1.26, 2),
  );
  private readonly outpostSensorDomeLatticeGeom = this.registerGeom(
    new THREE.IcosahedronGeometry(1.29, 2),
  );
  private readonly outpostSupplyCrateGeom = this.registerGeom(
    new THREE.BoxGeometry(0.84, 0.48, 0.58),
  );
  private readonly outpostSupplyCanisterGeom = this.registerGeom(
    new THREE.CylinderGeometry(0.2, 0.2, 0.74, 8),
  );
  private readonly outpostPdPedestalGeom = this.registerGeom(
    new THREE.CylinderGeometry(0.44, 0.56, 0.36, 8),
  );
  private readonly outpostPdHousingGeom = this.registerGeom(
    new THREE.BoxGeometry(0.56, 0.38, 0.68),
  );
  private readonly outpostPdAmmoDrumGeom = this.registerGeom(
    new THREE.BoxGeometry(0.22, 0.28, 0.48),
  );
  private readonly outpostPdBarrelGeom = this.registerGeom(
    new THREE.CylinderGeometry(0.045, 0.055, 0.64, 6),
  );
  private readonly outpostAnchorThrusterGeom = this.registerGeom(
    new THREE.BoxGeometry(0.76, 0.44, 0.88),
  );

  // Hephaes Orbital Refinery reusable geometries (curved along orbital arc)
  private readonly refDeckSegGeom = this.registerGeom(
    new THREE.BoxGeometry(6.6, 0.42, 2.15),
  );
  private readonly refKeelSegGeom = this.registerGeom(
    new THREE.BoxGeometry(3.4, 0.75, 1.95),
  );
  private readonly refSpineSegGeom = this.registerGeom(
    new THREE.BoxGeometry(1.15, 0.78, 2.15),
  );
  private readonly refControlTowerGeom = this.registerGeom(
    new THREE.CylinderGeometry(0.72, 1.05, 1.45, 8),
  );
  private readonly refControlWindowGeom = this.registerGeom(
    new THREE.CylinderGeometry(0.76, 0.86, 0.34, 8),
  );
  private readonly refHeatSinkCoreGeom = this.registerGeom(
    new THREE.BoxGeometry(1.35, 1.25, 1.55),
  );
  private readonly refHeatSinkFinGeom = this.registerGeom(
    new THREE.BoxGeometry(1.48, 1.45, 0.14),
  );
  private readonly refLandingPadGeom = this.registerGeom(
    new THREE.BoxGeometry(0.95, 0.14, 1.65),
  );
  private readonly refPadBeaconGeom = this.registerGeom(
    new THREE.BoxGeometry(0.16, 0.18, 1.2),
  );
  private readonly refCrystalArrayGeom = this.registerGeom(
    new THREE.BoxGeometry(1.45, 0.95, 1.35),
  );

  // Prometheus C&C reusable geometries (total radial reach <= 6.8u to stay clear of planet)
  private readonly cncLowerHubGeom = this.registerGeom(
    new THREE.CylinderGeometry(2.75, 2.55, 1.25, 16),
  );
  private readonly cncMidRingGeom = this.registerGeom(
    new THREE.CylinderGeometry(2.95, 2.95, 0.34, 16),
  );
  private readonly cncObsGlassGeom = this.registerGeom(
    new THREE.CylinderGeometry(2.15, 2.48, 0.52, 16),
  );
  private readonly cncObsCapGeom = this.registerGeom(
    new THREE.CylinderGeometry(1.72, 2.18, 0.55, 16),
  );
  private readonly cncUpperCollarGeom = this.registerGeom(
    new THREE.CylinderGeometry(1.42, 1.65, 0.55, 12),
  );

  private readonly cncUpperSpireGeom = this.registerGeom(
    new THREE.CylinderGeometry(0.42, 1.28, 5.2, 8),
  );
  private readonly cncUpperSpireCapGeom = this.registerGeom(
    new THREE.CylinderGeometry(0.24, 0.44, 0.85, 8),
  );
  private readonly cncSpireOchrePlateGeom = this.registerGeom(
    new THREE.BoxGeometry(0.32, 2.6, 1.45),
  );

  private readonly cncLowerNeckGeom = this.registerGeom(
    new THREE.CylinderGeometry(1.15, 1.05, 1.15, 12),
  );
  private readonly cncLowerBallastGeom = this.registerGeom(
    new THREE.CylinderGeometry(1.12, 0.34, 5.4, 8),
  );
  private readonly cncLowerTipGeom = this.registerGeom(
    new THREE.CylinderGeometry(0.34, 0.14, 0.95, 8),
  );

  private readonly cncArmMainGeom = this.registerGeom(
    new THREE.BoxGeometry(3.6, 0.96, 1.48),
  );
  private readonly cncArmRibGeom = this.registerGeom(
    new THREE.BoxGeometry(0.22, 1.08, 1.62),
  );
  private readonly cncArmOchrePanelGeom = this.registerGeom(
    new THREE.BoxGeometry(1.25, 1.02, 1.54),
  );
  private readonly cncArmWindowStripGeom = this.registerGeom(
    new THREE.BoxGeometry(2.4, 0.24, 1.56),
  );
  private readonly cncArmProwGeom = this.registerGeom(
    new THREE.BoxGeometry(0.65, 0.78, 1.24),
  );
  private readonly cncArmDockBayGeom = this.registerGeom(
    new THREE.BoxGeometry(0.75, 0.36, 0.86),
  );
  private readonly cncArmSuperstructureGeom = this.registerGeom(
    new THREE.BoxGeometry(1.45, 0.42, 0.92),
  );

  private readonly cncSolarWingGeom = this.registerGeom(
    new THREE.BoxGeometry(1.85, 0.08, 0.95),
  );
  private readonly cncSolarFrameGeom = this.registerGeom(
    new THREE.BoxGeometry(1.94, 0.12, 0.12),
  );
  private readonly cncTurretBaseGeom = this.registerGeom(
    new THREE.CylinderGeometry(0.26, 0.34, 0.28, 8),
  );
  private readonly cncTurretBarrelGeom = this.registerGeom(
    new THREE.CylinderGeometry(0.05, 0.06, 0.62, 6),
  );
  private readonly cncAntennaMastGeom = this.registerGeom(
    new THREE.CylinderGeometry(0.03, 0.05, 1.5, 6),
  );
  private readonly cncBeaconTipGeom = this.registerGeom(
    new THREE.SphereGeometry(0.09, 8, 8),
  );
  private readonly cncBridgeDeckGeom = this.registerGeom(
    new THREE.BoxGeometry(1.55, 0.42, 7.6),
  );
  private readonly cncBridgeTrussGeom = this.registerGeom(
    new THREE.BoxGeometry(1.85, 0.65, 0.35),
  );
  private readonly cncBridgeConduitGeom = this.registerGeom(
    new THREE.BoxGeometry(0.32, 0.24, 7.6),
  );

  public buildStationMesh(
    structureId: StationOrDeepSpaceStructureId,
    isComplete: boolean,
    orbitalRingRadius = 42.56,
  ): THREE.Group {
    switch (structureId) {
      case 'command_and_control':
        return this.buildPrometheusCommandAndControl(isComplete, orbitalRingRadius);
      case 'refinery':
        return this.buildHephaesRefinery(isComplete, orbitalRingRadius);
      case 'planetary_outpost':
        return this.buildVanguardPlanetaryOutpost(isComplete, orbitalRingRadius);
      case 'orbital_dockyard':
        return this.buildTitanOrbitalDockyard(isComplete, orbitalRingRadius);
      case 'tech_module':
        return this.buildMinervaTechModule(isComplete, orbitalRingRadius);
      case 'heavy_defense_platform':
        return this.buildAegisHeavyDefensePlatform(isComplete, orbitalRingRadius);
      case 'logistics_hub':
        return this.buildAtlasLogisticsHub(isComplete);
      case 'point_defence_tower':
        return this.buildDeepSpaceSentryTower('point_defence', isComplete);
      case 'hull_breaker_tower':
        return this.buildDeepSpaceSentryTower('hull_breaker', isComplete);
    }
  }

  public updateStationAnimation(
    stationGroup: THREE.Group,
    elapsedSeconds: number,
    activeBuildProgressRatio: number | null = null,
  ): void {
    const animateFn = stationGroup.userData.animateStation as
      | ((elapsed: number, progressRatio: number | null) => void)
      | undefined;
    if (animateFn) {
      animateFn(elapsedSeconds, activeBuildProgressRatio);
    }
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
    this.crimsonProwMat.dispose();
    this.solarPanelMat.dispose();
    this.observationWindowMat.dispose();
    this.warmCabinMat.dispose();
    this.beaconRedMat.dispose();
    this.moltenHeatSinkMat.dispose();
    this.geodesicLatticeMat.dispose();
    this.dockForceFieldMat.dispose();
    this.dockLaserScannerMat.dispose();
    this.dockWeldingFlareMat.dispose();
    this.techQuantumVioletMat.dispose();
    this.techHoloWireframeMat.dispose();
    this.techHoloSurfaceMat.dispose();
    this.techTranslucentDomeMat.dispose();
    this.buildingWireframeMat.dispose();
    this.hullTextures.dispose();
    this.shipModels.dispose();
  }

  private registerGeom<T extends THREE.BufferGeometry>(geom: T): T {
    this.geometries.push(geom);
    return geom;
  }

  /**
   * Builds the "Prometheus" Star-Station Command & Control (docs/artstyle.md #02).
   * Features a 1.5x scale central citadel flanked by left and right wing citadel towers
   * joined via armored skybridges along the host planet's orbital arc to fill its 2-slot footprint.
   */
  private buildPrometheusCommandAndControl(
    isComplete: boolean,
    orbitalRingRadius: number,
  ): THREE.Group {
    const complexRoot = new THREE.Group();
    const hullMat = isComplete ? this.primaryHullMat : this.buildingWireframeMat;
    const frameMat = isComplete ? this.darkFrameMat : this.buildingWireframeMat;
    const obsMat = isComplete ? this.observationWindowMat : this.buildingWireframeMat;

    // 1. Central Citadel Tower (1.5x scale)
    const centerTower = this.buildPrometheusTowerUnit(isComplete);
    centerTower.scale.setScalar(1.5);
    complexRoot.add(centerTower);

    // 2. Left & Right Flanking Citadel Towers + Armored Skybridges along the orbital arc
    const ringR = Math.max(24, orbitalRingRadius);
    const wingArcOffset = 12.8;
    const bridgeMidArc = 6.9;

    for (const side of [-1, 1]) {
      const wingTheta = (side * wingArcOffset) / ringR;
      const wingTower = this.buildPrometheusTowerUnit(isComplete);
      wingTower.scale.setScalar(0.68);
      wingTower.position.set(
        ringR * Math.cos(wingTheta) - ringR,
        0,
        ringR * Math.sin(wingTheta),
      );
      wingTower.rotation.y = -wingTheta;
      complexRoot.add(wingTower);

      // Joined Armored Skybridge Causeway connecting center citadel to flanking tower
      const bridgeTheta = (side * bridgeMidArc) / ringR;
      const bridgeGroup = new THREE.Group();
      bridgeGroup.position.set(
        ringR * Math.cos(bridgeTheta) - ringR,
        -0.12,
        ringR * Math.sin(bridgeTheta),
      );
      bridgeGroup.rotation.y = -bridgeTheta;

      bridgeGroup.add(new THREE.Mesh(this.cncBridgeDeckGeom, hullMat));
      const conduit = new THREE.Mesh(this.cncBridgeConduitGeom, obsMat);
      conduit.position.set(0, 0.22, 0);
      bridgeGroup.add(conduit);

      for (const tz of [-2.4, 0, 2.4]) {
        const truss = new THREE.Mesh(this.cncBridgeTrussGeom, frameMat);
        truss.position.set(0, 0, tz);
        bridgeGroup.add(truss);
      }

      complexRoot.add(bridgeGroup);
    }

    return complexRoot;
  }

  private buildPrometheusTowerUnit(isComplete: boolean): THREE.Group {
    const root = new THREE.Group();
    const hullMat = isComplete ? this.primaryHullMat : this.buildingWireframeMat;
    const ochreMat = isComplete ? this.accentOchreMat : this.buildingWireframeMat;
    const frameMat = isComplete ? this.darkFrameMat : this.buildingWireframeMat;
    const trimMat = isComplete ? this.steelTrimMat : this.buildingWireframeMat;
    const prowMat = isComplete ? this.crimsonProwMat : this.buildingWireframeMat;
    const obsMat = isComplete ? this.observationWindowMat : this.buildingWireframeMat;
    const cabinMat = isComplete ? this.warmCabinMat : this.buildingWireframeMat;
    const solarMat = isComplete ? this.solarPanelMat : this.buildingWireframeMat;

    // 1. Central Command Core & Stepped Upper Observation Deck
    const lowerHub = new THREE.Mesh(this.cncLowerHubGeom, hullMat);
    root.add(lowerHub);

    const midCollar = new THREE.Mesh(this.cncMidRingGeom, frameMat);
    midCollar.position.set(0, -0.35, 0);
    root.add(midCollar);

    const obsGlass = new THREE.Mesh(this.cncObsGlassGeom, obsMat);
    obsGlass.position.set(0, 0.82, 0);
    root.add(obsGlass);

    // Dark vertical observation mullions around the panoramic bridge deck
    for (let m = 0; m < 8; m++) {
      const a = (m / 8) * Math.PI * 2;
      const mullion = new THREE.Mesh(this.cncArmRibGeom, frameMat);
      mullion.scale.set(0.65, 0.52, 0.14);
      mullion.position.set(Math.cos(a) * 2.28, 0.82, Math.sin(a) * 2.28);
      mullion.rotation.y = -a;
      root.add(mullion);
    }

    const obsCap = new THREE.Mesh(this.cncObsCapGeom, hullMat);
    obsCap.position.set(0, 1.32, 0);
    root.add(obsCap);

    const upperCollar = new THREE.Mesh(this.cncUpperCollarGeom, frameMat);
    upperCollar.position.set(0, 1.82, 0);
    root.add(upperCollar);

    // 2. Upper Command Spire (+Y) with Ochre Plates & Crimson Prow Cap
    const upperSpire = new THREE.Mesh(this.cncUpperSpireGeom, hullMat);
    upperSpire.position.set(0, 4.65, 0);
    root.add(upperSpire);

    for (const a of [0, Math.PI / 2, Math.PI, (Math.PI * 3) / 2]) {
      const plate = new THREE.Mesh(this.cncSpireOchrePlateGeom, ochreMat);
      plate.position.set(Math.cos(a) * 0.85, 3.85, Math.sin(a) * 0.85);
      plate.rotation.y = -a;
      root.add(plate);
    }

    const upperSpireCap = new THREE.Mesh(this.cncUpperSpireCapGeom, prowMat);
    upperSpireCap.position.set(0, 7.65, 0);
    root.add(upperSpireCap);

    // Dorsal Sensor Antenna & Red Beacon Tip
    const mast = new THREE.Mesh(this.cncAntennaMastGeom, trimMat);
    mast.position.set(0.95, 2.55, 0.65);
    root.add(mast);

    if (isComplete) {
      const beacon = new THREE.Mesh(this.cncBeaconTipGeom, this.beaconRedMat);
      beacon.position.set(0.95, 3.32, 0.65);
      root.add(beacon);
    }

    // 3. Lower Conical Ballast / Cargo Hull (-Y)
    const lowerNeck = new THREE.Mesh(this.cncLowerNeckGeom, frameMat);
    lowerNeck.position.set(0, -1.18, 0);
    root.add(lowerNeck);

    const lowerBallast = new THREE.Mesh(this.cncLowerBallastGeom, hullMat);
    lowerBallast.position.set(0, -4.42, 0);
    root.add(lowerBallast);

    for (const a of [Math.PI / 4, (Math.PI * 3) / 4, (Math.PI * 5) / 4, (Math.PI * 7) / 4]) {
      const lowerPlate = new THREE.Mesh(this.cncSpireOchrePlateGeom, ochreMat);
      lowerPlate.scale.set(0.8, 0.85, 0.72);
      lowerPlate.position.set(Math.cos(a) * 0.68, -3.75, Math.sin(a) * 0.68);
      lowerPlate.rotation.y = -a;
      root.add(lowerPlate);
    }

    const lowerTip = new THREE.Mesh(this.cncLowerTipGeom, prowMat);
    lowerTip.position.set(0, -7.58, 0);
    root.add(lowerTip);

    // 4. Four Main Horizontal Radial Habitation / Docking Arms (0, 90, 180, 270 deg)
    const buildDockingArm = (
      yawRadians: number,
      pitchRadians: number,
      armScale = 1.0,
    ): void => {
      const armPivot = new THREE.Group();
      armPivot.rotation.y = yawRadians;
      armPivot.rotation.z = pitchRadians;

      const armBody = new THREE.Group();
      armBody.position.set(4.15 * armScale, 0, 0);
      armBody.scale.setScalar(armScale);

      armBody.add(new THREE.Mesh(this.cncArmMainGeom, hullMat));

      const ochrePanel = new THREE.Mesh(this.cncArmOchrePanelGeom, ochreMat);
      ochrePanel.position.set(-0.4, 0, 0);
      armBody.add(ochrePanel);

      const windowStrip = new THREE.Mesh(this.cncArmWindowStripGeom, cabinMat);
      windowStrip.position.set(0.15, 0.08, 0);
      armBody.add(windowStrip);

      for (const ribX of [-1.25, -0.15, 0.95]) {
        const rib = new THREE.Mesh(this.cncArmRibGeom, frameMat);
        rib.position.set(ribX, 0, 0);
        armBody.add(rib);
      }

      const superstructure = new THREE.Mesh(this.cncArmSuperstructureGeom, trimMat);
      superstructure.position.set(-0.65, 0.62, 0);
      armBody.add(superstructure);

      const prow = new THREE.Mesh(this.cncArmProwGeom, prowMat);
      prow.position.set(2.05, 0.04, 0);
      armBody.add(prow);

      const dockBay = new THREE.Mesh(this.cncArmDockBayGeom, frameMat);
      dockBay.position.set(2.08, -0.22, 0);
      armBody.add(dockBay);

      armPivot.add(armBody);
      root.add(armPivot);
    };

    // 4 horizontal arms in the XZ plane
    for (const yaw of [0, Math.PI / 2, Math.PI, (Math.PI * 3) / 2]) {
      buildDockingArm(yaw, 0, 1.0);
    }

    // 2 angled ventral docking arms along the tangent ±Z axis (never angling inward toward the planet)
    buildDockingArm(Math.PI / 2, -0.56, 0.88);
    buildDockingArm(-Math.PI / 2, -0.56, 0.88);

    // 5. Solar Array Panels (on diagonal axes between horizontal arms)
    for (const solarYaw of [Math.PI / 4, (Math.PI * 5) / 4]) {
      const solarGroup = new THREE.Group();
      solarGroup.rotation.y = solarYaw;

      const wing = new THREE.Mesh(this.cncSolarWingGeom, solarMat);
      wing.position.set(3.45, -0.45, 0);
      solarGroup.add(wing);

      const border = new THREE.Mesh(this.cncSolarFrameGeom, frameMat);
      border.position.set(3.45, -0.45, 0.48);
      solarGroup.add(border);

      root.add(solarGroup);
    }

    // 6. Twin Dorsal Point Defence Turret Mounts
    const cncBarrelMat = isComplete ? this.turretBarrelMat : this.buildingWireframeMat;
    for (const side of [-1, 1]) {
      const turretGroup = new THREE.Group();
      turretGroup.position.set(1.35, 1.62, side * 1.15);

      turretGroup.add(new THREE.Mesh(this.cncTurretBaseGeom, frameMat));
      const barrel = new THREE.Mesh(this.cncTurretBarrelGeom, cncBarrelMat);
      barrel.rotation.z = -Math.PI / 3;
      barrel.position.set(0.28, 0.18, 0);
      turretGroup.add(barrel);

      root.add(turretGroup);
    }

    return root;
  }

  /**
   * Builds the "Hephaes" Star-Station Orbital Refinery (docs/artstyle.md #03).
   * Curves the rectangular forge platform along the host planet's exact `orbitalRingRadius`
   * so the deck, central forge spine, and twin glowing heat-sink banks hug the orbital arc.
   */
  private buildHephaesRefinery(
    isComplete: boolean,
    orbitalRingRadius: number,
  ): THREE.Group {
    const root = new THREE.Group();
    const hullMat = isComplete ? this.primaryHullMat : this.buildingWireframeMat;
    const ochreMat = isComplete ? this.accentOchreMat : this.buildingWireframeMat;
    const frameMat = isComplete ? this.darkFrameMat : this.buildingWireframeMat;
    const trimMat = isComplete ? this.steelTrimMat : this.buildingWireframeMat;
    const heatMat = isComplete ? this.moltenHeatSinkMat : this.buildingWireframeMat;
    const obsMat = isComplete ? this.observationWindowMat : this.buildingWireframeMat;
    const cabinMat = isComplete ? this.warmCabinMat : this.buildingWireframeMat;

    const ringR = Math.max(18, orbitalRingRadius);
    const refineryScale = 1.5;
    const segmentCount = 7;
    const segmentArcSpacing = 2.02 * refineryScale; // ~21.2u total arc length (1.5x scale, fits inside 1 orbital slot)
    const halfSpan = ((segmentCount - 1) * segmentArcSpacing) * 0.5;

    for (let i = 0; i < segmentCount; i++) {
      const arcS = -halfSpan + i * segmentArcSpacing;
      const theta = arcS / ringR;
      const segPivot = new THREE.Group();

      // Map segment onto circular orbital arc centered at (-ringR, 0, 0)
      segPivot.position.set(
        ringR * Math.cos(theta) - ringR,
        0,
        ringR * Math.sin(theta),
      );
      segPivot.rotation.y = -theta;
      segPivot.scale.setScalar(refineryScale);

      // 1. Main Curved Platform Deck & Ventral Material Transport Elevator Keel
      segPivot.add(new THREE.Mesh(this.refDeckSegGeom, hullMat));

      const keel = new THREE.Mesh(this.refKeelSegGeom, frameMat);
      keel.position.set(0, -0.52, 0);
      segPivot.add(keel);

      // 2. Central Linear Forge Spine
      const spine = new THREE.Mesh(this.refSpineSegGeom, trimMat);
      spine.position.set(0, 0.58, 0);
      segPivot.add(spine);

      // 3. Twin Parallel Glowing Heat-Sink Banks (Iron/Silicate Smelters) on inner & outer flanks
      for (const side of [-1, 1]) {
        const bankGroup = new THREE.Group();
        bankGroup.position.set(side * 1.48, 0.85, 0);
        // Slight outward V-cant matching the Front View schematic
        bankGroup.rotation.z = -side * 0.14;

        bankGroup.add(new THREE.Mesh(this.refHeatSinkCoreGeom, heatMat));

        // 4 dark radiator fins framing each glowing copper-orange smelter core
        for (const finZ of [-0.66, -0.22, 0.22, 0.66]) {
          const fin = new THREE.Mesh(this.refHeatSinkFinGeom, frameMat);
          fin.position.set(0, 0.08, finZ);
          bankGroup.add(fin);
        }

        segPivot.add(bankGroup);

        // 4. Outer Landing & Cargo Pads along the deck apron edges
        if (i === 1 || i === 3 || i === 5) {
          const pad = new THREE.Mesh(this.refLandingPadGeom, frameMat);
          pad.position.set(side * 2.75, 0.24, 0);
          segPivot.add(pad);

          const beacon = new THREE.Mesh(
            this.refPadBeaconGeom,
            i === 3 ? cabinMat : obsMat,
          );
          beacon.position.set(side * 3.18, 0.26, 0);
          segPivot.add(beacon);
        }
      }

      // 5. Central Forge Control Tower (at center segment) & Crystal Processing Array (at end)
      if (i === Math.floor(segmentCount / 2)) {
        const tower = new THREE.Mesh(this.refControlTowerGeom, ochreMat);
        tower.position.set(0, 1.42, 0);
        segPivot.add(tower);

        const towerWin = new THREE.Mesh(this.refControlWindowGeom, obsMat);
        towerWin.position.set(0, 1.72, 0);
        segPivot.add(towerWin);
      } else if (i === segmentCount - 1) {
        const crystalArray = new THREE.Mesh(this.refCrystalArrayGeom, obsMat);
        crystalArray.position.set(0, 0.92, 0);
        segPivot.add(crystalArray);
      }

      root.add(segPivot);
    }

    return root;
  }

  /**
   * Builds the "Vanguard" Planetary Outpost (docs/artstyle.md #04).
   * Curves an elongated rectangular bastion deck (with chamfered octagonal end-prows) along the
   * host planet's exact `orbitalRingRadius` to fill its 1-slot orbital footprint, featuring a central
   * Phased-Array Geodesic Sensor Sphere, Fortified Command Core, sunken Fleet Supply Depots,
   * 4 Twin-Barrel Automated Gatling Point-Defense Turrets, and Planetary Anchoring Thrusters.
   */
  private buildVanguardPlanetaryOutpost(
    isComplete: boolean,
    orbitalRingRadius: number,
  ): THREE.Group {
    const root = new THREE.Group();
    const hullMat = isComplete ? this.primaryHullMat : this.buildingWireframeMat;
    const ochreMat = isComplete ? this.accentOchreMat : this.buildingWireframeMat;
    const frameMat = isComplete ? this.darkFrameMat : this.buildingWireframeMat;
    const trimMat = isComplete ? this.steelTrimMat : this.buildingWireframeMat;
    const heatMat = isComplete ? this.moltenHeatSinkMat : this.buildingWireframeMat;
    const obsMat = isComplete ? this.observationWindowMat : this.buildingWireframeMat;
    const cabinMat = isComplete ? this.warmCabinMat : this.buildingWireframeMat;
    const latticeMat = isComplete ? this.geodesicLatticeMat : this.buildingWireframeMat;

    const ringR = Math.max(18, orbitalRingRadius);
    const outpostScale = 1.5;
    const segmentCount = 7;
    const segmentArcSpacing = 2.02 * outpostScale; // ~21.2u total curved arc length (fills 1 orbital slot)
    const halfSpan = ((segmentCount - 1) * segmentArcSpacing) * 0.5;
    const centerIdx = Math.floor(segmentCount / 2);

    const outpostBarrelMat = isComplete ? this.turretBarrelMat : this.buildingWireframeMat;
    const buildPdGatlingTurret = (yaw: number): THREE.Group => {
      const turretGroup = new THREE.Group();
      turretGroup.add(new THREE.Mesh(this.outpostPdPedestalGeom, frameMat));

      const head = new THREE.Group();
      head.position.set(0, 0.34, 0);
      head.rotation.y = yaw;
      head.add(new THREE.Mesh(this.outpostPdHousingGeom, hullMat));

      for (const drumSide of [-1, 1]) {
        const drum = new THREE.Mesh(this.outpostPdAmmoDrumGeom, ochreMat);
        drum.position.set(drumSide * 0.36, -0.04, -0.04);
        head.add(drum);

        const barrel = new THREE.Mesh(this.outpostPdBarrelGeom, outpostBarrelMat);
        barrel.rotation.x = Math.PI / 2.2;
        barrel.position.set(drumSide * 0.12, 0.06, 0.52);
        head.add(barrel);
      }

      turretGroup.add(head);
      return turretGroup;
    };

    for (let i = 0; i < segmentCount; i++) {
      const arcS = -halfSpan + i * segmentArcSpacing;
      const theta = arcS / ringR;
      const segPivot = new THREE.Group();

      // Map segment onto circular orbital arc centered at (-ringR, 0, 0)
      segPivot.position.set(
        ringR * Math.cos(theta) - ringR,
        0,
        ringR * Math.sin(theta),
      );
      segPivot.rotation.y = -theta;
      segPivot.scale.setScalar(outpostScale);

      const isEndCap = i === 0 || i === segmentCount - 1;
      const isCenter = i === centerIdx;

      // 1. Curved Rectangular Bastion Deck (with chamfered hexagonal end-prows)
      if (isEndCap) {
        const endDeck = new THREE.Mesh(this.outpostEndProwGeom, hullMat);
        endDeck.scale.set(1.08, 1.0, 0.62);
        segPivot.add(endDeck);

        // Fore/Aft Planetary Anchoring Thrusters at the ends of the curved bastion
        const endDir = i === 0 ? -1 : 1;
        const endThruster = new THREE.Mesh(this.outpostAnchorThrusterGeom, frameMat);
        endThruster.position.set(0, -0.05, endDir * 1.38);
        segPivot.add(endThruster);

        const endGlow = new THREE.Mesh(this.refPadBeaconGeom, heatMat);
        endGlow.scale.set(1.2, 0.9, 0.45);
        endGlow.position.set(0, -0.02, endDir * 1.82);
        segPivot.add(endGlow);
      } else {
        segPivot.add(new THREE.Mesh(this.outpostDeckSegGeom, hullMat));

        const keel = new THREE.Mesh(this.refKeelSegGeom, frameMat);
        keel.position.set(0, -0.48, 0);
        segPivot.add(keel);

        // Raised perimeter armor berm & recessed glowing copper-amber conduit channels
        for (const side of [-1, 1]) {
          const berm = new THREE.Mesh(this.outpostBermWallGeom, frameMat);
          berm.position.set(side * 2.34, 0.36, 0);
          segPivot.add(berm);

          const channel = new THREE.Mesh(this.outpostThermalChannelGeom, heatMat);
          channel.position.set(side * 2.02, 0.25, 0);
          segPivot.add(channel);
        }
      }

      // 2. Central Fortified Command Core & Phased-Array Geodesic Sensor Sphere
      if (isCenter) {
        const ventralInterface = new THREE.Mesh(this.outpostVentralHullGeom, frameMat);
        ventralInterface.position.set(0, -0.78, 0);
        segPivot.add(ventralInterface);

        const cmdBase = new THREE.Mesh(this.outpostCommandBaseGeom, hullMat);
        cmdBase.position.set(0, 0.58, 0);
        segPivot.add(cmdBase);

        const cmdTier = new THREE.Mesh(this.outpostCommandTierGeom, ochreMat);
        cmdTier.position.set(0, 1.15, 0);
        segPivot.add(cmdTier);

        const cmdWindows = new THREE.Mesh(this.refControlWindowGeom, cabinMat);
        cmdWindows.scale.set(1.85, 0.95, 1.85);
        cmdWindows.position.set(0, 0.88, 0);
        segPivot.add(cmdWindows);

        // Phased-Array Geodesic Sensor Sphere (inner glowing cyan dome + outer geodesic wireframe lattice)
        const domeCore = new THREE.Mesh(this.outpostSensorDomeCoreGeom, obsMat);
        domeCore.position.set(0, 1.98, 0);
        segPivot.add(domeCore);

        const domeLattice = new THREE.Mesh(
          this.outpostSensorDomeLatticeGeom,
          latticeMat,
        );
        domeLattice.position.set(0, 1.98, 0);
        segPivot.add(domeLattice);

        // Long-Range Communications Array Mast
        const commMast = new THREE.Mesh(this.cncAntennaMastGeom, trimMat);
        commMast.position.set(-1.35, 1.72, 0);
        segPivot.add(commMast);

        if (isComplete) {
          const beacon = new THREE.Mesh(this.cncBeaconTipGeom, this.beaconRedMat);
          beacon.position.set(-1.35, 2.5, 0);
          segPivot.add(beacon);
        }

        // Lateral Planetary Anchoring Thrusters on the central core flanks
        for (const side of [-1, 1]) {
          const flankThruster = new THREE.Mesh(this.outpostAnchorThrusterGeom, frameMat);
          flankThruster.position.set(side * 2.72, -0.04, 0);
          segPivot.add(flankThruster);
        }
      } else {
        // 3. Sunken Fleet Supply Depots (Ochre Cargo Module Stacks & Cylindrical Supply Canisters)
        for (const side of [-1, 1]) {
          const crate = new THREE.Mesh(this.outpostSupplyCrateGeom, ochreMat);
          crate.position.set(side * 1.18, 0.44, -0.36);
          segPivot.add(crate);

          const canister = new THREE.Mesh(this.outpostSupplyCanisterGeom, trimMat);
          canister.rotation.z = Math.PI / 2;
          canister.position.set(side * 1.15, 0.36, 0.42);
          segPivot.add(canister);
        }

        // 4. Automated Light Point-Defense Turrets (4 Twin-Barrel Gatling Modules on segments 2 & 4)
        if (i === centerIdx - 1 || i === centerIdx + 1) {
          const zDir = i < centerIdx ? -1 : 1;
          for (const side of [-1, 1]) {
            const yaw = Math.atan2(side * 0.8, zDir);
            const pdTurret = buildPdGatlingTurret(yaw);
            pdTurret.position.set(side * 1.65, 0.38, zDir * 0.25);
            segPivot.add(pdTurret);
          }
        }
      }

      root.add(segPivot);
    }

    return root;
  }

  /**
   * Builds the "Titan" 2-Slot Orbital Dockyard (docs/artstyle.md #05).
   * Option A layout:
   * - The rear Central Manufacturing & Fabrication Core curves along the 2-slot orbital ring arc
   *   (`~32u` wide across the two slots), keeping inward (`-X`) radial reach at `~3.2u` so it never
   *   clips the planet's atmosphere.
   * - Three heavy dry-dock piers and two wide-open parallel slipways (**Slot 1: Primary Dreadnought Bay**
   *   and **Slot 2: Cruiser / Carrier Bay**) project outward (`+X`) into deep space away from the planet.
   * - Includes live animations via `userData.animateStation`: progressive 3D hull assembly with a
   *   sweeping laser-fabrication scanner plane, 4 traversing Colossal Gantry Cranes with articulated
   *   welding arms and spark flares, pulsing cyan force-field hangar portals, shuttling Material
   *   Transport Elevators, rotating Dockyard Control Tower radar sphere, and sequential runway strobes.
   */
  private buildTitanOrbitalDockyard(
    isComplete: boolean,
    orbitalRingRadius: number,
  ): THREE.Group {
    const root = new THREE.Group();
    const hullMat = isComplete ? this.primaryHullMat : this.buildingWireframeMat;
    const ochreMat = isComplete ? this.accentOchreMat : this.buildingWireframeMat;
    const frameMat = isComplete ? this.darkFrameMat : this.buildingWireframeMat;
    const trimMat = isComplete ? this.steelTrimMat : this.buildingWireframeMat;
    const heatMat = isComplete ? this.moltenHeatSinkMat : this.buildingWireframeMat;
    const obsMat = isComplete ? this.observationWindowMat : this.buildingWireframeMat;
    const cabinMat = isComplete ? this.warmCabinMat : this.buildingWireframeMat;
    const latticeMat = isComplete ? this.geodesicLatticeMat : this.buildingWireframeMat;
    const portalMat = isComplete ? this.dockForceFieldMat : this.buildingWireframeMat;
    const scannerMat = isComplete ? this.dockLaserScannerMat : this.buildingWireframeMat;
    const flareMat = isComplete ? this.dockWeldingFlareMat : this.buildingWireframeMat;

    const ringR = Math.max(18, orbitalRingRadius);
    const dockScale = 1.25;

    // 1. Curved Rear Central Manufacturing & Fabrication Core (7 segments spanning the 2-slot orbital arc)
    const rearCoreGroup = new THREE.Group();
    const rearSegCount = 7;
    const rearArcSpacing = 3.85; // ~23.1u unscaled * 1.25 = ~28.9u curved rear wall across the 2-slot section
    const rearHalfSpan = ((rearSegCount - 1) * rearArcSpacing) * 0.5;

    let radarDishGroup: THREE.Group | null = null;

    for (let i = 0; i < rearSegCount; i++) {
      const arcS = -rearHalfSpan + i * rearArcSpacing;
      const theta = arcS / ringR;
      const segPivot = new THREE.Group();
      segPivot.position.set(
        ringR * Math.cos(theta) - ringR,
        0,
        ringR * Math.sin(theta),
      );
      segPivot.rotation.y = -theta;

      const baseBlock = new THREE.Mesh(this.dockRearCoreSegGeom, hullMat);
      baseBlock.position.set(0, 0.2, 0);
      segPivot.add(baseBlock);

      const upperBlock = new THREE.Mesh(this.dockRearUpperDeckGeom, frameMat);
      upperBlock.position.set(-0.25, 1.45, 0);
      segPivot.add(upperBlock);

      // Material Storage Silos & Fleet Supply Intake Ports along the rear fabrication spine
      for (const sz of [-1.15, 1.15]) {
        const silo = new THREE.Mesh(this.dockSiloGeom, i % 2 === 0 ? ochreMat : trimMat);
        silo.position.set(-0.65, 2.25, sz);
        segPivot.add(silo);
      }

      // Central Manufacturing & Fabrication Geodesic Dome (on segment 4, matching Top View schematic)
      if (i === 4) {
        const domeCore = new THREE.Mesh(this.dockFabDomeCoreGeom, obsMat);
        domeCore.position.set(0.15, 2.35, 0);
        segPivot.add(domeCore);

        const domeLattice = new THREE.Mesh(this.dockFabDomeLatticeGeom, latticeMat);
        domeLattice.position.set(0.15, 2.35, 0);
        segPivot.add(domeLattice);
      }

      // Tall Stepped Dockyard Control Tower with Rotating Radar Sphere (on segment 5)
      if (i === 5) {
        const towerBase = new THREE.Mesh(this.dockControlTowerBaseGeom, hullMat);
        towerBase.position.set(-0.35, 2.45, 0);
        segPivot.add(towerBase);

        const towerShaft = new THREE.Mesh(this.dockControlTowerShaftGeom, ochreMat);
        towerShaft.position.set(-0.35, 3.85, 0);
        segPivot.add(towerShaft);

        const towerWin = new THREE.Mesh(this.refControlWindowGeom, cabinMat);
        towerWin.scale.set(1.35, 1.1, 1.35);
        towerWin.position.set(-0.35, 4.15, 0);
        segPivot.add(towerWin);

        const radarPivot = new THREE.Group();
        radarPivot.position.set(-0.35, 5.15, 0);
        radarPivot.add(new THREE.Mesh(this.dockControlRadarSphereGeom, obsMat));
        radarPivot.add(new THREE.Mesh(this.dockControlRadarSphereGeom, latticeMat));
        segPivot.add(radarPivot);
        radarDishGroup = radarPivot;
      }

      rearCoreGroup.add(segPivot);
    }
    rearCoreGroup.scale.setScalar(dockScale);
    root.add(rearCoreGroup);

    // 2. Twin Parallel Outward Slipways & Three Heavy Dry-Dock Piers (+X outward into deep space)
    const slipwaysGroup = new THREE.Group();
    slipwaysGroup.scale.setScalar(dockScale);
    root.add(slipwaysGroup);

    const bayCenterX = 7.4;
    const bay1Z = -4.35; // Slot 1: Primary Dreadnought Bay
    const bay2Z = 4.35; // Slot 2: Cruiser / Carrier Bay
    const outerPierZ = 8.45;

    // Central Dividing Pier + Bulbous Ventral Central Manufacturing Spine (Front View schematic)
    const centerPier = new THREE.Mesh(this.dockCenterPierGeom, hullMat);
    centerPier.position.set(bayCenterX, 0.35, 0);
    slipwaysGroup.add(centerPier);

    const ventralSpine = new THREE.Mesh(this.dockVentralSpineGeom, frameMat);
    ventralSpine.rotation.z = Math.PI / 2;
    ventralSpine.position.set(bayCenterX - 0.3, -1.35, 0);
    slipwaysGroup.add(ventralSpine);

    // Port & Starboard Outer Dry-Dock Piers + Component Hangars / Dry Dock Modules for Smaller Craft
    const elevatorCages: {
      readonly mesh: THREE.Mesh;
      readonly baseY: number;
      readonly phaseOffset: number;
    }[] = [];

    for (const side of [-1, 1]) {
      const pier = new THREE.Mesh(this.dockOuterPierGeom, hullMat);
      pier.position.set(bayCenterX, 0.25, side * outerPierZ);
      slipwaysGroup.add(pier);

      // Glowing Copper-Orange Crane Rail Channels along both sides of each slipway
      const outerRail = new THREE.Mesh(this.dockThermalRailGeom, heatMat);
      outerRail.position.set(bayCenterX, 1.15, side * (outerPierZ - 1.12));
      slipwaysGroup.add(outerRail);

      const innerRail = new THREE.Mesh(this.dockThermalRailGeom, heatMat);
      innerRail.position.set(bayCenterX, 1.32, side * 1.28);
      slipwaysGroup.add(innerRail);

      // Outer Small-Craft Dry-Dock Alcoves (2 per outer flank with docked Havoc Destroyers)
      for (const alcoveX of [4.8, 10.2]) {
        const alcove = new THREE.Mesh(this.dockSmallCraftAlcoveGeom, frameMat);
        alcove.position.set(alcoveX, 0.05, side * (outerPierZ + 1.65));
        slipwaysGroup.add(alcove);

        const escortHull = this.shipModels.buildHavocDestroyerMesh({
          wireframe: !isComplete,
          staged: true,
          scale: 0.68,
        });
        escortHull.rotation.y = Math.PI / 2;
        escortHull.position.set(alcoveX, 0.68, side * (outerPierZ + 1.65));
        slipwaysGroup.add(escortHull);
      }

      // Vertical Material Transport Elevators on the inner slipway walls (Side View schematic)
      for (let eIdx = 0; eIdx < 2; eIdx++) {
        const elevX = 3.8 + eIdx * 5.2;
        const elevZ = side * (outerPierZ - 1.25);
        const track = new THREE.Mesh(this.dockElevatorTrackGeom, frameMat);
        track.position.set(elevX, 0.55, elevZ);
        slipwaysGroup.add(track);

        const cage = new THREE.Mesh(this.dockElevatorCageGeom, ochreMat);
        cage.position.set(elevX, 0.55, elevZ);
        slipwaysGroup.add(cage);
        elevatorCages.push({
          mesh: cage,
          baseY: 0.55,
          phaseOffset: eIdx * 1.9 + (side > 0 ? 0.8 : 0),
        });
      }
    }

    // 3. Slipway Floors, Rear Glowing Cyan Force-Field Portals & Sequential Runway Strobes
    const runwayStrobes: { readonly mesh: THREE.Mesh; readonly index: number }[] = [];

    for (const [bayIdx, bayZ] of [bay1Z, bay2Z].entries()) {
      const floor = new THREE.Mesh(this.dockSlipwayFloorGeom, frameMat);
      floor.position.set(bayCenterX, -0.58, bayZ);
      slipwaysGroup.add(floor);

      // Glowing Cyan Atmospheric Containment Force-Field Hangar Portal at the rear bulkhead
      const portal = new THREE.Mesh(this.dockForceFieldPortalGeom, portalMat);
      portal.position.set(1.55, 0.55, bayZ);
      slipwaysGroup.add(portal);

      const portalFrame = new THREE.Mesh(this.dockPortalFrameTopGeom, ochreMat);
      portalFrame.position.set(1.65, 1.55, bayZ);
      slipwaysGroup.add(portalFrame);

      // 6 Sequential Launch-Corridor Runway Strobes per bay leading out to the open launch mouth (+X)
      for (let sIdx = 0; sIdx < 6; sIdx++) {
        const strobeX = 2.8 + sIdx * 2.1;
        for (const railSide of [-1, 1]) {
          const strobe = new THREE.Mesh(
            this.dockRunwayStrobeGeom,
            sIdx % 2 === 0 ? obsMat : cabinMat,
          );
          strobe.position.set(strobeX, -0.35, bayZ + railSide * 2.15);
          slipwaysGroup.add(strobe);
          runwayStrobes.push({ mesh: strobe, index: sIdx + bayIdx * 2 });
        }
      }
    }

    // 4. Four Colossal Gantry Crane Structures & Articulated Welding Booms (2 per slipway)
    interface GantryCraneRig {
      readonly bridgeGroup: THREE.Group;
      readonly baseX: number;
      readonly travelAmplitude: number;
      readonly phaseOffset: number;
      readonly lowerBoomGroup: THREE.Group;
      readonly weldingFlareMesh: THREE.Mesh;
    }
    const gantries: GantryCraneRig[] = [];

    for (const [bayIdx, bayZ] of [bay1Z, bay2Z].entries()) {
      for (let cIdx = 0; cIdx < 2; cIdx++) {
        const baseX = 4.6 + cIdx * 5.2;
        const bridgeGroup = new THREE.Group();
        bridgeGroup.position.set(baseX, 0, bayZ);

        // Twin vertical gantry towers straddling the slipway
        for (const pSide of [-1, 1]) {
          const pylon = new THREE.Mesh(this.dockGantryPylonGeom, frameMat);
          pylon.position.set(0, 2.15, pSide * 2.75);
          bridgeGroup.add(pylon);

          // Diagonal cantilever truss arm above the gantry tower (Side View & Front View schematic)
          const cantilever = new THREE.Mesh(this.dockGantryCantileverGeom, ochreMat);
          cantilever.rotation.x = -pSide * 0.32;
          cantilever.position.set(0, 3.85, pSide * 1.45);
          bridgeGroup.add(cantilever);
        }

        // Overhead horizontal gantry cross-beam
        const crossBeam = new THREE.Mesh(this.dockGantryCrossBeamGeom, ochreMat);
        crossBeam.position.set(0, 3.65, 0);
        bridgeGroup.add(crossBeam);

        // Articulated Ship-Assembly Crane Cab & Pivoting Manipulator Boom (Inset Detail)
        const craneCab = new THREE.Mesh(this.dockCraneCabGeom, hullMat);
        craneCab.position.set(0, 3.25, (cIdx === 0 ? -1 : 1) * 0.65);
        bridgeGroup.add(craneCab);

        const lowerBoomGroup = new THREE.Group();
        lowerBoomGroup.position.set(0, 3.05, (cIdx === 0 ? -1 : 1) * 0.65);

        const boomArm = new THREE.Mesh(this.dockCraneArmGeom, trimMat);
        boomArm.position.set(0, -0.68, 0);
        lowerBoomGroup.add(boomArm);

        const weldingFlareMesh = new THREE.Mesh(this.dockWeldingFlareGeom, flareMat);
        weldingFlareMesh.position.set(0, -1.42, 0);
        lowerBoomGroup.add(weldingFlareMesh);

        bridgeGroup.add(lowerBoomGroup);
        slipwaysGroup.add(bridgeGroup);

        gantries.push({
          bridgeGroup,
          baseX,
          travelAmplitude: 1.65,
          phaseOffset: bayIdx * 1.7 + cIdx * 2.4,
          lowerBoomGroup,
          weldingFlareMesh,
        });
      }
    }

    // 5. Progressive 3D Fleet Hull Assemblies Inside Slot 1 (Imperator Dreadnought Bay) & Slot 2 (Cruiser Bay)
    const buildStagedImperatorAssembly = (wireframe: boolean): THREE.Group => {
      const shipGroup = this.shipModels.buildImperatorDreadnoughtMesh({
        wireframe,
        staged: true,
        scale: 0.72,
      });
      shipGroup.rotation.y = Math.PI / 2;
      shipGroup.position.set(7.6, 0.35, bay1Z);
      return shipGroup;
    };

    // Slot 1 (Bay 1): Wireframe skeletal cradle + solid armored Imperator hull that progressive-fills + laser scanner plane
    const bay1WireframeHull = buildStagedImperatorAssembly(true);
    slipwaysGroup.add(bay1WireframeHull);

    const bay1SolidHull = buildStagedImperatorAssembly(!isComplete);
    slipwaysGroup.add(bay1SolidHull);

    const laserScannerPlane = new THREE.Mesh(
      this.dockLaserScannerPlaneGeom,
      scannerMat,
    );
    laserScannerPlane.position.set(7.5, 0.55, bay1Z);
    slipwaysGroup.add(laserScannerPlane);

    // Slot 2 (Bay 2): Approved Cruiser hull staged under assembly
    const bay2Cruiser = this.shipModels.buildCruiserMesh({
      wireframe: !isComplete,
      staged: true,
      scale: 1.0,
    });
    bay2Cruiser.rotation.y = Math.PI / 2;
    bay2Cruiser.position.set(7.4, 0.35, bay2Z);
    slipwaysGroup.add(bay2Cruiser);

    // Attach live per-frame shipyard animation hook to root.userData
    root.userData.animateStation = (
      elapsedSeconds: number,
      activeBuildProgressRatio: number | null,
    ): void => {
      if (!isComplete) {
        return;
      }

      const isActivelyBuilding = activeBuildProgressRatio !== null;
      const speedMult = isActivelyBuilding ? 2.4 : 1.0;
      const progress =
        activeBuildProgressRatio !== null
          ? Math.max(0.05, Math.min(1.0, activeBuildProgressRatio))
          : 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(elapsedSeconds * 0.45));

      // 1. Rotate Dockyard Control Tower Radar Sphere
      if (radarDishGroup) {
        radarDishGroup.rotation.y = elapsedSeconds * 0.85 * speedMult;
      }

      // 2. Sweep Laser-Fabrication Scanner Plane & Progressive Hull Solidification in Slot 1 Bay
      const scannerX = 2.6 + progress * 9.8;
      laserScannerPlane.position.x = scannerX;
      bay1SolidHull.scale.set(progress, 1.0, 1.0);
      bay1SolidHull.position.x = 2.4 * (1.0 - progress);

      // 3. Traverse Colossal Gantry Cranes & Flicker Articulated Welding Arcs
      for (const gantry of gantries) {
        const wave = Math.sin(elapsedSeconds * 0.75 * speedMult + gantry.phaseOffset);
        gantry.bridgeGroup.position.x = gantry.baseX + wave * gantry.travelAmplitude;
        gantry.lowerBoomGroup.rotation.z =
          Math.sin(elapsedSeconds * 1.9 * speedMult + gantry.phaseOffset) * 0.28;
        gantry.lowerBoomGroup.rotation.x =
          Math.cos(elapsedSeconds * 1.4 * speedMult + gantry.phaseOffset) * 0.22;

        // Pulse welding arc flare at manipulator tip
        const sparkPulse =
          0.5 +
          0.5 * Math.sin(elapsedSeconds * 16.0 * speedMult + gantry.phaseOffset * 3.1);
        const flareScale = isActivelyBuilding
          ? 0.65 + sparkPulse * 0.95
          : 0.25 + sparkPulse * 0.45;
        gantry.weldingFlareMesh.scale.setScalar(flareScale);
      }

      // 4. Shuttle Material Transport Elevators up and down between lower spine and crane deck
      for (const elev of elevatorCages) {
        elev.mesh.position.y =
          elev.baseY +
          Math.sin(elapsedSeconds * 1.15 * speedMult + elev.phaseOffset) * 0.92;
      }

      // 5. Pulse Sequential Launch-Corridor Runway Strobes outward toward the launch mouth (+X)
      const activeStrobeBucket = Math.floor(elapsedSeconds * 4.5 * speedMult) % 6;
      for (const strobe of runwayStrobes) {
        const isLit = strobe.index % 6 === activeStrobeBucket;
        strobe.mesh.scale.y = isLit ? 1.85 : 0.75;
      }
    };

    return root;
  }

  /**
   * Builds the "Minerva" C&C Tech & Specialization Module (docs/artstyle.md #06).
   * Curves a 7-segment rectangular R&D deck (`1.5x` scale: `~21.2u` arc length × `~8.2u` radial width)
   * along the host planet's exact `orbitalRingRadius` to fill its 1-slot footprint while elevating
   * the faction's gunmetal-and-ochre industrial theme with high-tech R&D accents:
   * - Central Data Core & Multi-Story R&D Labs crowned by a translucent Geodesic Dome with rotating
   *   internal Quantum Computing Monoliths and 4 Data Relay Spires.
   * - Advanced Hull Development Bay projecting a hovering 3D cyan wireframe prototype capital ship hologram.
   * - Doctrine Integration & Calibration Lab projecting a floating miniature fleet formation above a holo-table.
   * - Cruciform 4-wing Modular R&D Lab Modules (Inset Detail), Fleet Logistics & Supply Core cargo stacks,
   *   external ochre Data Conduit Spine pipes, and glowing violet-cyan Multi-Prism Quantum Sensor Nodes.
   */
  private buildMinervaTechModule(
    isComplete: boolean,
    orbitalRingRadius: number,
  ): THREE.Group {
    const root = new THREE.Group();
    const hullMat = isComplete ? this.primaryHullMat : this.buildingWireframeMat;
    const ochreMat = isComplete ? this.accentOchreMat : this.buildingWireframeMat;
    const frameMat = isComplete ? this.darkFrameMat : this.buildingWireframeMat;
    const trimMat = isComplete ? this.steelTrimMat : this.buildingWireframeMat;
    const heatMat = isComplete ? this.moltenHeatSinkMat : this.buildingWireframeMat;
    const obsMat = isComplete ? this.observationWindowMat : this.buildingWireframeMat;
    const cabinMat = isComplete ? this.warmCabinMat : this.buildingWireframeMat;
    const latticeMat = isComplete ? this.geodesicLatticeMat : this.buildingWireframeMat;
    const domeMat = isComplete ? this.techTranslucentDomeMat : this.buildingWireframeMat;
    const quantumMat = isComplete ? this.techQuantumVioletMat : this.buildingWireframeMat;
    const holoWireMat = isComplete ? this.techHoloWireframeMat : this.buildingWireframeMat;
    const holoSurfMat = isComplete ? this.techHoloSurfaceMat : this.buildingWireframeMat;

    const ringR = Math.max(18, orbitalRingRadius);
    const techScale = 1.5;
    const segmentCount = 7;
    const segmentArcSpacing = 2.02 * techScale; // ~21.2u total curved arc length (fills 1 orbital slot)
    const halfSpan = ((segmentCount - 1) * segmentArcSpacing) * 0.5;
    const centerIdx = Math.floor(segmentCount / 2);

    const buildCruciformLabModule = (): THREE.Group => {
      const labGroup = new THREE.Group();
      const hub = new THREE.Mesh(this.techCruciformHubGeom, hullMat);
      hub.position.set(0, 0.28, 0);
      labGroup.add(hub);

      const sensorCap = new THREE.Mesh(this.techPrismOrbGeom, quantumMat);
      sensorCap.scale.setScalar(0.65);
      sensorCap.position.set(0, 0.68, 0);
      labGroup.add(sensorCap);

      for (const yaw of [0, Math.PI / 2, Math.PI, (Math.PI * 3) / 2]) {
        const wingPivot = new THREE.Group();
        wingPivot.rotation.y = yaw;
        const wing = new THREE.Mesh(this.techCruciformWingGeom, ochreMat);
        wing.position.set(0.55, 0.24, 0);
        wingPivot.add(wing);
        labGroup.add(wingPivot);
      }
      return labGroup;
    };

    let internalQuantumCoreGroup: THREE.Group | null = null;
    let holoPrototypeShipGroup: THREE.Group | null = null;
    let holoFleetFormationGroup: THREE.Group | null = null;
    const prismOrbs: { readonly mesh: THREE.Mesh; readonly phase: number }[] = [];

    for (let i = 0; i < segmentCount; i++) {
      const arcS = -halfSpan + i * segmentArcSpacing;
      const theta = arcS / ringR;
      const segPivot = new THREE.Group();

      // Map segment onto circular orbital arc centered at (-ringR, 0, 0)
      segPivot.position.set(
        ringR * Math.cos(theta) - ringR,
        0,
        ringR * Math.sin(theta),
      );
      segPivot.rotation.y = -theta;
      segPivot.scale.setScalar(techScale);

      const isEndCap = i === 0 || i === segmentCount - 1;
      const isCenter = i === centerIdx;

      // 1. Curved Rectangular R&D Bastion Deck + External Ochre Data Conduit Spine Pipes (Side View)
      if (isEndCap) {
        const endDeck = new THREE.Mesh(this.outpostEndProwGeom, hullMat);
        endDeck.scale.set(1.08, 1.0, 0.62);
        segPivot.add(endDeck);

        const endDir = i === 0 ? -1 : 1;
        const relayPod = new THREE.Mesh(this.outpostAnchorThrusterGeom, frameMat);
        relayPod.position.set(0, -0.04, endDir * 1.36);
        segPivot.add(relayPod);

        // Multi-Prism Quantum Sensor Node at each chamfered end-prow
        const endBase = new THREE.Mesh(this.techPrismNodeBaseGeom, frameMat);
        endBase.position.set(0, 0.34, endDir * 0.45);
        segPivot.add(endBase);

        const endOrb = new THREE.Mesh(this.techPrismOrbGeom, quantumMat);
        endOrb.position.set(0, 0.62, endDir * 0.45);
        segPivot.add(endOrb);
        prismOrbs.push({ mesh: endOrb, phase: i * 1.3 });
      } else {
        segPivot.add(new THREE.Mesh(this.outpostDeckSegGeom, hullMat));

        const keel = new THREE.Mesh(this.refKeelSegGeom, frameMat);
        keel.position.set(0, -0.48, 0);
        segPivot.add(keel);

        for (const side of [-1, 1]) {
          const berm = new THREE.Mesh(this.outpostBermWallGeom, frameMat);
          berm.position.set(side * 2.34, 0.36, 0);
          segPivot.add(berm);

          const channel = new THREE.Mesh(this.outpostThermalChannelGeom, heatMat);
          channel.position.set(side * 2.02, 0.25, 0);
          segPivot.add(channel);

          // External Data Conduit Spine Pipe running along the lower hull flanks (Side View schematic)
          const conduitPipe = new THREE.Mesh(this.techDataConduitPipeGeom, ochreMat);
          conduitPipe.rotation.x = Math.PI / 2;
          conduitPipe.position.set(side * 2.58, -0.04, 0);
          segPivot.add(conduitPipe);

          // Perimeter Multi-Prism Quantum Sensor Nodes along the berm
          if (i % 2 === 1) {
            const nodeBase = new THREE.Mesh(this.techPrismNodeBaseGeom, trimMat);
            nodeBase.position.set(side * 2.32, 0.62, 0);
            segPivot.add(nodeBase);

            const orb = new THREE.Mesh(this.techPrismOrbGeom, quantumMat);
            orb.position.set(side * 2.32, 0.92, 0);
            segPivot.add(orb);
            prismOrbs.push({ mesh: orb, phase: i * 0.9 + (side > 0 ? 1.5 : 0) });
          }
        }
      }

      // 2. Central Data Core, Multi-Story R&D Labs, Translucent Geodesic Dome & 4 Data Relay Spires
      if (isCenter) {
        const ventralInterface = new THREE.Mesh(this.outpostVentralHullGeom, frameMat);
        ventralInterface.position.set(0, -0.78, 0);
        segPivot.add(ventralInterface);

        const labBase = new THREE.Mesh(this.outpostCommandBaseGeom, hullMat);
        labBase.scale.set(1.08, 1.15, 1.08);
        labBase.position.set(0, 0.64, 0);
        segPivot.add(labBase);

        const labTier = new THREE.Mesh(this.outpostCommandTierGeom, ochreMat);
        labTier.scale.set(1.06, 1.2, 1.06);
        labTier.position.set(0, 1.28, 0);
        segPivot.add(labTier);

        const labWindows = new THREE.Mesh(this.refControlWindowGeom, cabinMat);
        labWindows.scale.set(1.92, 1.0, 1.92);
        labWindows.position.set(0, 0.96, 0);
        segPivot.add(labWindows);

        // Internal Quantum Server Monoliths visible inside the translucent Geodesic Data Core Dome
        const quantumCorePivot = new THREE.Group();
        quantumCorePivot.position.set(0, 2.05, 0);
        for (const [mIdx, offset] of [
          [-0.38, -0.28],
          [0.38, -0.28],
          [0.0, 0.36],
        ].entries()) {
          const monolith = new THREE.Mesh(
            this.techDataCoreBlockGeom,
            mIdx === 2 ? quantumMat : ochreMat,
          );
          monolith.position.set(offset[0] ?? 0, 0, offset[1] ?? 0);
          quantumCorePivot.add(monolith);
        }
        segPivot.add(quantumCorePivot);
        internalQuantumCoreGroup = quantumCorePivot;

        const domeCore = new THREE.Mesh(this.outpostSensorDomeCoreGeom, domeMat);
        domeCore.position.set(0, 2.12, 0);
        segPivot.add(domeCore);

        const domeLattice = new THREE.Mesh(
          this.outpostSensorDomeLatticeGeom,
          latticeMat,
        );
        domeLattice.position.set(0, 2.12, 0);
        segPivot.add(domeLattice);

        // 4 Tall Data Relay Towers & Sensor Array Spires flanking the Central Data Core
        for (const sx of [-1.45, 1.45]) {
          for (const sz of [-0.72, 0.72]) {
            const spire = new THREE.Mesh(this.techRelaySpireGeom, trimMat);
            spire.position.set(sx, 2.15, sz);
            segPivot.add(spire);
          }
        }
      } else if (i === 1) {
        // 3. Advanced Hull Development Bay (Floating 3D Cyan Wireframe Prototype Ship Hologram)
        const holoPad = new THREE.Mesh(this.techHoloTableGeom, holoSurfMat);
        holoPad.position.set(0, 0.28, 0);
        segPivot.add(holoPad);

        const holoShip = new THREE.Group();
        holoShip.position.set(0, 0.92, 0);

        const hullBody = new THREE.Mesh(this.techHoloHullMainGeom, holoWireMat);
        holoShip.add(hullBody);

        const hullBow = new THREE.Mesh(this.techHoloHullBowGeom, holoWireMat);
        hullBow.rotation.x = Math.PI / 2;
        hullBow.position.set(0, 0, 1.05);
        holoShip.add(hullBow);

        const hullWings = new THREE.Mesh(this.techHoloHullWingGeom, holoWireMat);
        hullWings.position.set(0, -0.04, -0.15);
        holoShip.add(hullWings);

        segPivot.add(holoShip);
        holoPrototypeShipGroup = holoShip;
      } else if (i === 5) {
        // 4. Doctrine Integration & Calibration Lab (Tactical Fleet Formation Holo-Table)
        const holoTable = new THREE.Mesh(this.techHoloTableGeom, holoSurfMat);
        holoTable.position.set(0, 0.28, 0);
        segPivot.add(holoTable);

        const fleetFormation = new THREE.Group();
        fleetFormation.position.set(0, 0.72, 0);
        const shipOffsets: readonly [number, number, number][] = [
          [0, 0.14, 0.48],
          [-0.44, 0.04, 0.05],
          [0.44, 0.04, 0.05],
          [-0.68, -0.06, -0.42],
          [0.68, -0.06, -0.42],
        ];
        for (const [fx, fy, fz] of shipOffsets) {
          const miniShip = new THREE.Mesh(this.techHoloMiniShipGeom, holoWireMat);
          miniShip.rotation.x = Math.PI / 2;
          miniShip.position.set(fx, fy, fz);
          fleetFormation.add(miniShip);
        }
        segPivot.add(fleetFormation);
        holoFleetFormationGroup = fleetFormation;
      } else if (i === 2 || i === 4) {
        // 5. Cruciform Modular R&D Lab Modules (Inset Detail) & Fleet Logistics Supply Core (+15 Supply)
        const cruciformLab = buildCruciformLabModule();
        cruciformLab.position.set(-0.68, 0.22, 0);
        segPivot.add(cruciformLab);

        for (const crateZ of [-0.38, 0.38]) {
          const crate = new THREE.Mesh(
            this.outpostSupplyCrateGeom,
            crateZ < 0 ? ochreMat : obsMat,
          );
          crate.position.set(1.15, 0.44, crateZ);
          segPivot.add(crate);
        }
      }

      root.add(segPivot);
    }

    // Live R&D holographic & quantum core animations via updateStationAnimation
    root.userData.animateStation = (elapsedSeconds: number): void => {
      if (!isComplete) {
        return;
      }
      if (internalQuantumCoreGroup) {
        internalQuantumCoreGroup.rotation.y = elapsedSeconds * 0.65;
      }
      if (holoPrototypeShipGroup) {
        holoPrototypeShipGroup.position.y =
          0.92 + Math.sin(elapsedSeconds * 1.8) * 0.12;
        holoPrototypeShipGroup.rotation.y = Math.sin(elapsedSeconds * 0.7) * 0.35;
      }
      if (holoFleetFormationGroup) {
        holoFleetFormationGroup.position.y =
          0.72 + Math.cos(elapsedSeconds * 2.1) * 0.09;
        holoFleetFormationGroup.rotation.y = elapsedSeconds * 0.45;
      }
      for (const item of prismOrbs) {
        const pulse = 0.85 + 0.3 * Math.sin(elapsedSeconds * 3.2 + item.phase);
        item.mesh.scale.setScalar(pulse);
        item.mesh.rotation.y = elapsedSeconds * 1.2 + item.phase;
      }
    };

    return root;
  }

  /**
   * Builds the "Aegis" 2-Slot Heavy Orbital Defense Platform & Remote Vertical Sentry Turrets (docs/artstyle.md #07).
   * - Main 2-Slot Double-Bastion Fortress (`aegis_main_platform`):
   *   - Central Fire-Control & Shield-Generation Core bridge topped by a geodesic fire-control sensor dome.
   *   - Twin curved octagonal weapon bastions (**Slot 1: Primary Heavy Battery** & **Slot 2: Secondary Bombardment Array**)
   *     curving along the host planet's `orbitalRingRadius` (`~33u` tangential span).
   *   - Each bastion mounts an **Articulated Triple-Barrel Spinal-Mount Heavy Plasma Cannon** (with glowing violet-blue
   *     plasma barrels and ochre ammunition feed drums), a secondary **Turreted Macro-Cannon Battery**, a perimeter
   *     **Point-Defense Grid**, **Coolant System Radiators**, **Ammunition Hoists**, and an overlapping figure-8
   *     **Planetary Shield Emitter Bubble Shell**.
   * - 3 Remote-Controlled Vertical Sentry Turrets (`aegis_remote_sentry_turrets`):
   *   - Built simultaneously and tethered to the main platform's lifecycle (destroyed automatically if the main platform
   *     is destroyed), stationed around the flanks and far opposite side of the planet (`-108°`, `180°`, `+108°`) so at
   *     least one battery always has direct line of sight to hostile fleets approaching from behind the planet.
   *   - Each remote turret features a tall armored **Vertical Sentry Gun Spine**, an upper rotating **Heavy Plasma Crown
   *     Turret**, 3 vertically stacked rotating **Point-Defense (`PDx2`) Turrets**, and a lower **Reactor & Power Core
   *     Access Base** with twin rear station-keeping thrusters.
   */
  private buildAegisHeavyDefensePlatform(
    isComplete: boolean,
    orbitalRingRadius: number,
  ): THREE.Group {
    const root = new THREE.Group();
    const hullMat = isComplete ? this.primaryHullMat : this.buildingWireframeMat;
    const ochreMat = isComplete ? this.accentOchreMat : this.buildingWireframeMat;
    const frameMat = isComplete ? this.darkFrameMat : this.buildingWireframeMat;
    const trimMat = isComplete ? this.steelTrimMat : this.buildingWireframeMat;
    const heatMat = isComplete ? this.moltenHeatSinkMat : this.buildingWireframeMat;
    const obsMat = isComplete ? this.observationWindowMat : this.buildingWireframeMat;
    const cabinMat = isComplete ? this.warmCabinMat : this.buildingWireframeMat;
    const latticeMat = isComplete ? this.geodesicLatticeMat : this.buildingWireframeMat;
    const barrelMat = isComplete ? this.turretBarrelMat : this.buildingWireframeMat;

    const ringR = Math.max(18, orbitalRingRadius);
    const mainPlatformGroup = new THREE.Group();
    mainPlatformGroup.name = 'aegis_main_platform';
    root.add(mainPlatformGroup);

    // 1. Central Fire-Control & Shield-Generation Core Bridge (at midpoint between the 2 occupied slots)
    const centerCoreGroup = new THREE.Group();
    centerCoreGroup.scale.setScalar(1.3);

    const centralBridge = new THREE.Mesh(this.aegisCentralBridgeGeom, hullMat);
    centralBridge.position.set(0, 0.15, 0);
    centerCoreGroup.add(centralBridge);

    const ventralCore = new THREE.Mesh(this.outpostVentralHullGeom, frameMat);
    ventralCore.position.set(0, -0.78, 0);
    centerCoreGroup.add(ventralCore);

    const fireControlBase = new THREE.Mesh(this.aegisFireControlBaseGeom, ochreMat);
    fireControlBase.position.set(0, 1.15, 0);
    centerCoreGroup.add(fireControlBase);

    const fireControlWin = new THREE.Mesh(this.refControlWindowGeom, cabinMat);
    fireControlWin.scale.set(1.85, 1.0, 1.85);
    fireControlWin.position.set(0, 1.38, 0);
    centerCoreGroup.add(fireControlWin);

    const domeCore = new THREE.Mesh(this.outpostSensorDomeCoreGeom, obsMat);
    domeCore.position.set(0, 2.15, 0);
    centerCoreGroup.add(domeCore);

    const domeLattice = new THREE.Mesh(this.outpostSensorDomeLatticeGeom, latticeMat);
    domeLattice.position.set(0, 2.15, 0);
    centerCoreGroup.add(domeLattice);

    mainPlatformGroup.add(centerCoreGroup);

    // 2. Twin Curved Octagonal Bastion Lobes (Slot 1: Primary Heavy Battery & Slot 2: Secondary Bombardment Array)
    const spinalTurrets: { readonly pivot: THREE.Group; readonly baseYaw: number }[] = [];
    const macroTurrets: { readonly pivot: THREE.Group; readonly baseYaw: number }[] = [];

    const lobeScale = 1.35;
    const lobeArcOffset = 8.4; // Positions lobes at ±8.4u along the orbital arc (~33u total 2-slot span)
    const lobeR = ringR + 1.15;

    for (const side of [-1, 1]) {
      const theta = (side * lobeArcOffset) / ringR;
      const lobePivot = new THREE.Group();
      lobePivot.position.set(
        lobeR * Math.cos(theta) - ringR,
        0,
        lobeR * Math.sin(theta),
      );
      lobePivot.rotation.y = -theta;
      lobePivot.scale.setScalar(lobeScale);

      // Stepped Octagonal Bastion Hull + Ventral Reactor Keel
      const lowerDeck = new THREE.Mesh(this.aegisLobeLowerDeckGeom, hullMat);
      lobePivot.add(lowerDeck);

      const ventralHull = new THREE.Mesh(this.aegisLobeVentralHullGeom, frameMat);
      ventralHull.position.set(0, -0.95, 0);
      lobePivot.add(ventralHull);

      const midTier = new THREE.Mesh(this.aegisLobeMidTierGeom, frameMat);
      midTier.position.set(0, 0.88, 0);
      lobePivot.add(midTier);

      const upperMount = new THREE.Mesh(this.aegisLobeUpperMountGeom, hullMat);
      upperMount.position.set(-0.35, 1.68, -side * 0.35);
      lobePivot.add(upperMount);

      // Glowing Copper-Orange Coolant System Radiators & Vertical Ammunition Hoist Pipes (Side View)
      for (const radAngle of [0, Math.PI / 2, Math.PI, (Math.PI * 3) / 2]) {
        const rad = new THREE.Mesh(this.aegisRadiatorBankGeom, heatMat);
        rad.position.set(Math.cos(radAngle) * 4.15, 0.55, Math.sin(radAngle) * 4.15);
        rad.rotation.y = -radAngle;
        lobePivot.add(rad);
      }

      for (const hoistZ of [-1.85, 1.85]) {
        const hoist = new THREE.Mesh(this.aegisAmmoHoistPipeGeom, ochreMat);
        hoist.position.set(-2.35, 0.95, hoistZ);
        lobePivot.add(hoist);
      }

      // Articulated Spinal-Mount Heavy Plasma Cannon Battery (Inset Detail: Triple Violet-Blue Plasma Barrels)
      const spinalBaseYaw = -side * 0.42; // Converge slightly toward the outward central firing sector
      const spinalTurret = new THREE.Group();
      spinalTurret.position.set(-0.25, 2.42, -side * 0.35);
      spinalTurret.rotation.y = spinalBaseYaw;

      const breech = new THREE.Mesh(this.aegisSpinalBreechGeom, hullMat);
      spinalTurret.add(breech);

      const ammoFeed = new THREE.Mesh(this.aegisSpinalAmmoFeedGeom, ochreMat);
      ammoFeed.position.set(-1.35, -0.08, 0);
      spinalTurret.add(ammoFeed);

      // 3 Parallel Machined Steel Heavy Spinal Barrels extending forward (+X outward)
      for (const barrelZ of [-0.62, 0, 0.62]) {
        const barrel = new THREE.Mesh(this.aegisSpinalPlasmaBarrelGeom, barrelMat);
        barrel.rotation.z = -Math.PI / 2.15; // Slight upward elevation matching Side View
        barrel.position.set(2.15, 0.25, barrelZ);
        spinalTurret.add(barrel);

        const collar = new THREE.Mesh(this.aegisSpinalMuzzleCollarGeom, frameMat);
        collar.rotation.z = -Math.PI / 2.15;
        collar.position.set(1.1, 0.14, barrelZ);
        spinalTurret.add(collar);
      }

      lobePivot.add(spinalTurret);
      spinalTurrets.push({ pivot: spinalTurret, baseYaw: spinalBaseYaw });

      // Secondary Turreted Macro-Cannon Battery on the outer bastion shoulder
      const macroBaseYaw = side * 0.55;
      const macroTurret = new THREE.Group();
      macroTurret.position.set(1.15, 1.55, side * 2.35);
      macroTurret.rotation.y = macroBaseYaw;

      macroTurret.add(new THREE.Mesh(this.aegisMacroTurretHousingGeom, hullMat));
      for (const mbZ of [-0.28, 0.28]) {
        const mb = new THREE.Mesh(this.aegisMacroBarrelGeom, barrelMat);
        mb.rotation.z = -Math.PI / 2.2;
        mb.position.set(1.15, 0.12, mbZ);
        macroTurret.add(mb);
      }
      lobePivot.add(macroTurret);
      macroTurrets.push({ pivot: macroTurret, baseYaw: macroBaseYaw });

      // Perimeter Point-Defense Grid & 4 Planetary Shield Emitter Pylons
      for (const emitterYaw of [0.4, 1.9, 3.5, 5.1]) {
        const pylon = new THREE.Mesh(this.aegisShieldEmitterPylonGeom, trimMat);
        pylon.position.set(
          Math.cos(emitterYaw) * 4.65,
          0.85,
          Math.sin(emitterYaw) * 4.65,
        );
        lobePivot.add(pylon);
      }

      mainPlatformGroup.add(lobePivot);
    }

    // 3. Three Remote-Controlled Vertical Sentry Turrets (Second Schematic Image)
    // Stationed around the flanks and far opposite side of the planet so hostile fleets never have a blind spot.
    const remoteTurretsGroup = new THREE.Group();
    remoteTurretsGroup.name = 'aegis_remote_sentry_turrets';
    root.add(remoteTurretsGroup);

    const sentryCrownTurrets: { readonly pivot: THREE.Group; readonly phase: number }[] =
      [];
    const sentryPdTurrets: { readonly pivot: THREE.Group; readonly phase: number }[] = [];

    const sentryStandoffRadius = ringR + AEGIS_REMOTE_SENTRY_STANDOFF_OFFSET;
    const sentryAngles = [-Math.PI * 0.6, Math.PI, Math.PI * 0.6];
    sentryAngles.forEach((theta, idx) => {
      const unit = this.buildVerticalSentryTowerUnit('hull_breaker', isComplete, idx);
      unit.root.scale.setScalar(1.15);
      // Map onto circular perimeter around the host planet center (-ringR, 0, 0)
      unit.root.position.set(
        sentryStandoffRadius * Math.cos(theta) - ringR,
        0,
        sentryStandoffRadius * Math.sin(theta),
      );
      unit.root.rotation.y = -theta;
      remoteTurretsGroup.add(unit.root);

      sentryCrownTurrets.push({ pivot: unit.crownTurretPivot, phase: idx * 2.1 });
      sentryPdTurrets.push(...unit.pdTurretPivots);
    });

    // Live turret tracking animation hook
    root.userData.animateStation = (elapsedSeconds: number): void => {
      if (!isComplete) {
        return;
      }

      for (const [idx, item] of spinalTurrets.entries()) {
        item.pivot.rotation.y =
          item.baseYaw + Math.sin(elapsedSeconds * 0.55 + idx * 2.2) * 0.24;
      }
      for (const [idx, item] of macroTurrets.entries()) {
        item.pivot.rotation.y =
          item.baseYaw + Math.cos(elapsedSeconds * 0.85 + idx * 1.7) * 0.35;
      }
      for (const item of sentryCrownTurrets) {
        item.pivot.rotation.y = Math.sin(elapsedSeconds * 0.75 + item.phase) * 0.55;
      }
      for (const item of sentryPdTurrets) {
        item.pivot.rotation.y = Math.sin(elapsedSeconds * 1.45 + item.phase) * 0.42;
      }
    };

    return root;
  }

  /**
   * Shared vertical sentry tower assembly used by:
   * - `hull_breaker_tower` (and the Aegis remote sentry turrets): mounts the heavy spinal anti-capital
   *   crown cannon above 3 stacked PDx2 side turrets.
   * - `point_defence_tower`: replaces the heavy crown cannon with a compact rapid-tracking Quad-Barrel
   *   Point-Defence Gatling crown turret and targeting sensor mast above 3 stacked PDx2 side turrets.
   */
  private buildVerticalSentryTowerUnit(
    variant: 'hull_breaker' | 'point_defence',
    isComplete: boolean,
    phaseSeed: number,
  ): {
    readonly root: THREE.Group;
    readonly crownTurretPivot: THREE.Group;
    readonly pdTurretPivots: readonly {
      readonly pivot: THREE.Group;
      readonly phase: number;
    }[];
  } {
    const sentryRoot = new THREE.Group();
    const hullMat = isComplete ? this.primaryHullMat : this.buildingWireframeMat;
    const ochreMat = isComplete ? this.accentOchreMat : this.buildingWireframeMat;
    const frameMat = isComplete ? this.darkFrameMat : this.buildingWireframeMat;
    const trimMat = isComplete ? this.steelTrimMat : this.buildingWireframeMat;
    const heatMat = isComplete ? this.moltenHeatSinkMat : this.buildingWireframeMat;
    const barrelMat = isComplete ? this.turretBarrelMat : this.buildingWireframeMat;

    // 1. Cylindrical Vertical Sentry Gun Column, Rib Collars & Radial Power Conduits (allows 360° turret rotation)
    sentryRoot.add(new THREE.Mesh(this.aegisSentrySpineGeom, hullMat));

    for (const ribY of [-1.55, -0.45, 0.75, 1.95]) {
      const rib = new THREE.Mesh(this.aegisSentryRibCollarGeom, frameMat);
      rib.position.set(0, ribY, 0);
      sentryRoot.add(rib);
    }

    for (const conduitYaw of [0, Math.PI / 2, Math.PI, (Math.PI * 3) / 2]) {
      const conduit = new THREE.Mesh(this.aegisSentryConduitStripGeom, heatMat);
      conduit.position.set(
        Math.cos(conduitYaw) * 0.88,
        0,
        Math.sin(conduitYaw) * 0.88,
      );
      conduit.rotation.y = -conduitYaw;
      sentryRoot.add(conduit);
    }

    // 2. Symmetrical Cylindrical Lower Reactor Column Base + 4 Radial Station-Keeping Thrusters
    const reactorBase = new THREE.Mesh(this.aegisSentryReactorBaseGeom, frameMat);
    reactorBase.position.set(0, -2.35, 0);
    sentryRoot.add(reactorBase);

    const reactorCollar = new THREE.Mesh(this.aegisSentryCrownCollarGeom, ochreMat);
    reactorCollar.scale.set(0.95, 0.55, 0.95);
    reactorCollar.position.set(0, -1.78, 0);
    sentryRoot.add(reactorCollar);

    for (const thrustYaw of [0, Math.PI / 2, Math.PI, (Math.PI * 3) / 2]) {
      const thruster = new THREE.Mesh(this.aegisSentryThrusterNozzleGeom, trimMat);
      thruster.position.set(
        Math.cos(thrustYaw) * 1.18,
        -3.15,
        Math.sin(thrustYaw) * 1.18,
      );
      sentryRoot.add(thruster);
    }

    // 3. Flared Upper Crown Collar & Variant-Specific 360° Crown Weapon Mount
    const crownCollar = new THREE.Mesh(this.aegisSentryCrownCollarGeom, hullMat);
    crownCollar.position.set(0, 2.45, 0);
    sentryRoot.add(crownCollar);

    const crownTurretPivot = new THREE.Group();
    crownTurretPivot.position.set(0, 2.98, 0);

    if (variant === 'hull_breaker') {
      // Heavy Anti-Capital Crown Cannon with machined steel grey barrel
      crownTurretPivot.add(new THREE.Mesh(this.aegisSentryTopTurretGeom, ochreMat));

      const topBarrel = new THREE.Mesh(this.aegisSpinalPlasmaBarrelGeom, barrelMat);
      topBarrel.scale.set(0.78, 0.68, 0.78);
      topBarrel.rotation.z = -Math.PI / 2;
      topBarrel.position.set(1.45, 0.06, 0);
      crownTurretPivot.add(topBarrel);
    } else {
      // Compact Rapid-Tracking Quad-Barrel Point-Defence Crown Turret + Targeting Mast
      const pdCrownBase = new THREE.Mesh(this.outpostPdHousingGeom, hullMat);
      pdCrownBase.scale.set(1.35, 1.15, 1.35);
      crownTurretPivot.add(pdCrownBase);

      for (const side of [-1, 1]) {
        const ammoDrum = new THREE.Mesh(this.outpostPdAmmoDrumGeom, ochreMat);
        ammoDrum.position.set(-0.08, -0.04, side * 0.52);
        crownTurretPivot.add(ammoDrum);

        for (const barY of [-0.1, 0.14]) {
          const barrel = new THREE.Mesh(this.aegisSentryPdBarrelGeom, barrelMat);
          barrel.rotation.z = -Math.PI / 2;
          barrel.position.set(0.78, barY, side * 0.22);
          crownTurretPivot.add(barrel);
        }
      }

      const trackingMast = new THREE.Mesh(this.cncAntennaMastGeom, trimMat);
      trackingMast.scale.setScalar(0.65);
      trackingMast.position.set(-0.35, 0.62, 0);
      crownTurretPivot.add(trackingMast);
    }

    sentryRoot.add(crownTurretPivot);

    // 4. Three Vertically Stacked 360°-Rotating Point-Defense (PDx2) Turret Rings around the Column
    const pdTurretPivots: { readonly pivot: THREE.Group; readonly phase: number }[] = [];
    for (const [pdIdx, pdY] of [1.35, 0.15, -1.05].entries()) {
      const pdPivot = new THREE.Group();
      pdPivot.position.set(0, pdY, 0);

      // Rotating collar ring concentric with the vertical column
      pdPivot.add(new THREE.Mesh(this.aegisSentryTurretRingGeom, frameMat));

      const gunMount = new THREE.Group();
      gunMount.position.set(1.02, 0, 0);
      gunMount.add(new THREE.Mesh(this.outpostPdHousingGeom, hullMat));

      const pdAmmo = new THREE.Mesh(this.outpostPdAmmoDrumGeom, ochreMat);
      pdAmmo.position.set(0, -0.26, 0);
      gunMount.add(pdAmmo);

      for (const bz of [-0.14, 0.14]) {
        const pdBarrel = new THREE.Mesh(this.aegisSentryPdBarrelGeom, barrelMat);
        pdBarrel.rotation.z = -Math.PI / 2;
        pdBarrel.position.set(0.62, 0.04, bz);
        gunMount.add(pdBarrel);
      }

      pdPivot.add(gunMount);
      sentryRoot.add(pdPivot);
      pdTurretPivots.push({
        pivot: pdPivot,
        phase: phaseSeed * 1.4 + pdIdx * 1.1,
      });
    }

    return { root: sentryRoot, crownTurretPivot, pdTurretPivots };
  }

  /**
   * Builds standalone Deep-Space Defence Towers (`point_defence_tower` & `hull_breaker_tower`)
   * constructed inside a Logistics Hub's 180u operational build radius (docs/artstyle.md #09 & #10).
   * Turret pivots stay stationary at rest and only activate/rotate when combat targeting locks onto a target.
   */
  private buildDeepSpaceSentryTower(
    variant: 'hull_breaker' | 'point_defence',
    isComplete: boolean,
  ): THREE.Group {
    const unit = this.buildVerticalSentryTowerUnit(
      variant,
      isComplete,
      variant === 'point_defence' ? 1 : 0,
    );
    unit.root.name =
      variant === 'hull_breaker'
        ? 'deep_space_hull_breaker_tower'
        : 'deep_space_point_defence_tower';
    unit.root.scale.setScalar(variant === 'hull_breaker' ? 1.45 : 1.3);

    // Expose turret pivots for future combat target tracking; do not animate idle gun movement
    unit.root.userData.turretPivots = {
      crownTurretPivot: unit.crownTurretPivot,
      pdTurretPivots: unit.pdTurretPivots.map((item) => item.pivot),
    };

    return unit.root;
  }

  /**
   * Builds the "Atlas" Deep-Space Logistics Hub (docs/artstyle.md #08).
   * Free-floating 360-degree radial carrier and tower-fabrication hub featuring:
   * - Wide sloped circular/octagonal lower apron encircled by a translucent cyan hexagonal-lattice
   *   Integrated Shield Emitter Ring and underpinned by a lower-deck Reactor & Thruster Assembly.
   * - 4 Diagonal Rectangular Open Fighter Hangar Bays (`45°, 135°, 225°, 315°`), each housing 6 staged
   *   Fighter craft (`2x3` formation, 24 fighters total) on copper-orange Launch Catapult Systems with
   *   glowing cyan Atmospheric Containment Portals along the outer sloped rim.
   * - 4 Cardinal Industrial & Fleet Supply Wedges (`0°, 90°, 180°, 270°`) housing the Turret / Hull-Breaker
   *   Construction Core, Material Storage Silos, Cargo Modules (+15 Fleet Supply), and Maneuvering Thrusters.
   * - Multi-Tiered Pagoda Fabrication & Command Spire rising from the center with 3 stacked cantilevered
   *   horizontal discs (`Fabrication & Construction Decks` and `Open Hangar Deck`), 4 shuttling vertical
   *   Material Transport Elevators, a geodesic Sensor Array Sphere, and a tall Command Spire Elevation needle.
   */
  private buildAtlasLogisticsHub(isComplete: boolean): THREE.Group {
    const root = new THREE.Group();
    const hullMat = isComplete ? this.primaryHullMat : this.buildingWireframeMat;
    const ochreMat = isComplete ? this.accentOchreMat : this.buildingWireframeMat;
    const frameMat = isComplete ? this.darkFrameMat : this.buildingWireframeMat;
    const trimMat = isComplete ? this.steelTrimMat : this.buildingWireframeMat;
    const heatMat = isComplete ? this.moltenHeatSinkMat : this.buildingWireframeMat;
    const obsMat = isComplete ? this.observationWindowMat : this.buildingWireframeMat;
    const cabinMat = isComplete ? this.warmCabinMat : this.buildingWireframeMat;
    const latticeMat = isComplete ? this.geodesicLatticeMat : this.buildingWireframeMat;
    const portalMat = isComplete ? this.dockForceFieldMat : this.buildingWireframeMat;

    // 1. Wide Sloped Circular Base Apron, Inner Stepped Plateau & Lower-Deck Reactor/Thruster Assembly
    const baseApron = new THREE.Mesh(this.hubBaseApronGeom, hullMat);
    root.add(baseApron);

    const innerPlateau = new THREE.Mesh(this.hubInnerPlateauGeom, frameMat);
    innerPlateau.position.set(0, 1.05, 0);
    root.add(innerPlateau);

    const ventralReactor = new THREE.Mesh(this.hubVentralReactorGeom, frameMat);
    ventralReactor.position.set(0, -1.35, 0);
    root.add(ventralReactor);

    for (const [tx, tz] of [
      [-1.1, -1.1],
      [1.1, -1.1],
      [-1.1, 1.1],
      [1.1, 1.1],
    ] as const) {
      const thruster = new THREE.Mesh(this.hubVentralThrusterGeom, obsMat);
      thruster.position.set(tx, -2.35, tz);
      root.add(thruster);
    }

    // 2. Four Diagonal Fighter Hangar Bays & Launch Catapult Systems (45°, 135°, 225°, 315°)
    const buildStagedFighterMesh = (): THREE.Group => {
      const fighter = this.shipModels.buildStingerFighterMesh({
        wireframe: !isComplete,
        staged: true,
        scale: 0.92,
      });
      // Rotate +Z fighter nose to point outward along the bay's +X launch catapult track
      fighter.rotation.y = Math.PI / 2;
      return fighter;
    };

    const catapultRails: { readonly mesh: THREE.Mesh; readonly phase: number }[] = [];
    const diagonalAngles = [
      Math.PI / 4,
      (Math.PI * 3) / 4,
      (Math.PI * 5) / 4,
      (Math.PI * 7) / 4,
    ];

    diagonalAngles.forEach((yaw, bayIdx) => {
      const bayPivot = new THREE.Group();
      bayPivot.rotation.y = yaw;

      const court = new THREE.Mesh(this.hubHangarCourtGeom, frameMat);
      court.position.set(6.25, 0.72, 0);
      bayPivot.add(court);

      // Raised Copper-Orange Hangar Frame Berms & Launch Catapult Rails (Inset Detail)
      for (const side of [-1, 1]) {
        const berm = new THREE.Mesh(this.hubHangarBermGeom, ochreMat);
        berm.position.set(6.25, 0.96, side * 1.82);
        bayPivot.add(berm);

        const rail = new THREE.Mesh(this.hubCatapultRailGeom, heatMat);
        rail.position.set(6.25, 0.92, side * 0.78);
        bayPivot.add(rail);
        catapultRails.push({ mesh: rail, phase: bayIdx * 1.4 + (side > 0 ? 0.7 : 0) });
      }

      // Glowing Cyan Atmospheric Containment Hangar Portal along the outer sloped saucer rim (Side View)
      const portal = new THREE.Mesh(this.hubHangarPortalGeom, portalMat);
      portal.position.set(8.55, 0.42, 0);
      bayPivot.add(portal);

      // 6 Staged Fighters (2 rows x 3 columns) ready on the Launch Catapult Tracks
      for (const rowZ of [-0.78, 0.78]) {
        for (const colX of [4.85, 6.25, 7.65]) {
          const fighter = buildStagedFighterMesh();
          fighter.position.set(colX, 1.05, rowZ);
          bayPivot.add(fighter);
        }
      }

      root.add(bayPivot);
    });

    // 4. Four Cardinal Logistics, Fleet Supply & Turret-Construction Wedges (0°, 90°, 180°, 270°)
    const cardinalAngles = [0, Math.PI / 2, Math.PI, (Math.PI * 3) / 2];
    for (const yaw of cardinalAngles) {
      const wedgePivot = new THREE.Group();
      wedgePivot.rotation.y = yaw;

      // Material Storage Silos & Cargo Modules (+15 Fleet Supply)
      for (const sz of [-0.85, 0.85]) {
        const silo = new THREE.Mesh(this.dockSiloGeom, ochreMat);
        silo.position.set(5.95, 1.15, sz);
        wedgePivot.add(silo);

        const crate = new THREE.Mesh(this.outpostSupplyCrateGeom, hullMat);
        crate.position.set(7.35, 0.92, sz * 1.15);
        wedgePivot.add(crate);

        const canister = new THREE.Mesh(this.outpostSupplyCanisterGeom, trimMat);
        canister.rotation.z = Math.PI / 2;
        canister.position.set(7.25, 0.88, 0);
        wedgePivot.add(canister);
      }

      // Remote Maneuvering Thruster & Fleet Supply Intake Port on the outer cardinal rim
      const rimThruster = new THREE.Mesh(this.outpostAnchorThrusterGeom, frameMat);
      rimThruster.position.set(8.85, 0.35, 0);
      wedgePivot.add(rimThruster);

      root.add(wedgePivot);
    }

    // 5. Multi-Tiered Pagoda Fabrication & Command Spire (Side View Schematic)
    const spireTrunk = new THREE.Mesh(this.hubSpireTrunkGeom, hullMat);
    spireTrunk.position.set(0, 3.85, 0);
    root.add(spireTrunk);

    // 3 Stacked Cantilevered Horizontal Discs (Open Hangar Deck & Fabrication/Construction Decks)
    const tier1 = new THREE.Mesh(this.hubTierDisc1Geom, hullMat);
    tier1.position.set(0, 2.55, 0);
    root.add(tier1);

    const tier2 = new THREE.Mesh(this.hubTierDisc2Geom, ochreMat);
    tier2.position.set(0, 3.95, 0);
    root.add(tier2);

    const tier3 = new THREE.Mesh(this.hubTierDisc3Geom, hullMat);
    tier3.position.set(0, 5.25, 0);
    root.add(tier3);

    // Warm Amber Bridge Windows between the stacked pagoda decks
    for (const winY of [3.15, 4.55, 5.75]) {
      const winRing = new THREE.Mesh(this.refControlWindowGeom, cabinMat);
      const s = 3.2 - (winY - 3.15) * 0.45;
      winRing.scale.set(s, 0.95, s);
      winRing.position.set(0, winY, 0);
      root.add(winRing);
    }

    // 4 Vertical Material Transport Elevators linking the lower apron to the pagoda fabrication decks
    const elevatorCages: {
      readonly mesh: THREE.Mesh;
      readonly baseY: number;
      readonly phase: number;
    }[] = [];

    cardinalAngles.forEach((yaw, idx) => {
      const elevPivot = new THREE.Group();
      elevPivot.rotation.y = yaw;

      const track = new THREE.Mesh(this.dockElevatorTrackGeom, frameMat);
      track.scale.set(1.0, 1.55, 1.0);
      track.position.set(2.55, 3.65, 0);
      elevPivot.add(track);

      const cage = new THREE.Mesh(this.dockElevatorCageGeom, heatMat);
      cage.position.set(2.65, 3.65, 0);
      elevPivot.add(cage);
      elevatorCages.push({ mesh: cage, baseY: 3.65, phase: idx * 1.6 });

      root.add(elevPivot);
    });

    // Central Command & Control Core + Geodesic Sensor Array Sphere + Tall Command Spire Elevation Needle
    const sensorSpherePivot = new THREE.Group();
    sensorSpherePivot.position.set(0, 6.45, 0);
    sensorSpherePivot.add(new THREE.Mesh(this.outpostSensorDomeCoreGeom, obsMat));
    sensorSpherePivot.add(
      new THREE.Mesh(this.outpostSensorDomeLatticeGeom, latticeMat),
    );
    root.add(sensorSpherePivot);

    const commandNeedle = new THREE.Mesh(this.hubCommandNeedleGeom, ochreMat);
    commandNeedle.position.set(0, 8.35, 0);
    root.add(commandNeedle);

    if (isComplete) {
      const topBeacon = new THREE.Mesh(this.cncBeaconTipGeom, this.beaconRedMat);
      topBeacon.position.set(0, 9.85, 0);
      root.add(topBeacon);
    }

    // Live Logistics Hub animations via updateStationAnimation
    root.userData.animateStation = (elapsedSeconds: number): void => {
      if (!isComplete) {
        return;
      }
      sensorSpherePivot.rotation.y = elapsedSeconds * 0.55;

      for (const elev of elevatorCages) {
        elev.mesh.position.y =
          elev.baseY + Math.sin(elapsedSeconds * 1.25 + elev.phase) * 1.35;
      }
      for (const rail of catapultRails) {
        const pulse = 0.85 + 0.35 * Math.sin(elapsedSeconds * 3.8 + rail.phase);
        rail.mesh.scale.y = pulse;
      }
    };

    return root;
  }
}
