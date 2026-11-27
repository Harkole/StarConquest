import type { MatchPresetId } from '../../shared/config/index.ts';
import type { PlayerSlotId } from '../../shared/protocol/commands.ts';

export type MatchSessionKind =
  | 'single_player'
  | 'guided_tutorial'
  | 'battle_simulator'
  | 'p2p_host'
  | 'p2p_client';

export interface ActiveMatchSession {
  readonly sessionKind: MatchSessionKind;
  readonly presetId: MatchPresetId;
  readonly isMultiplayer: boolean;
  readonly roomCode: string | null;
}

export interface MatchOutcomeSummary {
  readonly winnerId: PlayerSlotId | null;
  readonly localPlayerWon: boolean;
  readonly reason: 'command_and_control' | 'king_of_the_hill';
}

export type AppScreenState =
  | { readonly kind: 'main_menu' }
  | { readonly kind: 'single_player_setup'; readonly presetId: MatchPresetId }
  | {
      readonly kind: 'host_room_lobby';
      readonly presetId: MatchPresetId;
      readonly roomCode: string | null;
    }
  | { readonly kind: 'join_room_lobby'; readonly roomCode: string }
  | { readonly kind: 'in_match'; readonly session: ActiveMatchSession }
  | { readonly kind: 'pause_menu'; readonly session: ActiveMatchSession }
  | {
      readonly kind: 'match_outcome';
      readonly session: ActiveMatchSession;
      readonly outcome: MatchOutcomeSummary;
    };

export type AppStateEvent =
  | { readonly type: 'OPEN_SINGLE_PLAYER_SETUP'; readonly presetId?: MatchPresetId }
  | {
      readonly type: 'OPEN_HOST_ROOM_LOBBY';
      readonly presetId?: MatchPresetId;
      readonly roomCode?: string | null;
    }
  | { readonly type: 'OPEN_JOIN_ROOM_LOBBY'; readonly roomCode?: string }
  | { readonly type: 'LAUNCH_GUIDED_TUTORIAL' }
  | { readonly type: 'LAUNCH_BATTLE_SIMULATOR' }
  | {
      readonly type: 'START_MATCH';
      readonly presetId?: MatchPresetId;
      readonly roomCode?: string | null;
    }
  | { readonly type: 'PAUSE_MATCH' }
  | { readonly type: 'RESUME_MATCH' }
  | { readonly type: 'RECORD_MATCH_OUTCOME'; readonly outcome: MatchOutcomeSummary }
  | { readonly type: 'REMATCH' }
  | { readonly type: 'BACK_TO_MAIN_MENU' };

export type AppTransitionResult =
  | { readonly ok: true; readonly state: AppScreenState }
  | { readonly ok: false; readonly state: AppScreenState; readonly reason: string };

const DEFAULT_MATCH_PRESET_ID: MatchPresetId = 'standard_tactical';

function rejectTransition(state: AppScreenState, event: AppStateEvent): AppTransitionResult {
  return {
    ok: false,
    state,
    reason: `Cannot handle ${event.type} while in ${state.kind}.`,
  };
}

export function createInitialAppState(): AppScreenState {
  return { kind: 'main_menu' };
}

