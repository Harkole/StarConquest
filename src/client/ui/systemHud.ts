import {
  ORBITAL_STRUCTURES,
  PLANET_CLASSES,
  SHIP_CLASSES,
  type OrbitalStructureId,
} from '../../shared/config/index.ts';
import type { GalaxyTopology } from '../../shared/sim/galaxy.ts';
import type { SystemSceneManager } from '../renderer/systemSceneManager.ts';
import { NEBULA_PALETTES } from '../shaders/nebulaShaders.ts';

const BUILDABLE_STRUCTURE_IDS: readonly OrbitalStructureId[] = [
  'planetary_outpost',
  'refinery',
  'orbital_dockyard',
  'tech_module',
  'heavy_defense_platform',
];

export function mountSystemHud(
  container: HTMLElement,
  galaxy: GalaxyTopology,
  sceneManager: SystemSceneManager,
): void {
  const simAdapter = sceneManager.simAdapter;
  const sim = simAdapter.simulation;
  const playerId = simAdapter.localPlayerId;

  let selectedSlotIndex = 2; // Default to first free slot after Homeworld C&C (0, 1)
  let statusBannerMessage = '';
  let crossSystemMiningEnabled = false;

  const topBarEl = document.createElement('div');
  topBarEl.className = 'hud-econ-bar';
  const mainBodyEl = document.createElement('div');
  mainBodyEl.className = 'hud-main-body';
  container.innerHTML = '';
  container.append(topBarEl, mainBodyEl);

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
        const isSelected = planet.id === selectedPlanetId;
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

    // Build orbital slot ring pills (0 .. totalSlots - 1)
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

    // Determine actions for currently selected slot
    const selectedStruct = selectedPlanetState.structures.find((s) =>
      s.occupiedSlots.includes(selectedSlotIndex),
    );
    let slotActionsHtml = '';

    if (selectedStruct) {
      const cfg = ORBITAL_STRUCTURES[selectedStruct.structureId];
      const canQueueHarvester =
        selectedStruct.isComplete &&
        selectedStruct.ownerId === playerId &&
        (selectedStruct.structureId === 'refinery' ||
          selectedStruct.structureId === 'command_and_control');
      const hCost = SHIP_CLASSES.harvester.cost;

      slotActionsHtml = `
        <div class="slot-detail-box">
          <div>
            <strong>${cfg.displayName}</strong> (${cfg.slotCost} Slot${cfg.slotCost > 1 ? 's' : ''})
            — ${selectedStruct.isComplete ? 'Operational' : `Constructing (${Math.ceil(selectedStruct.totalBuildTimeSeconds - selectedStruct.buildProgressSeconds)}s left)`}
          </div>
          ${
            canQueueHarvester
              ? `<button class="hud-btn active" data-action="spawn-harvester" data-struct-id="${selectedStruct.id}">
                  + Queue Harvester (${hCost.ore} Ore / ${hCost.crystal} Crystal)
                </button>`
              : ''
          }
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
        <span><strong>Left-Drag / WASD:</strong> Pan</span>
        <span><strong>Right-Drag:</strong> Orbit / Tilt</span>
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
        renderMainPanel();
      });

    mainBodyEl
      .querySelector<HTMLButtonElement>('[data-action="overview"]')
      ?.addEventListener('click', () => {
        sceneManager.focusSystemOverview();
      });
  }

  renderEconomyBar();
  renderMainPanel();

  // Refresh live economy counters & build progress every 400ms
  window.setInterval(() => {
    renderEconomyBar();
    const activePlanetState = sim.getPlanetState(sceneManager.getSelectedPlanetId());
    const anyUnderConstruction = activePlanetState.structures.some(
      (s) => !s.isComplete,
    );
    if (anyUnderConstruction) {
      renderMainPanel();
    }
  }, 400);
}
