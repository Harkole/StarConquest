import {
  DEEP_SPACE_STRUCTURES,
  SHIP_CLASSES,
} from '../../shared/config/index.ts';
import type { FleetStance, PlayerSlotId } from '../../shared/protocol/commands.ts';
import {
  SMALLEST_FIRST_FLEET_HULLS,
  type FleetInstance,
} from '../../shared/sim/gameSimulation.ts';
import type { ProjectedDeepSpaceStructure } from '../../shared/sim/playerIntel.ts';
import type { SimulationView } from '../../shared/sim/simulationView.ts';

export type HudSelectionState =
  | { readonly kind: 'planet'; readonly planetId: string }
  | { readonly kind: 'fleet'; readonly fleetId: string }
  | { readonly kind: 'harvester'; readonly harvesterId: string }
  | { readonly kind: 'deep_space'; readonly structureId: string }
  | { readonly kind: 'none' };

export interface ResolveHudSelectionParams {
  readonly selectedFleetId: string | null;
  readonly selectedHarvesterId: string | null;
  readonly selectedDeepSpaceId: string | null;
  readonly selectedPlanetId: string | null;
}

export function resolveHudSelectionState(
  params: ResolveHudSelectionParams,
): HudSelectionState {
  if (params.selectedFleetId) {
    return { kind: 'fleet', fleetId: params.selectedFleetId };
  }
  if (params.selectedHarvesterId) {
    return { kind: 'harvester', harvesterId: params.selectedHarvesterId };
  }
  if (params.selectedDeepSpaceId) {
    return { kind: 'deep_space', structureId: params.selectedDeepSpaceId };
  }
  if (params.selectedPlanetId) {
    return { kind: 'planet', planetId: params.selectedPlanetId };
  }
  return { kind: 'none' };
}

const FLEET_STANCE_OPTIONS: readonly { readonly id: FleetStance; readonly label: string }[] = [
  { id: 'aggressive', label: 'Aggressive' },
  { id: 'hold_the_line', label: 'Hold the Line' },
  { id: 'passive', label: 'Passive' },
];

export interface RenderFleetInspectorParams {
  readonly sim: SimulationView;
  readonly playerId: PlayerSlotId;
  readonly fleet: FleetInstance;
  readonly allPlayerFleets: readonly FleetInstance[];
  readonly pendingFleetOrder: {
    readonly mode: string;
    readonly fleetId?: string;
    readonly waypointCount: number;
  } | null;
}