export function transitionAppState(
  state: AppScreenState,
  event: AppStateEvent,
): AppTransitionResult {
  switch (event.type) {
    case 'OPEN_SINGLE_PLAYER_SETUP':
      if (state.kind !== 'main_menu') {
        return rejectTransition(state, event);
      }
      return {
        ok: true,
        state: {
          kind: 'single_player_setup',
          presetId: event.presetId ?? DEFAULT_MATCH_PRESET_ID,
        },
      };

    case 'OPEN_HOST_ROOM_LOBBY':
      if (state.kind !== 'main_menu') {
        return rejectTransition(state, event);
      }
      return {
        ok: true,
        state: {
          kind: 'host_room_lobby',
          presetId: event.presetId ?? DEFAULT_MATCH_PRESET_ID,
          roomCode: event.roomCode ?? null,
        },
      };

    case 'OPEN_JOIN_ROOM_LOBBY':
      if (state.kind !== 'main_menu') {
        return rejectTransition(state, event);
      }
      return {
        ok: true,
        state: {
          kind: 'join_room_lobby',
          roomCode: event.roomCode ?? '',
        },
      };

    case 'LAUNCH_GUIDED_TUTORIAL':
      if (state.kind !== 'main_menu') {
        return rejectTransition(state, event);
      }
      return {
        ok: true,
        state: {
          kind: 'in_match',
          session: {
            sessionKind: 'guided_tutorial',
            presetId: 'tutorial',
            isMultiplayer: false,
            roomCode: null,
          },
        },
      };

    case 'LAUNCH_BATTLE_SIMULATOR':
      if (state.kind !== 'main_menu') {
        return rejectTransition(state, event);
      }
      return {
        ok: true,
        state: {
          kind: 'in_match',
          session: {
            sessionKind: 'battle_simulator',
            presetId: DEFAULT_MATCH_PRESET_ID,
            isMultiplayer: false,
            roomCode: null,
          },
        },
      };

    case 'START_MATCH':
      switch (state.kind) {
        case 'single_player_setup':
          return {
            ok: true,
            state: {
              kind: 'in_match',
              session: {
                sessionKind: 'single_player',
                presetId: event.presetId ?? state.presetId,
                isMultiplayer: false,
                roomCode: null,
              },
            },
          };
        case 'host_room_lobby':
          return {
            ok: true,
            state: {
              kind: 'in_match',
              session: {
                sessionKind: 'p2p_host',
                presetId: event.presetId ?? state.presetId,
                isMultiplayer: true,
                roomCode: event.roomCode !== undefined ? event.roomCode : state.roomCode,
              },
            },
          };
        case 'join_room_lobby':
          return {
            ok: true,
            state: {
              kind: 'in_match',
              session: {
                sessionKind: 'p2p_client',
                presetId: event.presetId ?? DEFAULT_MATCH_PRESET_ID,
                isMultiplayer: true,
                roomCode:
                  event.roomCode !== undefined
                    ? event.roomCode
                    : state.roomCode.length > 0
                      ? state.roomCode
                      : null,
              },
            },
          };
        case 'main_menu':
        case 'in_match':
        case 'pause_menu':
        case 'match_outcome':
          return rejectTransition(state, event);
        default: {
          const _exhaustive: never = state;
          return _exhaustive;
        }
      }

    case 'PAUSE_MATCH':
      if (state.kind !== 'in_match') {
        return rejectTransition(state, event);
      }
      return {
        ok: true,
        state: {
          kind: 'pause_menu',
          session: state.session,
        },
      };

    case 'RESUME_MATCH':
      if (state.kind !== 'pause_menu') {
        return rejectTransition(state, event);
      }
      return {
        ok: true,
        state: {
          kind: 'in_match',
          session: state.session,
        },
      };

    case 'RECORD_MATCH_OUTCOME':
      if (state.kind !== 'in_match') {
        return rejectTransition(state, event);
      }
      return {
        ok: true,
        state: {
          kind: 'match_outcome',
          session: state.session,
          outcome: event.outcome,
        },
      };

    case 'REMATCH':
      if (state.kind !== 'match_outcome') {
        return rejectTransition(state, event);
      }
      return {
        ok: true,
        state: {
          kind: 'single_player_setup',
          presetId: state.session.presetId,
        },
      };

    case 'BACK_TO_MAIN_MENU':
      switch (state.kind) {
        case 'single_player_setup':
        case 'host_room_lobby':
        case 'join_room_lobby':
        case 'pause_menu':
        case 'match_outcome':
          return {
            ok: true,
            state: { kind: 'main_menu' },
          };
        case 'main_menu':
        case 'in_match':
          return rejectTransition(state, event);
        default: {
          const _exhaustive: never = state;
          return _exhaustive;
        }
      }

    default: {
      const _exhaustive: never = event;
      return _exhaustive;
    }
  }
}

export function isMatchRuntimeActive(state: AppScreenState): boolean {
  switch (state.kind) {
    case 'in_match':
    case 'pause_menu':
    case 'match_outcome':
      return true;
    case 'main_menu':
    case 'single_player_setup':
    case 'host_room_lobby':
    case 'join_room_lobby':
      return false;
    default: {
      const _exhaustive: never = state;
      return _exhaustive;
    }
  }
}

export function shouldTickSimulation(state: AppScreenState): boolean {
  switch (state.kind) {
    case 'in_match':
      return true;
    case 'pause_menu':
      return state.session.isMultiplayer;
    case 'main_menu':
    case 'single_player_setup':
    case 'host_room_lobby':
    case 'join_room_lobby':
    case 'match_outcome':
      return false;
    default: {
      const _exhaustive: never = state;
      return _exhaustive;
    }
  }
}
