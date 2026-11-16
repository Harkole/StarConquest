import * as THREE from 'three';
import { BloomEffect, EffectComposer, EffectPass, RenderPass } from 'postprocessing';
import { createFiveSystemGalaxy } from '../shared/sim/galaxy.ts';

function bootstrapClient(): void {
  const canvas = document.getElementById('app-canvas') as HTMLCanvasElement | null;
  const statusEl = document.getElementById('hud-status');
  if (!canvas) {
    throw new Error('Missing #app-canvas element');
  }

  const galaxy = createFiveSystemGalaxy();
  if (statusEl) {
    statusEl.textContent = `Loaded ${galaxy.systems.length} Star Systems & ${galaxy.wormholes.length} Wormholes`;
  }

  const renderer = new THREE.WebGLRenderer({
    canvas,
    powerPreference: 'high-performance',
    antialias: false,
  });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x04060d);

  const camera = new THREE.PerspectiveCamera(
    50,
    window.innerWidth / window.innerHeight,
    0.1,
    4000,
  );
  camera.position.set(0, 140, 220);
  camera.lookAt(0, 0, 0);

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloomEffect = new BloomEffect({
    intensity: 1.35,
    luminanceThreshold: 0.6,
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

  function animate(): void {
    requestAnimationFrame(animate);
    composer.render();
  }

  animate();
}

bootstrapClient();
