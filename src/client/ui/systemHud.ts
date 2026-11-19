import {
  DEEP_SPACE_STRUCTURES,
  ORBITAL_STRUCTURES,
  PLANET_CLASSES,
  SHIP_CLASSES,
  type CombatShipClassId,
  type DeepSpaceStructureId,
  type OrbitalStructureId,
} from '../../shared/config/index.ts';
import type {
  FleetStance,
  ResourceTargetFocus,
} from '../../shared/protocol/commands.ts';
import type { GalaxyTopology } from '../../shared/sim/galaxy.ts';
import {
  type GameSimulation,
  type HarvesterActivityState,
  MAX_SHIP_PRODUCTION_QUEUE_SIZE,
} from '../../shared/sim/gameSimulation.ts';
import type { SystemSceneManager } from '../renderer/systemSceneManager.ts';
import { NEBULA_PALETTES } from '../shaders/nebulaShaders.ts';

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

const BUILDABLE_COMBAT_SHIP_IDS: readonly CombatShipClassId[] = [
  'fighter',
  'destroyer',
  'cruiser',
  'carrier',
  'dreadnought',
];

const FLEET_STANCE_OPTIONS: readonly { readonly id: FleetStance; readonly label: string }[] = [
  { id: 'aggressive_push', label: 'Aggressive Push' },
  { id: 'hold_choke_point', label: 'Hold Choke Point' },
  { id: 'hunt_backline', label: 'Hunt Backline' },
];

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
      return `${s.id}:${s.isComplete ? 1 : 0}:${s.targetResource}:${s.fleetStance ?? 'default'}:${rallySig}:${patrolSig}:${queueIds}`;
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

