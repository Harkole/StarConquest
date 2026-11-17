import * as THREE from 'three';
import { PLANET_CLASSES } from '../../shared/config/index.ts';
import type { PlanetNode } from '../../shared/sim/galaxy.ts';
import {
  ATMOSPHERE_FRESNEL_FRAGMENT_SHADER,
  DRIFTING_CLOUDS_FRAGMENT_SHADER,
  PLANET_COMMON_VERTEX_SHADER,
  PLANET_SHADER_THEME_PARAMS,
  TERRAN_SURFACE_FRAGMENT_SHADER,
  VOLCANIC_ROCK_SURFACE_FRAGMENT_SHADER,
} from '../shaders/planetShaders.ts';

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
  update(elapsedSeconds: number, deltaSeconds: number): void;
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

  // 4. Orbital Ring Track & Slot Nodes (6, 8, 10, or 12 slots)
  const orbitalGroup = new THREE.Group();
  rootGroup.add(orbitalGroup);

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
    emissiveIntensity: 0.75,
    metalness: 0.7,
    roughness: 0.3,
  });
  const occupiedSlotMaterial = new THREE.MeshStandardMaterial({
    color: 0x0ea5e9,
    emissive: 0x38bdf8,
    emissiveIntensity: 1.6,
    metalness: 0.8,
    roughness: 0.2,
  });
  disposables.push(freeSlotMaterial, occupiedSlotMaterial);

  const hasStartingCommandAndControl =
    planet.ownerId !== null && planet.planetClass === 'large';

  for (const slot of slotPoints) {
    // Starting Command & Control occupies 2 orbital slots (slots 0 and 1) on Homeworld
    const isOccupiedByCnC =
      hasStartingCommandAndControl && (slot.slotIndex === 0 || slot.slotIndex === 1);
    const nodeMat = isOccupiedByCnC ? occupiedSlotMaterial : freeSlotMaterial;

    const nodeMesh = new THREE.Mesh(slotNodeGeometry, nodeMat);
    nodeMesh.position.set(slot.x, 0, slot.z);
    orbitalGroup.add(nodeMesh);

    const haloRing = new THREE.Mesh(slotRingGeometry, nodeMat);
    haloRing.position.set(slot.x, 0, slot.z);
    orbitalGroup.add(haloRing);
  }

  // Render the 2-Slot Command & Control (C&C) Orbital Station on starter Homeworlds
  if (hasStartingCommandAndControl && slotPoints[0] && slotPoints[1]) {
    const midAngle = (slotPoints[0].angleRadians + slotPoints[1].angleRadians) * 0.5;
    const cncGroup = new THREE.Group();
    cncGroup.position.set(
      Math.cos(midAngle) * orbitalRingRadius,
      0,
      Math.sin(midAngle) * orbitalRingRadius,
    );
    cncGroup.rotation.y = -midAngle;

    const coreGeom = new THREE.OctahedronGeometry(4.2, 1);
    const spireGeom = new THREE.CylinderGeometry(1.1, 1.8, 11, 8);
    const bridgeWingGeom = new THREE.BoxGeometry(3.2, 1.4, 14);
    disposables.push(coreGeom, spireGeom, bridgeWingGeom);

    const cncMat = new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      emissive: 0x38bdf8,
      emissiveIntensity: 1.4,
      metalness: 0.85,
      roughness: 0.2,
    });
    disposables.push(cncMat);

    cncGroup.add(new THREE.Mesh(coreGeom, cncMat));
    cncGroup.add(new THREE.Mesh(spireGeom, cncMat));
    cncGroup.add(new THREE.Mesh(bridgeWingGeom, cncMat));
    orbitalGroup.add(cncGroup);
  }

  return {
    planet,
    rootGroup,
    orbitalRingRadius,
    update(elapsedSeconds: number, deltaSeconds: number): void {
      for (const uniform of timeUniforms) {
        uniform.value = elapsedSeconds;
      }
      // Slow planetary axial rotation + gentle orbital ring rotation
      surfaceMesh.rotation.y += deltaSeconds * 0.045;
      orbitalGroup.rotation.y += deltaSeconds * 0.025;
    },
    dispose(): void {
      for (const item of disposables) {
        item.dispose();
      }
    },
  };
}
