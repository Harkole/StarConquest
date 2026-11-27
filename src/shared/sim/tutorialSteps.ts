import type { MatchPresetId, OrbitalStructureId } from '../config/index.ts';
import type { FleetHullClassId, PlayerSlotId } from '../protocol/commands.ts';
import type { SimulationView } from './simulationView.ts';

export type TutorialStepId =
  | 'build_refinery'
  | 'queue_harvester'
  | 'build_dockyard'
  | 'create_fleet'
  | 'tech_and_cruisers'
  | 'assemble_fleet'
  | 'invade_enemy_system'
  | 'defeat_cadet_ai';

export type TutorialLifecycleStatus =
  | 'inactive'
  | 'active'
  | 'completed'
  | 'dismissed';

export type TutorialHighlightTarget =
  | { readonly kind: 'planet'; readonly planetId: string }
  | { readonly kind: 'slot'; readonly slotIndex: number }
  | { readonly kind: 'section'; readonly sectionId: 'orbital_ring' }
  | { readonly kind: 'build-struct'; readonly structureId: OrbitalStructureId }
  | { readonly kind: 'action'; readonly action: 'create-fleet' | 'spawn-harvester' }
  | { readonly kind: 'fleet-inc'; readonly hull: FleetHullClassId }
  | { readonly kind: 'speed'; readonly speed: 4 }
  | { readonly kind: 'system-nav'; readonly systemId: string }
  | { readonly kind: 'none' };

export interface TutorialUiContext {
  readonly homePlanetId: string;
  readonly homeSystemId: string;
  readonly selectedPlanetId: string;
  readonly selectedSlotOccupied: boolean;
  readonly selectedSlotCanQueueHarvester?: boolean;
  readonly firstEmptySlotIndex: number | null;
  readonly isOrbitalRingCollapsed: boolean;
}

export interface TutorialStepDefinition {
  readonly id: TutorialStepId;
  readonly order: number;
  readonly title: string;
  readonly instruction: string;
  readonly hint: string;
  readonly isComplete: (sim: SimulationView, playerId: PlayerSlotId) => boolean;
  readonly resolveHighlight: (
    sim: SimulationView,
    playerId: PlayerSlotId,
    ui: TutorialUiContext,
  ) => TutorialHighlightTarget;
}

export interface TutorialProgressState {
  readonly status: TutorialLifecycleStatus;
  readonly currentStepIndex: number;
  readonly completedStepIds: readonly TutorialStepId[];
}

function hasCompletedStructure(
  sim: SimulationView,
  playerId: PlayerSlotId,
  structureId: OrbitalStructureId,
): boolean {
  for (const system of sim.galaxy.systems) {
    for (const planet of sim.getPlanetsInSystem(system.id)) {
      if (
        planet.structures.some(
          (s) =>
            s.ownerId === playerId &&
            s.structureId === structureId &&
            s.isComplete,
        )
      ) {
        return true;
      }
    }
  }
  return false;
}

function findPlayerHomeSystemId(
  sim: SimulationView,
  playerId: PlayerSlotId,
): string {
  for (const system of sim.galaxy.systems) {
    for (const planet of sim.getPlanetsInSystem(system.id)) {
      if (
        planet.structures.some(
          (s) =>
            s.ownerId === playerId &&
            s.structureId === 'command_and_control' &&
            s.isComplete,
        )
      ) {
        return system.id;
      }
    }
  }
  return 'system_starter_1';
}

function resolveOrbitalBuildHighlight(
  ui: TutorialUiContext,
  structureId: OrbitalStructureId,
): TutorialHighlightTarget {
  if (ui.selectedPlanetId !== ui.homePlanetId) {
    return { kind: 'planet', planetId: ui.homePlanetId };
  }
  if (ui.isOrbitalRingCollapsed) {
    return { kind: 'section', sectionId: 'orbital_ring' };
  }
  if (ui.selectedSlotOccupied && ui.firstEmptySlotIndex !== null) {
    return { kind: 'slot', slotIndex: ui.firstEmptySlotIndex };
  }
  return { kind: 'build-struct', structureId };
}

function resolveFleetTemplateHighlight(
  sim: SimulationView,
  playerId: PlayerSlotId,
  hull: FleetHullClassId,
): TutorialHighlightTarget {
  if (sim.getFleetsForPlayer(playerId).length === 0) {
    return { kind: 'action', action: 'create-fleet' };
  }
  return { kind: 'fleet-inc', hull };
}

