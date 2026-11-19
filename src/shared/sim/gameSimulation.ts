import {
  DEEP_SPACE_STRUCTURES,
  MATCH_PRESETS,
  ORBITAL_STRUCTURES,
  PLANET_CLASSES,
  SHIP_CLASSES,
  type DeepSpaceStructureId,
  type MatchPresetId,
  type OrbitalStructureId,
  type ShipClassId,
} from '../config/index.ts';
import type {
  GameCommand,
  PlayerSlotId,
  ResourceTargetFocus,
  Vector2D,
} from '../protocol/commands.ts';
import {
  type AsteroidBeltRockInstance,
  type AsteroidBeltZone,
  getAsteroidWorldPosition,
  getSystemAsteroidLayout,
} from './asteroidBeltLayout.ts';
import {
  createFiveSystemGalaxy,
  type GalaxyTopology,
  type PlanetNode,
} from './galaxy.ts';

export const ORBITAL_RING_ROTATION_SPEED_RAD_PER_SEC = 0.025;

/**
 * Harvester Phase 1 Speed & Mining Constants:
 * - Empty outward speed: 41.325 u/s (-25% from base 55.1)
 * - Full return speed: 27.55 u/s (-50% from base 55.1)
 * - Mining 40 units takes 12.5 seconds (within the 10–15s window) -> 3.2 units/sec.
 */
export const HARVESTER_EMPTY_SPEED = 41.325;
export const HARVESTER_FULL_SPEED = 27.55;
export const HARVESTER_CARGO_CAPACITY = 40;
export const HARVESTER_MINING_DURATION_SECONDS = 12.5;
export const HARVESTER_MINING_RATE_PER_SECOND =
  HARVESTER_CARGO_CAPACITY / HARVESTER_MINING_DURATION_SECONDS;

/**
 * Harvester Drop-Off & Refinery Logistics Constants:
 * - Orbital Refinery unloads at 10 units/sec (4s for full 40-unit load), max 2 concurrent docks.
 * - Command & Control unloads at 4 units/sec (10s for full 40-unit load).
 */
export const REFINERY_UNLOAD_RATE_PER_SECOND = 10;
export const CNC_UNLOAD_RATE_PER_SECOND = 4;
export const REFINERY_MAX_CONCURRENT_DOCKS = 2;
export const MAX_SHIP_PRODUCTION_QUEUE_SIZE = 5;

/**
 * 3-Pillar Expansion Economy Constants:
 * 1. Finite Tiered Belt Depletion: Inner Homeworld Belt runs dry quickly (~5–6m), pushing Harvesters
 *    to Mid/Outer starter pockets (~1,120–1,620u) and then through the wormhole into the Central Nexus.
 * 2. Symmetrical Ore-Heavy / Crystal-Scarce Starter Systems: All 4 starter systems have identical
 *    Ore (6,960 base) and scarce Crystal (1,160 base) reserves so capital fleets require expansion.
 * 3. High-Yield Enriched Central Nexus Deposits: Central Nexus rocks extract at 1.6x speed (~7.8s for 40 cargo).
 */
export const STARTER_INNER_ORE_RESERVES = 120;
export const STARTER_INNER_CRYSTAL_RESERVES = 80;
export const STARTER_OUTER_ORE_RESERVES = 180;
export const STARTER_OUTER_CRYSTAL_RESERVES = 120;
export const CENTRAL_HUB_ROCK_RESERVES = 600;
export const CENTRAL_HUB_ENRICHED_MINING_MULTIPLIER = 1.6;

export const MIN_DEEP_SPACE_PLANET_CLEARANCE_BUFFER = 24;
export const MIN_DEEP_SPACE_WORMHOLE_CLEARANCE = 45;
export const MIN_LOGISTICS_HUB_SPACING = 120;
export const MIN_HUB_TO_TOWER_SPACING = 42;
export const MIN_TOWER_TO_TOWER_SPACING = 30;
export const MIN_DEEP_SPACE_STRUCTURE_SPACING = MIN_TOWER_TO_TOWER_SPACING;

export function getMinDeepSpaceStructureSpacing(
  a: DeepSpaceStructureId,
  b: DeepSpaceStructureId,
): number {
  if (a === 'logistics_hub' && b === 'logistics_hub') {
    return MIN_LOGISTICS_HUB_SPACING;
  }
  if (a === 'logistics_hub' || b === 'logistics_hub') {
    return MIN_HUB_TO_TOWER_SPACING;
  }
  return MIN_TOWER_TO_TOWER_SPACING;
}

export interface DeepSpaceStructureInstance {
  readonly id: string;
  readonly structureId: DeepSpaceStructureId;
  readonly ownerId: PlayerSlotId;
  readonly systemId: string;
  readonly position: Vector2D;
  buildProgressSeconds: number;
  readonly totalBuildTimeSeconds: number;
  isComplete: boolean;
  shields: number;
  hull: number;
}

export interface SystemResourceSummary {
  readonly systemId: string;
  readonly remainingOre: number;
  readonly initialOre: number;
  readonly remainingCrystal: number;
  readonly initialCrystal: number;
  readonly innerBeltRemaining: number;
  readonly innerBeltInitial: number;
  readonly extractionMultiplier: number;
}

export interface ShipQueueItem {
  readonly id: string;
  readonly shipClassId: ShipClassId;
  readonly buildTimeSeconds: number;
  progressSeconds: number;
}

export interface OrbitalStructureInstance {
  readonly id: string;
  readonly structureId: OrbitalStructureId;
  readonly ownerId: PlayerSlotId;
  readonly planetId: string;
  readonly primarySlotIndex: number;
  readonly occupiedSlots: readonly number[];
  buildProgressSeconds: number;
  readonly totalBuildTimeSeconds: number;
  isComplete: boolean;
  shields: number;
  hull: number;
  targetResource: ResourceTargetFocus;
  readonly activeDockingHarvesterIds: string[];
  readonly queuedDockingHarvesterIds: string[];
  readonly productionQueue: ShipQueueItem[];
}

export interface PlanetRuntimeState {
  readonly planet: PlanetNode;
  ownerId: PlayerSlotId | null;
  readonly structures: OrbitalStructureInstance[];
}

export interface AsteroidMiningBeltNode {
  readonly id: string;
  readonly systemId: string;
  readonly resourceType: 'ore' | 'crystal';
  readonly beltZone: AsteroidBeltZone;
  readonly extractionMultiplier: number;
  readonly rock: AsteroidBeltRockInstance;
  position: Vector2D;
  worldY: number;
  readonly initialReserves: number;
  remainingReserves: number;
}

