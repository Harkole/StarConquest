import type { CombatShipClassId } from '../config/index.ts';
import type { Vector2D } from '../protocol/commands.ts';

export type WeaponVisualKind = 'fighter' | 'pd' | 'medium' | 'heavy' | 'siege';

export interface LineOfSightBlocker {
  readonly id: string;
  readonly position: Vector2D;
  readonly radius: number;
}

/**
 * Returns true if the 2D line segment `from -> to` does not intersect any blocking circle
 * (planets or friendly hulls) strictly between the endpoints.
 */
export function hasClearLineOfSight(
  from: Vector2D,
  to: Vector2D,
  blockers: readonly LineOfSightBlocker[],
  ignoreIds?: ReadonlySet<string>,
): boolean {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const segLenSq = dx * dx + dz * dz;
  if (segLenSq < 1e-6) {
    return true;
  }

  for (const b of blockers) {
    if (ignoreIds?.has(b.id) || b.radius <= 0) {
      continue;
    }
    const fx = b.position.x - from.x;
    const fz = b.position.z - from.z;
    const t = Math.max(0, Math.min(1, (fx * dx + fz * dz) / segLenSq));
    // Ignore blockers behind/at the shooter or target endpoints
    if (t <= 0.04 || t >= 0.96) {
      continue;
    }
    const closestX = from.x + dx * t;
    const closestZ = from.z + dz * t;
    const distSq =
      (b.position.x - closestX) * (b.position.x - closestX) +
      (b.position.z - closestZ) * (b.position.z - closestZ);
    if (distSq < b.radius * b.radius) {
      return false;
    }
  }

  return true;
}

/** Shortest signed angular delta from `fromAngle` to `toAngle` in `[-PI, PI]`. */
export function shortestAngleDelta(fromAngle: number, toAngle: number): number {
  let diff = (toAngle - fromAngle) % (Math.PI * 2);
  if (diff > Math.PI) diff -= Math.PI * 2;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return diff;
}

export interface DamageResolution {
  readonly nextShields: number;
  readonly nextHull: number;
  readonly shieldDamageDealt: number;
  readonly hullDamageDealt: number;
  readonly shieldsBroken: boolean;
  readonly destroyed: boolean;
}

/**
 * Deterministic LCG step in `[0, 1)` for Fighter-vs-Fighter dogfight luck and hit rolls.
 * Keeps combat 100% reproducible across local and P2P lockstep simulations.
 */
export function nextCombatRandom(state: { seed: number }): number {
  state.seed = (Math.imul(state.seed, 1664525) + 1013904223) >>> 0;
  return state.seed / 4294967296;
}

/**
 * Computes weapon hit probability `[0.06, 0.98]` from attacker tracking (`0..1`) vs target evasion (`0..1`).
 * - High-tracking Point Defence (`0.92-0.96`) reliably shreds Fighters (`0.85` evasion -> `~0.86-0.93` hit).
 * - Low-tracking Dreadnought Siege (`0.18`) & Hull Breaker Towers (`0.15`) barely graze Fighters (`~0.08-0.12`),
 *   reliably hit Cruisers (`0.30` evasion -> `~0.62`), and hammer Capitals/Structures (`0.0-0.15` -> `0.85-0.98`).
 */
export function computeHitProbability(
  weaponTracking: number,
  targetEvasion: number,
): number {
  const clampedTracking = Math.max(0, Math.min(1, weaponTracking));
  const clampedEvasion = Math.max(0, Math.min(1, targetEvasion));

  // Tracking directly counters evasion; residual evasion reduces hit chance nonlinearly
  const effectiveEvasion = Math.max(0, clampedEvasion - clampedTracking * 0.88);
  const rawHit = 0.96 - effectiveEvasion * 1.15;
  return Math.max(0.06, Math.min(0.98, rawHit));
}

/**
 * Applies a single weapon hit against a target's Shields (first) and Hull (overflow).
 * Respects `shieldDamageMultiplier` (e.g. Fighters deal `2.5x` to Shields) and
 * `hullDamageMultiplier` (e.g. Siege / Hull Breakers tear through exposed Hull).
 */
