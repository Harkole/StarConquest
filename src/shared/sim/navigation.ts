import type { Vector2D } from '../protocol/commands.ts';
import type { GalaxyTopology } from './galaxy.ts';

export interface PlanetaryObstacle {
  readonly id: string;
  readonly position: Vector2D;
  /** Minimum safe radial distance from planet center (planet radius + atmospheric clearance). */
  readonly avoidRadius: number;
}

export interface ObstacleAwareStepResult {
  readonly position: Vector2D;
  readonly headingRadians: number;
  readonly arrived: boolean;
  readonly movedDistance: number;
}

export interface WormholeHop {
  readonly wormholeId: string;
  readonly entryPosition: Vector2D;
  readonly exitSystemId: string;
  readonly exitPosition: Vector2D;
}

/**
 * Checks whether the straight segment A -> B enters the interior of a circle (center, radius).
 * Returns the parametric distance `t` in (0, 1) of closest approach if blocked, or `null` if clear.
 */
function findSegmentCircleBlock(
  ax: number,
  az: number,
  bx: number,
  bz: number,
  cx: number,
  cz: number,
  radius: number,
): number | null {
  const dx = bx - ax;
  const dz = bz - az;
  const lenSq = dx * dx + dz * dz;
  if (lenSq < 1e-8) {
    return null;
  }

  // Project circle center onto segment [0, 1]
  const t = Math.max(0, Math.min(1, ((cx - ax) * dx + (cz - az) * dz) / lenSq));
  if (t <= 0.001 || t >= 0.999) {
    return null;
  }

  const closestX = ax + dx * t;
  const closestZ = az + dz * t;
  const distSq = (closestX - cx) * (closestX - cx) + (closestZ - cz) * (closestZ - cz);
  if (distSq < radius * radius) {
    return t;
  }
  return null;
}

/**
 * Computes a single deterministic, planetary-obstacle-aware movement step from `from` toward `target`.
 * Shared by both Prospector Harvesters and all 5 combat ship classes so ships smoothly arc around
 * planets and their atmospheres instead of flying through planetary interiors.
 */
