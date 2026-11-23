import {
  DEEP_SPACE_STRUCTURES,
  MATCH_PRESETS,
  ORBITAL_STRUCTURES,
  PLAYER_SLOT_IDS,
  SHIP_CLASSES,
  type DeepSpaceStructureId,
  type FogOfWarMode,
  type MatchPresetId,
  type OrbitalStructureId,
} from '../config/index.ts';
import type { PlayerSlotId, Vector2D } from '../protocol/commands.ts';
import type { GalaxyTopology, PlanetNode } from './galaxy.ts';
import type {
  AsteroidMiningBeltNode,
  CombatShipUnitState,
  DeepSpaceStructureInstance,
  HarvesterUnitState,
  OrbitalStructureInstance,
  PlanetRuntimeState,
  SystemResourceSummary,
} from './gameSimulation.ts';

export interface SensorCircle {
  readonly sourceId: string;
  readonly systemId: string;
  readonly position: Vector2D;
  readonly range: number;
}

export type SystemSensorCoverage =
  | { readonly kind: 'unexplored' }
  | { readonly kind: 'full_system' }
  | { readonly kind: 'circles'; readonly circles: readonly SensorCircle[] };

export type ProjectedOrbitalStructure =
  | { readonly kind: 'live'; readonly structure: OrbitalStructureInstance }
  | {
      readonly kind: 'ghost';
      readonly id: string;
      readonly structureId: OrbitalStructureId;
      readonly ownerId: PlayerSlotId;
      readonly planetId: string;
      readonly primarySlotIndex: number;
      readonly occupiedSlots: readonly number[];
      readonly isComplete: boolean;
      readonly buildProgressSeconds: number;
      readonly totalBuildTimeSeconds: number;
      readonly shields: number;
      readonly hull: number;
      readonly observedAtSeconds: number;
    };

export type ProjectedDeepSpaceStructure =
  | { readonly kind: 'live'; readonly structure: DeepSpaceStructureInstance }
  | {
      readonly kind: 'ghost';
      readonly id: string;
      readonly structureId: DeepSpaceStructureId;
      readonly ownerId: PlayerSlotId;
      readonly systemId: string;
      readonly position: Vector2D;
      readonly isComplete: boolean;
      readonly buildProgressSeconds: number;
      readonly totalBuildTimeSeconds: number;
      readonly shields: number;
      readonly hull: number;
      readonly observedAtSeconds: number;
    };

export interface ProjectedPlanetView {
  readonly planet: PlanetNode;
  readonly visibility: 'live' | 'last_known' | 'unexplored';
  readonly ownerId: PlayerSlotId | null;
  readonly structures: readonly ProjectedOrbitalStructure[];
  readonly observedAtSeconds: number | null;
}

export interface ProjectedBeltView {
  readonly belt: AsteroidMiningBeltNode;
  readonly visibility: 'live' | 'last_known' | 'unexplored';
  readonly observedRemainingReserves: number;
}

export interface PlayerSystemView {
  readonly viewerId: PlayerSlotId;
  readonly systemId: string;
  readonly fogMode: FogOfWarMode;
  readonly coverage: SystemSensorCoverage;
  readonly isExplored: boolean;
  readonly planets: readonly ProjectedPlanetView[];
  readonly deepSpaceStructures: readonly ProjectedDeepSpaceStructure[];
  readonly combatShips: readonly CombatShipUnitState[];
  readonly harvesters: readonly HarvesterUnitState[];
  readonly miningBelts: readonly ProjectedBeltView[];
  readonly resourceSummary: SystemResourceSummary | null;
}

export interface IntelSimulationSource {
  readonly presetId: MatchPresetId;
  readonly galaxy: GalaxyTopology;
  readonly elapsedSeconds: number;
  getPlanetsInSystem(systemId: string): readonly PlanetRuntimeState[];
  getDeepSpaceStructuresInSystem(systemId: string): readonly DeepSpaceStructureInstance[];
  getCombatShipsInSystem(systemId: string): readonly CombatShipUnitState[];
  getHarvestersInSystem(systemId: string): readonly HarvesterUnitState[];
  getMiningBeltsInSystem(systemId: string): readonly AsteroidMiningBeltNode[];
  getSystemResourceSummary(systemId: string): SystemResourceSummary;
}

type GhostOrbitalData = Omit<Extract<ProjectedOrbitalStructure, { readonly kind: 'ghost' }>, 'kind'>;
type GhostDeepSpaceData = Omit<Extract<ProjectedDeepSpaceStructure, { readonly kind: 'ghost' }>, 'kind'>;

interface LastKnownPlanetRecord {
  ownerId: PlayerSlotId | null;
  observedAtSeconds: number;
  structures: Map<string, GhostOrbitalData>;
}