export function applyWeaponDamage(
  currentShields: number,
  currentHull: number,
  alphaDamage: number,
  shieldDamageMultiplier: number,
  hullDamageMultiplier: number,
  luckMultiplier = 1.0,
): DamageResolution {
  const effectiveAlpha = Math.max(0, alphaDamage * luckMultiplier);
  let nextShields = Math.max(0, currentShields);
  let nextHull = Math.max(0, currentHull);
  let shieldDamageDealt = 0;
  let hullDamageDealt = 0;
  let shieldsBroken = false;

  if (nextShields > 0 && effectiveAlpha > 0) {
    const safeShieldMult = Math.max(0.01, shieldDamageMultiplier);
    const maxShieldDamage = effectiveAlpha * safeShieldMult;
    if (maxShieldDamage <= nextShields) {
      shieldDamageDealt = maxShieldDamage;
      nextShields -= maxShieldDamage;
      return {
        nextShields,
        nextHull,
        shieldDamageDealt,
        hullDamageDealt: 0,
        shieldsBroken: nextShields <= 1e-6,
        destroyed: false,
      };
    }

    // Shields absorb part of the shot, then collapse and overflow remaining alpha to Hull
    const alphaUsedOnShields = nextShields / safeShieldMult;
    shieldDamageDealt = nextShields;
    nextShields = 0;
    shieldsBroken = true;

    const remainingAlpha = Math.max(0, effectiveAlpha - alphaUsedOnShields);
    hullDamageDealt = Math.min(nextHull, remainingAlpha * Math.max(0.01, hullDamageMultiplier));
    nextHull = Math.max(0, nextHull - hullDamageDealt);
  } else if (effectiveAlpha > 0) {
    hullDamageDealt = Math.min(nextHull, effectiveAlpha * Math.max(0.01, hullDamageMultiplier));
    nextHull = Math.max(0, nextHull - hullDamageDealt);
  }

  return {
    nextShields,
    nextHull,
    shieldDamageDealt,
    hullDamageDealt,
    shieldsBroken,
    destroyed: nextHull <= 1e-6,
  };
}

/**
 * Classifies a weapon profile into a visual tracer/beam tier for the 3D VFX renderer.
 */
export function classifyWeaponVisualKind(
  attackerClass: CombatShipClassId | 'pd_tower' | 'hull_breaker_tower' | 'orbital_pd' | 'orbital_heavy',
  tracking: number,
  alphaDamage: number,
): WeaponVisualKind {
  if (attackerClass === 'fighter') return 'fighter';
  if (attackerClass === 'pd_tower' || attackerClass === 'orbital_pd') return 'pd';
  if (attackerClass === 'hull_breaker_tower' || attackerClass === 'dreadnought') return 'siege';
  if (attackerClass === 'orbital_heavy') return 'heavy';
  if (tracking >= 0.88 && alphaDamage <= 25) return 'pd';
  if (alphaDamage >= 60) return 'heavy';
  return 'medium';
}

/**
 * RPS target priority score (higher = preferred target) for automated combat AI.
 */
export function scoreCombatTargetPriority(
  attackerClass: CombatShipClassId,
  targetClass: CombatShipClassId | 'harvester' | 'structure',
  targetHasShieldsUp: boolean,
  distance: number,
): number {
  let classBonus = 10;
  switch (attackerClass) {
    case 'fighter':
      // Shield breakers prioritize shielded capitals (Dreadnoughts, Carriers) and enemy Fighters
      if (targetClass === 'dreadnought') classBonus = targetHasShieldsUp ? 60 : 42;
      else if (targetClass === 'carrier') classBonus = 48;
      else if (targetClass === 'fighter') classBonus = 36;
      else if (targetClass === 'cruiser') classBonus = 24;
      else if (targetClass === 'structure') classBonus = targetHasShieldsUp ? 35 : 20;
      else classBonus = 18;
      break;
    case 'destroyer':
      // Fast flankers hunt Carriers, Harvesters, and Cruisers
      if (targetClass === 'carrier') classBonus = 60;
      else if (targetClass === 'harvester') classBonus = 46;
      else if (targetClass === 'cruiser') classBonus = 38;
      else if (targetClass === 'destroyer') classBonus = 32;
      else if (targetClass === 'fighter') classBonus = 26;
      else classBonus = 20;
      break;
    case 'cruiser':
      // Anti-fighter PD screen & Destroyer brawler
      if (targetClass === 'fighter') classBonus = 62;
      else if (targetClass === 'destroyer') classBonus = 52;
      else if (targetClass === 'cruiser') classBonus = 38;
      else if (targetClass === 'carrier') classBonus = 34;
      else classBonus = 22;
      break;
    case 'carrier':
      // Defensive PD prioritizes nearby Fighters & Destroyers threatening the carrier
      if (targetClass === 'fighter') classBonus = 55;
      else if (targetClass === 'destroyer') classBonus = 50;
      else classBonus = 20;
      break;
    case 'dreadnought':
      // Heavy siege capital crushes Cruisers, Capitals, and Structures (ignores evasive Fighters)
      if (targetClass === 'dreadnought') classBonus = 58;
      else if (targetClass === 'structure') classBonus = 54;
      else if (targetClass === 'cruiser') classBonus = 50;
      else if (targetClass === 'carrier') classBonus = 46;
      else if (targetClass === 'destroyer') classBonus = 34;
      else if (targetClass === 'fighter') classBonus = 4;
      else classBonus = 12;
      break;
  }

  return classBonus - distance * 0.08;
}
