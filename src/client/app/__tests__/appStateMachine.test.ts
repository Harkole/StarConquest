import { describe, expect, it } from 'vitest';
import {
  createInitialAppState,
  isMatchRuntimeActive,
  shouldTickSimulation,
  transitionAppState,
  type ActiveMatchSession,
  type AppScreenState,
  type AppStateEvent,
  type MatchOutcomeSummary,
} from '../appStateMachine.ts';

const LOCAL_SESSION: ActiveMatchSession = {
  sessionKind: 'single_player',
  presetId: 'blitz_skirmish',
  isMultiplayer: false,
  roomCode: null,
};

const MULTIPLAYER_SESSION: ActiveMatchSession = {
  sessionKind: 'p2p_host',
  presetId: 'grand_conquest',
  isMultiplayer: true,
  roomCode: 'STAR-42',
};

const VICTORY_OUTCOME: MatchOutcomeSummary = {
  winnerId: 'player_1',
  localPlayerWon: true,
  reason: 'command_and_control',
};

describe('appStateMachine', () => {
  it('starts in main_menu', () => {
    expect(createInitialAppState()).toEqual({ kind: 'main_menu' });
  });

  describe('valid transitions', () => {
    it('opens single_player_setup from main_menu with default or custom preset', () => {
      const initial = createInitialAppState();

      const defaultRes = transitionAppState(initial, { type: 'OPEN_SINGLE_PLAYER_SETUP' });
      expect(defaultRes).toEqual({
        ok: true,
        state: { kind: 'single_player_setup', presetId: 'standard_tactical' },
      });

      const customRes = transitionAppState(initial, {
        type: 'OPEN_SINGLE_PLAYER_SETUP',
        presetId: 'grand_conquest',
      });
      expect(customRes).toEqual({
        ok: true,
        state: { kind: 'single_player_setup', presetId: 'grand_conquest' },
      });
    });

    it('opens host_room_lobby and join_room_lobby from main_menu', () => {
      const initial = createInitialAppState();

      const hostRes = transitionAppState(initial, {
        type: 'OPEN_HOST_ROOM_LOBBY',
        presetId: 'blitz_skirmish',
        roomCode: 'ALPHA-7',
      });
      expect(hostRes).toEqual({
        ok: true,
        state: {
          kind: 'host_room_lobby',
          presetId: 'blitz_skirmish',
          roomCode: 'ALPHA-7',
        },
      });

      const hostDefaultRes = transitionAppState(initial, { type: 'OPEN_HOST_ROOM_LOBBY' });
      expect(hostDefaultRes).toEqual({
        ok: true,
        state: {
          kind: 'host_room_lobby',
          presetId: 'standard_tactical',
          roomCode: null,
        },
      });

      const joinRes = transitionAppState(initial, {
        type: 'OPEN_JOIN_ROOM_LOBBY',
        roomCode: 'BRAVO-9',
      });
      expect(joinRes).toEqual({
        ok: true,
        state: { kind: 'join_room_lobby', roomCode: 'BRAVO-9' },
      });

      const joinDefaultRes = transitionAppState(initial, { type: 'OPEN_JOIN_ROOM_LOBBY' });
      expect(joinDefaultRes).toEqual({
        ok: true,
        state: { kind: 'join_room_lobby', roomCode: '' },
      });
    });

    it('launches guided tutorial and battle simulator directly into in_match', () => {
      const initial = createInitialAppState();

      const tutorialRes = transitionAppState(initial, { type: 'LAUNCH_GUIDED_TUTORIAL' });
      expect(tutorialRes).toEqual({
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
      });

      const simRes = transitionAppState(initial, { type: 'LAUNCH_BATTLE_SIMULATOR' });
      expect(simRes).toEqual({
        ok: true,
        state: {
          kind: 'in_match',
          session: {
            sessionKind: 'battle_simulator',
            presetId: 'standard_tactical',
            isMultiplayer: false,
            roomCode: null,
          },
        },
      });
    });

    it('starts a match from single_player_setup, host_room_lobby, and join_room_lobby', () => {
      const spStart = transitionAppState(
        { kind: 'single_player_setup', presetId: 'blitz_skirmish' },
        { type: 'START_MATCH' },
      );
      expect(spStart).toEqual({
        ok: true,
        state: {
          kind: 'in_match',
          session: {
            sessionKind: 'single_player',
            presetId: 'blitz_skirmish',
            isMultiplayer: false,
            roomCode: null,
          },
        },
      });

      const spOverride = transitionAppState(
        { kind: 'single_player_setup', presetId: 'blitz_skirmish' },
        { type: 'START_MATCH', presetId: 'grand_conquest' },
      );
      expect(spOverride).toEqual({
        ok: true,
        state: {
          kind: 'in_match',
          session: {
            sessionKind: 'single_player',
            presetId: 'grand_conquest',
            isMultiplayer: false,
            roomCode: null,
          },
        },
      });

      const hostStart = transitionAppState(
        { kind: 'host_room_lobby', presetId: 'grand_conquest', roomCode: 'HOST-1' },
        { type: 'START_MATCH' },
      );
      expect(hostStart).toEqual({
        ok: true,
        state: {
          kind: 'in_match',
          session: {
            sessionKind: 'p2p_host',
            presetId: 'grand_conquest',
            isMultiplayer: true,
            roomCode: 'HOST-1',
          },
        },
      });

      const joinStart = transitionAppState(
        { kind: 'join_room_lobby', roomCode: 'JOIN-2' },
        { type: 'START_MATCH', presetId: 'blitz_skirmish' },
      );
      expect(joinStart).toEqual({
        ok: true,
        state: {
          kind: 'in_match',
          session: {
            sessionKind: 'p2p_client',
            presetId: 'blitz_skirmish',
            isMultiplayer: true,
            roomCode: 'JOIN-2',
          },
        },
      });

      const joinEmptyRoomStart = transitionAppState(
        { kind: 'join_room_lobby', roomCode: '' },
        { type: 'START_MATCH' },
      );
      expect(joinEmptyRoomStart).toEqual({
        ok: true,
        state: {
          kind: 'in_match',
          session: {
            sessionKind: 'p2p_client',
            presetId: 'standard_tactical',
            isMultiplayer: true,
            roomCode: null,
          },
        },
      });
    });

    it('pauses and resumes an active match while preserving session', () => {
      const inMatch: AppScreenState = { kind: 'in_match', session: MULTIPLAYER_SESSION };
      const paused = transitionAppState(inMatch, { type: 'PAUSE_MATCH' });
      expect(paused).toEqual({
        ok: true,
        state: { kind: 'pause_menu', session: MULTIPLAYER_SESSION },
      });

      const resumed = transitionAppState(paused.state, { type: 'RESUME_MATCH' });
      expect(resumed).toEqual({
        ok: true,
        state: { kind: 'in_match', session: MULTIPLAYER_SESSION },
      });
    });

    it('records match outcome and supports rematch carrying presetId', () => {
      const inMatch: AppScreenState = { kind: 'in_match', session: LOCAL_SESSION };
      const outcomeRes = transitionAppState(inMatch, {
        type: 'RECORD_MATCH_OUTCOME',
        outcome: VICTORY_OUTCOME,
      });
      expect(outcomeRes).toEqual({
        ok: true,
        state: {
          kind: 'match_outcome',
          session: LOCAL_SESSION,
          outcome: VICTORY_OUTCOME,
        },
      });

      const rematchRes = transitionAppState(outcomeRes.state, { type: 'REMATCH' });
      expect(rematchRes).toEqual({
        ok: true,
        state: { kind: 'single_player_setup', presetId: 'blitz_skirmish' },
      });
    });

    it('returns to main_menu from setup, lobbies, pause_menu, and match_outcome', () => {
      const returnableStates: readonly AppScreenState[] = [
        { kind: 'single_player_setup', presetId: 'standard_tactical' },
        { kind: 'host_room_lobby', presetId: 'standard_tactical', roomCode: 'ROOM-1' },
        { kind: 'join_room_lobby', roomCode: 'ROOM-2' },
        { kind: 'pause_menu', session: LOCAL_SESSION },
        { kind: 'match_outcome', session: LOCAL_SESSION, outcome: VICTORY_OUTCOME },
      ];

      for (const state of returnableStates) {
        expect(transitionAppState(state, { type: 'BACK_TO_MAIN_MENU' })).toEqual({
          ok: true,
          state: { kind: 'main_menu' },
        });
      }
    });
  });

  describe('invalid transitions', () => {
    const invalidCases: readonly {
      readonly label: string;
      readonly state: AppScreenState;
      readonly event: AppStateEvent;
    }[] = [
      {
        label: 'START_MATCH from main_menu',
        state: { kind: 'main_menu' },
        event: { type: 'START_MATCH' },
      },
      {
        label: 'START_MATCH from in_match',
        state: { kind: 'in_match', session: LOCAL_SESSION },
        event: { type: 'START_MATCH' },
      },
      {
        label: 'START_MATCH from pause_menu',
        state: { kind: 'pause_menu', session: LOCAL_SESSION },
        event: { type: 'START_MATCH' },
      },
      {
        label: 'START_MATCH from match_outcome',
        state: { kind: 'match_outcome', session: LOCAL_SESSION, outcome: VICTORY_OUTCOME },
        event: { type: 'START_MATCH' },
      },
      {
        label: 'PAUSE_MATCH from main_menu',
        state: { kind: 'main_menu' },
        event: { type: 'PAUSE_MATCH' },
      },
      {
        label: 'PAUSE_MATCH from pause_menu',
        state: { kind: 'pause_menu', session: LOCAL_SESSION },
        event: { type: 'PAUSE_MATCH' },
      },
      {
        label: 'PAUSE_MATCH from match_outcome',
        state: { kind: 'match_outcome', session: LOCAL_SESSION, outcome: VICTORY_OUTCOME },
        event: { type: 'PAUSE_MATCH' },
      },
      {
        label: 'RESUME_MATCH from in_match',
        state: { kind: 'in_match', session: LOCAL_SESSION },
        event: { type: 'RESUME_MATCH' },
      },
      {
        label: 'RESUME_MATCH from main_menu',
        state: { kind: 'main_menu' },
        event: { type: 'RESUME_MATCH' },
      },
      {
        label: 'BACK_TO_MAIN_MENU from main_menu',
        state: { kind: 'main_menu' },
        event: { type: 'BACK_TO_MAIN_MENU' },
      },
      {
        label: 'BACK_TO_MAIN_MENU from in_match',
        state: { kind: 'in_match', session: LOCAL_SESSION },
        event: { type: 'BACK_TO_MAIN_MENU' },
      },
      {
        label: 'REMATCH from in_match',
        state: { kind: 'in_match', session: LOCAL_SESSION },
        event: { type: 'REMATCH' },
      },
      {
        label: 'REMATCH from pause_menu',
        state: { kind: 'pause_menu', session: LOCAL_SESSION },
        event: { type: 'REMATCH' },
      },
      {
        label: 'RECORD_MATCH_OUTCOME from main_menu',
        state: { kind: 'main_menu' },
        event: { type: 'RECORD_MATCH_OUTCOME', outcome: VICTORY_OUTCOME },
      },
      {
        label: 'RECORD_MATCH_OUTCOME from pause_menu',
        state: { kind: 'pause_menu', session: LOCAL_SESSION },
        event: { type: 'RECORD_MATCH_OUTCOME', outcome: VICTORY_OUTCOME },
      },
      {
        label: 'RECORD_MATCH_OUTCOME from match_outcome',
        state: { kind: 'match_outcome', session: LOCAL_SESSION, outcome: VICTORY_OUTCOME },
        event: { type: 'RECORD_MATCH_OUTCOME', outcome: VICTORY_OUTCOME },
      },
      {
        label: 'LAUNCH_GUIDED_TUTORIAL from in_match',
        state: { kind: 'in_match', session: LOCAL_SESSION },
        event: { type: 'LAUNCH_GUIDED_TUTORIAL' },
      },
      {
        label: 'LAUNCH_BATTLE_SIMULATOR from single_player_setup',
        state: { kind: 'single_player_setup', presetId: 'standard_tactical' },
        event: { type: 'LAUNCH_BATTLE_SIMULATOR' },
      },
      {
        label: 'OPEN_SINGLE_PLAYER_SETUP from host_room_lobby',
        state: { kind: 'host_room_lobby', presetId: 'standard_tactical', roomCode: null },
        event: { type: 'OPEN_SINGLE_PLAYER_SETUP' },
      },
      {
        label: 'OPEN_HOST_ROOM_LOBBY from join_room_lobby',
        state: { kind: 'join_room_lobby', roomCode: 'A' },
        event: { type: 'OPEN_HOST_ROOM_LOBBY' },
      },
      {
        label: 'OPEN_JOIN_ROOM_LOBBY from in_match',
        state: { kind: 'in_match', session: LOCAL_SESSION },
        event: { type: 'OPEN_JOIN_ROOM_LOBBY' },
      },
    ];

    for (const testCase of invalidCases) {
      it(`rejects ${testCase.label}`, () => {
        const result = transitionAppState(testCase.state, testCase.event);
        expect(result.ok).toBe(false);
        expect(result.state).toBe(testCase.state);
        if (!result.ok) {
          expect(result.reason.length).toBeGreaterThan(0);
        }
      });
    }
  });

  describe('runtime predicates', () => {
    it('evaluates isMatchRuntimeActive across all screen states', () => {
      expect(isMatchRuntimeActive({ kind: 'main_menu' })).toBe(false);
      expect(
        isMatchRuntimeActive({ kind: 'single_player_setup', presetId: 'standard_tactical' }),
      ).toBe(false);
      expect(
        isMatchRuntimeActive({
          kind: 'host_room_lobby',
          presetId: 'standard_tactical',
          roomCode: null,
        }),
      ).toBe(false);
      expect(isMatchRuntimeActive({ kind: 'join_room_lobby', roomCode: '' })).toBe(false);
      expect(isMatchRuntimeActive({ kind: 'in_match', session: LOCAL_SESSION })).toBe(true);
      expect(isMatchRuntimeActive({ kind: 'pause_menu', session: LOCAL_SESSION })).toBe(true);
      expect(
        isMatchRuntimeActive({
          kind: 'match_outcome',
          session: LOCAL_SESSION,
          outcome: VICTORY_OUTCOME,
        }),
      ).toBe(true);
    });

    it('evaluates shouldTickSimulation across all screen states including local vs multiplayer pause', () => {
      expect(shouldTickSimulation({ kind: 'main_menu' })).toBe(false);
      expect(
        shouldTickSimulation({ kind: 'single_player_setup', presetId: 'standard_tactical' }),
      ).toBe(false);
      expect(
        shouldTickSimulation({
          kind: 'host_room_lobby',
          presetId: 'standard_tactical',
          roomCode: null,
        }),
      ).toBe(false);
      expect(shouldTickSimulation({ kind: 'join_room_lobby', roomCode: 'ABC' })).toBe(false);
      expect(shouldTickSimulation({ kind: 'in_match', session: LOCAL_SESSION })).toBe(true);
      expect(shouldTickSimulation({ kind: 'in_match', session: MULTIPLAYER_SESSION })).toBe(
        true,
      );
      expect(shouldTickSimulation({ kind: 'pause_menu', session: LOCAL_SESSION })).toBe(false);
      expect(shouldTickSimulation({ kind: 'pause_menu', session: MULTIPLAYER_SESSION })).toBe(
        true,
      );
      expect(
        shouldTickSimulation({
          kind: 'match_outcome',
          session: LOCAL_SESSION,
          outcome: VICTORY_OUTCOME,
        }),
      ).toBe(false);
    });
  });
});
