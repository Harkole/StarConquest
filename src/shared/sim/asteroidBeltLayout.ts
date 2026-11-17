import type { StarSystemNode } from './galaxy.ts';

export const BELT_ROTATION_SPEED_RAD_PER_SEC = 0.004;

export interface AsteroidBeltRockInstance {
  readonly id: string;
  readonly systemId: string;
  readonly resourceType: 'ore' | 'crystal';
  readonly instanceIndex: number;
  readonly localX: number;
  readonly localY: number;
  readonly localZ: number;
  readonly rotX: number;
  readonly rotY: number;
  readonly rotZ: number;
  readonly scaleX: number;
  readonly scaleY: number;
  readonly scaleZ: number;
  readonly baseScale: number;
  readonly isMiningCandidate: boolean;
}

export interface SystemAsteroidLayout {
  readonly systemId: string;
  readonly oreRocks: readonly AsteroidBeltRockInstance[];
  readonly crystalRocks: readonly AsteroidBeltRockInstance[];
  readonly miningCandidates: readonly AsteroidBeltRockInstance[];
}

/**
 * Deterministic Mulberry32 PRNG shared between simulation and 3D renderer.
 */
export function createSeededRng(seedStr: string): () => number {
  let state = 2166136261;
  for (let i = 0; i < seedStr.length; i++) {
    state ^= seedStr.charCodeAt(i);
    state = Math.imul(state, 16777619);
  }
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Computes the world-space (x, y, z) of an asteroid/crystal rock in the rotating belt at `elapsedSeconds`.
 * Matches Three.js `Object3D.rotation.y = elapsedSeconds * BELT_ROTATION_SPEED_RAD_PER_SEC`.
 */
export function getAsteroidWorldPosition(
  rock: AsteroidBeltRockInstance,
  elapsedSeconds: number,
): { readonly x: number; readonly y: number; readonly z: number } {
  const theta = elapsedSeconds * BELT_ROTATION_SPEED_RAD_PER_SEC;
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  return {
    x: rock.localX * c + rock.localZ * s,
    y: rock.localY,
    z: -rock.localX * s + rock.localZ * c,
  };
}

const layoutCache = new Map<string, SystemAsteroidLayout>();

export function getSystemAsteroidLayout(system: StarSystemNode): SystemAsteroidLayout {
  const cached = layoutCache.get(system.id);
  if (cached) {
    return cached;
  }

  const rng = createSeededRng(`belts_${system.id}`);
  const oreRatio =
    system.resourceSkew === 'ore_heavy'
      ? 0.78
      : system.resourceSkew === 'crystal_heavy'
        ? 0.42
        : 0.6;
  const totalAsteroids = system.isCentralHub ? 3600 : 2600;
  const oreCount = Math.floor(totalAsteroids * oreRatio);
  const crystalCount = totalAsteroids - oreCount;

  const oreRocks: AsteroidBeltRockInstance[] = [];
  const crystalRocks: AsteroidBeltRockInstance[] = [];
  const miningCandidates: AsteroidBeltRockInstance[] = [];

  function generateRock(
    index: number,
    resourceType: 'ore' | 'crystal',
  ): AsteroidBeltRockInstance {
    const zoneRoll = rng();
    let localX = 0;
    let localZ = 0;

    if (zoneRoll < 0.44) {
      // Inner Belt (r = 365 .. 475)
      const angle = rng() * Math.PI * 2;
      const radialSpread = (rng() + rng() - 1.0) * 55;
      const radius = 420 + radialSpread;
      localX = Math.cos(angle) * radius;
      localZ = Math.sin(angle) * radius;
    } else if (zoneRoll < 0.78) {
      // Mid-System Belt (r = 1040 .. 1200)
      const angle = rng() * Math.PI * 2;
      const radialSpread = (rng() + rng() - 1.0) * 80;
      const radius = 1120 + radialSpread;
      localX = Math.cos(angle) * radius;
      localZ = Math.sin(angle) * radius;
    } else {
      // Outer Deep-Space Stealth Pockets (4 diagonal clusters at r ~ 1620)
      const pocketIndex = Math.floor(rng() * 4);
      const pocketAngle = (pocketIndex * Math.PI) / 2 + Math.PI / 4;
      const centerX = Math.cos(pocketAngle) * 1620;
      const centerZ = Math.sin(pocketAngle) * 1620;
      const clusterRadius = (rng() + rng()) * 115;
      const localAngle = rng() * Math.PI * 2;
      localX = centerX + Math.cos(localAngle) * clusterRadius;
      localZ = centerZ + Math.sin(localAngle) * clusterRadius;
    }

    const localY = (rng() + rng() - 1.0) * 14.0;
    const rotX = rng() * Math.PI * 2;
    const rotY = rng() * Math.PI * 2;
    const rotZ = rng() * Math.PI * 2;

    const sizeRoll = rng();
    const baseScale =
      sizeRoll > 0.92
        ? 1.85 + rng() * 1.35
        : sizeRoll > 0.52
          ? 0.95 + rng() * 0.75
          : 0.45 + rng() * 0.48;

    let scaleX: number;
    let scaleY: number;
    let scaleZ: number;
    if (resourceType === 'crystal') {
      scaleX = baseScale * (0.75 + rng() * 0.4);
      scaleY = baseScale * (1.1 + rng() * 0.55);
      scaleZ = baseScale * (0.75 + rng() * 0.4);
    } else {
      scaleX = baseScale * (0.8 + rng() * 0.6);
      scaleY = baseScale * (0.65 + rng() * 0.5);
      scaleZ = baseScale * (0.8 + rng() * 0.6);
    }

    // Select prominent medium/large rocks near the orbital plane as Harvester targetable deposits
    const isMiningCandidate = baseScale >= 1.15 && Math.abs(localY) <= 6.5 && index % 12 === 0;

    return {
      id: `${system.id}_${resourceType}_rock_${index}`,
      systemId: system.id,
      resourceType,
      instanceIndex: index,
      localX,
      localY,
      localZ,
      rotX,
      rotY,
      rotZ,
      scaleX,
      scaleY,
      scaleZ,
      baseScale,
      isMiningCandidate,
    };
  }

  for (let i = 0; i < oreCount; i++) {
    const rock = generateRock(i, 'ore');
    oreRocks.push(rock);
    if (rock.isMiningCandidate) {
      miningCandidates.push(rock);
    }
  }

  for (let i = 0; i < crystalCount; i++) {
    const rock = generateRock(i, 'crystal');
    crystalRocks.push(rock);
    if (rock.isMiningCandidate) {
      miningCandidates.push(rock);
    }
  }

  const layout: SystemAsteroidLayout = {
    systemId: system.id,
    oreRocks,
    crystalRocks,
    miningCandidates,
  };
  layoutCache.set(system.id, layout);
  return layout;
}