export function mountSystemHud(
  container: HTMLElement,
  galaxy: GalaxyTopology,
  sceneManager: SystemSceneManager,
): void {
  const simAdapter = sceneManager.simAdapter;
  const sim = simAdapter.simulation;
  const playerId = simAdapter.localPlayerId;

  let selectedSlotIndex = 2;
  let statusBannerMessage = '';
  let crossSystemMiningEnabled = false;
  let autoRepeatDockyardOrders = false;
  let selectedFleetStance: FleetStance = 'aggressive_push';

  const topBarEl = document.createElement('div');
  topBarEl.className = 'hud-econ-bar';
  const mainBodyEl = document.createElement('div');
  mainBodyEl.className = 'hud-main-body';
  const harvesterInspectorEl = document.createElement('div');
  harvesterInspectorEl.className = 'hud-harvester-inspector';
  container.innerHTML = '';
  container.append(topBarEl, harvesterInspectorEl, mainBodyEl);

  // Mount Top Economy Bar DOM once and patch numeric text/classes in-place so buttons never pulse or drop clicks
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
    </div>
    <div class="econ-actions">
      <button class="hud-btn" data-action="toggle-hub-mining" title="Send Harvesters through the Wormhole to mine the Central Nexus">
        Mining: Local System
      </button>
      <button class="hud-btn" data-speed="1">1x</button>
      <button class="hud-btn" data-speed="2">2x</button>
      <button class="hud-btn" data-speed="4">4x</button>
    </div>
  `;

  const econOreEl = topBarEl.querySelector<HTMLElement>('#econ-ore-val');
  const econCrystalEl = topBarEl.querySelector<HTMLElement>('#econ-crystal-val');
  const econSupplyEl = topBarEl.querySelector<HTMLElement>('#econ-supply-val');
  const econHarvestersEl = topBarEl.querySelector<HTMLElement>('#econ-harvesters-val');
  const hubMiningBtnEl = topBarEl.querySelector<HTMLButtonElement>(
    '[data-action="toggle-hub-mining"]',
  );
  const speedBtnEls = Array.from(
    topBarEl.querySelectorAll<HTMLButtonElement>('[data-speed]'),
  );

  hubMiningBtnEl?.addEventListener('click', () => {
    crossSystemMiningEnabled = !crossSystemMiningEnabled;
    sim.setPlayerHarvestersCrossSystemMining(playerId, crossSystemMiningEnabled);
    renderEconomyBar();
  });

  for (const btn of speedBtnEls) {
    btn.addEventListener('click', () => {
      const spd = Number(btn.dataset.speed ?? '1');
      simAdapter.simSpeedMultiplier = spd;
      renderEconomyBar();
    });
  }

  function renderEconomyBar(): void {
    const pState = sim.getPlayerState(playerId);
    const playerHarvesters = sim
      .getAllHarvesters()
      .filter((h) => h.ownerId === playerId);

    if (econOreEl) econOreEl.textContent = `${pState.ore}`;
    if (econCrystalEl) econCrystalEl.textContent = `${pState.crystal}`;
    if (econSupplyEl) econSupplyEl.textContent = `${pState.supplyUsed} / ${pState.supplyCap}`;
    if (econHarvestersEl) econHarvestersEl.textContent = `${playerHarvesters.length}`;
    if (hubMiningBtnEl) {
      hubMiningBtnEl.classList.toggle('active', crossSystemMiningEnabled);
      hubMiningBtnEl.textContent = crossSystemMiningEnabled
        ? 'Mining: Central Hub'
        : 'Mining: Local System';
    }
    for (const btn of speedBtnEls) {
      const spd = Number(btn.dataset.speed ?? '1');
      btn.classList.toggle('active', simAdapter.simSpeedMultiplier === spd);
    }
  }

  let lastInspectedHarvesterId: string | null = null;

  function patchHarvesterInspectorLive(): void {
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
        return `<button class="hud-btn ${isOpen ? 'active' : ''}" data-wormhole-id="${wh.wormholeId}">
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
        const pendingOrder = sceneManager.getPendingFleetOrder();
        const isRallyPending =
          pendingOrder?.mode === 'rally' &&
          pendingOrder.dockyardId === selectedStruct.id;
        const isPatrolPending =
          pendingOrder?.mode === 'patrol' &&
          pendingOrder.dockyardId === selectedStruct.id;
        const currentStance = selectedStruct.fleetStance ?? selectedFleetStance;
        const assignedCombatShips = sim
          .getAllCombatShips()
          .filter(
            (s) => s.ownerId === playerId && s.homeDockyardId === selectedStruct.id,
          );
        const selectedCombatShipId = sceneManager.getSelectedCombatShipId();

        const orderSummary =
          selectedStruct.patrolWaypoints && selectedStruct.patrolWaypoints.length >= 2
            ? `Patrol Route (${selectedStruct.patrolWaypoints.length} waypoints)`
            : selectedStruct.rallyPoint
              ? `Rally: ${galaxy.systems.find((sys) => sys.id === selectedStruct.rallyPoint?.systemId)?.name ?? selectedStruct.rallyPoint.systemId} (${Math.round(selectedStruct.rallyPoint.position.x)}, ${Math.round(selectedStruct.rallyPoint.position.z)})`
              : 'Default Slipway Rally';

        const shipButtonsHtml = BUILDABLE_COMBAT_SHIP_IDS.map((shipId) => {
          const sCfg = SHIP_CLASSES[shipId];
          const check = sim.validateCombatShipOrder(playerId, selectedStruct.id, shipId);
          const lockTag = !check.ok && check.reason ? ` • ${check.reason}` : '';
          return `<button class="hud-btn" data-queue-combat="${shipId}" data-dockyard-id="${selectedStruct.id}" title="${sCfg.displayName}: ${sCfg.cost.ore} Ore / ${sCfg.cost.crystal} Crystal / ${sCfg.supplyCost} Supply / ${sCfg.buildTimeSeconds}s${lockTag}">
            + ${sCfg.displayName} (${sCfg.cost.ore}O/${sCfg.cost.crystal}C • ${sCfg.supplyCost}S • ${sCfg.buildTimeSeconds}s)
          </button>`;
        }).join('');

        const stanceButtonsHtml = FLEET_STANCE_OPTIONS.map(
          (opt) =>
            `<button class="hud-btn ${currentStance === opt.id ? 'active' : ''}" data-select-stance="${opt.id}">${opt.label}</button>`,
        ).join('');

        const fleetChipsHtml =
          assignedCombatShips.length > 0
            ? assignedCombatShips
                .map((ship, idx) => {
                  const sCfg = SHIP_CLASSES[ship.shipClassId];
                  const isSel = ship.id === selectedCombatShipId;
                  return `<button class="hud-btn ${isSel ? 'active' : ''}" data-select-combat-ship="${ship.id}" title="Click to follow ${sCfg.displayName}">
                    ${sCfg.displayName} #${idx + 1}
                    <span class="hud-badge">${ship.state.replace(/_/g, ' ').toUpperCase()}</span>
                  </button>`;
                })
                .join('')
            : '<span class="econ-label" style="opacity: 0.7;">No ships launched yet</span>';

        dockyardControlsHtml = `
          <div class="hud-btn-row" style="margin-top: 6px;">
            <span class="econ-label" style="margin-right: 4px;">SHIP PRODUCTION:</span>
            <button class="hud-btn ${autoRepeatDockyardOrders ? 'active' : ''}" data-action="toggle-autorepeat">
              Auto-Repeat: ${autoRepeatDockyardOrders ? 'ON ↻' : 'OFF'}
            </button>
            ${shipButtonsHtml}
          </div>
          <div class="hud-btn-row" style="margin-top: 6px;">
            <span class="econ-label" style="margin-right: 4px;">FLEET ORDERS (${orderSummary}):</span>
            <button class="hud-btn ${isRallyPending ? 'active' : ''}" data-action="set-rally" data-dockyard-id="${selectedStruct.id}">
              ${isRallyPending ? 'Click 3D Space for Rally Point...' : 'Set Rally Point (Click 3D)'}
            </button>
            <button class="hud-btn ${isPatrolPending ? 'active' : ''}" data-action="set-patrol" data-dockyard-id="${selectedStruct.id}">
              ${isPatrolPending ? `Click Waypoint #${(pendingOrder?.waypointCount ?? 0) + 1} of 2...` : 'Set Patrol Route (2 Clicks)'}
            </button>
            ${pendingOrder ? `<button class="hud-btn" data-action="cancel-fleet-order">Cancel (Esc)</button>` : ''}
          </div>
          <div class="hud-btn-row" style="margin-top: 6px;">
            <span class="econ-label" style="margin-right: 4px;">FLEET STANCE:</span>
            ${stanceButtonsHtml}
          </div>
          <div class="hud-btn-row" style="margin-top: 6px;">
            <span class="econ-label" style="margin-right: 4px;">DOCKYARD FLEET (${assignedCombatShips.length}):</span>
            ${fleetChipsHtml}
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

    mainBodyEl.innerHTML = `
      <div class="hud-header">
        <div>
          <h1>StarConquest — ${activeSystem.name}</h1>
          <p class="hud-subtitle">${paletteInfo.displayName} • ${yieldLabel} • Reserves: <strong data-hud-field="system-reserves-ore">${sysRes.remainingOre}/${sysRes.initialOre} Ore</strong> & <strong data-hud-field="system-reserves-crystal">${sysRes.remainingCrystal}/${sysRes.initialCrystal} Crystal</strong> <span data-hud-field="system-reserves-inner">(Inner Belt: ${innerPct}%)</span></p>
        </div>
        <button class="hud-btn overview-btn" data-action="overview">System Overview</button>
      </div>

      <div class="hud-section">
        <div class="hud-label">5-System Hub & Spoke Galaxy</div>
        <div class="hud-btn-row">${systemButtonsHtml}</div>
      </div>

      <div class="hud-section">
        <div class="hud-label">Planets & Wormholes in ${activeSystem.name}</div>
        <div class="hud-planet-row">${planetButtonsHtml}</div>
        <div class="hud-btn-row" style="margin-top: 6px;">${wormholesHtml}</div>
      </div>

      <div class="hud-section">
        <div class="hud-label">
          Deep-Space Installations — Free-Floating Logistics Hub ("Atlas") & Defence Towers
        </div>
        <div class="hud-btn-row">
          ${deepSpaceBuildButtonsHtml}
          ${pendingDeepSpace ? `<button class="hud-btn" data-action="cancel-deepspace">Cancel Placement (Esc)</button>` : ''}
        </div>
        ${deepSpaceInstancesHtml}
      </div>

      <div class="hud-section">
        <div class="hud-label">
          Orbital Ring Builder — <strong>${selectedPlanetState.planet.name}</strong> (${totalSlots} Slots)
        </div>
        <div class="slot-ring-grid">${slotButtonsHtml}</div>
        <div class="build-options-grid">${slotActionsHtml}</div>
        ${statusBannerMessage ? `<div class="hud-status-msg">${statusBannerMessage}</div>` : ''}
      </div>

      <div class="hud-controls-hint">
        <span><strong>Click Harvester/Planet:</strong> Inspect & Follow</span>
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

    mainBodyEl
      .querySelectorAll<HTMLButtonElement>('[data-wormhole-id]')
      .forEach((btn) => {
        btn.addEventListener('click', () => {
          const wormholeId = btn.dataset.wormholeId;
          if (wormholeId) {
            sceneManager.focusWormhole(wormholeId);
            renderHarvesterInspector();
            renderMainPanel();
          }
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
      .querySelector<HTMLButtonElement>('[data-action="toggle-autorepeat"]')
      ?.addEventListener('click', () => {
        autoRepeatDockyardOrders = !autoRepeatDockyardOrders;
        renderMainPanel();
      });

    mainBodyEl
      .querySelectorAll<HTMLButtonElement>('[data-queue-combat]')
      .forEach((btn) => {
        btn.addEventListener('click', () => {
          const shipClassId = btn.dataset.queueCombat as CombatShipClassId | undefined;
          const dockyardId = btn.dataset.dockyardId;
          if (!shipClassId || !dockyardId) {
            return;
          }
          const res = simAdapter.submitPlayerCommand({
            type: 'QUEUE_SHIP',
            playerId,
            dockyardOrRefineryId: dockyardId,
            shipClassId,
            autoRepeat: autoRepeatDockyardOrders,
          });
          statusBannerMessage = res.ok
            ? `Queued ${SHIP_CLASSES[shipClassId].displayName}${autoRepeatDockyardOrders ? ' (Auto-Repeat ↻)' : ''}`
            : `Cannot queue ship: ${res.reason}`;
          renderEconomyBar();
          renderMainPanel();
        });
      });

    mainBodyEl
      .querySelectorAll<HTMLButtonElement>('[data-select-stance]')
      .forEach((btn) => {
        btn.addEventListener('click', () => {
          const stance = btn.dataset.selectStance as FleetStance | undefined;
          if (stance) {
            selectedFleetStance = stance;
            statusBannerMessage = `Fleet stance set to ${stance.replace(/_/g, ' ')}`;
            renderMainPanel();
          }
        });
      });

    mainBodyEl
      .querySelector<HTMLButtonElement>('[data-action="set-rally"]')
      ?.addEventListener('click', (e) => {
        const dockyardId = (e.currentTarget as HTMLButtonElement).dataset.dockyardId;
        if (!dockyardId) return;
        sceneManager.startRallyPointPlacement(dockyardId, selectedFleetStance);
        statusBannerMessage =
          'Click any point in 3D space (in this or another star system) to set the Dockyard Rally Point (Esc to cancel).';
        renderMainPanel();
      });

    mainBodyEl
      .querySelector<HTMLButtonElement>('[data-action="set-patrol"]')
      ?.addEventListener('click', (e) => {
        const dockyardId = (e.currentTarget as HTMLButtonElement).dataset.dockyardId;
        if (!dockyardId) return;
        sceneManager.startPatrolRoutePlacement(dockyardId, selectedFleetStance);
        statusBannerMessage =
          'Click 2 points in 3D space to create a Patrol Route loop (Esc to cancel).';
        renderMainPanel();
      });

    mainBodyEl
      .querySelector<HTMLButtonElement>('[data-action="cancel-fleet-order"]')
      ?.addEventListener('click', () => {
        sceneManager.cancelFleetOrderPlacement();
        statusBannerMessage = 'Cancelled fleet order placement.';
        renderMainPanel();
      });

    mainBodyEl
      .querySelectorAll<HTMLButtonElement>('[data-select-combat-ship]')
      .forEach((btn) => {
        btn.addEventListener('click', () => {
          const shipId = btn.dataset.selectCombatShip ?? null;
          sceneManager.selectAndPinCombatShip(shipId);
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