interface PlayerIntelMemory {
  readonly exploredSystems: Set<string>;
  readonly lastKnownPlanetById: Map<string, LastKnownPlanetRecord>;
  readonly lastKnownDeepSpaceBySystem: Map<string, Map<string, GhostDeepSpaceData>>;
  readonly lastKnownBeltReservesById: Map<string, number>;
}

function createPlayerIntelMemory(): PlayerIntelMemory {
  return {
    exploredSystems: new Set<string>(),
    lastKnownPlanetById: new Map<string, LastKnownPlanetRecord>(),
    lastKnownDeepSpaceBySystem: new Map<string, Map<string, GhostDeepSpaceData>>(),
    lastKnownBeltReservesById: new Map<string, number>(),
  };
}

function toGhostOrbital(
  structure: OrbitalStructureInstance,
  observedAtSeconds: number,
): GhostOrbitalData {
  return {
    id: structure.id,
    structureId: structure.structureId,
    ownerId: structure.ownerId,
    planetId: structure.planetId,
    primarySlotIndex: structure.primarySlotIndex,
    occupiedSlots: [...structure.occupiedSlots],
    isComplete: structure.isComplete,
    buildProgressSeconds: structure.buildProgressSeconds,
    totalBuildTimeSeconds: structure.totalBuildTimeSeconds,
    shields: structure.shields,
    hull: structure.hull,
    observedAtSeconds,
  };
}

function toGhostDeepSpace(
  structure: DeepSpaceStructureInstance,
  observedAtSeconds: number,
): GhostDeepSpaceData {
  return {
    id: structure.id,
    structureId: structure.structureId,
    ownerId: structure.ownerId,
    systemId: structure.systemId,
    position: { x: structure.position.x, z: structure.position.z },
    isComplete: structure.isComplete,
    buildProgressSeconds: structure.buildProgressSeconds,
    totalBuildTimeSeconds: structure.totalBuildTimeSeconds,
    shields: structure.shields,
    hull: structure.hull,
    observedAtSeconds,
  };
}

/** Returns true if `pos` falls within the given system sensor coverage. */
export function isPointVisible(coverage: SystemSensorCoverage, pos: Vector2D): boolean {
  switch (coverage.kind) {
    case 'unexplored':
      return false;
    case 'full_system':
      return true;
    case 'circles':
      for (const circle of coverage.circles) {
        const dx = pos.x - circle.position.x;
        const dz = pos.z - circle.position.z;
        if (dx * dx + dz * dz <= circle.range * circle.range) {
          return true;
        }
      }
      return false;
  }
}

/** Tracks per-player sensor coverage, explored systems, and last-known-intel snapshots. */
export class PlayerIntelRegistry {
  private readonly memoryByPlayer = new Map<PlayerSlotId, PlayerIntelMemory>();

  constructor() {
    for (const slotId of PLAYER_SLOT_IDS) {
      this.memoryByPlayer.set(slotId, createPlayerIntelMemory());
    }
  }

  private getMemory(playerId: PlayerSlotId): PlayerIntelMemory {
    let memory = this.memoryByPlayer.get(playerId);
    if (!memory) {
      memory = createPlayerIntelMemory();
      this.memoryByPlayer.set(playerId, memory);
    }
    return memory;
  }

  private collectSensorCircles(
    sim: IntelSimulationSource,
    viewerId: PlayerSlotId,
    systemId: string,
  ): SensorCircle[] {
    const circles: SensorCircle[] = [];

    for (const ship of sim.getCombatShipsInSystem(systemId)) {
      if (ship.ownerId === viewerId && ship.hull > 0) {
        circles.push({
          sourceId: ship.id,
          systemId,
          position: ship.position,
          range: SHIP_CLASSES[ship.shipClassId].sensorRange,
        });
      }
    }

    for (const harvester of sim.getHarvestersInSystem(systemId)) {
      if (harvester.ownerId === viewerId && harvester.hull > 0) {
        circles.push({
          sourceId: harvester.id,
          systemId,
          position: harvester.position,
          range: SHIP_CLASSES.harvester.sensorRange,
        });
      }
    }

    for (const planetState of sim.getPlanetsInSystem(systemId)) {
      for (const structure of planetState.structures) {
        if (structure.ownerId === viewerId && structure.hull > 0) {
          circles.push({
            sourceId: structure.id,
            systemId,
            position: planetState.planet.position,
            range: ORBITAL_STRUCTURES[structure.structureId].sensorRange,
          });
        }
      }
    }

    for (const ds of sim.getDeepSpaceStructuresInSystem(systemId)) {
      if (ds.ownerId === viewerId && ds.hull > 0) {
        circles.push({
          sourceId: ds.id,
          systemId,
          position: ds.position,
          range: DEEP_SPACE_STRUCTURES[ds.structureId].sensorRange,
        });
      }
    }

    return circles;
  }

