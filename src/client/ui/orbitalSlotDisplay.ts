import { ORBITAL_STRUCTURES, type OrbitalStructureId } from '../../shared/config/index.ts';

export interface OrbitalSlotStructureSummary {
  readonly id: string;
  readonly kind: 'live' | 'ghost';
  readonly structureId: OrbitalStructureId;
  readonly occupiedSlots: readonly number[];
  readonly isComplete: boolean;
  readonly buildProgressSeconds: number;
  readonly totalBuildTimeSeconds: number;
}

export interface OrbitalSlotPillModel {
  readonly primarySlotIndex: number;
  readonly occupiedSlots: readonly number[];
  readonly stateClass: 'free' | 'occupied' | 'building';
  readonly isSelected: boolean;
  readonly slotPrefix: string;
  readonly structureName: string | null;
  readonly statusText: string;
  readonly isLiveStructure: boolean;
}

function formatSlotPrefix(occupiedSlots: readonly number[]): string {
  const sorted = [...occupiedSlots].sort((a, b) => a - b);
  if (sorted.length === 1) {
    return `S${sorted[0]! + 1}`;
  }
  const first = sorted[0]!;
  const last = sorted[sorted.length - 1]!;
  if (sorted.length === 2 && last === first + 1) {
    return `S${first + 1}-${last + 1}`;
  }
  return `S${sorted.map((s) => s + 1).join('&')}`;
}

export function buildOrbitalSlotPills(
  totalSlots: number,
  isUnexplored: boolean,
  structures: readonly OrbitalSlotStructureSummary[],
  selectedSlotIndex: number,
): readonly OrbitalSlotPillModel[] {
  if (isUnexplored) {
    return Array.from({ length: totalSlots }, (_, idx) => ({
      primarySlotIndex: idx,
      occupiedSlots: [idx],
      stateClass: 'free',
      isSelected: idx === selectedSlotIndex,
      slotPrefix: `Slot ${idx + 1}`,
      structureName: null,
      statusText: 'Unexplored',
      isLiveStructure: false,
    }));
  }

  const pills: OrbitalSlotPillModel[] = [];
  const renderedStructureIds = new Set<string>();

  for (let idx = 0; idx < totalSlots; idx++) {
    const occupying = structures.find((item) => item.occupiedSlots.includes(idx));
    if (!occupying) {
      pills.push({
        primarySlotIndex: idx,
        occupiedSlots: [idx],
        stateClass: 'free',
        isSelected: idx === selectedSlotIndex,
        slotPrefix: `Slot ${idx + 1}`,
        structureName: null,
        statusText: 'Empty',
        isLiveStructure: false,
      });
      continue;
    }

    if (renderedStructureIds.has(occupying.id)) {
      continue;
    }
    renderedStructureIds.add(occupying.id);

    const sortedSlots = [...occupying.occupiedSlots].sort((a, b) => a - b);
    const cfg = ORBITAL_STRUCTURES[occupying.structureId];
    const stateClass = occupying.isComplete ? 'occupied' : 'building';

    if (occupying.kind === 'ghost') {
      pills.push({
        primarySlotIndex: sortedSlots[0] ?? idx,
        occupiedSlots: sortedSlots,
        stateClass,
        isSelected: sortedSlots.includes(selectedSlotIndex),
        slotPrefix: formatSlotPrefix(sortedSlots),
        structureName: cfg.shortName,
        statusText: 'Intel',
        isLiveStructure: false,
      });
    } else {
      const pct = occupying.isComplete
        ? 'Ready'
        : `${Math.floor((occupying.buildProgressSeconds / Math.max(1, occupying.totalBuildTimeSeconds)) * 100)}%`;
      pills.push({
        primarySlotIndex: sortedSlots[0] ?? idx,
        occupiedSlots: sortedSlots,
        stateClass,
        isSelected: sortedSlots.includes(selectedSlotIndex),
        slotPrefix: formatSlotPrefix(sortedSlots),
        structureName: cfg.shortName,
        statusText: pct,
        isLiveStructure: true,
      });
    }
  }

  return pills;
}
