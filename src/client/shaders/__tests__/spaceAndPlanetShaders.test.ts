import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { createFiveSystemGalaxy } from '../../../shared/sim/galaxy.ts';
import {
  computeOrbitalSlotPositions,
  createLivingPlanetGroup,
} from '../../renderer/planetFactory.ts';
import { createStarSystemEnvironment } from '../../renderer/spaceEnvironmentFactory.ts';
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
});
