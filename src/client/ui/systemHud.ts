import {
  DEEP_SPACE_STRUCTURES,
  MATCH_PRESETS,
  ORBITAL_STRUCTURES,
  PLANET_CLASSES,
  SHIP_CLASSES,
  type CombatShipClassId,
  type DeepSpaceStructureId,
  type OrbitalStructureId,
} from '../../shared/config/index.ts';
import type {
  FleetHullClassId,
  FleetStance,
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
import type { AmbientMusicPlayer } from '../audio/ambientMusicPlayer.ts';
import { FACTION_PALETTES } from '../renderer/factionColors.ts';
import type { SystemSceneManager } from '../renderer/systemSceneManager.ts';
import { NEBULA_PALETTES } from '../shaders/nebulaShaders.ts';
import {
  LobbyController,
  formatMatchClockSeconds,
} from './lobbyController.ts';

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

export type HudSectionId =
  | 'galaxy'
  | 'fleet'
  | 'battle_sim'
  | 'planets_wormholes'
  | 'deep_space'
  | 'orbital_ring';

export type HudCollapsedState = Record<HudSectionId, boolean>;

const HUD_SECTION_IDS: readonly HudSectionId[] = [
  'galaxy',
  'fleet',
  'battle_sim',
  'planets_wormholes',
  'deep_space',
  'orbital_ring',
];

export function createDefaultHudCollapsedState(): HudCollapsedState {
  return {
    galaxy: false,
    fleet: false,
    battle_sim: true,
    planets_wormholes: false,
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
  readonly activeSystemId: string;
  readonly selectedPlanetId: string;
  readonly selectedSlotIndex: number;
  readonly selectedHarvesterId: string | null;
  readonly pendingDeepSpace: DeepSpaceStructureId | null;
  readonly statusBannerMessage: string;
  readonly wormholeStates: readonly { readonly id: string; readonly isOpen: boolean }[];
}

/**
 * Computes a deterministic structural snapshot signature for the main tactical HUD panel.
 * Only structural transitions (selection, ownership, build completion, queue membership,
 * assigned Harvester membership, deep-space completion, wormhole state) change this signature.
 * Continuous progress bars, percentages, timers, dock counts, and reserves are patched in-place
 * via `textContent` so DOM buttons are never destroyed or recreated while the player clicks/hovers.
 */
export function computeMainPanelSignature(
  sim: GameSimulation,
  params: MainPanelSignatureParams,
): string {
  const planets = sim.getPlanetsInSystem(params.activeSystemId);
  const planetSummarySig = planets
    .map((p) => {
      const usedSlots = p.structures.reduce((acc, s) => acc + s.occupiedSlots.length, 0);
      return `${p.planet.id}:${p.ownerId ?? 'none'}:${usedSlots}`;
    })
    .join(',');

  const selectedPlanetState = sim.getPlanetState(params.selectedPlanetId);
  const structSig = selectedPlanetState.structures
    .map((s) => {
      const queueIds = s.productionQueue.map((q) => q.id).join(',');
      const rallySig = s.rallyPoint
        ? `${s.rallyPoint.systemId}:${Math.round(s.rallyPoint.position.x)},${Math.round(s.rallyPoint.position.z)}`
        : 'none';
      const patrolSig = `${s.patrolWaypoints?.length ?? 0}`;
      const fleetBuildSig = s.fleetProductionEnabled === false ? 0 : 1;
      return `${s.id}:${s.isComplete ? 1 : 0}:${s.targetResource}:${s.fleetStance ?? 'default'}:${rallySig}:${patrolSig}:${fleetBuildSig}:${queueIds}`;
    })
    .join(';');

  const selectedStruct = selectedPlanetState.structures.find((s) =>
    s.occupiedSlots.includes(params.selectedSlotIndex),
  );
  const assignedHarvesterSig = selectedStruct
    ? sim
        .getAllHarvesters()
        .filter((h) => h.homeStructureId === selectedStruct.id)
        .map((h) => h.id)
        .join(',')
    : 'none';
  const assignedCombatShipSig = selectedStruct
    ? sim
        .getAllCombatShips()
        .filter((c) => c.homeDockyardId === selectedStruct.id)
        .map((c) => c.id)
        .join(',')
    : 'none';

  const deepSpaceSig = sim
    .getDeepSpaceStructuresInSystem(params.activeSystemId)
    .map((ds) => `${ds.id}:${ds.isComplete ? 1 : 0}`)
    .join(';');

  const wormholeSig = params.wormholeStates
    .map((wh) => `${wh.id}:${wh.isOpen ? 1 : 0}`)
    .join(',');

  const fleetSig = sim
    .getAllFleets()
    .map((f) => {
      const counts = SMALLEST_FIRST_FLEET_HULLS.map((h) => f.desiredCounts[h]).join('/');
      const live = sim.getShipsInFleet(f.id).length;
      return `${f.id}:${f.stance}:${f.autoResupply ? 1 : 0}:${f.orderType}:${f.orderSystemId}:${Math.round(f.orderPosition.x)},${Math.round(f.orderPosition.z)}:${live}:${counts}`;
    })
    .join(';');

  const simStats = sim.getBattleSimulatorStats();
  const battleSimSig = simStats
    ? `${simStats.status}:${simStats.friendly.survivingShips}/${simStats.friendly.startedShips}:${simStats.hostile.survivingShips}/${simStats.hostile.startedShips}`
    : 'none';

  return [
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

const SPEAKER_UNMUTED_SVG = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path><path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path></svg>`;

const SPEAKER_MUTED_SVG = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><line x1="23" y1="9" x2="17" y2="15"></line><line x1="17" y1="9" x2="23" y2="15"></line></svg>`;

export function mountSystemHud(
  container: HTMLElement,
  galaxy: GalaxyTopology,
  sceneManager: SystemSceneManager,
  musicPlayer?: AmbientMusicPlayer,
): void {
  const simAdapter = sceneManager.simAdapter;
  let sim = simAdapter.simulation;
  let playerId = simAdapter.localPlayerId;

  function syncSimRefs(): void {
    sim = simAdapter.simulation;
    playerId = simAdapter.localPlayerId;
  }

  let selectedSlotIndex = 2;
  let statusBannerMessage = '';
  let crossSystemMiningEnabled = false;
  let selectedFleetStance: FleetStance = 'aggressive';
  let collapsedSections = createDefaultHudCollapsedState();
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

  const topBarEl = document.createElement('div');
  topBarEl.className = 'hud-econ-bar';
  const lobbyHostEl = document.createElement('div');
  const mainBodyEl = document.createElement('div');
  mainBodyEl.className = 'hud-main-body';
  const harvesterInspectorEl = document.createElement('div');
  harvesterInspectorEl.className = 'hud-harvester-inspector';
  container.innerHTML = '';
  container.append(topBarEl, lobbyHostEl, harvesterInspectorEl, mainBodyEl);

  topBarEl.innerHTML = `
    <div class="econ-metrics">
      <div class="econ-pill ore">
        <span class="econ-label">ORE</span>
        <strong id="econ-ore-val">0</strong>
      </div>
      <div class="econ-pill crystal">
        <span class="econ-label">CRYSTAL</span>
        <strong id="econ-crystal-val">0</strong>
      </div>
      <div class="econ-pill supply">
        <span class="econ-label">SUPPLY</span>
        <strong id="econ-supply-val">0 / 0</strong>
      </div>
      <div class="econ-pill harvesters">
        <span class="econ-label">HARVESTERS</span>
        <strong id="econ-harvesters-val">0</strong>
      </div>
      <div class="econ-pill" id="hud-match-status-pill" title="Active Match Contenders & Victory Telemetry">
        <span class="econ-label">MATCH</span>
        <strong id="hud-match-status-val">4 Contenders</strong>
      </div>
    </div>
    <div class="econ-actions">
      <button class="hud-btn" data-action="toggle-lobby" title="Configure Match Mode, Human/AI Slots & Victory Conditions">
        <span>Match Lobby</span>
        <span class="hud-badge" id="hud-lobby-preset-badge">Standard Tactical</span>
      </button>
      <button class="hud-btn" data-action="toggle-hub-mining" title="Send Harvesters through the Wormhole to mine the Central Nexus">
        Mining: Local System
      </button>
      <button class="hud-btn" data-speed="1">1x</button>
      <button class="hud-btn" data-speed="2">2x</button>
      <button class="hud-btn" data-speed="4">4x</button>
      <button class="hud-btn" data-action="toggle-music" aria-label="Mute ambient music" title="Mute ambient music" style="display: inline-flex; align-items: center; justify-content: center; padding: 4px 8px;">
        ${SPEAKER_UNMUTED_SVG}
      </button>
    </div>
  `;

  const econOreEl = topBarEl.querySelector<HTMLElement>('#econ-ore-val');
  const econCrystalEl = topBarEl.querySelector<HTMLElement>('#econ-crystal-val');
  const econSupplyEl = topBarEl.querySelector<HTMLElement>('#econ-supply-val');
  const econHarvestersEl = topBarEl.querySelector<HTMLElement>('#econ-harvesters-val');
  const matchStatusValEl = topBarEl.querySelector<HTMLElement>('#hud-match-status-val');
  const lobbyPresetBadgeEl = topBarEl.querySelector<HTMLElement>('#hud-lobby-preset-badge');
  const lobbyToggleBtnEl = topBarEl.querySelector<HTMLButtonElement>(
    '[data-action="toggle-lobby"]',
  );
  const hubMiningBtnEl = topBarEl.querySelector<HTMLButtonElement>(
    '[data-action="toggle-hub-mining"]',
  );
  const musicToggleBtnEl = topBarEl.querySelector<HTMLButtonElement>(
    '[data-action="toggle-music"]',
  );
  const speedBtnEls = Array.from(
    topBarEl.querySelectorAll<HTMLButtonElement>('[data-speed]'),
  );

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
      renderEconomyBar();
      renderHarvesterInspector();
      renderMainPanel();
    },
    onOpenStateChange: () => {
      renderEconomyBar();
    },
  });

  lobbyToggleBtnEl?.addEventListener('click', () => {
    lobbyController.toggleLobby();
  });

  hubMiningBtnEl?.addEventListener('click', () => {
    syncSimRefs();
    crossSystemMiningEnabled = !crossSystemMiningEnabled;
    sim.setPlayerHarvestersCrossSystemMining(playerId, crossSystemMiningEnabled);
    renderEconomyBar();
  });

  musicToggleBtnEl?.addEventListener('click', () => {
    musicPlayer?.toggleMute();
    renderEconomyBar();
  });

  for (const btn of speedBtnEls) {
    btn.addEventListener('click', () => {
      const spd = Number(btn.dataset.speed ?? '1');
      simAdapter.simSpeedMultiplier = spd;
      renderEconomyBar();
    });
  }

  let lastRenderedMusicMuted: boolean | null = null;

  function renderEconomyBar(): void {
    syncSimRefs();
    const pState = sim.getPlayerState(playerId);
    const playerHarvesters = sim
      .getAllHarvesters()
      .filter((h) => h.ownerId === playerId);
    const outcome = sim.getMatchOutcome();
    const presetCfg = MATCH_PRESETS[sim.presetId];
    const survivingCount =
      outcome.activeContenderIds.length - outcome.defeatedPlayerIds.length;

    if (econOreEl) econOreEl.textContent = `${pState.ore}`;
    if (econCrystalEl) econCrystalEl.textContent = `${pState.crystal}`;
    if (econSupplyEl) econSupplyEl.textContent = `${pState.supplyUsed} / ${pState.supplyCap}`;
    if (econHarvestersEl) econHarvestersEl.textContent = `${playerHarvesters.length}`;
    if (lobbyPresetBadgeEl) {
      lobbyPresetBadgeEl.textContent = presetCfg.displayName;
    }
    if (lobbyToggleBtnEl) {
      lobbyToggleBtnEl.classList.toggle('active', lobbyController.isLobbyOpen());
    }
    if (matchStatusValEl) {
      if (outcome.status === 'victory') {
        matchStatusValEl.textContent = 'VICTORY';
        matchStatusValEl.style.color = '#22c55e';
      } else if (outcome.status === 'defeat') {
        matchStatusValEl.textContent = 'DEFEAT';
        matchStatusValEl.style.color = '#ef4444';
      } else if (
        outcome.kingOfTheHill.enabled &&
        outcome.kingOfTheHill.controllerId &&
        outcome.kingOfTheHill.remainingSeconds !== null
      ) {
        matchStatusValEl.textContent = `KOTH ${formatMatchClockSeconds(outcome.kingOfTheHill.remainingSeconds)}`;
        matchStatusValEl.style.color = outcome.kingOfTheHill.isContested
          ? '#f87171'
          : '#fcd34d';
      } else {
        matchStatusValEl.textContent = `${survivingCount}/${outcome.activeContenderIds.length} C&C`;
        matchStatusValEl.style.color = '#7dd3fc';
      }
    }
    if (hubMiningBtnEl) {
      hubMiningBtnEl.classList.toggle('active', crossSystemMiningEnabled);
      hubMiningBtnEl.textContent = crossSystemMiningEnabled
        ? 'Mining: Central Hub'
        : 'Mining: Local System';
    }
    if (musicToggleBtnEl) {
      const isMuted = musicPlayer ? musicPlayer.isMuted() : true;
      if (isMuted !== lastRenderedMusicMuted) {
        lastRenderedMusicMuted = isMuted;
        musicToggleBtnEl.classList.toggle('active', !isMuted);
        musicToggleBtnEl.innerHTML = isMuted ? SPEAKER_MUTED_SVG : SPEAKER_UNMUTED_SVG;
        const label = isMuted
          ? 'Unmute ambient music (restarts from beginning)'
          : 'Mute ambient music';
        musicToggleBtnEl.setAttribute('aria-label', label);
        musicToggleBtnEl.title = label;
      }
    }
    for (const btn of speedBtnEls) {
      const spd = Number(btn.dataset.speed ?? '1');
      btn.classList.toggle('active', simAdapter.simSpeedMultiplier === spd);
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

  let lastMainPanelSignature = '';

  function getCurrentMainPanelSignature(): string {
    syncSimRefs();
    return computeMainPanelSignature(sim, {
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
    const paletteInfo = NEBULA_PALETTES[activeSystem.nebulaPalette];
    const selectedPlanetId = sceneManager.getSelectedPlanetId();
    const selectedPlanetState = sim.getPlanetState(selectedPlanetId);
    const totalSlots = selectedPlanetState.planet.orbitalSlots;

    if (selectedSlotIndex >= totalSlots) {
      selectedSlotIndex = 0;
    }

    lastMainPanelSignature = getCurrentMainPanelSignature();

    const systemButtonsHtml = galaxy.systems
      .map((sys) => {
        const isActive = sys.id === activeSystem.id;
        const badgeText = sys.isCentralHub
          ? '12-Slot Hub • 1.6x Yield'
          : 'Ore Heavy • Scarce Crystal';
        return `<button class="hud-btn ${isActive ? 'active' : ''}" data-system-id="${sys.id}">
          ${sys.name}
          <span class="hud-badge">${badgeText}</span>
        </button>`;
      })
      .join('');

    const planetButtonsHtml = activeSystem.planets
      .map((planet) => {
        const pState = sim.getPlanetState(planet.id);
        const pClass = PLANET_CLASSES[planet.planetClass];
        const isSelected =
          planet.id === selectedPlanetId &&
          sceneManager.getSelectedHarvesterId() === null;
        const usedSlots = pState.structures.reduce(
          (acc, s) => acc + s.occupiedSlots.length,
          0,
        );
        const ownerBadge =
          pState.ownerId === playerId
            ? 'OWNED'
            : pState.ownerId === null
              ? 'UNCLAIMED'
              : pState.ownerId.toUpperCase();
        return `<button class="hud-planet-card ${isSelected ? 'selected' : ''}" data-planet-id="${planet.id}">
          <div class="planet-card-title">${planet.name} <span class="hud-badge">${ownerBadge}</span></div>
          <div class="planet-card-meta">${pClass.displayName} • <strong>${usedSlots}/${planet.orbitalSlots} Slots</strong></div>
        </button>`;
      })
      .join('');

    const wormholesHtml = sceneManager
      .getActiveWormholes()
      .map((wh) => {
        const destSys = galaxy.systems.find((s) => s.id === wh.destinationSystemId);
        const destName = destSys?.name ?? wh.destinationSystemId;
        const isOpen = wh.isOpen();
        return `<button class="hud-btn ${isOpen ? 'active' : ''}" data-wormhole-id="${wh.wormholeId}" title="Click to focus • Double-click to transit camera • Right-click with Fleet selected to transit fleet">
          Gateway → ${destName}
          <span class="hud-badge">${isOpen ? 'OPEN VORTEX' : 'DORMANT'}</span>
        </button>`;
      })
      .join('');

    const slotButtonsHtml = Array.from({ length: totalSlots }, (_, idx) => {
      const occupyingStruct = selectedPlanetState.structures.find((s) =>
        s.occupiedSlots.includes(idx),
      );
      const isSelectedSlot = idx === selectedSlotIndex;
      let label = `Slot ${idx + 1}: Empty`;
      let stateClass = 'free';
      if (occupyingStruct) {
        const cfg = ORBITAL_STRUCTURES[occupyingStruct.structureId];
        const pct = occupyingStruct.isComplete
          ? 'Ready'
          : `${Math.floor((occupyingStruct.buildProgressSeconds / Math.max(1, occupyingStruct.totalBuildTimeSeconds)) * 100)}%`;
        label = `S${idx + 1}: ${cfg.displayName.split(' ')[0]} (<span data-slot-pct="${idx}">${pct}</span>)`;
        stateClass = occupyingStruct.isComplete ? 'occupied' : 'building';
      }
      return `<button class="slot-pill ${stateClass} ${isSelectedSlot ? 'selected' : ''}" data-slot-index="${idx}">
        ${label}
      </button>`;
    }).join('');

    const selectedStruct = selectedPlanetState.structures.find((s) =>
      s.occupiedSlots.includes(selectedSlotIndex),
    );
    let slotActionsHtml = '';

    if (selectedStruct) {
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
        ? sim
            .getAllHarvesters()
            .filter(
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

      slotActionsHtml = `
        <div class="slot-detail-box" style="flex-direction: column; align-items: stretch;">
          <div style="display: flex; justify-content: space-between; align-items: center; gap: 10px;">
            <div>
              <strong>${cfg.displayName}</strong> (${cfg.slotCost} Slot${cfg.slotCost > 1 ? 's' : ''})
              — <span data-hud-field="struct-status">${selectedStruct.isComplete ? (isDropoffPlatform ? dockStatusText : 'Operational') : `Constructing (${Math.ceil(selectedStruct.totalBuildTimeSeconds - selectedStruct.buildProgressSeconds)}s left)`}</span>
            </div>
            ${
              isDropoffPlatform
                ? `<button class="hud-btn active" data-action="spawn-harvester" data-struct-id="${selectedStruct.id}" ${isQueueFull ? 'disabled' : ''}>
                    ${isQueueFull ? `Queue Full (${queueCount}/${MAX_SHIP_PRODUCTION_QUEUE_SIZE})` : `+ Queue Harvester (${hCost.ore} Ore / ${hCost.crystal} Crystal • ${SHIP_CLASSES.harvester.buildTimeSeconds}s)`}
                  </button>`
                : ''
            }
          </div>
          ${focusControlsHtml}
          ${assignedHarvestersHtml}
          ${dockyardControlsHtml}
          ${queueItemsHtml}
        </div>
      `;
    } else {
      const isUnclaimed = selectedPlanetState.ownerId === null;
      const isOwnedByOther =
        selectedPlanetState.ownerId !== null &&
        selectedPlanetState.ownerId !== playerId;

      if (isOwnedByOther) {
        slotActionsHtml = `<div class="slot-detail-box">Planet is controlled by ${selectedPlanetState.ownerId}.</div>`;
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

    const sysRes = sim.getSystemResourceSummary(activeSystem.id);
    const innerPct =
      sysRes.innerBeltInitial > 0
        ? Math.round((sysRes.innerBeltRemaining / sysRes.innerBeltInitial) * 100)
        : 0;
    const yieldLabel =
      sysRes.extractionMultiplier > 1.0
        ? `${sysRes.extractionMultiplier}x Enriched Yield`
        : '1.0x Standard Yield';

    const pendingDeepSpace = sceneManager.getPendingDeepSpacePlacement();
    const deepSpaceInSystem = sim.getDeepSpaceStructuresInSystem(activeSystem.id);
    const hasCompletedFriendlyHub = deepSpaceInSystem.some(
      (s) => s.structureId === 'logistics_hub' && s.ownerId === playerId && s.isComplete,
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
              .map((ds, idx) => {
                const cfg = DEEP_SPACE_STRUCTURES[ds.structureId];
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
    const selectedFleetId = sceneManager.getSelectedFleetId();
    const pendingOrderGlobal = sceneManager.getPendingFleetOrder();
    const isCreateFleetPending = pendingOrderGlobal?.mode === 'create_fleet';

    const fleetTabsHtml = playerFleets
      .map((f) => {
        const liveCount = sim.getShipsInFleet(f.id).length;
        const targetCount = SMALLEST_FIRST_FLEET_HULLS.reduce(
          (acc, h) => acc + f.desiredCounts[h],
          0,
        );
        const isSel = f.id === selectedFleetId;
        return `<button class="hud-btn ${isSel ? 'active' : ''}" data-select-fleet="${f.id}" title="Click to select and focus camera on ${f.name}">
          ${f.name}
          <span class="hud-badge">${liveCount}/${targetCount}${f.autoResupply ? ' ↻' : ''}</span>
        </button>`;
      })
      .join('');

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
              <strong>${selectedFleet.name}</strong> — ${fleetShips.length} ships • Right-click 3D space to Move
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
      <div class="hud-header">
        <div>
          <h1>StarConquest — ${activeSystem.name}</h1>
          <p class="hud-subtitle">${paletteInfo.displayName} • ${yieldLabel} • Reserves: <strong data-hud-field="system-reserves-ore">${sysRes.remainingOre}/${sysRes.initialOre} Ore</strong> & <strong data-hud-field="system-reserves-crystal">${sysRes.remainingCrystal}/${sysRes.initialCrystal} Crystal</strong> <span data-hud-field="system-reserves-inner">(Inner Belt: ${innerPct}%)</span></p>
        </div>
        <button class="hud-btn overview-btn" data-action="overview">System Overview</button>
      </div>

      <div class="hud-section">
        ${renderSectionHeader('galaxy', '5-System Hub & Spoke Galaxy', { titleLabel: 'Galaxy navigation' })}
        ${collapsedSections.galaxy ? '' : `<div class="hud-btn-row">${systemButtonsHtml}</div>`}
      </div>

      <div class="hud-section">
        ${renderSectionHeader(
          'fleet',
          `Fleet Command (${playerFleets.length}) — Click Any Ship or Tab to Focus Fleet`,
          { legacyAction: 'toggle-fleet-panel', titleLabel: 'Fleet Command panel' },
        )}
        ${
          collapsedSections.fleet
            ? ''
            : `<div class="hud-btn-row">
                <button class="hud-btn ${isCreateFleetPending ? 'active' : ''}" data-action="create-fleet">
                  ${isCreateFleetPending ? 'Click 3D Space for Fleet Rally Point...' : '+ Create Fleet (Click 3D Rally)'}
                </button>
                ${fleetTabsHtml}
                ${pendingOrderGlobal ? `<button class="hud-btn" data-action="cancel-fleet-order">Cancel (Esc)</button>` : ''}
              </div>
              ${selectedFleetDetailHtml}`
        }
      </div>

      <div class="hud-section">
        ${renderSectionHeader(
          'battle_sim',
          `Fleet Battle Simulator — Isolated Void Arena${activeSystem.id === BATTLE_SIMULATOR_SYSTEM_ID ? ' (ACTIVE)' : ''}`,
          {
            legacyAction: 'toggle-battle-sim',
            titleLabel: 'Fleet Battle Simulator',
            extraActionsHtml:
              activeSystem.id === BATTLE_SIMULATOR_SYSTEM_ID
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
                const stats = sim.getBattleSimulatorStats();
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
      </div>

      ${
        activeSystem.id === BATTLE_SIMULATOR_SYSTEM_ID
          ? ''
          : `<div class="hud-section">
        ${renderSectionHeader(
          'planets_wormholes',
          `Planets & Wormholes in ${activeSystem.name}`,
          { titleLabel: 'Planets & Wormholes panel' },
        )}
        ${
          collapsedSections.planets_wormholes
            ? ''
            : `<div class="hud-planet-row">${planetButtonsHtml}</div>
        <div class="hud-btn-row" style="margin-top: 6px;">${wormholesHtml}</div>`
        }
      </div>

      <div class="hud-section">
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
          `Orbital Ring Builder — <strong>${selectedPlanetState.planet.name}</strong> (${totalSlots} Slots)`,
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
        <span><strong>Right-Click Wormhole (Fleet):</strong> Transit Fleet</span>
        <span><strong>Left-Drag / WASD:</strong> Pan (Breaks Follow)</span>
        <span><strong>Right-Drag:</strong> Orbit</span>
        <span><strong>Scroll:</strong> Zoom</span>
      </div>
    `;

    mainBodyEl
      .querySelectorAll<HTMLButtonElement>('[data-system-id]')
      .forEach((btn) => {
        btn.addEventListener('click', () => {
          const sysId = btn.dataset.systemId;
          if (sysId) {
            statusBannerMessage = '';
            sceneManager.loadSystem(sysId);
            selectedSlotIndex = 0;
            renderMainPanel();
          }
        });
      });

    mainBodyEl
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
        renderHarvesterInspector();
        renderMainPanel();
      }
    };

    mainBodyEl
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

    mainBodyEl
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
        const removed = sim.clearBattleSimulatorShips();
        statusBannerMessage = `Ended Battle Simulator and cleared ${removed} ship${removed === 1 ? '' : 's'}.`;
        renderMainPanel();
      });

    mainBodyEl
      .querySelector<HTMLButtonElement>('[data-action="exit-battle-sim"]')
      ?.addEventListener('click', () => {
        sceneManager.loadSystem(sceneManager.getLastMatchSystemId());
        renderMainPanel();
      });

    mainBodyEl
      .querySelector<HTMLButtonElement>('[data-action="dismiss-battle-stats"]')
      ?.addEventListener('click', () => {
        sim.dismissBattleSimulatorStats();
        renderMainPanel();
      });

    mainBodyEl
      .querySelector<HTMLButtonElement>('[data-action="create-fleet"]')
      ?.addEventListener('click', () => {
        sceneManager.startCreateFleetPlacement(selectedFleetStance, true);
        statusBannerMessage =
          'Click any point in 3D space (in any star system) to place the new Fleet Rally Point (Esc to cancel).';
        renderMainPanel();
      });

    mainBodyEl
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

    mainBodyEl
      .querySelector<HTMLButtonElement>('[data-action="overview"]')
      ?.addEventListener('click', () => {
        sceneManager.focusSystemOverview();
      });
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

  function patchMainPanelLiveTelemetry(): void {
    syncSimRefs();
    const activeSystem = sceneManager.getActiveSystem();
    const selectedPlanetState = sim.getPlanetState(sceneManager.getSelectedPlanetId());

    // 1. System resource reserves
    const sysRes = sim.getSystemResourceSummary(activeSystem.id);
    const innerPct =
      sysRes.innerBeltInitial > 0
        ? Math.round((sysRes.innerBeltRemaining / sysRes.innerBeltInitial) * 100)
        : 0;
    const oreResEl = mainBodyEl.querySelector<HTMLElement>(
      '[data-hud-field="system-reserves-ore"]',
    );
    if (oreResEl) oreResEl.textContent = `${sysRes.remainingOre}/${sysRes.initialOre} Ore`;
    const crystalResEl = mainBodyEl.querySelector<HTMLElement>(
      '[data-hud-field="system-reserves-crystal"]',
    );
    if (crystalResEl) {
      crystalResEl.textContent = `${sysRes.remainingCrystal}/${sysRes.initialCrystal} Crystal`;
    }
    const innerResEl = mainBodyEl.querySelector<HTMLElement>(
      '[data-hud-field="system-reserves-inner"]',
    );
    if (innerResEl) innerResEl.textContent = `(Inner Belt: ${innerPct}%)`;

    // 2. Orbital slot pill construction percentages
    for (const s of selectedPlanetState.structures) {
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
    const selectedStruct = selectedPlanetState.structures.find((s) =>
      s.occupiedSlots.includes(selectedSlotIndex),
    );
    if (selectedStruct) {
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

      if (isDropoffPlatform) {
        const assignedHarvesters = sim
          .getAllHarvesters()
          .filter(
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
    for (const ds of sim.getDeepSpaceStructuresInSystem(activeSystem.id)) {
      const badgeEl = mainBodyEl.querySelector<HTMLElement>(
        `[data-deepspace-badge="${ds.id}"]`,
      );
      if (badgeEl) {
        badgeEl.textContent = ds.isComplete
          ? 'Operational'
          : `${Math.floor((ds.buildProgressSeconds / Math.max(1, ds.totalBuildTimeSeconds)) * 100)}%`;
      }
    }
  }

  window.setInterval(() => {
    renderEconomyBar();
    renderHarvesterInspector();
    const nextSignature = getCurrentMainPanelSignature();
    if (nextSignature !== lastMainPanelSignature) {
      renderMainPanel();
    } else {
      patchMainPanelLiveTelemetry();
    }
  }, 250);
}