  private computeCoverage(
    sim: IntelSimulationSource,
    viewerId: PlayerSlotId,
    systemId: string,
    fogMode: FogOfWarMode,
    memory: PlayerIntelMemory,
  ): SystemSensorCoverage {
    if (systemId === 'system_battle_void') {
      return { kind: 'full_system' };
    }
    const circles = this.collectSensorCircles(sim, viewerId, systemId);
    const hasFriendlyPresence =
      circles.length > 0 ||
      sim.getPlanetsInSystem(systemId).some((p) => p.ownerId === viewerId);

    if (hasFriendlyPresence) {
      memory.exploredSystems.add(systemId);
    }

    if (fogMode === 'open_occupied_systems') {
      if (hasFriendlyPresence) {
        return { kind: 'full_system' };
      }
      return memory.exploredSystems.has(systemId)
        ? { kind: 'circles', circles: [] }
        : { kind: 'unexplored' };
    }

    if (circles.length > 0) {
      return { kind: 'circles', circles };
    }
    return memory.exploredSystems.has(systemId)
      ? { kind: 'circles', circles: [] }
      : { kind: 'unexplored' };
  }

  /** Refreshes explored flags and last-known-intel caches for all players across all systems. */
  public updateTick(sim: IntelSimulationSource): void {
    const fogMode = MATCH_PRESETS[sim.presetId].fogOfWarMode;
    const now = sim.elapsedSeconds;

    for (const viewerId of PLAYER_SLOT_IDS) {
      const memory = this.getMemory(viewerId);

      for (const system of sim.galaxy.systems) {
        const coverage = this.computeCoverage(sim, viewerId, system.id, fogMode, memory);

        for (const planetState of sim.getPlanetsInSystem(system.id)) {
          const isPlanetVisible =
            planetState.ownerId === viewerId ||
            isPointVisible(coverage, planetState.planet.position);

          if (isPlanetVisible) {
            const structureMap = new Map<string, GhostOrbitalData>();
            for (const structure of planetState.structures) {
              if (structure.hull > 0) {
                structureMap.set(structure.id, toGhostOrbital(structure, now));
              }
            }
            memory.lastKnownPlanetById.set(planetState.planet.id, {
              ownerId: planetState.ownerId,
              observedAtSeconds: now,
              structures: structureMap,
            });
          }
        }

        let dsCache = memory.lastKnownDeepSpaceBySystem.get(system.id);
        if (!dsCache) {
          dsCache = new Map<string, GhostDeepSpaceData>();
          memory.lastKnownDeepSpaceBySystem.set(system.id, dsCache);
        }

        const visibleLiveDsIds = new Set<string>();
        for (const ds of sim.getDeepSpaceStructuresInSystem(system.id)) {
          if (ds.hull <= 0) continue;
          if (ds.ownerId === viewerId || isPointVisible(coverage, ds.position)) {
            visibleLiveDsIds.add(ds.id);
            dsCache.set(ds.id, toGhostDeepSpace(ds, now));
          }
        }

        for (const [ghostId, ghost] of dsCache) {
          if (!visibleLiveDsIds.has(ghostId) && isPointVisible(coverage, ghost.position)) {
            dsCache.delete(ghostId);
          }
        }

        for (const belt of sim.getMiningBeltsInSystem(system.id)) {
          if (isPointVisible(coverage, belt.position)) {
            memory.lastKnownBeltReservesById.set(belt.id, belt.remainingReserves);
          }
        }
      }
    }
  }

  public isPositionVisibleToPlayer(
    sim: IntelSimulationSource,
    viewerId: PlayerSlotId,
    systemId: string,
    pos: Vector2D,
  ): boolean {
    const fogMode = MATCH_PRESETS[sim.presetId].fogOfWarMode;
    const memory = this.getMemory(viewerId);
    const coverage = this.computeCoverage(sim, viewerId, systemId, fogMode, memory);
    return isPointVisible(coverage, pos);
  }