export type HarvesterActivityState =
  | 'flying_to_belt'
  | 'mining'
  | 'returning_to_dropoff'
  | 'waiting_to_unload'
  | 'unloading'
  | 'transiting_to_hub'
  | 'transiting_to_home';

export interface HarvesterUnitState {
  readonly id: string;
  readonly ownerId: PlayerSlotId;
  homeStructureId: string;
  homeSystemId: string;
  homePlanetId: string;
  currentSystemId: string;
  position: Vector2D;
  headingRadians: number;
  currentSpeed: number;
  state: HarvesterActivityState;
  targetBeltId: string | null;
  targetRockWorldPos: { readonly x: number; readonly y: number; readonly z: number } | null;
  miningStandoffAngle: number;
  cargoType: 'ore' | 'crystal';
  cargoAmount: number;
  depositAccumulator: number;
  readonly cargoCapacity: number;
  mineCrossSystemHub: boolean;
}

export interface PlayerEconomyState {
  readonly playerId: PlayerSlotId;
  ore: number;
  crystal: number;
  supplyUsed: number;
  supplyCap: number;
  techModulesCompleted: number;
}

export interface CommandResult {
  readonly ok: boolean;
  readonly reason?: string;
}

export class GameSimulation {
  public readonly presetId: MatchPresetId;
  public readonly galaxy: GalaxyTopology;
  public currentTick = 0;
  public elapsedSeconds = 0;

  private readonly players = new Map<PlayerSlotId, PlayerEconomyState>();
  private readonly planets = new Map<string, PlanetRuntimeState>();
  private readonly deepSpaceStructures: DeepSpaceStructureInstance[] = [];
  private readonly miningBelts: AsteroidMiningBeltNode[] = [];
  private readonly harvesters: HarvesterUnitState[] = [];
  private nextEntityCounter = 1;

  constructor(presetId: MatchPresetId = 'standard_tactical') {
    this.presetId = presetId;
    this.galaxy = createFiveSystemGalaxy();
    this.initializeSimulationState();
  }

  public getPlayerState(playerId: PlayerSlotId): PlayerEconomyState {
    const p = this.players.get(playerId);
    if (!p) {
      throw new Error(`Unknown player slot: ${playerId}`);
    }
    return p;
  }

  public getPlanetState(planetId: string): PlanetRuntimeState {
    const p = this.planets.get(planetId);
    if (!p) {
      throw new Error(`Unknown planet id: ${planetId}`);
    }
    return p;
  }

  public getStructureById(
    structureId: string,
  ): { readonly planetState: PlanetRuntimeState; readonly structure: OrbitalStructureInstance } | undefined {
    for (const planetState of this.planets.values()) {
      const structure = planetState.structures.find((s) => s.id === structureId);
      if (structure) {
        return { planetState, structure };
      }
    }
    return undefined;
  }

  public getStructureWorldPosition(
    planetState: PlanetRuntimeState,
    structure: OrbitalStructureInstance,
  ): Vector2D {
    const planet = planetState.planet;
    const radius = PLANET_CLASSES[planet.planetClass].radiusUnits * 1.52;
    const totalSlots = planet.orbitalSlots;
    const s0 = structure.occupiedSlots[0] ?? 0;
    let baseAngle = (s0 / totalSlots) * Math.PI * 2;
    if (structure.occupiedSlots.length === 2) {
      const s1 = structure.occupiedSlots[1] ?? 0;
      let a1 = (s1 / totalSlots) * Math.PI * 2;
      if (a1 < baseAngle) {
        a1 += Math.PI * 2;
      }
      baseAngle = (baseAngle + a1) * 0.5;
    }

    const worldAngle =
      baseAngle - this.elapsedSeconds * ORBITAL_RING_ROTATION_SPEED_RAD_PER_SEC;
    return {
      x: planet.position.x + Math.cos(worldAngle) * radius,
      z: planet.position.z + Math.sin(worldAngle) * radius,
    };
  }

  public getPlanetsInSystem(systemId: string): readonly PlanetRuntimeState[] {
    const result: PlanetRuntimeState[] = [];
    for (const p of this.planets.values()) {
      if (p.planet.systemId === systemId) {
        result.push(p);
      }
    }
    return result;
  }

  public getHarvestersInSystem(systemId: string): readonly HarvesterUnitState[] {
    return this.harvesters.filter((h) => h.currentSystemId === systemId);
  }

  public getHarvesterById(harvesterId: string): HarvesterUnitState | undefined {
    return this.harvesters.find((h) => h.id === harvesterId);
  }

  public getAllHarvesters(): readonly HarvesterUnitState[] {
    return this.harvesters;
  }

  public getMiningBeltsInSystem(systemId: string): readonly AsteroidMiningBeltNode[] {
    return this.miningBelts.filter((b) => b.systemId === systemId);
  }

  public getSystemResourceSummary(systemId: string): SystemResourceSummary {
    const belts = this.getMiningBeltsInSystem(systemId);
    let remainingOre = 0;
    let initialOre = 0;
    let remainingCrystal = 0;
    let initialCrystal = 0;
    let innerBeltRemaining = 0;
    let innerBeltInitial = 0;

    for (const b of belts) {
      if (b.resourceType === 'ore') {
        remainingOre += b.remainingReserves;
        initialOre += b.initialReserves;
      } else {
        remainingCrystal += b.remainingReserves;
        initialCrystal += b.initialReserves;
      }
      if (b.beltZone === 'inner') {
        innerBeltRemaining += b.remainingReserves;
        innerBeltInitial += b.initialReserves;
      }
    }

    const extractionMultiplier =
      systemId === 'system_central_hub'
        ? CENTRAL_HUB_ENRICHED_MINING_MULTIPLIER
        : 1.0;

    return {
      systemId,
      remainingOre: Math.round(remainingOre),
      initialOre: Math.round(initialOre),
      remainingCrystal: Math.round(remainingCrystal),
      initialCrystal: Math.round(initialCrystal),
      innerBeltRemaining: Math.round(innerBeltRemaining),
      innerBeltInitial: Math.round(innerBeltInitial),
      extractionMultiplier,
    };
  }

