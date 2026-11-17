export type MatchPresetId = 'blitz_skirmish' | 'standard_tactical' | 'grand_conquest';

export type FogOfWarMode = 'open_occupied_systems' | 'sensor_range';

export interface MatchPresetConfig {
  readonly id: MatchPresetId;
  readonly displayName: string;
  readonly targetDurationLabel: string;
  readonly startingOre: number;
  readonly startingCrystal: number;
  readonly harvestRateMultiplier: number;
  readonly asteroidReserveMultiplier: number;
  readonly cncMaxConcurrentDocks: number;
  readonly fogOfWarMode: FogOfWarMode;
  readonly lastCommandAndControlStandingWins: boolean;
  readonly centralSuperEarthKingOfTheHillSeconds: number | null;
}

export const MATCH_PRESETS: Readonly<Record<MatchPresetId, MatchPresetConfig>> = {
  blitz_skirmish: {
    id: 'blitz_skirmish',
    displayName: 'Blitz Skirmish',
    targetDurationLabel: '15–30 Minutes',
    startingOre: 800,
    startingCrystal: 400,
    harvestRateMultiplier: 1.6,
    asteroidReserveMultiplier: 1.0,
    cncMaxConcurrentDocks: 2,
    fogOfWarMode: 'open_occupied_systems',
    lastCommandAndControlStandingWins: true,
    centralSuperEarthKingOfTheHillSeconds: null,
  },
  standard_tactical: {
    id: 'standard_tactical',
    displayName: 'Standard Tactical',
    targetDurationLabel: '20–40 Minutes',
    startingOre: 500,
    startingCrystal: 250,
    harvestRateMultiplier: 1.0,
    asteroidReserveMultiplier: 1.25,
    cncMaxConcurrentDocks: 1,
    fogOfWarMode: 'sensor_range',
    lastCommandAndControlStandingWins: true,
    centralSuperEarthKingOfTheHillSeconds: null,
  },
  grand_conquest: {
    id: 'grand_conquest',
    displayName: 'Grand Conquest',
    targetDurationLabel: '45+ Minutes',
    startingOre: 500,
    startingCrystal: 250,
    harvestRateMultiplier: 1.0,
    asteroidReserveMultiplier: 2.0,
    cncMaxConcurrentDocks: 1,
    fogOfWarMode: 'sensor_range',
    lastCommandAndControlStandingWins: true,
    centralSuperEarthKingOfTheHillSeconds: 600, // 10 minutes continuous control
  },
} as const;