export function renderFleetInspectorHtml(params: RenderFleetInspectorParams): string {
  const { sim, playerId, fleet, allPlayerFleets, pendingFleetOrder } = params;
  const fleetShips = sim.getShipsInFleet(fleet.id);
  const isFleetPatrolPending =
    pendingFleetOrder?.mode === 'fleet_patrol' &&
    pendingFleetOrder.fleetId === fleet.id;
  const otherFleets = allPlayerFleets.filter((f) => f.id !== fleet.id);
  const techCount = sim.getPlayerTechModuleCount(playerId);

  const hullCardsHtml = SMALLEST_FIRST_FLEET_HULLS.map((hull) => {
    const sCfg = SHIP_CLASSES[hull];
    const live = fleetShips.filter((s) => s.shipClassId === hull).length;
    const desired = fleet.desiredCounts[hull];
    const isTechLocked = techCount < sCfg.requiredTechModuleCount;
    const lockHtml = isTechLocked
      ? `<div class="fleet-hull-lock">Req ${sCfg.requiredTechModuleCount} Tech</div>`
      : '';
    return `<div class="fleet-hull-card" data-fleet-hull-card="${hull}">
      <div class="fleet-hull-card-header">
        <span class="fleet-hull-name" title="${sCfg.displayName}">${sCfg.displayName}</span>
        <span class="hud-badge fleet-hull-supply">${sCfg.supplyCost} Sup</span>
      </div>
      <div class="fleet-hull-stepper">
        <button type="button" class="hud-btn" data-fleet-dec="${hull}" data-fleet-id="${fleet.id}" ${desired <= 0 ? 'disabled' : ''}>−</button>
        <span class="fleet-hull-count"><strong>${live}</strong> / ${desired}</span>
        <button type="button" class="hud-btn" data-fleet-inc="${hull}" data-fleet-id="${fleet.id}">+</button>
      </div>
      ${lockHtml}
    </div>`;
  }).join('');

  const fleetStanceBtns = FLEET_STANCE_OPTIONS.map(
    (opt) =>
      `<button type="button" class="hud-btn ${fleet.stance === opt.id ? 'active' : ''}" data-fleet-stance="${opt.id}" data-fleet-id="${fleet.id}">${opt.label}</button>`,
  ).join('');

  const mergeBtns = otherFleets
    .map(
      (other) =>
        `<button type="button" class="hud-btn" data-fleet-merge-src="${fleet.id}" data-fleet-merge-dst="${other.id}">Merge → ${other.name}</button>`,
    )
    .join('');

  return `
    <div class="slot-detail-box" data-inspector-kind="fleet" style="flex-direction: column; align-items: stretch;">
      <div style="display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap;">
        <div>
          <strong>${fleet.name}</strong> — ${fleetShips.length} ship${fleetShips.length === 1 ? '' : 's'} • Right-click space to Move • Right-click hostile to Attack
        </div>
        <div class="hud-btn-row">
          <button type="button" class="hud-btn" data-fleet-focus="${fleet.id}" title="Jump camera to ${fleet.name}">
            Focus
          </button>
          <button type="button" class="hud-btn ${fleet.autoResupply ? 'active' : ''}" data-fleet-resupply="${fleet.id}">
            Resupply: ${fleet.autoResupply ? 'ON ↻' : 'OFF'}
          </button>
          <button type="button" class="hud-btn ${isFleetPatrolPending ? 'active' : ''}" data-fleet-patrol="${fleet.id}">
            ${isFleetPatrolPending ? `Patrol Wp #${(pendingFleetOrder?.waypointCount ?? 0) + 1}/2...` : 'Patrol Route (2 Clicks)'}
          </button>
          <button type="button" class="hud-btn ${fleet.orderType === 'flee' ? 'active' : ''}" data-fleet-flee="${fleet.id}" title="Flee at full speed to the nearest Logistics Hub, Planetary Outpost, or C&C">
            Flee
          </button>
          <button type="button" class="hud-btn" data-fleet-split="${fleet.id}" ${fleetShips.length < 2 ? 'disabled' : ''}>Split</button>
          ${mergeBtns}
          <button type="button" class="hud-btn" data-fleet-disband="${fleet.id}">Disband</button>
          <button type="button" class="hud-btn" data-action="clear-selection">Close</button>
        </div>
      </div>
      <div class="fleet-hull-grid">
        ${hullCardsHtml}
      </div>
      <div class="hud-btn-row" style="margin-top: 6px;">
        <span class="econ-label" style="margin-right: 4px;">STANCE:</span>
        ${fleetStanceBtns}
      </div>
    </div>
  `;
}

export function renderDeepSpaceInspectorHtml(
  item: ProjectedDeepSpaceStructure,
  elapsedSeconds: number,
  formatAge: (ageSeconds: number) => string,
): string {
  const ds = item.kind === 'live' ? item.structure : item;
  const cfg = DEEP_SPACE_STRUCTURES[ds.structureId];
  const isGhost = item.kind === 'ghost';
  const statusText = isGhost
    ? `Last Known (${formatAge(elapsedSeconds - item.observedAtSeconds)})`
    : item.structure.isComplete
      ? 'Operational'
      : `Constructing (${Math.floor((item.structure.buildProgressSeconds / Math.max(1, item.structure.totalBuildTimeSeconds)) * 100)}%)`;
  const roleSummary =
    ds.structureId === 'logistics_hub'
      ? `${cfg.buildRadiusProvided}u Tower Build Radius • Forward Fighter Operations • +${cfg.supplyProvided} Fleet Supply`
      : ds.structureId === 'point_defence_tower'
        ? 'Rapid-tracking Point Defence array (shreds Fighters and Destroyers)'
        : 'High-alpha heavy siege battery (crushes capital ships once shields collapse)';

  return `
    <div class="slot-detail-box" data-inspector-kind="deep_space" style="flex-direction: column; align-items: stretch;">
      <div style="display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap;">
        <div>
          <strong>${cfg.displayName}</strong>
          <span class="hud-badge" data-hud-field="deepspace-status">${statusText}</span>
          <span class="hud-badge">${ds.ownerId.toUpperCase()}</span>
        </div>
        <div class="hud-btn-row">
          <button type="button" class="hud-btn" data-focus-deepspace="${ds.id}">Focus</button>
          <button type="button" class="hud-btn" data-action="clear-selection">Close</button>
        </div>
      </div>
      <div style="margin-top: 4px; font-size: 0.72rem; color: #cbd5e1; display: flex; flex-wrap: wrap; gap: 12px;">
        <span><strong>Coords:</strong> (${Math.round(ds.position.x)}, ${Math.round(ds.position.z)})</span>
        <span data-hud-field="deepspace-hp"><strong>Shields:</strong> ${Math.round(ds.shields)}/${cfg.maxShields} • <strong>Hull:</strong> ${Math.round(ds.hull)}/${cfg.maxHull}</span>
      </div>
      <div style="margin-top: 4px; font-size: 0.7rem; color: #94a3b8;">${roleSummary}</div>
    </div>
  `;
}

export function renderEmptySelectionHintHtml(): string {
  return `<div class="hud-empty-hint-pill" data-inspector-kind="none">
    Select a Planet, Fleet, Harvester, or Deep-Space Station to inspect • Left-Drag / WASD: Pan • Right-Drag: Orbit • Scroll: Zoom
  </div>`;
}
