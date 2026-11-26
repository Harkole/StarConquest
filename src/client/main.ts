import * as THREE from 'three';
import { BloomEffect, EffectComposer, EffectPass, RenderPass } from 'postprocessing';
import { MATCH_PRESETS, type MatchPresetId } from '../shared/config/index.ts';
import { BATTLE_SIMULATOR_SYSTEM_ID } from '../shared/sim/gameSimulation.ts';
import {
  createInitialAppState,
  isMatchRuntimeActive,
  shouldTickSimulation,
  transitionAppState,
  type ActiveMatchSession,
  type AppScreenState,
  type AppStateEvent,
  type AppTransitionResult,
} from './app/appStateMachine.ts';
import { LocalSimAdapter } from './net/localSimAdapter.ts';
import { AmbientMusicPlayer } from './audio/ambientMusicPlayer.ts';
import { OrbitalCameraController } from './renderer/orbitalCamera.ts';
import { SystemSceneManager } from './renderer/systemSceneManager.ts';
import { mountSystemHud } from './ui/systemHud.ts';

export interface MatchRuntimeHandle {
  readonly dispose: () => void;
}

export interface MatchRuntimeFactoryParams {
  readonly canvas: HTMLCanvasElement;
  readonly hudContainer: HTMLElement;
  readonly session: ActiveMatchSession;
  readonly getState: () => AppScreenState;
  readonly onQuitToMainMenu: () => void;
}

export type MatchRuntimeFactory = (
  params: MatchRuntimeFactoryParams,
) => MatchRuntimeHandle;

export interface ClientAppShellOptions {
  readonly canvas: HTMLCanvasElement;
  readonly hudContainer: HTMLElement;
  readonly createMatchRuntime?: MatchRuntimeFactory;
}

export interface ClientAppController {
  readonly getState: () => AppScreenState;
  readonly isRuntimeActive: () => boolean;
  readonly dispatch: (event: AppStateEvent) => AppTransitionResult;
  readonly disposeMatchRuntime: () => void;
  readonly dispose: () => void;
}

const COMBAT_MUSIC_COOLDOWN_SECONDS = 14.0;
const SETUP_PRESET_IDS: readonly MatchPresetId[] = [
  'standard_tactical',
  'blitz_skirmish',
  'grand_conquest',
];

function isMatchPresetId(value: string | undefined): value is MatchPresetId {
  return value !== undefined && value in MATCH_PRESETS;
}

function createDefaultMatchRuntime(
  params: MatchRuntimeFactoryParams,
): MatchRuntimeHandle {
  const { canvas, hudContainer, session, getState, onQuitToMainMenu } = params;

  const simAdapter = new LocalSimAdapter(session.presetId);
  const galaxy = simAdapter.simulation.galaxy;

  const renderer = new THREE.WebGLRenderer({
    canvas,
    powerPreference: 'high-performance',
    antialias: false,
  });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x010206);

  const camera = new THREE.PerspectiveCamera(
    50,
    window.innerWidth / window.innerHeight,
    0.5,
    22000,
  );

  const cameraController = new OrbitalCameraController(camera, canvas);
  const sceneManager = new SystemSceneManager(
    scene,
    galaxy,
    cameraController,
    simAdapter,
    canvas,
  );

  if (session.sessionKind === 'battle_simulator') {
    sceneManager.loadSystem(BATTLE_SIMULATOR_SYSTEM_ID);
    sceneManager.focusWorldPoint(0, 0, 280);
  }

  const musicPlayer = new AmbientMusicPlayer();
  musicPlayer.start();

  const hudHandle = mountSystemHud(hudContainer, galaxy, sceneManager, musicPlayer, {
    onQuitToMainMenu,
  });

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloomEffect = new BloomEffect({
    intensity: 1.4,
    luminanceThreshold: 0.62,
    luminanceSmoothing: 0.25,
    mipmapBlur: true,
  });
  composer.addPass(new EffectPass(camera, bloomEffect));

  const onResize = (): void => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
  };
  window.addEventListener('resize', onResize);

  const clock = new THREE.Clock();
  let lastCombatActivityElapsed = -999;
  let rafId = 0;
  let disposed = false;

  const animate = (): void => {
    if (disposed) {
      return;
    }
    rafId = window.requestAnimationFrame(animate);
    const deltaSeconds = Math.min(clock.getDelta(), 0.1);
    const elapsedSeconds = clock.getElapsedTime();

    cameraController.update(deltaSeconds);
    if (shouldTickSimulation(getState())) {
      sceneManager.update(elapsedSeconds, deltaSeconds);
    }

    const activeAdapter = sceneManager.simAdapter;
    if (activeAdapter.simulation.isPlayerInActiveCombat(activeAdapter.localPlayerId)) {
      lastCombatActivityElapsed = elapsedSeconds;
      if (musicPlayer.getCategory() !== 'combat') {
        musicPlayer.setCategory('combat');
      }
    } else if (
      musicPlayer.getCategory() === 'combat' &&
      elapsedSeconds - lastCombatActivityElapsed >= COMBAT_MUSIC_COOLDOWN_SECONDS
    ) {
      musicPlayer.setCategory('ambient');
    }
    musicPlayer.update(deltaSeconds);

    composer.render();
  };

  animate();

  return {
    dispose: () => {
      if (disposed) {
        return;
      }
      disposed = true;
      window.cancelAnimationFrame(rafId);
      window.removeEventListener('resize', onResize);
      hudHandle.dispose();
      musicPlayer.dispose();
      sceneManager.dispose();
      cameraController.dispose();
      composer.dispose();
      renderer.dispose();
    },
  };
}

