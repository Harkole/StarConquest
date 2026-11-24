import {
  StandardAIBot,
  type AIBotController,
} from '../../shared/ai/aiController.ts';
import {
  PLAYER_SLOT_IDS,
  type MatchPresetId,
  type MatchSetupConfig,
  type MatchSetupInput,
} from '../../shared/config/index.ts';
import type {
  GameCommand,
  PlayerSlotId,
} from '../../shared/protocol/commands.ts';
import {
  type CommandResult,
  GameSimulation,
} from '../../shared/sim/gameSimulation.ts';
import type { ClientSimAdapter } from './simAdapter.ts';

function buildAIBotsForSetup(setup: MatchSetupConfig): readonly AIBotController[] {
  const bots: AIBotController[] = [];
  for (const slotId of PLAYER_SLOT_IDS) {
    const slotCfg = setup.slots[slotId];
    if (slotCfg.kind === 'ai') {
      bots.push(new StandardAIBot(slotId, slotCfg.difficulty));
    }
  }
  return bots;
}

export class LocalSimAdapter implements ClientSimAdapter {
  public readonly mode = 'local' as const;
  public localPlayerId: PlayerSlotId = 'player_1';
  public simulation: GameSimulation;
  public simSpeedMultiplier = 1;

  private aiBots: readonly AIBotController[];

  constructor(
    presetOrSetup: MatchPresetId | MatchSetupInput = 'standard_tactical',
  ) {
    this.simulation = new GameSimulation(presetOrSetup);
    const setup = this.simulation.getMatchSetup();
    this.localPlayerId = setup.localPlayerId;
    this.aiBots = buildAIBotsForSetup(setup);
  }

  public getAIBots(): readonly AIBotController[] {
    return this.aiBots;
  }

  public resetMatch(
    presetOrSetup: MatchPresetId | MatchSetupInput,
  ): MatchSetupConfig {
    this.simulation = new GameSimulation(presetOrSetup);
    const setup = this.simulation.getMatchSetup();
    this.localPlayerId = setup.localPlayerId;
    this.aiBots = buildAIBotsForSetup(setup);
    return setup;
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

