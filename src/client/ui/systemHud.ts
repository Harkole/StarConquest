import {
  DEEP_SPACE_STRUCTURES,
  ORBITAL_STRUCTURES,
  PLANET_CLASSES,
  SHIP_CLASSES,
  type DeepSpaceStructureId,
  type OrbitalStructureId,
} from '../../shared/config/index.ts';
import type { ResourceTargetFocus } from '../../shared/protocol/commands.ts';
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
 * Computes a deterministic snapshot signature for every live telemetry field rendered inside the
 * main tactical HUD panel (planet ownership/slots, orbital build progress & completion, Harvester
 * production queues, active/queued docks, deep-space build progress, wormholes, and system reserves).
 * Used by the 250ms HUD poll so final completion transitions and live dock/reserve changes always render.
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
      const pct = s.isComplete
        ? 100
        : Math.floor((s.buildProgressSeconds / Math.max(1, s.totalBuildTimeSeconds)) * 100);
      const remSec = s.isComplete
        ? 0
        : Math.ceil(s.totalBuildTimeSeconds - s.buildProgressSeconds);
      const head = s.productionQueue[0];
      const queueHeadSig = head
        ? `${head.id}:${Math.max(0, Math.ceil(head.buildTimeSeconds - head.progressSeconds))}`
        : 'empty';
      return `${s.id}:${s.isComplete ? 1 : 0}:${pct}:${remSec}:${s.targetResource}:${s.activeDockingHarvesterIds.length}:${s.queuedDockingHarvesterIds.length}:${s.productionQueue.length}:${queueHeadSig}`;
    })
    .join(';');

  const selectedStruct = selectedPlanetState.structures.find((s) =>
    s.occupiedSlots.includes(params.selectedSlotIndex),
  );
  const assignedHarvesterSig = selectedStruct
    ? sim
        .getAllHarvesters()
        .filter((h) => h.homeStructureId === selectedStruct.id)
        .map((h) => {
          const pct = Math.round((h.cargoAmount / Math.max(1, h.cargoCapacity)) * 100);
          return `${h.id}:${h.cargoType}:${pct}`;
        })
        .join(',')
    : 'none';

  const deepSpaceSig = sim
    .getDeepSpaceStructuresInSystem(params.activeSystemId)
    .map((ds) => {
      const pct = ds.isComplete
        ? 100
        : Math.floor((ds.buildProgressSeconds / Math.max(1, ds.totalBuildTimeSeconds)) * 100);
      return `${ds.id}:${ds.isComplete ? 1 : 0}:${pct}`;
    })
    .join(';');

  const wormholeSig = params.wormholeStates
    .map((wh) => `${wh.id}:${wh.isOpen ? 1 : 0}`)
    .join(',');

  const sysRes = sim.getSystemResourceSummary(params.activeSystemId);
  const resSig = `${Math.round(sysRes.remainingOre)}:${Math.round(sysRes.remainingCrystal)}:${Math.round(sysRes.innerBeltRemaining)}`;

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
    deepSpaceSig,
    wormholeSig,
    resSig,
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

  const topBarEl = document.createElement('div');
  topBarEl.className = 'hud-econ-bar';
  const mainBodyEl = document.createElement('div');
  mainBodyEl.className = 'hud-main-body';
  const harvesterInspectorEl = document.createElement('div');
  harvesterInspectorEl.className = 'hud-harvester-inspector';
  container.innerHTML = '';
  container.append(topBarEl, harvesterInspectorEl, mainBodyEl);

  function renderEconomyBar(): void {
    const pState = sim.getPlayerState(playerId);
    const playerHarvesters = sim
      .getAllHarvesters()
      .filter((h) => h.ownerId === playerId);

    topBarEl.innerHTML = `
      <div class="econ-metrics">
        <div class="econ-pill ore">
          <span class="econ-label">ORE</span>
          <strong id="econ-ore-val">${pState.ore}</strong>
        </div>
        <div class="econ-pill crystal">
          <span class="econ-label">CRYSTAL</span>
          <strong id="econ-crystal-val">${pState.crystal}</strong>
        </div>
        <div class="econ-pill supply">
          <span class="econ-label">SUPPLY</span>
          <strong>${pState.supplyUsed} / ${pState.supplyCap}</strong>
        </div>
        <div class="econ-pill harvesters">
          <span class="econ-label">HARVESTERS</span>
          <strong>${playerHarvesters.length}</strong>
        </div>
      </div>
      <div class="econ-actions">
        <button class="hud-btn ${crossSystemMiningEnabled ? 'active' : ''}" data-action="toggle-hub-mining" title="Send Harvesters through the Wormhole to mine the Central Nexus">
          ${crossSystemMiningEnabled ? 'Mining: Central Hub' : 'Mining: Local System'}
        </button>
        <button class="hud-btn ${simAdapter.simSpeedMultiplier === 1 ? 'active' : ''}" data-speed="1">1x</button>
        <button class="hud-btn ${simAdapter.simSpeedMultiplier === 2 ? 'active' : ''}" data-speed="2">2x</button>
        <button class="hud-btn ${simAdapter.simSpeedMultiplier === 4 ? 'active' : ''}" data-speed="4">4x</button>
      </div>
    `;

    topBarEl
      .querySelector<HTMLButtonElement>('[data-action="toggle-hub-mining"]')
      ?.addEventListener('click', () => {
        crossSystemMiningEnabled = !crossSystemMiningEnabled;
        sim.setPlayerHarvestersCrossSystemMining(playerId, crossSystemMiningEnabled);
        renderEconomyBar();
      });

    topBarEl.querySelectorAll<HTMLButtonElement>('[data-speed]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const spd = Number(btn.dataset.speed ?? '1');
        simAdapter.simSpeedMultiplier = spd;
        renderEconomyBar();
      });
    });
  }

  function renderHarvesterInspector(): void {
    const selectedHarvesterId = sceneManager.getSelectedHarvesterId();
    const selectedHarvester = selectedHarvesterId
      ? sim.getHarvesterById(selectedHarvesterId)
      : undefined;

    if (!selectedHarvester) {
      harvesterInspectorEl.innerHTML = '';
      harvesterInspectorEl.style.display = 'none';
      return;
    }

    harvesterInspectorEl.style.display = '';

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

    harvesterInspectorEl.innerHTML = `
      <div class="harvester-telemetry-card">
        <div class="telemetry-row">
          <div>
            <strong>Selected: ${selectedHarvester.id.replace('_', ' #')}</strong>
            <span class="hud-badge">${formatHarvesterState(selectedHarvester.state, selectedHarvester.cargoType)}</span>
          </div>
          <div class="telemetry-actions">
            <button class="hud-btn ${isCameraPinned ? 'active' : ''}" data-action="repin-harvester">
              ${isCameraPinned ? 'Camera Pinned (Pan to Break)' : 'Pin Camera to Follow'}
            </button>
            <button class="hud-btn" data-action="deselect-harvester">Close</button>
          </div>
        </div>
        <div class="telemetry-meta">
          <span><strong>Target:</strong> ${targetResourceLabel}</span>
          <span><strong>Home:</strong> ${homeLabel}</span>
          <span><strong>Speed:</strong> ${selectedHarvester.currentSpeed.toFixed(1)} u/s</span>
        </div>
        <div class="telemetry-progress-wrap">
          <div class="telemetry-progress-label">
            <span>Mined Cargo (${selectedHarvester.cargoType.toUpperCase()})</span>
            <strong>${selectedHarvester.cargoAmount.toFixed(1)} / ${selectedHarvester.cargoCapacity} (${pct}%)</strong>
          </div>
          <div class="telemetry-progress-bar">
            <div class="telemetry-progress-fill ${selectedHarvester.cargoType}" style="width: ${pct}%;"></div>
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
        label = `S${idx + 1}: ${cfg.displayName.split(' ')[0]} (${pct})`;
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
                        <span class="hud-badge">${h.cargoType.toUpperCase()} ${pct}%</span>
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
        isDropoffPlatform && queueCount > 0
          ? `<div class="hud-btn-row" style="margin-top: 6px;">
              <span class="econ-label" style="margin-right: 4px;">BUILD QUEUE (${queueCount}/${MAX_SHIP_PRODUCTION_QUEUE_SIZE}):</span>
              ${selectedStruct.productionQueue
                .map((item, idx) => {
                  const rem = Math.max(
                    0,
                    Math.ceil(item.buildTimeSeconds - item.progressSeconds),
                  );
                  const label =
                    idx === 0 ? `Harvester (${rem}s)` : `Harvester #${idx + 1}`;
                  return `<button class="hud-btn" data-cancel-queue="${item.id}" data-cancel-struct="${selectedStruct.id}" title="Click to cancel and refund ${hCost.ore} Ore / ${hCost.crystal} Crystal">
                    ${label} ✕
                  </button>`;
                })
                .join('')}
            </div>`
          : '';

      slotActionsHtml = `
        <div class="slot-detail-box" style="flex-direction: column; align-items: stretch;">
          <div style="display: flex; justify-content: space-between; align-items: center; gap: 10px;">
            <div>
              <strong>${cfg.displayName}</strong> (${cfg.slotCost} Slot${cfg.slotCost > 1 ? 's' : ''})
              — ${selectedStruct.isComplete ? (isDropoffPlatform ? dockStatusText : 'Operational') : `Constructing (${Math.ceil(selectedStruct.totalBuildTimeSeconds - selectedStruct.buildProgressSeconds)}s left)`}
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
                  <span class="hud-badge">${statusText}</span>
                </button>`;
              })
              .join('')}
          </div>`
        : '';

    mainBodyEl.innerHTML = `
      <div class="hud-header">
        <div>
          <h1>StarConquest — ${activeSystem.name}</h1>
          <p class="hud-subtitle">${paletteInfo.displayName} • ${yieldLabel} • Reserves: <strong>${sysRes.remainingOre}/${sysRes.initialOre} Ore</strong> & <strong>${sysRes.remainingCrystal}/${sysRes.initialCrystal} Crystal</strong> (Inner Belt: ${innerPct}%)</p>
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
            ? 'Cancelled Harvester order — resources refunded.'
            : `Cannot cancel: ${res.reason}`;
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

  window.setInterval(() => {
    renderEconomyBar();
    renderHarvesterInspector();
    const nextSignature = getCurrentMainPanelSignature();
    if (nextSignature !== lastMainPanelSignature) {
      renderMainPanel();
    }
  }, 250);
}
