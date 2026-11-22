import {
  DEEP_SPACE_STRUCTURES,
  MATCH_PRESETS,
  ORBITAL_STRUCTURES,
  PLANET_CLASSES,
  SHIP_CLASSES,
  type CombatShipClassId,
  type DeepSpaceStructureId,
  type MatchPresetId,
  type OrbitalStructureId,
  type ShipClassId,
} from '../config/index.ts';
import type {
  FleetHullClassId,
  FleetStance,
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
import {
  type PlanetaryObstacle,
  computeObstacleAwareStep,
  findWormholeHop,
} from './navigation.ts';
import {
  type WeaponVisualKind,
  applyWeaponDamage,
  classifyWeaponVisualKind,
  computeHitProbability,
  nextCombatRandom,
  scoreCombatTargetPriority,
} from './combat.ts';

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
export const DOCKYARD_MAX_PARALLEL_BAYS = 2;
export const SMALLEST_FIRST_FLEET_HULLS: readonly FleetHullClassId[] = [
  'destroyer',
  'cruiser',
  'carrier',
  'dreadnought',
];

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

export const SHIELD_REGEN_OUT_OF_COMBAT_DELAY_SECONDS = 6.0;
export const LOGISTICS_HUB_REPAIR_PER_SECOND = 8.0;
export const LOGISTICS_HUB_FIGHTER_CAPACITY = 4;

export interface CombatVisualEvent {
  readonly id: number;
  readonly type: 'weapon_fire' | 'shield_impact' | 'hull_explosion';
  readonly systemId: string;
  readonly fromPos: Vector2D;
  readonly toPos: Vector2D;
  readonly targetId?: string;
  readonly weaponKind?: WeaponVisualKind;
  readonly targetRadius?: number;
  readonly ownerId: PlayerSlotId;
  readonly timestampSeconds: number;
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
  weaponCooldownSeconds?: number;
  lastDamageTakenAtSeconds?: number;
  currentTargetId?: string | null;
  currentTargetPos?: Vector2D | null;
  fighterReplenishCooldownSeconds?: number;
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
  readonly autoRepeat?: boolean;
  readonly targetFleetId?: string;
}

export interface DockyardWaypoint {
  readonly systemId: string;
  readonly position: Vector2D;
}

export interface DockyardRallyPoint {
  readonly systemId: string;
  readonly position: Vector2D;
  readonly stance: FleetStance;
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
  rallyPoint?: DockyardRallyPoint | null;
  patrolWaypoints?: readonly DockyardWaypoint[];
  fleetStance?: FleetStance;
  /** When true (default for Orbital Dockyards), automatically builds ships for active Fleet templates. */
  fleetProductionEnabled?: boolean;
  pdCooldownSeconds?: number;
  heavyCooldownSeconds?: number;
  lastDamageTakenAtSeconds?: number;
  currentTargetId?: string | null;
  currentTargetPos?: Vector2D | null;
}

export type CombatShipActivityState =
  | 'moving_to_rally'
  | 'holding_position'
  | 'patrolling'
  | 'transiting_wormhole';

export type FleetOrderType = 'rally' | 'move' | 'attack' | 'patrol';

export interface FleetInstance {
  readonly id: string;
  name: string;
  readonly ownerId: PlayerSlotId;
  rallySystemId: string;
  rallyPosition: Vector2D;
  stance: FleetStance;
  autoResupply: boolean;
  readonly desiredCounts: Record<FleetHullClassId, number>;
  /** Tracks how many hulls of each class have already been produced for initial fill when autoResupply is OFF. */
  readonly initialBuiltCounts: Record<FleetHullClassId, number>;
  orderType: FleetOrderType;
  orderSystemId: string;
  orderPosition: Vector2D;
  attackTargetId: string | null;
  patrolWaypoints: readonly DockyardWaypoint[];
  patrolIndex: number;
}

export interface CombatShipUnitState {
  readonly id: string;
  readonly shipClassId: CombatShipClassId;
  readonly ownerId: PlayerSlotId;
  readonly homeDockyardId: string;
  fleetId: string | null;
  inCombat: boolean;
  currentSystemId: string;
  position: Vector2D;
  headingRadians: number;
  currentSpeed: number;
  shields: number;
  readonly maxShields: number;
  hull: number;
  readonly maxHull: number;
  stance: FleetStance;
  state: CombatShipActivityState;
  targetSystemId: string;
  targetPosition: Vector2D;
  patrolWaypoints: readonly DockyardWaypoint[];
  patrolIndex: number;
  readonly formationOffset: Vector2D;
  weaponCooldowns: number[];
  lastDamageTakenAtSeconds: number;
  currentTargetId: string | null;
  currentTargetPos: Vector2D | null;
  tetherHostId: string | null;
  fighterReplenishCooldownSeconds: number;
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
  hull: number;
  readonly maxHull: number;
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
  private readonly combatShips: CombatShipUnitState[] = [];
  private readonly fleets: FleetInstance[] = [];
  private readonly pendingCombatEvents: CombatVisualEvent[] = [];
  private readonly lastCombatActivityByPlayer = new Map<PlayerSlotId, number>();
  private readonly defeatedPlayers = new Set<PlayerSlotId>();
  private readonly combatRng = { seed: 0x57a2c01d };
  private nextCombatEventId = 1;
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

  public isPlayerDefeated(playerId: PlayerSlotId): boolean {
    return this.defeatedPlayers.has(playerId);
  }

  /**
   * Returns true if `playerId` fired or took hostile weapon fire within the last `windowSeconds`.
   * Used by the client music controller to dynamically switch between ambient and combat tracks.
   */
  public isPlayerInActiveCombat(playerId: PlayerSlotId, windowSeconds = 2.0): boolean {
    const lastAt = this.lastCombatActivityByPlayer.get(playerId);
    return lastAt !== undefined && this.elapsedSeconds - lastAt <= windowSeconds;
  }

  /**
   * Drains and returns all pending combat visual events (weapon tracers, shield impact ripples,
   * and hull explosions) for the 3D VFX renderer to consume once per frame.
   */
  public consumeCombatEvents(): CombatVisualEvent[] {
    if (this.pendingCombatEvents.length === 0) {
      return [];
    }
    return this.pendingCombatEvents.splice(0, this.pendingCombatEvents.length);
  }

  public peekCombatEvents(): readonly CombatVisualEvent[] {
    return this.pendingCombatEvents;
  }

  /**
   * Directly spawns a combat ship at a coordinate (used by Carrier/Hub fighter wings & headless RPS tests).
   */
  public spawnCombatShipDirect(
    ownerId: PlayerSlotId,
    systemId: string,
    position: Vector2D,
    shipClassId: CombatShipClassId,
    stance: FleetStance = 'aggressive',
    tetherHostId: string | null = null,
    fleetId: string | null = null,
  ): CombatShipUnitState {
    const shipCfg = SHIP_CLASSES[shipClassId];
    const shipIndex = this.combatShips.length;
    const formAngle = (shipIndex * 2.39996) % (Math.PI * 2);
    const formRadius = shipClassId === 'fighter' ? 14 + (shipIndex % 4) * 5 : 10 + (shipIndex % 4) * 6;
    const ship: CombatShipUnitState = {
      id: `ship_${this.nextEntityCounter++}`,
      shipClassId,
      ownerId,
      homeDockyardId: tetherHostId ?? 'direct_spawn',
      fleetId,
      inCombat: false,
      currentSystemId: systemId,
      position: { x: position.x, z: position.z },
      headingRadians: formAngle,
      currentSpeed: shipCfg.speed,
      shields: shipCfg.maxShields,
      maxShields: shipCfg.maxShields,
      hull: shipCfg.maxHull,
      maxHull: shipCfg.maxHull,
      stance,
      state: 'holding_position',
      targetSystemId: systemId,
      targetPosition: { x: position.x, z: position.z },
      patrolWaypoints: [],
      patrolIndex: 0,
      formationOffset: {
        x: Math.cos(formAngle) * formRadius,
        z: Math.sin(formAngle) * formRadius,
      },
      weaponCooldowns: shipCfg.weapons.map(() => 0),
      lastDamageTakenAtSeconds: -999,
      currentTargetId: null,
      currentTargetPos: null,
      tetherHostId,
      fighterReplenishCooldownSeconds: 0,
    };
    this.combatShips.push(ship);
    return ship;
  }

  /**
   * Fleet Battle Simulator: clears any prior simulator ships, spawns customizable Friendly (player_1)
   * and Hostile (player_2) fleets facing each other in clear space in `systemId`, and returns the
   * arena center coordinate for camera framing.
   */
  public launchFleetBattleSimulator(
    systemId: string,
    friendlyCounts: Partial<Record<CombatShipClassId, number>>,
    hostileCounts: Partial<Record<CombatShipClassId, number>>,
  ): {
    readonly center: Vector2D;
    readonly friendlySpawned: number;
    readonly hostileSpawned: number;
  } {
    this.clearBattleSimulatorShips();

    const center: Vector2D = { x: 480, z: -340 };
    const classesInOrder: readonly CombatShipClassId[] = [
      'fighter',
      'destroyer',
      'cruiser',
      'carrier',
      'dreadnought',
    ];

    const spawnSide = (
      ownerId: PlayerSlotId,
      counts: Partial<Record<CombatShipClassId, number>>,
      sideSign: -1 | 1,
    ): number => {
      let total = 0;
      const baseX = center.x + sideSign * 140;
      let colIdx = 0;

      for (const cls of classesInOrder) {
        const rawCount = counts[cls] ?? 0;
        const count = Math.max(0, Math.min(20, Math.floor(rawCount)));
        if (count === 0) {
          continue;
        }
        const spacingZ =
          cls === 'dreadnought'
            ? 34
            : cls === 'carrier'
              ? 28
              : cls === 'cruiser'
                ? 24
                : cls === 'destroyer'
                  ? 18
                  : 12;
        const colX = baseX + sideSign * colIdx * 28;
        colIdx += 1;

        for (let i = 0; i < count; i++) {
          const offsetZ = (i - (count - 1) * 0.5) * spacingZ;
          const ship = this.spawnCombatShipDirect(
            ownerId,
            systemId,
            { x: colX, z: center.z + offsetZ },
            cls,
            'aggressive',
            null,
            null,
          );
          (ship as { homeDockyardId: string }).homeDockyardId = 'battle_simulator';
          ship.headingRadians = sideSign < 0 ? Math.PI / 2 : -Math.PI / 2;
          total += 1;
        }
      }
      return total;
    };

    const friendlySpawned = spawnSide('player_1', friendlyCounts, -1);
    const hostileSpawned = spawnSide('player_2', hostileCounts, 1);
    return { center, friendlySpawned, hostileSpawned };
  }

  /** Removes all ships spawned by the Fleet Battle Simulator (including any Carrier-launched wings). */
  public clearBattleSimulatorShips(): number {
    const simShipIds = new Set(
      this.combatShips
        .filter((s) => s.homeDockyardId === 'battle_simulator')
        .map((s) => s.id),
    );
    const toRemove = this.combatShips
      .filter(
        (s) =>
          s.homeDockyardId === 'battle_simulator' ||
          (s.tetherHostId !== null && simShipIds.has(s.tetherHostId)),
      )
      .map((s) => s.id);

    for (const id of toRemove) {
      const idx = this.combatShips.findIndex((s) => s.id === id);
      if (idx !== -1) {
        this.combatShips.splice(idx, 1);
      }
    }
    return toRemove.length;
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

  public getAllCombatShips(): readonly CombatShipUnitState[] {
    return this.combatShips;
  }

  public getCombatShipsInSystem(systemId: string): readonly CombatShipUnitState[] {
    return this.combatShips.filter((s) => s.currentSystemId === systemId);
  }

  public getCombatShipById(shipId: string): CombatShipUnitState | undefined {
    return this.combatShips.find((s) => s.id === shipId);
  }

  public getAllFleets(): readonly FleetInstance[] {
    return this.fleets;
  }

  public getFleetsForPlayer(playerId: PlayerSlotId): readonly FleetInstance[] {
    return this.fleets.filter((f) => f.ownerId === playerId);
  }

  public getFleetById(fleetId: string): FleetInstance | undefined {
    return this.fleets.find((f) => f.id === fleetId);
  }

  public getShipsInFleet(fleetId: string): readonly CombatShipUnitState[] {
    return this.combatShips.filter((s) => s.fleetId === fleetId);
  }

  /**
   * Returns the live centroid position of ships currently in `fleetId`, or its Rally Point if empty.
   */
  public getFleetLiveAnchor(
    fleetId: string,
  ): { readonly systemId: string; readonly position: Vector2D } | null {
    const fleet = this.getFleetById(fleetId);
    if (!fleet) {
      return null;
    }
    const members = this.getShipsInFleet(fleetId);
    if (members.length === 0) {
      return {
        systemId: fleet.orderSystemId,
        position: fleet.orderPosition,
      };
    }
    // Prefer members in the fleet's ordered system; otherwise use the first member's system
    const inOrderSys = members.filter((m) => m.currentSystemId === fleet.orderSystemId);
    const group = inOrderSys.length > 0 ? inOrderSys : [members[0]!];
    const systemId = group[0]!.currentSystemId;
    let sumX = 0;
    let sumZ = 0;
    for (const m of group) {
      sumX += m.position.x;
      sumZ += m.position.z;
    }
    return {
      systemId,
      position: { x: sumX / group.length, z: sumZ / group.length },
    };
  }

  /**
   * Cruise speed of a fleet equals its slowest live ship so formations travel and arrive together.
   */
  public getFleetCruiseSpeed(fleetId: string): number {
    const members = this.getShipsInFleet(fleetId);
    if (members.length === 0) {
      return 0;
    }
    let minSpeed = Infinity;
    for (const m of members) {
      const spd = SHIP_CLASSES[m.shipClassId].speed;
      if (spd < minSpeed) {
        minSpeed = spd;
      }
    }
    return Number.isFinite(minSpeed) ? minSpeed : 0;
  }

  /**
   * Destroys a combat ship (used by Step 4 combat resolution & tests), refunding Fleet Supply.
   * If its fleet has `autoResupply` enabled, the next tick's distributed shipyard scheduler
   * automatically queues a replacement at the nearest available Orbital Dockyard.
   */
  public destroyCombatShip(shipId: string): boolean {
    const idx = this.combatShips.findIndex((s) => s.id === shipId);
    if (idx === -1) {
      return false;
    }
    const [removed] = this.combatShips.splice(idx, 1);
    if (removed) {
      const player = this.players.get(removed.ownerId);
      const cfg = SHIP_CLASSES[removed.shipClassId];
      if (player) {
        player.supplyUsed = Math.max(0, player.supplyUsed - cfg.supplyCost);
      }
    }
    return true;
  }

  public getPlayerTechModuleCount(playerId: PlayerSlotId): number {
    let count = 0;
    for (const planetState of this.planets.values()) {
      for (const s of planetState.structures) {
        if (
          s.ownerId === playerId &&
          s.structureId === 'tech_module' &&
          s.isComplete
        ) {
          count += 1;
        }
      }
    }
    return count;
  }

  public hasPlayerFighterSupport(playerId: PlayerSlotId): boolean {
    const hasCompletedHub = this.deepSpaceStructures.some(
      (ds) =>
        ds.ownerId === playerId &&
        ds.structureId === 'logistics_hub' &&
        ds.isComplete,
    );
    if (hasCompletedHub) {
      return true;
    }
    return this.combatShips.some(
      (ship) => ship.ownerId === playerId && ship.shipClassId === 'carrier',
    );
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
        return this.handleQueueCombatShip(
          command.playerId,
          command.dockyardOrRefineryId,
          command.shipClassId,
          command.autoRepeat,
        );
      case 'SET_RALLY_POINT':
        return this.handleSetRallyPoint(
          command.playerId,
          command.dockyardId,
          command.targetSystemId,
          command.targetPosition,
          command.stance,
        );
      case 'SET_PATROL_ROUTE':
        return this.handleSetPatrolRoute(
          command.playerId,
          command.dockyardId,
          command.waypoints,
          command.stance,
        );
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
      case 'CREATE_FLEET':
        return this.handleCreateFleet(
          command.playerId,
          command.rallySystemId,
          command.rallyPosition,
          command.name,
          command.stance,
          command.autoResupply,
        );
      case 'UPDATE_FLEET_TEMPLATE':
        return this.handleUpdateFleetTemplate(
          command.playerId,
          command.fleetId,
          command.desiredCounts,
        );
      case 'SET_FLEET_STANCE':
        return this.handleSetFleetStance(
          command.playerId,
          command.fleetId,
          command.stance,
        );
      case 'SET_FLEET_RESUPPLY':
        return this.handleSetFleetResupply(
          command.playerId,
          command.fleetId,
          command.autoResupply,
        );
      case 'ORDER_FLEET_MOVE':
        return this.handleOrderFleetMove(
          command.playerId,
          command.fleetId,
          command.targetSystemId,
          command.targetPosition,
        );
      case 'ORDER_FLEET_ATTACK':
        return this.handleOrderFleetAttack(
          command.playerId,
          command.fleetId,
          command.targetSystemId,
          command.targetPosition,
          command.targetEntityId,
        );
      case 'ORDER_FLEET_PATROL':
        return this.handleOrderFleetPatrol(
          command.playerId,
          command.fleetId,
          command.waypoints,
        );
      case 'SPLIT_FLEET':
        return this.handleSplitFleet(
          command.playerId,
          command.sourceFleetId,
          command.newFleetName,
        );
      case 'MERGE_FLEETS':
        return this.handleMergeFleets(
          command.playerId,
          command.sourceFleetId,
          command.targetFleetId,
        );
      case 'DISBAND_FLEET':
        return this.handleDisbandFleet(command.playerId, command.fleetId);
      case 'SET_DOCKYARD_FLEET_BUILDING':
        return this.handleSetDockyardFleetBuilding(
          command.playerId,
          command.dockyardId,
          command.enabled,
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

    // 2. Advance orbital structure construction timers & per-platform ship build queues
    // Orbital Dockyards build up to 2 ships simultaneously (1 per dry-dock slipway); C&C/Refineries build 1 at a time.
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
          const maxParallel =
            structure.structureId === 'orbital_dockyard'
              ? DOCKYARD_MAX_PARALLEL_BAYS
              : 1;
          const activeCount = Math.min(maxParallel, structure.productionQueue.length);
          const completedOrders: ShipQueueItem[] = [];

          for (let i = 0; i < activeCount; i++) {
            const order = structure.productionQueue[i];
            if (!order) continue;
            order.progressSeconds += deltaSeconds;
            if (order.progressSeconds >= order.buildTimeSeconds) {
              completedOrders.push(order);
            }
          }

          for (const done of completedOrders) {
            const idx = structure.productionQueue.indexOf(done);
            if (idx !== -1) {
              structure.productionQueue.splice(idx, 1);
            }
            if (done.shipClassId === 'harvester') {
              this.spawnHarvesterAtStructure(
                structure.ownerId,
                planetState,
                structure,
              );
            } else {
              this.spawnCombatShipAtDockyard(
                structure.ownerId,
                planetState,
                structure,
                done.shipClassId,
                done.targetFleetId ?? null,
              );
              if (done.autoRepeat) {
                this.handleQueueCombatShip(
                  structure.ownerId,
                  structure.id,
                  done.shipClassId,
                  true,
                  done.targetFleetId,
                );
              }
            }
          }
        }
      }
    }

    // 2a. Distributed smallest-first shipyard scheduler for player Fleet Templates & Auto-Resupply
    this.scheduleFleetProduction();

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

    // 4. Auto-launch & tether Carrier / Logistics Hub Fighter wings
    this.updateCarrierAndHubFighters(deltaSeconds);

    // 5. Resolve 5-class RPS combat, stances, Defence Towers, orbital weapons, shield regen & hub repair
    this.updateCombatAndDefences(deltaSeconds);

    // 6. Update combat fleet navigation & aggressive pursuit (Rally Points, Patrol Routes & Cross-System Wormholes)
    for (const ship of this.combatShips) {
      this.updateCombatShip(ship, deltaSeconds);
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

    const isSlotOccupied = (idx: number): boolean =>
      planetState.structures.some((s) => s.occupiedSlots.includes(idx));

    if (isSlotOccupied(slotIndex)) {
      return {
        ok: false,
        reason: `Orbital slot ${slotIndex + 1} is already occupied`,
      };
    }

    let requiredSlots: number[];
    if (config.slotCost === 2) {
      const nextSlot = (slotIndex + 1) % totalSlots;
      const prevSlot = (slotIndex - 1 + totalSlots) % totalSlots;
      if (!isSlotOccupied(nextSlot)) {
        requiredSlots = [slotIndex, nextSlot];
      } else if (!isSlotOccupied(prevSlot)) {
        // Keep ring order [prevSlot, slotIndex] so orbital midpoint calculations work across wrap-around
        requiredSlots = [prevSlot, slotIndex];
      } else {
        return {
          ok: false,
          reason: `No adjacent empty slot next to Orbital slot ${slotIndex + 1} (slots ${prevSlot + 1} and ${nextSlot + 1} are occupied)`,
        };
      }
    } else {
      requiredSlots = [slotIndex];
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
      primarySlotIndex: requiredSlots[0] ?? slotIndex,
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
      fleetProductionEnabled: structureId === 'orbital_dockyard' ? true : undefined,
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
      // Refund resources and reserved fleet supply immediately
      const shipCfg = SHIP_CLASSES[removed.shipClassId];
      player.ore += shipCfg.cost.ore;
      player.crystal += shipCfg.cost.crystal;
      player.supplyUsed = Math.max(0, player.supplyUsed - shipCfg.supplyCost);
    }

    return { ok: true };
  }

  /**
   * Side-effect-free validation for queuing a combat ship at an Orbital Dockyard.
   * Shared by both `QUEUE_SHIP` commands and the Orbital Dockyard HUD panel.
   */
  public validateCombatShipOrder(
    playerId: PlayerSlotId,
    dockyardId: string,
    shipClassId: CombatShipClassId,
  ): CommandResult {
    const player = this.players.get(playerId);
    const found = this.getStructureById(dockyardId);
    if (!player || !found || found.structure.ownerId !== playerId) {
      return { ok: false, reason: 'Orbital Dockyard not found or not owned by player' };
    }
    if (found.structure.structureId !== 'orbital_dockyard' || !found.structure.isComplete) {
      return { ok: false, reason: 'Requires a completed Orbital Dockyard' };
    }
    if (found.structure.productionQueue.length >= MAX_SHIP_PRODUCTION_QUEUE_SIZE) {
      return {
        ok: false,
        reason: `Production queue is full (max ${MAX_SHIP_PRODUCTION_QUEUE_SIZE})`,
      };
    }

    const shipCfg = SHIP_CLASSES[shipClassId];
    const techCount = this.getPlayerTechModuleCount(playerId);
    if (techCount < shipCfg.requiredTechModuleCount) {
      return {
        ok: false,
        reason: `Requires ${shipCfg.requiredTechModuleCount} completed Tech Module${shipCfg.requiredTechModuleCount > 1 ? 's' : ''}`,
      };
    }

    if (shipCfg.requiresCarrierOrLogisticsHub && !this.hasPlayerFighterSupport(playerId)) {
      return {
        ok: false,
        reason: 'Fighters require a completed Logistics Hub or Fleet Carrier',
      };
    }

    if (player.supplyUsed + shipCfg.supplyCost > player.supplyCap) {
      return {
        ok: false,
        reason: `Insufficient Fleet Supply (requires ${shipCfg.supplyCost}, ${player.supplyCap - player.supplyUsed} free)`,
      };
    }

    if (player.ore < shipCfg.cost.ore || player.crystal < shipCfg.cost.crystal) {
      return {
        ok: false,
        reason: `Insufficient Ore or Crystals for ${shipCfg.displayName}`,
      };
    }

    return { ok: true };
  }

  private handleQueueCombatShip(
    playerId: PlayerSlotId,
    dockyardId: string,
    shipClassId: CombatShipClassId,
    autoRepeat: boolean,
    targetFleetId?: string,
  ): CommandResult {
    const validation = this.validateCombatShipOrder(playerId, dockyardId, shipClassId);
    if (!validation.ok) {
      return validation;
    }

    const player = this.players.get(playerId)!;
    const found = this.getStructureById(dockyardId)!;
    const shipCfg = SHIP_CLASSES[shipClassId];

    player.ore -= shipCfg.cost.ore;
    player.crystal -= shipCfg.cost.crystal;
    player.supplyUsed += shipCfg.supplyCost;

    found.structure.productionQueue.push({
      id: `queue_${this.nextEntityCounter++}`,
      shipClassId,
      buildTimeSeconds: shipCfg.buildTimeSeconds,
      progressSeconds: 0,
      autoRepeat,
      targetFleetId,
    });

    return { ok: true };
  }

  private handleCreateFleet(
    playerId: PlayerSlotId,
    rallySystemId: string,
    rallyPosition: Vector2D,
    name?: string,
    stance: FleetStance = 'aggressive',
    autoResupply = true,
  ): CommandResult {
    if (!this.players.has(playerId)) {
      return { ok: false, reason: 'Invalid player' };
    }
    if (!this.galaxy.systems.some((s) => s.id === rallySystemId)) {
      return { ok: false, reason: 'Unknown rally star system' };
    }

    const playerFleetNum = this.getFleetsForPlayer(playerId).length + 1;
    const fleet: FleetInstance = {
      id: `fleet_${this.nextEntityCounter++}`,
      name: name?.trim() || `Fleet #${playerFleetNum}`,
      ownerId: playerId,
      rallySystemId,
      rallyPosition: { x: rallyPosition.x, z: rallyPosition.z },
      stance,
      autoResupply,
      desiredCounts: {
        destroyer: 0,
        cruiser: 0,
        carrier: 0,
        dreadnought: 0,
      },
      initialBuiltCounts: {
        destroyer: 0,
        cruiser: 0,
        carrier: 0,
        dreadnought: 0,
      },
      orderType: 'rally',
      orderSystemId: rallySystemId,
      orderPosition: { x: rallyPosition.x, z: rallyPosition.z },
      attackTargetId: null,
      patrolWaypoints: [],
      patrolIndex: 0,
    };
    this.fleets.push(fleet);
    return { ok: true };
  }

  private handleUpdateFleetTemplate(
    playerId: PlayerSlotId,
    fleetId: string,
    desiredCounts: Partial<Record<FleetHullClassId, number>>,
  ): CommandResult {
    const fleet = this.getFleetById(fleetId);
    if (!fleet || fleet.ownerId !== playerId) {
      return { ok: false, reason: 'Fleet not found or not owned by player' };
    }
    for (const hull of SMALLEST_FIRST_FLEET_HULLS) {
      const nextVal = desiredCounts[hull];
      if (nextVal !== undefined) {
        const clamped = Math.max(0, Math.min(30, Math.floor(nextVal)));
        fleet.desiredCounts[hull] = clamped;
        // If user lowered the template below initialBuiltCounts, clamp initialBuiltCounts down too
        if (fleet.initialBuiltCounts[hull] > clamped) {
          fleet.initialBuiltCounts[hull] = clamped;
        }
      }
    }
    return { ok: true };
  }

  private handleSetFleetStance(
    playerId: PlayerSlotId,
    fleetId: string,
    stance: FleetStance,
  ): CommandResult {
    const fleet = this.getFleetById(fleetId);
    if (!fleet || fleet.ownerId !== playerId) {
      return { ok: false, reason: 'Fleet not found or not owned by player' };
    }
    fleet.stance = stance;
    for (const ship of this.combatShips) {
      if (ship.fleetId === fleetId) {
        ship.stance = stance;
      }
    }
    return { ok: true };
  }

  private handleSetFleetResupply(
    playerId: PlayerSlotId,
    fleetId: string,
    autoResupply: boolean,
  ): CommandResult {
    const fleet = this.getFleetById(fleetId);
    if (!fleet || fleet.ownerId !== playerId) {
      return { ok: false, reason: 'Fleet not found or not owned by player' };
    }
    fleet.autoResupply = autoResupply;
    return { ok: true };
  }

  private handleOrderFleetMove(
    playerId: PlayerSlotId,
    fleetId: string,
    targetSystemId: string,
    targetPosition: Vector2D,
  ): CommandResult {
    const fleet = this.getFleetById(fleetId);
    if (!fleet || fleet.ownerId !== playerId) {
      return { ok: false, reason: 'Fleet not found or not owned by player' };
    }
    if (!this.galaxy.systems.some((s) => s.id === targetSystemId)) {
      return { ok: false, reason: 'Unknown target star system' };
    }
    fleet.orderType = 'move';
    fleet.orderSystemId = targetSystemId;
    fleet.orderPosition = { x: targetPosition.x, z: targetPosition.z };
    fleet.attackTargetId = null;
    fleet.patrolWaypoints = [];
    fleet.patrolIndex = 0;

    for (const ship of this.combatShips) {
      if (ship.fleetId === fleetId) {
        ship.patrolWaypoints = [];
        ship.patrolIndex = 0;
        ship.targetSystemId = targetSystemId;
        ship.targetPosition = { x: targetPosition.x, z: targetPosition.z };
        ship.state =
          ship.currentSystemId === targetSystemId
            ? 'moving_to_rally'
            : 'transiting_wormhole';
      }
    }
    return { ok: true };
  }

  private handleOrderFleetAttack(
    playerId: PlayerSlotId,
    fleetId: string,
    targetSystemId: string,
    targetPosition: Vector2D,
    targetEntityId?: string,
  ): CommandResult {
    const fleet = this.getFleetById(fleetId);
    if (!fleet || fleet.ownerId !== playerId) {
      return { ok: false, reason: 'Fleet not found or not owned by player' };
    }
    if (!this.galaxy.systems.some((s) => s.id === targetSystemId)) {
      return { ok: false, reason: 'Unknown target star system' };
    }
    fleet.orderType = 'attack';
    fleet.orderSystemId = targetSystemId;
    fleet.orderPosition = { x: targetPosition.x, z: targetPosition.z };
    fleet.attackTargetId = targetEntityId ?? null;
    fleet.patrolWaypoints = [];
    fleet.patrolIndex = 0;

    for (const ship of this.combatShips) {
      if (ship.fleetId === fleetId) {
        ship.patrolWaypoints = [];
        ship.patrolIndex = 0;
        ship.targetSystemId = targetSystemId;
        ship.targetPosition = { x: targetPosition.x, z: targetPosition.z };
        ship.state =
          ship.currentSystemId === targetSystemId
            ? 'moving_to_rally'
            : 'transiting_wormhole';
      }
    }
    return { ok: true };
  }

  private handleOrderFleetPatrol(
    playerId: PlayerSlotId,
    fleetId: string,
    waypoints: readonly DockyardWaypoint[],
  ): CommandResult {
    const fleet = this.getFleetById(fleetId);
    if (!fleet || fleet.ownerId !== playerId) {
      return { ok: false, reason: 'Fleet not found or not owned by player' };
    }
    if (waypoints.length < 2) {
      return { ok: false, reason: 'Patrol route requires at least 2 waypoints' };
    }
    for (const wp of waypoints) {
      if (!this.galaxy.systems.some((s) => s.id === wp.systemId)) {
        return { ok: false, reason: 'Patrol route contains an unknown star system' };
      }
    }

    const copied: DockyardWaypoint[] = waypoints.map((wp) => ({
      systemId: wp.systemId,
      position: { x: wp.position.x, z: wp.position.z },
    }));
    const firstWp = copied[0]!;
    fleet.orderType = 'patrol';
    fleet.orderSystemId = firstWp.systemId;
    fleet.orderPosition = { x: firstWp.position.x, z: firstWp.position.z };
    fleet.attackTargetId = null;
    fleet.patrolWaypoints = copied;
    fleet.patrolIndex = 0;

    for (const ship of this.combatShips) {
      if (ship.fleetId === fleetId) {
        ship.patrolWaypoints = copied;
        ship.patrolIndex = 0;
        ship.targetSystemId = firstWp.systemId;
        ship.targetPosition = { x: firstWp.position.x, z: firstWp.position.z };
        ship.state =
          ship.currentSystemId === firstWp.systemId
            ? 'patrolling'
            : 'transiting_wormhole';
      }
    }
    return { ok: true };
  }

  private handleSplitFleet(
    playerId: PlayerSlotId,
    sourceFleetId: string,
    newFleetName?: string,
  ): CommandResult {
    const source = this.getFleetById(sourceFleetId);
    if (!source || source.ownerId !== playerId) {
      return { ok: false, reason: 'Source fleet not found or not owned by player' };
    }
    const members = this.getShipsInFleet(sourceFleetId);
    if (members.length < 2) {
      return { ok: false, reason: 'Requires at least 2 ships to split a fleet' };
    }

    // Prefer splitting excess ships above desiredCounts; otherwise split half of the fleet
    const toMove: CombatShipUnitState[] = [];
    for (const hull of SMALLEST_FIRST_FLEET_HULLS) {
      const ofClass = members.filter((m) => m.shipClassId === hull);
      const excess = ofClass.length - source.desiredCounts[hull];
      if (excess > 0) {
        toMove.push(...ofClass.slice(0, excess));
      }
    }
    if (toMove.length === 0) {
      const half = Math.floor(members.length / 2);
      toMove.push(...members.slice(0, half));
    }

    const anchor = this.getFleetLiveAnchor(sourceFleetId) ?? {
      systemId: source.rallySystemId,
      position: source.rallyPosition,
    };
    const newFleetNum = this.getFleetsForPlayer(playerId).length + 1;
    const newFleet: FleetInstance = {
      id: `fleet_${this.nextEntityCounter++}`,
      name: newFleetName?.trim() || `Fleet #${newFleetNum}`,
      ownerId: playerId,
      rallySystemId: anchor.systemId,
      rallyPosition: { x: anchor.position.x + 24, z: anchor.position.z },
      stance: source.stance,
      autoResupply: false,
      desiredCounts: { destroyer: 0, cruiser: 0, carrier: 0, dreadnought: 0 },
      initialBuiltCounts: { destroyer: 0, cruiser: 0, carrier: 0, dreadnought: 0 },
      orderType: 'rally',
      orderSystemId: anchor.systemId,
      orderPosition: { x: anchor.position.x + 24, z: anchor.position.z },
      attackTargetId: null,
      patrolWaypoints: [],
      patrolIndex: 0,
    };

    for (const ship of toMove) {
      ship.fleetId = newFleet.id;
      if (ship.shipClassId !== 'fighter') {
        newFleet.desiredCounts[ship.shipClassId] += 1;
        newFleet.initialBuiltCounts[ship.shipClassId] += 1;
      }
      ship.patrolWaypoints = [];
      ship.targetSystemId = newFleet.rallySystemId;
      ship.targetPosition = { x: newFleet.rallyPosition.x, z: newFleet.rallyPosition.z };
      ship.state =
        ship.currentSystemId === newFleet.rallySystemId
          ? 'moving_to_rally'
          : 'transiting_wormhole';
    }
    this.fleets.push(newFleet);
    return { ok: true };
  }

  private handleMergeFleets(
    playerId: PlayerSlotId,
    sourceFleetId: string,
    targetFleetId: string,
  ): CommandResult {
    if (sourceFleetId === targetFleetId) {
      return { ok: false, reason: 'Cannot merge a fleet into itself' };
    }
    const source = this.getFleetById(sourceFleetId);
    const target = this.getFleetById(targetFleetId);
    if (!source || !target || source.ownerId !== playerId || target.ownerId !== playerId) {
      return { ok: false, reason: 'Fleets not found or not owned by player' };
    }

    const targetAnchor = this.getFleetLiveAnchor(targetFleetId) ?? {
      systemId: target.orderSystemId,
      position: target.orderPosition,
    };

    for (const ship of this.combatShips) {
      if (ship.fleetId === sourceFleetId) {
        ship.fleetId = targetFleetId;
        ship.stance = target.stance;
        ship.patrolWaypoints = target.patrolWaypoints;
        ship.patrolIndex = target.patrolIndex;
        ship.targetSystemId = targetAnchor.systemId;
        ship.targetPosition = { x: targetAnchor.position.x, z: targetAnchor.position.z };
        ship.state =
          ship.currentSystemId === targetAnchor.systemId
            ? target.patrolWaypoints.length >= 2
              ? 'patrolling'
              : 'moving_to_rally'
            : 'transiting_wormhole';
      }
    }

    for (const hull of SMALLEST_FIRST_FLEET_HULLS) {
      target.desiredCounts[hull] += source.desiredCounts[hull];
      target.initialBuiltCounts[hull] += source.initialBuiltCounts[hull];
    }

    const srcIdx = this.fleets.findIndex((f) => f.id === sourceFleetId);
    if (srcIdx !== -1) {
      this.fleets.splice(srcIdx, 1);
    }
    return { ok: true };
  }

  private handleDisbandFleet(
    playerId: PlayerSlotId,
    fleetId: string,
  ): CommandResult {
    const idx = this.fleets.findIndex(
      (f) => f.id === fleetId && f.ownerId === playerId,
    );
    if (idx === -1) {
      return { ok: false, reason: 'Fleet not found or not owned by player' };
    }
    // Cancel any queued builds earmarked for this fleet and refund resources/supply
    for (const planetState of this.planets.values()) {
      for (const s of planetState.structures) {
        if (s.ownerId === playerId && s.structureId === 'orbital_dockyard') {
          const toCancel = s.productionQueue
            .filter((q) => q.targetFleetId === fleetId)
            .map((q) => q.id);
          for (const qId of toCancel) {
            this.handleCancelQueuedShip(playerId, s.id, qId);
          }
        }
      }
    }
    for (const ship of this.combatShips) {
      if (ship.fleetId === fleetId) {
        ship.fleetId = null;
      }
    }
    this.fleets.splice(idx, 1);
    return { ok: true };
  }

  private handleSetDockyardFleetBuilding(
    playerId: PlayerSlotId,
    dockyardId: string,
    enabled: boolean,
  ): CommandResult {
    const found = this.getStructureById(dockyardId);
    if (
      !found ||
      found.structure.ownerId !== playerId ||
      found.structure.structureId !== 'orbital_dockyard'
    ) {
      return { ok: false, reason: 'Requires an owned Orbital Dockyard' };
    }
    found.structure.fleetProductionEnabled = enabled;
    return { ok: true };
  }

  /**
   * Distributed smallest-first shipyard production scheduler.
   * For every fleet that still needs hulls (either initial template fill or Auto-Resupply),
   * finds the nearest available completed Orbital Dockyard with a free parallel bay and queues
   * the smallest missing hull (`destroyer -> cruiser -> carrier -> dreadnought`).
   */
  private scheduleFleetProduction(): void {
    for (const fleet of this.fleets) {
      // Collect all completed Orbital Dockyards belonging to this fleet's owner that have a free bay
      const availableDockyards: {
        readonly planetState: PlanetRuntimeState;
        readonly structure: OrbitalStructureInstance;
        readonly distScore: number;
      }[] = [];

      const anchor = this.getFleetLiveAnchor(fleet.id) ?? {
        systemId: fleet.rallySystemId,
        position: fleet.rallyPosition,
      };

      for (const planetState of this.planets.values()) {
        for (const s of planetState.structures) {
          if (
            s.ownerId === fleet.ownerId &&
            s.structureId === 'orbital_dockyard' &&
            s.isComplete &&
            s.fleetProductionEnabled !== false &&
            s.productionQueue.length < DOCKYARD_MAX_PARALLEL_BAYS
          ) {
            const dockPos = this.getStructureWorldPosition(planetState, s);
            const sameSystemBonus =
              planetState.planet.systemId === anchor.systemId ? 0 : 100000;
            const dist = Math.hypot(
              dockPos.x - anchor.position.x,
              dockPos.z - anchor.position.z,
            );
            availableDockyards.push({
              planetState,
              structure: s,
              distScore: sameSystemBonus + dist,
            });
          }
        }
      }

      if (availableDockyards.length === 0) {
        continue;
      }
      availableDockyards.sort((a, b) => a.distScore - b.distScore);

      // Count live + currently queued ships for this fleet per hull class
      const liveCounts: Record<FleetHullClassId, number> = {
        destroyer: 0,
        cruiser: 0,
        carrier: 0,
        dreadnought: 0,
      };
      for (const ship of this.combatShips) {
        if (ship.fleetId === fleet.id && ship.shipClassId !== 'fighter') {
          liveCounts[ship.shipClassId] += 1;
        }
      }

      const queuedCounts: Record<FleetHullClassId, number> = {
        destroyer: 0,
        cruiser: 0,
        carrier: 0,
        dreadnought: 0,
      };
      for (const planetState of this.planets.values()) {
        for (const s of planetState.structures) {
          if (s.ownerId === fleet.ownerId && s.structureId === 'orbital_dockyard') {
            for (const q of s.productionQueue) {
              if (q.targetFleetId === fleet.id && q.shipClassId !== 'harvester' && q.shipClassId !== 'fighter') {
                queuedCounts[q.shipClassId] += 1;
              }
            }
          }
        }
      }

      // Queue smallest missing hulls first across nearest available Dockyards
      for (const hull of SMALLEST_FIRST_FLEET_HULLS) {
        const desired = fleet.desiredCounts[hull];
        const needed = fleet.autoResupply
          ? desired - (liveCounts[hull] + queuedCounts[hull])
          : desired - (fleet.initialBuiltCounts[hull] + queuedCounts[hull]);
        if (needed <= 0) {
          continue;
        }

        for (let n = 0; n < needed; n++) {
          const freeDock = availableDockyards.find(
            (d) => d.structure.productionQueue.length < DOCKYARD_MAX_PARALLEL_BAYS,
          );
          if (!freeDock) {
            break;
          }
          const res = this.handleQueueCombatShip(
            fleet.ownerId,
            freeDock.structure.id,
            hull,
            false,
            fleet.id,
          );
          if (res.ok) {
            queuedCounts[hull] += 1;
          } else {
            // Stop trying this hull class if resources, tech, or supply cannot satisfy it
            break;
          }
        }
      }
    }
  }

  private handleSetRallyPoint(
    playerId: PlayerSlotId,
    dockyardId: string,
    targetSystemId: string,
    targetPosition: Vector2D,
    stance: FleetStance,
  ): CommandResult {
    const found = this.getStructureById(dockyardId);
    if (
      !found ||
      found.structure.ownerId !== playerId ||
      found.structure.structureId !== 'orbital_dockyard'
    ) {
      return { ok: false, reason: 'Requires an owned Orbital Dockyard' };
    }
    const system = this.galaxy.systems.find((s) => s.id === targetSystemId);
    if (!system) {
      return { ok: false, reason: 'Unknown target star system' };
    }

    found.structure.rallyPoint = {
      systemId: targetSystemId,
      position: { x: targetPosition.x, z: targetPosition.z },
      stance,
    };
    found.structure.patrolWaypoints = [];
    found.structure.fleetStance = stance;

    // Immediately redirect existing ships assigned to this Dockyard to the new Rally Point
    for (const ship of this.combatShips) {
      if (ship.homeDockyardId === dockyardId && ship.ownerId === playerId) {
        ship.stance = stance;
        ship.patrolWaypoints = [];
        ship.patrolIndex = 0;
        ship.targetSystemId = targetSystemId;
        ship.targetPosition = { x: targetPosition.x, z: targetPosition.z };
        ship.state =
          ship.currentSystemId === targetSystemId
            ? 'moving_to_rally'
            : 'transiting_wormhole';
      }
    }

    return { ok: true };
  }

  private handleSetPatrolRoute(
    playerId: PlayerSlotId,
    dockyardId: string,
    waypoints: readonly DockyardWaypoint[],
    stance: FleetStance,
  ): CommandResult {
    const found = this.getStructureById(dockyardId);
    if (
      !found ||
      found.structure.ownerId !== playerId ||
      found.structure.structureId !== 'orbital_dockyard'
    ) {
      return { ok: false, reason: 'Requires an owned Orbital Dockyard' };
    }
    if (waypoints.length < 2) {
      return { ok: false, reason: 'Patrol route requires at least 2 waypoints' };
    }
    for (const wp of waypoints) {
      if (!this.galaxy.systems.some((s) => s.id === wp.systemId)) {
        return { ok: false, reason: 'Patrol route contains an unknown star system' };
      }
    }

    const copiedWaypoints: DockyardWaypoint[] = waypoints.map((wp) => ({
      systemId: wp.systemId,
      position: { x: wp.position.x, z: wp.position.z },
    }));
    found.structure.patrolWaypoints = copiedWaypoints;
    found.structure.rallyPoint = null;
    found.structure.fleetStance = stance;

    const firstWp = copiedWaypoints[0]!;
    for (const ship of this.combatShips) {
      if (ship.homeDockyardId === dockyardId && ship.ownerId === playerId) {
        ship.stance = stance;
        ship.patrolWaypoints = copiedWaypoints;
        ship.patrolIndex = 0;
        ship.targetSystemId = firstWp.systemId;
        ship.targetPosition = { x: firstWp.position.x, z: firstWp.position.z };
        ship.state =
          ship.currentSystemId === firstWp.systemId
            ? 'patrolling'
            : 'transiting_wormhole';
      }
    }

    return { ok: true };
  }

  private spawnCombatShipAtDockyard(
    playerId: PlayerSlotId,
    planetState: PlanetRuntimeState,
    dockyard: OrbitalStructureInstance,
    shipClassId: CombatShipClassId,
    targetFleetId: string | null = null,
  ): void {
    const shipCfg = SHIP_CLASSES[shipClassId];
    const dockPos = this.getStructureWorldPosition(planetState, dockyard);
    const outX = dockPos.x - planetState.planet.position.x;
    const outZ = dockPos.z - planetState.planet.position.z;
    const outLen = Math.max(0.001, Math.hypot(outX, outZ));
    const nx = outX / outLen;
    const nz = outZ / outLen;

    // Launch just outside the Titan Dockyard's outward slipway mouth
    const spawnPos: Vector2D = {
      x: dockPos.x + nx * 24,
      z: dockPos.z + nz * 24,
    };

    const shipIndex = this.combatShips.length;
    const formAngle = (shipIndex * 2.39996) % (Math.PI * 2); // Golden-angle squadron spread
    const formRadius = 10 + (shipIndex % 4) * 6;
    const formationOffset: Vector2D = {
      x: Math.cos(formAngle) * formRadius,
      z: Math.sin(formAngle) * formRadius,
    };

    const fleet = targetFleetId ? this.getFleetById(targetFleetId) : undefined;
    if (fleet && shipClassId !== 'fighter') {
      fleet.initialBuiltCounts[shipClassId] += 1;
    }

    const stance: FleetStance =
      fleet?.stance ?? dockyard.fleetStance ?? 'aggressive';
    const patrolWaypoints =
      fleet?.patrolWaypoints && fleet.patrolWaypoints.length >= 2
        ? fleet.patrolWaypoints
        : (dockyard.patrolWaypoints ?? []);

    let targetSystemId = planetState.planet.systemId;
    let targetPosition: Vector2D = {
      x: dockPos.x + nx * 56,
      z: dockPos.z + nz * 56,
    };
    let initialState: CombatShipActivityState = 'moving_to_rally';

    if (fleet) {
      if (patrolWaypoints.length >= 2) {
        const wp = patrolWaypoints[fleet.patrolIndex % patrolWaypoints.length]!;
        targetSystemId = wp.systemId;
        targetPosition = { x: wp.position.x, z: wp.position.z };
        initialState =
          planetState.planet.systemId === wp.systemId
            ? 'patrolling'
            : 'transiting_wormhole';
      } else {
        // Every ship built for a fleet flies directly to the fleet's active rally/order destination
        // rather than a mid-transit sibling's live centroid near the dockyard/asteroid belt.
        targetSystemId = fleet.orderSystemId;
        targetPosition = { x: fleet.orderPosition.x, z: fleet.orderPosition.z };
        initialState =
          planetState.planet.systemId === fleet.orderSystemId
            ? 'moving_to_rally'
            : 'transiting_wormhole';
      }
    } else if (patrolWaypoints.length >= 2) {
      const wp0 = patrolWaypoints[0]!;
      targetSystemId = wp0.systemId;
      targetPosition = { x: wp0.position.x, z: wp0.position.z };
      initialState =
        planetState.planet.systemId === wp0.systemId
          ? 'patrolling'
          : 'transiting_wormhole';
    } else if (dockyard.rallyPoint) {
      targetSystemId = dockyard.rallyPoint.systemId;
      targetPosition = {
        x: dockyard.rallyPoint.position.x,
        z: dockyard.rallyPoint.position.z,
      };
      initialState =
        planetState.planet.systemId === dockyard.rallyPoint.systemId
          ? 'moving_to_rally'
          : 'transiting_wormhole';
    }

    this.combatShips.push({
      id: `ship_${this.nextEntityCounter++}`,
      shipClassId,
      ownerId: playerId,
      homeDockyardId: dockyard.id,
      fleetId: fleet ? fleet.id : null,
      inCombat: false,
      currentSystemId: planetState.planet.systemId,
      position: spawnPos,
      headingRadians: Math.atan2(nx, nz),
      currentSpeed: shipCfg.speed,
      shields: shipCfg.maxShields,
      maxShields: shipCfg.maxShields,
      hull: shipCfg.maxHull,
      maxHull: shipCfg.maxHull,
      stance,
      state: initialState,
      targetSystemId,
      targetPosition,
      patrolWaypoints,
      patrolIndex: fleet ? fleet.patrolIndex : 0,
      formationOffset,
      weaponCooldowns: shipCfg.weapons.map(() => 0),
      lastDamageTakenAtSeconds: -999,
      currentTargetId: null,
      currentTargetPos: null,
      tetherHostId: null,
      fighterReplenishCooldownSeconds: 0,
    });
  }

  private updateCombatShip(ship: CombatShipUnitState, deltaSeconds: number): void {
    const shipCfg = SHIP_CLASSES[ship.shipClassId];
    // Match slowest ship in the fleet while cruising; break to individual hull speed in combat
    const effectiveSpeed =
      !ship.inCombat && ship.fleetId
        ? Math.min(shipCfg.speed, this.getFleetCruiseSpeed(ship.fleetId) || shipCfg.speed)
        : shipCfg.speed;
    const maxStep = effectiveSpeed * deltaSeconds;
    const obstacles = this.getPlanetaryObstaclesInSystem(ship.currentSystemId);

    // 1. Cross-system transit via wormhole if target lies in another star system
    if (ship.currentSystemId !== ship.targetSystemId) {
      ship.state = 'transiting_wormhole';
      const hop = findWormholeHop(this.galaxy, ship.currentSystemId, ship.targetSystemId);
      if (!hop) {
        ship.currentSpeed = 0;
        return;
      }
      const step = computeObstacleAwareStep(
        ship.position,
        hop.entryPosition,
        maxStep,
        obstacles,
        22,
      );
      ship.position = step.position;
      if (step.movedDistance > 1e-5) {
        ship.headingRadians = step.headingRadians;
      }
      ship.currentSpeed = shipCfg.speed;

      if (step.arrived) {
        ship.currentSystemId = hop.exitSystemId;
        // Emerge slightly inward from the destination wormhole mouth with formation spread
        ship.position = {
          x: hop.exitPosition.x * 0.92 + ship.formationOffset.x * 0.5,
          z: hop.exitPosition.z * 0.92 + ship.formationOffset.z * 0.5,
        };
        if (ship.currentSystemId === ship.targetSystemId) {
          ship.state =
            ship.patrolWaypoints.length >= 2 ? 'patrolling' : 'moving_to_rally';
        }
      }
      return;
    }

    // 2. Aggressive combat pursuit (breaks formation to individual hull speed; never chases across wormholes)
    if (ship.inCombat && ship.stance === 'aggressive' && ship.currentTargetPos) {
      const maxWeaponRange = shipCfg.weapons.reduce(
        (acc, w) => Math.max(acc, w.range),
        80,
      );
      const desiredStandoff =
        ship.shipClassId === 'fighter' ? 28 : Math.max(40, maxWeaponRange * 0.72);
      const step = computeObstacleAwareStep(
        ship.position,
        ship.currentTargetPos,
        maxStep,
        obstacles,
        desiredStandoff,
      );
      ship.position = step.position;
      if (step.movedDistance > 1e-5) {
        ship.headingRadians = step.headingRadians;
      } else {
        // Face target while holding firing standoff
        ship.headingRadians = Math.atan2(
          ship.currentTargetPos.x - ship.position.x,
          ship.currentTargetPos.z - ship.position.z,
        );
      }
      ship.currentSpeed = step.arrived ? 0 : effectiveSpeed;
      return;
    }

    // 3. Same-system navigation (Patrol Route loop or Rally Point formation)
    const goalPos: Vector2D =
      ship.patrolWaypoints.length >= 2
        ? {
            x: ship.targetPosition.x + ship.formationOffset.x * 0.45,
            z: ship.targetPosition.z + ship.formationOffset.z * 0.45,
          }
        : {
            x: ship.targetPosition.x + ship.formationOffset.x,
            z: ship.targetPosition.z + ship.formationOffset.z,
          };

    const arrivalTol = ship.patrolWaypoints.length >= 2 ? 12 : 4;
    const step = computeObstacleAwareStep(
      ship.position,
      goalPos,
      maxStep,
      obstacles,
      arrivalTol,
    );
    ship.position = step.position;
    if (step.movedDistance > 1e-5) {
      ship.headingRadians = step.headingRadians;
    }

    if (step.arrived) {
      if (ship.patrolWaypoints.length >= 2) {
        ship.patrolIndex = (ship.patrolIndex + 1) % ship.patrolWaypoints.length;
        const nextWp = ship.patrolWaypoints[ship.patrolIndex]!;
        ship.targetSystemId = nextWp.systemId;
        ship.targetPosition = { x: nextWp.position.x, z: nextWp.position.z };
        ship.state =
          ship.currentSystemId === nextWp.systemId ? 'patrolling' : 'transiting_wormhole';
        ship.currentSpeed = shipCfg.speed;
      } else {
        ship.state = 'holding_position';
        ship.currentSpeed = 0;
      }
    } else {
      ship.state =
        ship.patrolWaypoints.length >= 2 ? 'patrolling' : 'moving_to_rally';
      ship.currentSpeed = shipCfg.speed;
    }
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
      hull: SHIP_CLASSES.harvester.maxHull,
      maxHull: SHIP_CLASSES.harvester.maxHull,
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
      const activeCount = Math.max(1, struct.activeDockingHarvesterIds.length);
      const dockOffset = (dockIdx - (activeCount - 1) * 0.5) * 3.2;
      harvester.position = {
        x: homePos.x + dockOffset,
        z: homePos.z + 4.5,
      };
      harvester.headingRadians = Math.atan2(
        homePos.x - harvester.position.x,
        homePos.z - harvester.position.z,
      );

      const unloadRate = this.getPlatformUnloadRatePerSecond(struct);
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

  public getPlatformUnloadRatePerSecond(structure: OrbitalStructureInstance): number {
    const multiplier = MATCH_PRESETS[this.presetId].harvestRateMultiplier;
    if (structure.structureId === 'refinery') {
      return REFINERY_UNLOAD_RATE_PER_SECOND * multiplier;
    }
    if (structure.structureId === 'command_and_control') {
      return CNC_UNLOAD_RATE_PER_SECOND * multiplier;
    }
    return 0;
  }

  public getMaxConcurrentDocks(structure: OrbitalStructureInstance): number {
    if (structure.structureId === 'refinery') {
      return MATCH_PRESETS[this.presetId].refineryMaxConcurrentDocks;
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

  public getPlanetaryObstaclesInSystem(systemId: string): readonly PlanetaryObstacle[] {
    const system = this.galaxy.systems.find((s) => s.id === systemId);
    if (!system) {
      return [];
    }
    return system.planets.map((p) => ({
      id: p.id,
      position: p.position,
      // 1.24x clears the 1.125x atmosphere halo while remaining inside the 1.52x orbital ring
      avoidRadius: PLANET_CLASSES[p.planetClass].radiusUnits * 1.24,
    }));
  }

  private movePositionTowards(
    harvester: HarvesterUnitState,
    target: Vector2D,
    maxStep: number,
    arrivalRadius = 2.0,
  ): boolean {
    const obstacles = this.getPlanetaryObstaclesInSystem(harvester.currentSystemId);
    const step = computeObstacleAwareStep(
      harvester.position,
      target,
      maxStep,
      obstacles,
      arrivalRadius,
    );
    harvester.position = step.position;
    if (step.movedDistance > 1e-5) {
      harvester.headingRadians = step.headingRadians;
    }
    return step.arrived;
  }

  private emitCombatEvent(
    event: Omit<CombatVisualEvent, 'id' | 'timestampSeconds'>,
  ): void {
    this.pendingCombatEvents.push({
      ...event,
      id: this.nextCombatEventId++,
      timestampSeconds: this.elapsedSeconds,
    });
    if (this.pendingCombatEvents.length > 240) {
      this.pendingCombatEvents.splice(0, this.pendingCombatEvents.length - 240);
    }
  }

  private isTowerPoweredByFriendlyHub(tower: DeepSpaceStructureInstance): boolean {
    const hubRadius = DEEP_SPACE_STRUCTURES.logistics_hub.buildRadiusProvided;
    return this.deepSpaceStructures.some(
      (ds) =>
        ds.structureId === 'logistics_hub' &&
        ds.ownerId === tower.ownerId &&
        ds.systemId === tower.systemId &&
        ds.isComplete &&
        Math.hypot(ds.position.x - tower.position.x, ds.position.z - tower.position.z) <=
          hubRadius,
    );
  }

  private destroyOrbitalStructureInCombat(
    planetState: PlanetRuntimeState,
    structure: OrbitalStructureInstance,
  ): void {
    const idx = planetState.structures.indexOf(structure);
    if (idx === -1) {
      return;
    }
    const worldPos = this.getStructureWorldPosition(planetState, structure);
    planetState.structures.splice(idx, 1);

    if (structure.isComplete) {
      const player = this.players.get(structure.ownerId);
      const cfg = ORBITAL_STRUCTURES[structure.structureId];
      if (player) {
        player.supplyCap = Math.max(0, player.supplyCap - cfg.supplyProvided);
        if (structure.structureId === 'tech_module') {
          player.techModulesCompleted = Math.max(0, player.techModulesCompleted - 1);
        }
      }
    }

    if (structure.structureId === 'command_and_control') {
      this.defeatedPlayers.add(structure.ownerId);
    }

    if (planetState.structures.length === 0) {
      planetState.ownerId = null;
    }

    this.emitCombatEvent({
      type: 'hull_explosion',
      systemId: planetState.planet.systemId,
      fromPos: worldPos,
      toPos: worldPos,
      targetRadius: 14,
      ownerId: structure.ownerId,
    });
  }

  private destroyHarvester(harvester: HarvesterUnitState): void {
    const idx = this.harvesters.indexOf(harvester);
    if (idx === -1) {
      return;
    }
    const homeLookup = this.getStructureById(harvester.homeStructureId);
    if (homeLookup) {
      this.removeHarvesterFromDockingLists(harvester.id, homeLookup.structure);
    }
    this.harvesters.splice(idx, 1);
    this.emitCombatEvent({
      type: 'hull_explosion',
      systemId: harvester.currentSystemId,
      fromPos: harvester.position,
      toPos: harvester.position,
      targetRadius: 5,
      ownerId: harvester.ownerId,
    });
  }

  /**
   * Auto-launches and replenishes organic Fighter Squadrons from completed Fleet Carriers
   * (`fighterSquadronCapacity = 4`) and completed Atlas Logistics Hubs (`4` wings),
   * and enforces the Carrier/Hub tether rule when a host is destroyed.
   */
  private updateCarrierAndHubFighters(deltaSeconds: number): void {
    const replenishTime = SHIP_CLASSES.fighter.buildTimeSeconds;

    // 1. Carrier organic Fighter wings
    for (const ship of this.combatShips) {
      if (ship.shipClassId !== 'carrier') {
        continue;
      }
      const cap = SHIP_CLASSES.carrier.fighterSquadronCapacity;
      const activeWings = this.combatShips.filter(
        (f) => f.shipClassId === 'fighter' && f.tetherHostId === ship.id,
      ).length;
      if (activeWings < cap) {
        ship.fighterReplenishCooldownSeconds -= deltaSeconds;
        if (ship.fighterReplenishCooldownSeconds <= 0) {
          ship.fighterReplenishCooldownSeconds = replenishTime;
          this.spawnCombatShipDirect(
            ship.ownerId,
            ship.currentSystemId,
            { x: ship.position.x + 8, z: ship.position.z + 8 },
            'fighter',
            ship.stance,
            ship.id,
            null,
          );
        }
      }
    }

    // 2. Logistics Hub organic Fighter wings
    for (const ds of this.deepSpaceStructures) {
      if (ds.structureId !== 'logistics_hub' || !ds.isComplete) {
        continue;
      }
      const activeWings = this.combatShips.filter(
        (f) => f.shipClassId === 'fighter' && f.tetherHostId === ds.id,
      ).length;
      if (activeWings < LOGISTICS_HUB_FIGHTER_CAPACITY) {
        ds.fighterReplenishCooldownSeconds =
          (ds.fighterReplenishCooldownSeconds ?? 0) - deltaSeconds;
        if (ds.fighterReplenishCooldownSeconds <= 0) {
          ds.fighterReplenishCooldownSeconds = replenishTime;
          this.spawnCombatShipDirect(
            ds.ownerId,
            ds.systemId,
            { x: ds.position.x + 12, z: ds.position.z + 12 },
            'fighter',
            'aggressive',
            ds.id,
            null,
          );
        }
      }
    }

    // 3. Tether escort & stranded Fighter cleanup
    const strandedFighterIds: string[] = [];
    for (const fighter of this.combatShips) {
      if (fighter.shipClassId !== 'fighter' || !fighter.tetherHostId) {
        continue;
      }
      const hostCarrier = this.combatShips.find(
        (s) => s.id === fighter.tetherHostId && s.shipClassId === 'carrier',
      );
      if (hostCarrier) {
        fighter.stance = hostCarrier.stance;
        fighter.targetSystemId = hostCarrier.currentSystemId;
        fighter.targetPosition = {
          x: hostCarrier.position.x,
          z: hostCarrier.position.z,
        };
        continue;
      }
      const hostHub = this.deepSpaceStructures.find(
        (ds) =>
          ds.id === fighter.tetherHostId &&
          ds.structureId === 'logistics_hub' &&
          ds.isComplete,
      );
      if (hostHub) {
        fighter.targetSystemId = hostHub.systemId;
        fighter.targetPosition = { x: hostHub.position.x, z: hostHub.position.z };
        continue;
      }

      // Host was destroyed -> attempt to re-tether to another friendly Carrier or Hub in-system
      const altCarrier = this.combatShips.find(
        (s) =>
          s.ownerId === fighter.ownerId &&
          s.shipClassId === 'carrier' &&
          s.currentSystemId === fighter.currentSystemId,
      );
      if (altCarrier) {
        fighter.tetherHostId = altCarrier.id;
        continue;
      }
      const altHub = this.deepSpaceStructures.find(
        (ds) =>
          ds.ownerId === fighter.ownerId &&
          ds.structureId === 'logistics_hub' &&
          ds.isComplete &&
          ds.systemId === fighter.currentSystemId,
      );
      if (altHub) {
        fighter.tetherHostId = altHub.id;
        continue;
      }
      // No fighter support left in system -> stranded Fighter squadron lost
      strandedFighterIds.push(fighter.id);
    }

    for (const fId of strandedFighterIds) {
      this.destroyCombatShip(fId);
    }
  }

  /**
   * Resolves 5-class Shield vs. Hull RPS combat, Fleet Stances, Deep-Space Defence Towers,
   * Orbital Structure defences, out-of-combat shield regen, and Logistics Hub hull repair.
   */
  private updateCombatAndDefences(deltaSeconds: number): void {
    interface CombatTargetRef {
      readonly id: string;
      readonly ownerId: PlayerSlotId;
      readonly systemId: string;
      readonly position: Vector2D;
      readonly targetClass: CombatShipClassId | 'harvester' | 'structure';
      readonly evasion: number;
      readonly visualRadius: number;
      readonly getShields: () => number;
      readonly getHull: () => number;
      readonly applyDamage: (
        alpha: number,
        shieldMult: number,
        hullMult: number,
        luckMult: number,
        attackerOwner: PlayerSlotId,
        attackerPos: Vector2D,
      ) => void;
    }

    const buildTargetsInSystem = (
      systemId: string,
      attackerOwner: PlayerSlotId,
    ): CombatTargetRef[] => {
      const targets: CombatTargetRef[] = [];

      for (const ship of this.combatShips) {
        if (ship.ownerId === attackerOwner || ship.currentSystemId !== systemId || ship.hull <= 0) {
          continue;
        }
        const cfg = SHIP_CLASSES[ship.shipClassId];
        const radius =
          ship.shipClassId === 'dreadnought'
            ? 9
            : ship.shipClassId === 'carrier'
              ? 7
              : ship.shipClassId === 'cruiser'
                ? 5.5
                : ship.shipClassId === 'destroyer'
                  ? 4
                  : 2.2;
        targets.push({
          id: ship.id,
          ownerId: ship.ownerId,
          systemId: ship.currentSystemId,
          position: ship.position,
          targetClass: ship.shipClassId,
          evasion: cfg.evasionRating,
          visualRadius: radius,
          getShields: () => ship.shields,
          getHull: () => ship.hull,
          applyDamage: (alpha, sMult, hMult, luck, _attackerOwner, attackerPos) => {
            const res = applyWeaponDamage(ship.shields, ship.hull, alpha, sMult, hMult, luck);
            ship.shields = res.nextShields;
            ship.hull = res.nextHull;
            ship.lastDamageTakenAtSeconds = this.elapsedSeconds;
            this.lastCombatActivityByPlayer.set(ship.ownerId, this.elapsedSeconds);
            if (res.shieldDamageDealt > 0) {
              this.emitCombatEvent({
                type: 'shield_impact',
                systemId,
                fromPos: attackerPos,
                toPos: ship.position,
                targetId: ship.id,
                targetRadius: radius,
                ownerId: ship.ownerId,
              });
            }
            if (res.destroyed) {
              this.emitCombatEvent({
                type: 'hull_explosion',
                systemId,
                fromPos: ship.position,
                toPos: ship.position,
                targetRadius: radius,
                ownerId: ship.ownerId,
              });
              this.destroyCombatShip(ship.id);
            }
          },
        });
      }

      for (const h of this.harvesters) {
        if (h.ownerId === attackerOwner || h.currentSystemId !== systemId || h.hull <= 0) {
          continue;
        }
        targets.push({
          id: h.id,
          ownerId: h.ownerId,
          systemId: h.currentSystemId,
          position: h.position,
          targetClass: 'harvester',
          evasion: SHIP_CLASSES.harvester.evasionRating,
          visualRadius: 4.5,
          getShields: () => 0,
          getHull: () => h.hull,
          applyDamage: (alpha, sMult, hMult, luck) => {
            const res = applyWeaponDamage(0, h.hull, alpha, sMult, hMult, luck);
            h.hull = res.nextHull;
            this.lastCombatActivityByPlayer.set(h.ownerId, this.elapsedSeconds);
            if (res.destroyed) {
              this.destroyHarvester(h);
            }
          },
        });
      }

      for (const ds of this.deepSpaceStructures) {
        if (ds.ownerId === attackerOwner || ds.systemId !== systemId || ds.hull <= 0) {
          continue;
        }
        const radius = ds.structureId === 'logistics_hub' ? 11 : 5;
        targets.push({
          id: ds.id,
          ownerId: ds.ownerId,
          systemId: ds.systemId,
          position: ds.position,
          targetClass: 'structure',
          evasion: 0,
          visualRadius: radius,
          getShields: () => ds.shields,
          getHull: () => ds.hull,
          applyDamage: (alpha, sMult, hMult, luck, _attackerOwner, attackerPos) => {
            const res = applyWeaponDamage(ds.shields, ds.hull, alpha, sMult, hMult, luck);
            ds.shields = res.nextShields;
            ds.hull = res.nextHull;
            ds.lastDamageTakenAtSeconds = this.elapsedSeconds;
            this.lastCombatActivityByPlayer.set(ds.ownerId, this.elapsedSeconds);
            if (res.shieldDamageDealt > 0) {
              this.emitCombatEvent({
                type: 'shield_impact',
                systemId,
                fromPos: attackerPos,
                toPos: ds.position,
                targetId: ds.id,
                targetRadius: radius,
                ownerId: ds.ownerId,
              });
            }
            if (res.destroyed) {
              this.emitCombatEvent({
                type: 'hull_explosion',
                systemId,
                fromPos: ds.position,
                toPos: ds.position,
                targetRadius: radius,
                ownerId: ds.ownerId,
              });
              this.destroyDeepSpaceStructure(ds.id);
            }
          },
        });
      }

      for (const planetState of this.planets.values()) {
        if (planetState.planet.systemId !== systemId) {
          continue;
        }
        for (const s of [...planetState.structures]) {
          if (s.ownerId === attackerOwner || s.hull <= 0) {
            continue;
          }
          const worldPos = this.getStructureWorldPosition(planetState, s);
          const radius = ORBITAL_STRUCTURES[s.structureId].slotCost === 2 ? 12 : 8;
          targets.push({
            id: s.id,
            ownerId: s.ownerId,
            systemId,
            position: worldPos,
            targetClass: 'structure',
            evasion: 0,
            visualRadius: radius,
            getShields: () => s.shields,
            getHull: () => s.hull,
            applyDamage: (alpha, sMult, hMult, luck, _attackerOwner, attackerPos) => {
              const res = applyWeaponDamage(s.shields, s.hull, alpha, sMult, hMult, luck);
              s.shields = res.nextShields;
              s.hull = res.nextHull;
              s.lastDamageTakenAtSeconds = this.elapsedSeconds;
              this.lastCombatActivityByPlayer.set(s.ownerId, this.elapsedSeconds);
              if (res.shieldDamageDealt > 0) {
                this.emitCombatEvent({
                  type: 'shield_impact',
                  systemId,
                  fromPos: attackerPos,
                  toPos: worldPos,
                  targetId: s.id,
                  targetRadius: radius,
                  ownerId: s.ownerId,
                });
              }
              if (res.destroyed) {
                this.destroyOrbitalStructureInCombat(planetState, s);
              }
            },
          });
        }
      }

      return targets;
    };

    // 1. Combat Ship weapon firing & stance acquisition
    for (const ship of [...this.combatShips]) {
      if (ship.hull <= 0) {
        continue;
      }
      const shipCfg = SHIP_CLASSES[ship.shipClassId];

      // Tick weapon cooldowns
      for (let wIdx = 0; wIdx < shipCfg.weapons.length; wIdx++) {
        ship.weaponCooldowns[wIdx] = Math.max(
          0,
          (ship.weaponCooldowns[wIdx] ?? 0) - deltaSeconds,
        );
      }

      if (ship.stance === 'passive') {
        ship.inCombat = false;
        ship.currentTargetId = null;
        ship.currentTargetPos = null;
        continue;
      }

      const hostiles = buildTargetsInSystem(ship.currentSystemId, ship.ownerId);
      if (hostiles.length === 0) {
        ship.inCombat = false;
        ship.currentTargetId = null;
        ship.currentTargetPos = null;
        continue;
      }

      const maxWeaponRange = shipCfg.weapons.reduce((acc, w) => Math.max(acc, w.range), 0);
      const acquisitionRange =
        ship.stance === 'aggressive'
          ? ship.tetherHostId
            ? 240
            : Infinity
          : maxWeaponRange;

      let bestTarget: CombatTargetRef | null = null;
      let bestScore = -Infinity;
      let bestDist = Infinity;
      for (const cand of hostiles) {
        if (cand.getHull() <= 0) continue;
        const dist = Math.hypot(
          cand.position.x - ship.position.x,
          cand.position.z - ship.position.z,
        );
        if (dist > acquisitionRange) {
          continue;
        }
        const score = scoreCombatTargetPriority(
          ship.shipClassId,
          cand.targetClass,
          cand.getShields() > 0,
          dist,
        );
        if (score > bestScore) {
          bestScore = score;
          bestTarget = cand;
          bestDist = dist;
        }
      }

      if (!bestTarget) {
        ship.inCombat = false;
        ship.currentTargetId = null;
        ship.currentTargetPos = null;
        continue;
      }

      ship.inCombat = true;
      ship.currentTargetId = bestTarget.id;
      ship.currentTargetPos = { x: bestTarget.position.x, z: bestTarget.position.z };

      for (let wIdx = 0; wIdx < shipCfg.weapons.length; wIdx++) {
        const weapon = shipCfg.weapons[wIdx]!;
        if ((ship.weaponCooldowns[wIdx] ?? 0) > 0 || bestDist > weapon.range) {
          continue;
        }
        if (bestTarget.getHull() <= 0) {
          break;
        }

        ship.weaponCooldowns[wIdx] = weapon.reloadSeconds;
        this.lastCombatActivityByPlayer.set(ship.ownerId, this.elapsedSeconds);

        const weaponKind = classifyWeaponVisualKind(
          ship.shipClassId,
          weapon.tracking,
          weapon.alphaDamage,
        );
        this.emitCombatEvent({
          type: 'weapon_fire',
          systemId: ship.currentSystemId,
          fromPos: ship.position,
          toPos: bestTarget.position,
          weaponKind,
          ownerId: ship.ownerId,
        });

        const hitProb = computeHitProbability(weapon.tracking, bestTarget.evasion);
        const hitRoll = nextCombatRandom(this.combatRng);
        if (hitRoll <= hitProb) {
          let luckMult = 1.0;
          if (
            ship.shipClassId === 'fighter' &&
            bestTarget.targetClass === 'fighter' &&
            shipCfg.dogfightLuckVariance > 0
          ) {
            const luckRoll = nextCombatRandom(this.combatRng);
            luckMult = 1.0 + (luckRoll * 2 - 1) * shipCfg.dogfightLuckVariance;
          }
          bestTarget.applyDamage(
            weapon.alphaDamage,
            weapon.shieldDamageMultiplier,
            weapon.hullDamageMultiplier,
            luckMult,
            ship.ownerId,
            ship.position,
          );
        }
      }
    }

    // 2. Deep-Space Defence Towers (PD Tower & Hull Breaker Tower)
    for (const ds of [...this.deepSpaceStructures]) {
      if (
        !ds.isComplete ||
        ds.hull <= 0 ||
        (ds.structureId !== 'point_defence_tower' && ds.structureId !== 'hull_breaker_tower')
      ) {
        continue;
      }
      const cfg = DEEP_SPACE_STRUCTURES[ds.structureId];
      ds.weaponCooldownSeconds = Math.max(0, (ds.weaponCooldownSeconds ?? 0) - deltaSeconds);

      // Towers require a live friendly Logistics Hub within 180u to stay powered
      if (!this.isTowerPoweredByFriendlyHub(ds)) {
        ds.currentTargetId = null;
        ds.currentTargetPos = null;
        continue;
      }

      const hostiles = buildTargetsInSystem(ds.systemId, ds.ownerId).filter(
        (t) =>
          t.getHull() > 0 &&
          Math.hypot(t.position.x - ds.position.x, t.position.z - ds.position.z) <=
            cfg.weaponRange,
      );
      if (hostiles.length === 0) {
        ds.currentTargetId = null;
        ds.currentTargetPos = null;
        continue;
      }

      // PD Tower prioritizes fast/evasive craft; Hull Breaker Tower prioritizes slow capitals
      const preferClass: CombatShipClassId =
        ds.structureId === 'point_defence_tower' ? 'cruiser' : 'dreadnought';
      let target = hostiles[0]!;
      let bestScore = -Infinity;
      for (const h of hostiles) {
        const d = Math.hypot(h.position.x - ds.position.x, h.position.z - ds.position.z);
        const s = scoreCombatTargetPriority(preferClass, h.targetClass, h.getShields() > 0, d);
        if (s > bestScore) {
          bestScore = s;
          target = h;
        }
      }

      ds.currentTargetId = target.id;
      ds.currentTargetPos = { x: target.position.x, z: target.position.z };

      if ((ds.weaponCooldownSeconds ?? 0) <= 0) {
        ds.weaponCooldownSeconds = cfg.reloadSeconds;
        this.lastCombatActivityByPlayer.set(ds.ownerId, this.elapsedSeconds);
        const kind = classifyWeaponVisualKind(
          ds.structureId === 'point_defence_tower' ? 'pd_tower' : 'hull_breaker_tower',
          cfg.weaponTracking,
          cfg.alphaDamage,
        );
        this.emitCombatEvent({
          type: 'weapon_fire',
          systemId: ds.systemId,
          fromPos: ds.position,
          toPos: target.position,
          weaponKind: kind,
          ownerId: ds.ownerId,
        });

        const hitProb = computeHitProbability(cfg.weaponTracking, target.evasion);
        if (nextCombatRandom(this.combatRng) <= hitProb) {
          const shieldMult = ds.structureId === 'hull_breaker_tower' ? 0.85 : 0.9;
          const hullMult = ds.structureId === 'hull_breaker_tower' ? 1.75 : 1.15;
          target.applyDamage(cfg.alphaDamage, shieldMult, hullMult, 1.0, ds.ownerId, ds.position);
        }
      }
    }

    // 3. Orbital Structure Defences (C&C, Outpost, Dockyard, Heavy Defense Platform)
    for (const planetState of this.planets.values()) {
      for (const s of [...planetState.structures]) {
        if (!s.isComplete || s.hull <= 0) {
          continue;
        }
        const cfg = ORBITAL_STRUCTURES[s.structureId];
        if (cfg.pointDefenceDps <= 0 && cfg.heavyWeaponDps <= 0) {
          continue;
        }
        s.pdCooldownSeconds = Math.max(0, (s.pdCooldownSeconds ?? 0) - deltaSeconds);
        s.heavyCooldownSeconds = Math.max(0, (s.heavyCooldownSeconds ?? 0) - deltaSeconds);

        const worldPos = this.getStructureWorldPosition(planetState, s);
        const hostiles = buildTargetsInSystem(planetState.planet.systemId, s.ownerId);
        if (hostiles.length === 0) {
          s.currentTargetId = null;
          s.currentTargetPos = null;
          continue;
        }

        if (cfg.pointDefenceDps > 0 && (s.pdCooldownSeconds ?? 0) <= 0) {
          const pdTarget = hostiles.find(
            (h) =>
              h.getHull() > 0 &&
              Math.hypot(h.position.x - worldPos.x, h.position.z - worldPos.z) <= 185,
          );
          if (pdTarget) {
            s.pdCooldownSeconds = 0.5;
            s.currentTargetId = pdTarget.id;
            s.currentTargetPos = { x: pdTarget.position.x, z: pdTarget.position.z };
            this.lastCombatActivityByPlayer.set(s.ownerId, this.elapsedSeconds);
            this.emitCombatEvent({
              type: 'weapon_fire',
              systemId: planetState.planet.systemId,
              fromPos: worldPos,
              toPos: pdTarget.position,
              weaponKind: 'pd',
              ownerId: s.ownerId,
            });
            if (nextCombatRandom(this.combatRng) <= computeHitProbability(0.94, pdTarget.evasion)) {
              pdTarget.applyDamage(cfg.pointDefenceDps * 0.5, 0.9, 1.1, 1.0, s.ownerId, worldPos);
            }
          }
        }

        if (cfg.heavyWeaponDps > 0 && (s.heavyCooldownSeconds ?? 0) <= 0) {
          const heavyTarget = hostiles.find(
            (h) =>
              h.getHull() > 0 &&
              Math.hypot(h.position.x - worldPos.x, h.position.z - worldPos.z) <= 245,
          );
          if (heavyTarget) {
            s.heavyCooldownSeconds = 2.0;
            s.currentTargetId = heavyTarget.id;
            s.currentTargetPos = { x: heavyTarget.position.x, z: heavyTarget.position.z };
            this.lastCombatActivityByPlayer.set(s.ownerId, this.elapsedSeconds);
            this.emitCombatEvent({
              type: 'weapon_fire',
              systemId: planetState.planet.systemId,
              fromPos: worldPos,
              toPos: heavyTarget.position,
              weaponKind: 'heavy',
              ownerId: s.ownerId,
            });
            if (
              nextCombatRandom(this.combatRng) <= computeHitProbability(0.35, heavyTarget.evasion)
            ) {
              heavyTarget.applyDamage(cfg.heavyWeaponDps * 2.0, 1.1, 1.35, 1.0, s.ownerId, worldPos);
            }
          }
        }
      }
    }

    // 4. Out-of-Combat Shield Regeneration & Logistics Hub Hull Repair
    for (const ship of this.combatShips) {
      const cfg = SHIP_CLASSES[ship.shipClassId];
      const outOfCombat =
        this.elapsedSeconds - ship.lastDamageTakenAtSeconds >=
        SHIELD_REGEN_OUT_OF_COMBAT_DELAY_SECONDS;
      if (outOfCombat && cfg.hasShields && ship.shields < ship.maxShields) {
        ship.shields = Math.min(
          ship.maxShields,
          ship.shields + cfg.shieldRegenPerSecond * deltaSeconds,
        );
      }
      if (outOfCombat && ship.hull < ship.maxHull) {
        const hubRadius = DEEP_SPACE_STRUCTURES.logistics_hub.buildRadiusProvided;
        const nearFriendlyHub = this.deepSpaceStructures.some(
          (ds) =>
            ds.structureId === 'logistics_hub' &&
            ds.ownerId === ship.ownerId &&
            ds.systemId === ship.currentSystemId &&
            ds.isComplete &&
            Math.hypot(ds.position.x - ship.position.x, ds.position.z - ship.position.z) <=
              hubRadius,
        );
        if (nearFriendlyHub) {
          ship.hull = Math.min(
            ship.maxHull,
            ship.hull + LOGISTICS_HUB_REPAIR_PER_SECOND * deltaSeconds,
          );
        }
      }
    }

    for (const ds of this.deepSpaceStructures) {
      if (!ds.isComplete) continue;
      const cfg = DEEP_SPACE_STRUCTURES[ds.structureId];
      const outOfCombat =
        this.elapsedSeconds - (ds.lastDamageTakenAtSeconds ?? -999) >=
        SHIELD_REGEN_OUT_OF_COMBAT_DELAY_SECONDS;
      if (outOfCombat && ds.shields < cfg.maxShields) {
        ds.shields = Math.min(cfg.maxShields, ds.shields + cfg.shieldRegenPerSecond * deltaSeconds);
      }
    }

    for (const planetState of this.planets.values()) {
      for (const s of planetState.structures) {
        if (!s.isComplete) continue;
        const cfg = ORBITAL_STRUCTURES[s.structureId];
        const outOfCombat =
          this.elapsedSeconds - (s.lastDamageTakenAtSeconds ?? -999) >=
          SHIELD_REGEN_OUT_OF_COMBAT_DELAY_SECONDS;
        if (outOfCombat && s.shields < cfg.maxShields) {
          s.shields = Math.min(cfg.maxShields, s.shields + cfg.shieldRegenPerSecond * deltaSeconds);
        }
      }
    }
  }
}
