export interface ResourceCost {
  readonly ore: number;
  readonly crystal: number;
}

export const ORBITAL_CANCEL_REFUND_RATE = 1.0;
export const ORBITAL_DECOMMISSION_REFUND_RATE = 0.5;

export type OrbitalStructureId =
  | 'command_and_control'
  | 'planetary_outpost'
  | 'orbital_dockyard'
  | 'refinery'
  | 'tech_module'
  | 'heavy_defense_platform';

export interface OrbitalStructureConfig {
  readonly id: OrbitalStructureId;
  readonly displayName: string;
  readonly shortName: string;
  readonly slotCost: 1 | 2;
  readonly cost: ResourceCost;
  readonly buildTimeSeconds: number;
  readonly maxShields: number;
  readonly maxHull: number;
  readonly shieldRegenPerSecond: number;
  readonly sensorRange: number;
  readonly supplyProvided: number;
  readonly uniqueHomeworldOnly: boolean;
  readonly spawnsFreeHarvester: boolean;
  readonly pointDefenceDps: number;
  readonly heavyWeaponDps: number;
}

export const ORBITAL_STRUCTURES: Readonly<Record<OrbitalStructureId, OrbitalStructureConfig>> = {
  command_and_control: {
    id: 'command_and_control',
    displayName: 'Command & Control (C&C)',
    shortName: 'Command & Control',
    slotCost: 2,
    cost: { ore: 0, crystal: 0 },
    buildTimeSeconds: 0,
    maxShields: 3000,
    maxHull: 8000,
    shieldRegenPerSecond: 15,
    sensorRange: 320,
    supplyProvided: 30,
    uniqueHomeworldOnly: true,
    spawnsFreeHarvester: true,
    pointDefenceDps: 35,
    heavyWeaponDps: 0,
  },
  planetary_outpost: {
    id: 'planetary_outpost',
    displayName: 'Planetary Outpost',
    shortName: 'Outpost',
    slotCost: 1,
    cost: { ore: 300, crystal: 100 },
    buildTimeSeconds: 25,
    maxShields: 800,
    maxHull: 2000,
    shieldRegenPerSecond: 8,
    sensorRange: 240,
    supplyProvided: 10,
    uniqueHomeworldOnly: false,
    spawnsFreeHarvester: false,
    pointDefenceDps: 15,
    heavyWeaponDps: 0,
  },
  orbital_dockyard: {
    id: 'orbital_dockyard',
    displayName: 'Orbital Dockyard',
    shortName: 'Orbital Dockyard',
    slotCost: 2,
    cost: { ore: 400, crystal: 150 },
    buildTimeSeconds: 30,
    maxShields: 1000,
    maxHull: 2500,
    shieldRegenPerSecond: 10,
    sensorRange: 200,
    supplyProvided: 0,
    uniqueHomeworldOnly: false,
    spawnsFreeHarvester: false,
    pointDefenceDps: 10,
    heavyWeaponDps: 0,
  },
  refinery: {
    id: 'refinery',
    displayName: 'Orbital Refinery',
    shortName: 'Refinery',
    slotCost: 1,
    cost: { ore: 250, crystal: 50 },
    buildTimeSeconds: 20,
    maxShields: 600,
    maxHull: 1600,
    shieldRegenPerSecond: 6,
    sensorRange: 180,
    supplyProvided: 0,
    uniqueHomeworldOnly: false,
    spawnsFreeHarvester: true,
    pointDefenceDps: 0,
    heavyWeaponDps: 0,
  },
  tech_module: {
    id: 'tech_module',
    displayName: 'C&C Tech & Specialization Module',
    shortName: 'Tech Module',
    slotCost: 1,
    cost: { ore: 200, crystal: 300 },
    buildTimeSeconds: 25,
    maxShields: 700,
    maxHull: 1500,
    shieldRegenPerSecond: 8,
    sensorRange: 220,
    supplyProvided: 15,
    uniqueHomeworldOnly: false,
    spawnsFreeHarvester: false,
    pointDefenceDps: 0,
    heavyWeaponDps: 0,
  },
  heavy_defense_platform: {
    id: 'heavy_defense_platform',
    displayName: 'Heavy Orbital Defense Platform',
    shortName: 'Heavy Defense',
    slotCost: 2,
    cost: { ore: 450, crystal: 300 },
    buildTimeSeconds: 35,
    maxShields: 2200,
    maxHull: 3500,
    shieldRegenPerSecond: 18,
    sensorRange: 280,
    supplyProvided: 0,
    uniqueHomeworldOnly: false,
    spawnsFreeHarvester: false,
    pointDefenceDps: 45,
    heavyWeaponDps: 65,
  },
} as const;

export type DeepSpaceStructureId =
  | 'logistics_hub'
  | 'point_defence_tower'
  | 'hull_breaker_tower';

export interface DeepSpaceStructureConfig {
  readonly id: DeepSpaceStructureId;
  readonly displayName: string;
  readonly cost: ResourceCost;
  readonly buildTimeSeconds: number;
  readonly maxShields: number;
  readonly maxHull: number;
  readonly shieldRegenPerSecond: number;
  readonly sensorRange: number;
  readonly requiresLogisticsHubRadius: boolean;
  readonly buildRadiusProvided: number;
  readonly supportsFighterOperations: boolean;
  readonly supplyProvided: number;
  readonly weaponRange: number;
  readonly weaponTracking: number; // 0.0 (no tracking) to 1.0 (instant PD tracking)
  readonly alphaDamage: number;
  readonly reloadSeconds: number;
}

export const DEEP_SPACE_STRUCTURES: Readonly<Record<DeepSpaceStructureId, DeepSpaceStructureConfig>> = {
  logistics_hub: {
    id: 'logistics_hub',
    displayName: 'Logistics Hub',
    cost: { ore: 250, crystal: 100 },
    buildTimeSeconds: 20,
    maxShields: 500,
    maxHull: 900,
    shieldRegenPerSecond: 6,
    sensorRange: 260,
    requiresLogisticsHubRadius: false,
    buildRadiusProvided: 180,
    supportsFighterOperations: true,
    supplyProvided: 15,
    weaponRange: 0,
    weaponTracking: 0,
    alphaDamage: 0,
    reloadSeconds: 0,
  },
  point_defence_tower: {
    id: 'point_defence_tower',
    displayName: 'Point Defence (PD) Tower',
    cost: { ore: 150, crystal: 50 },
    buildTimeSeconds: 14,
    maxShields: 400,
    maxHull: 850,
    shieldRegenPerSecond: 5,
    sensorRange: 220,
    requiresLogisticsHubRadius: true,
    buildRadiusProvided: 0,
    supportsFighterOperations: false,
    supplyProvided: 0,
    weaponRange: 170,
    weaponTracking: 0.95,
    alphaDamage: 18,
    reloadSeconds: 0.35,
  },
  hull_breaker_tower: {
    id: 'hull_breaker_tower',
    displayName: 'Hull Breaker Tower',
    cost: { ore: 220, crystal: 180 },
    buildTimeSeconds: 22,
    maxShields: 600,
    maxHull: 1200,
    shieldRegenPerSecond: 6,
    sensorRange: 250,
    requiresLogisticsHubRadius: true,
    buildRadiusProvided: 0,
    supportsFighterOperations: false,
    supplyProvided: 0,
    weaponRange: 240,
    weaponTracking: 0.15,
    alphaDamage: 320,
    reloadSeconds: 3.5,
  },
} as const;
