import {
  MATCH_PRESETS,
  ORBITAL_STRUCTURES,
  SHIP_CLASSES,
  type MatchPresetId,
  type OrbitalStructureId,
} from '../config/index.ts';
import type { GameCommand, PlayerSlotId, Vector2D } from '../protocol/commands.ts';
import {
  type AsteroidBeltRockInstance,
  getAsteroidWorldPosition,
  getSystemAsteroidLayout,
} from './asteroidBeltLayout.ts';
import {
  createFiveSystemGalaxy,
  type GalaxyTopology,
  type PlanetNode,
} from './galaxy.ts';

/**
 * Harvester Phase 1 Speed & Mining Constants:
 * - Previous speed was 55.1 u/s (38 * 1.45).
 * - Empty outward speed slowed by 25% -> 41.325 u/s.
 * - Full return speed slowed by 50% -> 27.55 u/s.
 * - Mining 40 units takes 12.5 seconds (within the 10–15s window) -> 3.2 units/sec.
 */
export const HARVESTER_EMPTY_SPEED = 41.325;
export const HARVESTER_FULL_SPEED = 27.55;
export const HARVESTER_CARGO_CAPACITY = 40;
export const HARVESTER_MINING_DURATION_SECONDS = 12.5;
export const HARVESTER_MINING_RATE_PER_SECOND =
  HARVESTER_CARGO_CAPACITY / HARVESTER_MINING_DURATION_SECONDS;

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
  readonly rock: AsteroidBeltRockInstance;
  position: Vector2D;
  worldY: number;
  remainingReserves: number;
}

export type HarvesterActivityState =
  | 'flying_to_belt'
  | 'mining'
  | 'returning_to_dropoff'
  | 'transiting_to_hub'
  | 'transiting_to_home';

export interface HarvesterUnitState {
  readonly id: string;
  readonly ownerId: PlayerSlotId;
  readonly homeSystemId: string;
  readonly homePlanetId: string;
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

