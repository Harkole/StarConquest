import { ORBITAL_STRUCTURES } from '../config/index.ts';
import type { GameCommand, PlayerSlotId } from '../protocol/commands.ts';
import type { GalaxyTopology } from '../sim/galaxy.ts';
import type { GameSimulation } from '../sim/gameSimulation.ts';

export interface AIBotController {
  readonly playerId: PlayerSlotId;
  decideNextCommands(
    galaxy: GalaxyTopology,
    currentTick: number,
    simulation?: GameSimulation,
  ): readonly GameCommand[];
}

export class StandardAIBot implements AIBotController {
  public readonly playerId: PlayerSlotId;

  constructor(playerId: PlayerSlotId) {
    this.playerId = playerId;
  }

  public decideNextCommands(
    galaxy: GalaxyTopology,
    currentTick: number,
    simulation?: GameSimulation,
  ): readonly GameCommand[] {
    if (!simulation || currentTick % 40 !== 0) {
      return [];
    }

    const playerState = simulation.getPlayerState(this.playerId);
    const starterSystem = galaxy.systems.find(
      (s) => s.starterOwnerSlot === this.playerId,
    );
    const homeworld = starterSystem?.planets[0];
    if (!homeworld) {
      return [];
    }

    const planetState = simulation.getPlanetState(homeworld.id);
    const refineryCount = planetState.structures.filter(
      (s) => s.structureId === 'refinery',
    ).length;

    // Build an initial Orbital Refinery on slot 2 if affordable
    if (
      refineryCount === 0 &&
      playerState.ore >= ORBITAL_STRUCTURES.refinery.cost.ore &&
      playerState.crystal >= ORBITAL_STRUCTURES.refinery.cost.crystal
    ) {
      return [
        {
          type: 'BUILD_ORBITAL_STRUCTURE',
          playerId: this.playerId,
          planetId: homeworld.id,
          slotIndex: 2,
          structureId: 'refinery',
        },
      ];
    }

    return [];
  }
}