function hasExtraHarvesterOrQueued(
  sim: SimulationView,
  playerId: PlayerSlotId,
): boolean {
  let activeHarvesters = 0;
  for (const system of sim.galaxy.systems) {
    const view = sim.getPlayerSystemView(playerId, system.id);
    activeHarvesters += view.harvesters.filter(
      (h) => h.ownerId === playerId && h.hull > 0,
    ).length;
    if (activeHarvesters >= 3) {
      return true;
    }
    for (const planet of sim.getPlanetsInSystem(system.id)) {
      for (const s of planet.structures) {
        if (
          s.ownerId === playerId &&
          s.productionQueue.some((q) => q.shipClassId === 'harvester')
        ) {
          return true;
        }
      }
    }
  }
  return false;
}

export const TUTORIAL_STEPS: readonly TutorialStepDefinition[] = [
  {
    id: 'build_refinery',
    order: 1,
    title: 'Build an Orbital Refinery',
    instruction:
      'Select an empty orbital slot around your Homeworld and construct a Refinery to boost Ore and Crystal income.',
    hint: 'Each Refinery spawns 1 free Harvester and adds unloading docks. Harvesters are the lifeblood of your economy.',
    isComplete: (sim, playerId) =>
      hasCompletedStructure(sim, playerId, 'refinery'),
    resolveHighlight: (_sim, _playerId, ui) =>
      resolveOrbitalBuildHighlight(ui, 'refinery'),
  },
  {
    id: 'queue_harvester',
    order: 2,
    title: 'Scale Harvesters & Economy',
    instruction:
      'Select your Command & Control or Refinery and queue an extra Harvester so your Ore and Crystal income scales rapidly.',
    hint: 'Starter systems are Ore-heavy and Crystal-scarce (6:1). Use Mining Focus if needed, and expand into the enriched Central Nexus before local Crystals run dry.',
    isComplete: (sim, playerId) =>
      hasExtraHarvesterOrQueued(sim, playerId),
    resolveHighlight: (_sim, _playerId, ui) => {
      if (ui.selectedPlanetId !== ui.homePlanetId) {
        return { kind: 'planet', planetId: ui.homePlanetId };
      }
      if (ui.isOrbitalRingCollapsed) {
        return { kind: 'section', sectionId: 'orbital_ring' };
      }
      if (!ui.selectedSlotCanQueueHarvester) {
        return { kind: 'slot', slotIndex: 0 };
      }
      return { kind: 'action', action: 'spawn-harvester' };
    },
  },
  {
    id: 'build_dockyard',
    order: 3,
    title: 'Build an Orbital Dockyard',
    instruction:
      'Select an empty orbital slot on your Homeworld and construct an Orbital Dockyard (2 slots) to produce warships.',
    hint: 'Dockyards automatically build ships for your Fleet Templates.',
    isComplete: (sim, playerId) =>
      hasCompletedStructure(sim, playerId, 'orbital_dockyard'),
    resolveHighlight: (_sim, _playerId, ui) =>
      resolveOrbitalBuildHighlight(ui, 'orbital_dockyard'),
  },
  {
    id: 'create_fleet',
    order: 4,
    title: 'Create a Fleet & Queue Destroyers',
    instruction:
      'Open Fleet Command, create a new fleet, and set its Destroyer template count to at least 3.',
    hint: 'Destroyers are fast, hull-only raiders that cost mostly Ore and form your initial vanguard.',
    isComplete: (sim, playerId) =>
      sim.getFleetsForPlayer(playerId).some((f) => f.desiredCounts.destroyer >= 3),
    resolveHighlight: (sim, playerId) =>
      resolveFleetTemplateHighlight(sim, playerId, 'destroyer'),
  },
  {
    id: 'tech_and_cruisers',
    order: 5,
    title: 'Unlock & Queue Cruisers',
    instruction:
      'Build a Tech Module in orbit around your Homeworld, then add at least 2 Cruisers to your fleet template.',
    hint: 'Cruisers require Crystals and carry Shields and Point Defence that shred enemy Fighters and Destroyers.',
    isComplete: (sim, playerId) =>
      sim.getPlayerTechModuleCount(playerId) >= 1 &&
      sim.getFleetsForPlayer(playerId).some((f) => f.desiredCounts.cruiser >= 2),
    resolveHighlight: (sim, playerId, ui) => {
      if (sim.getPlayerTechModuleCount(playerId) < 1) {
        return resolveOrbitalBuildHighlight(ui, 'tech_module');
      }
      return resolveFleetTemplateHighlight(sim, playerId, 'cruiser');
    },
  },
  {
    id: 'assemble_fleet',
    order: 6,
    title: 'Assemble Your Battle Fleet',
    instruction:
      'Wait for your Dockyard to launch at least 4 combat ships into your fleet.',
    hint: 'You can use 4x simulation speed to accelerate ship construction.',
    isComplete: (sim, playerId) => {
      let totalShips = 0;
      for (const fleet of sim.getFleetsForPlayer(playerId)) {
        totalShips += sim.getShipsInFleet(fleet.id).length;
      }
      return totalShips >= 4;
    },
    resolveHighlight: () => ({ kind: 'speed', speed: 4 }),
  },
  {
    id: 'invade_enemy_system',
    order: 7,
    title: 'Cross the Wormhole',
    instruction:
      'Order your fleet through the wormhole into the Central Nexus or the enemy Cadet AI system.',
    hint: 'The Central Nexus holds enriched 1.6x Crystal and Ore belts. Select your fleet and issue a Move or Attack order in another star system.',
    isComplete: (sim, playerId) => {
      const homeSystemId = findPlayerHomeSystemId(sim, playerId);
      const hasOutboundOrder = sim
        .getFleetsForPlayer(playerId)
        .some((f) => f.orderSystemId !== homeSystemId);
      if (hasOutboundOrder) {
        return true;
      }
      const inCentral = sim
        .getPlayerSystemView(playerId, 'system_central_hub')
        .combatShips.some((s) => s.ownerId === playerId);
      if (inCentral) {
        return true;
      }
      return sim
        .getPlayerSystemView(playerId, 'system_starter_2')
        .combatShips.some((s) => s.ownerId === playerId);
    },
    resolveHighlight: () => ({
      kind: 'system-nav',
      systemId: 'system_central_hub',
    }),
  },
  {
    id: 'defeat_cadet_ai',
    order: 8,
    title: 'Destroy the Cadet AI Base',
    instruction:
      "Locate and destroy the Cadet AI's Command & Control station in Sector 2 to win the match.",
    hint: 'Losing Command & Control immediately eliminates a faction.',
    isComplete: (sim) => sim.getMatchOutcome().status === 'victory',
    resolveHighlight: () => ({ kind: 'none' }),
  },
] as const;

