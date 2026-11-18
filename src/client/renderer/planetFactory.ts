import * as THREE from 'three';
import { PLANET_CLASSES } from '../../shared/config/index.ts';
import type { PlanetNode } from '../../shared/sim/galaxy.ts';
import {
  ORBITAL_RING_ROTATION_SPEED_RAD_PER_SEC,
  type PlanetRuntimeState,
} from '../../shared/sim/gameSimulation.ts';
import {
  ATMOSPHERE_FRESNEL_FRAGMENT_SHADER,
  DRIFTING_CLOUDS_FRAGMENT_SHADER,
  PLANET_COMMON_VERTEX_SHADER,
  PLANET_SHADER_THEME_PARAMS,
  TERRAN_SURFACE_FRAGMENT_SHADER,
  VOLCANIC_ROCK_SURFACE_FRAGMENT_SHADER,
} from '../shaders/planetShaders.ts';
import { StationModelLibrary } from './stationModels.ts';

export interface OrbitalSlotPoint {
  readonly slotIndex: number;
  readonly angleRadians: number;
  readonly x: number;
  readonly z: number;
}

/**
 * Pure helper that calculates the evenly spaced orbital slot coordinates around a planet.
 * Planet capacities are 6 (Small), 8 (Medium), 10 (Large), or 12 (Super-Earth).
 */
export function computeOrbitalSlotPositions(
  orbitalRingRadius: number,
  slotCount: number,
): readonly OrbitalSlotPoint[] {
  const points: OrbitalSlotPoint[] = [];
  for (let i = 0; i < slotCount; i++) {
    const angleRadians = (i / slotCount) * Math.PI * 2;
    points.push({
      slotIndex: i,
      angleRadians,
      x: Math.cos(angleRadians) * orbitalRingRadius,
      z: Math.sin(angleRadians) * orbitalRingRadius,
    });
  }
  return points;
}

export interface AnimatedPlanetHandle {
  readonly planet: PlanetNode;
  readonly rootGroup: THREE.Group;
  readonly orbitalRingRadius: number;
  isHabited(): boolean;
  setHabited(habited: boolean): void;
  syncStructures(planetState: PlanetRuntimeState): void;
  update(elapsedSeconds: number, deltaSeconds: number, simElapsedSeconds?: number): void;
  dispose(): void;
}

function hashStringSeed(id: string): number {
  let hash = 2166136261;
  for (let i = 0; i < id.length; i++) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) % 10000) / 1000;
}

