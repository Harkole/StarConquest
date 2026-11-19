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
 * - Vast spatial layout (~4,400 x 4,400 units per system) so planets, asteroid belts, and wormholes
 *   have wide deep-space travel corridors between them (preventing instant wormhole firefights and
 *   providing stealth corridors for Harvesters and raiding fleets outside sensor ranges).
 * - 4 outer Starter Systems (each with 1 guaranteed Large 10-slot Homeworld + secondary Small/Medium planets,
 *   and an identical, balanced Ore-heavy / Crystal-scarce resource profile so all players have a fair start
 *   and must expand outside their starter system once local Crystal and Inner Belt deposits deplete).
 * - 1 Central Neutral System (anchored by 1 Super-Earth 12-slot planet + secondary worlds + enriched high-yield
 *   Ore/Crystal deposits + 4 permanent open wormholes).
 */
export function createFiveSystemGalaxy(): GalaxyTopology {
  const systems: StarSystemNode[] = [];
  const wormholes: WormholeLink[] = [];

  STARTER_SLOTS.forEach((slotId, index) => {
    const systemId = `system_starter_${index + 1}`;
    const resourceSkew: ResourceSkew = 'ore_heavy';
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

    // Secondary planets placed 850–1,250 units away in distinct quadrants
    const secondarySmall: PlanetNode = {
      id: `${systemId}_planet_2`,
      systemId,
      name: `Sector ${index + 1} Minoris`,
      planetClass: 'small',
      orbitalSlots: PLANET_CLASSES.small.orbitalSlots,
      visualTheme: 'volcanic_lava',
      position: { x: 820, z: -560 },
      ownerId: null,
    };

    const secondaryMedium: PlanetNode = {
      id: `${systemId}_planet_3`,
      systemId,
      name: `Sector ${index + 1} Secundus`,
      planetClass: 'medium',
      orbitalSlots: PLANET_CLASSES.medium.orbitalSlots,
      visualTheme: 'barren_rock',
      position: { x: -780, z: 680 },
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

    // Wormholes placed far out on the system perimeter (1,850–2,050 units from center)
    const angle = (index * Math.PI) / 2;
    wormholes.push({
      id: `wormhole_${index + 1}_to_hub`,
      fromSystemId: systemId,
      toSystemId: 'system_central_hub',
      fromPosition: { x: Math.cos(angle) * 1850, z: Math.sin(angle) * 1850 },
      toPosition: { x: Math.cos(angle) * 2050, z: Math.sin(angle) * 2050 },
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
        position: { x: 960, z: 840 },
        ownerId: null,
      },
      {
        id: 'system_central_hub_rock_2',
        systemId: 'system_central_hub',
        name: 'Aegis Rim',
        planetClass: 'medium',
        orbitalSlots: PLANET_CLASSES.medium.orbitalSlots,
        visualTheme: 'barren_rock',
        position: { x: -940, z: -860 },
        ownerId: null,
      },
    ],
  };

  systems.push(centralHub);

  return { systems, wormholes };
}