export function createInitialTutorialState(
  presetId: MatchPresetId,
): TutorialProgressState {
  return {
    status: presetId === 'tutorial' ? 'active' : 'inactive',
    currentStepIndex: 0,
    completedStepIds: [],
  };
}

export function getCurrentTutorialStep(
  state: TutorialProgressState,
): TutorialStepDefinition | null {
  if (state.status !== 'active') {
    return null;
  }
  return TUTORIAL_STEPS[state.currentStepIndex] ?? null;
}

export function evaluateTutorialProgress(
  state: TutorialProgressState,
  sim: SimulationView,
  playerId: PlayerSlotId,
): TutorialProgressState {
  if (state.status !== 'active') {
    return state;
  }

  let nextIndex = state.currentStepIndex;
  const completed = [...state.completedStepIds];

  while (nextIndex < TUTORIAL_STEPS.length) {
    const step = TUTORIAL_STEPS[nextIndex];
    if (!step || !step.isComplete(sim, playerId)) {
      break;
    }
    if (!completed.includes(step.id)) {
      completed.push(step.id);
    }
    nextIndex += 1;
  }

  if (nextIndex === state.currentStepIndex) {
    return state;
  }

  if (nextIndex >= TUTORIAL_STEPS.length) {
    return {
      status: 'completed',
      currentStepIndex: TUTORIAL_STEPS.length,
      completedStepIds: completed,
    };
  }

  return {
    status: 'active',
    currentStepIndex: nextIndex,
    completedStepIds: completed,
  };
}

export function skipCurrentTutorialStep(
  state: TutorialProgressState,
): TutorialProgressState {
  if (state.status !== 'active') {
    return state;
  }

  const currentStep = TUTORIAL_STEPS[state.currentStepIndex];
  const completed =
    currentStep && !state.completedStepIds.includes(currentStep.id)
      ? [...state.completedStepIds, currentStep.id]
      : state.completedStepIds;
  const nextIndex = state.currentStepIndex + 1;

  if (nextIndex >= TUTORIAL_STEPS.length) {
    return {
      status: 'completed',
      currentStepIndex: TUTORIAL_STEPS.length,
      completedStepIds: completed,
    };
  }

  return {
    status: 'active',
    currentStepIndex: nextIndex,
    completedStepIds: completed,
  };
}

export function dismissTutorial(
  state: TutorialProgressState,
): TutorialProgressState {
  if (state.status === 'dismissed' || state.status === 'inactive') {
    return state;
  }
  return {
    ...state,
    status: 'dismissed',
  };
}
