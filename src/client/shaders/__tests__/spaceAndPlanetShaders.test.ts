import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { createFiveSystemGalaxy } from '../../../shared/sim/galaxy.ts';
import {
  computeOrbitalSlotPositions,
  createLivingPlanetGroup,
} from '../../renderer/planetFactory.ts';
import { HarvesterFleetRenderer } from '../../renderer/harvesterFleetRenderer.ts';
import { createStarSystemEnvironment } from '../../renderer/spaceEnvironmentFactory.ts';
import { StationModelLibrary } from '../../renderer/stationModels.ts';
import {
  ASTEROID_ROCK_FRAGMENT_SHADER,
  createCraggyAsteroidGeometry,
  createCrystalClusterGeometry,
  CRYSTAL_SHARD_FRAGMENT_SHADER,
} from '../asteroidShaders.ts';
import {
  NEBULA_PALETTES,
  NEBULA_SKYBOX_FRAGMENT_SHADER,
} from '../nebulaShaders.ts';
import {
  DRIFTING_CLOUDS_FRAGMENT_SHADER,
  PLANET_SHADER_THEME_PARAMS,
  TERRAN_SURFACE_FRAGMENT_SHADER,
  VOLCANIC_ROCK_SURFACE_FRAGMENT_SHADER,
} from '../planetShaders.ts';
import {
  WORMHOLE_FRAGMENT_SHADER,
  WORMHOLE_PROXIMITY_RADIUS,
} from '../wormholeShader.ts';

