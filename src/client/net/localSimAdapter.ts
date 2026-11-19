import { StandardAIBot, type AIBotController } from '../../shared/ai/aiController.ts';
import type { MatchPresetId } from '../../shared/config/index.ts';
import type { GameCommand, PlayerSlotId } from '../../shared/protocol/commands.ts';
import {
  type CommandResult,
  GameSimulation,
} from '../../shared/sim/gameSimulation.ts';

/**
 * Purely local in-browser simulation adapter for Singleplayer vs. AI matches.
 * Zero network or external server dependencies.
 */
export class LocalSimAdapter {
  public readonly localPlayerId: PlayerSlotId = 'player_1';
  public readonly simulation: GameSimulation;
  public simSpeedMultiplier = 1;

  private readonly aiBots: readonly AIBotController[];

  constructor(presetId: MatchPresetId = 'standard_tactical') {
    this.simulation = new GameSimulation(presetId);
    this.aiBots = [
      new StandardAIBot('player_2'),
      new StandardAIBot('player_3'),
      new StandardAIBot('player_4'),
    ];
  }

  public submitPlayerCommand(command: GameCommand): CommandResult {
    return this.simulation.submitCommand(command);
  }

  public update(deltaSeconds: number): void {
    const scaledDelta = deltaSeconds * this.simSpeedMultiplier;
    this.simulation.stepTick(scaledDelta);

    for (const bot of this.aiBots) {
      const commands = bot.decideNextCommands(
        this.simulation.galaxy,
        this.simulation.currentTick,
        this.simulation,
      );
      for (const cmd of commands) {
        this.simulation.submitCommand(cmd);
      }
    }
  }
}
