import { PLANET_CLASSES } from '../../shared/config/index.ts';
import type { PlayerSlotId } from '../../shared/protocol/commands.ts';
import type { GalaxyTopology, StarSystemNode } from '../../shared/sim/galaxy.ts';
import {
  BATTLE_SIMULATOR_SYSTEM_ID,
  SMALLEST_FIRST_FLEET_HULLS,
} from '../../shared/sim/gameSimulation.ts';
import type { ProjectedOrbitalStructure } from '../../shared/sim/playerIntel.ts';
import type { SimulationView } from '../../shared/sim/simulationView.ts';

export interface OutlinerSystemNode {
  readonly id: string;
  readonly name: string;
  readonly badge: string;
  readonly isActive: boolean;
}

export interface OutlinerPlanetRow {
  readonly id: string;
  readonly name: string;
  readonly badge: string;
  readonly meta: string;
  readonly isSelected: boolean;
}

export interface OutlinerWormholeRow {
  readonly id: string;
  readonly destinationName: string;
  readonly isOpen: boolean;
}

export interface OutlinerFleetRow {
  readonly id: string;
  readonly name: string;
  readonly liveCount: number;
  readonly targetCount: number;
  readonly autoResupply: boolean;
  readonly isSelected: boolean;
}

export interface LeftOutlinerModel {
  readonly systems: readonly OutlinerSystemNode[];
  readonly reserves: {
    readonly ore: string;
    readonly crystal: string;
    readonly inner: string;
  } | null;
  readonly planets: readonly OutlinerPlanetRow[];
  readonly wormholes: readonly OutlinerWormholeRow[];
  readonly fleets: readonly OutlinerFleetRow[];
  readonly isCreateFleetPending: boolean;
  readonly hasPendingFleetOrder: boolean;
}

export interface OutlinerWormholeInput {
  readonly id: string;
  readonly destinationSystemId: string;
  readonly isOpen: boolean;
}

export interface BuildLeftOutlinerParams {
  readonly galaxy: GalaxyTopology;
  readonly playerId: PlayerSlotId;
  readonly activeSystem: StarSystemNode;
  readonly selectedPlanetId: string | null;
  readonly selectedFleetId: string | null;
  readonly selectedHarvesterId: string | null;
  readonly wormholeStates: readonly OutlinerWormholeInput[];
  readonly pendingFleetOrder: { readonly mode: string } | null;
}

function getProjectedSlotCount(item: ProjectedOrbitalStructure): number {
  return item.kind === 'live'
    ? item.structure.occupiedSlots.length
    : item.occupiedSlots.length;
}

export function buildLeftOutlinerModel(
  sim: SimulationView,
  params: BuildLeftOutlinerParams,
): LeftOutlinerModel {
  const {
    galaxy,
    playerId,
    activeSystem,
    selectedPlanetId,
    selectedFleetId,
    selectedHarvesterId,
    wormholeStates,
    pendingFleetOrder,
  } = params;

  const systems: OutlinerSystemNode[] = galaxy.systems.map((sys) => {
    const sysView = sim.getPlayerSystemView(playerId, sys.id);
    const badge = !sysView.isExplored
      ? 'Unexplored'
      : sys.isCentralHub
        ? '12-Slot Hub • 1.6x Yield'
        : 'Ore Heavy • Scarce Crystal';
    return {
      id: sys.id,
      name: sys.name,
      badge,
      isActive: sys.id === activeSystem.id,
    };
  });

  const systemView = sim.getPlayerSystemView(playerId, activeSystem.id);
  const sysRes = systemView.resourceSummary;
  const reserves = sysRes
    ? {
        ore: `${sysRes.remainingOre}/${sysRes.initialOre} Ore`,
        crystal: `${sysRes.remainingCrystal}/${sysRes.initialCrystal} Crystal`,
        inner: `(Inner Belt: ${
          sysRes.innerBeltInitial > 0
            ? Math.round((sysRes.innerBeltRemaining / sysRes.innerBeltInitial) * 100)
            : 0
        }%)`,
      }
    : null;

  const isBattleSimVoid = activeSystem.id === BATTLE_SIMULATOR_SYSTEM_ID;

  const planets: OutlinerPlanetRow[] = isBattleSimVoid
    ? []
    : activeSystem.planets.map((planet) => {
        const pView = systemView.planets.find((p) => p.planet.id === planet.id);
        const pClass = PLANET_CLASSES[planet.planetClass];
        const isSelected =
          selectedPlanetId !== null &&
          planet.id === selectedPlanetId &&
          selectedHarvesterId === null &&
          selectedFleetId === null;

        if (!pView || pView.visibility === 'unexplored') {
          return {
            id: planet.id,
            name: planet.name,
            badge: 'UNEXPLORED',
            meta: `${pClass.displayName} • Unexplored (?/${planet.orbitalSlots} Slots)`,
            isSelected,
          };
        }

        const usedSlots = pView.structures.reduce(
          (acc, item) => acc + getProjectedSlotCount(item),
          0,
        );
        const ownerLabel =
          pView.ownerId === playerId
            ? 'OWNED'
            : pView.ownerId === null
              ? 'UNCLAIMED'
              : pView.ownerId.toUpperCase();
        const badge =
          pView.visibility === 'last_known' ? `${ownerLabel} • INTEL` : ownerLabel;

        return {
          id: planet.id,
          name: planet.name,
          badge,
          meta: `${pClass.displayName} • ${usedSlots}/${planet.orbitalSlots} Slots`,
          isSelected,
        };
      });

  const wormholes: OutlinerWormholeRow[] = isBattleSimVoid
    ? []
    : wormholeStates.map((wh) => {
        const destSys = galaxy.systems.find((s) => s.id === wh.destinationSystemId);
        return {
          id: wh.id,
          destinationName: destSys?.name ?? wh.destinationSystemId,
          isOpen: wh.isOpen,
        };
      });

  const fleets: OutlinerFleetRow[] = sim.getFleetsForPlayer(playerId).map((f) => {
    const liveCount = sim.getShipsInFleet(f.id).length;
    const targetCount = SMALLEST_FIRST_FLEET_HULLS.reduce(
      (acc, h) => acc + f.desiredCounts[h],
      0,
    );
    return {
      id: f.id,
      name: f.name,
      liveCount,
      targetCount,
      autoResupply: f.autoResupply,
      isSelected: f.id === selectedFleetId,
    };
  });

  return {
    systems,
    reserves,
    planets,
    wormholes,
    fleets,
    isCreateFleetPending: pendingFleetOrder?.mode === 'create_fleet',
    hasPendingFleetOrder: pendingFleetOrder !== null,
  };
}