describe('Space & Planet Shaders and Orbital Ring Geometry', () => {
  it('defines distinct procedural FBM nebula palettes for all 5 galaxy systems', () => {
    const galaxy = createFiveSystemGalaxy();
    for (const system of galaxy.systems) {
      const palette = NEBULA_PALETTES[system.nebulaPalette];
      expect(palette).toBeDefined();
      expect(palette.primaryNebula).toHaveLength(3);
      expect(palette.secondaryNebula).toHaveLength(3);
    }
    expect(NEBULA_SKYBOX_FRAGMENT_SHADER).toContain('fbm');
    expect(WORMHOLE_FRAGMENT_SHADER).toContain('uTime');
  });

  it('configures drifting clouds for Terran/Super-Earth and HDR lava emission for Volcanic worlds', () => {
    expect(PLANET_SHADER_THEME_PARAMS.terran.hasDriftingClouds).toBe(true);
    expect(PLANET_SHADER_THEME_PARAMS.terran.cloudDriftSpeed).toBeGreaterThan(0);
    expect(PLANET_SHADER_THEME_PARAMS.super_earth.hasDriftingClouds).toBe(true);
    expect(PLANET_SHADER_THEME_PARAMS.super_earth.cloudDriftSpeed).toBeGreaterThan(0);

    expect(PLANET_SHADER_THEME_PARAMS.volcanic_lava.hasDriftingClouds).toBe(false);
    expect(PLANET_SHADER_THEME_PARAMS.volcanic_lava.lavaEmissionStrength).toBeGreaterThan(1.5);

    expect(TERRAN_SURFACE_FRAGMENT_SHADER).toContain('sampleCloudDensity');
    expect(DRIFTING_CLOUDS_FRAGMENT_SHADER).toContain('uCloudDriftSpeed');
    expect(VOLCANIC_ROCK_SURFACE_FRAGMENT_SHADER).toContain('uLavaEmissionStrength');
  });

  it('calculates evenly spaced orbital ring slot coordinates for 6, 8, 10, and 12 slot planets', () => {
    for (const slotCount of [6, 8, 10, 12]) {
      const slots = computeOrbitalSlotPositions(50, slotCount);
      expect(slots).toHaveLength(slotCount);
      for (const slot of slots) {
        const dist = Math.hypot(slot.x, slot.z);
        expect(dist).toBeCloseTo(50, 5);
      }
    }
  });

  it('builds multi-layered Three.js planet groups and updates shader uniforms', () => {
    const galaxy = createFiveSystemGalaxy();
    const starterSystem = galaxy.systems[0];
    const homeworld = starterSystem?.planets[0];
    const centralHub = galaxy.systems.find((s) => s.isCentralHub);
    const superEarth = centralHub?.planets[0];
    expect(homeworld).toBeDefined();
    expect(superEarth).toBeDefined();

    if (homeworld && superEarth) {
      const homeHandle = createLivingPlanetGroup(
        homeworld,
        new THREE.Vector3(1, 0.5, -1),
      );
      expect(homeHandle.rootGroup.children.length).toBeGreaterThanOrEqual(2);
      expect(homeHandle.isHabited()).toBe(true);
      homeHandle.update(2.5, 0.016);
      homeHandle.dispose();

      // Unclaimed Central Nexus Super-Earth has no orbital platforms yet and should be uninhabited
      const superEarthHandle = createLivingPlanetGroup(
        superEarth,
        new THREE.Vector3(1, 0.5, -1),
      );
      expect(superEarthHandle.isHabited()).toBe(false);
      superEarthHandle.setHabited(true);
      expect(superEarthHandle.isHabited()).toBe(true);
      superEarthHandle.dispose();
    }
  });

  it('creates displaced craggy asteroid geometry and pale ice-blue crystal cluster geometry', () => {
    const rockGeom = createCraggyAsteroidGeometry(2.5);
    const crystalGeom = createCrystalClusterGeometry(2.0);

    expect(rockGeom.attributes.position?.count).toBeGreaterThan(100);
    expect(crystalGeom.attributes.position?.count).toBeGreaterThan(20);
    expect(ASTEROID_ROCK_FRAGMENT_SHADER).toContain('bumpGrad');
    expect(CRYSTAL_SHARD_FRAGMENT_SHADER).toContain('paleIceBlue');

    rockGeom.dispose();
    crystalGeom.dispose();
  });

  it('keeps wormholes dormant until a ship enters proximity or manual opening is triggered', () => {
    const galaxy = createFiveSystemGalaxy();
    const starterSystem = galaxy.systems[0];
    const wh = galaxy.wormholes[0];
    expect(starterSystem).toBeDefined();
    expect(wh).toBeDefined();

    if (starterSystem && wh) {
      const env = createStarSystemEnvironment(starterSystem, [
        {
          wormhole: wh,
          localPosition: wh.fromPosition,
          destinationSystemId: wh.toSystemId,
        },
      ]);

      const whHandle = env.wormholes[0];
      expect(whHandle).toBeDefined();
      if (whHandle) {
        // Initially dormant
        expect(whHandle.isOpen()).toBe(false);
        expect(whHandle.getOpenProgress()).toBe(0);

        // Ship far away -> remains dormant
        whHandle.updateShipProximity([{ x: 0, z: 0 }]);
        expect(whHandle.isOpen()).toBe(false);

        // Ship within WORMHOLE_PROXIMITY_RADIUS -> triggers DS9 opening sequence
        whHandle.updateShipProximity([
          {
            x: wh.fromPosition.x - WORMHOLE_PROXIMITY_RADIUS * 0.5,
            z: wh.fromPosition.z,
          },
        ]);
        expect(whHandle.isOpen()).toBe(true);
        env.update(1.0, 0.5);
        expect(whHandle.getOpenProgress()).toBeGreaterThan(0);

        // Ship leaves proximity -> closes back to dormant marker
        whHandle.updateShipProximity([]);
        expect(whHandle.isOpen()).toBe(false);
      }
      env.dispose();
    }
  });

  it('constructs the Prospector Mining Frigate 3D model and dual-layer mining laser', () => {
    const renderer = new HarvesterFleetRenderer();
    renderer.syncHarvesters(
      [
        {
          id: 'harvester_1',
          ownerId: 'player_1',
          homeStructureId: 'struct_1',
          homeSystemId: 'system_starter_1',
          homePlanetId: 'system_starter_1_homeworld',
          currentSystemId: 'system_starter_1',
          position: { x: 400, z: 0 },
          headingRadians: 0,
          currentSpeed: 41.325,
          state: 'mining',
          targetBeltId: 'belt_1',
          targetRockWorldPos: { x: 411.5, y: 1.2, z: 0 },
          miningStandoffAngle: 0,
          cargoType: 'ore',
          cargoAmount: 20,
          depositAccumulator: 0,
          cargoCapacity: 40,
          mineCrossSystemHub: false,
        },
      ],
      'harvester_1',
    );

    expect(renderer.rootGroup.children).toHaveLength(1);
    renderer.dispose();
  });

  it('constructs the triple-tower Prometheus Command & Control station with planetary atmosphere clearance', () => {
    const library = new StationModelLibrary();
    const cncGroup = library.buildStationMesh('command_and_control', true, 42.56);
    expect(cncGroup.children.length).toBeGreaterThanOrEqual(5); // 1 center + 2 wing towers + 2 skybridges

    const bbox = new THREE.Box3().setFromObject(cncGroup);
    // Inward (-X) radial reach must stay strictly inside the 11.06u Homeworld atmosphere clearance
    const inwardRadialReach = Math.abs(bbox.min.x);
    expect(inwardRadialReach).toBeLessThan(10.5);
    // Tangent Z span fills the 2-slot orbital section (~34u across)
    expect(bbox.max.z - bbox.min.z).toBeGreaterThan(25);

    library.dispose();
  });

  it('curves the Hephaes Orbital Refinery segments along the host planet orbital ring', () => {
    const library = new StationModelLibrary();
    const ringRadius = 42.56;
    const refineryGroup = library.buildStationMesh('refinery', true, ringRadius);

    expect(refineryGroup.children).toHaveLength(7);
    // Outer arc segments should curve inward (-X) relative to the center segment (x = 0)
    const firstSeg = refineryGroup.children[0];
    const centerSeg = refineryGroup.children[3];
    const lastSeg = refineryGroup.children[6];
    expect(centerSeg?.position.x).toBeCloseTo(0, 4);
    expect(firstSeg?.position.x).toBeLessThan(0);
    expect(lastSeg?.position.x).toBeLessThan(0);

    library.dispose();
  });

  it('hides orbital ring slot dot and halo meshes when slots are occupied by a platform', () => {
    const galaxy = createFiveSystemGalaxy();
    const homeworld = galaxy.systems[0]?.planets[0];
    expect(homeworld).toBeDefined();

    if (homeworld) {
      const handle = createLivingPlanetGroup(homeworld, new THREE.Vector3(1, 0.5, -1));

      // Homeworld starts with a 2-slot Command & Control occupying slots 0 and 1
      for (const occupiedIdx of [0, 1]) {
        const node = handle.rootGroup.getObjectByName(`orbital_slot_node_${occupiedIdx}`);
        const halo = handle.rootGroup.getObjectByName(`orbital_slot_halo_${occupiedIdx}`);
        expect(node?.visible).toBe(false);
        expect(halo?.visible).toBe(false);
      }

      // Free slots 2..9 remain visible
      for (let freeIdx = 2; freeIdx < homeworld.orbitalSlots; freeIdx += 1) {
        const node = handle.rootGroup.getObjectByName(`orbital_slot_node_${freeIdx}`);
        const halo = handle.rootGroup.getObjectByName(`orbital_slot_halo_${freeIdx}`);
        expect(node?.visible).toBe(true);
        expect(halo?.visible).toBe(true);
      }

      handle.dispose();
    }
  });

  it('constructs the curved rectangular Vanguard Planetary Outpost to fill 1 orbital slot', () => {
    const library = new StationModelLibrary();
    const ringRadius = 27.36; // Medium 8-slot planet orbital ring radius
    const outpostGroup = library.buildStationMesh('planetary_outpost', true, ringRadius);

    expect(outpostGroup.children).toHaveLength(7);
    const firstSeg = outpostGroup.children[0];
    const centerSeg = outpostGroup.children[3];
    const lastSeg = outpostGroup.children[6];
    expect(centerSeg?.position.x).toBeCloseTo(0, 4);
    expect(firstSeg?.position.x).toBeLessThan(0);
    expect(lastSeg?.position.x).toBeLessThan(0);

    const bbox = new THREE.Box3().setFromObject(outpostGroup);
    const arcSpanZ = bbox.max.z - bbox.min.z;
    const radialWidthX = bbox.max.x - bbox.min.x;
    // Rectangular aspect ratio: tangential arc span (~21u) is significantly longer than radial width (~8.5u)
    expect(arcSpanZ).toBeGreaterThan(19);
    expect(arcSpanZ).toBeGreaterThan(radialWidthX * 1.8);

    library.dispose();
  });

  it('constructs the 2-slot Titan Orbital Dockyard with outward parallel slipways, planet clearance, and live crane/hull animation', () => {
    const library = new StationModelLibrary();
    const ringRadius = 42.56;
    const dockyardGroup = library.buildStationMesh('orbital_dockyard', true, ringRadius);

    // 2 top-level groups: curved rear fabrication core + outward parallel slipways
    expect(dockyardGroup.children).toHaveLength(2);
    expect(typeof dockyardGroup.userData.animateStation).toBe('function');

    const bbox = new THREE.Box3().setFromObject(dockyardGroup);
    // Inward (-X) radial reach stays well within the 11.06u Homeworld atmosphere clearance
    expect(Math.abs(bbox.min.x)).toBeLessThan(8.5);
    // Outward (+X) parallel slipways extend into deep space (> 15u) and span the 2-slot width (> 28u)
    expect(bbox.max.x).toBeGreaterThan(15);
    expect(bbox.max.z - bbox.min.z).toBeGreaterThan(28);

    // Verify live shipyard animation hook executes cleanly for both idle and active build queue ratios
    library.updateStationAnimation(dockyardGroup, 3.5, null);
    library.updateStationAnimation(dockyardGroup, 4.2, 0.65);

    library.dispose();
  });

  it('constructs the curved 1-slot Minerva C&C Tech & Specialization Module with holographic R&D projections', () => {
    const library = new StationModelLibrary();
    const ringRadius = 42.56;
    const techGroup = library.buildStationMesh('tech_module', true, ringRadius);

    expect(techGroup.children).toHaveLength(7);
    expect(typeof techGroup.userData.animateStation).toBe('function');

    const firstSeg = techGroup.children[0];
    const centerSeg = techGroup.children[3];
    const lastSeg = techGroup.children[6];
    expect(centerSeg?.position.x).toBeCloseTo(0, 4);
    expect(firstSeg?.position.x).toBeLessThan(0);
    expect(lastSeg?.position.x).toBeLessThan(0);

    const bbox = new THREE.Box3().setFromObject(techGroup);
    const arcSpanZ = bbox.max.z - bbox.min.z;
    const radialWidthX = bbox.max.x - bbox.min.x;
    expect(arcSpanZ).toBeGreaterThan(19);
    expect(arcSpanZ).toBeGreaterThan(radialWidthX * 1.8);

    library.updateStationAnimation(techGroup, 2.75, null);
    library.dispose();
  });

  it('constructs the 2-slot Aegis Heavy Orbital Defense Platform and its 3 remote vertical sentry turrets around the planet', () => {
    const library = new StationModelLibrary();
    const ringRadius = 42.56;
    const defenseGroup = library.buildStationMesh(
      'heavy_defense_platform',
      true,
      ringRadius,
    );

    const mainPlatform = defenseGroup.getObjectByName('aegis_main_platform');
    const remoteTurrets = defenseGroup.getObjectByName('aegis_remote_sentry_turrets');
    expect(mainPlatform).toBeDefined();
    expect(remoteTurrets).toBeDefined();
    expect(remoteTurrets?.children).toHaveLength(3);

    if (mainPlatform && remoteTurrets) {
      const mainBbox = new THREE.Box3().setFromObject(mainPlatform);
      // Main 2-slot double-bastion spans > 28u tangentially and stays clear of the planet's 11.06u atmosphere
      expect(mainBbox.max.z - mainBbox.min.z).toBeGreaterThan(28);
      expect(Math.abs(mainBbox.min.x)).toBeLessThan(10.5);

      // Middle remote sentry turret (idx 1, theta = PI) is stationed on the far opposite side of the planet
      const farSideSentry = remoteTurrets.children[1];
      expect(farSideSentry?.position.x).toBeLessThan(-ringRadius * 1.8);
    }

    library.updateStationAnimation(defenseGroup, 5.0, null);
    library.dispose();
  });

  it('constructs the radial free-floating Atlas Deep-Space Logistics Hub with 4 diagonal fighter bays and pagoda command spire', () => {
    const library = new StationModelLibrary();
    const hubGroup = library.buildStationMesh('logistics_hub', true);

    expect(hubGroup.children.length).toBeGreaterThanOrEqual(15);
    expect(typeof hubGroup.userData.animateStation).toBe('function');

    const bbox = new THREE.Box3().setFromObject(hubGroup);
    const spanX = bbox.max.x - bbox.min.x;
    const spanZ = bbox.max.z - bbox.min.z;
    const heightY = bbox.max.y - bbox.min.y;

    // Symmetrical 360-degree radial saucer (~20.8u diameter in X and Z) and tall pagoda command spire (> 11u)
    expect(spanX).toBeGreaterThan(19);
    expect(Math.abs(spanX - spanZ)).toBeLessThan(0.5);
    expect(heightY).toBeGreaterThan(11);

    library.updateStationAnimation(hubGroup, 3.25, null);
    library.dispose();
  });

  it('constructs vertical sentry Hull Breaker and Point Defence deep-space towers with distinct weapon crowns', () => {
    const library = new StationModelLibrary();
    const hullBreaker = library.buildStationMesh('hull_breaker_tower', true);
    const pointDefence = library.buildStationMesh('point_defence_tower', true);

    expect(hullBreaker.name).toBe('deep_space_hull_breaker_tower');
    expect(pointDefence.name).toBe('deep_space_point_defence_tower');
    expect(typeof hullBreaker.userData.animateStation).toBe('function');
    expect(typeof pointDefence.userData.animateStation).toBe('function');

    const hbBox = new THREE.Box3().setFromObject(hullBreaker);
    const pdBox = new THREE.Box3().setFromObject(pointDefence);
    // Vertical sentry column is taller than it is wide, and Hull Breaker is larger than Point Defence
    expect(hbBox.max.y - hbBox.min.y).toBeGreaterThan(8);
    expect(pdBox.max.y - pdBox.min.y).toBeGreaterThan(7);
    expect(hbBox.max.x - hbBox.min.x).toBeGreaterThan(pdBox.max.x - pdBox.min.x);

    library.updateStationAnimation(hullBreaker, 2.0, null);
    library.updateStationAnimation(pointDefence, 2.0, null);
    library.dispose();
  });
});
