import type {
  DeepSpaceStructureId,
  MatchPresetId,
  MatchSetupConfig,
} from '../config/index.ts';
import type { PlayerSlotId, Vector2D } from '../protocol/commands.ts';
import type { StateSnapshot } from '../protocol/snapshots.ts';
import { createFiveSystemGalaxy, type GalaxyTopology } from './galaxy.ts';
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
import type { PlayerSystemView, ProjectedPlanetView } from './playerIntel.ts';
import {
  computeFleetLiveAnchor,
  getMaxConcurrentDocksForPreset,
  getPlatformUnloadRateForPreset,
  validateDeepSpacePlacementPure,
  type SimulationView,
} from './simulationView.ts';

function toPlanetRuntimeState(view: ProjectedPlanetView): PlanetRuntimeState {
  const structures: OrbitalStructureInstance[] = [];
  for (const s of view.structures) {
    if (s.kind === 'live') {
      structures.push(s.structure);
    }
  }
  return {
    planet: view.planet,
    ownerId: view.ownerId,
    structures,
  };
}

export class SnapshotSimulationView implements SimulationView {
  public readonly galaxy: GalaxyTopology = createFiveSystemGalaxy();
  private snapshot: StateSnapshot;
  private readonly pendingCombatEvents: CombatVisualEvent[] = [];

  constructor(initialSnapshot: StateSnapshot) {
    this.snapshot = initialSnapshot;
    if (initialSnapshot.combatEvents.length > 0) {
      this.pendingCombatEvents.push(...initialSnapshot.combatEvents);
    }
  }

  public get presetId(): MatchPresetId {
    return this.snapshot.presetId;
  }

  public get currentTick(): number {
    return this.snapshot.tick;
  }

  public get elapsedSeconds(): number {
    return this.snapshot.elapsedSeconds;
  }

  public applySnapshot(snapshot: StateSnapshot): void {
    this.snapshot = snapshot;
    if (snapshot.combatEvents.length > 0) {
      this.pendingCombatEvents.push(...snapshot.combatEvents);
    }
  }

  public getMatchSetup(): MatchSetupConfig {
    return this.snapshot.matchSetup;
  }

  public getMatchOutcome(): MatchOutcomeState {
    return this.snapshot.matchOutcome;
  }

  public getPlayerState(playerId: PlayerSlotId): PlayerEconomyState {
    if (playerId !== this.snapshot.viewerId) {
      throw new Error(`Player economy not available in snapshot for ${playerId}`);
    }
    return this.snapshot.viewerEconomy;
  }

  public isPlayerInActiveCombat(
    playerId: PlayerSlotId,
    _windowSeconds = 2.0,
  ): boolean {
    return playerId === this.snapshot.viewerId
      ? this.snapshot.isViewerInActiveCombat
      : false;
  }

  public isPlayerDefeated(playerId: PlayerSlotId): boolean {
    return this.snapshot.matchOutcome.defeatedPlayerIds.includes(playerId);
  }

  public getPlayerSystemView(
    viewerId: PlayerSlotId,
    systemId: string,
  ): PlayerSystemView {
    if (viewerId !== this.snapshot.viewerId) {
      throw new Error(
        `SnapshotSimulationView for ${this.snapshot.viewerId} cannot serve view for ${viewerId}`,
      );
    }
    const sysView = this.snapshot.systems[systemId];
    if (!sysView) {
      throw new Error(`Unknown system id in snapshot: ${systemId}`);
    }
    return sysView;
  }

  public consumeCombatEvents(viewerId?: PlayerSlotId): CombatVisualEvent[] {
    if (this.pendingCombatEvents.length === 0) {
      return [];
    }
    const drained = this.pendingCombatEvents.splice(
      0,
      this.pendingCombatEvents.length,
    );
    if (viewerId && viewerId !== this.snapshot.viewerId) {
      return [];
    }
    return drained;
  }

  public getFleetsForPlayer(playerId: PlayerSlotId): readonly FleetInstance[] {
    return playerId === this.snapshot.viewerId ? this.snapshot.viewerFleets : [];
  }

  public getFleetById(fleetId: string): FleetInstance | undefined {
    return this.snapshot.viewerFleets.find((f) => f.id === fleetId);
  }

  public getShipsInFleet(fleetId: string): readonly CombatShipUnitState[] {
    const ships: CombatShipUnitState[] = [];
    for (const sysView of Object.values(this.snapshot.systems)) {
      for (const ship of sysView.combatShips) {
        if (ship.fleetId === fleetId) {
          ships.push(ship);
        }
      }
    }
    return ships;
  }

