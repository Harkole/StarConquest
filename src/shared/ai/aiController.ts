import {
  AI_DIFFICULTY_PROFILES,
  AI_FLEET_DOCTRINE_TABLE,
  AI_ORBITAL_BUILD_TABLE,
  DEEP_SPACE_STRUCTURES,
  ORBITAL_STRUCTURES,
  PLAYER_SLOT_IDS,
  SHIP_CLASSES,
  type AIDifficultyId,
  type AIDifficultyProfile,
  type AIOrbitalBuildContext,
  type CombatShipClassId,
  type DeepSpaceStructureId,
  type MatchPresetId,
  type OrbitalStructureId,
} from '../config/index.ts';
import type {
  FleetHullClassId,
  GameCommand,
  PlayerSlotId,
  ResourceTargetFocus,
  Vector2D,
} from '../protocol/commands.ts';
import type { GalaxyTopology } from '../sim/galaxy.ts';
import {
  BATTLE_SIMULATOR_SYSTEM_ID,
  CENTRAL_SUPER_EARTH_PLANET_ID,
  MAX_SHIP_PRODUCTION_QUEUE_SIZE,
  SMALLEST_FIRST_FLEET_HULLS,
  type GameSimulation,
  type PlanetRuntimeState,
} from '../sim/gameSimulation.ts';

export interface AIBotController {
  readonly playerId: PlayerSlotId;
  readonly difficulty?: AIDifficultyId;
  decideNextCommands(
    galaxy: GalaxyTopology,
    currentTick: number,
    simulation?: GameSimulation,
  ): readonly GameCommand[];
}

export interface AIBotRuntimeSnapshot extends AIOrbitalBuildContext {
  readonly playerId: PlayerSlotId;
  readonly currentTick: number;
  readonly presetId: MatchPresetId;
  readonly homeSystemId: string;
  readonly homeworldId: string;
  readonly homeworld: PlanetRuntimeState | null;
  readonly ownedPlanets: readonly PlanetRuntimeState[];
  readonly ownedSecondaryOrHubPlanets: readonly PlanetRuntimeState[];
  readonly unclaimedHomePlanets: readonly PlanetRuntimeState[];
  readonly unclaimedCentralHubPlanets: readonly PlanetRuntimeState[];
  readonly harvesterCount: number;
  readonly queuedHarvesterCount: number;
  readonly starterCrystalRemainingRatio: number;
  readonly hostilesInHomeSystem: number;
  readonly primaryHostileCentroidInHomeSystem: Vector2D | null;
  readonly observedHostileHullCounts: Readonly<Record<CombatShipClassId, number>>;
}

export function findAvailableOrbitalSlot(
  planetState: PlanetRuntimeState,
  slotCost: 1 | 2,
): number | null {
  const occupied = new Set<number>();
  for (const structure of planetState.structures) {
    for (const slot of structure.occupiedSlots) {
      occupied.add(slot);
    }
  }

  const totalSlots = planetState.planet.orbitalSlots;
  for (let slotIndex = 0; slotIndex < totalSlots; slotIndex++) {
    if (occupied.has(slotIndex)) {
      continue;
    }
    if (slotCost === 1) {
      return slotIndex;
    }
    const nextSlot = (slotIndex + 1) % totalSlots;
    const prevSlot = (slotIndex - 1 + totalSlots) % totalSlots;
    if (!occupied.has(nextSlot) || !occupied.has(prevSlot)) {
      return slotIndex;
    }
  }

  return null;
}

export function findValidDeepSpaceBuildPosition(
  simulation: GameSimulation,
  playerId: PlayerSlotId,
  systemId: string,
  anchor: Vector2D,
  structureId: DeepSpaceStructureId,
  minRadius = 48,
  maxRadius = 180,
): Vector2D | null {
  const radialStep = 20;
  const angleSamples = 16;

  for (let radius = minRadius; radius <= maxRadius; radius += radialStep) {
    for (let i = 0; i < angleSamples; i++) {
      const angle = (i / angleSamples) * Math.PI * 2;
      const candidate: Vector2D = {
        x: Math.round(anchor.x + Math.cos(angle) * radius),
        z: Math.round(anchor.z + Math.sin(angle) * radius),
      };
      const res = simulation.validateDeepSpacePlacement(
        playerId,
        systemId,
        candidate,
        structureId,
      );
      if (res.ok) {
        return candidate;
      }
    }
  }

  return null;
}