export function createClientAppShell(
  options: ClientAppShellOptions,
): ClientAppController {
  const { canvas, hudContainer } = options;
  const createMatchRuntime = options.createMatchRuntime ?? createDefaultMatchRuntime;

  let state: AppScreenState = createInitialAppState();
  let activeRuntime: MatchRuntimeHandle | null = null;
  let selectedSetupPresetId: MatchPresetId = 'standard_tactical';

  function disposeMatchRuntime(): void {
    if (activeRuntime) {
      const runtime = activeRuntime;
      activeRuntime = null;
      runtime.dispose();
    }
    canvas.style.display = 'none';
  }

  function quitToMainMenu(): void {
    if (state.kind === 'in_match') {
      dispatch({ type: 'PAUSE_MATCH' });
    }
    if (state.kind !== 'main_menu') {
      dispatch({ type: 'BACK_TO_MAIN_MENU' });
    }
  }

  function renderShell(): void {
    if (isMatchRuntimeActive(state)) {
      return;
    }

    canvas.style.display = 'none';

    if (state.kind === 'main_menu') {
      hudContainer.innerHTML = `
        <div class="hud-section" data-app-screen="main_menu">
          <div class="hud-title">STARCONQUEST</div>
          <div class="hud-btn-row" style="margin-top: 8px;">
            <button type="button" class="hud-btn active" data-menu-action="open-single-player">Start Single Player</button>
            <button type="button" class="hud-btn" data-menu-action="launch-tutorial">Guided Tutorial</button>
            <button type="button" class="hud-btn" data-menu-action="launch-battle-sim">Battle Simulator</button>
          </div>
        </div>
      `;

      hudContainer
        .querySelector<HTMLButtonElement>('[data-menu-action="open-single-player"]')
        ?.addEventListener('click', () => {
          dispatch({
            type: 'OPEN_SINGLE_PLAYER_SETUP',
            presetId: selectedSetupPresetId,
          });
        });

      hudContainer
        .querySelector<HTMLButtonElement>('[data-menu-action="launch-tutorial"]')
        ?.addEventListener('click', () => {
          dispatch({ type: 'LAUNCH_GUIDED_TUTORIAL' });
        });

      hudContainer
        .querySelector<HTMLButtonElement>('[data-menu-action="launch-battle-sim"]')
        ?.addEventListener('click', () => {
          dispatch({ type: 'LAUNCH_BATTLE_SIMULATOR' });
        });
      return;
    }

    if (state.kind === 'single_player_setup') {
      selectedSetupPresetId = state.presetId;
      const presetButtonsHtml = SETUP_PRESET_IDS.map((presetId) => {
        const cfg = MATCH_PRESETS[presetId];
        const activeClass = presetId === selectedSetupPresetId ? 'active' : '';
        return `<button type="button" class="hud-btn ${activeClass}" data-setup-preset="${presetId}">${cfg.displayName}</button>`;
      }).join('');

      hudContainer.innerHTML = `
        <div class="hud-section" data-app-screen="single_player_setup">
          <div class="hud-title">Single Player Setup</div>
          <div class="hud-btn-row" style="margin-top: 8px;">
            ${presetButtonsHtml}
          </div>
          <div class="hud-btn-row" style="margin-top: 8px;">
            <button type="button" class="hud-btn active" data-menu-action="start-match">Start Match</button>
            <button type="button" class="hud-btn" data-menu-action="back-to-main">Back</button>
          </div>
        </div>
      `;

      hudContainer
        .querySelectorAll<HTMLButtonElement>('[data-setup-preset]')
        .forEach((btn) => {
          btn.addEventListener('click', () => {
            const preset = btn.dataset.setupPreset;
            if (isMatchPresetId(preset)) {
              selectedSetupPresetId = preset;
              state = { kind: 'single_player_setup', presetId: preset };
              renderShell();
            }
          });
        });

      hudContainer
        .querySelector<HTMLButtonElement>('[data-menu-action="start-match"]')
        ?.addEventListener('click', () => {
          dispatch({ type: 'START_MATCH', presetId: selectedSetupPresetId });
        });

      hudContainer
        .querySelector<HTMLButtonElement>('[data-menu-action="back-to-main"]')
        ?.addEventListener('click', () => {
          dispatch({ type: 'BACK_TO_MAIN_MENU' });
        });
      return;
    }

    hudContainer.innerHTML = `
      <div class="hud-section" data-app-screen="${state.kind}">
        <div class="hud-title">${state.kind === 'host_room_lobby' ? 'Host Room Lobby' : 'Join Room Lobby'}</div>
        <div class="hud-btn-row" style="margin-top: 8px;">
          <button type="button" class="hud-btn" data-menu-action="back-to-main">Back</button>
        </div>
      </div>
    `;
    hudContainer
      .querySelector<HTMLButtonElement>('[data-menu-action="back-to-main"]')
      ?.addEventListener('click', () => {
        dispatch({ type: 'BACK_TO_MAIN_MENU' });
      });
  }

  function dispatch(event: AppStateEvent): AppTransitionResult {
    const result = transitionAppState(state, event);
    if (!result.ok) {
      return result;
    }

    const nextState = result.state;
    state = nextState;

    if (isMatchRuntimeActive(nextState)) {
      if (!activeRuntime && nextState.kind === 'in_match') {
        canvas.style.display = 'block';
        hudContainer.innerHTML = '';
        activeRuntime = createMatchRuntime({
          canvas,
          hudContainer,
          session: nextState.session,
          getState: () => state,
          onQuitToMainMenu: quitToMainMenu,
        });
      }
    } else {
      disposeMatchRuntime();
      renderShell();
    }

    return result;
  }

  renderShell();

  return {
    getState: () => state,
    isRuntimeActive: () => activeRuntime !== null,
    dispatch,
    disposeMatchRuntime,
    dispose: () => {
      disposeMatchRuntime();
      hudContainer.innerHTML = '';
    },
  };
}

export function bootstrapClient(): ClientAppController {
  const canvas = document.getElementById('app-canvas');
  const hudContainer = document.getElementById('hud-overlay');
  if (!(canvas instanceof HTMLCanvasElement) || !hudContainer) {
    throw new Error('Missing #app-canvas or #hud-overlay element');
  }

  return createClientAppShell({ canvas, hudContainer });
}

if (
  typeof document !== 'undefined' &&
  document.getElementById('app-canvas') instanceof HTMLCanvasElement &&
  document.getElementById('hud-overlay')
) {
  bootstrapClient();
}
