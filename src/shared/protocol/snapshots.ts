import {
  AI_DIFFICULTY_IDS,
  DEEP_SPACE_STRUCTURES,
  MATCH_PRESETS,
  ORBITAL_STRUCTURES,
  PLAYER_SLOT_IDS,
  SHIP_CLASSES,
  type AIDifficultyId,
  type MatchPresetId,
  type MatchSetupConfig,
  type PlayerSlotConfig,
} from '../config/index.ts';
import type { PlayerSystemView } from '../sim/playerIntel.ts';
import type {
  CombatVisualEvent,
  CommandResult,
  FleetInstance,
  MatchOutcomeState,
  PlayerEconomyState,
} from '../sim/gameSimulation.ts';
import type {
  FleetHullClassId,
  FleetStance,
  GameCommand,
  PlayerSlotId,
  ResourceTargetFocus,
  Vector2D,
} from './commands.ts';

export interface StateSnapshot {
  readonly version: 1;
  readonly tick: number;
  readonly elapsedSeconds: number;
  readonly presetId: MatchPresetId;
  readonly viewerId: PlayerSlotId;
  readonly matchSetup: MatchSetupConfig;
  readonly matchOutcome: MatchOutcomeState;
  readonly viewerEconomy: PlayerEconomyState;
  readonly viewerFleets: readonly FleetInstance[];
  readonly systems: Readonly<Record<string, PlayerSystemView>>;
  readonly combatEvents: readonly CombatVisualEvent[];
  readonly isViewerInActiveCombat: boolean;
}

export interface LobbyPeerSlotInfo {
  readonly slotId: PlayerSlotId;
  readonly kind: 'human' | 'ai' | 'empty';
  readonly aiDifficulty?: AIDifficultyId;
  readonly peerId: string | null;
  readonly connected: boolean;
}

