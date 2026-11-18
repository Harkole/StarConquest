import * as THREE from 'three';
import type { OrbitalStructureId } from '../../shared/config/index.ts';

/**
 * Shared 3D Orbital Platform & Station Model Builder following `docs/artstyle.md`.
 * Currently houses the full "Prometheus" Command & Control model alongside baseline
 * models for secondary orbital structures (to be upgraded one-by-one).
 */
export class StationModelLibrary {
  // Standardized PBR Materials per docs/artstyle.md
  private readonly primaryHullMat = new THREE.MeshStandardMaterial({
    color: 0x3e4652,
    metalness: 0.68,
    roughness: 0.42,
  });
  private readonly accentOchreMat = new THREE.MeshStandardMaterial({
    color: 0xc27d2c,
    metalness: 0.55,
    roughness: 0.48,
  });
  private readonly darkFrameMat = new THREE.MeshStandardMaterial({
    color: 0x1e232a,
    metalness: 0.78,
    roughness: 0.35,
  });
  private readonly steelTrimMat = new THREE.MeshStandardMaterial({
    color: 0x64748b,
    metalness: 0.75,
    roughness: 0.32,
  });
  private readonly crimsonProwMat = new THREE.MeshStandardMaterial({
    color: 0xb91c1c,
    metalness: 0.45,
    roughness: 0.5,
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

  // Wireframe & Baseline Materials
  private readonly buildingWireframeMat = new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
    wireframe: true,
    transparent: true,
    opacity: 0.75,
  });
  private readonly baselineStationMat = new THREE.MeshStandardMaterial({
    color: 0xe2e8f0,
    emissive: 0x0284c7,
    emissiveIntensity: 0.55,
    metalness: 0.82,
    roughness: 0.25,
  });

  private readonly geometries: THREE.BufferGeometry[] = [];

  // Baseline geometries for remaining structures (to be upgraded one-by-one)
  private readonly dockyardGantryGeom = this.registerGeom(
    new THREE.BoxGeometry(4.8, 2.6, 12.5),
  );
  private readonly techCrystalGeom = this.registerGeom(
    new THREE.OctahedronGeometry(3.1, 0),
  );
  private readonly defenseBastionGeom = this.registerGeom(
    new THREE.CylinderGeometry(3.8, 4.4, 4.2, 8),
  );
  private readonly defenseWingGeom = this.registerGeom(
    new THREE.BoxGeometry(3.2, 1.4, 14),
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
    structureId: OrbitalStructureId,
    isComplete: boolean,
    orbitalRingRadius = 42.56,
  ): THREE.Group {
    if (structureId === 'command_and_control') {
      return this.buildPrometheusCommandAndControl(isComplete, orbitalRingRadius);
    }
    if (structureId === 'refinery') {
      return this.buildHephaesRefinery(isComplete, orbitalRingRadius);
    }
    if (structureId === 'planetary_outpost') {
      return this.buildVanguardPlanetaryOutpost(isComplete, orbitalRingRadius);
    }

    const group = new THREE.Group();
    const mat = !isComplete ? this.buildingWireframeMat : this.baselineStationMat;

    switch (structureId) {
      case 'orbital_dockyard': {
        group.add(new THREE.Mesh(this.dockyardGantryGeom, mat));
        break;
      }
      case 'tech_module': {
        group.add(new THREE.Mesh(this.techCrystalGeom, mat));
        break;
      }
      case 'heavy_defense_platform': {
        group.add(new THREE.Mesh(this.defenseBastionGeom, mat));
        group.add(new THREE.Mesh(this.defenseWingGeom, mat));
        break;
      }
    }
    return group;
  }

  public dispose(): void {
    for (const g of this.geometries) {
      g.dispose();
    }
    this.primaryHullMat.dispose();
    this.accentOchreMat.dispose();
    this.darkFrameMat.dispose();
    this.steelTrimMat.dispose();
    this.crimsonProwMat.dispose();
    this.solarPanelMat.dispose();
    this.observationWindowMat.dispose();
    this.warmCabinMat.dispose();
    this.beaconRedMat.dispose();
    this.moltenHeatSinkMat.dispose();
    this.geodesicLatticeMat.dispose();
    this.buildingWireframeMat.dispose();
    this.baselineStationMat.dispose();
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
    for (const side of [-1, 1]) {
      const turretGroup = new THREE.Group();
      turretGroup.position.set(1.35, 1.62, side * 1.15);

      turretGroup.add(new THREE.Mesh(this.cncTurretBaseGeom, frameMat));
      const barrel = new THREE.Mesh(this.cncTurretBarrelGeom, trimMat);
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

        const barrel = new THREE.Mesh(this.outpostPdBarrelGeom, trimMat);
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
}
