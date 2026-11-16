export type PlanetClassId = 'small' | 'medium' | 'large' | 'super_earth';

export type PlanetVisualTheme = 'terran' | 'super_earth' | 'volcanic_lava' | 'barren_rock';

export interface PlanetClassConfig {
  readonly id: PlanetClassId;
  readonly displayName: string;
  readonly orbitalSlots: number;
  readonly radiusUnits: number;
  readonly allowedVisualThemes: readonly PlanetVisualTheme[];
}

export const PLANET_CLASSES: Readonly<Record<PlanetClassId, PlanetClassConfig>> = {
  small: {
    id: 'small',
    displayName: 'Small Planet',
    orbitalSlots: 6,
    radiusUnits: 14,
    allowedVisualThemes: ['barren_rock', 'volcanic_lava'],
  },
  medium: {
    id: 'medium',
    displayName: 'Medium Planet',
    orbitalSlots: 8,
    radiusUnits: 20,
    allowedVisualThemes: ['barren_rock', 'volcanic_lava', 'terran'],
  },
  large: {
    id: 'large',
    displayName: 'Large Planet (Homeworld)',
    orbitalSlots: 10,
    radiusUnits: 28,
    allowedVisualThemes: ['terran', 'volcanic_lava'],
  },
  super_earth: {
    id: 'super_earth',
    displayName: 'Super-Earth',
    orbitalSlots: 12,
    radiusUnits: 38,
    allowedVisualThemes: ['super_earth'],
  },
} as const;