  public setPlayerHarvestersCrossSystemMining(
    playerId: PlayerSlotId,
    mineCentralHub: boolean,
  ): void {
    for (const h of this.harvesters) {
      if (h.ownerId === playerId) {
        h.mineCrossSystemHub = mineCentralHub;
      }
    }
  }

  public destroyOrbitalStructure(structureId: string): boolean {
    for (const planetState of this.planets.values()) {
      const idx = planetState.structures.findIndex((s) => s.id === structureId);
      if (idx === -1) {
        continue;
      }
      const [removed] = planetState.structures.splice(idx, 1);
      if (!removed) {
        return false;
      }

      if (removed.isComplete) {
        const player = this.players.get(removed.ownerId);
        const config = ORBITAL_STRUCTURES[removed.structureId];
        if (player) {
          player.supplyCap = Math.max(0, player.supplyCap - config.supplyProvided);
          if (removed.structureId === 'tech_module') {
            player.techModulesCompleted = Math.max(
              0,
              player.techModulesCompleted - 1,
            );
          }
        }
      }

      if (
        planetState.structures.length === 0 &&
        planetState.planet.planetClass !== 'large'
      ) {
        planetState.ownerId = null;
      }

      // Reassign any Harvesters whose home platform was destroyed to the closest friendly dropoff
      for (const h of this.harvesters) {
        if (h.homeStructureId === structureId) {
          this.reassignHarvesterToClosestHome(h);
        }
      }
      return true;
    }
    return false;
  }

  public getDeepSpaceStructuresInSystem(
    systemId: string,
  ): readonly DeepSpaceStructureInstance[] {
    return this.deepSpaceStructures.filter((s) => s.systemId === systemId);
  }

  public getDeepSpaceStructureById(
    structureId: string,
  ): DeepSpaceStructureInstance | undefined {
    return this.deepSpaceStructures.find((s) => s.id === structureId);
  }

  public destroyDeepSpaceStructure(structureId: string): boolean {
    const idx = this.deepSpaceStructures.findIndex((s) => s.id === structureId);
    if (idx === -1) {
      return false;
    }
    const [removed] = this.deepSpaceStructures.splice(idx, 1);
    if (!removed) {
      return false;
    }
    if (removed.isComplete) {
      const player = this.players.get(removed.ownerId);
      const config = DEEP_SPACE_STRUCTURES[removed.structureId];
      if (player) {
        player.supplyCap = Math.max(0, player.supplyCap - config.supplyProvided);
      }
    }
    return true;
  }

  public submitCommand(command: GameCommand): CommandResult {
    switch (command.type) {
      case 'BUILD_ORBITAL_STRUCTURE':
        return this.handleBuildOrbitalStructure(
          command.playerId,
          command.planetId,
          command.slotIndex,
          command.structureId,
        );
      case 'BUILD_DEEP_SPACE_STRUCTURE':
        return this.handleBuildDeepSpaceStructure(
          command.playerId,
          command.systemId,
          command.position,
          command.structureId,
        );
      case 'QUEUE_SHIP':
        if (command.shipClassId === 'harvester') {
          return this.handleSpawnPaidHarvester(
            command.playerId,
            command.dockyardOrRefineryId,
          );
        }
        return { ok: true };
      case 'SET_REFINERY_TARGET':
        return this.handleSetRefineryTarget(
          command.playerId,
          command.structureId,
          command.targetResource,
        );
      case 'CANCEL_QUEUED_SHIP':
        return this.handleCancelQueuedShip(
          command.playerId,
          command.structureId,
          command.queueItemId,
        );
      default:
        return { ok: true };
    }
  }

  public stepTick(deltaSeconds: number): void {
    this.currentTick += 1;
    this.elapsedSeconds += deltaSeconds;

    // 1. Update rotating world positions of targetable asteroid/crystal rocks
    for (const beltNode of this.miningBelts) {
      const worldPos = getAsteroidWorldPosition(beltNode.rock, this.elapsedSeconds);
      beltNode.position = { x: worldPos.x, z: worldPos.z };
      beltNode.worldY = worldPos.y;
    }

    // 2. Advance orbital structure construction timers & per-platform ship build queues (1 at a time)
    for (const planetState of this.planets.values()) {
      for (const structure of planetState.structures) {
        if (!structure.isComplete) {
          structure.buildProgressSeconds += deltaSeconds;
          if (structure.buildProgressSeconds >= structure.totalBuildTimeSeconds) {
            structure.buildProgressSeconds = structure.totalBuildTimeSeconds;
            structure.isComplete = true;
            this.onOrbitalStructureCompleted(planetState, structure);
          }
        } else if (structure.productionQueue.length > 0) {
          const activeOrder = structure.productionQueue[0];
          if (activeOrder) {
            activeOrder.progressSeconds += deltaSeconds;
            if (activeOrder.progressSeconds >= activeOrder.buildTimeSeconds) {
              structure.productionQueue.shift();
              if (activeOrder.shipClassId === 'harvester') {
                this.spawnHarvesterAtStructure(
                  structure.ownerId,
                  planetState,
                  structure,
                );
              }
            }
          }
        }
      }
    }

    // 2b. Advance deep-space structure construction timers (Logistics Hubs & Defence Towers)
    for (const dsStruct of this.deepSpaceStructures) {
      if (!dsStruct.isComplete) {
        dsStruct.buildProgressSeconds += deltaSeconds;
        if (dsStruct.buildProgressSeconds >= dsStruct.totalBuildTimeSeconds) {
          dsStruct.buildProgressSeconds = dsStruct.totalBuildTimeSeconds;
          dsStruct.isComplete = true;
          const player = this.players.get(dsStruct.ownerId);
          const config = DEEP_SPACE_STRUCTURES[dsStruct.structureId];
          if (player) {
            player.supplyCap += config.supplyProvided;
          }
        }
      }
    }

    // 3. Update automated Harvester mining, docking queues, & movement
    for (const harvester of this.harvesters) {
      this.updateHarvester(harvester, deltaSeconds);
    }
  }

