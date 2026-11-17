import {
  ORBITAL_STRUCTURES,
  PLANET_CLASSES,
  SHIP_CLASSES,
  type OrbitalStructureId,
} from '../../shared/config/index.ts';
import type { ResourceTargetFocus } from '../../shared/protocol/commands.ts';
import type { GalaxyTopology } from '../../shared/sim/galaxy.ts';
import {
  CNC_UNLOAD_RATE_PER_SECOND,
  type HarvesterActivityState,
  REFINERY_UNLOAD_RATE_PER_SECOND,
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
    const playerHarvesters = sim
      .getAllHarvesters()
      .filter((h) => h.ownerId === playerId);
    const selectedHarvesterId = sceneManager.getSelectedHarvesterId();
    const selectedHarvester = selectedHarvesterId
      ? sim.getHarvesterById(selectedHarvesterId)
      : undefined;

    const harvesterButtonsHtml = playerHarvesters
      .map((h, idx) => {
        const isSel = h.id === selectedHarvesterId;
        const pct = Math.round((h.cargoAmount / Math.max(1, h.cargoCapacity)) * 100);
        return `<button class="hud-btn ${isSel ? 'active' : ''}" data-select-harvester="${h.id}">
          Harvester #${idx + 1}
          <span class="hud-badge">${h.cargoType.toUpperCase()} ${pct}%</span>
        </button>`;
      })
      .join('');

    let detailCardHtml = '';
    if (selectedHarvester) {
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

      detailCardHtml = `
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
    }

    harvesterInspectorEl.innerHTML = `
      <div class="hud-label">Harvester Fleet (Click in 3D Space or Below to Inspect & Pin Camera)</div>
      <div class="hud-btn-row">${harvesterButtonsHtml}</div>
      ${detailCardHtml}
    `;

    harvesterInspectorEl
      .querySelectorAll<HTMLButtonElement>('[data-select-harvester]')
      .forEach((btn) => {
        btn.addEventListener('click', () => {
          const hId = btn.dataset.selectHarvester ?? null;
          sceneManager.selectAndPinHarvester(hId);
          renderHarvesterInspector();
        });
      });

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

  function renderMainPanel(): void {
    const activeSystem = sceneManager.getActiveSystem();
    const paletteInfo = NEBULA_PALETTES[activeSystem.nebulaPalette];
    const selectedPlanetId = sceneManager.getSelectedPlanetId();
    const selectedPlanetState = sim.getPlanetState(selectedPlanetId);
    const totalSlots = selectedPlanetState.planet.orbitalSlots;

    if (selectedSlotIndex >= totalSlots) {
      selectedSlotIndex = 0;
    }

    const systemButtonsHtml = galaxy.systems
      .map((sys) => {
        const isActive = sys.id === activeSystem.id;
        return `<button class="hud-btn ${isActive ? 'active' : ''}" data-system-id="${sys.id}">
          ${sys.name}
          <span class="hud-badge">${sys.isCentralHub ? '12-Slot Hub' : sys.resourceSkew.replace('_', ' ')}</span>
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
      const unloadRate =
        selectedStruct.structureId === 'refinery'
          ? REFINERY_UNLOAD_RATE_PER_SECOND
          : CNC_UNLOAD_RATE_PER_SECOND;
      const maxDocks = sim.getMaxConcurrentDocks(selectedStruct);
      const dockStatusText = `Unload: ${unloadRate}/s • Docks: ${selectedStruct.activeDockingHarvesterIds.length}/${maxDocks} (Queued: ${selectedStruct.queuedDockingHarvesterIds.length})`;

      const focusControlsHtml = isDropoffPlatform
        ? `<div class="hud-btn-row" style="margin-top: 6px;">
            <span class="econ-label" style="margin-right: 4px;">MINING FOCUS:</span>
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

      slotActionsHtml = `
        <div class="slot-detail-box" style="flex-direction: column; align-items: stretch;">
          <div style="display: flex; justify-content: space-between; align-items: center; gap: 10px;">
            <div>
              <strong>${cfg.displayName}</strong> (${cfg.slotCost} Slot${cfg.slotCost > 1 ? 's' : ''})
              — ${selectedStruct.isComplete ? (isDropoffPlatform ? dockStatusText : 'Operational') : `Constructing (${Math.ceil(selectedStruct.totalBuildTimeSeconds - selectedStruct.buildProgressSeconds)}s left)`}
            </div>
            ${
              isDropoffPlatform
                ? `<button class="hud-btn active" data-action="spawn-harvester" data-struct-id="${selectedStruct.id}">
                    + Queue Harvester (${hCost.ore} Ore / ${hCost.crystal} Crystal)
                  </button>`
                : ''
            }
          </div>
          ${focusControlsHtml}
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

    mainBodyEl.innerHTML = `
      <div class="hud-header">
        <div>
          <h1>StarConquest — ${activeSystem.name}</h1>
          <p class="hud-subtitle">${paletteInfo.displayName}</p>
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
            sceneManager.focusAndToggleWormhole(wormholeId);
            renderHarvesterInspector();
            renderMainPanel();
          }
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
      .querySelector<HTMLButtonElement>('[data-action="overview"]')
      ?.addEventListener('click', () => {
        sceneManager.focusSystemOverview();
      });
  }

  sceneManager.onSelectionChange(() => {
    renderHarvesterInspector();
    renderMainPanel();
  });

  renderEconomyBar();
  renderHarvesterInspector();
  renderMainPanel();

  window.setInterval(() => {
    renderEconomyBar();
    renderHarvesterInspector();
    const activePlanetState = sim.getPlanetState(sceneManager.getSelectedPlanetId());
    const anyUnderConstruction = activePlanetState.structures.some(
      (s) => !s.isComplete,
    );
    if (anyUnderConstruction) {
      renderMainPanel();
    }
  }, 250);
}
