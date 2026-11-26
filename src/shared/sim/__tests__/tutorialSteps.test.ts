import { describe, expect, it } from 'vitest';
import { GameSimulation } from '../gameSimulation.ts';
import {
  TUTORIAL_STEPS,
  createInitialTutorialState,
  dismissTutorial,
  evaluateTutorialProgress,
  getCurrentTutorialStep,
  skipCurrentTutorialStep,
  type TutorialUiContext,
} from '../tutorialSteps.ts';

function advanceSeconds(sim: GameSimulation, totalSeconds: number, dt = 0.5): void {
  const ticks = Math.ceil(totalSeconds / dt);
  for (let i = 0; i < ticks; i += 1) {
    sim.stepTick(dt);
  }
}

function makeUiContext(overrides: Partial<TutorialUiContext> = {}): TutorialUiContext {
  return {
    homePlanetId: 'system_starter_1_homeworld',
    homeSystemId: 'system_starter_1',
    selectedPlanetId: 'system_starter_1_homeworld',
    selectedSlotOccupied: false,
    firstEmptySlotIndex: 2,
    isOrbitalRingCollapsed: false,
    isFleetPanelOpen: true,
    ...overrides,
  };
}

describe('Tutorial Step State Machine', () => {
  it('initializes active only for tutorial preset and inactive for other presets', () => {
    const tutorialState = createInitialTutorialState('tutorial');
    expect(tutorialState.status).toBe('active');
    expect(tutorialState.currentStepIndex).toBe(0);
    expect(getCurrentTutorialStep(tutorialState)?.id).toBe('build_refinery');

    for (const preset of [
      'blitz_skirmish',
      'standard_tactical',
      'grand_conquest',
    ] as const) {
      const otherState = createInitialTutorialState(preset);
      expect(otherState.status).toBe('inactive');
      expect(getCurrentTutorialStep(otherState)).toBeNull();
    }
  });

  it('advances step-by-step through a real tutorial GameSimulation to victory', () => {
    const sim = new GameSimulation('tutorial');
    expect(sim.getSlotConfig('player_1')).toEqual({ kind: 'human' });
    expect(sim.getSlotConfig('player_2')).toEqual({
      kind: 'ai',
      difficulty: 'cadet',
    });
    expect(sim.isPlayerSlotActive('player_3')).toBe(false);
    expect(sim.isPlayerSlotActive('player_4')).toBe(false);

    let state = createInitialTutorialState('tutorial');
    expect(getCurrentTutorialStep(state)?.id).toBe('build_refinery');

    expect(
      sim.submitCommand({
        type: 'BUILD_ORBITAL_STRUCTURE',
        playerId: 'player_1',
        planetId: 'system_starter_1_homeworld',
        slotIndex: 2,
        structureId: 'refinery',
      }).ok,
    ).toBe(true);
    advanceSeconds(sim, 20);
    state = evaluateTutorialProgress(state, sim, 'player_1');
    expect(getCurrentTutorialStep(state)?.id).toBe('queue_harvester');

    const p1Home = sim.getPlanetState('system_starter_1_homeworld');
    const p1Refinery = p1Home.structures.find((s) => s.structureId === 'refinery')!;
    expect(
      sim.submitCommand({
        type: 'QUEUE_SHIP',
        playerId: 'player_1',
        dockyardOrRefineryId: p1Refinery.id,
        shipClassId: 'harvester',
        autoRepeat: false,
      }).ok,
    ).toBe(true);
    state = evaluateTutorialProgress(state, sim, 'player_1');
    expect(getCurrentTutorialStep(state)?.id).toBe('build_dockyard');

    expect(
      sim.submitCommand({
        type: 'BUILD_ORBITAL_STRUCTURE',
        playerId: 'player_1',
        planetId: 'system_starter_1_homeworld',
        slotIndex: 3,
        structureId: 'orbital_dockyard',
      }).ok,
    ).toBe(true);
    advanceSeconds(sim, 30);
    state = evaluateTutorialProgress(state, sim, 'player_1');
    expect(getCurrentTutorialStep(state)?.id).toBe('create_fleet');

    expect(
      sim.submitCommand({
        type: 'CREATE_FLEET',
        playerId: 'player_1',
        rallySystemId: 'system_starter_1',
        rallyPosition: { x: 250, z: 0 },
      }).ok,
    ).toBe(true);
    const fleet = sim.getFleetsForPlayer('player_1')[0]!;
    expect(
      sim.submitCommand({
        type: 'UPDATE_FLEET_TEMPLATE',
        playerId: 'player_1',
        fleetId: fleet.id,
        desiredCounts: {
          destroyer: 3,
          cruiser: 0,
          carrier: 0,
          dreadnought: 0,
        },
      }).ok,
    ).toBe(true);
    state = evaluateTutorialProgress(state, sim, 'player_1');
    expect(getCurrentTutorialStep(state)?.id).toBe('tech_and_cruisers');

    const playerEconomy = sim.getPlayerState('player_1');
    playerEconomy.ore = 2500;
    playerEconomy.crystal = 1500;
    expect(
      sim.submitCommand({
        type: 'BUILD_ORBITAL_STRUCTURE',
        playerId: 'player_1',
        planetId: 'system_starter_1_homeworld',
        slotIndex: 5,
        structureId: 'tech_module',
      }).ok,
    ).toBe(true);
    advanceSeconds(sim, 25);
    expect(
      sim.submitCommand({
        type: 'UPDATE_FLEET_TEMPLATE',
        playerId: 'player_1',
        fleetId: fleet.id,
        desiredCounts: {
          destroyer: 3,
          cruiser: 2,
          carrier: 0,
          dreadnought: 0,
        },
      }).ok,
    ).toBe(true);
    state = evaluateTutorialProgress(state, sim, 'player_1');
    expect(getCurrentTutorialStep(state)?.id).toBe('assemble_fleet');

    advanceSeconds(sim, 90);
    state = evaluateTutorialProgress(state, sim, 'player_1');
    expect(getCurrentTutorialStep(state)?.id).toBe('invade_enemy_system');

    expect(
      sim.submitCommand({
        type: 'ORDER_FLEET_MOVE',
        playerId: 'player_1',
        fleetId: fleet.id,
        targetSystemId: 'system_central_hub',
        targetPosition: { x: 0, z: 0 },
      }).ok,
    ).toBe(true);
    state = evaluateTutorialProgress(state, sim, 'player_1');
    expect(getCurrentTutorialStep(state)?.id).toBe('defeat_cadet_ai');

    const p2Home = sim.getPlanetState('system_starter_2_homeworld');
    const p2Cnc = p2Home.structures.find(
      (s) => s.structureId === 'command_and_control',
    )!;
    expect(sim.destroyOrbitalStructure(p2Cnc.id)).toBe(true);
    state = evaluateTutorialProgress(state, sim, 'player_1');
    expect(state.status).toBe('completed');
    expect(state.completedStepIds).toEqual(TUTORIAL_STEPS.map((s) => s.id));
    expect(getCurrentTutorialStep(state)).toBeNull();
  });

  it('retroactively advances past already-completed steps in a single evaluation', () => {
    const sim = new GameSimulation('tutorial');
    let state = createInitialTutorialState('tutorial');

    expect(
      sim.submitCommand({
        type: 'BUILD_ORBITAL_STRUCTURE',
        playerId: 'player_1',
        planetId: 'system_starter_1_homeworld',
        slotIndex: 3,
        structureId: 'orbital_dockyard',
      }).ok,
    ).toBe(true);
    advanceSeconds(sim, 30);

    state = evaluateTutorialProgress(state, sim, 'player_1');
    expect(getCurrentTutorialStep(state)?.id).toBe('build_refinery');

    expect(
      sim.submitCommand({
        type: 'BUILD_ORBITAL_STRUCTURE',
        playerId: 'player_1',
        planetId: 'system_starter_1_homeworld',
        slotIndex: 2,
        structureId: 'refinery',
      }).ok,
    ).toBe(true);
    advanceSeconds(sim, 20);

    const p1Home = sim.getPlanetState('system_starter_1_homeworld');
    const p1Cnc = p1Home.structures.find(
      (s) => s.structureId === 'command_and_control',
    )!;
    expect(
      sim.submitCommand({
        type: 'QUEUE_SHIP',
        playerId: 'player_1',
        dockyardOrRefineryId: p1Cnc.id,
        shipClassId: 'harvester',
        autoRepeat: false,
      }).ok,
    ).toBe(true);

    state = evaluateTutorialProgress(state, sim, 'player_1');
    expect(getCurrentTutorialStep(state)?.id).toBe('create_fleet');
    expect(state.completedStepIds).toEqual([
      'build_refinery',
      'queue_harvester',
      'build_dockyard',
    ]);
  });

  it('supports skipCurrentTutorialStep and dismissTutorial', () => {
    let state = createInitialTutorialState('tutorial');
    state = skipCurrentTutorialStep(state);
    expect(getCurrentTutorialStep(state)?.id).toBe('queue_harvester');
    expect(state.completedStepIds).toEqual(['build_refinery']);

    const dismissed = dismissTutorial(state);
    expect(dismissed.status).toBe('dismissed');
    expect(getCurrentTutorialStep(dismissed)).toBeNull();

    let endState = createInitialTutorialState('tutorial');
    for (let i = 0; i < TUTORIAL_STEPS.length; i += 1) {
      endState = skipCurrentTutorialStep(endState);
    }
    expect(endState.status).toBe('completed');
    expect(getCurrentTutorialStep(endState)).toBeNull();
  });

  it('resolves contextual UI highlights for collapsed orbital ring, occupied slot, and wrong planet', () => {
    const sim = new GameSimulation('tutorial');
    const step1 = TUTORIAL_STEPS[0]!;

    expect(
      step1.resolveHighlight(
        sim,
        'player_1',
        makeUiContext({ selectedPlanetId: 'system_starter_1_planet_2' }),
      ),
    ).toEqual({ kind: 'planet', planetId: 'system_starter_1_homeworld' });

    expect(
      step1.resolveHighlight(
        sim,
        'player_1',
        makeUiContext({ isOrbitalRingCollapsed: true }),
      ),
    ).toEqual({ kind: 'section', sectionId: 'orbital_ring' });

    expect(
      step1.resolveHighlight(
        sim,
        'player_1',
        makeUiContext({ selectedSlotOccupied: true, firstEmptySlotIndex: 4 }),
      ),
    ).toEqual({ kind: 'slot', slotIndex: 4 });

    expect(step1.resolveHighlight(sim, 'player_1', makeUiContext())).toEqual({
      kind: 'build-struct',
      structureId: 'refinery',
    });
  });
});