  private initializeSimulationState(): void {
    const preset = MATCH_PRESETS[this.presetId];
    const slots: readonly PlayerSlotId[] = [
      'player_1',
      'player_2',
      'player_3',
      'player_4',
    ];

    for (const slotId of slots) {
      this.players.set(slotId, {
        playerId: slotId,
        ore: preset.startingOre,
        crystal: preset.startingCrystal,
        supplyUsed: 0,
        supplyCap: 0,
        techModulesCompleted: 0,
      });
    }

    for (const system of this.galaxy.systems) {
      const layout = getSystemAsteroidLayout(system);
      const extractionMultiplier = system.isCentralHub
        ? CENTRAL_HUB_ENRICHED_MINING_MULTIPLIER
        : 1.0;

      for (const rock of layout.miningCandidates) {
        const initPos = getAsteroidWorldPosition(rock, 0);
        let baseReserves: number;
        if (system.isCentralHub) {
          baseReserves = CENTRAL_HUB_ROCK_RESERVES;
        } else if (rock.beltZone === 'inner') {
          baseReserves =
            rock.resourceType === 'ore'
              ? STARTER_INNER_ORE_RESERVES
              : STARTER_INNER_CRYSTAL_RESERVES;
        } else {
          baseReserves =
            rock.resourceType === 'ore'
              ? STARTER_OUTER_ORE_RESERVES
              : STARTER_OUTER_CRYSTAL_RESERVES;
        }
        const reserves = Math.round(baseReserves * preset.asteroidReserveMultiplier);

        this.miningBelts.push({
          id: rock.id,
          systemId: system.id,
          resourceType: rock.resourceType,
          beltZone: rock.beltZone,
          extractionMultiplier,
          rock,
          position: { x: initPos.x, z: initPos.z },
          worldY: initPos.y,
          initialReserves: reserves,
          remainingReserves: reserves,
        });
      }

      for (const planet of system.planets) {
        const runtimePlanet: PlanetRuntimeState = {
          planet,
          ownerId: planet.ownerId,
          structures: [],
        };
        this.planets.set(planet.id, runtimePlanet);

        if (planet.ownerId !== null && planet.planetClass === 'large') {
          const cncConfig = ORBITAL_STRUCTURES.command_and_control;
          const cncInstance: OrbitalStructureInstance = {
            id: `struct_${this.nextEntityCounter++}`,
            structureId: 'command_and_control',
            ownerId: planet.ownerId,
            planetId: planet.id,
            primarySlotIndex: 0,
            occupiedSlots: [0, 1],
            buildProgressSeconds: 0,
            totalBuildTimeSeconds: 0,
            isComplete: true,
            shields: cncConfig.maxShields,
            hull: cncConfig.maxHull,
            targetResource: 'auto',
            activeDockingHarvesterIds: [],
            queuedDockingHarvesterIds: [],
            productionQueue: [],
          };
          runtimePlanet.structures.push(cncInstance);
          this.onOrbitalStructureCompleted(runtimePlanet, cncInstance);
        }
      }
    }
  }

  private handleBuildOrbitalStructure(
    playerId: PlayerSlotId,
    planetId: string,
    slotIndex: number,
    structureId: OrbitalStructureId,
  ): CommandResult {
    const player = this.players.get(playerId);
    const planetState = this.planets.get(planetId);
    if (!player || !planetState) {
      return { ok: false, reason: 'Invalid player or planet' };
    }

    const config = ORBITAL_STRUCTURES[structureId];
    if (config.uniqueHomeworldOnly) {
      return {
        ok: false,
        reason: 'Command & Control is unique to the starting Homeworld',
      };
    }

    const totalSlots = planetState.planet.orbitalSlots;
    if (slotIndex < 0 || slotIndex >= totalSlots) {
      return { ok: false, reason: 'Orbital slot index out of range' };
    }

    if (planetState.ownerId === null) {
      if (structureId !== 'planetary_outpost') {
        return {
          ok: false,
          reason: 'Unclaimed planets require a 1-slot Planetary Outpost first',
        };
      }
    } else if (planetState.ownerId !== playerId) {
      return { ok: false, reason: 'Planet is owned by another player' };
    }

    const requiredSlots =
      config.slotCost === 2
        ? [slotIndex, (slotIndex + 1) % totalSlots]
        : [slotIndex];

    for (const reqSlot of requiredSlots) {
      const alreadyUsed = planetState.structures.some((s) =>
        s.occupiedSlots.includes(reqSlot),
      );
      if (alreadyUsed) {
        return {
          ok: false,
          reason: `Orbital slot ${reqSlot} is already occupied`,
        };
      }
    }

    if (player.ore < config.cost.ore || player.crystal < config.cost.crystal) {
      return { ok: false, reason: 'Insufficient Ore or Crystals' };
    }

    player.ore -= config.cost.ore;
    player.crystal -= config.cost.crystal;

    if (planetState.ownerId === null && structureId === 'planetary_outpost') {
      planetState.ownerId = playerId;
    }

    const instance: OrbitalStructureInstance = {
      id: `struct_${this.nextEntityCounter++}`,
      structureId,
      ownerId: playerId,
      planetId,
      primarySlotIndex: slotIndex,
      occupiedSlots: requiredSlots,
      buildProgressSeconds: 0,
      totalBuildTimeSeconds: config.buildTimeSeconds,
      isComplete: config.buildTimeSeconds === 0,
      shields: config.maxShields,
      hull: config.maxHull,
      targetResource: 'auto',
      activeDockingHarvesterIds: [],
      queuedDockingHarvesterIds: [],
      productionQueue: [],
    };

    planetState.structures.push(instance);
    if (instance.isComplete) {
      this.onOrbitalStructureCompleted(planetState, instance);
    }

    return { ok: true };
  }

