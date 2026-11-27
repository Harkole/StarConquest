import {
  CNC_EMERGENCY_HARVESTER_REBUILD_SECONDS,
  DEEP_SPACE_STRUCTURES,
  MATCH_PRESETS,
  ORBITAL_CANCEL_REFUND_RATE,
  ORBITAL_DECOMMISSION_REFUND_RATE,
  ORBITAL_STRUCTURES,
  SHIP_CLASSES,
  type CombatShipClassId,
  type DeepSpaceStructureId,
  type OrbitalStructureId,
} from '../../shared/config/index.ts';
import type {
  FleetHullClassId,
  FleetStance,
  PlayerSlotId,
  ResourceTargetFocus,
} from '../../shared/protocol/commands.ts';
import type { GalaxyTopology } from '../../shared/sim/galaxy.ts';
import {
  BATTLE_SIMULATOR_SYSTEM_ID,
  type GameSimulation,
  type HarvesterActivityState,
  MAX_SHIP_PRODUCTION_QUEUE_SIZE,
  SMALLEST_FIRST_FLEET_HULLS,
} from '../../shared/sim/gameSimulation.ts';
import type { SimulationView } from '../../shared/sim/simulationView.ts';
import type { ProjectedOrbitalStructure } from '../../shared/sim/playerIntel.ts';
import type { AmbientMusicPlayer } from '../audio/ambientMusicPlayer.ts';
import { FACTION_PALETTES } from '../renderer/factionColors.ts';
import type { SystemSceneManager } from '../renderer/systemSceneManager.ts';
import {
  buildLeftOutlinerModel,
  renderLeftOutlinerHtml,
} from './leftOutlinerView.ts';
import { LobbyController } from './lobbyController.ts';
import { buildTopBarModel, mountTopBar } from './topBarView.ts';
import { TutorialController } from './tutorialController.ts';
import { buildOrbitalSlotPills } from './orbitalSlotDisplay.ts';
import type { TutorialUiContext } from '../../shared/sim/tutorialSteps.ts';

const BUILDABLE_STRUCTURE_IDS: readonly OrbitalStructureId[] = [
  'planetary_outpost',
  'refinery',
  'orbital_dockyard',
  'tech_module',
  'heavy_defense_platform',
];

const BUILDABLE_DEEP_SPACE_IDS: readonly DeepSpaceStructureId[] = [
  'logistics_hub',
  'point_defence_tower',
  'hull_breaker_tower',
];

const FLEET_STANCE_OPTIONS: readonly { readonly id: FleetStance; readonly label: string }[] = [
  { id: 'aggressive', label: 'Aggressive' },
  { id: 'hold_the_line', label: 'Hold the Line' },
  { id: 'passive', label: 'Passive' },
];

export type HudSectionId = 'battle_sim' | 'deep_space' | 'orbital_ring';

export type HudCollapsedState = Record<HudSectionId, boolean>;

const HUD_SECTION_IDS: readonly HudSectionId[] = [
  'battle_sim',
  'deep_space',
  'orbital_ring',
];

export function createDefaultHudCollapsedState(): HudCollapsedState {
  return {
    battle_sim: true,
    deep_space: false,
    orbital_ring: false,
  };
}

export function toggleHudSection(
  state: HudCollapsedState,
  sectionId: HudSectionId,
): HudCollapsedState {
  return {
    ...state,
    [sectionId]: !state[sectionId],
  };
}

export function isHudSectionId(value: string | undefined): value is HudSectionId {
  return value !== undefined && (HUD_SECTION_IDS as readonly string[]).includes(value);
}

export interface MainPanelSignatureParams {
  readonly playerId?: PlayerSlotId;
  readonly activeSystemId: string;
  readonly selectedPlanetId: string;
  readonly selectedSlotIndex: number;
  readonly selectedHarvesterId: string | null;
  readonly pendingDeepSpace: DeepSpaceStructureId | null;
  readonly statusBannerMessage: string;
  readonly wormholeStates: readonly { readonly id: string; readonly isOpen: boolean }[];
}

function formatIntelAge(ageSeconds: number): string {
  const s = Math.max(0, Math.round(ageSeconds));
  if (s < 60) {
    return `${s}s ago`;
  }
  const mins = Math.floor(s / 60);
  const rem = s % 60;
  return `${mins}m ${rem}s ago`;
}

function getProjectedOrbitalData(item: ProjectedOrbitalStructure) {
  return item.kind === 'live' ? item.structure : item;
}

/**
 * Computes a deterministic structural snapshot signature for the main tactical HUD panel.
 * Only structural transitions (selection, ownership, visibility, build completion, queue membership,
 * assigned Harvester membership, deep-space completion, wormhole state) change this signature.
 * Continuous progress bars, percentages, timers, dock counts, and reserves are patched in-place
 * via `textContent` so DOM buttons are never destroyed or recreated while the player clicks/hovers.
 */
function hasBattleSimulator(sim: SimulationView): sim is GameSimulation {
  return (
    'launchFleetBattleSimulator' in sim &&
    typeof (sim as GameSimulation).launchFleetBattleSimulator === 'function'
  );
}

function getVisibleHarvesters(
  sim: SimulationView,
  viewerId: PlayerSlotId,
) {
  return sim.galaxy.systems.flatMap(
    (s) => sim.getPlayerSystemView(viewerId, s.id).harvesters,
  );
}

function getVisibleCombatShips(
  sim: SimulationView,
  viewerId: PlayerSlotId,
) {
  return sim.galaxy.systems.flatMap(
    (s) => sim.getPlayerSystemView(viewerId, s.id).combatShips,
  );
}

export function computeMainPanelSignature(
  sim: SimulationView,
  params: MainPanelSignatureParams,
): string {
  const viewerId = params.playerId ?? 'player_1';
  const systemView = sim.getPlayerSystemView(viewerId, params.activeSystemId);
  const planetSummarySig = systemView.planets
    .map((p) => {
      const usedSlots = p.structures.reduce(
        (acc, item) => acc + getProjectedOrbitalData(item).occupiedSlots.length,
        0,
      );
      return `${p.planet.id}:${p.visibility}:${p.ownerId ?? 'none'}:${usedSlots}`;
    })
    .join(',');

  const selectedPlanetView = systemView.planets.find(
    (p) => p.planet.id === params.selectedPlanetId,
  );
  const selectedStructures = selectedPlanetView?.structures ?? [];
  const structSig = selectedStructures
    .map((item) => {
      if (item.kind === 'ghost') {
        return `ghost:${item.id}:${item.isComplete ? 1 : 0}:${item.ownerId}:${item.occupiedSlots.join(',')}`;
      }
      const s = item.structure;
      const queueIds = s.productionQueue.map((q) => q.id).join(',');
      const rallySig = s.rallyPoint
        ? `${s.rallyPoint.systemId}:${Math.round(s.rallyPoint.position.x)},${Math.round(s.rallyPoint.position.z)}`
        : 'none';
      const patrolSig = `${s.patrolWaypoints?.length ?? 0}`;
      const fleetBuildSig = s.fleetProductionEnabled === false ? 0 : 1;
      return `live:${s.id}:${s.isComplete ? 1 : 0}:${s.targetResource}:${s.fleetStance ?? 'default'}:${rallySig}:${patrolSig}:${fleetBuildSig}:${queueIds}`;
    })
    .join(';');

  const selectedItem = selectedStructures.find((item) =>
    getProjectedOrbitalData(item).occupiedSlots.includes(params.selectedSlotIndex),
  );
  const selectedStruct = selectedItem?.kind === 'live' ? selectedItem.structure : null;
  const assignedHarvesterSig = selectedStruct
    ? getVisibleHarvesters(sim, viewerId)
        .filter((h) => h.homeStructureId === selectedStruct.id)
        .map((h) => h.id)
        .join(',')
    : 'none';
  const assignedCombatShipSig = selectedStruct
    ? getVisibleCombatShips(sim, viewerId)
        .filter((c) => c.homeDockyardId === selectedStruct.id)
        .map((c) => c.id)
        .join(',')
    : 'none';

  const deepSpaceSig = systemView.deepSpaceStructures
    .map((item) => {
      const ds = item.kind === 'live' ? item.structure : item;
      return `${item.kind}:${ds.id}:${ds.isComplete ? 1 : 0}`;
    })
    .join(';');

  const resourceSummarySig = systemView.resourceSummary ? 'known' : 'unknown';

  const wormholeSig = params.wormholeStates
    .map((wh) => `${wh.id}:${wh.isOpen ? 1 : 0}`)
    .join(',');

  const fleetSig = sim
    .getFleetsForPlayer(viewerId)
    .map((f) => {
      const counts = SMALLEST_FIRST_FLEET_HULLS.map((h) => f.desiredCounts[h]).join('/');
      const live = sim.getShipsInFleet(f.id).length;
      return `${f.id}:${f.stance}:${f.autoResupply ? 1 : 0}:${f.orderType}:${f.orderSystemId}:${Math.round(f.orderPosition.x)},${Math.round(f.orderPosition.z)}:${live}:${counts}`;
    })
    .join(';');

  const simStats = hasBattleSimulator(sim) ? sim.getBattleSimulatorStats() : null;
  const battleSimSig = simStats
    ? `${simStats.status}:${simStats.friendly.survivingShips}/${simStats.friendly.startedShips}:${simStats.hostile.survivingShips}/${simStats.hostile.startedShips}`
    : 'none';

  return [
    viewerId,
    params.activeSystemId,
    params.selectedPlanetId,
    params.selectedSlotIndex,
    params.selectedHarvesterId ?? 'none',
    params.pendingDeepSpace ?? 'none',
    params.statusBannerMessage,
    planetSummarySig,
    structSig,
    assignedHarvesterSig,
    assignedCombatShipSig,
    deepSpaceSig,
    resourceSummarySig,
    wormholeSig,
    fleetSig,
    battleSimSig,
  ].join('|');
}

function formatHarvesterState(
  state: HarvesterActivityState,
  cargoType: 'ore' | 'crystal',
): string {
  const resName = cargoType === 'ore' ? 'Ore Asteroid' : 'Crystal Cluster';
  switch (state) {
    case 'flying_to_belt':
      return `Outbound → ${resName}`;
    case 'mining':
      return `Mining ${resName} (Laser Locked)`;
    case 'returning_to_dropoff':
      return `Returning Laden (${cargoType.toUpperCase()})`;
    case 'waiting_to_unload':
      return 'Waiting for Refinery Dock (Queue)';
    case 'unloading':
      return `Unloading ${cargoType.toUpperCase()} at Platform`;
    case 'transiting_to_hub':
      return 'Transiting Wormhole → Central Hub';
    case 'transiting_to_home':
      return 'Transiting Wormhole → Home System';
  }
}

interface HudRegions {
  readonly topBar: HTMLElement;
  readonly leftOutliner: HTMLElement;
  readonly bottomInspector: HTMLElement;
  readonly quickDock: HTMLElement;
  readonly topRightSlot: HTMLElement;
}

export interface SystemHudHandle {
  readonly dispose: () => void;
}

