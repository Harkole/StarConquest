import type { FleetHullClassId } from '../protocol/commands.ts';
import type { AIDifficultyId } from './presets.ts';
import type { OrbitalStructureId } from './structures.ts';

export interface AIDifficultyProfile {
  readonly id: AIDifficultyId;
  readonly displayName: string;
  readonly description: string;
  readonly decisionIntervalTicks: number;
  readonly maxCommandsPerEvaluation: number;
  readonly targetHomeRefineries: number;
  readonly targetHarvestersPerDropoff: number;
  readonly maxTotalHarvesters: number;
  readonly targetDockyards: number;
  readonly targetTechModules: number;
  readonly targetHeavyDefensePlatforms: number;
  readonly secondaryExpansionAfterSeconds: number;
  readonly centralHubExpansionAfterSeconds: number;
  readonly enableDeepSpaceFortifications: boolean;
  readonly towersPerLogisticsHub: number;
  readonly attackReadinessRatio: number;
  readonly retreatPowerRatio: number;
  readonly fleetScaleMultiplier: number;
}

export const AI_DIFFICULTY_PROFILES: Readonly<
  Record<AIDifficultyId, AIDifficultyProfile>
> = {
  cadet: {
    id: 'cadet',
    displayName: 'Cadet AI',
    description:
      'Measured expansion, 1 Tech Module (Cruisers), moderate raiding fleets.',
    decisionIntervalTicks: 50,
    maxCommandsPerEvaluation: 2,
    targetHomeRefineries: 1,
    targetHarvestersPerDropoff: 2,
    maxTotalHarvesters: 4,
    targetDockyards: 1,
    targetTechModules: 1,
    targetHeavyDefensePlatforms: 0,
    secondaryExpansionAfterSeconds: 90,
    centralHubExpansionAfterSeconds: 210,
    enableDeepSpaceFortifications: false,
    towersPerLogisticsHub: 0,
    attackReadinessRatio: 0.85,
    retreatPowerRatio: 0.35,
    fleetScaleMultiplier: 0.75,
  },
  standard: {
    id: 'standard',
    displayName: 'Standard AI',
    description:
      'Balanced macro economy, full 2-Tech capital progression, Central Nexus expansion.',
    decisionIntervalTicks: 30,
    maxCommandsPerEvaluation: 3,
    targetHomeRefineries: 2,
    targetHarvestersPerDropoff: 2,
    maxTotalHarvesters: 7,
    targetDockyards: 2,
    targetTechModules: 2,
    targetHeavyDefensePlatforms: 1,
    secondaryExpansionAfterSeconds: 45,
    centralHubExpansionAfterSeconds: 110,
    enableDeepSpaceFortifications: true,
    towersPerLogisticsHub: 2,
    attackReadinessRatio: 0.75,
    retreatPowerRatio: 0.45,
    fleetScaleMultiplier: 1.0,
  },
  admiral: {
    id: 'admiral',
    displayName: 'Admiral AI',
    description:
      'Rapid multi-planet harvesting, RPS counter-fleets, wormhole Logistics Hubs & siege pushes.',
    decisionIntervalTicks: 15,
    maxCommandsPerEvaluation: 4,
    targetHomeRefineries: 2,
    targetHarvestersPerDropoff: 3,
    maxTotalHarvesters: 10,
    targetDockyards: 3,
    targetTechModules: 2,
    targetHeavyDefensePlatforms: 2,
    secondaryExpansionAfterSeconds: 20,
    centralHubExpansionAfterSeconds: 60,
    enableDeepSpaceFortifications: true,
    towersPerLogisticsHub: 3,
    attackReadinessRatio: 0.65,
    retreatPowerRatio: 0.5,
    fleetScaleMultiplier: 1.35,
  },
} as const;

export type AIOrbitalTargetScope =
  | 'homeworld'
  | 'owned_secondary_or_hub'
  | 'unclaimed_home_secondary'
  | 'unclaimed_central_hub';

export interface AIOrbitalBuildContext {
  readonly elapsedSeconds: number;
  readonly ore: number;
  readonly crystal: number;
  readonly supplyUsed: number;
  readonly supplyCap: number;
  readonly techModulesCompleted: number;
  readonly homeRefineryCount: number;
  readonly homeDockyardCount: number;
  readonly homeHeavyDefenseCount: number;
  readonly unclaimedHomePlanetCount: number;
  readonly unclaimedCentralHubPlanetCount: number;
  readonly ownedSecondaryOrHubWithoutRefineryCount: number;
  readonly ownedSecondaryOrHubWithoutDockyardCount: number;
  readonly structureCounts: Readonly<Record<OrbitalStructureId, number>>;
}

