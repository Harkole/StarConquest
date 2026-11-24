import * as THREE from 'three';
import { BloomEffect, EffectComposer, EffectPass, RenderPass } from 'postprocessing';
import { LocalSimAdapter } from './net/localSimAdapter.ts';
import { AmbientMusicPlayer } from './audio/ambientMusicPlayer.ts';
import { OrbitalCameraController } from './renderer/orbitalCamera.ts';
import { SystemSceneManager } from './renderer/systemSceneManager.ts';
import { mountSystemHud } from './ui/systemHud.ts';

function bootstrapClient(): void {
  const canvas = document.getElementById('app-canvas') as HTMLCanvasElement | null;
  const hudContainer = document.getElementById('hud-overlay');
  if (!canvas || !hudContainer) {
    throw new Error('Missing #app-canvas or #hud-overlay element');
  }

  const simAdapter = new LocalSimAdapter('standard_tactical');
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
  const musicPlayer = new AmbientMusicPlayer();
  musicPlayer.start();
  mountSystemHud(hudContainer, galaxy, sceneManager, musicPlayer);

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloomEffect = new BloomEffect({
    intensity: 1.4,
    luminanceThreshold: 0.62,
    luminanceSmoothing: 0.25,
    mipmapBlur: true,
  });
  composer.addPass(new EffectPass(camera, bloomEffect));

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
  });

  const clock = new THREE.Clock();
  const COMBAT_MUSIC_COOLDOWN_SECONDS = 14.0;
  let lastCombatActivityElapsed = -999;

  function animate(): void {
    requestAnimationFrame(animate);
    const deltaSeconds = Math.min(clock.getDelta(), 0.1);
    const elapsedSeconds = clock.getElapsedTime();

    cameraController.update(deltaSeconds);
    sceneManager.update(elapsedSeconds, deltaSeconds);

    // Dynamic ambient <-> combat music switching with 14s anti-flicker cooldown (docs/sounds.md)
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
  }

  animate();
}

bootstrapClient();