export function computeObstacleAwareStep(
  from: Vector2D,
  target: Vector2D,
  maxStepDistance: number,
  obstacles: readonly PlanetaryObstacle[],
  arrivalTolerance = 1.5,
): ObstacleAwareStepResult {
  const directDx = target.x - from.x;
  const directDz = target.z - from.z;
  const directDist = Math.hypot(directDx, directDz);

  if (directDist <= arrivalTolerance) {
    return {
      position: { x: from.x, z: from.z },
      headingRadians:
        directDist > 1e-5 ? Math.atan2(directDx, directDz) : 0,
      arrived: true,
      movedDistance: 0,
    };
  }

  let steerTargetX = target.x;
  let steerTargetZ = target.z;

  // 1. If the ship somehow starts inside an obstacle's avoidRadius, push cleanly radially outward first
  let insideObstacle: PlanetaryObstacle | null = null;
  for (const obs of obstacles) {
    const ox = from.x - obs.position.x;
    const oz = from.z - obs.position.z;
    const distFromCenter = Math.hypot(ox, oz);
    if (distFromCenter < obs.avoidRadius - 0.25) {
      insideObstacle = obs;
      const nx = distFromCenter > 1e-4 ? ox / distFromCenter : 1;
      const nz = distFromCenter > 1e-4 ? oz / distFromCenter : 0;
      steerTargetX = obs.position.x + nx * (obs.avoidRadius + 4);
      steerTargetZ = obs.position.z + nz * (obs.avoidRadius + 4);
      break;
    }
  }

  // 2. Otherwise, find the closest planetary obstacle intersecting the straight path from -> target
  if (!insideObstacle) {
    let closestObstacle: PlanetaryObstacle | null = null;
    let closestT = Infinity;

    for (const obs of obstacles) {
      // Ignore obstacle if the final destination itself is inside/on its avoidance margin
      const targetDistToObs = Math.hypot(
        target.x - obs.position.x,
        target.z - obs.position.z,
      );
      if (targetDistToObs <= obs.avoidRadius) {
        continue;
      }

      const hitT = findSegmentCircleBlock(
        from.x,
        from.z,
        target.x,
        target.z,
        obs.position.x,
        obs.position.z,
        obs.avoidRadius,
      );
      if (hitT !== null && hitT < closestT) {
        closestT = hitT;
        closestObstacle = obs;
      }
    }

    if (closestObstacle) {
      const cx = closestObstacle.position.x;
      const cz = closestObstacle.position.z;
      const vx = cx - from.x;
      const vz = cz - from.z;
      const distToCenter = Math.hypot(vx, vz);
      // Add a small clearance margin so discrete ticks never clip inside avoidRadius
      const clearanceR = closestObstacle.avoidRadius + Math.max(2.5, maxStepDistance * 0.35);

      if (distToCenter > 1e-4) {
        const dirToCenterX = vx / distToCenter;
        const dirToCenterZ = vz / distToCenter;
        // Two perpendicular directions around the planet center (CW vs CCW)
        const perpLeftX = -dirToCenterZ;
        const perpLeftZ = dirToCenterX;
        const perpRightX = dirToCenterZ;
        const perpRightZ = -dirToCenterX;

        // Tangent waypoint offsets placed outside the planet perimeter
        const leftWpX = cx + perpLeftX * clearanceR;
        const leftWpZ = cz + perpLeftZ * clearanceR;
        const rightWpX = cx + perpRightX * clearanceR;
        const rightWpZ = cz + perpRightZ * clearanceR;

        // Pick the shorter total path (from -> tangentWaypoint -> target)
        const leftScore =
          Math.hypot(leftWpX - from.x, leftWpZ - from.z) +
          Math.hypot(target.x - leftWpX, target.z - leftWpZ);
        const rightScore =
          Math.hypot(rightWpX - from.x, rightWpZ - from.z) +
          Math.hypot(target.x - rightWpX, target.z - rightWpZ);

        if (leftScore <= rightScore) {
          steerTargetX = leftWpX;
          steerTargetZ = leftWpZ;
        } else {
          steerTargetX = rightWpX;
          steerTargetZ = rightWpZ;
        }
      }
    }
  }

  const moveDx = steerTargetX - from.x;
  const moveDz = steerTargetZ - from.z;
  const moveDist = Math.hypot(moveDx, moveDz);
  if (moveDist < 1e-6) {
    return {
      position: { x: from.x, z: from.z },
      headingRadians: 0,
      arrived: false,
      movedDistance: 0,
    };
  }

  const step = Math.min(maxStepDistance, moveDist);
  let nextX = from.x + (moveDx / moveDist) * step;
  let nextZ = from.z + (moveDz / moveDist) * step;

  // 3. Hard safety clamp: guarantee discrete step never lands inside any planetary obstacle
  for (const obs of obstacles) {
    const targetDistToObs = Math.hypot(
      target.x - obs.position.x,
      target.z - obs.position.z,
    );
    if (targetDistToObs <= obs.avoidRadius) {
      continue;
    }
    const ox = nextX - obs.position.x;
    const oz = nextZ - obs.position.z;
    const dist = Math.hypot(ox, oz);
    if (dist < obs.avoidRadius) {
      const nx = dist > 1e-4 ? ox / dist : 1;
      const nz = dist > 1e-4 ? oz / dist : 0;
      nextX = obs.position.x + nx * obs.avoidRadius;
      nextZ = obs.position.z + nz * obs.avoidRadius;
    }
  }

  const finalDx = nextX - from.x;
  const finalDz = nextZ - from.z;
  const actualMoved = Math.hypot(finalDx, finalDz);
  const headingRadians =
    actualMoved > 1e-5 ? Math.atan2(finalDx, finalDz) : Math.atan2(moveDx, moveDz);
  const remainingToGoal = Math.hypot(target.x - nextX, target.z - nextZ);

  return {
    position: { x: nextX, z: nextZ },
    headingRadians,
    arrived: remainingToGoal <= arrivalTolerance,
    movedDistance: actualMoved,
  };
}

/**
 * Finds the next wormhole hop from `fromSystemId` toward `destinationSystemId` in the
 * 5-system hub-and-spoke galaxy (supports Starter -> Hub, Hub -> Starter, and Starter A -> Hub -> Starter B).
 */
export function findWormholeHop(
  galaxy: GalaxyTopology,
  fromSystemId: string,
  destinationSystemId: string,
): WormholeHop | null {
  if (fromSystemId === destinationSystemId) {
    return null;
  }

  // 1. Direct wormhole connection (Starter <-> Central Nexus)
  for (const wh of galaxy.wormholes) {
    if (wh.fromSystemId === fromSystemId && wh.toSystemId === destinationSystemId) {
      return {
        wormholeId: wh.id,
        entryPosition: wh.fromPosition,
        exitSystemId: wh.toSystemId,
        exitPosition: wh.toPosition,
      };
    }
    if (wh.toSystemId === fromSystemId && wh.fromSystemId === destinationSystemId) {
      return {
        wormholeId: wh.id,
        entryPosition: wh.toPosition,
        exitSystemId: wh.fromSystemId,
        exitPosition: wh.fromPosition,
      };
    }
  }

  // 2. Two-hop hub-and-spoke route (Starter A -> Central Nexus -> Starter B): take the outgoing hub wormhole first
  const toHub = galaxy.wormholes.find((wh) => wh.fromSystemId === fromSystemId);
  if (toHub) {
    return {
      wormholeId: toHub.id,
      entryPosition: toHub.fromPosition,
      exitSystemId: toHub.toSystemId,
      exitPosition: toHub.toPosition,
    };
  }

  return null;
}
