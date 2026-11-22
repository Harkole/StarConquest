import type { PlayerSlotId } from '../../shared/protocol/commands.ts';

export interface FactionVisualPalette {
  /** Primary armor accent color (replaces weathered ochre trim on non-player_1 factions). */
  readonly accentHex: number;
  /** Bright tactical ring, orbital track, and HUD ownership indicator color. */
  readonly tacticalHex: number;
  /** Engine exhaust / emissive trim tint for instant friend-or-foe readability. */
  readonly engineColor: readonly [number, number, number];
  readonly label: string;
}

/**
 * Per-player faction color palettes across all 4 player slots.
 * `player_1` retains the canonical industrial Weathered Ochre + Allied Cyan theme
 * from `docs/artstyle.md`; `player_2`..`player_4` use high-contrast Crimson, Emerald,
 * and Solar Gold trims so friendly vs. hostile ships and bases are unmistakable.
 */
export const FACTION_PALETTES: Readonly<Record<PlayerSlotId, FactionVisualPalette>> = {
  player_1: {
    accentHex: 0x8b5cf6,
    tacticalHex: 0xa855f7,
    engineColor: [0.95, 0.45, 1.45],
    label: 'Player 1 (Purple)',
  },
  player_2: {
    accentHex: 0xdc2626,
    tacticalHex: 0xef4444,
    engineColor: [1.4, 0.35, 0.25],
    label: 'Player 2 (Crimson)',
  },
  player_3: {
    accentHex: 0x16a34a,
    tacticalHex: 0x22c55e,
    engineColor: [0.3, 1.35, 0.55],
    label: 'Player 3 (Emerald)',
  },
  player_4: {
    accentHex: 0xeab308,
    tacticalHex: 0xf59e0b,
    engineColor: [1.4, 1.05, 0.25],
    label: 'Player 4 (Solar Gold)',
  },
};