  public submitCommand(command: GameCommand): CommandResult {
    switch (command.type) {
      case 'BUILD_ORBITAL_STRUCTURE':
        return this.handleBuildOrbitalStructure(
          command.playerId,
          command.planetId,
          command.slotIndex,
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

    // 2. Advance orbital structure construction timers
    for (const planetState of this.planets.values()) {
      for (const structure of planetState.structures) {
        if (!structure.isComplete) {
          structure.buildProgressSeconds += deltaSeconds;
          if (structure.buildProgressSeconds >= structure.totalBuildTimeSeconds) {
            structure.buildProgressSeconds = structure.totalBuildTimeSeconds;
            structure.isComplete = true;
            this.onOrbitalStructureCompleted(planetState, structure);
          }
        }
      }
    }

    // 3. Update automated Harvester mining & movement
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
      // Populate targetable individual asteroid & crystal rocks from shared belt layout
      const reserveBase = Math.round(1200 * preset.asteroidReserveMultiplier);
      const layout = getSystemAsteroidLayout(system);

      for (const rock of layout.miningCandidates) {
        const initPos = getAsteroidWorldPosition(rock, 0);
        this.miningBelts.push({
          id: rock.id,
          systemId: system.id,
          resourceType: rock.resourceType,
          rock,
          position: { x: initPos.x, z: initPos.z },
          worldY: initPos.y,
          remainingReserves: reserveBase,
        });
      }

      // Initialize planets & starting Homeworld Command & Control (2 slots)
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

    // Rule: Unclaimed secondary planets require a Planetary Outpost first
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
    };

    planetState.structures.push(instance);
    if (instance.isComplete) {
      this.onOrbitalStructureCompleted(planetState, instance);
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
    for (const p of this.planets.values()) {
      if (p.planet.id === structureOrPlanetId && p.ownerId === playerId) {
        const hasDropoff = p.structures.some(
          (s) =>
            s.isComplete &&
            (s.structureId === 'refinery' || s.structureId === 'command_and_control'),
        );
        if (hasDropoff) {
          targetPlanet = p;
          break;
        }
      }
      const matchingStruct = p.structures.find(
        (s) =>
          s.id === structureOrPlanetId &&
          s.ownerId === playerId &&
          s.isComplete &&
          (s.structureId === 'refinery' || s.structureId === 'command_and_control'),
      );
      if (matchingStruct) {
        targetPlanet = p;
        break;
      }
    }

    if (!targetPlanet) {
      return {
        ok: false,
        reason: 'Requires a completed Orbital Refinery or Command & Control',
      };
    }

    const cost = SHIP_CLASSES.harvester.cost;
    if (player.ore < cost.ore || player.crystal < cost.crystal) {
      return { ok: false, reason: 'Insufficient Ore or Crystals for Harvester' };
    }

    player.ore -= cost.ore;
    player.crystal -= cost.crystal;
    this.spawnHarvesterAtPlanet(playerId, targetPlanet);

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
      this.spawnHarvesterAtPlanet(structure.ownerId, planetState);
    }
  }

  private spawnHarvesterAtPlanet(
    ownerId: PlayerSlotId,
    planetState: PlanetRuntimeState,
  ): HarvesterUnitState {
    const harvesterIndex = this.harvesters.filter((h) => h.ownerId === ownerId).length;
    const angle = (harvesterIndex * 1.7) % (Math.PI * 2);
    const spawnRadius = 48;
    const spawnPos: Vector2D = {
      x: planetState.planet.position.x + Math.cos(angle) * spawnRadius,
      z: planetState.planet.position.z + Math.sin(angle) * spawnRadius,
    };

    const preferredResource: 'ore' | 'crystal' =
      harvesterIndex % 2 === 0 ? 'ore' : 'crystal';

    const harvester: HarvesterUnitState = {
      id: `harvester_${this.nextEntityCounter++}`,
      ownerId,
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

  private updateHarvester(harvester: HarvesterUnitState, deltaSeconds: number): void {
    const speed = this.computeHarvesterSpeed(harvester);
    harvester.currentSpeed = speed;

    // If assigned to cross-system Central Hub mining and currently in starter system with empty cargo:
    if (
      harvester.mineCrossSystemHub &&
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
      let belt = this.miningBelts.find(
        (b) =>
          b.id === harvester.targetBeltId &&
          b.systemId === harvester.currentSystemId &&
          b.remainingReserves > 0,
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

      // Lock position & heading to follow the exact rotating asteroid/crystal rock!
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

      // Extract 40 units over 12.5 seconds (3.2 units/sec)
      const extractAmount = HARVESTER_MINING_RATE_PER_SECOND * deltaSeconds;
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
      const localDropoffPlanet = this.findNearestFriendlyDropoffPlanet(
        harvester.ownerId,
        harvester.currentSystemId,
        harvester.position,
      );

      if (localDropoffPlanet) {
        const arrived = this.movePositionTowards(
          harvester,
          localDropoffPlanet.planet.position,
          speed * deltaSeconds,
          44,
        );
        if (arrived) {
          const player = this.players.get(harvester.ownerId);
          if (player) {
            if (harvester.cargoType === 'ore') {
              player.ore += Math.round(harvester.cargoAmount);
            } else {
              player.crystal += Math.round(harvester.cargoAmount);
            }
          }
          harvester.cargoAmount = 0;
          if (player) {
            harvester.cargoType =
              player.crystal * 1.4 < player.ore ? 'crystal' : 'ore';
          }
          harvester.targetBeltId = null;
          harvester.state = 'flying_to_belt';
        }
      } else if (harvester.currentSystemId === 'system_central_hub') {
        harvester.state = 'transiting_to_home';
        const returnWormhole = this.galaxy.wormholes.find(
          (wh) => wh.fromSystemId === harvester.homeSystemId,
        );
        if (returnWormhole) {
          const arrived = this.movePositionTowards(
            harvester,
            returnWormhole.toPosition,
            speed * deltaSeconds,
          );
          if (arrived) {
            harvester.currentSystemId = harvester.homeSystemId;
            harvester.position = {
              x: returnWormhole.fromPosition.x * 0.92,
              z: returnWormhole.fromPosition.z * 0.92,
            };
            harvester.state = 'returning_to_dropoff';
          }
        }
      }
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

    // Avoid picking the exact same rock another Harvester is already mining if possible
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

  private findNearestFriendlyDropoffPlanet(
    ownerId: PlayerSlotId,
    systemId: string,
    fromPos: Vector2D,
  ): PlanetRuntimeState | undefined {
    let best: PlanetRuntimeState | undefined;
    let bestDist = Infinity;
    for (const p of this.planets.values()) {
      if (p.planet.systemId !== systemId || p.ownerId !== ownerId) {
        continue;
      }
      const hasCompletedDropoff = p.structures.some(
        (s) =>
          s.isComplete &&
          (s.structureId === 'refinery' || s.structureId === 'command_and_control'),
      );
      if (!hasCompletedDropoff) {
        continue;
      }
      const d = Math.hypot(
        p.planet.position.x - fromPos.x,
        p.planet.position.z - fromPos.z,
      );
      if (d < bestDist) {
        bestDist = d;
        best = p;
      }
    }
    return best;
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