export function buildAIBotRuntimeSnapshot(
  galaxy: GalaxyTopology,
  simulation: GameSimulation,
  playerId: PlayerSlotId,
): AIBotRuntimeSnapshot {
  const player = simulation.getPlayerState(playerId);
  const starterSystem =
    galaxy.systems.find((s) => s.starterOwnerSlot === playerId) ??
    galaxy.systems[0]!;
  const homeSystemId = starterSystem.id;
  const homeworldNode = starterSystem.planets[0];
  const homeworldId = homeworldNode?.id ?? `${homeSystemId}_homeworld`;

  let homeworld: PlanetRuntimeState | null = null;
  const ownedPlanets: PlanetRuntimeState[] = [];
  const ownedSecondaryOrHubPlanets: PlanetRuntimeState[] = [];
  const unclaimedHomePlanets: PlanetRuntimeState[] = [];
  const unclaimedCentralHubPlanets: PlanetRuntimeState[] = [];

  const structureCounts: Record<OrbitalStructureId, number> = {
    command_and_control: 0,
    planetary_outpost: 0,
    orbital_dockyard: 0,
    refinery: 0,
    tech_module: 0,
    heavy_defense_platform: 0,
  };

  for (const system of galaxy.systems) {
    const planetsInSystem = simulation.getPlanetsInSystem(system.id);
    for (const pState of planetsInSystem) {
      if (pState.planet.id === homeworldId) {
        homeworld = pState;
      }
      if (pState.ownerId === playerId) {
        ownedPlanets.push(pState);
        if (pState.planet.id !== homeworldId) {
          ownedSecondaryOrHubPlanets.push(pState);
        }
        for (const s of pState.structures) {
          if (s.ownerId === playerId && s.hull > 0) {
            structureCounts[s.structureId] += 1;
          }
        }
      } else if (pState.ownerId === null) {
        if (system.id === homeSystemId) {
          unclaimedHomePlanets.push(pState);
        } else {
          unclaimedCentralHubPlanets.push(pState);
        }
      }
    }
  }

  unclaimedCentralHubPlanets.sort((a, b) => {
    const aIsSuper = a.planet.id === CENTRAL_SUPER_EARTH_PLANET_ID ? 0 : 1;
    const bIsSuper = b.planet.id === CENTRAL_SUPER_EARTH_PLANET_ID ? 0 : 1;
    if (aIsSuper !== bIsSuper) {
      return aIsSuper - bIsSuper;
    }
    const aIsHub = a.planet.systemId === 'system_central_hub' ? 0 : 1;
    const bIsHub = b.planet.systemId === 'system_central_hub' ? 0 : 1;
    if (aIsHub !== bIsHub) {
      return aIsHub - bIsHub;
    }
    return b.planet.orbitalSlots - a.planet.orbitalSlots;
  });

  const homeStructures = homeworld?.structures ?? [];
  const homeRefineryCount = homeStructures.filter(
    (s) => s.ownerId === playerId && s.structureId === 'refinery',
  ).length;
  const homeDockyardCount = homeStructures.filter(
    (s) => s.ownerId === playerId && s.structureId === 'orbital_dockyard',
  ).length;
  const homeHeavyDefenseCount = homeStructures.filter(
    (s) => s.ownerId === playerId && s.structureId === 'heavy_defense_platform',
  ).length;

  const ownedSecondaryOrHubWithoutRefineryCount =
    ownedSecondaryOrHubPlanets.filter(
      (p) =>
        !p.structures.some((s) => s.structureId === 'refinery') &&
        findAvailableOrbitalSlot(p, 1) !== null,
    ).length;

  const ownedSecondaryOrHubWithoutDockyardCount =
    ownedSecondaryOrHubPlanets.filter(
      (p) =>
        !p.structures.some((s) => s.structureId === 'orbital_dockyard') &&
        findAvailableOrbitalSlot(p, 2) !== null,
    ).length;

  const harvesterCount = simulation
    .getAllHarvesters()
    .filter((h) => h.ownerId === playerId && h.hull > 0).length;

  let queuedHarvesterCount = 0;
  for (const p of ownedPlanets) {
    for (const s of p.structures) {
      for (const q of s.productionQueue) {
        if (q.shipClassId === 'harvester') {
          queuedHarvesterCount += 1;
        }
      }
    }
  }

  const homeRes = simulation.getSystemResourceSummary(homeSystemId);
  const starterCrystalRemainingRatio =
    homeRes.initialCrystal > 0
      ? homeRes.remainingCrystal / homeRes.initialCrystal
      : 0;

  const observedHostileHullCounts: Record<CombatShipClassId, number> = {
    fighter: 0,
    destroyer: 0,
    cruiser: 0,
    carrier: 0,
    dreadnought: 0,
  };

  let hostilesInHomeSystem = 0;
  let hostileHomeSumX = 0;
  let hostileHomeSumZ = 0;

  for (const ship of simulation.getAllCombatShips()) {
    if (
      ship.ownerId === playerId ||
      ship.hull <= 0 ||
      ship.currentSystemId === BATTLE_SIMULATOR_SYSTEM_ID
    ) {
      continue;
    }
    observedHostileHullCounts[ship.shipClassId] += 1;
    if (ship.currentSystemId === homeSystemId) {
      hostilesInHomeSystem += 1;
      hostileHomeSumX += ship.position.x;
      hostileHomeSumZ += ship.position.z;
    }
  }

  const primaryHostileCentroidInHomeSystem: Vector2D | null =
    hostilesInHomeSystem > 0
      ? {
          x: hostileHomeSumX / hostilesInHomeSystem,
          z: hostileHomeSumZ / hostilesInHomeSystem,
        }
      : null;

  return {
    playerId,
    currentTick: simulation.currentTick,
    elapsedSeconds: simulation.elapsedSeconds,
    presetId: simulation.presetId,
    ore: player.ore,
    crystal: player.crystal,
    supplyUsed: player.supplyUsed,
    supplyCap: player.supplyCap,
    techModulesCompleted: player.techModulesCompleted,
    homeSystemId,
    homeworldId,
    homeworld,
    ownedPlanets,
    ownedSecondaryOrHubPlanets,
    unclaimedHomePlanets,
    unclaimedCentralHubPlanets,
    harvesterCount,
    queuedHarvesterCount,
    starterCrystalRemainingRatio,
    hostilesInHomeSystem,
    primaryHostileCentroidInHomeSystem,
    observedHostileHullCounts,
    homeRefineryCount,
    homeDockyardCount,
    homeHeavyDefenseCount,
    unclaimedHomePlanetCount: unclaimedHomePlanets.length,
    unclaimedCentralHubPlanetCount: unclaimedCentralHubPlanets.length,
    ownedSecondaryOrHubWithoutRefineryCount,
    ownedSecondaryOrHubWithoutDockyardCount,
    structureCounts,
  };
}