  public getFleetLiveAnchor(
    fleetId: string,
  ): { readonly systemId: string; readonly position: Vector2D } | null {
    const fleet = this.getFleetById(fleetId);
    if (!fleet) {
      return null;
    }
    return computeFleetLiveAnchor(fleet, this.getShipsInFleet(fleetId));
  }

  public getPlanetState(planetId: string): PlanetRuntimeState {
    for (const sysView of Object.values(this.snapshot.systems)) {
      const planetView = sysView.planets.find((p) => p.planet.id === planetId);
      if (planetView) {
        return toPlanetRuntimeState(planetView);
      }
    }
    throw new Error(`Unknown planet id in snapshot: ${planetId}`);
  }

  public getPlanetsInSystem(systemId: string): readonly PlanetRuntimeState[] {
    const sysView = this.snapshot.systems[systemId];
    if (!sysView) {
      return [];
    }
    return sysView.planets.map(toPlanetRuntimeState);
  }

  public getStructureById(
    structureId: string,
  ):
    | {
        readonly planetState: PlanetRuntimeState;
        readonly structure: OrbitalStructureInstance;
      }
    | undefined {
    for (const sysView of Object.values(this.snapshot.systems)) {
      for (const planetView of sysView.planets) {
        for (const projected of planetView.structures) {
          if (projected.kind === 'live' && projected.structure.id === structureId) {
            return {
              planetState: toPlanetRuntimeState(planetView),
              structure: projected.structure,
            };
          }
        }
      }
    }
    return undefined;
  }

  public getDeepSpaceStructureById(
    structureId: string,
  ): DeepSpaceStructureInstance | undefined {
    for (const sysView of Object.values(this.snapshot.systems)) {
      for (const projected of sysView.deepSpaceStructures) {
        if (projected.kind === 'live' && projected.structure.id === structureId) {
          return projected.structure;
        }
      }
    }
    return undefined;
  }

  public getCombatShipById(shipId: string): CombatShipUnitState | undefined {
    for (const sysView of Object.values(this.snapshot.systems)) {
      const ship = sysView.combatShips.find((s) => s.id === shipId);
      if (ship) {
        return ship;
      }
    }
    return undefined;
  }

  public getHarvesterById(
    harvesterId: string,
  ): HarvesterUnitState | undefined {
    for (const sysView of Object.values(this.snapshot.systems)) {
      const harvester = sysView.harvesters.find((h) => h.id === harvesterId);
      if (harvester) {
        return harvester;
      }
    }
    return undefined;
  }

  public getPlayerTechModuleCount(playerId: PlayerSlotId): number {
    if (playerId === this.snapshot.viewerId) {
      return this.snapshot.viewerEconomy.techModulesCompleted;
    }
    let count = 0;
    for (const sysView of Object.values(this.snapshot.systems)) {
      for (const planetView of sysView.planets) {
        for (const projected of planetView.structures) {
          if (
            projected.kind === 'live' &&
            projected.structure.ownerId === playerId &&
            projected.structure.structureId === 'tech_module' &&
            projected.structure.isComplete
          ) {
            count += 1;
          }
        }
      }
    }
    return count;
  }

  public validateDeepSpacePlacement(
    playerId: PlayerSlotId,
    systemId: string,
    position: Vector2D,
    structureId: DeepSpaceStructureId,
  ): CommandResult {
    const sysView = this.snapshot.systems[systemId];
    const existingInSystem: DeepSpaceStructureInstance[] = [];
    if (sysView) {
      for (const projected of sysView.deepSpaceStructures) {
        if (projected.kind === 'live') {
          existingInSystem.push(projected.structure);
        }
      }
    }
    return validateDeepSpacePlacementPure({
      player:
        playerId === this.snapshot.viewerId
          ? this.snapshot.viewerEconomy
          : undefined,
      galaxy: this.galaxy,
      playerId,
      systemId,
      position,
      structureId,
      existingInSystem,
    });
  }

  public getMaxConcurrentDocks(structure: OrbitalStructureInstance): number {
    return getMaxConcurrentDocksForPreset(this.presetId, structure);
  }

  public getPlatformUnloadRatePerSecond(
    structure: OrbitalStructureInstance,
  ): number {
    return getPlatformUnloadRateForPreset(this.presetId, structure);
  }
}
