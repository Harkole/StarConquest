import { describe, expect, it } from 'vitest';
import {
  buildOrbitalSlotPills,
  type OrbitalSlotStructureSummary,
} from '../orbitalSlotDisplay.ts';

describe('buildOrbitalSlotPills', () => {
  it('merges 2-slot structures into a single labeled pill and shows platform short names', () => {
    const structures: OrbitalSlotStructureSummary[] = [
      {
        id: 'struct_cnc',
        kind: 'live',
        structureId: 'command_and_control',
        occupiedSlots: [0, 1],
        isComplete: true,
        buildProgressSeconds: 0,
        totalBuildTimeSeconds: 0,
      },
      {
        id: 'struct_ref',
        kind: 'live',
        structureId: 'refinery',
        occupiedSlots: [2],
        isComplete: true,
        buildProgressSeconds: 20,
        totalBuildTimeSeconds: 20,
      },
      {
        id: 'struct_dock',
        kind: 'live',
        structureId: 'orbital_dockyard',
        occupiedSlots: [3, 4],
        isComplete: false,
        buildProgressSeconds: 15,
        totalBuildTimeSeconds: 30,
      },
      {
        id: 'struct_tech',
        kind: 'live',
        structureId: 'tech_module',
        occupiedSlots: [5],
        isComplete: true,
        buildProgressSeconds: 25,
        totalBuildTimeSeconds: 25,
      },
      {
        id: 'struct_def',
        kind: 'live',
        structureId: 'heavy_defense_platform',
        occupiedSlots: [6, 7],
        isComplete: true,
        buildProgressSeconds: 35,
        totalBuildTimeSeconds: 35,
      },
    ];

    const pills = buildOrbitalSlotPills(10, false, structures, 1);

    // 10 slots minus 3 merged second slots = 7 pills
    expect(pills).toHaveLength(7);

    expect(pills[0]).toMatchObject({
      primarySlotIndex: 0,
      occupiedSlots: [0, 1],
      slotPrefix: 'S1-2',
      structureName: 'Command & Control',
      statusText: 'Ready',
      stateClass: 'occupied',
      isSelected: true,
    });

    expect(pills[1]).toMatchObject({
      primarySlotIndex: 2,
      occupiedSlots: [2],
      slotPrefix: 'S3',
      structureName: 'Refinery',
      statusText: 'Ready',
    });

    expect(pills[2]).toMatchObject({
      primarySlotIndex: 3,
      occupiedSlots: [3, 4],
      slotPrefix: 'S4-5',
      structureName: 'Orbital Dockyard',
      statusText: '50%',
      stateClass: 'building',
    });

    expect(pills[3]).toMatchObject({
      primarySlotIndex: 5,
      slotPrefix: 'S6',
      structureName: 'Tech Module',
      statusText: 'Ready',
    });

    expect(pills[4]).toMatchObject({
      primarySlotIndex: 6,
      occupiedSlots: [6, 7],
      slotPrefix: 'S7-8',
      structureName: 'Heavy Defense',
      statusText: 'Ready',
    });

    expect(pills[5]).toMatchObject({
      primarySlotIndex: 8,
      slotPrefix: 'Slot 9',
      structureName: null,
      statusText: 'Empty',
    });
    expect(pills[6]).toMatchObject({
      primarySlotIndex: 9,
      slotPrefix: 'Slot 10',
      structureName: null,
      statusText: 'Empty',
    });
  });

  it('merges wrap-around 2-slot structures and formats ghost intel pills', () => {
    const structures: OrbitalSlotStructureSummary[] = [
      {
        id: 'struct_wrap',
        kind: 'ghost',
        structureId: 'orbital_dockyard',
        occupiedSlots: [9, 0],
        isComplete: true,
        buildProgressSeconds: 30,
        totalBuildTimeSeconds: 30,
      },
    ];

    const pills = buildOrbitalSlotPills(10, false, structures, 9);
    expect(pills).toHaveLength(9);
    expect(pills[0]).toMatchObject({
      primarySlotIndex: 0,
      occupiedSlots: [0, 9],
      slotPrefix: 'S1&10',
      structureName: 'Orbital Dockyard',
      statusText: 'Intel',
      isSelected: true,
      isLiveStructure: false,
    });
  });
});