export function computeDesiredAIFleetTemplate(
  snapshot: AIBotRuntimeSnapshot,
  profile: AIDifficultyProfile,
): Record<FleetHullClassId, number> {
  let stage = AI_FLEET_DOCTRINE_TABLE[0]!;
  for (const candidate of AI_FLEET_DOCTRINE_TABLE) {
    if (snapshot.techModulesCompleted >= candidate.minTechModules) {
      stage = candidate;
    }
  }

  const scale = profile.fleetScaleMultiplier;
  let destroyer = Math.max(
    2,
    Math.round(stage.baseDesiredCounts.destroyer * scale),
  );
  let cruiser =
    snapshot.techModulesCompleted >= 1
      ? Math.max(1, Math.round(stage.baseDesiredCounts.cruiser * scale))
      : 0;
  let carrier =
    snapshot.techModulesCompleted >= 2
      ? Math.max(1, Math.round(stage.baseDesiredCounts.carrier * scale))
      : 0;
  let dreadnought =
    snapshot.techModulesCompleted >= 2
      ? Math.max(1, Math.round(stage.baseDesiredCounts.dreadnought * scale))
      : 0;

  const enemy = snapshot.observedHostileHullCounts;

  if (enemy.dreadnought > 0) {
    if (snapshot.techModulesCompleted >= 2) {
      carrier += Math.min(2, enemy.dreadnought);
    }
    destroyer += 1;
  }

  if (enemy.fighter >= 3 || enemy.carrier > 0) {
    if (snapshot.techModulesCompleted >= 1) {
      cruiser += Math.min(
        3,
        Math.ceil((enemy.fighter + enemy.carrier * 2) / 3),
      );
    }
    destroyer += Math.min(2, Math.max(1, enemy.carrier));
  }

  if (enemy.cruiser + enemy.destroyer >= 3) {
    if (snapshot.techModulesCompleted >= 2) {
      dreadnought += Math.min(2, Math.max(1, Math.floor(enemy.cruiser / 2)));
    } else if (snapshot.techModulesCompleted >= 1) {
      cruiser += 1;
    }
  }

  return {
    destroyer: Math.min(12, destroyer),
    cruiser: Math.min(10, cruiser),
    carrier: Math.min(5, carrier),
    dreadnought: Math.min(5, dreadnought),
  };
}