export type P2PWireMessage =
  | {
      readonly kind: 'peer_hello';
      readonly peerId: string;
      readonly requestedSlotId?: PlayerSlotId;
    }
  | {
      readonly kind: 'peer_leave';
      readonly peerId: string;
      readonly reason?: string;
    }
  | {
      readonly kind: 'lobby_sync';
      readonly roomCode: string;
      readonly presetId: MatchPresetId;
      readonly hostPeerId: string;
      readonly slots: readonly LobbyPeerSlotInfo[];
    }
  | {
      readonly kind: 'match_start';
      readonly assignedSlotId: PlayerSlotId;
      readonly matchSetup: MatchSetupConfig;
      readonly initialSnapshot: StateSnapshot;
    }
  | {
      readonly kind: 'state_snapshot';
      readonly snapshot: StateSnapshot;
    }
  | {
      readonly kind: 'player_command';
      readonly commandId: string;
      readonly command: GameCommand;
    }
  | {
      readonly kind: 'command_ack';
      readonly commandId: string;
      readonly result: CommandResult;
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isPlayerSlotId(value: unknown): value is PlayerSlotId {
  return (
    typeof value === 'string' &&
    (PLAYER_SLOT_IDS as readonly string[]).includes(value)
  );
}

function isMatchPresetId(value: unknown): value is MatchPresetId {
  return typeof value === 'string' && value in MATCH_PRESETS;
}

function isAIDifficultyId(value: unknown): value is AIDifficultyId {
  return (
    typeof value === 'string' &&
    (AI_DIFFICULTY_IDS as readonly string[]).includes(value)
  );
}

function isVector2D(value: unknown): value is Vector2D {
  return isRecord(value) && isFiniteNumber(value.x) && isFiniteNumber(value.z);
}

function isFleetStance(value: unknown): value is FleetStance {
  return value === 'aggressive' || value === 'hold_the_line' || value === 'passive';
}

function isFleetHullClassId(value: unknown): value is FleetHullClassId {
  return (
    value === 'destroyer' ||
    value === 'cruiser' ||
    value === 'carrier' ||
    value === 'dreadnought'
  );
}

function isResourceTargetFocus(value: unknown): value is ResourceTargetFocus {
  return value === 'auto' || value === 'ore' || value === 'crystal';
}

function isPlayerSlotConfig(value: unknown): value is PlayerSlotConfig {
  if (!isRecord(value)) {
    return false;
  }
  if (value.kind === 'human' || value.kind === 'empty') {
    return true;
  }
  if (value.kind === 'ai') {
    return isAIDifficultyId(value.difficulty);
  }
  return false;
}

function isMatchSetupConfig(value: unknown): value is MatchSetupConfig {
  if (!isRecord(value)) {
    return false;
  }
  if (!isMatchPresetId(value.presetId) || !isPlayerSlotId(value.localPlayerId)) {
    return false;
  }
  if (!isRecord(value.slots)) {
    return false;
  }
  const slots = value.slots;
  for (const slotId of PLAYER_SLOT_IDS) {
    if (!isPlayerSlotConfig(slots[slotId])) {
      return false;
    }
  }
  return true;
}

function isPlayerEconomyState(value: unknown): value is PlayerEconomyState {
  if (!isRecord(value)) {
    return false;
  }
  return (
    isPlayerSlotId(value.playerId) &&
    isFiniteNumber(value.ore) &&
    isFiniteNumber(value.crystal) &&
    isFiniteNumber(value.supplyUsed) &&
    isFiniteNumber(value.supplyCap) &&
    isFiniteNumber(value.techModulesCompleted)
  );
}

function isMatchOutcomeState(value: unknown): value is MatchOutcomeState {
  if (!isRecord(value)) {
    return false;
  }
  if (
    value.status !== 'in_progress' &&
    value.status !== 'victory' &&
    value.status !== 'defeat' &&
    value.status !== 'draw'
  ) {
    return false;
  }
  if (value.winnerId !== null && !isPlayerSlotId(value.winnerId)) {
    return false;
  }
  if (
    value.victoryCondition !== null &&
    value.victoryCondition !== 'last_cnc_standing' &&
    value.victoryCondition !== 'king_of_the_hill'
  ) {
    return false;
  }
  if (value.finishedAtSeconds !== null && !isFiniteNumber(value.finishedAtSeconds)) {
    return false;
  }
  if (
    !Array.isArray(value.activeContenderIds) ||
    !value.activeContenderIds.every(isPlayerSlotId)
  ) {
    return false;
  }
  if (
    !Array.isArray(value.defeatedPlayerIds) ||
    !value.defeatedPlayerIds.every(isPlayerSlotId)
  ) {
    return false;
  }
  return isRecord(value.kingOfTheHill) && Array.isArray(value.standings);
}

function isFleetInstance(value: unknown): value is FleetInstance {
  if (!isRecord(value)) {
    return false;
  }
  return (
    isNonEmptyString(value.id) &&
    typeof value.name === 'string' &&
    isPlayerSlotId(value.ownerId) &&
    isNonEmptyString(value.rallySystemId) &&
    isVector2D(value.rallyPosition) &&
    isFleetStance(value.stance) &&
    typeof value.autoResupply === 'boolean' &&
    isRecord(value.desiredCounts) &&
    isRecord(value.initialBuiltCounts) &&
    isNonEmptyString(value.orderType) &&
    isNonEmptyString(value.orderSystemId) &&
    isVector2D(value.orderPosition) &&
    (value.attackTargetId === null || typeof value.attackTargetId === 'string') &&
    Array.isArray(value.patrolWaypoints) &&
    isFiniteNumber(value.patrolIndex)
  );
}

function isPlayerSystemView(value: unknown): value is PlayerSystemView {
  if (!isRecord(value)) {
    return false;
  }
  return (
    isPlayerSlotId(value.viewerId) &&
    isNonEmptyString(value.systemId) &&
    (value.fogMode === 'open_occupied_systems' || value.fogMode === 'sensor_range') &&
    isRecord(value.coverage) &&
    typeof value.isExplored === 'boolean' &&
    Array.isArray(value.planets) &&
    Array.isArray(value.deepSpaceStructures) &&
    Array.isArray(value.combatShips) &&
    Array.isArray(value.harvesters) &&
    Array.isArray(value.miningBelts) &&
    (value.resourceSummary === null || isRecord(value.resourceSummary))
  );
}

function isCombatVisualEvent(value: unknown): value is CombatVisualEvent {
  if (!isRecord(value)) {
    return false;
  }
  return (
    isFiniteNumber(value.id) &&
    (value.type === 'weapon_fire' ||
      value.type === 'shield_impact' ||
      value.type === 'hull_explosion') &&
    isNonEmptyString(value.systemId) &&
    isVector2D(value.fromPos) &&
    isVector2D(value.toPos) &&
    isPlayerSlotId(value.ownerId) &&
    isFiniteNumber(value.timestampSeconds)
  );
}

export function isStateSnapshot(value: unknown): value is StateSnapshot {
  if (!isRecord(value)) {
    return false;
  }
  if (
    value.version !== 1 ||
    !isFiniteNumber(value.tick) ||
    !isFiniteNumber(value.elapsedSeconds) ||
    !isMatchPresetId(value.presetId) ||
    !isPlayerSlotId(value.viewerId) ||
    !isMatchSetupConfig(value.matchSetup) ||
    !isMatchOutcomeState(value.matchOutcome) ||
    !isPlayerEconomyState(value.viewerEconomy) ||
    !Array.isArray(value.viewerFleets) ||
    !value.viewerFleets.every(isFleetInstance) ||
    !isRecord(value.systems) ||
    !Array.isArray(value.combatEvents) ||
    !value.combatEvents.every(isCombatVisualEvent) ||
    typeof value.isViewerInActiveCombat !== 'boolean'
  ) {
    return false;
  }

  for (const [systemId, systemView] of Object.entries(value.systems)) {
    if (!isNonEmptyString(systemId) || !isPlayerSystemView(systemView)) {
      return false;
    }
  }

  return true;
}

function isLobbyPeerSlotInfo(value: unknown): value is LobbyPeerSlotInfo {
  if (!isRecord(value)) {
    return false;
  }
  if (!isPlayerSlotId(value.slotId)) {
    return false;
  }
  if (value.kind !== 'human' && value.kind !== 'ai' && value.kind !== 'empty') {
    return false;
  }
  if (value.aiDifficulty !== undefined && !isAIDifficultyId(value.aiDifficulty)) {
    return false;
  }
  if (value.peerId !== null && !isNonEmptyString(value.peerId)) {
    return false;
  }
  return typeof value.connected === 'boolean';
}

function isWaypoint(
  value: unknown,
): value is { readonly systemId: string; readonly position: Vector2D } {
  return (
    isRecord(value) &&
    isNonEmptyString(value.systemId) &&
    isVector2D(value.position)
  );
}

function isGameCommand(value: unknown): value is GameCommand {
  if (!isRecord(value) || !isPlayerSlotId(value.playerId)) {
    return false;
  }
  switch (value.type) {
    case 'BUILD_ORBITAL_STRUCTURE':
      return (
        isNonEmptyString(value.planetId) &&
        isFiniteNumber(value.slotIndex) &&
        typeof value.structureId === 'string' &&
        value.structureId in ORBITAL_STRUCTURES
      );
    case 'CANCEL_ORBITAL_STRUCTURE':
    case 'DECOMMISSION_ORBITAL_STRUCTURE':
      return isNonEmptyString(value.structureId);
    case 'BUILD_DEEP_SPACE_STRUCTURE':
      return (
        isNonEmptyString(value.systemId) &&
        isVector2D(value.position) &&
        typeof value.structureId === 'string' &&
        value.structureId in DEEP_SPACE_STRUCTURES
      );
    case 'QUEUE_SHIP':
      return (
        isNonEmptyString(value.dockyardOrRefineryId) &&
        typeof value.shipClassId === 'string' &&
        value.shipClassId in SHIP_CLASSES &&
        typeof value.autoRepeat === 'boolean'
      );
    case 'SET_RALLY_POINT':
      return (
        isNonEmptyString(value.dockyardId) &&
        isNonEmptyString(value.targetSystemId) &&
        isVector2D(value.targetPosition) &&
        isFleetStance(value.stance)
      );
    case 'SET_PATROL_ROUTE':
      return (
        isNonEmptyString(value.dockyardId) &&
        Array.isArray(value.waypoints) &&
        value.waypoints.every(isWaypoint) &&
        isFleetStance(value.stance)
      );
    case 'SET_REFINERY_TARGET':
      return (
        isNonEmptyString(value.structureId) &&
        isResourceTargetFocus(value.targetResource)
      );
    case 'CANCEL_QUEUED_SHIP':
      return (
        isNonEmptyString(value.structureId) &&
        isNonEmptyString(value.queueItemId)
      );
    case 'CREATE_FLEET':
      return (
        (value.name === undefined || typeof value.name === 'string') &&
        isNonEmptyString(value.rallySystemId) &&
        isVector2D(value.rallyPosition) &&
        (value.stance === undefined || isFleetStance(value.stance)) &&
        (value.autoResupply === undefined || typeof value.autoResupply === 'boolean')
      );
    case 'UPDATE_FLEET_TEMPLATE': {
      if (!isNonEmptyString(value.fleetId) || !isRecord(value.desiredCounts)) {
        return false;
      }
      for (const [k, v] of Object.entries(value.desiredCounts)) {
        if (!isFleetHullClassId(k) || !isFiniteNumber(v)) {
          return false;
        }
      }
      return true;
    }
    case 'SET_FLEET_STANCE':
      return isNonEmptyString(value.fleetId) && isFleetStance(value.stance);
    case 'SET_FLEET_RESUPPLY':
      return (
        isNonEmptyString(value.fleetId) &&
        typeof value.autoResupply === 'boolean'
      );
    case 'ORDER_FLEET_MOVE':
      return (
        isNonEmptyString(value.fleetId) &&
        isNonEmptyString(value.targetSystemId) &&
        isVector2D(value.targetPosition)
      );
    case 'ORDER_FLEET_ATTACK':
      return (
        isNonEmptyString(value.fleetId) &&
        isNonEmptyString(value.targetSystemId) &&
        isVector2D(value.targetPosition) &&
        (value.targetEntityId === undefined || typeof value.targetEntityId === 'string')
      );
    case 'ORDER_FLEET_PATROL':
      return (
        isNonEmptyString(value.fleetId) &&
        Array.isArray(value.waypoints) &&
        value.waypoints.every(isWaypoint)
      );
    case 'ORDER_FLEET_FLEE':
    case 'DISBAND_FLEET':
      return isNonEmptyString(value.fleetId);
    case 'SPLIT_FLEET':
      return (
        isNonEmptyString(value.sourceFleetId) &&
        (value.newFleetName === undefined || typeof value.newFleetName === 'string')
      );
    case 'MERGE_FLEETS':
      return (
        isNonEmptyString(value.sourceFleetId) &&
        isNonEmptyString(value.targetFleetId)
      );
    case 'SET_DOCKYARD_FLEET_BUILDING':
      return (
        isNonEmptyString(value.dockyardId) &&
        typeof value.enabled === 'boolean'
      );
    default:
      return false;
  }
}

function isCommandResult(value: unknown): value is CommandResult {
  if (!isRecord(value)) {
    return false;
  }
  return (
    typeof value.ok === 'boolean' &&
    (value.reason === undefined || typeof value.reason === 'string')
  );
}

export function parseP2PWireMessage(raw: unknown): P2PWireMessage | null {
  if (!isRecord(raw)) {
    return null;
  }

  switch (raw.kind) {
    case 'peer_hello':
      if (
        !isNonEmptyString(raw.peerId) ||
        (raw.requestedSlotId !== undefined && !isPlayerSlotId(raw.requestedSlotId))
      ) {
        return null;
      }
      return {
        kind: 'peer_hello',
        peerId: raw.peerId,
        ...(raw.requestedSlotId !== undefined
          ? { requestedSlotId: raw.requestedSlotId }
          : {}),
      };

    case 'peer_leave':
      if (
        !isNonEmptyString(raw.peerId) ||
        (raw.reason !== undefined && typeof raw.reason !== 'string')
      ) {
        return null;
      }
      return {
        kind: 'peer_leave',
        peerId: raw.peerId,
        ...(raw.reason !== undefined ? { reason: raw.reason } : {}),
      };

    case 'lobby_sync':
      if (
        !isNonEmptyString(raw.roomCode) ||
        !isMatchPresetId(raw.presetId) ||
        !isNonEmptyString(raw.hostPeerId) ||
        !Array.isArray(raw.slots) ||
        !raw.slots.every(isLobbyPeerSlotInfo)
      ) {
        return null;
      }
      return {
        kind: 'lobby_sync',
        roomCode: raw.roomCode,
        presetId: raw.presetId,
        hostPeerId: raw.hostPeerId,
        slots: raw.slots,
      };

    case 'match_start':
      if (
        !isPlayerSlotId(raw.assignedSlotId) ||
        !isMatchSetupConfig(raw.matchSetup) ||
        !isStateSnapshot(raw.initialSnapshot)
      ) {
        return null;
      }
      return {
        kind: 'match_start',
        assignedSlotId: raw.assignedSlotId,
        matchSetup: raw.matchSetup,
        initialSnapshot: raw.initialSnapshot,
      };

    case 'state_snapshot':
      if (!isStateSnapshot(raw.snapshot)) {
        return null;
      }
      return {
        kind: 'state_snapshot',
        snapshot: raw.snapshot,
      };

    case 'player_command':
      if (!isNonEmptyString(raw.commandId) || !isGameCommand(raw.command)) {
        return null;
      }
      return {
        kind: 'player_command',
        commandId: raw.commandId,
        command: raw.command,
      };

    case 'command_ack':
      if (!isNonEmptyString(raw.commandId) || !isCommandResult(raw.result)) {
        return null;
      }
      return {
        kind: 'command_ack',
        commandId: raw.commandId,
        result: raw.result,
      };

    default:
      return null;
  }
}
