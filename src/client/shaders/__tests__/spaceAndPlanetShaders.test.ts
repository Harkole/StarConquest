import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { createFiveSystemGalaxy } from '../../../shared/sim/galaxy.ts';
import {
  computeOrbitalSlotPositions,
  createLivingPlanetGroup,
} from '../../renderer/planetFactory.ts';
import { HarvesterFleetRenderer } from '../../renderer/harvesterFleetRenderer.ts';
import { createProceduralHullTextures } from '../../renderer/proceduralHullTextures.ts';
import { ShipModelLibrary } from '../../renderer/shipModels.ts';
import { CombatFleetRenderer } from '../../renderer/combatFleetRenderer.ts';
import { CombatVfxRenderer } from '../../renderer/combatVfxRenderer.ts';
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
    const usedPalettes = new Set<string>();
    for (const system of galaxy.systems) {
      const palette = NEBULA_PALETTES[system.nebulaPalette];
      expect(palette).toBeDefined();
      expect(palette.primaryNebula).toHaveLength(3);
      expect(palette.secondaryNebula).toHaveLength(3);
      usedPalettes.add(system.nebulaPalette);
    }
    expect(usedPalettes.size).toBe(5);
    // Starter System 1 is purple (high R & B, low G) while Starter System 4 is vivid emerald (high G, low R & B)
    const s1 = NEBULA_PALETTES[galaxy.systems[0]!.nebulaPalette];
    const s4 = NEBULA_PALETTES[galaxy.systems[3]!.nebulaPalette];
    expect(s1.primaryNebula[0]).toBeGreaterThan(0.45);
    expect(s1.primaryNebula[2]).toBeGreaterThan(0.7);
    expect(s1.primaryNebula[1]).toBeLessThan(0.2);
    expect(s4.primaryNebula[1]).toBeGreaterThan(0.55);
    expect(s4.primaryNebula[0]).toBeLessThan(0.15);
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
          hull: 300,
          maxHull: 300,
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
      expect(farSideSentry?.position.x).toBeLessThan(-ringRadius * 2.1);

      // Compute the maximum outward radial reach from planet center (-ringRadius, 0, 0) across all orbital buildings
      const orbitalIds = [
        'command_and_control',
        'orbital_dockyard',
        'heavy_defense_platform',
        'refinery',
        'planetary_outpost',
        'tech_module',
      ] as const;
      let maxBuildingRadialReach = 0;
      for (const id of orbitalIds) {
        const mesh = library.buildStationMesh(id, true, ringRadius);
        const target =
          id === 'heavy_defense_platform'
            ? (mesh.getObjectByName('aegis_main_platform') ?? mesh)
            : mesh;
        const b = new THREE.Box3().setFromObject(target);
        for (const cx of [b.min.x, b.max.x]) {
          for (const cz of [b.min.z, b.max.z]) {
            const radialDist = Math.hypot(cx + ringRadius, cz);
            if (radialDist > maxBuildingRadialReach) {
              maxBuildingRadialReach = radialDist;
            }
          }
        }
      }

      // Every remote sentry turret must sit strictly outside the largest orbital building + safety clearance
      for (const sentry of remoteTurrets.children) {
        const sb = new THREE.Box3().setFromObject(sentry);
        let closestSentryRadialDist = Infinity;
        for (const cx of [sb.min.x, sb.max.x]) {
          for (const cz of [sb.min.z, sb.max.z]) {
            const radialDist = Math.hypot(cx + ringRadius, cz);
            if (radialDist < closestSentryRadialDist) {
              closestSentryRadialDist = radialDist;
            }
          }
        }
        expect(closestSentryRadialDist).toBeGreaterThan(maxBuildingRadialReach + 3);
      }
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

  it('constructs vertical sentry Hull Breaker and Point Defence deep-space towers with 360-degree column pivots and no idle gun animation', () => {
    const library = new StationModelLibrary();
    const hullBreaker = library.buildStationMesh('hull_breaker_tower', true);
    const pointDefence = library.buildStationMesh('point_defence_tower', true);

    expect(hullBreaker.name).toBe('deep_space_hull_breaker_tower');
    expect(pointDefence.name).toBe('deep_space_point_defence_tower');
    expect(hullBreaker.userData.animateStation).toBeUndefined();
    expect(pointDefence.userData.animateStation).toBeUndefined();
    expect(hullBreaker.userData.turretPivots).toBeDefined();
    expect(pointDefence.userData.turretPivots).toBeDefined();

    const hbPivots = hullBreaker.userData.turretPivots as {
      crownTurretPivot: THREE.Group;
      pdTurretPivots: THREE.Group[];
    };
    expect(hbPivots.pdTurretPivots).toHaveLength(3);
    // Concentric column pivots at x=0, z=0 allow unobstructed 360-degree gun rotation
    for (const pivot of hbPivots.pdTurretPivots) {
      expect(pivot.position.x).toBe(0);
      expect(pivot.position.z).toBe(0);
    }

    const hbBox = new THREE.Box3().setFromObject(hullBreaker);
    const pdBox = new THREE.Box3().setFromObject(pointDefence);
    expect(hbBox.max.y - hbBox.min.y).toBeGreaterThan(8);
    expect(pdBox.max.y - pdBox.min.y).toBeGreaterThan(7);
    expect(hbBox.max.x - hbBox.min.x).toBeGreaterThan(pdBox.max.x - pdBox.min.x);

    // Guns stay stationary while idle (no target tracked)
    library.updateStationAnimation(hullBreaker, 2.0, null);
    library.updateStationAnimation(pointDefence, 2.0, null);
    expect(hbPivots.crownTurretPivot.rotation.y).toBe(0);

    library.dispose();
  });

  it('applies procedural PBR hull textures and machined steel grey turret barrels with zero violet guns across all armed platforms', () => {
    const bundle = createProceduralHullTextures(64);
    for (const set of [
      bundle.hullPlating,
      bundle.weatheredOchre,
      bundle.darkRibbing,
      bundle.machinedSteel,
    ]) {
      expect(set.map).toBeInstanceOf(THREE.DataTexture);
      expect(set.bumpMap).toBeInstanceOf(THREE.DataTexture);
      expect(set.roughnessMap).toBeInstanceOf(THREE.DataTexture);
      const pixels = set.map.image.data as Uint8Array;
      let minVal = 255;
      let maxVal = 0;
      for (let i = 0; i < pixels.length; i += 4) {
        const v = pixels[i] ?? 0;
        if (v < minVal) minVal = v;
        if (v > maxVal) maxVal = v;
      }
      // Verify real panel/seam tonal breakup rather than flat mono-colored pixels
      expect(maxVal - minVal).toBeGreaterThan(60);
    }
    bundle.dispose();

    const library = new StationModelLibrary();
    const armedPlatforms = [
      'command_and_control',
      'planetary_outpost',
      'heavy_defense_platform',
      'hull_breaker_tower',
      'point_defence_tower',
    ] as const;

    for (const id of armedPlatforms) {
      const group = library.buildStationMesh(id, true, 42.56);
      let greyBarrelCount = 0;
      let texturedHullCount = 0;
      let violetMeshCount = 0;

      group.traverse((obj) => {
        if (!(obj instanceof THREE.Mesh)) return;
        const mat = obj.material;
        if (!(mat instanceof THREE.MeshStandardMaterial)) return;
        if (mat.name === 'turret_barrel_steel') {
          greyBarrelCount += 1;
          expect(mat.map).toBeInstanceOf(THREE.DataTexture);
          expect(mat.bumpMap).toBeInstanceOf(THREE.DataTexture);
          expect(mat.roughnessMap).toBeInstanceOf(THREE.DataTexture);
        }
        if (mat.name.startsWith('hull_') && mat.map && mat.bumpMap && mat.roughnessMap) {
          texturedHullCount += 1;
        }
        if (mat.color.getHex() === 0xc084fc) {
          violetMeshCount += 1;
        }
      });

      expect(greyBarrelCount).toBeGreaterThan(0);
      expect(texturedHullCount).toBeGreaterThan(0);
      expect(violetMeshCount).toBe(0);
    }

    library.dispose();
  });

  it('omits atmospheric halo and rim haze on airless barren_rock planets while keeping them on terran and volcanic worlds', () => {
    expect(PLANET_SHADER_THEME_PARAMS.barren_rock.hasAtmosphere).toBe(false);
    expect(PLANET_SHADER_THEME_PARAMS.barren_rock.atmosphereIntensity).toBe(0);
    expect(PLANET_SHADER_THEME_PARAMS.barren_rock.atmosphereColor).toEqual([0, 0, 0]);
    expect(PLANET_SHADER_THEME_PARAMS.terran.hasAtmosphere).toBe(true);
    expect(PLANET_SHADER_THEME_PARAMS.super_earth.hasAtmosphere).toBe(true);
    expect(PLANET_SHADER_THEME_PARAMS.volcanic_lava.hasAtmosphere).toBe(true);

    const sunDir = new THREE.Vector3(1, 0.3, 0.5).normalize();
    const barrenHandle = createLivingPlanetGroup(
      {
        id: 'test_barren',
        systemId: 'system_starter_1',
        name: 'Test Barren',
        planetClass: 'small',
        visualTheme: 'barren_rock',
        orbitalSlots: 6,
        position: { x: 0, z: 0 },
        ownerId: null,
      },
      sunDir,
    );
    // bodyGroup is the first child of rootGroup: airless barren_rock should only have the 1 surface sphere mesh
    const barrenBody = barrenHandle.rootGroup.children[0] as THREE.Group;
    expect(barrenBody.children).toHaveLength(1);
    barrenHandle.dispose();

    const volcanicHandle = createLivingPlanetGroup(
      {
        id: 'test_volcanic',
        systemId: 'system_starter_1',
        name: 'Test Volcanic',
        planetClass: 'medium',
        visualTheme: 'volcanic_lava',
        orbitalSlots: 8,
        position: { x: 0, z: 0 },
        ownerId: null,
      },
      sunDir,
    );
    const volcanicBody = volcanicHandle.rootGroup.children[0] as THREE.Group;
    expect(volcanicBody.children).toHaveLength(2);
    volcanicHandle.dispose();
  });

  it('constructs the tiny Stinger Light Fighter with machined steel chin barrels, procedural PBR hull, and stages 24 on Atlas Logistics Hub', () => {
    const ships = new ShipModelLibrary();
    const airborneFighter = ships.buildShipMesh('fighter');
    const stagedFighter = ships.buildStingerFighterMesh({ staged: true });

    expect(airborneFighter.name).toBe('ship_fighter_stinger');
    expect(airborneFighter.getObjectByName('stinger_chin_turret')).toBeDefined();

    const bbox = new THREE.Box3().setFromObject(airborneFighter);
    const lengthZ = bbox.max.z - bbox.min.z;
    const widthX = bbox.max.x - bbox.min.x;
    const heightY = bbox.max.y - bbox.min.y;

    // Smallest ship in the game (~1.2u long x ~1.0u wide x ~0.5u tall)
    expect(lengthZ).toBeGreaterThan(1.0);
    expect(lengthZ).toBeLessThan(1.6);
    expect(widthX).toBeGreaterThan(0.85);
    expect(widthX).toBeLessThan(1.3);
    expect(heightY).toBeGreaterThan(0.35);
    expect(heightY).toBeLessThan(0.75);

    let greyBarrelCount = 0;
    let texturedHullCount = 0;
    let violetCount = 0;
    airborneFighter.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      const mat = obj.material;
      if (!(mat instanceof THREE.MeshStandardMaterial)) return;
      if (mat.name === 'turret_barrel_steel') greyBarrelCount += 1;
      if (mat.name.startsWith('hull_') && mat.map && mat.bumpMap && mat.roughnessMap) {
        texturedHullCount += 1;
      }
      if (mat.color.getHex() === 0xc084fc) violetCount += 1;
    });
    expect(greyBarrelCount).toBe(2);
    expect(texturedHullCount).toBeGreaterThan(10);
    expect(violetCount).toBe(0);

    // Staged fighter deploys landing skids (lower min.y) and turns off engine exhaust cores
    const stagedBox = new THREE.Box3().setFromObject(stagedFighter);
    expect(stagedBox.min.y).toBeLessThan(bbox.min.y);
    ships.dispose();

    // Verify Atlas Deep-Space Logistics Hub stages 24 approved Stinger Light Fighters across its 4 bays
    const stations = new StationModelLibrary();
    const hub = stations.buildStationMesh('logistics_hub', true);
    let stagedStingerCount = 0;
    hub.traverse((obj) => {
      if (obj.name === 'ship_fighter_stinger') {
        stagedStingerCount += 1;
      }
    });
    expect(stagedStingerCount).toBe(24);
    stations.dispose();
  });

  it('constructs the Havoc Destroyer at ~4x Stinger scale with machined steel turrets, PBR hull, and docks 4 on Titan Orbital Dockyard', () => {
    const ships = new ShipModelLibrary();
    const fighter = ships.buildShipMesh('fighter');
    const destroyer = ships.buildShipMesh('destroyer');

    expect(destroyer.name).toBe('ship_destroyer_havoc');
    expect(destroyer.getObjectByName('havoc_dorsal_turret')).toBeDefined();
    expect(destroyer.userData.turretPivots).toBeDefined();

    const fBox = new THREE.Box3().setFromObject(fighter);
    const dBox = new THREE.Box3().setFromObject(destroyer);
    const fighterLen = fBox.max.z - fBox.min.z;
    const destroyerLen = dBox.max.z - dBox.min.z;

    // Hull-based gamified scale: Destroyer (~4.8u) is roughly 4x Stinger Light Fighter (~1.2u)
    expect(destroyerLen).toBeGreaterThan(4.2);
    expect(destroyerLen).toBeLessThan(5.4);
    expect(destroyerLen / fighterLen).toBeGreaterThan(3.4);
    expect(destroyerLen / fighterLen).toBeLessThan(4.6);

    let greyBarrelCount = 0;
    let texturedHullCount = 0;
    let violetCount = 0;
    destroyer.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      const mat = obj.material;
      if (!(mat instanceof THREE.MeshStandardMaterial)) return;
      if (mat.name === 'turret_barrel_steel') greyBarrelCount += 1;
      if (mat.name.startsWith('hull_') && mat.map && mat.bumpMap && mat.roughnessMap) {
        texturedHullCount += 1;
      }
      if (mat.color.getHex() === 0xc084fc) violetCount += 1;
    });
    // 2 dorsal medium cannon barrels + 12 light flak PD barrels (6 twin turrets) = 14
    expect(greyBarrelCount).toBe(14);
    expect(texturedHullCount).toBeGreaterThan(15);
    expect(violetCount).toBe(0);
    ships.dispose();

    // Verify Titan Orbital Dockyard docks 4 approved Havoc Destroyers in its outer escort alcoves
    const stations = new StationModelLibrary();
    const dockyard = stations.buildStationMesh('orbital_dockyard', true, 42.56);
    let dockedHavocCount = 0;
    dockyard.traverse((obj) => {
      if (obj.name === 'ship_destroyer_havoc') {
        dockedHavocCount += 1;
      }
    });
    expect(dockedHavocCount).toBe(4);
    stations.dispose();
  });

  it('constructs the Cruiser at ~7.5u scale with twin heavy dorsal turrets, 9 PD arrays, and stages 1 in Titan Dockyard Slot 2', () => {
    const ships = new ShipModelLibrary();
    const destroyer = ships.buildShipMesh('destroyer');
    const cruiser = ships.buildShipMesh('cruiser');

    expect(cruiser.name).toBe('ship_cruiser');
    expect(cruiser.getObjectByName('cruiser_dorsal_turret_fore')).toBeDefined();
    expect(cruiser.getObjectByName('cruiser_dorsal_turret_aft')).toBeDefined();
    expect(cruiser.userData.turretPivots).toBeDefined();

    const dBox = new THREE.Box3().setFromObject(destroyer);
    const cBox = new THREE.Box3().setFromObject(cruiser);
    const destroyerLen = dBox.max.z - dBox.min.z;
    const cruiserLen = cBox.max.z - cBox.min.z;

    // Cruiser (~7.5u) is ~1.5x larger than Havoc Destroyer (~4.8u)
    expect(cruiserLen).toBeGreaterThan(6.8);
    expect(cruiserLen).toBeLessThan(8.2);
    expect(cruiserLen).toBeGreaterThan(destroyerLen * 1.35);

    let greyBarrelCount = 0;
    let texturedHullCount = 0;
    let violetCount = 0;
    cruiser.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      const mat = obj.material;
      if (!(mat instanceof THREE.MeshStandardMaterial)) return;
      if (mat.name === 'turret_barrel_steel') greyBarrelCount += 1;
      if (mat.name.startsWith('hull_') && mat.map && mat.bumpMap && mat.roughnessMap) {
        texturedHullCount += 1;
      }
      if (mat.color.getHex() === 0xc084fc) violetCount += 1;
    });
    // 4 heavy dorsal barrels + 18 rapid PD barrels (9 twin turrets) = 22
    expect(greyBarrelCount).toBe(22);
    expect(texturedHullCount).toBeGreaterThan(15);
    expect(violetCount).toBe(0);
    ships.dispose();

    // Verify Titan Orbital Dockyard bays start empty when idle and dynamically stage a Cruiser when queued
    const stations = new StationModelLibrary();
    const dockyard = stations.buildStationMesh('orbital_dockyard', true, 42.56);
    const bay1Mount = dockyard.getObjectByName('dockyard_bay_1_mount');
    const bay2Mount = dockyard.getObjectByName('dockyard_bay_2_mount');
    expect(bay1Mount).toBeDefined();
    expect(bay2Mount).toBeDefined();
    expect(bay1Mount?.children).toHaveLength(0);
    expect(bay2Mount?.children).toHaveLength(0);

    stations.updateStationAnimation(dockyard, 1.5, 0.6, [
      null,
      { shipClassId: 'cruiser', progressRatio: 0.6 },
    ]);
    let stagedCruiserCount = 0;
    bay2Mount?.traverse((obj) => {
      if (obj.name === 'ship_cruiser') {
        stagedCruiserCount += 1;
      }
    });
    expect(stagedCruiserCount).toBe(2);

    // Clearing the queue returns the slipway to empty
    stations.updateStationAnimation(dockyard, 2.5, null, [null, null]);
    expect(bay2Mount?.children).toHaveLength(0);
    stations.dispose();
  });

  it('constructs the Imperator Dreadnought at ~14.5u scale with spinal siege battery, 4-tier citadel, and stages it in Titan Dockyard Slot 1', () => {
    const ships = new ShipModelLibrary();
    const cruiser = ships.buildShipMesh('cruiser');
    const dreadnought = ships.buildShipMesh('dreadnought');

    expect(dreadnought.name).toBe('ship_dreadnought_imperator');
    expect(dreadnought.getObjectByName('imperator_spinal_siege_battery')).toBeDefined();
    expect(dreadnought.getObjectByName('imperator_command_citadel')).toBeDefined();
    expect(dreadnought.userData.turretPivots).toBeDefined();

    // Verify all 3 dorsal heavy turrets are non-overlapping (bow, mid-hull, and aft behind the bridge)
    const t1 = dreadnought.getObjectByName('imperator_dorsal_turret_1')!;
    const t2 = dreadnought.getObjectByName('imperator_dorsal_turret_2')!;
    const t3 = dreadnought.getObjectByName('imperator_dorsal_turret_3')!;
    const bridge = dreadnought.getObjectByName('imperator_command_citadel')!;
    expect(t1).toBeDefined();
    expect(t2).toBeDefined();
    expect(t3).toBeDefined();
    expect(t1.position.z).toBeGreaterThan(t2.position.z + 2.5);
    expect(t3.position.z).toBeLessThan(bridge.position.z - 2.0);
    const t1Box = new THREE.Box3().setFromObject(t1);
    const t2Box = new THREE.Box3().setFromObject(t2);
    const t3Box = new THREE.Box3().setFromObject(t3);
    expect(t1Box.intersectsBox(t2Box)).toBe(false);
    expect(t2Box.intersectsBox(t3Box)).toBe(false);
    expect(t1Box.intersectsBox(t3Box)).toBe(false);

    const cBox = new THREE.Box3().setFromObject(cruiser);
    const dBox = new THREE.Box3().setFromObject(dreadnought);
    const cruiserLen = cBox.max.z - cBox.min.z;
    const dreadLen = dBox.max.z - dBox.min.z;

    // Colossal capital ship (~14.5u long, ~1.9x Cruiser)
    expect(dreadLen).toBeGreaterThan(13.2);
    expect(dreadLen).toBeLessThan(15.8);
    expect(dreadLen).toBeGreaterThan(cruiserLen * 1.75);

    let greyBarrelCount = 0;
    let texturedHullCount = 0;
    let violetCount = 0;
    dreadnought.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      const mat = obj.material;
      if (!(mat instanceof THREE.MeshStandardMaterial)) return;
      if (mat.name === 'turret_barrel_steel') greyBarrelCount += 1;
      if (mat.name.startsWith('hull_') && mat.map && mat.bumpMap && mat.roughnessMap) {
        texturedHullCount += 1;
      }
      if (mat.color.getHex() === 0xc084fc) violetCount += 1;
    });
    // 6 dorsal heavy barrels + 16 broadside/ventral barrels = 22
    expect(greyBarrelCount).toBe(22);
    expect(texturedHullCount).toBeGreaterThan(20);
    expect(violetCount).toBe(0);
    ships.dispose();

    // Verify Titan Orbital Dockyard dynamically fabricates an Imperator Dreadnought in Bay 1
    // without protruding through the rear bulkhead at any construction progress ratio
    const stations = new StationModelLibrary();
    const dockyard = stations.buildStationMesh('orbital_dockyard', true, 42.56);
    const bay1Mount = dockyard.getObjectByName('dockyard_bay_1_mount')!;
    const bay2Mount = dockyard.getObjectByName('dockyard_bay_2_mount')!;
    expect(bay1Mount.children).toHaveLength(0);
    expect(bay2Mount.children).toHaveLength(0);

    for (const progress of [0.1, 0.5, 1.0]) {
      stations.updateStationAnimation(dockyard, 2.0 + progress, progress, [
        { shipClassId: 'dreadnought', progressRatio: progress },
        { shipClassId: 'carrier', progressRatio: progress },
      ]);
      let bay1ImperatorCount = 0;
      bay1Mount.traverse((obj) => {
        if (obj.name === 'ship_dreadnought_imperator') {
          bay1ImperatorCount += 1;
        }
      });
      expect(bay1ImperatorCount).toBe(2);

      // Rear force-field bulkhead sits at x = 1.55 * 1.25 = 1.9375u; stern must stay strictly forward of it
      const bay1Box = new THREE.Box3().setFromObject(bay1Mount);
      expect(bay1Box.min.x).toBeGreaterThan(2.5);
      // Launch mouth sits at x = 16.6 * 1.25 = 20.75u; bow must stay inside the extended slipway
      expect(bay1Box.max.x).toBeLessThan(20.5);
    }

    // Idle state clears both slipways
    stations.updateStationAnimation(dockyard, 4.0, null, [null, null]);
    expect(bay1Mount.children).toHaveLength(0);
    expect(bay2Mount.children).toHaveLength(0);
    stations.dispose();
  });

  it('constructs the Vanguard Fleet Carrier at ~10.5u scale with flight deck, 4 staged Stingers, radar sphere, and projects it on Minerva', () => {
    const ships = new ShipModelLibrary();
    const cruiser = ships.buildShipMesh('cruiser');
    const carrier = ships.buildShipMesh('carrier');
    const dreadnought = ships.buildShipMesh('dreadnought');

    expect(carrier.name).toBe('ship_carrier_vanguard');
    expect(carrier.getObjectByName('carrier_flight_deck')).toBeDefined();
    expect(carrier.getObjectByName('carrier_command_island')).toBeDefined();
    expect(carrier.userData.turretPivots).toBeDefined();

    const cruiserLen =
      new THREE.Box3().setFromObject(cruiser).max.z -
      new THREE.Box3().setFromObject(cruiser).min.z;
    const carrierBox = new THREE.Box3().setFromObject(carrier);
    const carrierLen = carrierBox.max.z - carrierBox.min.z;
    const dreadLen =
      new THREE.Box3().setFromObject(dreadnought).max.z -
      new THREE.Box3().setFromObject(dreadnought).min.z;

    // Carrier (~10.5u) sits cleanly between Cruiser (~7.5u) and Imperator Dreadnought (~14.5u)
    expect(carrierLen).toBeGreaterThan(cruiserLen * 1.2);
    expect(carrierLen).toBeLessThan(dreadLen * 0.85);

    let deckStingerCount = 0;
    let greyBarrelCount = 0;
    let violetCount = 0;
    carrier.traverse((obj) => {
      if (obj.name === 'ship_fighter_stinger') deckStingerCount += 1;
      if (!(obj instanceof THREE.Mesh)) return;
      const mat = obj.material;
      if (!(mat instanceof THREE.MeshStandardMaterial)) return;
      if (mat.name === 'turret_barrel_steel') greyBarrelCount += 1;
      if (mat.color.getHex() === 0xc084fc) violetCount += 1;
    });
    expect(deckStingerCount).toBe(4);
    // 8 Carrier PD barrels + 8 chin barrels on the 4 deck-staged Stingers = 16
    expect(greyBarrelCount).toBe(16);
    expect(violetCount).toBe(0);
    ships.dispose();

    // Verify Minerva Tech Module projects the wireframe Vanguard Carrier hologram
    const stations = new StationModelLibrary();
    const techModule = stations.buildStationMesh('tech_module', true, 42.56);
    expect(techModule.getObjectByName('ship_carrier_vanguard')).toBeDefined();
    stations.dispose();
  });

  it('spawns and fades HDR weapon beams, dynamic shield impact ripples, and hull explosions in CombatVfxRenderer', () => {
    const vfx = new CombatVfxRenderer();
    expect(vfx.getActiveEffectCount()).toBe(0);

    vfx.ingestEvents(
      [
        {
          id: 1,
          type: 'weapon_fire',
          systemId: 'system_starter_1',
          fromPos: { x: 100, z: 100 },
          toPos: { x: 180, z: 120 },
          weaponKind: 'siege',
          ownerId: 'player_1',
          timestampSeconds: 1.0,
        },
        {
          id: 2,
          type: 'shield_impact',
          systemId: 'system_starter_1',
          fromPos: { x: 100, z: 100 },
          toPos: { x: 180, z: 120 },
          targetId: 'ship_target_1',
          targetRadius: 8,
          ownerId: 'player_2',
          timestampSeconds: 1.0,
        },
        // Rapid second hit on the same target & impact side refreshes the solid shield patch without stacking/pulsing
        {
          id: 20,
          type: 'shield_impact',
          systemId: 'system_starter_1',
          fromPos: { x: 102, z: 101 },
          toPos: { x: 180, z: 120 },
          targetId: 'ship_target_1',
          targetRadius: 8,
          ownerId: 'player_2',
          timestampSeconds: 1.05,
        },
        {
          id: 3,
          type: 'hull_explosion',
          systemId: 'system_starter_1',
          fromPos: { x: 180, z: 120 },
          toPos: { x: 180, z: 120 },
          targetRadius: 8,
          ownerId: 'player_2',
          timestampSeconds: 1.0,
        },
        // Different system event must be ignored
        {
          id: 4,
          type: 'weapon_fire',
          systemId: 'system_central_hub',
          fromPos: { x: 0, z: 0 },
          toPos: { x: 50, z: 50 },
          weaponKind: 'pd',
          ownerId: 'player_1',
          timestampSeconds: 1.0,
        },
      ],
      'system_starter_1',
    );

    // 1 beam + 1 deduplicated solid shield patch + 2 explosion meshes (core + shockwave ring) = 4
    expect(vfx.getActiveEffectCount()).toBe(4);
    expect(vfx.rootGroup.children).toHaveLength(4);

    // Shield patch holds steady through 0.35s, then fades cleanly over 1.15s total
    vfx.update(0.35);
    expect(vfx.getActiveEffectCount()).toBeGreaterThanOrEqual(1);
    vfx.update(1.0);
    expect(vfx.getActiveEffectCount()).toBe(0);
    expect(vfx.rootGroup.children).toHaveLength(0);
    vfx.dispose();
  });

  it('renders blue shield + green hull health bars on shielded ships and green hull-only bars on unshielded ships', () => {
    const fleetRenderer = new CombatFleetRenderer();
    const baseShip = {
      ownerId: 'player_1' as const,
      homeDockyardId: 'dock_1',
      fleetId: 'fleet_1',
      inCombat: true,
      currentSystemId: 'system_starter_1',
      position: { x: 100, z: 100 },
      headingRadians: 0,
      currentSpeed: 40,
      stance: 'aggressive' as const,
      state: 'holding_position' as const,
      targetSystemId: 'system_starter_1',
      targetPosition: { x: 100, z: 100 },
      patrolWaypoints: [],
      patrolIndex: 0,
      formationOffset: { x: 0, z: 0 },
      weaponCooldowns: [0],
      lastDamageTakenAtSeconds: -999,
      currentTargetId: null,
      currentTargetPos: null,
      tetherHostId: null,
      readyFighterCount: 0,
      fighterLaunchCooldownSeconds: 0,
      fighterRebuildProgressSeconds: 0,
    };

    fleetRenderer.syncShips(
      [
        {
          ...baseShip,
          id: 'ship_dd',
          shipClassId: 'destroyer',
          shields: 0,
          maxShields: 0,
          hull: 210,
          maxHull: 420,
        },
        {
          ...baseShip,
          id: 'ship_cr',
          shipClassId: 'cruiser',
          shields: 225,
          maxShields: 450,
          hull: 750,
          maxHull: 750,
        },
        {
          ...baseShip,
          id: 'ship_cv',
          shipClassId: 'carrier',
          shields: 400,
          maxShields: 400,
          hull: 900,
          maxHull: 900,
          fighterRebuildProgressSeconds: 3.5,
        },
      ],
      null,
      null,
      0,
    );

    let hullBarCount = 0;
    let shieldBarCount = 0;
    let visibleRebuildBars = 0;
    fleetRenderer.rootGroup.traverse((obj) => {
      if (obj.name === 'hull_health_bar') hullBarCount += 1;
      if (obj.name === 'shield_health_bar') shieldBarCount += 1;
      if (obj.name === 'fighter_rebuild_bar' && obj.visible) visibleRebuildBars += 1;
    });
    // All 3 ships have a green Hull bar; shielded Cruiser & Carrier have a blue Shield bar; Carrier shows amber rebuild bar
    expect(hullBarCount).toBe(3);
    expect(shieldBarCount).toBe(2);
    expect(visibleRebuildBars).toBe(1);

    // Once rebuild completes (progress === 0), the Carrier rebuild bar hides automatically
    fleetRenderer.syncShips(
      [
        {
          ...baseShip,
          id: 'ship_cv',
          shipClassId: 'carrier',
          shields: 400,
          maxShields: 400,
          hull: 900,
          maxHull: 900,
          fighterRebuildProgressSeconds: 0,
        },
      ],
      null,
      null,
      0,
    );
    visibleRebuildBars = 0;
    fleetRenderer.rootGroup.traverse((obj) => {
      if (obj.name === 'fighter_rebuild_bar' && obj.visible) visibleRebuildBars += 1;
    });
    expect(visibleRebuildBars).toBe(0);

    // Faction visual differentiation: player_1 (Cyan/Ochre) vs player_2 (Crimson) ships & stations
    fleetRenderer.syncShips(
      [
        {
          ...baseShip,
          id: 'ship_p1',
          ownerId: 'player_1',
          shipClassId: 'cruiser',
          shields: 450,
          maxShields: 450,
          hull: 750,
          maxHull: 750,
        },
        {
          ...baseShip,
          id: 'ship_p2',
          ownerId: 'player_2',
          shipClassId: 'cruiser',
          shields: 450,
          maxShields: 450,
          hull: 750,
          maxHull: 750,
        },
      ],
      null,
      null,
      0,
    );
    const ringColors = new Set<number>();
    const pipColors = new Set<number>();
    let purpleAccentCount = 0;
    let crimsonAccentCount = 0;
    fleetRenderer.rootGroup.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      if (obj.name === 'faction_ownership_ring' && obj.material instanceof THREE.MeshBasicMaterial) {
        ringColors.add(obj.material.color.getHex());
      }
      if (obj.name === 'faction_owner_pip' && obj.material instanceof THREE.MeshBasicMaterial) {
        pipColors.add(obj.material.color.getHex());
      }
      if (
        obj.material instanceof THREE.MeshStandardMaterial &&
        obj.material.name === 'hull_faction_accent_player_1'
      ) {
        purpleAccentCount += 1;
      }
      if (
        obj.material instanceof THREE.MeshStandardMaterial &&
        obj.material.name === 'hull_faction_accent_player_2'
      ) {
        crimsonAccentCount += 1;
      }
    });
    expect(ringColors.has(0xa855f7)).toBe(true);
    expect(ringColors.has(0xef4444)).toBe(true);
    expect(pipColors.has(0xa855f7)).toBe(true);
    expect(pipColors.has(0xef4444)).toBe(true);
    expect(purpleAccentCount).toBeGreaterThan(0);
    expect(crimsonAccentCount).toBeGreaterThan(0);

    const stations = new StationModelLibrary();
    const p1Hub = stations.buildStationMesh('logistics_hub', true, undefined, 'player_1');
    const enemyHub = stations.buildStationMesh('logistics_hub', true, undefined, 'player_2');
    let p1StationAccentCount = 0;
    let enemyStationAccentCount = 0;
    p1Hub.traverse((obj) => {
      if (
        obj instanceof THREE.Mesh &&
        obj.material instanceof THREE.MeshStandardMaterial &&
        obj.material.name === 'station_faction_accent_player_1'
      ) {
        p1StationAccentCount += 1;
      }
    });
    enemyHub.traverse((obj) => {
      if (
        obj instanceof THREE.Mesh &&
        obj.material instanceof THREE.MeshStandardMaterial &&
        obj.material.name === 'station_faction_accent_player_2'
      ) {
        enemyStationAccentCount += 1;
      }
    });
    expect(p1StationAccentCount).toBeGreaterThan(0);
    expect(enemyStationAccentCount).toBeGreaterThan(0);
    stations.dispose();
    fleetRenderer.dispose();
  });
});