export function createLivingPlanetGroup(
  planet: PlanetNode,
  sunDirection: THREE.Vector3,
): AnimatedPlanetHandle {
  const classConfig = PLANET_CLASSES[planet.planetClass];
  const radius = classConfig.radiusUnits;
  const orbitalRingRadius = radius * 1.52;
  const themeParams = PLANET_SHADER_THEME_PARAMS[planet.visualTheme];
  const seed = hashStringSeed(planet.id);

  const rootGroup = new THREE.Group();
  rootGroup.name = `planet_${planet.id}`;
  rootGroup.position.set(planet.position.x, 0, planet.position.z);

  const disposables: { dispose(): void }[] = [];
  const timeUniforms: { value: number }[] = [];

  // Axial tilt group for the planet body, clouds, and atmosphere
  const bodyGroup = new THREE.Group();
  bodyGroup.rotation.z = 0.22;
  rootGroup.add(bodyGroup);

  // 1. Inner Surface Layer (Terran/Super-Earth vs Volcanic/Barren Rock)
  const surfaceGeometry = new THREE.SphereGeometry(radius, 64, 64);
  disposables.push(surfaceGeometry);

  const isTerranType =
    planet.visualTheme === 'terran' || planet.visualTheme === 'super_earth';
  const surfaceTimeUniform = { value: 0 };
  const isHabitedUniform = { value: planet.ownerId !== null ? 1.0 : 0.0 };
  timeUniforms.push(surfaceTimeUniform);

  const surfaceMaterial = new THREE.ShaderMaterial({
    vertexShader: PLANET_COMMON_VERTEX_SHADER,
    fragmentShader: isTerranType
      ? TERRAN_SURFACE_FRAGMENT_SHADER
      : VOLCANIC_ROCK_SURFACE_FRAGMENT_SHADER,
    uniforms: isTerranType
      ? {
          uTime: surfaceTimeUniform,
          uSeed: { value: seed },
          uOceanLevel: { value: themeParams.oceanLevel },
          uCloudDriftSpeed: { value: themeParams.cloudDriftSpeed },
          uIsSuperEarth: { value: planet.visualTheme === 'super_earth' ? 1.0 : 0.0 },
          uIsHabited: isHabitedUniform,
          uSunDirection: { value: sunDirection.clone().normalize() },
          uAtmosphereColor: {
            value: new THREE.Color(...themeParams.atmosphereColor),
          },
        }
      : {
          uTime: surfaceTimeUniform,
          uSeed: { value: seed },
          uIsVolcanicLava: { value: planet.visualTheme === 'volcanic_lava' ? 1.0 : 0.0 },
          uLavaEmissionStrength: { value: themeParams.lavaEmissionStrength },
          uSunDirection: { value: sunDirection.clone().normalize() },
          uAtmosphereColor: {
            value: new THREE.Color(...themeParams.atmosphereColor),
          },
        },
  });
  disposables.push(surfaceMaterial);

  const surfaceMesh = new THREE.Mesh(surfaceGeometry, surfaceMaterial);
  bodyGroup.add(surfaceMesh);

  // 2. Drifting Cloud Layer Sphere (Terran & Super-Earth worlds)
  if (themeParams.hasDriftingClouds) {
    const cloudGeometry = new THREE.SphereGeometry(radius * 1.028, 64, 64);
    disposables.push(cloudGeometry);

    const cloudTimeUniform = { value: 0 };
    timeUniforms.push(cloudTimeUniform);

    const cloudMaterial = new THREE.ShaderMaterial({
      vertexShader: PLANET_COMMON_VERTEX_SHADER,
      fragmentShader: DRIFTING_CLOUDS_FRAGMENT_SHADER,
      transparent: true,
      depthWrite: false,
      uniforms: {
        uTime: cloudTimeUniform,
        uSeed: { value: seed },
        uCloudDriftSpeed: { value: themeParams.cloudDriftSpeed },
        uCloudCoverage: { value: themeParams.cloudCoverage },
        uSunDirection: { value: sunDirection.clone().normalize() },
        uAtmosphereColor: {
          value: new THREE.Color(...themeParams.atmosphereColor),
        },
      },
    });
    disposables.push(cloudMaterial);

    const cloudMesh = new THREE.Mesh(cloudGeometry, cloudMaterial);
    bodyGroup.add(cloudMesh);
  }

  // 3. Outer Fresnel Atmospheric Halo Shell
  const atmosphereGeometry = new THREE.SphereGeometry(radius * 1.125, 48, 48);
  disposables.push(atmosphereGeometry);

  const atmosphereMaterial = new THREE.ShaderMaterial({
    vertexShader: PLANET_COMMON_VERTEX_SHADER,
    fragmentShader: ATMOSPHERE_FRESNEL_FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
    side: THREE.BackSide,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uSunDirection: { value: sunDirection.clone().normalize() },
      uAtmosphereColor: {
        value: new THREE.Color(...themeParams.atmosphereColor),
      },
      uAtmosphereIntensity: { value: themeParams.atmosphereIntensity },
    },
  });
  disposables.push(atmosphereMaterial);

  const atmosphereMesh = new THREE.Mesh(atmosphereGeometry, atmosphereMaterial);
  bodyGroup.add(atmosphereMesh);

  // 4. Orbital Ring Track & Dynamic Slot Stations (6, 8, 10, or 12 slots)
  const orbitalGroup = new THREE.Group();
  rootGroup.add(orbitalGroup);

  const stationDynamicGroup = new THREE.Group();
  orbitalGroup.add(stationDynamicGroup);

  const ringColor =
    planet.ownerId !== null
      ? new THREE.Color(0x38bdf8)
      : planet.planetClass === 'super_earth'
        ? new THREE.Color(0xc084fc)
        : new THREE.Color(0x64748b);

  const trackGeometry = new THREE.TorusGeometry(orbitalRingRadius, 0.35, 12, 96);
  trackGeometry.rotateX(Math.PI / 2);
  disposables.push(trackGeometry);

  const trackMaterial = new THREE.MeshBasicMaterial({
    color: ringColor,
    transparent: true,
    opacity: 0.55,
  });
  disposables.push(trackMaterial);
  orbitalGroup.add(new THREE.Mesh(trackGeometry, trackMaterial));

  const slotPoints = computeOrbitalSlotPositions(orbitalRingRadius, planet.orbitalSlots);
  const slotNodeGeometry = new THREE.CylinderGeometry(1.7, 1.7, 0.9, 16);
  const slotRingGeometry = new THREE.TorusGeometry(2.3, 0.22, 8, 24);
  slotRingGeometry.rotateX(Math.PI / 2);
  disposables.push(slotNodeGeometry, slotRingGeometry);

  const freeSlotMaterial = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    emissive: ringColor,
    emissiveIntensity: 0.55,
    metalness: 0.7,
    roughness: 0.3,
  });
  disposables.push(freeSlotMaterial);

  const slotNodeMeshes: THREE.Mesh[] = [];
  const slotHaloMeshes: THREE.Mesh[] = [];

  for (const slot of slotPoints) {
    const nodeMesh = new THREE.Mesh(slotNodeGeometry, freeSlotMaterial);
    nodeMesh.name = `orbital_slot_node_${slot.slotIndex}`;
    nodeMesh.position.set(slot.x, 0, slot.z);
    orbitalGroup.add(nodeMesh);
    slotNodeMeshes.push(nodeMesh);

    const haloRing = new THREE.Mesh(slotRingGeometry, freeSlotMaterial);
    haloRing.name = `orbital_slot_halo_${slot.slotIndex}`;
    haloRing.position.set(slot.x, 0, slot.z);
    orbitalGroup.add(haloRing);
    slotHaloMeshes.push(haloRing);
  }

  const stationModels = new StationModelLibrary();
  disposables.push(stationModels);

  let lastSignature: string | null = null;
  let latestPlanetState: PlanetRuntimeState | null = null;
  const stationGroupsById = new Map<string, THREE.Group>();

  function syncStructures(planetState: PlanetRuntimeState): void {
    latestPlanetState = planetState;
    isHabitedUniform.value = planetState.ownerId !== null ? 1.0 : 0.0;
    if (planetState.ownerId !== null) {
      trackMaterial.color.setHex(0x38bdf8);
    }

    const sig = planetState.structures
      .map((s) => `${s.id}:${s.isComplete ? '1' : '0'}:${s.occupiedSlots.join(',')}`)
      .join('|');
    if (sig === lastSignature) {
      return;
    }
    lastSignature = sig;

    stationDynamicGroup.clear();
    stationGroupsById.clear();

    const occupiedSet = new Set<number>();
    for (const struct of planetState.structures) {
      for (const slotIdx of struct.occupiedSlots) {
        occupiedSet.add(slotIdx);
      }

      const p0 = slotPoints[struct.occupiedSlots[0] ?? 0];
      if (!p0) {
        continue;
      }

      let angle = p0.angleRadians;
      if (struct.occupiedSlots.length === 2) {
        const p1 = slotPoints[struct.occupiedSlots[1] ?? 0];
        if (p1) {
          // Handle wrap-around between last slot and slot 0
          let a1 = p1.angleRadians;
          if (a1 < angle) {
            a1 += Math.PI * 2;
          }
          angle = (angle + a1) * 0.5;
        }
      }

      const stationGroup = stationModels.buildStationMesh(
        struct.structureId,
        struct.isComplete,
        orbitalRingRadius,
      );
      stationGroup.position.set(
        Math.cos(angle) * orbitalRingRadius,
        0,
        Math.sin(angle) * orbitalRingRadius,
      );
      stationGroup.rotation.y = -angle;
      stationDynamicGroup.add(stationGroup);
      stationGroupsById.set(struct.id, stationGroup);
    }

    slotNodeMeshes.forEach((mesh, idx) => {
      mesh.visible = !occupiedSet.has(idx);
    });
    slotHaloMeshes.forEach((mesh, idx) => {
      mesh.visible = !occupiedSet.has(idx);
    });
  }

  // Initialize default Homeworld C&C visual if owned at creation
  if (planet.ownerId !== null && planet.planetClass === 'large') {
    syncStructures({
      planet,
      ownerId: planet.ownerId,
      structures: [
        {
          id: 'init_cnc',
          structureId: 'command_and_control',
          ownerId: planet.ownerId,
          planetId: planet.id,
          primarySlotIndex: 0,
          occupiedSlots: [0, 1],
          buildProgressSeconds: 0,
          totalBuildTimeSeconds: 0,
          isComplete: true,
          shields: 3000,
          hull: 8000,
          targetResource: 'auto',
          activeDockingHarvesterIds: [],
          queuedDockingHarvesterIds: [],
          productionQueue: [],
        },
      ],
    });
  }

  return {
    planet,
    rootGroup,
    orbitalRingRadius,
    isHabited(): boolean {
      return isHabitedUniform.value > 0.5;
    },
    setHabited(habited: boolean): void {
      isHabitedUniform.value = habited ? 1.0 : 0.0;
    },
    syncStructures,
    update(
      elapsedSeconds: number,
      deltaSeconds: number,
      simElapsedSeconds = elapsedSeconds,
    ): void {
      for (const uniform of timeUniforms) {
        uniform.value = elapsedSeconds;
      }
      // Slow planetary axial rotation + deterministic orbital ring rotation synced with simulation
      surfaceMesh.rotation.y += deltaSeconds * 0.045;
      orbitalGroup.rotation.y =
        simElapsedSeconds * ORBITAL_RING_ROTATION_SPEED_RAD_PER_SEC;

      if (latestPlanetState) {
        for (const struct of latestPlanetState.structures) {
          const stationGroup = stationGroupsById.get(struct.id);
          if (stationGroup) {
            const activeOrder = struct.productionQueue[0];
            const progressRatio = activeOrder
              ? activeOrder.progressSeconds / Math.max(0.1, activeOrder.buildTimeSeconds)
              : null;
            stationModels.updateStationAnimation(
              stationGroup,
              elapsedSeconds,
              progressRatio,
            );
          }
        }
      }
    },
    dispose(): void {
      for (const item of disposables) {
        item.dispose();
      }
    },
  };
}
