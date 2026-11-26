import type { ResourceCost } from './structures.ts';

export type CombatShipClassId =
  | 'fighter'
  | 'destroyer'
  | 'cruiser'
  | 'carrier'
  | 'dreadnought';

export const CNC_EMERGENCY_HARVESTER_REBUILD_SECONDS = 25;

export type ShipClassId = CombatShipClassId | 'harvester';

export interface ShipWeaponProfile {
  readonly name: string;
  readonly range: number;
  readonly tracking: number; // 0.0 (slow capital siege) to 1.0 (instant point defence)
  readonly alphaDamage: number;
  readonly reloadSeconds: number;
  readonly shieldDamageMultiplier: number;
  readonly hullDamageMultiplier: number;
  /** 'forward' weapons require bow alignment and prioritize capitals/structures; defaults to 'turret'. */
  readonly firingArc?: 'forward' | 'turret';
}

export interface ShipClassConfig {
  readonly id: ShipClassId;
  readonly displayName: string;
  readonly cost: ResourceCost;
  readonly buildTimeSeconds: number;
  readonly supplyCost: number;
  readonly hasShields: boolean;
  readonly maxShields: number;
  readonly shieldRegenPerSecond: number;
  readonly maxHull: number;
  readonly speed: number;
  readonly evasionRating: number; // 0.0 to 1.0 — checked against attacker tracking
  readonly dogfightLuckVariance: number; // Random +/- variance in Fighter-vs-Fighter dogfights
  readonly sensorRange: number;
  readonly requiresCarrierOrLogisticsHub: boolean;
  readonly fighterSquadronCapacity: number;
  readonly requiredTechModuleCount: number;
  readonly weapons: readonly ShipWeaponProfile[];
}