  /**
   * Side-effect-free validation for deep-space structure placement.
   * Shared by both authoritative `BUILD_DEEP_SPACE_STRUCTURE` commands and the 3D live preview ghost.
   */
  public validateDeepSpacePlacement(
    playerId: PlayerSlotId,
    systemId: string,
    position: Vector2D,
    structureId: DeepSpaceStructureId,
  ): CommandResult {
    const player = this.players.get(playerId);
    const system = this.galaxy.systems.find((s) => s.id === systemId);
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

    // 1. Ensure placement does not overlap any planet or its orbital ring
    for (const planet of system.planets) {
      const orbitalRingRadius =
        PLANET_CLASSES[planet.planetClass].radiusUnits * 1.52;
      const minClearance =
        orbitalRingRadius + MIN_DEEP_SPACE_PLANET_CLEARANCE_BUFFER;
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

    // 2. Ensure placement stays clear of every wormhole mouth in this system
    for (const wormhole of this.galaxy.wormholes) {
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
        if (distToWormhole < MIN_DEEP_SPACE_WORMHOLE_CLEARANCE) {
          return {
            ok: false,
            reason: `Too close to wormhole mouth (requires ${MIN_DEEP_SPACE_WORMHOLE_CLEARANCE}u clearance)`,
          };
        }
      }
    }

    // 3. Enforce per-structure minimum spacing against every existing deep-space installation
    const existingInSystem = this.getDeepSpaceStructuresInSystem(systemId);
    for (const existing of existingInSystem) {
      const requiredSpacing = getMinDeepSpaceStructureSpacing(
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

    // 4. Enforce Logistics Hub radius rule for Defence Towers (PD Tower & Hull Breaker Tower)
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

    // 5. Verify Ore & Crystal reserves
    if (player.ore < config.cost.ore || player.crystal < config.cost.crystal) {
      return { ok: false, reason: 'Insufficient Ore or Crystals' };
    }

    return { ok: true };
  }

  private handleBuildDeepSpaceStructure(
    playerId: PlayerSlotId,
    systemId: string,
    position: Vector2D,
    structureId: DeepSpaceStructureId,
  ): CommandResult {
    const validation = this.validateDeepSpacePlacement(
      playerId,
      systemId,
      position,
      structureId,
    );
    if (!validation.ok) {
      return validation;
    }

    const player = this.players.get(playerId)!;
    const config = DEEP_SPACE_STRUCTURES[structureId];
    player.ore -= config.cost.ore;
    player.crystal -= config.cost.crystal;

    const instance: DeepSpaceStructureInstance = {
      id: `ds_struct_${this.nextEntityCounter++}`,
      structureId,
      ownerId: playerId,
      systemId,
      position: { x: position.x, z: position.z },
      buildProgressSeconds: 0,
      totalBuildTimeSeconds: config.buildTimeSeconds,
      isComplete: config.buildTimeSeconds === 0,
      shields: config.maxShields,
      hull: config.maxHull,
    };
    this.deepSpaceStructures.push(instance);

    if (instance.isComplete) {
      player.supplyCap += config.supplyProvided;
    }

    return { ok: true };
  }

  private handleSpawnPaidHarvester(
    playerId: PlayerSlotId,
    structureOrPlanetId: string,
  ): CommandResult {
    const player = this.players.get(playerId);
    if (!player) {
      return { ok: false, reason: 'Invalid player' };
    }

    let targetPlanet: PlanetRuntimeState | undefined;
    let targetStructure: OrbitalStructureInstance | undefined;

    for (const p of this.planets.values()) {
      const matchingStruct = p.structures.find(
        (s) =>
          s.id === structureOrPlanetId &&
          s.ownerId === playerId &&
          s.isComplete &&
          (s.structureId === 'refinery' || s.structureId === 'command_and_control'),
      );
      if (matchingStruct) {
        targetPlanet = p;
        targetStructure = matchingStruct;
        break;
      }
      if (p.planet.id === structureOrPlanetId && p.ownerId === playerId) {
        const dropoff = p.structures.find(
          (s) =>
            s.isComplete &&
            (s.structureId === 'refinery' || s.structureId === 'command_and_control'),
        );
        if (dropoff) {
          targetPlanet = p;
          targetStructure = dropoff;
          break;
        }
      }
    }

    if (!targetPlanet || !targetStructure) {
      return {
        ok: false,
        reason: 'Requires a completed Orbital Refinery or Command & Control',
      };
    }

    if (targetStructure.productionQueue.length >= MAX_SHIP_PRODUCTION_QUEUE_SIZE) {
      return {
        ok: false,
        reason: `Production queue is full (max ${MAX_SHIP_PRODUCTION_QUEUE_SIZE})`,
      };
    }

    const harvesterCfg = SHIP_CLASSES.harvester;
    if (
      player.ore < harvesterCfg.cost.ore ||
      player.crystal < harvesterCfg.cost.crystal
    ) {
      return { ok: false, reason: 'Insufficient Ore or Crystals for Harvester' };
    }

    // Resources are taken immediately when the build order is placed
    player.ore -= harvesterCfg.cost.ore;
    player.crystal -= harvesterCfg.cost.crystal;
    targetStructure.productionQueue.push({
      id: `queue_${this.nextEntityCounter++}`,
      shipClassId: 'harvester',
      buildTimeSeconds: harvesterCfg.buildTimeSeconds,
      progressSeconds: 0,
    });

    return { ok: true };
  }

  private handleCancelQueuedShip(
    playerId: PlayerSlotId,
    structureId: string,
    queueItemId: string,
  ): CommandResult {
    const player = this.players.get(playerId);
    const found = this.getStructureById(structureId);
    if (!player || !found || found.structure.ownerId !== playerId) {
      return { ok: false, reason: 'Structure not found or not owned by player' };
    }

    const queueIdx = found.structure.productionQueue.findIndex(
      (item) => item.id === queueItemId,
    );
    if (queueIdx === -1) {
      return { ok: false, reason: 'Queued ship order not found' };
    }

    const [removed] = found.structure.productionQueue.splice(queueIdx, 1);
    if (removed) {
      // Refund resources back into player stores immediately
      const shipCfg = SHIP_CLASSES[removed.shipClassId];
      player.ore += shipCfg.cost.ore;
      player.crystal += shipCfg.cost.crystal;
    }

    return { ok: true };
  }

  private handleSetRefineryTarget(
    playerId: PlayerSlotId,
    structureId: string,
    targetResource: ResourceTargetFocus,
  ): CommandResult {
    const found = this.getStructureById(structureId);
    if (!found || found.structure.ownerId !== playerId) {
      return { ok: false, reason: 'Structure not found or not owned by player' };
    }
    if (
      found.structure.structureId !== 'refinery' &&
      found.structure.structureId !== 'command_and_control'
    ) {
      return { ok: false, reason: 'Only Refineries and C&C can set mining focus' };
    }

    found.structure.targetResource = targetResource;

    // Immediately update any outbound Harvesters assigned to this home platform
    if (targetResource !== 'auto') {
      for (const h of this.harvesters) {
        if (
          h.homeStructureId === structureId &&
          h.state === 'flying_to_belt' &&
          h.cargoAmount === 0
        ) {
          h.cargoType = targetResource;
          h.targetBeltId = null;
        }
      }
    }

    return { ok: true };
  }

  private onOrbitalStructureCompleted(
    planetState: PlanetRuntimeState,
    structure: OrbitalStructureInstance,
  ): void {
    const player = this.players.get(structure.ownerId);
    const config = ORBITAL_STRUCTURES[structure.structureId];
    if (!player) {
      return;
    }

    player.supplyCap += config.supplyProvided;
    if (structure.structureId === 'tech_module') {
      player.techModulesCompleted += 1;
    }

    if (config.spawnsFreeHarvester) {
      this.spawnHarvesterAtStructure(structure.ownerId, planetState, structure);
    }
  }

  private spawnHarvesterAtStructure(
    ownerId: PlayerSlotId,
    planetState: PlanetRuntimeState,
    homeStructure: OrbitalStructureInstance,
  ): HarvesterUnitState {
    const harvesterIndex = this.harvesters.filter((h) => h.ownerId === ownerId).length;
    const structPos = this.getStructureWorldPosition(planetState, homeStructure);
    const angle = (harvesterIndex * 1.7) % (Math.PI * 2);
    const spawnPos: Vector2D = {
      x: structPos.x + Math.cos(angle) * 6,
      z: structPos.z + Math.sin(angle) * 6,
    };

    const preferredResource: 'ore' | 'crystal' =
      homeStructure.targetResource !== 'auto'
        ? homeStructure.targetResource
        : harvesterIndex % 2 === 0
          ? 'ore'
          : 'crystal';

    const harvester: HarvesterUnitState = {
      id: `harvester_${this.nextEntityCounter++}`,
      ownerId,
      homeStructureId: homeStructure.id,
      homeSystemId: planetState.planet.systemId,
      homePlanetId: planetState.planet.id,
      currentSystemId: planetState.planet.systemId,
      position: spawnPos,
      headingRadians: angle,
      currentSpeed: HARVESTER_EMPTY_SPEED,
      state: 'flying_to_belt',
      targetBeltId: null,
      targetRockWorldPos: null,
      miningStandoffAngle: angle,
      cargoType: preferredResource,
      cargoAmount: 0,
      depositAccumulator: 0,
      cargoCapacity: HARVESTER_CARGO_CAPACITY,
      mineCrossSystemHub: false,
    };

    this.harvesters.push(harvester);
    return harvester;
  }

  private computeHarvesterSpeed(harvester: HarvesterUnitState): number {
    const fillRatio = Math.min(
      1,
      Math.max(0, harvester.cargoAmount / Math.max(1, harvester.cargoCapacity)),
    );
    return (
      HARVESTER_EMPTY_SPEED +
      (HARVESTER_FULL_SPEED - HARVESTER_EMPTY_SPEED) * fillRatio
    );
  }

  private reassignHarvesterToClosestHome(harvester: HarvesterUnitState): void {
    let bestPlanet: PlanetRuntimeState | undefined;
    let bestStruct: OrbitalStructureInstance | undefined;
    let bestScore = Infinity;

    for (const p of this.planets.values()) {
      if (p.ownerId !== harvester.ownerId) {
        continue;
      }
      for (const s of p.structures) {
        if (
          !s.isComplete ||
          (s.structureId !== 'refinery' && s.structureId !== 'command_and_control')
        ) {
          continue;
        }
        const sPos = this.getStructureWorldPosition(p, s);
        const dist = Math.hypot(
          sPos.x - harvester.position.x,
          sPos.z - harvester.position.z,
        );
        // Prefer platforms in the same system first
        const systemPenalty = p.planet.systemId === harvester.currentSystemId ? 0 : 100000;
        const score = dist + systemPenalty;
        if (score < bestScore) {
          bestScore = score;
          bestPlanet = p;
          bestStruct = s;
        }
      }
    }

    if (bestPlanet && bestStruct) {
      harvester.homeStructureId = bestStruct.id;
      harvester.homePlanetId = bestPlanet.planet.id;
      harvester.homeSystemId = bestPlanet.planet.systemId;
    }
  }

  private removeHarvesterFromDockingLists(
    harvesterId: string,
    structure: OrbitalStructureInstance,
  ): void {
    const activeIdx = structure.activeDockingHarvesterIds.indexOf(harvesterId);
    if (activeIdx !== -1) {
      structure.activeDockingHarvesterIds.splice(activeIdx, 1);
    }
    const queueIdx = structure.queuedDockingHarvesterIds.indexOf(harvesterId);
    if (queueIdx !== -1) {
      structure.queuedDockingHarvesterIds.splice(queueIdx, 1);
    }
  }

  private updateHarvester(harvester: HarvesterUnitState, deltaSeconds: number): void {
    const speed = this.computeHarvesterSpeed(harvester);
    harvester.currentSpeed = speed;

    // Ensure assigned home platform still exists; fallback to closest friendly platform if destroyed
    let homeLookup = this.getStructureById(harvester.homeStructureId);
    if (!homeLookup) {
      this.reassignHarvesterToClosestHome(harvester);
      homeLookup = this.getStructureById(harvester.homeStructureId);
    }

    if (
      (harvester.mineCrossSystemHub || harvester.state === 'transiting_to_hub') &&
      harvester.currentSystemId !== 'system_central_hub' &&
      harvester.cargoAmount === 0
    ) {
      harvester.state = 'transiting_to_hub';
      harvester.targetRockWorldPos = null;
      const wormhole = this.galaxy.wormholes.find(
        (wh) => wh.fromSystemId === harvester.currentSystemId,
      );
      if (wormhole) {
        const arrived = this.movePositionTowards(
          harvester,
          wormhole.fromPosition,
          speed * deltaSeconds,
        );
        if (arrived) {
          harvester.currentSystemId = 'system_central_hub';
          harvester.position = {
            x: wormhole.toPosition.x * 0.92,
            z: wormhole.toPosition.z * 0.92,
          };
          harvester.targetBeltId = null;
          harvester.state = 'flying_to_belt';
        }
        return;
      }
    }

    if (harvester.state === 'flying_to_belt') {
      if (homeLookup && homeLookup.structure.targetResource !== 'auto') {
        harvester.cargoType = homeLookup.structure.targetResource;
      }

      let belt = this.miningBelts.find(
        (b) =>
          b.id === harvester.targetBeltId &&
          b.systemId === harvester.currentSystemId &&
          b.remainingReserves > 0 &&
          b.resourceType === harvester.cargoType,
      );
      if (!belt) {
        belt = this.selectBestBeltInSystem(harvester);
        harvester.targetBeltId = belt?.id ?? null;
        if (belt) {
          harvester.cargoType = belt.resourceType;
          harvester.miningStandoffAngle = Math.atan2(
            harvester.position.z - belt.position.z,
            harvester.position.x - belt.position.x,
          );
        }
      }
      if (!belt) {
        // Local deposits of this resource are exhausted -> automatically venture into the Central Nexus via wormhole
        if (
          harvester.currentSystemId !== 'system_central_hub' &&
          this.miningBelts.some(
            (b) => b.systemId === 'system_central_hub' && b.remainingReserves > 0,
          )
        ) {
          harvester.state = 'transiting_to_hub';
          harvester.targetRockWorldPos = null;
        }
        return;
      }

      harvester.targetRockWorldPos = {
        x: belt.position.x,
        y: belt.worldY,
        z: belt.position.z,
      };

      const standoffRadius = 11.5;
      const standoffPos: Vector2D = {
        x: belt.position.x + Math.cos(harvester.miningStandoffAngle) * standoffRadius,
        z: belt.position.z + Math.sin(harvester.miningStandoffAngle) * standoffRadius,
      };

      const arrived = this.movePositionTowards(
        harvester,
        standoffPos,
        speed * deltaSeconds,
        1.5,
      );
      if (arrived) {
        harvester.state = 'mining';
        harvester.cargoType = belt.resourceType;
      }
      return;
    }

    if (harvester.state === 'mining') {
      const belt = this.miningBelts.find((b) => b.id === harvester.targetBeltId);
      if (!belt || belt.remainingReserves <= 0) {
        harvester.targetBeltId = null;
        harvester.state =
          harvester.cargoAmount >= harvester.cargoCapacity * 0.5
            ? 'returning_to_dropoff'
            : 'flying_to_belt';
        return;
      }

      const standoffRadius = 11.5;
      harvester.position = {
        x: belt.position.x + Math.cos(harvester.miningStandoffAngle) * standoffRadius,
        z: belt.position.z + Math.sin(harvester.miningStandoffAngle) * standoffRadius,
      };
      harvester.targetRockWorldPos = {
        x: belt.position.x,
        y: belt.worldY,
        z: belt.position.z,
      };
      harvester.headingRadians = Math.atan2(
        belt.position.x - harvester.position.x,
        belt.position.z - harvester.position.z,
      );

      const extractAmount =
        HARVESTER_MINING_RATE_PER_SECOND * belt.extractionMultiplier * deltaSeconds;
      harvester.cargoAmount = Math.min(
        harvester.cargoCapacity,
        harvester.cargoAmount + extractAmount,
      );
      belt.remainingReserves = Math.max(0, belt.remainingReserves - extractAmount);
      harvester.currentSpeed = this.computeHarvesterSpeed(harvester);

      if (harvester.cargoAmount >= harvester.cargoCapacity) {
        harvester.targetRockWorldPos = null;
        harvester.state = 'returning_to_dropoff';
      }
      return;
    }

    if (
      harvester.state === 'returning_to_dropoff' ||
      harvester.state === 'transiting_to_home'
    ) {
      harvester.targetRockWorldPos = null;
      if (!homeLookup) {
        return;
      }

      // If Harvester is in a different system from its home platform (e.g. Central Nexus),
      // check if player built a closer local Refinery in this system; otherwise transit home via wormhole
      if (harvester.currentSystemId !== homeLookup.planetState.planet.systemId) {
        const localDropoff = this.findNearestFriendlyDropoffInSystem(
          harvester.ownerId,
          harvester.currentSystemId,
          harvester.position,
        );
        if (localDropoff) {
          homeLookup = localDropoff;
          harvester.homeStructureId = localDropoff.structure.id;
          harvester.homePlanetId = localDropoff.planetState.planet.id;
          harvester.homeSystemId = localDropoff.planetState.planet.systemId;
        } else {
          harvester.state = 'transiting_to_home';
          const returnWormhole = this.galaxy.wormholes.find(
            (wh) => wh.fromSystemId === harvester.homeSystemId,
          );
          if (returnWormhole) {
            const arrivedWh = this.movePositionTowards(
              harvester,
              returnWormhole.toPosition,
              speed * deltaSeconds,
            );
            if (arrivedWh) {
              harvester.currentSystemId = harvester.homeSystemId;
              harvester.position = {
                x: returnWormhole.fromPosition.x * 0.92,
                z: returnWormhole.fromPosition.z * 0.92,
              };
              harvester.state = 'returning_to_dropoff';
            }
          }
          return;
        }
      }

      const homePos = this.getStructureWorldPosition(
        homeLookup.planetState,
        homeLookup.structure,
      );
      const arrivedAtPlatform = this.movePositionTowards(
        harvester,
        homePos,
        speed * deltaSeconds,
        6.0,
      );
      if (arrivedAtPlatform) {
        this.enterPlatformDockOrQueue(harvester, homeLookup.structure);
      }
      return;
    }

    if (harvester.state === 'waiting_to_unload') {
      if (!homeLookup) {
        harvester.state = 'returning_to_dropoff';
        return;
      }
      const struct = homeLookup.structure;
      const homePos = this.getStructureWorldPosition(homeLookup.planetState, struct);

      // Hold position near the home platform while waiting in the docking queue
      const queueIdx = Math.max(0, struct.queuedDockingHarvesterIds.indexOf(harvester.id));
      const holdAngle = queueIdx * 0.8 + 0.5;
      const holdPos: Vector2D = {
        x: homePos.x + Math.cos(holdAngle) * 11,
        z: homePos.z + Math.sin(holdAngle) * 11,
      };
      this.movePositionTowards(harvester, holdPos, speed * deltaSeconds, 1.5);

      const maxDocks = this.getMaxConcurrentDocks(struct);
      const isFirstInQueue = struct.queuedDockingHarvesterIds[0] === harvester.id;
      if (struct.activeDockingHarvesterIds.length < maxDocks && isFirstInQueue) {
        struct.queuedDockingHarvesterIds.shift();
        struct.activeDockingHarvesterIds.push(harvester.id);
        harvester.state = 'unloading';
      }
      return;
    }

    if (harvester.state === 'unloading') {
      if (!homeLookup) {
        harvester.state = 'returning_to_dropoff';
        return;
      }
      const struct = homeLookup.structure;
      const homePos = this.getStructureWorldPosition(homeLookup.planetState, struct);
      const dockIdx = Math.max(0, struct.activeDockingHarvesterIds.indexOf(harvester.id));
      const dockOffset = dockIdx === 0 ? -3.2 : 3.2;
      harvester.position = {
        x: homePos.x + dockOffset,
        z: homePos.z + 4.5,
      };
      harvester.headingRadians = Math.atan2(
        homePos.x - harvester.position.x,
        homePos.z - harvester.position.z,
      );

      const unloadRate =
        struct.structureId === 'refinery'
          ? REFINERY_UNLOAD_RATE_PER_SECOND
          : CNC_UNLOAD_RATE_PER_SECOND;
      const unloadAmount = Math.min(harvester.cargoAmount, unloadRate * deltaSeconds);
      harvester.cargoAmount = Math.max(0, harvester.cargoAmount - unloadAmount);
      harvester.depositAccumulator += unloadAmount;

      const wholeUnits = Math.floor(harvester.depositAccumulator + 1e-9);
      if (wholeUnits > 0) {
        harvester.depositAccumulator -= wholeUnits;
        const player = this.players.get(harvester.ownerId);
        if (player) {
          if (harvester.cargoType === 'ore') {
            player.ore += wholeUnits;
          } else {
            player.crystal += wholeUnits;
          }
        }
      }

      if (harvester.cargoAmount <= 1e-6) {
        harvester.cargoAmount = 0;
        harvester.depositAccumulator = 0;
        this.removeHarvesterFromDockingLists(harvester.id, struct);

        const player = this.players.get(harvester.ownerId);
        if (struct.targetResource !== 'auto') {
          harvester.cargoType = struct.targetResource;
        } else if (player) {
          harvester.cargoType =
            player.crystal * 1.4 < player.ore ? 'crystal' : 'ore';
        }
        harvester.targetBeltId = null;
        harvester.state = 'flying_to_belt';
      }
    }
  }

  public getMaxConcurrentDocks(structure: OrbitalStructureInstance): number {
    if (structure.structureId === 'refinery') {
      return REFINERY_MAX_CONCURRENT_DOCKS;
    }
    if (structure.structureId === 'command_and_control') {
      return MATCH_PRESETS[this.presetId].cncMaxConcurrentDocks;
    }
    return 0;
  }

  private enterPlatformDockOrQueue(
    harvester: HarvesterUnitState,
    structure: OrbitalStructureInstance,
  ): void {
    const maxDocks = this.getMaxConcurrentDocks(structure);

    if (structure.activeDockingHarvesterIds.includes(harvester.id)) {
      harvester.state = 'unloading';
      return;
    }

    if (
      structure.activeDockingHarvesterIds.length < maxDocks &&
      structure.queuedDockingHarvesterIds.length === 0
    ) {
      structure.activeDockingHarvesterIds.push(harvester.id);
      harvester.state = 'unloading';
    } else {
      if (!structure.queuedDockingHarvesterIds.includes(harvester.id)) {
        structure.queuedDockingHarvesterIds.push(harvester.id);
      }
      harvester.state = 'waiting_to_unload';
    }
  }

  private selectBestBeltInSystem(
    harvester: HarvesterUnitState,
  ): AsteroidMiningBeltNode | undefined {
    const candidates = this.miningBelts.filter(
      (b) => b.systemId === harvester.currentSystemId && b.remainingReserves > 0,
    );
    if (candidates.length === 0) {
      return undefined;
    }

    const occupiedBeltIds = new Set(
      this.harvesters
        .filter((h) => h.id !== harvester.id && h.targetBeltId !== null)
        .map((h) => h.targetBeltId),
    );

    const matchingResource = candidates.filter(
      (b) => b.resourceType === harvester.cargoType && !occupiedBeltIds.has(b.id),
    );
    const pool =
      matchingResource.length > 0
        ? matchingResource
        : candidates.filter((b) => b.resourceType === harvester.cargoType);

    if (pool.length === 0) {
      // If the starter system has run out of this resource (e.g. Crystals), check if the Central Nexus has it;
      // returning undefined triggers automatic wormhole transit into the Central Nexus.
      const hubHasResource =
        harvester.currentSystemId !== 'system_central_hub' &&
        this.miningBelts.some(
          (b) =>
            b.systemId === 'system_central_hub' &&
            b.resourceType === harvester.cargoType &&
            b.remainingReserves > 0,
        );
      if (hubHasResource) {
        return undefined;
      }
    }

    const finalPool = pool.length > 0 ? pool : candidates;

    let best = finalPool[0];
    let bestDist = Infinity;
    for (const b of finalPool) {
      const d = Math.hypot(
        b.position.x - harvester.position.x,
        b.position.z - harvester.position.z,
      );
      if (d < bestDist) {
        bestDist = d;
        best = b;
      }
    }
    return best;
  }

  private findNearestFriendlyDropoffInSystem(
    ownerId: PlayerSlotId,
    systemId: string,
    fromPos: Vector2D,
  ): { readonly planetState: PlanetRuntimeState; readonly structure: OrbitalStructureInstance } | undefined {
    let bestPlanet: PlanetRuntimeState | undefined;
    let bestStruct: OrbitalStructureInstance | undefined;
    let bestDist = Infinity;

    for (const p of this.planets.values()) {
      if (p.planet.systemId !== systemId || p.ownerId !== ownerId) {
        continue;
      }
      for (const s of p.structures) {
        if (
          !s.isComplete ||
          (s.structureId !== 'refinery' && s.structureId !== 'command_and_control')
        ) {
          continue;
        }
        const sPos = this.getStructureWorldPosition(p, s);
        const d = Math.hypot(sPos.x - fromPos.x, sPos.z - fromPos.z);
        if (d < bestDist) {
          bestDist = d;
          bestPlanet = p;
          bestStruct = s;
        }
      }
    }

    if (bestPlanet && bestStruct) {
      return { planetState: bestPlanet, structure: bestStruct };
    }
    return undefined;
  }

  private movePositionTowards(
    harvester: HarvesterUnitState,
    target: Vector2D,
    maxStep: number,
    arrivalRadius = 2.0,
  ): boolean {
    const dx = target.x - harvester.position.x;
    const dz = target.z - harvester.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist <= arrivalRadius + maxStep) {
      harvester.position = {
        x: target.x - (dx / Math.max(0.001, dist)) * arrivalRadius,
        z: target.z - (dz / Math.max(0.001, dist)) * arrivalRadius,
      };
      return true;
    }
    const nx = dx / dist;
    const nz = dz / dist;
    harvester.headingRadians = Math.atan2(nx, nz);
    harvester.position = {
      x: harvester.position.x + nx * maxStep,
      z: harvester.position.z + nz * maxStep,
    };
    return false;
  }
}
