import { describe, expect, it } from 'vitest';
import { createFiveSystemGalaxy } from '../galaxy.ts';
import {
  type PlanetaryObstacle,
  computeObstacleAwareStep,
  findWormholeHop,
} from '../navigation.ts';

describe('Shared 2D Planetary Obstacle-Avoidance & Wormhole Routing', () => {
  it('steers smoothly around a blocking planet without ever penetrating its avoidance radius', () => {
    const planetRadius = 28;
    const avoidRadius = planetRadius * 1.24; // ~34.72u
    const obstacles: readonly PlanetaryObstacle[] = [
      { id: 'homeworld', position: { x: 0, z: 0 }, avoidRadius },
    ];

    // Start on the -X side of the planet and fly directly toward the +X side
    let pos = { x: -60, z: 0 };
    const target = { x: 60, z: 0 };
    let arrived = false;
    let minRadialDist = Infinity;

    for (let tick = 0; tick < 80; tick++) {
      const step = computeObstacleAwareStep(pos, target, 4.0, obstacles, 2.0);
      pos = step.position;
      const radialDist = Math.hypot(pos.x, pos.z);
      if (radialDist < minRadialDist) {
        minRadialDist = radialDist;
      }
      if (step.arrived) {
        arrived = true;
        break;
      }
    }

    expect(arrived).toBe(true);
    // Must stay strictly outside the planet body & atmosphere halo on every single tick
    expect(minRadialDist).toBeGreaterThanOrEqual(avoidRadius - 0.01);
  });

  it('routes wormhole hops for Starter -> Hub, Hub -> Starter, and Starter A -> Hub -> Starter B', () => {
    const galaxy = createFiveSystemGalaxy();

    // Same system -> null
    expect(findWormholeHop(galaxy, 'system_starter_1', 'system_starter_1')).toBeNull();

    // Direct Starter -> Central Hub
    const toHub = findWormholeHop(galaxy, 'system_starter_1', 'system_central_hub');
    expect(toHub).not.toBeNull();
    expect(toHub?.exitSystemId).toBe('system_central_hub');

    // Direct Central Hub -> Starter 3
    const toStarter3 = findWormholeHop(galaxy, 'system_central_hub', 'system_starter_3');
    expect(toStarter3).not.toBeNull();
    expect(toStarter3?.exitSystemId).toBe('system_starter_3');

    // Two-hop Starter 1 -> Starter 3 routes via Central Hub first
    const twoHop = findWormholeHop(galaxy, 'system_starter_1', 'system_starter_3');
    expect(twoHop).not.toBeNull();
    expect(twoHop?.exitSystemId).toBe('system_central_hub');
  });
});
