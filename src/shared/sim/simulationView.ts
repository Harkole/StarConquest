import {
  DEEP_SPACE_STRUCTURES,
  MATCH_PRESETS,
  PLANET_CLASSES,
  type DeepSpaceStructureId,
  type MatchPresetId,
  type MatchSetupConfig,
} from '../config/index.ts';
import type { PlayerSlotId, Vector2D } from '../protocol/commands.ts';
import type { GalaxyTopology } from './galaxy.ts';
import type { PlayerSystemView } from './playerIntel.ts';
import type {
  CombatShipUnitState,
  CombatVisualEvent,
  CommandResult,
  DeepSpaceStructureInstance,
  FleetInstance,
  HarvesterUnitState,
  MatchOutcomeState,
  OrbitalStructureInstance,
  PlanetRuntimeState,
  PlayerEconomyState,
} from './gameSimulation.ts';

export const VIEW_REFINERY_UNLOAD_RATE_PER_SECOND = 10;
export const VIEW_CNC_UNLOAD_RATE_PER_SECOND = 4;
export const VIEW_MIN_DEEP_SPACE_PLANET_CLEARANCE_BUFFER = 24;
export const VIEW_MIN_DEEP_SPACE_WORMHOLE_CLEARANCE = 45;
export const VIEW_MIN_LOGISTICS_HUB_SPACING = 120;
export const VIEW_MIN_HUB_TO_TOWER_SPACING = 42;
export const VIEW_MIN_TOWER_TO_TOWER_SPACING = 30;

export function getMinDeepSpaceStructureSpacingPure(
  a: DeepSpaceStructureId,
  b: DeepSpaceStructureId,
): number {
  if (a === 'logistics_hub' && b === 'logistics_hub') {
    return VIEW_MIN_LOGISTICS_HUB_SPACING;
  }
  if (a === 'logistics_hub' || b === 'logistics_hub') {
    return VIEW_MIN_HUB_TO_TOWER_SPACING;
  }
  return VIEW_MIN_TOWER_TO_TOWER_SPACING;
}

export interface SimulationView {
  readonly presetId: MatchPresetId;
  readonly galaxy: GalaxyTopology;
  readonly currentTick: number;
  readonly elapsedSeconds: number;

  getMatchSetup(): MatchSetupConfig;
  getMatchOutcome(): MatchOutcomeState;
  getPlayerState(playerId: PlayerSlotId): PlayerEconomyState;
  isPlayerInActiveCombat(playerId: PlayerSlotId, windowSeconds?: number): boolean;
  isPlayerDefeated(playerId: PlayerSlotId): boolean;
  getPlayerSystemView(viewerId: PlayerSlotId, systemId: string): PlayerSystemView;
  consumeCombatEvents(viewerId?: PlayerSlotId): CombatVisualEvent[];

  getFleetsForPlayer(playerId: PlayerSlotId): readonly FleetInstance[];
  getFleetById(fleetId: string): FleetInstance | undefined;
  getShipsInFleet(fleetId: string): readonly CombatShipUnitState[];
  getFleetLiveAnchor(
    fleetId: string,
  ): { readonly systemId: string; readonly position: Vector2D } | null;

  getPlanetState(planetId: string): PlanetRuntimeState;
  getPlanetsInSystem(systemId: string): readonly PlanetRuntimeState[];
  getStructureById(
    structureId: string,
  ): { readonly planetState: PlanetRuntimeState; readonly structure: OrbitalStructureInstance } | undefined;
  getDeepSpaceStructureById(structureId: string): DeepSpaceStructureInstance | undefined;
  getCombatShipById(shipId: string): CombatShipUnitState | undefined;
  getHarvesterById(harvesterId: string): HarvesterUnitState | undefined;
  getPlayerTechModuleCount(playerId: PlayerSlotId): number;

  validateDeepSpacePlacement(
    playerId: PlayerSlotId,
    systemId: string,
    position: Vector2D,
    structureId: DeepSpaceStructureId,
  ): CommandResult;
  getMaxConcurrentDocks(structure: OrbitalStructureInstance): number;
  getPlatformUnloadRatePerSecond(structure: OrbitalStructureInstance): number;
}

export function computeFleetLiveAnchor(
  fleet: FleetInstance,
  members: readonly CombatShipUnitState[],
): { readonly systemId: string; readonly position: Vector2D } {
  if (members.length === 0) {
    return {
      systemId: fleet.orderSystemId,
      position: fleet.orderPosition,
    };
  }
  if (members.length === 1) {
    const only = members[0]!;
    return {
      systemId: only.currentSystemId,
      position: { x: only.position.x, z: only.position.z },
    };
  }

  const bySystem = new Map<string, CombatShipUnitState[]>();
  for (const m of members) {
    const list = bySystem.get(m.currentSystemId);
    if (list) {
      list.push(m);
    } else {
      bySystem.set(m.currentSystemId, [m]);
    }
  }
  let bestSystemId = members[0]!.currentSystemId;
  let group: CombatShipUnitState[] = [];
  for (const [sysId, list] of bySystem.entries()) {
    if (
      list.length > group.length ||
      (list.length === group.length && sysId === fleet.orderSystemId)
    ) {
      bestSystemId = sysId;
      group = list;
    }
  }
  if (group.length === 1) {
    const only = group[0]!;
    return {
      systemId: bestSystemId,
      position: { x: only.position.x, z: only.position.z },
    };
  }

  const CLUSTER_RADIUS = 140;
  let bestCluster: CombatShipUnitState[] = [group[0]!];
  let bestClusterOrderDist = Infinity;

  for (const seed of group) {
    const cluster = group.filter(
      (other) =>
        Math.hypot(
          other.position.x - seed.position.x,
          other.position.z - seed.position.z,
        ) <= CLUSTER_RADIUS,
    );
    let cx = 0;
    let cz = 0;
    for (const s of cluster) {
      cx += s.position.x;
      cz += s.position.z;
    }
    cx /= cluster.length;
    cz /= cluster.length;
    const distToOrder = Math.hypot(
      cx - fleet.orderPosition.x,
      cz - fleet.orderPosition.z,
    );
    if (
      cluster.length > bestCluster.length ||
      (cluster.length === bestCluster.length && distToOrder < bestClusterOrderDist)
    ) {
      bestCluster = cluster;
      bestClusterOrderDist = distToOrder;
    }
  }

  let sumX = 0;
  let sumZ = 0;
  for (const m of bestCluster) {
    sumX += m.position.x;
    sumZ += m.position.z;
  }
  return {
    systemId: bestSystemId,
    position: { x: sumX / bestCluster.length, z: sumZ / bestCluster.length },
  };
}