export interface MountSystemHudOptions {
  readonly onQuitToMainMenu?: () => void;
  readonly isBattleSimulator?: boolean;
}

export function mountSystemHud(
  container: HTMLElement,
  galaxy: GalaxyTopology,
  sceneManager: SystemSceneManager,
  musicPlayer?: AmbientMusicPlayer,
  options?: MountSystemHudOptions,
): SystemHudHandle {
  let simAdapter = sceneManager.simAdapter;
  let sim = simAdapter.simulation;
  let playerId = simAdapter.localPlayerId;

  function syncSimRefs(): void {
    simAdapter = sceneManager.simAdapter;
    sim = simAdapter.simulation;
    playerId = simAdapter.localPlayerId;
  }

  const isBattleSimulator = options?.isBattleSimulator === true;
  let selectedSlotIndex = 2;
  let statusBannerMessage = '';
  let crossSystemMiningEnabled = false;
  let selectedFleetStance: FleetStance = 'aggressive';
  let collapsedSections = createDefaultHudCollapsedState();
  if (isBattleSimulator) {
    collapsedSections = { ...collapsedSections, battle_sim: false };
  }
  let lastWormholeClick: { readonly id: string; readonly atMs: number } | null = null;
  let lastWormholeTransitAtMs = 0;
  const battleSimFriendly: Record<CombatShipClassId, number> = {
    fighter: 0,
    destroyer: 3,
    cruiser: 2,
    carrier: 1,
    dreadnought: 0,
  };
  const battleSimHostile: Record<CombatShipClassId, number> = {
    fighter: 0,
    destroyer: 2,
    cruiser: 2,
    carrier: 0,
    dreadnought: 1,
  };

  const regions: HudRegions = {
    topBar: document.createElement('div'),
    leftOutliner: document.createElement('div'),
    bottomInspector: document.createElement('div'),
    quickDock: document.createElement('div'),
    topRightSlot: document.createElement('div'),
  };
  regions.topBar.className = 'hud-top-bar';
  regions.leftOutliner.className = 'hud-left-outliner';
  regions.bottomInspector.className = 'hud-bottom-inspector';
  regions.quickDock.className = 'hud-quick-dock';
  regions.topRightSlot.className = 'hud-top-right-slot';

  const lobbyHostEl = document.createElement('div');
  const tutorialHostEl = document.createElement('div');
  const mainBodyEl = document.createElement('div');
  mainBodyEl.className = 'hud-inspector-body';
  const harvesterInspectorEl = document.createElement('div');
  harvesterInspectorEl.className = 'hud-harvester-inspector';

  regions.topRightSlot.append(tutorialHostEl, lobbyHostEl);
  regions.bottomInspector.append(harvesterInspectorEl, mainBodyEl);

  container.innerHTML = '';
  container.append(
    regions.topBar,
    regions.leftOutliner,
    regions.bottomInspector,
    regions.quickDock,
    regions.topRightSlot,
  );

  const topBar = mountTopBar(regions.topBar, {
    onSetSpeed: (spd) => {
      simAdapter.simSpeedMultiplier = spd;
      renderEconomyBar();
    },
    onToggleMusic: () => {
      musicPlayer?.toggleMute();
      renderEconomyBar();
    },
    ...(options?.onQuitToMainMenu
      ? { onQuitToMainMenu: options.onQuitToMainMenu }
      : {}),
  });

  regions.quickDock.innerHTML = `
    <div class="hud-label" style="margin-bottom: 0;">Quick Actions</div>
    <button class="hud-btn" data-action="toggle-hub-mining" title="Send Harvesters through the Wormhole to mine the Central Nexus">
      Mining: Local System
    </button>
    <button class="hud-btn overview-btn" data-action="overview" title="Zoom out to System Overview">
      Overview
    </button>
  `;

  const hubMiningBtnEl = regions.quickDock.querySelector<HTMLButtonElement>(
    '[data-action="toggle-hub-mining"]',
  );
  const overviewBtnEl = regions.quickDock.querySelector<HTMLButtonElement>(
    '[data-action="overview"]',
  );

  let tutorialController: TutorialController;

  const lobbyController = new LobbyController({
    hostContainer: lobbyHostEl,
    sceneManager,
    onMatchLaunched: (setup) => {
      syncSimRefs();
      selectedSlotIndex = 2;
      crossSystemMiningEnabled = false;
      const presetCfg = MATCH_PRESETS[setup.presetId];
      const aiCount = Object.values(setup.slots).filter(
        (s) => s.kind === 'ai',
      ).length;
      const emptyCount = Object.values(setup.slots).filter(
        (s) => s.kind === 'empty',
      ).length;
      statusBannerMessage = `Launched ${presetCfg.displayName} (${FACTION_PALETTES[setup.localPlayerId].label}, ${aiCount} AI, ${emptyCount} Empty Sector${emptyCount === 1 ? '' : 's'}).`;
      tutorialController.resetForMatch(setup.presetId);
      renderEconomyBar();
      renderHarvesterInspector();
      renderMainPanel();
    },
    onOpenStateChange: () => {
      renderEconomyBar();
    },
  });

  tutorialController = new TutorialController({
    hostContainer: tutorialHostEl,
    hudRoot: container,
    initialPresetId: sim.presetId,
    onOpenLobby: () => {
      lobbyController.openLobby();
    },
  });

  hubMiningBtnEl?.addEventListener('click', () => {
    syncSimRefs();
    if (
      'setPlayerHarvestersCrossSystemMining' in sim &&
      typeof sim.setPlayerHarvestersCrossSystemMining === 'function'
    ) {
      crossSystemMiningEnabled = !crossSystemMiningEnabled;
      sim.setPlayerHarvestersCrossSystemMining(playerId, crossSystemMiningEnabled);
    }
    renderEconomyBar();
  });

  overviewBtnEl?.addEventListener('click', () => {
    sceneManager.focusSystemOverview();
  });

  function renderEconomyBar(): void {
    syncSimRefs();
    topBar.update(
      buildTopBarModel(sim, {
        playerId,
        activeSystemId: sceneManager.getActiveSystem().id,
        speed: simAdapter.simSpeedMultiplier,
        musicMuted: musicPlayer ? musicPlayer.isMuted() : true,
      }),
    );
    if (hubMiningBtnEl) {
      hubMiningBtnEl.classList.toggle('active', crossSystemMiningEnabled);
      hubMiningBtnEl.textContent = crossSystemMiningEnabled
        ? 'Mining: Central Hub'
        : 'Mining: Local System';
    }
    lobbyController.syncTelemetry();
  }

  let lastInspectedHarvesterId: string | null = null;

  function patchHarvesterInspectorLive(): void {
    syncSimRefs();
    const selectedHarvesterId = sceneManager.getSelectedHarvesterId();
    const selectedHarvester = selectedHarvesterId
      ? sim.getHarvesterById(selectedHarvesterId)
      : undefined;
    if (!selectedHarvester) {
      return;
    }

    const pct = Math.min(
      100,
      Math.round(
        (selectedHarvester.cargoAmount / Math.max(1, selectedHarvester.cargoCapacity)) *
          100,
      ),
    );
    const isCameraPinned = sceneManager.cameraController.isPinned();
    const targetResourceLabel =
      selectedHarvester.cargoType === 'ore'
        ? 'Ore Deposit (Silicate/Iron Boulder)'
        : 'Crystal Deposit (Pale Ice-Blue Cluster)';
    const homeLookup = sim.getStructureById(selectedHarvester.homeStructureId);
    const homeLabel = homeLookup
      ? `${ORBITAL_STRUCTURES[homeLookup.structure.structureId].displayName} (${homeLookup.planetState.planet.name})`
      : 'Reassigning...';

    const stateEl = harvesterInspectorEl.querySelector<HTMLElement>(
      '[data-hud-field="harvester-state"]',
    );
    if (stateEl) {
      stateEl.textContent = formatHarvesterState(
        selectedHarvester.state,
        selectedHarvester.cargoType,
      );
    }
    const targetEl = harvesterInspectorEl.querySelector<HTMLElement>(
      '[data-hud-field="harvester-target"]',
    );
    if (targetEl) targetEl.textContent = targetResourceLabel;

    const homeEl = harvesterInspectorEl.querySelector<HTMLElement>(
      '[data-hud-field="harvester-home"]',
    );
    if (homeEl) homeEl.textContent = homeLabel;

    const speedEl = harvesterInspectorEl.querySelector<HTMLElement>(
      '[data-hud-field="harvester-speed"]',
    );
    if (speedEl) speedEl.textContent = `${selectedHarvester.currentSpeed.toFixed(1)} u/s`;

    const cargoLabelEl = harvesterInspectorEl.querySelector<HTMLElement>(
      '[data-hud-field="harvester-cargo-label"]',
    );
    if (cargoLabelEl) {
      cargoLabelEl.textContent = `Mined Cargo (${selectedHarvester.cargoType.toUpperCase()})`;
    }

    const cargoValEl = harvesterInspectorEl.querySelector<HTMLElement>(
      '[data-hud-field="harvester-cargo-val"]',
    );
    if (cargoValEl) {
      cargoValEl.textContent = `${selectedHarvester.cargoAmount.toFixed(1)} / ${selectedHarvester.cargoCapacity} (${pct}%)`;
    }

    const cargoFillEl = harvesterInspectorEl.querySelector<HTMLElement>(
      '[data-hud-field="harvester-cargo-fill"]',
    );
    if (cargoFillEl) {
      cargoFillEl.className = `telemetry-progress-fill ${selectedHarvester.cargoType}`;
      cargoFillEl.style.width = `${pct}%`;
    }

    const repinBtn = harvesterInspectorEl.querySelector<HTMLButtonElement>(
      '[data-action="repin-harvester"]',
    );
    if (repinBtn) {
      repinBtn.classList.toggle('active', isCameraPinned);
      repinBtn.textContent = isCameraPinned
        ? 'Camera Pinned (Pan to Break)'
        : 'Pin Camera to Follow';
    }
  }

  function renderHarvesterInspector(): void {
    syncSimRefs();
    const selectedHarvesterId = sceneManager.getSelectedHarvesterId();
    const selectedHarvester = selectedHarvesterId
      ? sim.getHarvesterById(selectedHarvesterId)
      : undefined;

    if (!selectedHarvester) {
      if (lastInspectedHarvesterId !== null) {
        lastInspectedHarvesterId = null;
        harvesterInspectorEl.innerHTML = '';
      }
      harvesterInspectorEl.style.display = 'none';
      return;
    }

    harvesterInspectorEl.style.display = '';

    // If the same Harvester is already rendered, patch live fields in-place without rebuilding buttons
    if (lastInspectedHarvesterId === selectedHarvester.id) {
      patchHarvesterInspectorLive();
      return;
    }
    lastInspectedHarvesterId = selectedHarvester.id;

    harvesterInspectorEl.innerHTML = `
      <div class="harvester-telemetry-card">
        <div class="telemetry-row">
          <div>
            <strong>Selected: ${selectedHarvester.id.replace('_', ' #')}</strong>
            <span class="hud-badge" data-hud-field="harvester-state"></span>
          </div>
          <div class="telemetry-actions">
            <button class="hud-btn" data-action="repin-harvester"></button>
            <button class="hud-btn" data-action="deselect-harvester">Close</button>
          </div>
        </div>
        <div class="telemetry-meta">
          <span><strong>Target:</strong> <span data-hud-field="harvester-target"></span></span>
          <span><strong>Home:</strong> <span data-hud-field="harvester-home"></span></span>
          <span><strong>Speed:</strong> <span data-hud-field="harvester-speed"></span></span>
        </div>
        <div class="telemetry-progress-wrap">
          <div class="telemetry-progress-label">
            <span data-hud-field="harvester-cargo-label"></span>
            <strong data-hud-field="harvester-cargo-val"></strong>
          </div>
          <div class="telemetry-progress-bar">
            <div class="telemetry-progress-fill" data-hud-field="harvester-cargo-fill"></div>
          </div>
        </div>
      </div>
    `;

    harvesterInspectorEl
      .querySelector<HTMLButtonElement>('[data-action="repin-harvester"]')
      ?.addEventListener('click', () => {
        if (selectedHarvesterId) {
          sceneManager.selectAndPinHarvester(selectedHarvesterId);
          renderHarvesterInspector();
        }
      });

    harvesterInspectorEl
      .querySelector<HTMLButtonElement>('[data-action="deselect-harvester"]')
      ?.addEventListener('click', () => {
        sceneManager.selectAndPinHarvester(null);
        renderHarvesterInspector();
      });

    patchHarvesterInspectorLive();
  }

  function buildTutorialUiContext(): TutorialUiContext {
    syncSimRefs();
    let homeSystemId = 'system_starter_1';
    let homePlanetId = 'system_starter_1_homeworld';
    for (const system of sim.galaxy.systems) {
      for (const planet of sim.getPlanetsInSystem(system.id)) {
        if (
          planet.structures.some(
            (s) =>
              s.ownerId === playerId &&
              s.structureId === 'command_and_control',
          )
        ) {
          homeSystemId = system.id;
          homePlanetId = planet.planet.id;
          break;
        }
      }
    }

    const selectedPlanetId = sceneManager.getSelectedPlanetId();
    const selectedPlanetState = sim.getPlanetState(selectedPlanetId);
    const selectedStruct = selectedPlanetState.structures.find((s) =>
      s.occupiedSlots.includes(selectedSlotIndex),
    );
    const selectedSlotOccupied = selectedStruct !== undefined;
    const selectedSlotCanQueueHarvester =
      selectedStruct !== undefined &&
      selectedStruct.isComplete &&
      selectedStruct.ownerId === playerId &&
      (selectedStruct.structureId === 'refinery' ||
        selectedStruct.structureId === 'command_and_control');

    const homePlanetState = sim.getPlanetState(homePlanetId);
    let firstEmptySlotIndex: number | null = null;
    for (let idx = 0; idx < homePlanetState.planet.orbitalSlots; idx += 1) {
      if (!homePlanetState.structures.some((s) => s.occupiedSlots.includes(idx))) {
        firstEmptySlotIndex = idx;
        break;
      }
    }

    return {
      homePlanetId,
      homeSystemId,
      selectedPlanetId,
      selectedSlotOccupied,
      selectedSlotCanQueueHarvester,
      firstEmptySlotIndex,
      isOrbitalRingCollapsed: collapsedSections.orbital_ring,
      isFleetPanelOpen: true,
    };
  }

  let lastMainPanelSignature = '';

  function getCurrentMainPanelSignature(): string {
    syncSimRefs();
    return computeMainPanelSignature(sim, {
      playerId,
      activeSystemId: sceneManager.getActiveSystem().id,
      selectedPlanetId: sceneManager.getSelectedPlanetId(),
      selectedSlotIndex,
      selectedHarvesterId: sceneManager.getSelectedHarvesterId(),
      pendingDeepSpace: sceneManager.getPendingDeepSpacePlacement(),
      statusBannerMessage,
      wormholeStates: sceneManager.getActiveWormholes().map((wh) => ({
        id: wh.wormholeId,
        isOpen: wh.isOpen(),
      })),
    });
  }

  function renderMainPanel(): void {
    syncSimRefs();
    const activeSystem = sceneManager.getActiveSystem();
    const systemView = sim.getPlayerSystemView(playerId, activeSystem.id);
    const selectedPlanetId = sceneManager.getSelectedPlanetId();
    const selectedPlanetView = systemView.planets.find(
      (p) => p.planet.id === selectedPlanetId,
    );
    const selectedPlanetNode =
      selectedPlanetView?.planet ??
      activeSystem.planets[0] ??
      sim.getPlanetState(selectedPlanetId).planet;
    const totalSlots = selectedPlanetNode.orbitalSlots;

    if (selectedSlotIndex >= totalSlots) {
      selectedSlotIndex = 0;
    }

    lastMainPanelSignature = getCurrentMainPanelSignature();

    const selectedFleetId = sceneManager.getSelectedFleetId();
    const pendingOrderGlobal = sceneManager.getPendingFleetOrder();

    regions.leftOutliner.innerHTML = renderLeftOutlinerHtml(
      buildLeftOutlinerModel(sim, {
        galaxy,
        playerId,
        activeSystem,
        selectedPlanetId,
        selectedFleetId,
        selectedHarvesterId: sceneManager.getSelectedHarvesterId(),
        wormholeStates: sceneManager.getActiveWormholes().map((wh) => ({
          id: wh.wormholeId,
          destinationSystemId: wh.destinationSystemId,
          isOpen: wh.isOpen(),
        })),
        pendingFleetOrder: pendingOrderGlobal,
      }),
    );

    const isSelectedPlanetUnexplored =
      !selectedPlanetView || selectedPlanetView.visibility === 'unexplored';
    const selectedPlanetStructures = selectedPlanetView?.structures ?? [];

    const slotPills = buildOrbitalSlotPills(
      totalSlots,
      isSelectedPlanetUnexplored,
      selectedPlanetStructures.map((item) => {
        const data = getProjectedOrbitalData(item);
        return {
          id: data.id,
          kind: item.kind,
          structureId: data.structureId,
          occupiedSlots: data.occupiedSlots,
          isComplete: data.isComplete,
          buildProgressSeconds: item.kind === 'live' ? item.structure.buildProgressSeconds : 0,
          totalBuildTimeSeconds: item.kind === 'live' ? item.structure.totalBuildTimeSeconds : 1,
        };
      }),
      selectedSlotIndex,
    );

    const slotButtonsHtml = slotPills
      .map((pill) => {
        const label =
          pill.structureName === null
            ? `${pill.slotPrefix}: ${pill.statusText}`
            : pill.isLiveStructure
              ? `${pill.slotPrefix}: ${pill.structureName} (<span data-slot-pct="${pill.primarySlotIndex}">${pill.statusText}</span>)`
              : `${pill.slotPrefix}: ${pill.structureName} (${pill.statusText})`;
        const multiClass = pill.occupiedSlots.length > 1 ? ' multi-slot' : '';
        return `<button class="slot-pill ${pill.stateClass}${multiClass} ${pill.isSelected ? 'selected' : ''}" data-slot-index="${pill.primarySlotIndex}" data-occupied-slots="${pill.occupiedSlots.join(',')}">
        ${label}
      </button>`;
      })
      .join('');

    const selectedItem = selectedPlanetStructures.find((item) =>
      getProjectedOrbitalData(item).occupiedSlots.includes(selectedSlotIndex),
    );
    let slotActionsHtml = '';

    if (isSelectedPlanetUnexplored) {
      slotActionsHtml = `<div class="slot-detail-box">Planet is <strong>Unexplored</strong>. Move a ship or build a sensor nearby to scan this world.</div>`;
    } else if (selectedItem && selectedItem.kind === 'ghost') {
      const cfg = ORBITAL_STRUCTURES[selectedItem.structureId];
      const ageText = formatIntelAge(sim.elapsedSeconds - selectedItem.observedAtSeconds);
      slotActionsHtml = `
        <div class="slot-detail-box" style="flex-direction: column; align-items: stretch;">
          <div style="display: flex; justify-content: space-between; align-items: center; gap: 10px;">
            <div>
              <strong>${cfg.displayName}</strong> (${cfg.slotCost} Slot${cfg.slotCost > 1 ? 's' : ''})
              <span class="hud-badge">LAST KNOWN INTEL (<span data-hud-field="intel-age">${ageText}</span>)</span>
            </div>
            <div>Owner: <strong>${selectedItem.ownerId.toUpperCase()}</strong></div>
          </div>
          <div style="margin-top: 6px; font-size: 12px; opacity: 0.85;">
            Last observed: ${selectedItem.isComplete ? 'Operational' : 'Under Construction'} • Shields: ${Math.round(selectedItem.shields)} • Hull: ${Math.round(selectedItem.hull)}
          </div>
        </div>
      `;
    } else if (selectedItem && selectedItem.kind === 'live') {
      const selectedStruct = selectedItem.structure;
      const cfg = ORBITAL_STRUCTURES[selectedStruct.structureId];
      const isDropoffPlatform =
        selectedStruct.isComplete &&
        selectedStruct.ownerId === playerId &&
        (selectedStruct.structureId === 'refinery' ||
          selectedStruct.structureId === 'command_and_control');
      const isOperationalDockyard =
        selectedStruct.isComplete &&
        selectedStruct.ownerId === playerId &&
        selectedStruct.structureId === 'orbital_dockyard';
      const hCost = SHIP_CLASSES.harvester.cost;
      const unloadRate = sim.getPlatformUnloadRatePerSecond(selectedStruct);
      const unloadRateLabel = Number.isInteger(unloadRate)
        ? `${unloadRate}`
        : unloadRate.toFixed(1);
      const maxDocks = sim.getMaxConcurrentDocks(selectedStruct);
      const dockStatusText = `Unload: ${unloadRateLabel}/s • Docks: ${selectedStruct.activeDockingHarvesterIds.length}/${maxDocks} (Queued: ${selectedStruct.queuedDockingHarvesterIds.length})`;

      const assignedHarvesters = isDropoffPlatform
        ? getVisibleHarvesters(sim, playerId).filter(
            (h) => h.ownerId === playerId && h.homeStructureId === selectedStruct.id,
          )
        : [];
      const selectedHarvesterId = sceneManager.getSelectedHarvesterId();

      const focusControlsHtml = isDropoffPlatform
        ? `<div class="hud-btn-row" style="margin-top: 6px;">
            <span class="econ-label" style="margin-right: 4px;">MINING FOCUS (${assignedHarvesters.length} HARVESTER${assignedHarvesters.length === 1 ? '' : 'S'}):</span>
            ${(['auto', 'ore', 'crystal'] as const)
              .map((focus) => {
                const isActive = selectedStruct.targetResource === focus;
                const label =
                  focus === 'auto'
                    ? 'Auto (Balanced)'
                    : focus === 'ore'
                      ? 'Ore Only'
                      : 'Crystal Only';
                return `<button class="hud-btn ${isActive ? 'active' : ''}" data-set-focus="${focus}" data-focus-struct="${selectedStruct.id}">${label}</button>`;
              })
              .join('')}
          </div>`
        : '';

      const assignedHarvestersHtml = isDropoffPlatform
        ? `<div class="hud-btn-row" style="margin-top: 6px;">
            <span class="econ-label" style="margin-right: 4px;">ASSIGNED HARVESTERS (${assignedHarvesters.length}):</span>
            ${
              assignedHarvesters.length > 0
                ? assignedHarvesters
                    .map((h, idx) => {
                      const isSel = h.id === selectedHarvesterId;
                      const pct = Math.round(
                        (h.cargoAmount / Math.max(1, h.cargoCapacity)) * 100,
                      );
                      return `<button class="hud-btn ${isSel ? 'active' : ''}" data-select-harvester="${h.id}" title="Click to inspect and follow this Harvester">
                        Harvester #${idx + 1}
                        <span class="hud-badge" data-harvester-badge="${h.id}">${h.cargoType.toUpperCase()} ${pct}%</span>
                      </button>`;
                    })
                    .join('')
                : '<span class="econ-label" style="opacity: 0.7;">None assigned</span>'
            }
          </div>`
        : '';

      const queueCount = selectedStruct.productionQueue.length;
      const isQueueFull = queueCount >= MAX_SHIP_PRODUCTION_QUEUE_SIZE;
      const queueItemsHtml =
        (isDropoffPlatform || isOperationalDockyard) && queueCount > 0
          ? `<div class="hud-btn-row" style="margin-top: 6px;">
              <span class="econ-label" style="margin-right: 4px;">BUILD QUEUE (${queueCount}/${MAX_SHIP_PRODUCTION_QUEUE_SIZE}):</span>
              ${selectedStruct.productionQueue
                .map((item, idx) => {
                  const shipCfg = SHIP_CLASSES[item.shipClassId];
                  const rem = Math.max(
                    0,
                    Math.ceil(item.buildTimeSeconds - item.progressSeconds),
                  );
                  const repeatTag = item.autoRepeat ? ' ↻' : '';
                  const label =
                    idx === 0
                      ? `${shipCfg.displayName} (${rem}s)${repeatTag}`
                      : `${shipCfg.displayName} #${idx + 1}${repeatTag}`;
                  return `<button class="hud-btn" data-cancel-queue="${item.id}" data-cancel-struct="${selectedStruct.id}" title="Click to cancel and refund ${shipCfg.cost.ore} Ore / ${shipCfg.cost.crystal} Crystal">
                    <span data-queue-label="${item.id}">${label}</span> ✕
                  </button>`;
                })
                .join('')}
            </div>`
          : '';

      let dockyardControlsHtml = '';
      if (isOperationalDockyard) {
        const fleetBuildEnabled = selectedStruct.fleetProductionEnabled !== false;
        dockyardControlsHtml = `
          <div style="margin-top: 6px; font-size: 12px; opacity: 0.85;">
            Dual-bay orbital dry-dock (2 parallel slipways). Automatically constructs and resupplies ships for active Fleet templates.
          </div>
          <div class="hud-btn-row" style="margin-top: 6px;">
            <span class="econ-label" style="margin-right: 4px;">FLEET BUILDING:</span>
            <button class="hud-btn ${fleetBuildEnabled ? 'active' : ''}" data-toggle-dockyard-fleet-building="${selectedStruct.id}">
              ${fleetBuildEnabled ? 'Enabled (Supplying Fleets)' : 'Disabled (Paused)'}
            </button>
          </div>
        `;
      }

      const isOwnedLiveStructure = selectedStruct.ownerId === playerId;
      const cancelOre = Math.round(cfg.cost.ore * ORBITAL_CANCEL_REFUND_RATE);
      const cancelCrystal = Math.round(cfg.cost.crystal * ORBITAL_CANCEL_REFUND_RATE);
      const decommOre = Math.round(cfg.cost.ore * ORBITAL_DECOMMISSION_REFUND_RATE);
      const decommCrystal = Math.round(cfg.cost.crystal * ORBITAL_DECOMMISSION_REFUND_RATE);
      const structureLifecycleBtnHtml = !isOwnedLiveStructure
        ? ''
        : !selectedStruct.isComplete
          ? `<button class="hud-btn danger" data-cancel-orbital="${selectedStruct.id}" title="Cancel construction and refund ${cancelOre} Ore / ${cancelCrystal} Crystal">
              Cancel Build (+${cancelOre} Ore / +${cancelCrystal} Cry)
            </button>`
          : selectedStruct.structureId !== 'command_and_control'
            ? `<button class="hud-btn danger" data-decommission-orbital="${selectedStruct.id}" title="Decommission platform to reclaim ${cfg.slotCost} slot${cfg.slotCost > 1 ? 's' : ''} and salvage ${decommOre} Ore / ${decommCrystal} Crystal">
                Decommission (+${decommOre} Ore / +${decommCrystal} Cry)
              </button>`
            : '';

      const isOwnedCnc =
        isOwnedLiveStructure &&
        selectedStruct.isComplete &&
        selectedStruct.structureId === 'command_and_control';
      const emergencyTimer = isOwnedCnc
        ? sim.getPlayerState(playerId).emergencyHarvesterTimerSeconds
        : 0;
      const emergencyRemaining = Math.max(
        1,
        Math.ceil(CNC_EMERGENCY_HARVESTER_REBUILD_SECONDS - emergencyTimer),
      );
      const emergencyHarvesterHtml = isOwnedCnc
        ? `<div data-hud-field="emergency-harvester-notice" style="display: ${emergencyTimer > 0 ? 'block' : 'none'}; margin-top: 6px; font-size: 12px; color: #fbbf24;">
            Emergency Harvester Rebuild in progress (<span data-hud-field="emergency-harvester-secs">${emergencyRemaining}s</span>) — free recovery unit launching at C&amp;C.
          </div>`
        : '';

      slotActionsHtml = `
        <div class="slot-detail-box" style="flex-direction: column; align-items: stretch;">
          <div style="display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap;">
            <div>
              <strong>${cfg.displayName}</strong> (${cfg.slotCost} Slot${cfg.slotCost > 1 ? 's' : ''})
              — <span data-hud-field="struct-status">${selectedStruct.isComplete ? (isDropoffPlatform ? dockStatusText : 'Operational') : `Constructing (${Math.ceil(selectedStruct.totalBuildTimeSeconds - selectedStruct.buildProgressSeconds)}s left)`}</span>
            </div>
            <div class="hud-btn-row" style="margin: 0;">
              ${
                isDropoffPlatform
                  ? `<button class="hud-btn active" data-action="spawn-harvester" data-struct-id="${selectedStruct.id}" ${isQueueFull ? 'disabled' : ''}>
                      ${isQueueFull ? `Queue Full (${queueCount}/${MAX_SHIP_PRODUCTION_QUEUE_SIZE})` : `+ Queue Harvester (${hCost.ore} Ore / ${hCost.crystal} Crystal • ${SHIP_CLASSES.harvester.buildTimeSeconds}s)`}
                    </button>`
                  : ''
              }
              ${structureLifecycleBtnHtml}
            </div>
          </div>
          ${emergencyHarvesterHtml}
          ${focusControlsHtml}
          ${assignedHarvestersHtml}
          ${dockyardControlsHtml}
          ${queueItemsHtml}
        </div>
      `;
    } else {
      const isLastKnownPlanet = selectedPlanetView?.visibility === 'last_known';
      const isUnclaimed = (selectedPlanetView?.ownerId ?? null) === null;
      const isOwnedByOther =
        selectedPlanetView !== undefined &&
        selectedPlanetView.ownerId !== null &&
        selectedPlanetView.ownerId !== playerId;

      if (isLastKnownPlanet) {
        const ageText =
          selectedPlanetView?.observedAtSeconds !== null &&
          selectedPlanetView?.observedAtSeconds !== undefined
            ? formatIntelAge(sim.elapsedSeconds - selectedPlanetView.observedAtSeconds)
            : 'stale';
        slotActionsHtml = `<div class="slot-detail-box"><span class="hud-badge">LAST KNOWN INTEL (<span data-hud-field="intel-age">${ageText}</span>)</span> — Move a unit in sensor range for live orbital status.</div>`;
      } else if (isOwnedByOther && selectedPlanetView) {
        slotActionsHtml = `<div class="slot-detail-box">Planet is controlled by ${selectedPlanetView.ownerId}.</div>`;
      } else {
        slotActionsHtml = BUILDABLE_STRUCTURE_IDS.map((structId) => {
          const cfg = ORBITAL_STRUCTURES[structId];
          const lockedByOutpostRule = isUnclaimed && structId !== 'planetary_outpost';
          const alreadyClaimedOutpost = !isUnclaimed && structId === 'planetary_outpost';
          const disabled = lockedByOutpostRule || alreadyClaimedOutpost;

          return `<button class="build-card-btn" data-build-struct="${structId}" ${disabled ? 'disabled' : ''}>
            <div class="build-card-name">${cfg.displayName} <span class="hud-badge">${cfg.slotCost}S</span></div>
            <div class="build-card-cost">${cfg.cost.ore} Ore • ${cfg.cost.crystal} Crystal • ${cfg.buildTimeSeconds}s</div>
            <div class="build-card-note">
              ${
                lockedByOutpostRule
                  ? 'Requires Planetary Outpost first'
                  : structId === 'refinery'
                    ? 'Spawns 1 Free Harvester'
                    : structId === 'planetary_outpost'
                      ? 'Claims unowned planet'
                      : structId === 'tech_module'
                        ? '+15 Supply & Tech Tier'
                        : 'Orbital installation'
              }
            </div>
          </button>`;
        }).join('');
      }
    }

    const pendingDeepSpace = sceneManager.getPendingDeepSpacePlacement();
    const deepSpaceInSystem = systemView.deepSpaceStructures;
    const hasCompletedFriendlyHub = deepSpaceInSystem.some(
      (item) =>
        item.kind === 'live' &&
        item.structure.structureId === 'logistics_hub' &&
        item.structure.ownerId === playerId &&
        item.structure.isComplete,
    );

    const deepSpaceBuildButtonsHtml = BUILDABLE_DEEP_SPACE_IDS.map((dsId) => {
      const cfg = DEEP_SPACE_STRUCTURES[dsId];
      const isPending = pendingDeepSpace === dsId;
      const lockedByHubRule = cfg.requiresLogisticsHubRadius && !hasCompletedFriendlyHub;
      return `<button class="hud-btn ${isPending ? 'active' : ''}" data-place-deepspace="${dsId}" ${lockedByHubRule ? 'disabled' : ''}>
        ${isPending ? `Click 3D Space to Place ${cfg.displayName}` : `+ Place ${cfg.displayName} (${cfg.cost.ore} Ore • ${cfg.cost.crystal} Crystal • ${cfg.buildTimeSeconds}s)`}
      </button>`;
    }).join('');

    const deepSpaceInstancesHtml =
      deepSpaceInSystem.length > 0
        ? `<div class="hud-btn-row" style="margin-top: 6px;">
            ${deepSpaceInSystem
              .map((item, idx) => {
                const ds = item.kind === 'live' ? item.structure : item;
                const cfg = DEEP_SPACE_STRUCTURES[ds.structureId];
                if (item.kind === 'ghost') {
                  const ageText = formatIntelAge(
                    sim.elapsedSeconds - item.observedAtSeconds,
                  );
                  return `<button class="hud-btn" data-focus-deepspace="${ds.id}">
                    ${cfg.displayName} #${idx + 1} (${Math.round(ds.position.x)}, ${Math.round(ds.position.z)})
                    <span class="hud-badge" data-deepspace-badge="${ds.id}">LAST KNOWN (${ageText})</span>
                  </button>`;
                }
                const statusText = ds.isComplete
                  ? 'Operational'
                  : `${Math.floor((ds.buildProgressSeconds / Math.max(1, ds.totalBuildTimeSeconds)) * 100)}%`;
                return `<button class="hud-btn" data-focus-deepspace="${ds.id}">
                  ${cfg.displayName} #${idx + 1} (${Math.round(ds.position.x)}, ${Math.round(ds.position.z)})
                  <span class="hud-badge" data-deepspace-badge="${ds.id}">${statusText}</span>
                </button>`;
              })
              .join('')}
          </div>`
        : '';

    const playerFleets = sim.getFleetsForPlayer(playerId);

    const selectedFleet = selectedFleetId
      ? playerFleets.find((f) => f.id === selectedFleetId)
      : undefined;
    let selectedFleetDetailHtml = '';
    if (selectedFleet) {
      const fleetShips = sim.getShipsInFleet(selectedFleet.id);
      const isFleetPatrolPending =
        pendingOrderGlobal?.mode === 'fleet_patrol' &&
        pendingOrderGlobal.fleetId === selectedFleet.id;
      const otherFleets = playerFleets.filter((f) => f.id !== selectedFleet.id);
      const techCount = sim.getPlayerTechModuleCount(playerId);

      const templateRowsHtml = SMALLEST_FIRST_FLEET_HULLS.map((hull) => {
        const sCfg = SHIP_CLASSES[hull];
        const live = fleetShips.filter((s) => s.shipClassId === hull).length;
        const desired = selectedFleet.desiredCounts[hull];
        const techLock =
          techCount < sCfg.requiredTechModuleCount
            ? ` (Req ${sCfg.requiredTechModuleCount} Tech)`
            : '';
        return `<div style="display: inline-flex; align-items: center; gap: 4px; margin-right: 10px;">
          <span class="econ-label">${sCfg.displayName}${techLock}: <strong>${live}/${desired}</strong></span>
          <button class="hud-btn" data-fleet-dec="${hull}" data-fleet-id="${selectedFleet.id}" ${desired <= 0 ? 'disabled' : ''}>−</button>
          <button class="hud-btn" data-fleet-inc="${hull}" data-fleet-id="${selectedFleet.id}">+</button>
        </div>`;
      }).join('');

      const fleetStanceBtns = FLEET_STANCE_OPTIONS.map(
        (opt) =>
          `<button class="hud-btn ${selectedFleet.stance === opt.id ? 'active' : ''}" data-fleet-stance="${opt.id}" data-fleet-id="${selectedFleet.id}">${opt.label}</button>`,
      ).join('');

      const mergeBtns = otherFleets
        .map(
          (other) =>
            `<button class="hud-btn" data-fleet-merge-src="${selectedFleet.id}" data-fleet-merge-dst="${other.id}">Merge → ${other.name}</button>`,
        )
        .join('');

      selectedFleetDetailHtml = `
        <div class="slot-detail-box" style="flex-direction: column; align-items: stretch; margin-top: 6px;">
          <div style="display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap;">
            <div>
              <strong>${selectedFleet.name}</strong> — ${fleetShips.length} ships • Right-click space to Move • Right-click hostile to Attack
            </div>
            <div class="hud-btn-row">
              <button class="hud-btn" data-fleet-focus="${selectedFleet.id}" title="Jump camera to ${selectedFleet.name}">
                Focus
              </button>
              <button class="hud-btn ${selectedFleet.autoResupply ? 'active' : ''}" data-fleet-resupply="${selectedFleet.id}">
                Resupply: ${selectedFleet.autoResupply ? 'ON ↻' : 'OFF'}
              </button>
              <button class="hud-btn ${isFleetPatrolPending ? 'active' : ''}" data-fleet-patrol="${selectedFleet.id}">
                ${isFleetPatrolPending ? `Patrol Wp #${(pendingOrderGlobal?.waypointCount ?? 0) + 1}/2...` : 'Patrol Route (2 Clicks)'}
              </button>
              <button class="hud-btn ${selectedFleet.orderType === 'flee' ? 'active' : ''}" data-fleet-flee="${selectedFleet.id}" title="Flee at full speed to the nearest Logistics Hub, Planetary Outpost, or C&C">
                Flee
              </button>
              <button class="hud-btn" data-fleet-split="${selectedFleet.id}" ${fleetShips.length < 2 ? 'disabled' : ''}>Split</button>
              ${mergeBtns}
              <button class="hud-btn" data-fleet-disband="${selectedFleet.id}">Disband</button>
            </div>
          </div>
          <div class="hud-btn-row" style="margin-top: 6px;">
            <span class="econ-label" style="margin-right: 4px;">TEMPLATE (SMALLEST FIRST):</span>
            ${templateRowsHtml}
          </div>
          <div class="hud-btn-row" style="margin-top: 6px;">
            <span class="econ-label" style="margin-right: 4px;">STANCE:</span>
            ${fleetStanceBtns}
          </div>
        </div>
      `;
    }

    function renderSectionHeader(
      sectionId: HudSectionId,
      labelHtml: string,
      options?: {
        readonly extraActionsHtml?: string;
        readonly legacyAction?: string;
        readonly titleLabel?: string;
      },
    ): string {
      const isCollapsed = collapsedSections[sectionId];
      const titleName = options?.titleLabel ?? 'section';
      const legacyAttr = options?.legacyAction
        ? ` data-action="${options.legacyAction}"`
        : '';
      const toggleBtn = `<button class="hud-btn" data-toggle-section="${sectionId}"${legacyAttr} title="${isCollapsed ? `Expand ${titleName}` : `Collapse ${titleName}`}">
        ${isCollapsed ? 'Expand ▼' : 'Collapse ▲'}
      </button>`;
      const rightHtml = options?.extraActionsHtml
        ? `<div class="hud-btn-row">${options.extraActionsHtml}${toggleBtn}</div>`
        : toggleBtn;
      return `<div style="display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-bottom: ${isCollapsed ? '0' : '6px'};">
        <div class="hud-label" style="margin-bottom: 0;">${labelHtml}</div>
        ${rightHtml}
      </div>`;
    }

    mainBodyEl.innerHTML = `
      ${selectedFleetDetailHtml}

      ${
        isBattleSimulator
          ? `<div class="hud-section" data-hud-section="battle_sim">
        ${renderSectionHeader(
          'battle_sim',
          `Fleet Battle Simulator — Isolated Void Arena${activeSystem.id === BATTLE_SIMULATOR_SYSTEM_ID ? ' (ACTIVE)' : ''}`,
          {
            legacyAction: 'toggle-battle-sim',
            titleLabel: 'Fleet Battle Simulator',
            extraActionsHtml: options?.onQuitToMainMenu
              ? `<button class="hud-btn active" data-action="exit-battle-sim">Return to Main Menu</button>`
              : activeSystem.id === BATTLE_SIMULATOR_SYSTEM_ID
                ? `<button class="hud-btn active" data-action="exit-battle-sim">Return to Match</button>`
                : undefined,
          },
        )}
        ${
          collapsedSections.battle_sim
            ? ''
            : (() => {
                const simClasses: readonly { readonly id: CombatShipClassId; readonly short: string }[] = [
                  { id: 'fighter', short: 'Fighter' },
                  { id: 'destroyer', short: 'Destroyer' },
                  { id: 'cruiser', short: 'Cruiser' },
                  { id: 'carrier', short: 'Carrier' },
                  { id: 'dreadnought', short: 'Dreadnought' },
                ];
                const renderRow = (side: 'friendly' | 'hostile', counts: Record<CombatShipClassId, number>) =>
                  simClasses
                    .map(
                      (c) => `<div style="display: inline-flex; align-items: center; gap: 3px; margin-right: 8px;">
                        <span class="econ-label">${c.short}: <strong>${counts[c.id]}</strong></span>
                        <button class="hud-btn" data-sim-dec="${c.id}" data-sim-side="${side}" ${counts[c.id] <= 0 ? 'disabled' : ''}>−</button>
                        <button class="hud-btn" data-sim-inc="${c.id}" data-sim-side="${side}">+</button>
                      </div>`,
                    )
                    .join('');
                const stats = hasBattleSimulator(sim)
                  ? sim.getBattleSimulatorStats()
                  : null;
                let statsHtml = '';
                if (stats && stats.status !== 'idle') {
                  const duration = (
                    (stats.finishedAtSeconds ?? sim.elapsedSeconds) - stats.startedAtSeconds
                  ).toFixed(1);
                  const fRate =
                    stats.friendly.startedShips > 0
                      ? Math.round(
                          (stats.friendly.survivingShips / stats.friendly.startedShips) * 100,
                        )
                      : 0;
                  const hRate =
                    stats.hostile.startedShips > 0
                      ? Math.round(
                          (stats.hostile.survivingShips / stats.hostile.startedShips) * 100,
                        )
                      : 0;
                  const fTotalDmg = Math.round(
                    stats.friendly.shieldDamageDealt + stats.friendly.hullDamageDealt,
                  );
                  const hTotalDmg = Math.round(
                    stats.hostile.shieldDamageDealt + stats.hostile.hullDamageDealt,
                  );
                  const outcomeLabel =
                    stats.status === 'running'
                      ? 'BATTLE IN PROGRESS'
                      : stats.status === 'friendly_victory'
                        ? 'FRIENDLY VICTORY'
                        : stats.status === 'hostile_victory'
                          ? 'HOSTILE VICTORY'
                          : stats.status === 'draw'
                            ? 'MUTUAL DESTRUCTION (DRAW)'
                            : 'SIMULATION CLEARED';
                  statsHtml = `
                    <div class="slot-detail-box" style="flex-direction: column; align-items: stretch; margin-top: 8px; border-color: rgba(56, 189, 248, 0.55);">
                      <div style="display: flex; justify-content: space-between; align-items: center;">
                        <strong>${outcomeLabel} • Duration: ${duration}s</strong>
                        ${
                          stats.status !== 'running'
                            ? `<button class="hud-btn" data-action="dismiss-battle-stats">Dismiss</button>`
                            : ''
                        }
                      </div>
                      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 6px; font-size: 12px;">
                        <div>
                          <div style="color: #38bdf8; font-weight: 600;">Friendly Fleet</div>
                          <div>Survival: <strong>${stats.friendly.survivingShips}/${stats.friendly.startedShips} (${fRate}%)</strong> • Kills: <strong>${stats.friendly.shipsDestroyed}</strong></div>
                          <div>Damage Dealt: <strong>${fTotalDmg}</strong> (${Math.round(stats.friendly.shieldDamageDealt)} Shield / ${Math.round(stats.friendly.hullDamageDealt)} Hull)</div>
                        </div>
                        <div>
                          <div style="color: #f87171; font-weight: 600;">Hostile Fleet</div>
                          <div>Survival: <strong>${stats.hostile.survivingShips}/${stats.hostile.startedShips} (${hRate}%)</strong> • Kills: <strong>${stats.hostile.shipsDestroyed}</strong></div>
                          <div>Damage Dealt: <strong>${hTotalDmg}</strong> (${Math.round(stats.hostile.shieldDamageDealt)} Shield / ${Math.round(stats.hostile.hullDamageDealt)} Hull)</div>
                        </div>
                      </div>
                    </div>
                  `;
                }
                return `
                  <div class="slot-detail-box" style="flex-direction: column; align-items: stretch;">
                    <div class="hud-btn-row">
                      <span class="econ-label" style="margin-right: 4px; color: #38bdf8;">FRIENDLY FLEET:</span>
                      ${renderRow('friendly', battleSimFriendly)}
                    </div>
                    <div class="hud-btn-row" style="margin-top: 6px;">
                      <span class="econ-label" style="margin-right: 4px; color: #f87171;">HOSTILE FLEET:</span>
                      ${renderRow('hostile', battleSimHostile)}
                    </div>
                    <div class="hud-btn-row" style="margin-top: 8px;">
                      <button class="hud-btn active" data-action="launch-battle-sim">Launch Battle in Void Arena</button>
                      <button class="hud-btn" data-action="clear-battle-sim">End & Clear Sim</button>
                    </div>
                  </div>
                  ${statsHtml}
                `;
              })()
        }
      </div>`
          : ''
      }

      ${
        activeSystem.id === BATTLE_SIMULATOR_SYSTEM_ID
          ? ''
          : `<div class="hud-section">
        ${renderSectionHeader(
          'deep_space',
          'Deep-Space Installations — Free-Floating Logistics Hub ("Atlas") & Defence Towers',
          { titleLabel: 'Deep-Space Installations panel' },
        )}
        ${
          collapsedSections.deep_space
            ? ''
            : `<div class="hud-btn-row">
          ${deepSpaceBuildButtonsHtml}
          ${pendingDeepSpace ? `<button class="hud-btn" data-action="cancel-deepspace">Cancel Placement (Esc)</button>` : ''}
        </div>
        ${deepSpaceInstancesHtml}`
        }
      </div>

      <div class="hud-section">
        ${renderSectionHeader(
          'orbital_ring',
          `Orbital Ring Builder — <strong>${selectedPlanetNode.name}</strong> (${totalSlots} Slots)`,
          { titleLabel: 'Orbital Ring Builder panel' },
        )}
        ${
          collapsedSections.orbital_ring
            ? ''
            : `<div class="slot-ring-grid">${slotButtonsHtml}</div>
        <div class="build-options-grid">${slotActionsHtml}</div>`
        }
      </div>`
      }

      ${statusBannerMessage ? `<div class="hud-status-msg">${statusBannerMessage}</div>` : ''}

      <div class="hud-controls-hint">
        <span><strong>Click Harvester/Planet:</strong> Inspect & Follow</span>
        <span><strong>Double-Click Wormhole:</strong> Transit Camera</span>
        <span><strong>Right-Click Space / Hostile (Fleet):</strong> Move / Attack</span>
        <span><strong>Right-Click Wormhole (Fleet):</strong> Transit Fleet</span>
        <span><strong>Left-Drag / WASD:</strong> Pan (Breaks Follow)</span>
        <span><strong>Right-Drag:</strong> Orbit</span>
        <span><strong>Scroll:</strong> Zoom</span>
      </div>
    `;

    regions.leftOutliner
      .querySelectorAll<HTMLButtonElement>('[data-system-id]')
      .forEach((btn) => {
        btn.addEventListener('click', () => {
          const sysId = btn.dataset.systemId;
          if (sysId) {
            statusBannerMessage = '';
            sceneManager.loadSystem(sysId);
            selectedSlotIndex = 0;
            renderEconomyBar();
            renderMainPanel();
          }
        });
      });

    regions.leftOutliner
      .querySelectorAll<HTMLButtonElement>('[data-planet-id]')
      .forEach((btn) => {
        btn.addEventListener('click', () => {
          const planetId = btn.dataset.planetId;
          if (planetId) {
            statusBannerMessage = '';
            sceneManager.focusPlanet(planetId);
            selectedSlotIndex = 0;
            renderHarvesterInspector();
            renderMainPanel();
          }
        });
      });

    const triggerWormholeTransit = (wormholeId: string): void => {
      const now = Date.now();
      if (now - lastWormholeTransitAtMs < 300) {
        return;
      }
      lastWormholeTransitAtMs = now;
      lastWormholeClick = null;
      statusBannerMessage = '';
      if (sceneManager.transitCameraThroughWormhole(wormholeId)) {
        selectedSlotIndex = 0;
        renderEconomyBar();
        renderHarvesterInspector();
        renderMainPanel();
      }
    };

    regions.leftOutliner
      .querySelectorAll<HTMLButtonElement>('[data-wormhole-id]')
      .forEach((btn) => {
        btn.addEventListener('click', () => {
          const wormholeId = btn.dataset.wormholeId;
          if (!wormholeId) {
            return;
          }
          const now = Date.now();
          if (
            lastWormholeClick &&
            lastWormholeClick.id === wormholeId &&
            now - lastWormholeClick.atMs <= 450
          ) {
            triggerWormholeTransit(wormholeId);
            return;
          }
          lastWormholeClick = { id: wormholeId, atMs: now };
          sceneManager.focusWormhole(wormholeId);
          renderHarvesterInspector();
          if (getCurrentMainPanelSignature() !== lastMainPanelSignature) {
            renderMainPanel();
          }
        });
        btn.addEventListener('dblclick', () => {
          const wormholeId = btn.dataset.wormholeId;
          if (wormholeId) {
            triggerWormholeTransit(wormholeId);
          }
        });
        btn.addEventListener('contextmenu', (e) => {
          const wormholeId = btn.dataset.wormholeId;
          if (!wormholeId || !sceneManager.getSelectedFleetId()) {
            return;
          }
          e.preventDefault();
          sceneManager.orderSelectedFleetThroughWormhole(wormholeId);
        });
      });

    mainBodyEl
      .querySelectorAll<HTMLButtonElement>('[data-select-harvester]')
      .forEach((btn) => {
        btn.addEventListener('click', () => {
          const hId = btn.dataset.selectHarvester ?? null;
          sceneManager.selectAndPinHarvester(hId);
          renderHarvesterInspector();
          renderMainPanel();
        });
      });

    mainBodyEl
      .querySelectorAll<HTMLButtonElement>('[data-slot-index]')
      .forEach((btn) => {
        btn.addEventListener('click', () => {
          selectedSlotIndex = Number(btn.dataset.slotIndex ?? '0');
          statusBannerMessage = '';
          renderMainPanel();
        });
      });

    mainBodyEl
      .querySelectorAll<HTMLButtonElement>('[data-build-struct]')
      .forEach((btn) => {
        btn.addEventListener('click', () => {
          const structId = btn.dataset.buildStruct as OrbitalStructureId | undefined;
          if (!structId) {
            return;
          }
          const res = simAdapter.submitPlayerCommand({
            type: 'BUILD_ORBITAL_STRUCTURE',
            playerId,
            planetId: selectedPlanetId,
            slotIndex: selectedSlotIndex,
            structureId: structId,
          });
          statusBannerMessage = res.ok
            ? `Started constructing ${ORBITAL_STRUCTURES[structId].displayName} on Slot ${selectedSlotIndex + 1}`
            : `Cannot build: ${res.reason}`;
          renderEconomyBar();
          renderMainPanel();
        });
      });

    mainBodyEl
      .querySelector<HTMLButtonElement>('[data-action="spawn-harvester"]')
      ?.addEventListener('click', (e) => {
        const structId =
          (e.currentTarget as HTMLButtonElement).dataset.structId ?? selectedPlanetId;
        const res = simAdapter.submitPlayerCommand({
          type: 'QUEUE_SHIP',
          playerId,
          dockyardOrRefineryId: structId,
          shipClassId: 'harvester',
          autoRepeat: false,
        });
        statusBannerMessage = res.ok
          ? 'Deployed new Resource Harvester!'
          : `Cannot deploy Harvester: ${res.reason}`;
        renderEconomyBar();
        renderHarvesterInspector();
        renderMainPanel();
      });

    mainBodyEl
      .querySelectorAll<HTMLButtonElement>('[data-set-focus]')
      .forEach((btn) => {
        btn.addEventListener('click', () => {
          const focus = btn.dataset.setFocus as ResourceTargetFocus | undefined;
          const structId = btn.dataset.focusStruct;
          if (!focus || !structId) {
            return;
          }
          const res = simAdapter.submitPlayerCommand({
            type: 'SET_REFINERY_TARGET',
            playerId,
            structureId: structId,
            targetResource: focus,
          });
          statusBannerMessage = res.ok
            ? `Platform mining focus set to ${focus.toUpperCase()}`
            : `Cannot set focus: ${res.reason}`;
          renderMainPanel();
        });
      });

    mainBodyEl
      .querySelectorAll<HTMLButtonElement>('[data-cancel-orbital]')
      .forEach((btn) => {
        btn.addEventListener('click', () => {
          const structId = btn.dataset.cancelOrbital;
          if (!structId) return;
          const res = simAdapter.submitPlayerCommand({
            type: 'CANCEL_ORBITAL_STRUCTURE',
            playerId,
            structureId: structId,
          });
          statusBannerMessage = res.ok
            ? 'Cancelled orbital construction — 100% resources refunded.'
            : `Cannot cancel: ${res.reason}`;
          renderEconomyBar();
          renderMainPanel();
        });
      });

    mainBodyEl
      .querySelectorAll<HTMLButtonElement>('[data-decommission-orbital]')
      .forEach((btn) => {
        btn.addEventListener('click', () => {
          const structId = btn.dataset.decommissionOrbital;
          if (!structId) return;
          const res = simAdapter.submitPlayerCommand({
            type: 'DECOMMISSION_ORBITAL_STRUCTURE',
            playerId,
            structureId: structId,
          });
          statusBannerMessage = res.ok
            ? 'Decommissioned orbital platform — slots reclaimed and 50% salvage refunded.'
            : `Cannot decommission: ${res.reason}`;
          renderEconomyBar();
          renderMainPanel();
        });
      });

    mainBodyEl
      .querySelectorAll<HTMLButtonElement>('[data-cancel-queue]')
      .forEach((btn) => {
        btn.addEventListener('click', () => {
          const queueItemId = btn.dataset.cancelQueue;
          const structId = btn.dataset.cancelStruct;
          if (!queueItemId || !structId) {
            return;
          }
          const res = simAdapter.submitPlayerCommand({
            type: 'CANCEL_QUEUED_SHIP',
            playerId,
            structureId: structId,
            queueItemId,
          });
          statusBannerMessage = res.ok
            ? 'Cancelled ship build order — resources and supply refunded.'
            : `Cannot cancel: ${res.reason}`;
          renderEconomyBar();
          renderMainPanel();
        });
      });

    mainBodyEl
      .querySelectorAll<HTMLButtonElement>('[data-toggle-dockyard-fleet-building]')
      .forEach((btn) => {
        btn.addEventListener('click', () => {
          const dockyardId = btn.dataset.toggleDockyardFleetBuilding;
          if (!dockyardId) return;
          const found = sim.getStructureById(dockyardId);
          if (!found) return;
          const nextEnabled = found.structure.fleetProductionEnabled === false;
          const res = simAdapter.submitPlayerCommand({
            type: 'SET_DOCKYARD_FLEET_BUILDING',
            playerId,
            dockyardId,
            enabled: nextEnabled,
          });
          statusBannerMessage = res.ok
            ? nextEnabled
              ? 'Orbital Dockyard enabled for Fleet building.'
              : 'Orbital Dockyard paused for Fleet building.'
            : `Cannot update Dockyard: ${res.reason}`;
          renderMainPanel();
        });
      });

    regions.leftOutliner
      .querySelector<HTMLButtonElement>('[data-action="cancel-fleet-order"]')
      ?.addEventListener('click', () => {
        sceneManager.cancelFleetOrderPlacement();
        statusBannerMessage = 'Cancelled fleet order placement.';
        renderMainPanel();
      });

    mainBodyEl
      .querySelectorAll<HTMLButtonElement>('[data-toggle-section]')
      .forEach((btn) => {
        btn.addEventListener('click', () => {
          const sectionId = btn.dataset.toggleSection;
          if (!isHudSectionId(sectionId)) {
            return;
          }
          collapsedSections = toggleHudSection(collapsedSections, sectionId);
          renderMainPanel();
        });
      });

    mainBodyEl
      .querySelectorAll<HTMLButtonElement>('[data-sim-inc]')
      .forEach((btn) => {
        btn.addEventListener('click', () => {
          const cls = btn.dataset.simInc as CombatShipClassId | undefined;
          const side = btn.dataset.simSide;
          if (!cls || !side) return;
          const map = side === 'friendly' ? battleSimFriendly : battleSimHostile;
          map[cls] = Math.min(20, map[cls] + 1);
          renderMainPanel();
        });
      });

    mainBodyEl
      .querySelectorAll<HTMLButtonElement>('[data-sim-dec]')
      .forEach((btn) => {
        btn.addEventListener('click', () => {
          const cls = btn.dataset.simDec as CombatShipClassId | undefined;
          const side = btn.dataset.simSide;
          if (!cls || !side) return;
          const map = side === 'friendly' ? battleSimFriendly : battleSimHostile;
          map[cls] = Math.max(0, map[cls] - 1);
          renderMainPanel();
        });
      });

    mainBodyEl
      .querySelector<HTMLButtonElement>('[data-action="launch-battle-sim"]')
      ?.addEventListener('click', () => {
        if (!hasBattleSimulator(sim)) {
          statusBannerMessage = 'Battle Simulator is only available in local single-player mode.';
          renderMainPanel();
          return;
        }
        const res = sim.launchFleetBattleSimulator(
          battleSimFriendly,
          battleSimHostile,
        );
        sceneManager.loadSystem(res.systemId);
        sceneManager.focusWorldPoint(res.center.x, res.center.z, 280);
        collapsedSections = { ...collapsedSections, battle_sim: false };
        statusBannerMessage = `Void Battle Simulator launched: ${res.friendlySpawned} Friendly vs ${res.hostileSpawned} Hostile ships!`;
        renderMainPanel();
      });

    mainBodyEl
      .querySelector<HTMLButtonElement>('[data-action="clear-battle-sim"]')
      ?.addEventListener('click', () => {
        if (!hasBattleSimulator(sim)) {
          return;
        }
        const removed = sim.clearBattleSimulatorShips();
        statusBannerMessage = `Ended Battle Simulator and cleared ${removed} ship${removed === 1 ? '' : 's'}.`;
        renderMainPanel();
      });

    mainBodyEl
      .querySelector<HTMLButtonElement>('[data-action="exit-battle-sim"]')
      ?.addEventListener('click', () => {
        if (options?.onQuitToMainMenu) {
          options.onQuitToMainMenu();
          return;
        }
        sceneManager.loadSystem(sceneManager.getLastMatchSystemId());
        renderMainPanel();
      });

    mainBodyEl
      .querySelector<HTMLButtonElement>('[data-action="dismiss-battle-stats"]')
      ?.addEventListener('click', () => {
        if (!hasBattleSimulator(sim)) {
          return;
        }
        sim.dismissBattleSimulatorStats();
        renderMainPanel();
      });

    regions.leftOutliner
      .querySelector<HTMLButtonElement>('[data-action="create-fleet"]')
      ?.addEventListener('click', () => {
        sceneManager.startCreateFleetPlacement(selectedFleetStance, true);
        statusBannerMessage =
          'Click any point in 3D space (in any star system) to place the new Fleet Rally Point (Esc to cancel).';
        renderMainPanel();
      });

    regions.leftOutliner
      .querySelectorAll<HTMLButtonElement>('[data-select-fleet]')
      .forEach((btn) => {
        btn.addEventListener('click', () => {
          const fId = btn.dataset.selectFleet ?? null;
          if (fId) {
            sceneManager.focusFleet(fId);
          } else {
            sceneManager.selectFleet(null);
          }
          renderMainPanel();
        });
      });

    mainBodyEl
      .querySelectorAll<HTMLButtonElement>('[data-fleet-focus]')
      .forEach((btn) => {
        btn.addEventListener('click', () => {
          const fId = btn.dataset.fleetFocus;
          if (fId) {
            sceneManager.focusFleet(fId);
            renderMainPanel();
          }
        });
      });

    mainBodyEl
      .querySelectorAll<HTMLButtonElement>('[data-fleet-inc]')
      .forEach((btn) => {
        btn.addEventListener('click', () => {
          const hull = btn.dataset.fleetInc as FleetHullClassId | undefined;
          const fId = btn.dataset.fleetId;
          if (!hull || !fId) return;
          const fleet = sim.getFleetById(fId);
          if (!fleet) return;
          simAdapter.submitPlayerCommand({
            type: 'UPDATE_FLEET_TEMPLATE',
            playerId,
            fleetId: fId,
            desiredCounts: { [hull]: fleet.desiredCounts[hull] + 1 },
          });
          renderMainPanel();
        });
      });

    mainBodyEl
      .querySelectorAll<HTMLButtonElement>('[data-fleet-dec]')
      .forEach((btn) => {
        btn.addEventListener('click', () => {
          const hull = btn.dataset.fleetDec as FleetHullClassId | undefined;
          const fId = btn.dataset.fleetId;
          if (!hull || !fId) return;
          const fleet = sim.getFleetById(fId);
          if (!fleet) return;
          simAdapter.submitPlayerCommand({
            type: 'UPDATE_FLEET_TEMPLATE',
            playerId,
            fleetId: fId,
            desiredCounts: { [hull]: Math.max(0, fleet.desiredCounts[hull] - 1) },
          });
          renderMainPanel();
        });
      });

    mainBodyEl
      .querySelectorAll<HTMLButtonElement>('[data-fleet-resupply]')
      .forEach((btn) => {
        btn.addEventListener('click', () => {
          const fId = btn.dataset.fleetResupply;
          if (!fId) return;
          const fleet = sim.getFleetById(fId);
          if (!fleet) return;
          simAdapter.submitPlayerCommand({
            type: 'SET_FLEET_RESUPPLY',
            playerId,
            fleetId: fId,
            autoResupply: !fleet.autoResupply,
          });
          renderMainPanel();
        });
      });

    mainBodyEl
      .querySelectorAll<HTMLButtonElement>('[data-fleet-stance]')
      .forEach((btn) => {
        btn.addEventListener('click', () => {
          const stance = btn.dataset.fleetStance as FleetStance | undefined;
          const fId = btn.dataset.fleetId;
          if (!stance || !fId) return;
          simAdapter.submitPlayerCommand({
            type: 'SET_FLEET_STANCE',
            playerId,
            fleetId: fId,
            stance,
          });
          renderMainPanel();
        });
      });

    mainBodyEl
      .querySelectorAll<HTMLButtonElement>('[data-fleet-patrol]')
      .forEach((btn) => {
        btn.addEventListener('click', () => {
          const fId = btn.dataset.fleetPatrol;
          if (!fId) return;
          sceneManager.startFleetPatrolPlacement(fId);
          statusBannerMessage =
            'Click 2 points in 3D space to set the Fleet Patrol Route (Esc to cancel).';
          renderMainPanel();
        });
      });

    mainBodyEl
      .querySelectorAll<HTMLButtonElement>('[data-fleet-flee]')
      .forEach((btn) => {
        btn.addEventListener('click', () => {
          const fId = btn.dataset.fleetFlee;
          if (!fId) return;
          const res = simAdapter.submitPlayerCommand({
            type: 'ORDER_FLEET_FLEE',
            playerId,
            fleetId: fId,
          });
          statusBannerMessage = res.ok
            ? 'Fleet ordered to flee at maximum speed to nearest friendly sanctuary!'
            : `Cannot flee: ${res.reason}`;
          renderMainPanel();
        });
      });

    mainBodyEl
      .querySelectorAll<HTMLButtonElement>('[data-fleet-split]')
      .forEach((btn) => {
        btn.addEventListener('click', () => {
          const fId = btn.dataset.fleetSplit;
          if (!fId) return;
          const res = simAdapter.submitPlayerCommand({
            type: 'SPLIT_FLEET',
            playerId,
            sourceFleetId: fId,
          });
          statusBannerMessage = res.ok
            ? 'Split ships into a new Fleet.'
            : `Cannot split fleet: ${res.reason}`;
          renderMainPanel();
        });
      });

    mainBodyEl
      .querySelectorAll<HTMLButtonElement>('[data-fleet-merge-src]')
      .forEach((btn) => {
        btn.addEventListener('click', () => {
          const src = btn.dataset.fleetMergeSrc;
          const dst = btn.dataset.fleetMergeDst;
          if (!src || !dst) return;
          const res = simAdapter.submitPlayerCommand({
            type: 'MERGE_FLEETS',
            playerId,
            sourceFleetId: src,
            targetFleetId: dst,
          });
          if (res.ok) {
            sceneManager.selectFleet(dst);
          }
          statusBannerMessage = res.ok
            ? 'Merged fleets.'
            : `Cannot merge fleets: ${res.reason}`;
          renderMainPanel();
        });
      });

    mainBodyEl
      .querySelectorAll<HTMLButtonElement>('[data-fleet-disband]')
      .forEach((btn) => {
        btn.addEventListener('click', () => {
          const fId = btn.dataset.fleetDisband;
          if (!fId) return;
          const res = simAdapter.submitPlayerCommand({
            type: 'DISBAND_FLEET',
            playerId,
            fleetId: fId,
          });
          if (res.ok) {
            sceneManager.selectFleet(null);
          }
          statusBannerMessage = res.ok
            ? 'Disbanded fleet and refunded queued replacements.'
            : `Cannot disband fleet: ${res.reason}`;
          renderEconomyBar();
          renderMainPanel();
        });
      });

    mainBodyEl
      .querySelectorAll<HTMLButtonElement>('[data-place-deepspace]')
      .forEach((btn) => {
        btn.addEventListener('click', () => {
          const dsId = btn.dataset.placeDeepspace as DeepSpaceStructureId | undefined;
          if (!dsId) {
            return;
          }
          const current = sceneManager.getPendingDeepSpacePlacement();
          if (current === dsId) {
            sceneManager.startDeepSpacePlacement(null);
            statusBannerMessage = 'Cancelled deep-space placement mode.';
          } else {
            sceneManager.startDeepSpacePlacement(dsId);
            const cfg = DEEP_SPACE_STRUCTURES[dsId];
            statusBannerMessage = `Placement active: click any free location in 3D space to deploy ${cfg.displayName} (press Esc to cancel).`;
          }
          renderMainPanel();
        });
      });

    mainBodyEl
      .querySelector<HTMLButtonElement>('[data-action="cancel-deepspace"]')
      ?.addEventListener('click', () => {
        sceneManager.startDeepSpacePlacement(null);
        statusBannerMessage = 'Cancelled deep-space placement mode.';
        renderMainPanel();
      });

    mainBodyEl
      .querySelectorAll<HTMLButtonElement>('[data-focus-deepspace]')
      .forEach((btn) => {
        btn.addEventListener('click', () => {
          const dsId = btn.dataset.focusDeepspace;
          if (dsId) {
            sceneManager.focusDeepSpaceStructure(dsId);
            renderMainPanel();
          }
        });
      });

    tutorialController.applyCurrentHighlight(
      sim,
      playerId,
      buildTutorialUiContext(),
    );
  }

  sceneManager.onSelectionChange(() => {
    renderHarvesterInspector();
    renderMainPanel();
  });

  sceneManager.onDeepSpacePlacementResult((message) => {
    statusBannerMessage = message;
    renderEconomyBar();
    renderMainPanel();
  });

  renderEconomyBar();
  renderHarvesterInspector();
  renderMainPanel();
  tutorialController.sync(sim, playerId, buildTutorialUiContext());

  function patchMainPanelLiveTelemetry(): void {
    syncSimRefs();
    const activeSystem = sceneManager.getActiveSystem();
    const systemView = sim.getPlayerSystemView(playerId, activeSystem.id);
    const selectedPlanetView = systemView.planets.find(
      (p) => p.planet.id === sceneManager.getSelectedPlanetId(),
    );

    // 1. System resource reserves
    const sysRes = systemView.resourceSummary;
    const oreResEl = regions.leftOutliner.querySelector<HTMLElement>(
      '[data-hud-field="system-reserves-ore"]',
    );
    const crystalResEl = regions.leftOutliner.querySelector<HTMLElement>(
      '[data-hud-field="system-reserves-crystal"]',
    );
    const innerResEl = regions.leftOutliner.querySelector<HTMLElement>(
      '[data-hud-field="system-reserves-inner"]',
    );
    if (!sysRes) {
      if (oreResEl) oreResEl.textContent = 'Unknown (Unscanned)';
      if (crystalResEl) crystalResEl.textContent = '';
      if (innerResEl) innerResEl.textContent = '';
    } else {
      const innerPct =
        sysRes.innerBeltInitial > 0
          ? Math.round((sysRes.innerBeltRemaining / sysRes.innerBeltInitial) * 100)
          : 0;
      if (oreResEl) oreResEl.textContent = `${sysRes.remainingOre}/${sysRes.initialOre} Ore`;
      if (crystalResEl) {
        crystalResEl.textContent = `${sysRes.remainingCrystal}/${sysRes.initialCrystal} Crystal`;
      }
      if (innerResEl) innerResEl.textContent = `(Inner Belt: ${innerPct}%)`;
    }

    const selectedStructures = selectedPlanetView?.structures ?? [];

    for (const item of selectedStructures) {
      if (item.kind !== 'live') {
        continue;
      }
      const s = item.structure;
      const pctText = s.isComplete
        ? 'Ready'
        : `${Math.floor((s.buildProgressSeconds / Math.max(1, s.totalBuildTimeSeconds)) * 100)}%`;
      for (const slotIdx of s.occupiedSlots) {
        const slotPctEl = mainBodyEl.querySelector<HTMLElement>(
          `[data-slot-pct="${slotIdx}"]`,
        );
        if (slotPctEl) slotPctEl.textContent = pctText;
      }
    }

    // 3. Selected structure status (construction countdown or live dock counts), queue timers & assigned Harvesters
    const selectedItem = selectedStructures.find((item) =>
      getProjectedOrbitalData(item).occupiedSlots.includes(selectedSlotIndex),
    );
    if (selectedItem?.kind === 'ghost') {
      const ageEl = mainBodyEl.querySelector<HTMLElement>(
        '[data-hud-field="intel-age"]',
      );
      if (ageEl) {
        ageEl.textContent = formatIntelAge(
          sim.elapsedSeconds - selectedItem.observedAtSeconds,
        );
      }
    } else if (!selectedItem && selectedPlanetView?.visibility === 'last_known') {
      const ageEl = mainBodyEl.querySelector<HTMLElement>(
        '[data-hud-field="intel-age"]',
      );
      if (ageEl && selectedPlanetView.observedAtSeconds !== null) {
        ageEl.textContent = formatIntelAge(
          sim.elapsedSeconds - selectedPlanetView.observedAtSeconds,
        );
      }
    } else if (selectedItem?.kind === 'live') {
      const selectedStruct = selectedItem.structure;
      const isDropoffPlatform =
        selectedStruct.isComplete &&
        selectedStruct.ownerId === playerId &&
        (selectedStruct.structureId === 'refinery' ||
          selectedStruct.structureId === 'command_and_control');
      const statusEl = mainBodyEl.querySelector<HTMLElement>(
        '[data-hud-field="struct-status"]',
      );
      if (statusEl) {
        if (!selectedStruct.isComplete) {
          statusEl.textContent = `Constructing (${Math.ceil(selectedStruct.totalBuildTimeSeconds - selectedStruct.buildProgressSeconds)}s left)`;
        } else if (isDropoffPlatform) {
          const unloadRate = sim.getPlatformUnloadRatePerSecond(selectedStruct);
          const unloadRateLabel = Number.isInteger(unloadRate)
            ? `${unloadRate}`
            : unloadRate.toFixed(1);
          const maxDocks = sim.getMaxConcurrentDocks(selectedStruct);
          statusEl.textContent = `Unload: ${unloadRateLabel}/s • Docks: ${selectedStruct.activeDockingHarvesterIds.length}/${maxDocks} (Queued: ${selectedStruct.queuedDockingHarvesterIds.length})`;
        } else {
          statusEl.textContent = 'Operational';
        }
      }

      selectedStruct.productionQueue.forEach((item, idx) => {
        const labelEl = mainBodyEl.querySelector<HTMLElement>(
          `[data-queue-label="${item.id}"]`,
        );
        if (labelEl) {
          const shipCfg = SHIP_CLASSES[item.shipClassId];
          const rem = Math.max(
            0,
            Math.ceil(item.buildTimeSeconds - item.progressSeconds),
          );
          const repeatTag = item.autoRepeat ? ' ↻' : '';
          labelEl.textContent =
            idx === 0
              ? `${shipCfg.displayName} (${rem}s)${repeatTag}`
              : `${shipCfg.displayName} #${idx + 1}${repeatTag}`;
        }
      });

      if (
        selectedStruct.isComplete &&
        selectedStruct.ownerId === playerId &&
        selectedStruct.structureId === 'command_and_control'
      ) {
        const noticeEl = mainBodyEl.querySelector<HTMLElement>(
          '[data-hud-field="emergency-harvester-notice"]',
        );
        const secsEl = mainBodyEl.querySelector<HTMLElement>(
          '[data-hud-field="emergency-harvester-secs"]',
        );
        const timer = sim.getPlayerState(playerId).emergencyHarvesterTimerSeconds;
        if (noticeEl) {
          noticeEl.style.display = timer > 0 ? 'block' : 'none';
        }
        if (secsEl && timer > 0) {
          secsEl.textContent = `${Math.max(1, Math.ceil(CNC_EMERGENCY_HARVESTER_REBUILD_SECONDS - timer))}s`;
        }
      }

      if (isDropoffPlatform) {
        const assignedHarvesters = getVisibleHarvesters(sim, playerId).filter(
          (h) => h.ownerId === playerId && h.homeStructureId === selectedStruct.id,
        );
        for (const h of assignedHarvesters) {
          const badgeEl = mainBodyEl.querySelector<HTMLElement>(
            `[data-harvester-badge="${h.id}"]`,
          );
          if (badgeEl) {
            const pct = Math.round((h.cargoAmount / Math.max(1, h.cargoCapacity)) * 100);
            badgeEl.textContent = `${h.cargoType.toUpperCase()} ${pct}%`;
          }
        }
      }
    }

    // 4. Deep-space installation construction percentages
    for (const item of systemView.deepSpaceStructures) {
      const ds = item.kind === 'live' ? item.structure : item;
      const badgeEl = mainBodyEl.querySelector<HTMLElement>(
        `[data-deepspace-badge="${ds.id}"]`,
      );
      if (badgeEl) {
        badgeEl.textContent =
          item.kind === 'ghost'
            ? `LAST KNOWN (${formatIntelAge(sim.elapsedSeconds - item.observedAtSeconds)})`
            : ds.isComplete
              ? 'Operational'
              : `${Math.floor((ds.buildProgressSeconds / Math.max(1, ds.totalBuildTimeSeconds)) * 100)}%`;
      }
    }
  }

  const pollIntervalId = window.setInterval(() => {
    renderEconomyBar();
    renderHarvesterInspector();
    const nextSignature = getCurrentMainPanelSignature();
    if (nextSignature !== lastMainPanelSignature) {
      renderMainPanel();
    } else {
      patchMainPanelLiveTelemetry();
    }
    tutorialController.sync(sim, playerId, buildTutorialUiContext());
  }, 250);

  return {
    dispose: () => {
      window.clearInterval(pollIntervalId);
      tutorialController.dispose();
      tutorialHostEl.remove();
      container.innerHTML = '';
    },
  };
}