  public getPlayerSystemView(
    sim: IntelSimulationSource,
    viewerId: PlayerSlotId,
    systemId: string,
  ): PlayerSystemView {
    const fogMode = MATCH_PRESETS[sim.presetId].fogOfWarMode;
    const memory = this.getMemory(viewerId);
    const coverage = this.computeCoverage(sim, viewerId, systemId, fogMode, memory);
    const isExplored = coverage.kind !== 'unexplored';

    const planets: ProjectedPlanetView[] = [];
    for (const planetState of sim.getPlanetsInSystem(systemId)) {
      const isVisible =
        planetState.ownerId === viewerId ||
        isPointVisible(coverage, planetState.planet.position);

      if (isVisible) {
        planets.push({
          planet: planetState.planet,
          visibility: 'live',
          ownerId: planetState.ownerId,
          structures: planetState.structures
            .filter((s) => s.hull > 0)
            .map((structure) => ({ kind: 'live', structure })),
          observedAtSeconds: sim.elapsedSeconds,
        });
      } else {
        const lastKnown = memory.lastKnownPlanetById.get(planetState.planet.id);
        if (lastKnown) {
          planets.push({
            planet: planetState.planet,
            visibility: 'last_known',
            ownerId: lastKnown.ownerId,
            structures: Array.from(lastKnown.structures.values()).map((ghost) => ({
              kind: 'ghost',
              ...ghost,
            })),
            observedAtSeconds: lastKnown.observedAtSeconds,
          });
        } else {
          planets.push({
            planet: planetState.planet,
            visibility: 'unexplored',
            ownerId: null,
            structures: [],
            observedAtSeconds: null,
          });
        }
      }
    }

    const deepSpaceStructures: ProjectedDeepSpaceStructure[] = [];
    const visibleLiveDsIds = new Set<string>();
    for (const ds of sim.getDeepSpaceStructuresInSystem(systemId)) {
      if (ds.hull <= 0) continue;
      if (ds.ownerId === viewerId || isPointVisible(coverage, ds.position)) {
        visibleLiveDsIds.add(ds.id);
        deepSpaceStructures.push({ kind: 'live', structure: ds });
      }
    }

    const dsCache = memory.lastKnownDeepSpaceBySystem.get(systemId);
    if (dsCache) {
      for (const ghost of dsCache.values()) {
        if (!visibleLiveDsIds.has(ghost.id)) {
          deepSpaceStructures.push({ kind: 'ghost', ...ghost });
        }
      }
    }

    const combatShips = sim
      .getCombatShipsInSystem(systemId)
      .filter(
        (ship) =>
          ship.hull > 0 &&
          (ship.ownerId === viewerId || isPointVisible(coverage, ship.position)),
      );

    const harvesters = sim
      .getHarvestersInSystem(systemId)
      .filter(
        (harvester) =>
          harvester.hull > 0 &&
          (harvester.ownerId === viewerId || isPointVisible(coverage, harvester.position)),
      );

    const miningBelts: ProjectedBeltView[] = [];
    for (const belt of sim.getMiningBeltsInSystem(systemId)) {
      if (isPointVisible(coverage, belt.position)) {
        miningBelts.push({
          belt,
          visibility: 'live',
          observedRemainingReserves: belt.remainingReserves,
        });
      } else {
        const cachedReserves = memory.lastKnownBeltReservesById.get(belt.id);
        if (cachedReserves !== undefined) {
          miningBelts.push({
            belt,
            visibility: 'last_known',
            observedRemainingReserves: cachedReserves,
          });
        } else {
          miningBelts.push({
            belt,
            visibility: 'unexplored',
            observedRemainingReserves: belt.initialReserves,
          });
        }
      }
    }

    let resourceSummary: SystemResourceSummary | null = null;
    if (coverage.kind === 'full_system') {
      resourceSummary = sim.getSystemResourceSummary(systemId);
    } else if (miningBelts.some((b) => b.visibility !== 'unexplored')) {
      let remainingOre = 0;
      let initialOre = 0;
      let remainingCrystal = 0;
      let initialCrystal = 0;
      let innerBeltRemaining = 0;
      let innerBeltInitial = 0;

      for (const entry of miningBelts) {
        const { belt, observedRemainingReserves } = entry;
        if (belt.resourceType === 'ore') {
          remainingOre += observedRemainingReserves;
          initialOre += belt.initialReserves;
        } else {
          remainingCrystal += observedRemainingReserves;
          initialCrystal += belt.initialReserves;
        }
        if (belt.beltZone === 'inner') {
          innerBeltRemaining += observedRemainingReserves;
          innerBeltInitial += belt.initialReserves;
        }
      }

      resourceSummary = {
        systemId,
        remainingOre: Math.round(remainingOre),
        initialOre: Math.round(initialOre),
        remainingCrystal: Math.round(remainingCrystal),
        initialCrystal: Math.round(initialCrystal),
        innerBeltRemaining: Math.round(innerBeltRemaining),
        innerBeltInitial: Math.round(innerBeltInitial),
        extractionMultiplier: sim.getSystemResourceSummary(systemId).extractionMultiplier,
      };
    }

    return {
      viewerId,
      systemId,
      fogMode,
      coverage,
      isExplored,
      planets,
      deepSpaceStructures,
      combatShips,
      harvesters,
      miningBelts,
      resourceSummary,
    };
  }
}
