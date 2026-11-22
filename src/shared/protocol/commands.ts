import type {
  DeepSpaceStructureId,
  OrbitalStructureId,
  ShipClassId,
} from '../config/index.ts';

export type PlayerSlotId = 'player_1' | 'player_2' | 'player_3' | 'player_4';

export type FleetStance = 'aggressive' | 'hold_the_line' | 'passive';

/** Shipyard-built combat hulls configurable in Fleet Composition Templates (Fighters auto-launch from Carriers & Logistics Hubs). */
export type FleetHullClassId = 'destroyer' | 'cruiser' | 'carrier' | 'dreadnought';

export type ResourceTargetFocus = 'auto' | 'ore' | 'crystal';

export interface Vector2D {
  readonly x: number;
  readonly z: number;
}

export interface BuildOrbitalStructureCommand {
  readonly type: 'BUILD_ORBITAL_STRUCTURE';
  readonly playerId: PlayerSlotId;
  readonly planetId: string;
  readonly slotIndex: number;
  readonly structureId: OrbitalStructureId;
}

export interface BuildDeepSpaceStructureCommand {
  readonly type: 'BUILD_DEEP_SPACE_STRUCTURE';
  readonly playerId: PlayerSlotId;
  readonly systemId: string;
  readonly position: Vector2D;
  readonly structureId: DeepSpaceStructureId;
}

export interface QueueShipCommand {
  readonly type: 'QUEUE_SHIP';
  readonly playerId: PlayerSlotId;
  readonly dockyardOrRefineryId: string;
  readonly shipClassId: ShipClassId;
  readonly autoRepeat: boolean;
}

export interface SetRallyPointCommand {
  readonly type: 'SET_RALLY_POINT';
  readonly playerId: PlayerSlotId;
  readonly dockyardId: string;
  readonly targetSystemId: string;
  readonly targetPosition: Vector2D;
  readonly stance: FleetStance;
}

export interface SetPatrolRouteCommand {
  readonly type: 'SET_PATROL_ROUTE';
  readonly playerId: PlayerSlotId;
  readonly dockyardId: string;
  readonly waypoints: readonly {
    readonly systemId: string;
    readonly position: Vector2D;
  }[];
  readonly stance: FleetStance;
}

export interface SetRefineryTargetCommand {
  readonly type: 'SET_REFINERY_TARGET';
  readonly playerId: PlayerSlotId;
  readonly structureId: string;
  readonly targetResource: ResourceTargetFocus;
}

export interface CancelQueuedShipCommand {
  readonly type: 'CANCEL_QUEUED_SHIP';
  readonly playerId: PlayerSlotId;
  readonly structureId: string;
  readonly queueItemId: string;
}

export interface CreateFleetCommand {
  readonly type: 'CREATE_FLEET';
  readonly playerId: PlayerSlotId;
  readonly name?: string;
  readonly rallySystemId: string;
  readonly rallyPosition: Vector2D;
  readonly stance?: FleetStance;
  readonly autoResupply?: boolean;
}

export interface UpdateFleetTemplateCommand {
  readonly type: 'UPDATE_FLEET_TEMPLATE';
  readonly playerId: PlayerSlotId;
  readonly fleetId: string;
  readonly desiredCounts: Partial<Record<FleetHullClassId, number>>;
}

export interface SetFleetStanceCommand {
  readonly type: 'SET_FLEET_STANCE';
  readonly playerId: PlayerSlotId;
  readonly fleetId: string;
  readonly stance: FleetStance;
}

export interface SetFleetResupplyCommand {
  readonly type: 'SET_FLEET_RESUPPLY';
  readonly playerId: PlayerSlotId;
  readonly fleetId: string;
  readonly autoResupply: boolean;
}

export interface OrderFleetMoveCommand {
  readonly type: 'ORDER_FLEET_MOVE';
  readonly playerId: PlayerSlotId;
  readonly fleetId: string;
  readonly targetSystemId: string;
  readonly targetPosition: Vector2D;
}

export interface OrderFleetAttackCommand {
  readonly type: 'ORDER_FLEET_ATTACK';
  readonly playerId: PlayerSlotId;
  readonly fleetId: string;
  readonly targetSystemId: string;
  readonly targetPosition: Vector2D;
  readonly targetEntityId?: string;
}

export interface OrderFleetPatrolCommand {
  readonly type: 'ORDER_FLEET_PATROL';
  readonly playerId: PlayerSlotId;
  readonly fleetId: string;
  readonly waypoints: readonly {
    readonly systemId: string;
    readonly position: Vector2D;
  }[];
}

export interface SplitFleetCommand {
  readonly type: 'SPLIT_FLEET';
  readonly playerId: PlayerSlotId;
  readonly sourceFleetId: string;
  readonly newFleetName?: string;
}

export interface MergeFleetsCommand {
  readonly type: 'MERGE_FLEETS';
  readonly playerId: PlayerSlotId;
  readonly sourceFleetId: string;
  readonly targetFleetId: string;
}

export interface DisbandFleetCommand {
  readonly type: 'DISBAND_FLEET';
  readonly playerId: PlayerSlotId;
  readonly fleetId: string;
}

export interface OrderFleetFleeCommand {
  readonly type: 'ORDER_FLEET_FLEE';
  readonly playerId: PlayerSlotId;
  readonly fleetId: string;
}

export interface SetDockyardFleetBuildingCommand {
  readonly type: 'SET_DOCKYARD_FLEET_BUILDING';
  readonly playerId: PlayerSlotId;
  readonly dockyardId: string;
  readonly enabled: boolean;
}

export type GameCommand =
  | BuildOrbitalStructureCommand
  | BuildDeepSpaceStructureCommand
  | QueueShipCommand
  | SetRallyPointCommand
  | SetPatrolRouteCommand
  | SetRefineryTargetCommand
  | CancelQueuedShipCommand
  | CreateFleetCommand
  | UpdateFleetTemplateCommand
  | SetFleetStanceCommand
  | SetFleetResupplyCommand
  | OrderFleetMoveCommand
  | OrderFleetAttackCommand
  | OrderFleetPatrolCommand
  | OrderFleetFleeCommand
  | SplitFleetCommand
  | MergeFleetsCommand
  | DisbandFleetCommand
  | SetDockyardFleetBuildingCommand;
