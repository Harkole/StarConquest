import * as THREE from 'three';
import type { StarSystemNode, WormholeLink } from '../../shared/sim/galaxy.ts';
import {
  ASTEROID_ROCK_FRAGMENT_SHADER,
  ASTEROID_ROCK_VERTEX_SHADER,
  createCraggyAsteroidGeometry,
  createCrystalClusterGeometry,
  CRYSTAL_SHARD_FRAGMENT_SHADER,
  CRYSTAL_SHARD_VERTEX_SHADER,
} from '../shaders/asteroidShaders.ts';
import {
  NEBULA_PALETTES,
  NEBULA_SKYBOX_FRAGMENT_SHADER,
  NEBULA_SKYBOX_VERTEX_SHADER,
} from '../shaders/nebulaShaders.ts';
import {
  WORMHOLE_FRAGMENT_SHADER,
  WORMHOLE_VERTEX_SHADER,
} from '../shaders/wormholeShader.ts';

export interface SpaceEnvironmentHandle {
  readonly rootGroup: THREE.Group;
  readonly sunDirection: THREE.Vector3;
  update(elapsedSeconds: number, deltaSeconds: number): void;
  dispose(): void;
}

/**
 * Deterministic Mulberry32 PRNG so stars and asteroids have organic, non-spiral distributions.
 */
