import type {
  DeepSpaceStructureId,
  OrbitalStructureId,
  ShipClassId,
} from '../config/index.ts';

export type PlayerSlotId = 'player_1' | 'player_2' | 'player_3' | 'player_4';

export type FleetStance = 'aggressive_push' | 'hold_choke_point' | 'hunt_backline';

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

export type GameCommand =
  | BuildOrbitalStructureCommand
  | BuildDeepSpaceStructureCommand
  | QueueShipCommand
  | SetRallyPointCommand
  | SetPatrolRouteCommand
  | SetRefineryTargetCommand;
