import type { PlayerSlotId } from '../protocol/commands.ts';

export type MatchPresetId = 'blitz_skirmish' | 'standard_tactical' | 'grand_conquest';

export type FogOfWarMode = 'open_occupied_systems' | 'sensor_range';

export const PLAYER_SLOT_IDS: readonly PlayerSlotId[] = [
  'player_1',
  'player_2',
  'player_3',
  'player_4',
] as const;

export const AI_DIFFICULTY_IDS = ['cadet', 'standard', 'admiral'] as const;
export type AIDifficultyId = (typeof AI_DIFFICULTY_IDS)[number];

export type PlayerSlotConfig =
  | { readonly kind: 'human' }
  | { readonly kind: 'ai'; readonly difficulty: AIDifficultyId }
  | { readonly kind: 'empty' };

export type PlayerSlotConfigMap = Readonly<Record<PlayerSlotId, PlayerSlotConfig>>;

export interface MatchSetupConfig {
  readonly presetId: MatchPresetId;
  readonly localPlayerId: PlayerSlotId;
  readonly slots: PlayerSlotConfigMap;
}

export interface MatchSetupInput {
  readonly presetId?: MatchPresetId;
  readonly localPlayerId?: PlayerSlotId;
  readonly slots?: Partial<Record<PlayerSlotId, PlayerSlotConfig>>;
}

export interface MatchPresetConfig {
  readonly id: MatchPresetId;
  readonly displayName: string;
  readonly targetDurationLabel: string;
  readonly startingOre: number;
  readonly startingCrystal: number;
  readonly harvestRateMultiplier: number;
  readonly asteroidReserveMultiplier: number;
  readonly cncMaxConcurrentDocks: number;
  readonly refineryMaxConcurrentDocks: number;
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
    refineryMaxConcurrentDocks: 4,
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
    refineryMaxConcurrentDocks: 2,
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
    refineryMaxConcurrentDocks: 2,
    fogOfWarMode: 'sensor_range',
    lastCommandAndControlStandingWins: true,
    centralSuperEarthKingOfTheHillSeconds: 600,
  },
} as const;

function isValidPresetId(value: unknown): value is MatchPresetId {
  return typeof value === 'string' && value in MATCH_PRESETS;
}

function isValidAIDifficultyId(value: unknown): value is AIDifficultyId {
  return (
    typeof value === 'string' &&
    (AI_DIFFICULTY_IDS as readonly string[]).includes(value)
  );
}

function normalizeSlotConfig(
  slotId: PlayerSlotId,
  raw: PlayerSlotConfig | undefined,
): PlayerSlotConfig {
  if (!raw) {
    return slotId === 'player_1'
      ? { kind: 'human' }
      : { kind: 'ai', difficulty: 'standard' };
  }
  switch (raw.kind) {
    case 'human':
      return { kind: 'human' };
    case 'empty':
      return { kind: 'empty' };
    case 'ai':
      return {
        kind: 'ai',
        difficulty: isValidAIDifficultyId(raw.difficulty)
          ? raw.difficulty
          : 'standard',
      };
  }
}

export function normalizeMatchSetupConfig(
  input: MatchPresetId | MatchSetupInput = 'standard_tactical',
): MatchSetupConfig {
  if (typeof input === 'string') {
    const presetId = isValidPresetId(input) ? input : 'standard_tactical';
    return {
      presetId,
      localPlayerId: 'player_1',
      slots: {
        player_1: { kind: 'human' },
        player_2: { kind: 'ai', difficulty: 'standard' },
        player_3: { kind: 'ai', difficulty: 'standard' },
        player_4: { kind: 'ai', difficulty: 'standard' },
      },
    };
  }

  const presetId = isValidPresetId(input.presetId)
    ? input.presetId
    : 'standard_tactical';

  const mutableSlots: Record<PlayerSlotId, PlayerSlotConfig> = {
    player_1: normalizeSlotConfig('player_1', input.slots?.player_1),
    player_2: normalizeSlotConfig('player_2', input.slots?.player_2),
    player_3: normalizeSlotConfig('player_3', input.slots?.player_3),
    player_4: normalizeSlotConfig('player_4', input.slots?.player_4),
  };

  const hasActiveSlot = PLAYER_SLOT_IDS.some(
    (id) => mutableSlots[id].kind !== 'empty',
  );
  if (!hasActiveSlot) {
    mutableSlots.player_1 = { kind: 'human' };
  }

  let localPlayerId: PlayerSlotId = 'player_1';
  if (
    input.localPlayerId &&
    (PLAYER_SLOT_IDS as readonly string[]).includes(input.localPlayerId) &&
    mutableSlots[input.localPlayerId].kind !== 'empty'
  ) {
    localPlayerId = input.localPlayerId;
  } else {
    const firstHuman = PLAYER_SLOT_IDS.find(
      (id) => mutableSlots[id].kind === 'human',
    );
    const firstActive = PLAYER_SLOT_IDS.find(
      (id) => mutableSlots[id].kind !== 'empty',
    );
    localPlayerId = firstHuman ?? firstActive ?? 'player_1';
  }

  return {
    presetId,
    localPlayerId,
    slots: mutableSlots,
  };
}

