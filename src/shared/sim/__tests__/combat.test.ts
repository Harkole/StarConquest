import { describe, expect, it } from 'vitest';
import { SHIP_CLASSES, DEEP_SPACE_STRUCTURES } from '../../config/index.ts';
import {
  applyWeaponDamage,
  computeHitProbability,
  nextCombatRandom,
  scoreCombatTargetPriority,
} from '../combat.ts';

describe('combat RPS math', () => {
  it('enforces tracking vs evasion so PD shreds Fighters while Dreadnoughts & Hull Breakers miss Fighters', () => {
    const fighterEvasion = SHIP_CLASSES.fighter.evasionRating; // 0.85
    const cruiserEvasion = SHIP_CLASSES.cruiser.evasionRating; // 0.30
    const dreadEvasion = SHIP_CLASSES.dreadnought.evasionRating; // 0.05

    const cruiserPdTracking = SHIP_CLASSES.cruiser.weapons[0]!.tracking; // 0.96
    const dreadTracking = SHIP_CLASSES.dreadnought.weapons[0]!.tracking; // 0.18
    const hullBreakerTracking = DEEP_SPACE_STRUCTURES.hull_breaker_tower.weaponTracking; // 0.15

    // Cruiser PD shreds Fighters reliably
    expect(computeHitProbability(cruiserPdTracking, fighterEvasion)).toBeGreaterThan(0.85);
    // Dreadnought siege & Hull Breaker rarely hit evasive Fighters
    expect(computeHitProbability(dreadTracking, fighterEvasion)).toBeLessThan(0.2);
    expect(computeHitProbability(hullBreakerTracking, fighterEvasion)).toBeLessThan(0.2);
    // Dreadnought siege hits Cruisers and enemy Dreadnoughts reliably
    expect(computeHitProbability(dreadTracking, cruiserEvasion)).toBeGreaterThan(0.7);
    expect(computeHitProbability(dreadTracking, dreadEvasion)).toBeGreaterThan(0.9);
  });

  it('applies Shield-Breaker multipliers to Shields first and overflows remaining alpha onto Hull', () => {
    // Fighter Shield-Breaker Pulse Blaster: 16 alpha, 2.5x shield, 1.0x hull
    const shieldHit = applyWeaponDamage(100, 500, 16, 2.5, 1.0);
    expect(shieldHit.shieldDamageDealt).toBe(40);
    expect(shieldHit.nextShields).toBe(60);
    expect(shieldHit.hullDamageDealt).toBe(0);
    expect(shieldHit.shieldsBroken).toBe(false);
    expect(shieldHit.destroyed).toBe(false);

    // Shield break overflow: 20 shields left, 16 alpha at 2.5x shield uses 8 alpha on shields,
    // leaving 8 alpha * 1.5x hull = 12 hull damage
    const breakHit = applyWeaponDamage(20, 500, 16, 2.5, 1.5);
    expect(breakHit.nextShields).toBe(0);
    expect(breakHit.shieldsBroken).toBe(true);
    expect(breakHit.hullDamageDealt).toBeCloseTo(12, 5);
    expect(breakHit.nextHull).toBeCloseTo(488, 5);

    // Lethal hull hit destroys target cleanly
    const lethal = applyWeaponDamage(0, 100, 280, 1.25, 1.5);
    expect(lethal.nextHull).toBe(0);
    expect(lethal.destroyed).toBe(true);
  });

  it('prioritizes RPS counter targets per ship class and produces deterministic dogfight RNG', () => {
    // Fighters prefer shielded Dreadnoughts over Destroyers
    expect(
      scoreCombatTargetPriority('fighter', 'dreadnought', true, 100),
    ).toBeGreaterThan(scoreCombatTargetPriority('fighter', 'destroyer', false, 100));

    // Cruisers prefer Fighters over Dreadnoughts
    expect(
      scoreCombatTargetPriority('cruiser', 'fighter', false, 100),
    ).toBeGreaterThan(scoreCombatTargetPriority('cruiser', 'dreadnought', true, 100));

    // Destroyers prefer Carriers over Dreadnoughts
    expect(
      scoreCombatTargetPriority('destroyer', 'carrier', true, 100),
    ).toBeGreaterThan(scoreCombatTargetPriority('destroyer', 'dreadnought', true, 100));

    // Dreadnoughts prefer Structures and Cruisers over evasive Fighters
    expect(
      scoreCombatTargetPriority('dreadnought', 'structure', true, 100),
    ).toBeGreaterThan(scoreCombatTargetPriority('dreadnought', 'fighter', false, 100));

    const rngA = { seed: 42 };
    const rngB = { seed: 42 };
    const seqA = [nextCombatRandom(rngA), nextCombatRandom(rngA), nextCombatRandom(rngA)];
    const seqB = [nextCombatRandom(rngB), nextCombatRandom(rngB), nextCombatRandom(rngB)];
    expect(seqA).toEqual(seqB);
    for (const v of seqA) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});