export interface AIOrbitalBuildRule {
  readonly id: string;
  readonly structureId: OrbitalStructureId;
  readonly targetScope: AIOrbitalTargetScope;
  readonly shouldBuild: (
    snapshot: AIOrbitalBuildContext,
    profile: AIDifficultyProfile,
  ) => boolean;
}

export const AI_ORBITAL_BUILD_TABLE: readonly AIOrbitalBuildRule[] = [
  {
    id: 'home_refinery_1',
    structureId: 'refinery',
    targetScope: 'homeworld',
    shouldBuild: (snapshot, profile) =>
      snapshot.homeRefineryCount < Math.min(1, profile.targetHomeRefineries),
  },
  {
    id: 'home_dockyard_1',
    structureId: 'orbital_dockyard',
    targetScope: 'homeworld',
    shouldBuild: (snapshot, profile) =>
      snapshot.homeRefineryCount >= 1 &&
      snapshot.structureCounts.orbital_dockyard <
        Math.min(1, profile.targetDockyards),
  },
  {
    id: 'home_refinery_2',
    structureId: 'refinery',
    targetScope: 'homeworld',
    shouldBuild: (snapshot, profile) =>
      snapshot.homeRefineryCount < profile.targetHomeRefineries &&
      snapshot.structureCounts.orbital_dockyard >= 1,
  },
  {
    id: 'claim_home_secondary',
    structureId: 'planetary_outpost',
    targetScope: 'unclaimed_home_secondary',
    shouldBuild: (snapshot, profile) =>
      snapshot.elapsedSeconds >= profile.secondaryExpansionAfterSeconds &&
      snapshot.unclaimedHomePlanetCount > 0 &&
      snapshot.structureCounts.orbital_dockyard >= 1,
  },
  {
    id: 'secondary_or_hub_refinery',
    structureId: 'refinery',
    targetScope: 'owned_secondary_or_hub',
    shouldBuild: (snapshot) =>
      snapshot.ownedSecondaryOrHubWithoutRefineryCount > 0,
  },
  {
    id: 'tech_module_1',
    structureId: 'tech_module',
    targetScope: 'homeworld',
    shouldBuild: (snapshot, profile) =>
      profile.targetTechModules >= 1 &&
      snapshot.structureCounts.tech_module < 1 &&
      snapshot.structureCounts.orbital_dockyard >= 1,
  },
  {
    id: 'claim_central_hub',
    structureId: 'planetary_outpost',
    targetScope: 'unclaimed_central_hub',
    shouldBuild: (snapshot, profile) =>
      snapshot.elapsedSeconds >= profile.centralHubExpansionAfterSeconds &&
      snapshot.unclaimedCentralHubPlanetCount > 0 &&
      snapshot.structureCounts.orbital_dockyard >= 1,
  },
  {
    id: 'dockyard_expansion',
    structureId: 'orbital_dockyard',
    targetScope: 'owned_secondary_or_hub',
    shouldBuild: (snapshot, profile) =>
      snapshot.structureCounts.orbital_dockyard < profile.targetDockyards &&
      (snapshot.ownedSecondaryOrHubWithoutDockyardCount > 0 ||
        snapshot.homeDockyardCount < profile.targetDockyards),
  },
  {
    id: 'tech_module_2',
    structureId: 'tech_module',
    targetScope: 'homeworld',
    shouldBuild: (snapshot, profile) =>
      profile.targetTechModules >= 2 &&
      snapshot.structureCounts.tech_module < 2 &&
      snapshot.structureCounts.orbital_dockyard >= 1,
  },
  {
    id: 'heavy_defense_platform',
    structureId: 'heavy_defense_platform',
    targetScope: 'homeworld',
    shouldBuild: (snapshot, profile) =>
      snapshot.structureCounts.heavy_defense_platform <
        profile.targetHeavyDefensePlatforms &&
      snapshot.structureCounts.orbital_dockyard >= 1,
  },
] as const;

export interface AIFleetDoctrineStage {
  readonly minTechModules: number;
  readonly baseDesiredCounts: Readonly<Record<FleetHullClassId, number>>;
}

export const AI_FLEET_DOCTRINE_TABLE: readonly AIFleetDoctrineStage[] = [
  {
    minTechModules: 0,
    baseDesiredCounts: {
      destroyer: 4,
      cruiser: 0,
      carrier: 0,
      dreadnought: 0,
    },
  },
  {
    minTechModules: 1,
    baseDesiredCounts: {
      destroyer: 4,
      cruiser: 3,
      carrier: 0,
      dreadnought: 0,
    },
  },
  {
    minTechModules: 2,
    baseDesiredCounts: {
      destroyer: 4,
      cruiser: 3,
      carrier: 1,
      dreadnought: 1,
    },
  },
] as const;