export function evaluateAIBotCommands(
  galaxy: GalaxyTopology,
  simulation: GameSimulation,
  playerId: PlayerSlotId,
  profile: AIDifficultyProfile,
): readonly GameCommand[] {
  const snapshot = buildAIBotRuntimeSnapshot(galaxy, simulation, playerId);
  const commands: GameCommand[] = [];
  let virtualOre = snapshot.ore;
  let virtualCrystal = snapshot.crystal;

  const canEmitMore = (): boolean =>
    commands.length < profile.maxCommandsPerEvaluation;

  if (snapshot.starterCrystalRemainingRatio < 0.35) {
    simulation.setPlayerHarvestersCrossSystemMining(playerId, true);
  }

  if (canEmitMore()) {
    const desiredFocus: ResourceTargetFocus =
      snapshot.crystal * 1.55 < snapshot.ore ||
      (snapshot.crystal < 140 && snapshot.ore >= 240)
        ? 'crystal'
        : snapshot.ore < 180 && snapshot.crystal >= 260
          ? 'ore'
          : 'auto';

    for (const p of snapshot.ownedPlanets) {
      for (const s of p.structures) {
        if (
          s.ownerId === playerId &&
          s.isComplete &&
          (s.structureId === 'refinery' ||
            (s.structureId === 'command_and_control' &&
              snapshot.harvesterCount >= 2)) &&
          s.targetResource !== desiredFocus
        ) {
          commands.push({
            type: 'SET_REFINERY_TARGET',
            playerId,
            structureId: s.id,
            targetResource: desiredFocus,
          });
          break;
        }
      }
      if (!canEmitMore()) {
        break;
      }
    }
  }

  if (canEmitMore()) {
    const completedDropoffs: string[] = [];
    for (const p of snapshot.ownedPlanets) {
      for (const s of p.structures) {
        if (
          s.ownerId === playerId &&
          s.isComplete &&
          (s.structureId === 'refinery' ||
            s.structureId === 'command_and_control')
        ) {
          completedDropoffs.push(s.id);
        }
      }
    }

    const desiredHarvesters = Math.min(
      profile.maxTotalHarvesters,
      completedDropoffs.length * profile.targetHarvestersPerDropoff,
    );
    const totalHarvesters =
      snapshot.harvesterCount + snapshot.queuedHarvesterCount;
    const hCost = SHIP_CLASSES.harvester.cost;

    if (
      totalHarvesters < desiredHarvesters &&
      snapshot.homeRefineryCount >= 1 &&
      virtualOre >= hCost.ore &&
      virtualCrystal >= hCost.crystal
    ) {
      let dropoffWithQueueRoom: string | null = null;
      for (const p of snapshot.ownedPlanets) {
        for (const s of p.structures) {
          if (
            s.ownerId === playerId &&
            s.isComplete &&
            (s.structureId === 'refinery' ||
              s.structureId === 'command_and_control') &&
            s.productionQueue.length < MAX_SHIP_PRODUCTION_QUEUE_SIZE
          ) {
            dropoffWithQueueRoom = s.id;
            if (s.structureId === 'refinery') {
              break;
            }
          }
        }
        if (dropoffWithQueueRoom) {
          break;
        }
      }

      if (dropoffWithQueueRoom) {
        virtualOre -= hCost.ore;
        virtualCrystal -= hCost.crystal;
        commands.push({
          type: 'QUEUE_SHIP',
          playerId,
          dockyardOrRefineryId: dropoffWithQueueRoom,
          shipClassId: 'harvester',
          autoRepeat: false,
        });
      }
    }
  }

  if (canEmitMore()) {
    for (const rule of AI_ORBITAL_BUILD_TABLE) {
      if (!rule.shouldBuild(snapshot, profile)) {
        continue;
      }
      const cfg = ORBITAL_STRUCTURES[rule.structureId];
      if (virtualOre < cfg.cost.ore || virtualCrystal < cfg.cost.crystal) {
        continue;
      }

      let targetPlanet: PlanetRuntimeState | undefined;
      if (rule.targetScope === 'homeworld') {
        if (snapshot.homeworld && snapshot.homeworld.ownerId === playerId) {
          targetPlanet = snapshot.homeworld;
        }
      } else if (rule.targetScope === 'unclaimed_home_secondary') {
        targetPlanet = snapshot.unclaimedHomePlanets[0];
      } else if (rule.targetScope === 'unclaimed_central_hub') {
        targetPlanet = snapshot.unclaimedCentralHubPlanets[0];
      } else if (rule.targetScope === 'owned_secondary_or_hub') {
        if (rule.structureId === 'refinery') {
          targetPlanet = snapshot.ownedSecondaryOrHubPlanets.find(
            (p) =>
              !p.structures.some((s) => s.structureId === 'refinery') &&
              findAvailableOrbitalSlot(p, cfg.slotCost) !== null,
          );
        } else if (rule.structureId === 'orbital_dockyard') {
          targetPlanet =
            snapshot.ownedSecondaryOrHubPlanets.find(
              (p) =>
                !p.structures.some(
                  (s) => s.structureId === 'orbital_dockyard',
                ) && findAvailableOrbitalSlot(p, cfg.slotCost) !== null,
            ) ??
            (snapshot.homeworld &&
            snapshot.homeworld.ownerId === playerId &&
            findAvailableOrbitalSlot(snapshot.homeworld, cfg.slotCost) !== null
              ? snapshot.homeworld
              : undefined);
        } else {
          targetPlanet = snapshot.ownedPlanets.find(
            (p) => findAvailableOrbitalSlot(p, cfg.slotCost) !== null,
          );
        }
      }

      if (!targetPlanet) {
        continue;
      }

      const slotIndex = findAvailableOrbitalSlot(targetPlanet, cfg.slotCost);
      if (slotIndex === null) {
        continue;
      }

      virtualOre -= cfg.cost.ore;
      virtualCrystal -= cfg.cost.crystal;
      commands.push({
        type: 'BUILD_ORBITAL_STRUCTURE',
        playerId,
        planetId: targetPlanet.planet.id,
        slotIndex,
        structureId: rule.structureId,
      });
      break;
    }
  }

  if (
    canEmitMore() &&
    profile.enableDeepSpaceFortifications &&
    snapshot.structureCounts.orbital_dockyard >= 1
  ) {
    const homeDeepSpace = simulation
      .getDeepSpaceStructuresInSystem(snapshot.homeSystemId)
      .filter((ds) => ds.ownerId === playerId && ds.hull > 0);
    const hubDeepSpace = simulation
      .getDeepSpaceStructuresInSystem('system_central_hub')
      .filter((ds) => ds.ownerId === playerId && ds.hull > 0);
    const allOwnedHubs = [...homeDeepSpace, ...hubDeepSpace].filter(
      (ds) => ds.structureId === 'logistics_hub',
    );

    const homeWormhole = galaxy.wormholes.find(
      (w) => w.fromSystemId === snapshot.homeSystemId,
    );

    if (
      !homeDeepSpace.some((ds) => ds.structureId === 'logistics_hub') &&
      homeWormhole
    ) {
      const hubCfg = DEEP_SPACE_STRUCTURES.logistics_hub;
      if (virtualOre >= hubCfg.cost.ore && virtualCrystal >= hubCfg.cost.crystal) {
        const anchor: Vector2D = {
          x: homeWormhole.fromPosition.x * 0.72,
          z: homeWormhole.fromPosition.z * 0.72,
        };
        const pos = findValidDeepSpaceBuildPosition(
          simulation,
          playerId,
          snapshot.homeSystemId,
          anchor,
          'logistics_hub',
          48,
          240,
        );
        if (pos) {
          virtualOre -= hubCfg.cost.ore;
          virtualCrystal -= hubCfg.cost.crystal;
          commands.push({
            type: 'BUILD_DEEP_SPACE_STRUCTURE',
            playerId,
            systemId: snapshot.homeSystemId,
            position: pos,
            structureId: 'logistics_hub',
          });
        }
      }
    } else {
      const completedHubNeedingTowers = allOwnedHubs.find((hub) => {
        if (!hub.isComplete) {
          return false;
        }
        const sysStructures = simulation.getDeepSpaceStructuresInSystem(
          hub.systemId,
        );
        const nearbyTowers = sysStructures.filter(
          (other) =>
            other.ownerId === playerId &&
            (other.structureId === 'point_defence_tower' ||
              other.structureId === 'hull_breaker_tower') &&
            Math.hypot(
              other.position.x - hub.position.x,
              other.position.z - hub.position.z,
            ) <= DEEP_SPACE_STRUCTURES.logistics_hub.buildRadiusProvided,
        );
        return nearbyTowers.length < profile.towersPerLogisticsHub;
      });

      if (completedHubNeedingTowers) {
        const sysStructures = simulation.getDeepSpaceStructuresInSystem(
          completedHubNeedingTowers.systemId,
        );
        const nearbyTowers = sysStructures.filter(
          (other) =>
            other.ownerId === playerId &&
            (other.structureId === 'point_defence_tower' ||
              other.structureId === 'hull_breaker_tower') &&
            Math.hypot(
              other.position.x - completedHubNeedingTowers.position.x,
              other.position.z - completedHubNeedingTowers.position.z,
            ) <= DEEP_SPACE_STRUCTURES.logistics_hub.buildRadiusProvided,
        );
        const towerId: DeepSpaceStructureId =
          nearbyTowers.length % 2 === 0
            ? 'point_defence_tower'
            : 'hull_breaker_tower';
        const towerCfg = DEEP_SPACE_STRUCTURES[towerId];

        if (
          virtualOre >= towerCfg.cost.ore &&
          virtualCrystal >= towerCfg.cost.crystal
        ) {
          const pos = findValidDeepSpaceBuildPosition(
            simulation,
            playerId,
            completedHubNeedingTowers.systemId,
            completedHubNeedingTowers.position,
            towerId,
            46,
            165,
          );
          if (pos) {
            virtualOre -= towerCfg.cost.ore;
            virtualCrystal -= towerCfg.cost.crystal;
            commands.push({
              type: 'BUILD_DEEP_SPACE_STRUCTURE',
              playerId,
              systemId: completedHubNeedingTowers.systemId,
              position: pos,
              structureId: towerId,
            });
          }
        }
      } else if (
        snapshot.elapsedSeconds >= profile.centralHubExpansionAfterSeconds &&
        !hubDeepSpace.some((ds) => ds.structureId === 'logistics_hub') &&
        homeWormhole
      ) {
        const hubCfg = DEEP_SPACE_STRUCTURES.logistics_hub;
        if (
          virtualOre >= hubCfg.cost.ore &&
          virtualCrystal >= hubCfg.cost.crystal
        ) {
          const anchor: Vector2D = {
            x: homeWormhole.toPosition.x * 0.45,
            z: homeWormhole.toPosition.z * 0.45,
          };
          const pos = findValidDeepSpaceBuildPosition(
            simulation,
            playerId,
            'system_central_hub',
            anchor,
            'logistics_hub',
            60,
            260,
          );
          if (pos) {
            virtualOre -= hubCfg.cost.ore;
            virtualCrystal -= hubCfg.cost.crystal;
            commands.push({
              type: 'BUILD_DEEP_SPACE_STRUCTURE',
              playerId,
              systemId: 'system_central_hub',
              position: pos,
              structureId: 'logistics_hub',
            });
          }
        }
      }
    }
  }

  if (canEmitMore()) {
    const playerFleets = simulation.getFleetsForPlayer(playerId);
    if (
      playerFleets.length === 0 &&
      (snapshot.structureCounts.orbital_dockyard >= 1 ||
        simulation.getAllCombatShips().some((s) => s.ownerId === playerId))
    ) {
      commands.push({
        type: 'CREATE_FLEET',
        playerId,
        name: `${AI_DIFFICULTY_PROFILES[profile.id].displayName} Vanguard`,
        rallySystemId: snapshot.homeSystemId,
        rallyPosition: { x: 180, z: 120 },
        stance: 'aggressive',
        autoResupply: true,
      });
    } else if (playerFleets.length > 0) {
      const mainFleet = playerFleets[0]!;
      const desiredCounts = computeDesiredAIFleetTemplate(snapshot, profile);
      const needsTemplateUpdate = SMALLEST_FIRST_FLEET_HULLS.some(
        (hull) => mainFleet.desiredCounts[hull] !== desiredCounts[hull],
      );

      if (needsTemplateUpdate) {
        commands.push({
          type: 'UPDATE_FLEET_TEMPLATE',
          playerId,
          fleetId: mainFleet.id,
          desiredCounts,
        });
      }

      if (canEmitMore()) {
        const fleetShips = simulation.getShipsInFleet(mainFleet.id);
        const liveFleetSupply = fleetShips.reduce(
          (sum, s) => sum + SHIP_CLASSES[s.shipClassId].supplyCost,
          0,
        );
        const desiredFleetSupply = SMALLEST_FIRST_FLEET_HULLS.reduce(
          (sum, h) => sum + desiredCounts[h] * SHIP_CLASSES[h].supplyCost,
          0,
        );

        if (
          snapshot.hostilesInHomeSystem > 0 &&
          snapshot.primaryHostileCentroidInHomeSystem &&
          fleetShips.length > 0
        ) {
          const centroid = snapshot.primaryHostileCentroidInHomeSystem;
          const alreadyDefending =
            mainFleet.orderSystemId === snapshot.homeSystemId &&
            Math.hypot(
              mainFleet.orderPosition.x - centroid.x,
              mainFleet.orderPosition.z - centroid.z,
            ) <= 120;
          if (!alreadyDefending) {
            commands.push({
              type: 'ORDER_FLEET_ATTACK',
              playerId,
              fleetId: mainFleet.id,
              targetSystemId: snapshot.homeSystemId,
              targetPosition: centroid,
            });
          }
        } else if (fleetShips.length > 0) {
          const anchor = simulation.getFleetLiveAnchor(mainFleet.id);
          const fleetInCombat = fleetShips.some((s) => s.inCombat);
          if (
            fleetInCombat &&
            anchor &&
            anchor.systemId !== snapshot.homeSystemId &&
            mainFleet.orderType !== 'flee'
          ) {
            const shipsInSystem = simulation.getCombatShipsInSystem(
              anchor.systemId,
            );
            let friendlyPower = 0;
            let hostilePower = 0;
            for (const s of shipsInSystem) {
              if (s.hull <= 0) continue;
              const power = s.hull + s.shields;
              if (s.ownerId === playerId) {
                friendlyPower += power;
              } else {
                hostilePower += power;
              }
            }
            if (
              hostilePower > 0 &&
              friendlyPower / hostilePower < profile.retreatPowerRatio
            ) {
              commands.push({
                type: 'ORDER_FLEET_FLEE',
                playerId,
                fleetId: mainFleet.id,
              });
            }
          }

          const holdDefensiveInTutorial =
            snapshot.presetId === 'tutorial' &&
            profile.id === 'cadet' &&
            !isTutorialCadetProvoked(simulation, playerId, snapshot);

          if (
            canEmitMore() &&
            !holdDefensiveInTutorial &&
            !fleetInCombat &&
            fleetShips.length >= 2 &&
            desiredFleetSupply > 0 &&
            liveFleetSupply / desiredFleetSupply >= profile.attackReadinessRatio
          ) {
            const target = selectStrategicAttackTarget(
              galaxy,
              simulation,
              playerId,
              snapshot,
            );
            if (target) {
              const alreadyOrdered =
                mainFleet.orderSystemId === target.systemId &&
                Math.hypot(
                  mainFleet.orderPosition.x - target.position.x,
                  mainFleet.orderPosition.z - target.position.z,
                ) <= 160;
              if (!alreadyOrdered) {
                if (target.entityId) {
                  commands.push({
                    type: 'ORDER_FLEET_ATTACK',
                    playerId,
                    fleetId: mainFleet.id,
                    targetSystemId: target.systemId,
                    targetPosition: target.position,
                    targetEntityId: target.entityId,
                  });
                } else {
                  commands.push({
                    type: 'ORDER_FLEET_MOVE',
                    playerId,
                    fleetId: mainFleet.id,
                    targetSystemId: target.systemId,
                    targetPosition: target.position,
                  });
                }
              }
            }
          }
        }
      }
    }
  }

  return commands;
}

