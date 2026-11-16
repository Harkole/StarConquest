import {
  PLANET_CLASSES,
  type PlanetClassId,
  type PlanetVisualTheme,
} from '../config/index.ts';
import type { PlayerSlotId, Vector2D } from '../protocol/commands.ts';

export type ResourceSkew = 'ore_heavy' | 'crystal_heavy' | 'balanced_rich';

export interface PlanetNode {
  readonly id: string;
  readonly systemId: string;
  readonly name: string;
  readonly planetClass: PlanetClassId;
  readonly orbitalSlots: number;
  readonly visualTheme: PlanetVisualTheme;
  readonly position: Vector2D;
  readonly ownerId: PlayerSlotId | null;
}

export interface WormholeLink {
  readonly id: string;
  readonly fromSystemId: string;
  readonly toSystemId: string;
  readonly fromPosition: Vector2D;
  readonly toPosition: Vector2D;
}

export interface StarSystemNode {
  readonly id: string;
  readonly name: string;
  readonly isCentralHub: boolean;
  readonly starterOwnerSlot: PlayerSlotId | null;
  readonly resourceSkew: ResourceSkew;
  readonly nebulaPalette: 'cyan_magenta' | 'golden_expanse' | 'crimson_rift' | 'emerald_veil' | 'violet_core';
  readonly planets: readonly PlanetNode[];
}

export interface GalaxyTopology {
  readonly systems: readonly StarSystemNode[];
  readonly wormholes: readonly WormholeLink[];
}

const STARTER_SLOTS: readonly PlayerSlotId[] = [
  'player_1',
  'player_2',
  'player_3',
  'player_4',
];

const STARTER_NEBULA_PALETTES = [
  'cyan_magenta',
  'golden_expanse',
  'crimson_rift',
  'emerald_veil',
] as const;

/**
 * Generates the canonical 5-system hub-and-spoke galaxy defined in README.md:
 * - 4 outer Starter Systems (each with 1 guaranteed Large 10-slot Homeworld + secondary Small/Medium planets,
 *   and an alternating Ore-heavy / Crystal-heavy resource skew).
 * - 1 Central Neutral System (anchored by 1 Super-Earth 12-slot planet + 4 permanent open wormholes).
 */
export function createFiveSystemGalaxy(): GalaxyTopology {
  const systems: StarSystemNode[] = [];
  const wormholes: WormholeLink[] = [];

  STARTER_SLOTS.forEach((slotId, index) => {
    const systemId = `system_starter_${index + 1}`;
    const resourceSkew: ResourceSkew = index % 2 === 0 ? 'ore_heavy' : 'crystal_heavy';
    const nebulaPalette = STARTER_NEBULA_PALETTES[index] ?? 'cyan_magenta';

    const homeworld: PlanetNode = {
      id: `${systemId}_homeworld`,
      systemId,
      name: `Sector ${index + 1} Prime`,
      planetClass: 'large',
      orbitalSlots: PLANET_CLASSES.large.orbitalSlots,
      visualTheme: 'terran',
      position: { x: 0, z: 0 },
      ownerId: slotId,
    };

    const secondarySmall: PlanetNode = {
      id: `${systemId}_planet_2`,
      systemId,
      name: `Sector ${index + 1} Minoris`,
      planetClass: 'small',
      orbitalSlots: PLANET_CLASSES.small.orbitalSlots,
      visualTheme: 'volcanic_lava',
      position: { x: 180, z: -120 },
      ownerId: null,
    };

    const secondaryMedium: PlanetNode = {
      id: `${systemId}_planet_3`,
      systemId,
      name: `Sector ${index + 1} Secundus`,
      planetClass: 'medium',
      orbitalSlots: PLANET_CLASSES.medium.orbitalSlots,
      visualTheme: 'barren_rock',
      position: { x: -160, z: 140 },
      ownerId: null,
    };

    systems.push({
      id: systemId,
      name: `Starter System ${index + 1}`,
      isCentralHub: false,
      starterOwnerSlot: slotId,
      resourceSkew,
      nebulaPalette,
      planets: [homeworld, secondarySmall, secondaryMedium],
    });

    const angle = (index * Math.PI) / 2;
    wormholes.push({
      id: `wormhole_${index + 1}_to_hub`,
      fromSystemId: systemId,
      toSystemId: 'system_central_hub',
      fromPosition: { x: Math.cos(angle) * 320, z: Math.sin(angle) * 320 },
      toPosition: { x: Math.cos(angle) * 360, z: Math.sin(angle) * 360 },
    });
  });

  const centralHub: StarSystemNode = {
    id: 'system_central_hub',
    name: 'Central Nexus',
    isCentralHub: true,
    starterOwnerSlot: null,
    resourceSkew: 'balanced_rich',
    nebulaPalette: 'violet_core',
    planets: [
      {
        id: 'system_central_hub_super_earth',
        systemId: 'system_central_hub',
        name: 'Nexus Super-Earth',
        planetClass: 'super_earth',
        orbitalSlots: PLANET_CLASSES.super_earth.orbitalSlots,
        visualTheme: 'super_earth',
        position: { x: 0, z: 0 },
        ownerId: null,
      },
      {
        id: 'system_central_hub_lava_1',
        systemId: 'system_central_hub',
        name: 'Pyre Outpost',
        planetClass: 'small',
        orbitalSlots: PLANET_CLASSES.small.orbitalSlots,
        visualTheme: 'volcanic_lava',
        position: { x: 220, z: 180 },
        ownerId: null,
      },
    ],
  };

  systems.push(centralHub);

  return { systems, wormholes };
}