export function getPlatformUnloadRateForPreset(
  presetId: MatchPresetId,
  structure: OrbitalStructureInstance,
): number {
  const multiplier = MATCH_PRESETS[presetId].harvestRateMultiplier;
  if (structure.structureId === 'refinery') {
    return VIEW_REFINERY_UNLOAD_RATE_PER_SECOND * multiplier;
  }
  if (structure.structureId === 'command_and_control') {
    return VIEW_CNC_UNLOAD_RATE_PER_SECOND * multiplier;
  }
  return 0;
}

export function getMaxConcurrentDocksForPreset(
  presetId: MatchPresetId,
  structure: OrbitalStructureInstance,
): number {
  if (structure.structureId === 'refinery') {
    return MATCH_PRESETS[presetId].refineryMaxConcurrentDocks;
  }
  if (structure.structureId === 'command_and_control') {
    return MATCH_PRESETS[presetId].cncMaxConcurrentDocks;
  }
  return 0;
}

export function validateDeepSpacePlacementPure(params: {
  readonly player: PlayerEconomyState | undefined;
  readonly galaxy: GalaxyTopology;
  readonly playerId: PlayerSlotId;
  readonly systemId: string;
  readonly position: Vector2D;
  readonly structureId: DeepSpaceStructureId;
  readonly existingInSystem: readonly DeepSpaceStructureInstance[];
}): CommandResult {
  const {
    player,
    galaxy,
    playerId,
    systemId,
    position,
    structureId,
    existingInSystem,
  } = params;

  const system = galaxy.systems.find((s) => s.id === systemId);
  if (!player || !system) {
    return { ok: false, reason: 'Invalid player or star system' };
  }

  const config = DEEP_SPACE_STRUCTURES[structureId];
  if (!config) {
    return { ok: false, reason: 'Unknown deep-space structure type' };
  }

  if (!Number.isFinite(position.x) || !Number.isFinite(position.z)) {
    return { ok: false, reason: 'Invalid placement coordinates' };
  }

  for (const planet of system.planets) {
    const orbitalRingRadius =
      PLANET_CLASSES[planet.planetClass].radiusUnits * 1.52;
    const minClearance =
      orbitalRingRadius + VIEW_MIN_DEEP_SPACE_PLANET_CLEARANCE_BUFFER;
    const distToPlanet = Math.hypot(
      position.x - planet.position.x,
      position.z - planet.position.z,
    );
    if (distToPlanet < minClearance) {
      return {
        ok: false,
        reason: `Too close to ${planet.name} orbital ring (requires ${Math.ceil(minClearance)}u clearance)`,
      };
    }
  }

  for (const wormhole of galaxy.wormholes) {
    const mouthPos =
      wormhole.fromSystemId === systemId
        ? wormhole.fromPosition
        : wormhole.toSystemId === systemId
          ? wormhole.toPosition
          : null;
    if (mouthPos) {
      const distToWormhole = Math.hypot(
        position.x - mouthPos.x,
        position.z - mouthPos.z,
      );
      if (distToWormhole < VIEW_MIN_DEEP_SPACE_WORMHOLE_CLEARANCE) {
        return {
          ok: false,
          reason: `Too close to wormhole mouth (requires ${VIEW_MIN_DEEP_SPACE_WORMHOLE_CLEARANCE}u clearance)`,
        };
      }
    }
  }

  for (const existing of existingInSystem) {
    const requiredSpacing = getMinDeepSpaceStructureSpacingPure(
      structureId,
      existing.structureId,
    );
    const dist = Math.hypot(
      position.x - existing.position.x,
      position.z - existing.position.z,
    );
    if (dist < requiredSpacing) {
      const existingName = DEEP_SPACE_STRUCTURES[existing.structureId].displayName;
      return {
        ok: false,
        reason: `Too close to an existing ${existingName} (requires ${requiredSpacing}u spacing)`,
      };
    }
  }

  if (config.requiresLogisticsHubRadius) {
    const hubConfig = DEEP_SPACE_STRUCTURES.logistics_hub;
    const insideFriendlyHub = existingInSystem.some(
      (s) =>
        s.structureId === 'logistics_hub' &&
        s.ownerId === playerId &&
        s.isComplete &&
        Math.hypot(position.x - s.position.x, position.z - s.position.z) <=
          hubConfig.buildRadiusProvided,
    );
    if (!insideFriendlyHub) {
      return {
        ok: false,
        reason: `Requires placement within a completed friendly Logistics Hub radius (${hubConfig.buildRadiusProvided}u)`,
      };
    }
  }

  if (player.ore < config.cost.ore || player.crystal < config.cost.crystal) {
    return { ok: false, reason: 'Insufficient Ore or Crystals' };
  }

  return { ok: true };
}