function isTutorialCadetProvoked(
  simulation: GameSimulation,
  playerId: PlayerSlotId,
  snapshot: AIBotRuntimeSnapshot,
): boolean {
  if (snapshot.hostilesInHomeSystem > 0) {
    return true;
  }
  for (const ship of simulation.getAllCombatShips()) {
    if (ship.ownerId !== playerId || ship.hull <= 0) continue;
    if (ship.inCombat || ship.hull < ship.maxHull) {
      return true;
    }
  }
  for (const h of simulation.getAllHarvesters()) {
    if (h.ownerId !== playerId || h.hull <= 0) continue;
    if (h.hull < h.maxHull) {
      return true;
    }
  }
  for (const planet of snapshot.ownedPlanets) {
    for (const s of planet.structures) {
      if (s.ownerId === playerId && s.hull < ORBITAL_STRUCTURES[s.structureId].maxHull) {
        return true;
      }
    }
  }
  return false;
}

function selectStrategicAttackTarget(
  galaxy: GalaxyTopology,
  simulation: GameSimulation,
  playerId: PlayerSlotId,
  snapshot: AIBotRuntimeSnapshot,
): {
  readonly systemId: string;
  readonly position: Vector2D;
  readonly entityId?: string;
} | null {
  const superEarth = simulation.getPlanetState(CENTRAL_SUPER_EARTH_PLANET_ID);
  if (superEarth.ownerId !== null && superEarth.ownerId !== playerId) {
    const enemyStruct = superEarth.structures.find((s) => s.hull > 0);
    if (enemyStruct) {
      return {
        systemId: 'system_central_hub',
        position: simulation.getStructureWorldPosition(superEarth, enemyStruct),
        entityId: enemyStruct.id,
      };
    }
  }

  const hubHostiles = simulation
    .getCombatShipsInSystem('system_central_hub')
    .filter((s) => s.ownerId !== playerId && s.hull > 0);
  if (hubHostiles.length > 0) {
    const first = hubHostiles[0]!;
    return {
      systemId: 'system_central_hub',
      position: { x: first.position.x, z: first.position.z },
      entityId: first.id,
    };
  }

  if (
    snapshot.presetId === 'grand_conquest' &&
    superEarth.ownerId === playerId
  ) {
    return {
      systemId: 'system_central_hub',
      position: { x: 140, z: 0 },
    };
  }

  for (const enemyId of PLAYER_SLOT_IDS) {
    if (
      enemyId === playerId ||
      !simulation.isPlayerSlotActive(enemyId) ||
      simulation.isPlayerDefeated(enemyId)
    ) {
      continue;
    }
    const enemySystem = galaxy.systems.find(
      (s) => s.starterOwnerSlot === enemyId,
    );
    if (!enemySystem) {
      continue;
    }
    for (const p of simulation.getPlanetsInSystem(enemySystem.id)) {
      const cnc = p.structures.find(
        (s) => s.ownerId === enemyId && s.structureId === 'command_and_control',
      );
      if (cnc) {
        return {
          systemId: enemySystem.id,
          position: simulation.getStructureWorldPosition(p, cnc),
          entityId: cnc.id,
        };
      }
    }
  }

  return {
    systemId: 'system_central_hub',
    position: { x: 140, z: 0 },
  };
}

export class StandardAIBot implements AIBotController {
  public readonly playerId: PlayerSlotId;
  public readonly difficulty: AIDifficultyId;

  constructor(
    playerId: PlayerSlotId,
    difficulty: AIDifficultyId = 'standard',
  ) {
    this.playerId = playerId;
    this.difficulty = difficulty;
  }

  public decideNextCommands(
    galaxy: GalaxyTopology,
    currentTick: number,
    simulation?: GameSimulation,
  ): readonly GameCommand[] {
    if (
      !simulation ||
      !simulation.isPlayerSlotActive(this.playerId) ||
      simulation.isPlayerDefeated(this.playerId) ||
      simulation.getMatchOutcome().status !== 'in_progress'
    ) {
      return [];
    }

    const profile = AI_DIFFICULTY_PROFILES[this.difficulty];
    const slotOffset = Math.max(0, PLAYER_SLOT_IDS.indexOf(this.playerId)) * 3;
    if ((currentTick + slotOffset) % profile.decisionIntervalTicks !== 0) {
      return [];
    }

    return evaluateAIBotCommands(galaxy, simulation, this.playerId, profile);
  }
}

