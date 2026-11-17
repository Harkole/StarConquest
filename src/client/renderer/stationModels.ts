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
  private readonly baselineRefineryMat = new THREE.MeshStandardMaterial({
    color: 0xd97706,
    emissive: 0xb45309,
    emissiveIntensity: 0.5,
    metalness: 0.75,
    roughness: 0.35,
  });

  private readonly geometries: THREE.BufferGeometry[] = [];

  // Baseline geometries for non-C&C structures
  private readonly outpostDishGeom = this.registerGeom(
    new THREE.ConeGeometry(2.8, 3.8, 12),
  );
  private readonly refinerySiloGeom = this.registerGeom(
    new THREE.CylinderGeometry(1.8, 1.8, 6.2, 12),
  );
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

  public buildStationMesh(
    structureId: OrbitalStructureId,
    isComplete: boolean,
  ): THREE.Group {
    if (structureId === 'command_and_control') {
      return this.buildPrometheusCommandAndControl(isComplete);
    }

    const group = new THREE.Group();
    const mat = !isComplete
      ? this.buildingWireframeMat
      : structureId === 'refinery'
        ? this.baselineRefineryMat
        : this.baselineStationMat;

    switch (structureId) {
      case 'planetary_outpost': {
        group.add(new THREE.Mesh(this.outpostDishGeom, mat));
        break;
      }
      case 'refinery': {
        const s1 = new THREE.Mesh(this.refinerySiloGeom, mat);
        s1.position.set(0, 0, -1.6);
        const s2 = new THREE.Mesh(this.refinerySiloGeom, mat);
        s2.position.set(0, 0, 1.6);
        group.add(s1, s2);
        break;
      }
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
    this.buildingWireframeMat.dispose();
    this.baselineStationMat.dispose();
    this.baselineRefineryMat.dispose();
  }

  private registerGeom<T extends THREE.BufferGeometry>(geom: T): T {
    this.geometries.push(geom);
    return geom;
  }

  /**
   * Builds the "Prometheus" Star-Station Command & Control (docs/artstyle.md #02).
   * Sized so radial arms reach ~6.8u from center—leaving >4u clearance from the Homeworld's
   * outer atmosphere halo while keeping its vertical upper/lower spires imposing.
   */
  private buildPrometheusCommandAndControl(isComplete: boolean): THREE.Group {
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
}