function createSeededRng(seedStr: string): () => number {
  let state = 2166136261;
  for (let i = 0; i < seedStr.length; i++) {
    state ^= seedStr.charCodeAt(i);
    state = Math.imul(state, 16777619);
  }
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createStarSystemEnvironment(
  system: StarSystemNode,
  wormholesInSystem: readonly {
    readonly wormhole: WormholeLink;
    readonly localPosition: { readonly x: number; readonly z: number };
    readonly destinationSystemId: string;
  }[],
): SpaceEnvironmentHandle {
  const palette = NEBULA_PALETTES[system.nebulaPalette];
  const rootGroup = new THREE.Group();
  rootGroup.name = `env_${system.id}`;

  const rng = createSeededRng(system.id);
  const disposables: { dispose(): void }[] = [];
  const timeUniforms: { value: number }[] = [];

  // 1. Lighting: Distant System Star + Ambient Fill
  const sunPosition = new THREE.Vector3(3400, 1450, -2600);
  const sunDirection = sunPosition.clone().normalize();

  const starLight = new THREE.DirectionalLight(
    new THREE.Color(...palette.starlightColor),
    2.4,
  );
  starLight.position.copy(sunPosition);
  rootGroup.add(starLight);

  const ambientLight = new THREE.AmbientLight(
    new THREE.Color(...palette.primaryNebula),
    0.38,
  );
  rootGroup.add(ambientLight);

  // Visible distant system sun sphere (triggers HDR bloom)
  const sunGeom = new THREE.SphereGeometry(75, 32, 32);
  const sunMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(...palette.starlightColor).multiplyScalar(2.2),
  });
  disposables.push(sunGeom, sunMat);
  const sunMesh = new THREE.Mesh(sunGeom, sunMat);
  sunMesh.position.copy(sunPosition);
  rootGroup.add(sunMesh);

  // 2. Procedural FBM Deep-Space Nebula Sky Dome (Predominantly Black Space + Stars)
  const skyGeom = new THREE.SphereGeometry(9500, 48, 48);
  const skyTimeUniform = { value: 0 };
  timeUniforms.push(skyTimeUniform);

  const skyMat = new THREE.ShaderMaterial({
    vertexShader: NEBULA_SKYBOX_VERTEX_SHADER,
    fragmentShader: NEBULA_SKYBOX_FRAGMENT_SHADER,
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      uTime: skyTimeUniform,
      uDeepSpaceBg: { value: new THREE.Color(...palette.deepSpaceBg) },
      uPrimaryNebula: { value: new THREE.Color(...palette.primaryNebula) },
      uSecondaryNebula: { value: new THREE.Color(...palette.secondaryNebula) },
      uAccentGlow: { value: new THREE.Color(...palette.accentGlow) },
    },
  });
  disposables.push(skyGeom, skyMat);
  rootGroup.add(new THREE.Mesh(skyGeom, skyMat));

  // 3. Multi-Depth Parallax 3D Starfield (Uniform Spherical Distribution — No Spiral Artifacts)
  const starCount = 3600;
  const starPositions = new Float32Array(starCount * 3);
  const starColors = new Float32Array(starCount * 3);

  for (let i = 0; i < starCount; i++) {
    const r = 2600 + rng() * 5200;
    const theta = rng() * Math.PI * 2;
    const u = rng() * 2 - 1;
    const sinPhi = Math.sqrt(Math.max(0, 1 - u * u));

    starPositions[i * 3] = r * sinPhi * Math.cos(theta);
    starPositions[i * 3 + 1] = r * u * 0.85;
    starPositions[i * 3 + 2] = r * sinPhi * Math.sin(theta);

    const warmth = rng();
    const brightness = 0.32 + rng() * 0.26;
    starColors[i * 3] = brightness * (0.9 + warmth * 0.1);
    starColors[i * 3 + 1] = brightness * (0.88 + (1 - Math.abs(warmth - 0.5)) * 0.12);
    starColors[i * 3 + 2] = brightness * (0.82 + (1 - warmth) * 0.18);
  }

  const starGeometry = new THREE.BufferGeometry();
  starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
  starGeometry.setAttribute('color', new THREE.BufferAttribute(starColors, 3));
  const starPointsMat = new THREE.PointsMaterial({
    size: 3.2,
    vertexColors: true,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
  });
  disposables.push(starGeometry, starPointsMat);
  rootGroup.add(new THREE.Points(starGeometry, starPointsMat));

  // 4. Dense InstancedMesh Asteroid Belts Across Expanded System Scale
  // - Inner Belt (r ~ 420): Early-game mining ring with generous space around the Homeworld/Super-Earth
  // - Mid-System Belt (r ~ 1120): Contested belt spanning the secondary planet orbits
  // - Outer Stealth Clusters (r ~ 1620): Off-axis deep-space resource pockets where Harvesters can sneak
  const oreRatio =
    system.resourceSkew === 'ore_heavy'
      ? 0.78
      : system.resourceSkew === 'crystal_heavy'
        ? 0.42
        : 0.6;
  const totalAsteroids = system.isCentralHub ? 3600 : 2600;
  const oreCount = Math.floor(totalAsteroids * oreRatio);
  const crystalCount = totalAsteroids - oreCount;

  const oreGeometry = createCraggyAsteroidGeometry(2.5);
  const oreMaterial = new THREE.ShaderMaterial({
    vertexShader: ASTEROID_ROCK_VERTEX_SHADER,
    fragmentShader: ASTEROID_ROCK_FRAGMENT_SHADER,
    uniforms: {
      uSunDirection: { value: sunDirection.clone() },
    },
  });
  const crystalGeometry = createCrystalClusterGeometry(2.0);
  const crystalMaterial = new THREE.ShaderMaterial({
    vertexShader: CRYSTAL_SHARD_VERTEX_SHADER,
    fragmentShader: CRYSTAL_SHARD_FRAGMENT_SHADER,
    uniforms: {
      uSunDirection: { value: sunDirection.clone() },
    },
  });
  disposables.push(oreGeometry, oreMaterial, crystalGeometry, crystalMaterial);

  const oreInstanced = new THREE.InstancedMesh(oreGeometry, oreMaterial, oreCount);
  const crystalInstanced = new THREE.InstancedMesh(
    crystalGeometry,
    crystalMaterial,
    crystalCount,
  );
  disposables.push(oreInstanced, crystalInstanced);

  const dummy = new THREE.Object3D();

  function placeAsteroidInstance(
    mesh: THREE.InstancedMesh,
    index: number,
    isCrystal: boolean,
  ): void {
    const zoneRoll = rng();
    let x = 0;
    let z = 0;

    if (zoneRoll < 0.44) {
      // Inner Belt (r = 365 .. 475)
      const angle = rng() * Math.PI * 2;
      const radialSpread = (rng() + rng() - 1.0) * 55;
      const radius = 420 + radialSpread;
      x = Math.cos(angle) * radius;
      z = Math.sin(angle) * radius;
    } else if (zoneRoll < 0.78) {
      // Mid-System Belt (r = 1040 .. 1200)
      const angle = rng() * Math.PI * 2;
      const radialSpread = (rng() + rng() - 1.0) * 80;
      const radius = 1120 + radialSpread;
      x = Math.cos(angle) * radius;
      z = Math.sin(angle) * radius;
    } else {
      // Outer Deep-Space Stealth Pockets (4 diagonal clusters at r ~ 1620, off the wormhole axes)
      const pocketIndex = Math.floor(rng() * 4);
      const pocketAngle = (pocketIndex * Math.PI) / 2 + Math.PI / 4;
      const centerX = Math.cos(pocketAngle) * 1620;
      const centerZ = Math.sin(pocketAngle) * 1620;
      const clusterRadius = (rng() + rng()) * 115;
      const localAngle = rng() * Math.PI * 2;
      x = centerX + Math.cos(localAngle) * clusterRadius;
      z = centerZ + Math.sin(localAngle) * clusterRadius;
    }

    const heightSpread = (rng() + rng() - 1.0) * 14.0;
    dummy.position.set(x, heightSpread, z);
    dummy.rotation.set(
      rng() * Math.PI * 2,
      rng() * Math.PI * 2,
      rng() * Math.PI * 2,
    );

    const sizeRoll = rng();
    const baseScale =
      sizeRoll > 0.92
        ? 1.85 + rng() * 1.35
        : sizeRoll > 0.52
          ? 0.95 + rng() * 0.75
          : 0.45 + rng() * 0.48;

    if (isCrystal) {
      dummy.scale.set(
        baseScale * (0.75 + rng() * 0.4),
        baseScale * (1.1 + rng() * 0.55),
        baseScale * (0.75 + rng() * 0.4),
      );
    } else {
      dummy.scale.set(
        baseScale * (0.8 + rng() * 0.6),
        baseScale * (0.65 + rng() * 0.5),
        baseScale * (0.8 + rng() * 0.6),
      );
    }

    dummy.updateMatrix();
    mesh.setMatrixAt(index, dummy.matrix);
  }

  for (let i = 0; i < oreCount; i++) {
    placeAsteroidInstance(oreInstanced, i, false);
  }
  oreInstanced.instanceMatrix.needsUpdate = true;

  for (let i = 0; i < crystalCount; i++) {
    placeAsteroidInstance(crystalInstanced, i, true);
  }
  crystalInstanced.instanceMatrix.needsUpdate = true;

  const beltsGroup = new THREE.Group();
  beltsGroup.add(oreInstanced, crystalInstanced);
  rootGroup.add(beltsGroup);

  // 5. Swirling Wormhole Vortex Choke Points (Perimeter Gateways)
  const wormholeDiskGeom = new THREE.PlaneGeometry(78, 78);
  wormholeDiskGeom.rotateX(-Math.PI / 2);
  const wormholeRingGeom = new THREE.TorusGeometry(34, 0.7, 12, 64);
  wormholeRingGeom.rotateX(Math.PI / 2);
  disposables.push(wormholeDiskGeom, wormholeRingGeom);

  for (const item of wormholesInSystem) {
    const whTimeUniform = { value: 0 };
    timeUniforms.push(whTimeUniform);

    const whMat = new THREE.ShaderMaterial({
      vertexShader: WORMHOLE_VERTEX_SHADER,
      fragmentShader: WORMHOLE_FRAGMENT_SHADER,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: whTimeUniform,
        uOuterColor: { value: new THREE.Color(...palette.primaryNebula) },
        uInnerColor: {
          value: new THREE.Color(...palette.accentGlow).multiplyScalar(1.6),
        },
      },
    });
    const ringMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(...palette.accentGlow),
      transparent: true,
      opacity: 0.7,
    });
    disposables.push(whMat, ringMat);

    const whGroup = new THREE.Group();
    whGroup.position.set(item.localPosition.x, 0.5, item.localPosition.z);
    whGroup.userData = {
      wormholeId: item.wormhole.id,
      destinationSystemId: item.destinationSystemId,
    };

    whGroup.add(new THREE.Mesh(wormholeDiskGeom, whMat));
    whGroup.add(new THREE.Mesh(wormholeRingGeom, ringMat));
    rootGroup.add(whGroup);
  }

  return {
    rootGroup,
    sunDirection,
    update(elapsedSeconds: number, deltaSeconds: number): void {
      for (const uniform of timeUniforms) {
        uniform.value = elapsedSeconds;
      }
      beltsGroup.rotation.y += deltaSeconds * 0.004;
    },
    dispose(): void {
      for (const item of disposables) {
        item.dispose();
      }
    },
  };
}