export const SHIP_CLASSES: Readonly<Record<ShipClassId, ShipClassConfig>> = {
  fighter: {
    id: 'fighter',
    displayName: 'Fighter Squadron',
    cost: { ore: 60, crystal: 15 },
    buildTimeSeconds: 7,
    supplyCost: 1,
    hasShields: false,
    maxShields: 0,
    shieldRegenPerSecond: 0,
    maxHull: 110,
    speed: 95,
    evasionRating: 0.85,
    dogfightLuckVariance: 0.25,
    sensorRange: 100,
    requiresCarrierOrLogisticsHub: true,
    fighterSquadronCapacity: 0,
    requiredTechModuleCount: 0,
    weapons: [
      {
        name: 'Shield-Breaker Pulse Blasters',
        range: 80,
        tracking: 0.88,
        alphaDamage: 16,
        reloadSeconds: 0.6,
        shieldDamageMultiplier: 2.5,
        hullDamageMultiplier: 1.0,
      },
    ],
  },
  destroyer: {
    id: 'destroyer',
    displayName: 'Destroyer',
    cost: { ore: 140, crystal: 40 },
    buildTimeSeconds: 12,
    supplyCost: 2,
    hasShields: false,
    maxShields: 0,
    shieldRegenPerSecond: 0,
    maxHull: 420,
    speed: 68,
    evasionRating: 0.55,
    dogfightLuckVariance: 0.05,
    sensorRange: 162.5,
    requiresCarrierOrLogisticsHub: false,
    fighterSquadronCapacity: 0,
    requiredTechModuleCount: 0,
    weapons: [
      {
        name: 'Medium Anti-Ship Autoloaders',
        range: 130,
        tracking: 0.65,
        alphaDamage: 48,
        reloadSeconds: 1.2,
        shieldDamageMultiplier: 1.1,
        hullDamageMultiplier: 1.35,
      },
      {
        name: 'Light Flak Point Defence',
        range: 105,
        tracking: 0.92,
        alphaDamage: 10,
        reloadSeconds: 0.5,
        shieldDamageMultiplier: 0.8,
        hullDamageMultiplier: 1.0,
      },
    ],
  },
  cruiser: {
    id: 'cruiser',
    displayName: 'Cruiser',
    cost: { ore: 260, crystal: 140 },
    buildTimeSeconds: 20,
    supplyCost: 4,
    hasShields: true,
    maxShields: 450,
    shieldRegenPerSecond: 8,
    maxHull: 750,
    speed: 44,
    evasionRating: 0.3,
    dogfightLuckVariance: 0,
    sensorRange: 206.25,
    requiresCarrierOrLogisticsHub: false,
    fighterSquadronCapacity: 0,
    requiredTechModuleCount: 1,
    weapons: [
      {
        name: 'Rapid Point Defence Arrays',
        range: 145,
        tracking: 0.96,
        alphaDamage: 22,
        reloadSeconds: 0.35,
        shieldDamageMultiplier: 0.9,
        hullDamageMultiplier: 1.2,
      },
      {
        name: 'Dual Heavy Turrets',
        range: 165,
        tracking: 0.55,
        alphaDamage: 65,
        reloadSeconds: 1.6,
        shieldDamageMultiplier: 1.0,
        hullDamageMultiplier: 1.1,
      },
    ],
  },
  carrier: {
    id: 'carrier',
    displayName: 'Fleet Carrier',
    cost: { ore: 380, crystal: 320 },
    buildTimeSeconds: 30,
    supplyCost: 6,
    hasShields: true,
    maxShields: 700,
    shieldRegenPerSecond: 10,
    maxHull: 1100,
    speed: 28,
    evasionRating: 0.15,
    dogfightLuckVariance: 0,
    sensorRange: 137.5,
    requiresCarrierOrLogisticsHub: false,
    fighterSquadronCapacity: 4,
    requiredTechModuleCount: 2,
    weapons: [
      {
        name: 'Defensive Point Defence Grid',
        range: 110,
        tracking: 0.85,
        alphaDamage: 8,
        reloadSeconds: 0.6,
        shieldDamageMultiplier: 0.8,
        hullDamageMultiplier: 0.9,
      },
    ],
  },
  dreadnought: {
    id: 'dreadnought',
    displayName: 'Dreadnought',
    cost: { ore: 550, crystal: 480 },
    buildTimeSeconds: 38,
    supplyCost: 8,
    hasShields: true,
    maxShields: 1400,
    shieldRegenPerSecond: 14,
    maxHull: 2400,
    speed: 18,
    evasionRating: 0.05,
    dogfightLuckVariance: 0,
    sensorRange: 300,
    requiresCarrierOrLogisticsHub: false,
    fighterSquadronCapacity: 0,
    requiredTechModuleCount: 2,
    weapons: [
      {
        name: 'Spinal Siege Batteries',
        range: 240,
        tracking: 0.14,
        alphaDamage: 280,
        reloadSeconds: 3.2,
        shieldDamageMultiplier: 1.25,
        hullDamageMultiplier: 1.65,
        firingArc: 'forward',
      },
      {
        name: 'Dorsal & Broadside Heavy Turrets',
        range: 210,
        tracking: 0.34,
        alphaDamage: 115,
        reloadSeconds: 1.8,
        shieldDamageMultiplier: 1.15,
        hullDamageMultiplier: 1.35,
        firingArc: 'turret',
      },
    ],
  },
  harvester: {
    id: 'harvester',
    displayName: 'Resource Harvester',
    cost: { ore: 100, crystal: 20 },
    buildTimeSeconds: 9,
    supplyCost: 0,
    hasShields: false,
    maxShields: 0,
    shieldRegenPerSecond: 0,
    maxHull: 300,
    speed: 38,
    evasionRating: 0.2,
    dogfightLuckVariance: 0,
    sensorRange: 140,
    requiresCarrierOrLogisticsHub: false,
    fighterSquadronCapacity: 0,
    requiredTechModuleCount: 0,
    weapons: [],
  },
} as const;
