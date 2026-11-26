import * as THREE from 'three';
import { BloomEffect, EffectComposer, EffectPass, RenderPass } from 'postprocessing';
import type { MatchSetupConfig } from '../shared/config/index.ts';
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
import type { ClientSimAdapter, MultiplayerRoomAdapter } from './net/simAdapter.ts';
import { AmbientMusicPlayer } from './audio/ambientMusicPlayer.ts';
import { OrbitalCameraController } from './renderer/orbitalCamera.ts';
import { SystemSceneManager } from './renderer/systemSceneManager.ts';
import {
  MenuController,
  type MenuLaunchRequest,
  type MenuScreenModel,
} from './ui/menuController.ts';
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
  readonly matchSetup?: MatchSetupConfig;
  readonly simAdapter?: ClientSimAdapter;
}

export type MatchRuntimeFactory = (
  params: MatchRuntimeFactoryParams,
) => MatchRuntimeHandle;

export interface ClientAppShellOptions {
  readonly canvas: HTMLCanvasElement;
  readonly hudContainer: HTMLElement;
  readonly createMatchRuntime?: MatchRuntimeFactory;
  readonly createP2PAdapter?: () => MultiplayerRoomAdapter;
}

export interface ClientAppController {
  readonly getState: () => AppScreenState;
  readonly isRuntimeActive: () => boolean;
  readonly dispatch: (event: AppStateEvent) => AppTransitionResult;
  readonly disposeMatchRuntime: () => void;
  readonly dispose: () => void;
}

const COMBAT_MUSIC_COOLDOWN_SECONDS = 14.0;

function isMultiplayerRoomAdapter(
  adapter: ClientSimAdapter,
): adapter is MultiplayerRoomAdapter {
  return 'leaveRoom' in adapter && typeof adapter.leaveRoom === 'function';
}

function toMenuScreenModel(state: AppScreenState): MenuScreenModel | null {
  switch (state.kind) {
    case 'main_menu':
    case 'single_player_setup':
    case 'host_room_lobby':
    case 'join_room_lobby':
      return state;
    case 'in_match':
    case 'pause_menu':
    case 'match_outcome':
      return null;
    default: {
      const _exhaustive: never = state;
      return _exhaustive;
    }
  }
}

function createDefaultMatchRuntime(
  params: MatchRuntimeFactoryParams,
): MatchRuntimeHandle {
  const { canvas, hudContainer, session, getState, onQuitToMainMenu } = params;

  const simAdapter =
    params.simAdapter ??
    new LocalSimAdapter(params.matchSetup ?? session.presetId);
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
    isBattleSimulator: session.sessionKind === 'battle_simulator',
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
      const activeAdapter = sceneManager.simAdapter;
      if (isMultiplayerRoomAdapter(activeAdapter)) {
        activeAdapter.leaveRoom();
      } else if (isMultiplayerRoomAdapter(simAdapter)) {
        simAdapter.leaveRoom();
      }
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
  let pendingLaunchRequest: MenuLaunchRequest | null = null;

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

  const menuController = new MenuController({
    container: hudContainer,
    ...(options.createP2PAdapter
      ? { createP2PAdapter: options.createP2PAdapter }
      : {}),
    onOpenSinglePlayer: (presetId) => {
      dispatch({ type: 'OPEN_SINGLE_PLAYER_SETUP', presetId });
    },
    onOpenHostRoom: (presetId) => {
      dispatch({ type: 'OPEN_HOST_ROOM_LOBBY', presetId });
    },
    onOpenJoinRoom: () => {
      dispatch({ type: 'OPEN_JOIN_ROOM_LOBBY' });
    },
    onLaunchTutorial: () => {
      dispatch({ type: 'LAUNCH_GUIDED_TUTORIAL' });
    },
    onLaunchBattleSimulator: () => {
      dispatch({ type: 'LAUNCH_BATTLE_SIMULATOR' });
    },
    onBackToMainMenu: () => {
      dispatch({ type: 'BACK_TO_MAIN_MENU' });
    },
    onStartMatch: (request) => {
      pendingLaunchRequest = request;
      const res = dispatch({
        type: 'START_MATCH',
        ...(request.setup ? { presetId: request.setup.presetId } : {}),
        ...(request.roomCode !== undefined ? { roomCode: request.roomCode } : {}),
      });
      if (!res.ok) {
        pendingLaunchRequest = null;
      }
    },
  });

  function renderShell(): void {
    const menuScreen = toMenuScreenModel(state);
    if (!menuScreen) {
      return;
    }

    canvas.style.display = 'none';
    hudContainer.classList?.add('menu-active');
    menuController.render(menuScreen);
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
        const launch = pendingLaunchRequest;
        pendingLaunchRequest = null;
        hudContainer.classList?.remove('menu-active');
        canvas.style.display = 'block';
        hudContainer.innerHTML = '';
        activeRuntime = createMatchRuntime({
          canvas,
          hudContainer,
          session: nextState.session,
          getState: () => state,
          onQuitToMainMenu: quitToMainMenu,
          ...(launch?.setup ? { matchSetup: launch.setup } : {}),
          ...(launch?.simAdapter ? { simAdapter: launch.simAdapter } : {}),
        });
      }
    } else {
      pendingLaunchRequest = null;
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
      pendingLaunchRequest = null;
      disposeMatchRuntime();
      menuController.dispose();
      hudContainer.classList?.remove('menu-active');
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