export function renderLeftOutlinerHtml(model: LeftOutlinerModel): string {
  const systemsHtml = model.systems
    .map(
      (sys) => `<button class="hud-btn ${sys.isActive ? 'active' : ''}" data-system-id="${sys.id}" title="${sys.name} (${sys.badge})">
        <span class="outliner-btn-label">${sys.name}</span>
        <span class="hud-badge">${sys.badge}</span>
      </button>`,
    )
    .join('');

  const reservesHtml = `<div class="outliner-reserves">
    Reserves: <strong data-hud-field="system-reserves-ore">${model.reserves ? model.reserves.ore : 'Unknown (Unscanned)'}</strong>${model.reserves ? ' &amp; ' : ''}<strong data-hud-field="system-reserves-crystal">${model.reserves ? model.reserves.crystal : ''}</strong> <span data-hud-field="system-reserves-inner">${model.reserves ? model.reserves.inner : ''}</span>
  </div>`;

  const planetsHtml = model.planets
    .map(
      (planet) => `<button class="hud-planet-card ${planet.isSelected ? 'selected' : ''}" data-planet-id="${planet.id}">
        <div class="planet-card-title">${planet.name} <span class="hud-badge">${planet.badge}</span></div>
        <div class="planet-card-meta">${planet.meta}</div>
      </button>`,
    )
    .join('');

  const wormholesHtml = model.wormholes
    .map(
      (wh) => `<button class="hud-btn ${wh.isOpen ? 'active' : ''}" data-wormhole-id="${wh.id}" title="Click to focus • Double-click to transit camera • Right-click with Fleet selected to transit fleet">
        <span class="outliner-btn-label">Gateway → ${wh.destinationName}</span>
        <span class="hud-badge">${wh.isOpen ? 'OPEN VORTEX' : 'DORMANT'}</span>
      </button>`,
    )
    .join('');

  const fleetsHtml = model.fleets
    .map(
      (f) => `<button class="hud-btn ${f.isSelected ? 'active' : ''}" data-select-fleet="${f.id}" title="Click to select and focus camera on ${f.name}">
        <span class="outliner-btn-label">${f.name}</span>
        <span class="hud-badge">${f.liveCount}/${f.targetCount}${f.autoResupply ? ' ↻' : ''}</span>
      </button>`,
    )
    .join('');

  const sectorSectionHtml =
    model.planets.length > 0 || model.wormholes.length > 0
      ? `<div class="outliner-section">
          <div class="hud-label" style="margin-bottom: 0;">Planets &amp; Wormholes</div>
          <div class="outliner-list">
            ${planetsHtml}
            ${wormholesHtml}
          </div>
        </div>`
      : '';

  return `
    <div class="outliner-section">
      <div class="hud-label" style="margin-bottom: 0;">Galaxy</div>
      <div class="outliner-list">
        ${systemsHtml}
      </div>
      ${reservesHtml}
    </div>
    ${sectorSectionHtml}
    <div class="outliner-section">
      <div class="outliner-header">
        <div class="hud-label" style="margin-bottom: 0;">Fleets (${model.fleets.length})</div>
        <button class="hud-btn ${model.isCreateFleetPending ? 'active' : ''}" data-action="create-fleet">
          ${model.isCreateFleetPending ? 'Click 3D Rally...' : '+ New'}
        </button>
      </div>
      <div class="outliner-list">
        ${fleetsHtml}
        ${model.hasPendingFleetOrder ? `<button class="hud-btn" data-action="cancel-fleet-order">Cancel (Esc)</button>` : ''}
      </div>
    </div>
  `;
}
