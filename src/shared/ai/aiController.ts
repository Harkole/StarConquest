import type { GameCommand, PlayerSlotId } from '../protocol/commands.ts';
import type { GalaxyTopology } from '../sim/galaxy.ts';

export interface AIBotController {
  readonly playerId: PlayerSlotId;
  decideNextCommands(galaxy: GalaxyTopology, currentTick: number): readonly GameCommand[];
}

export class StandardAIBot implements AIBotController {
  public readonly playerId: PlayerSlotId;

  constructor(playerId: PlayerSlotId) {
    this.playerId = playerId;
  }

  public decideNextCommands(_galaxy: GalaxyTopology, _currentTick: number): readonly GameCommand[] {
    return [];
  }
}
