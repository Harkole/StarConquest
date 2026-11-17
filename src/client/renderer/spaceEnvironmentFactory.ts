import * as THREE from 'three';
import type { StarSystemNode, WormholeLink } from '../../shared/sim/galaxy.ts';
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

  const disposables: { dispose(): void }[] = [];
  const timeUniforms: { value: number }[] = [];

  // 1. Lighting: Distant System Star + Ambient Fill
  const sunPosition = new THREE.Vector3(650, 320, -480);
  const sunDirection = sunPosition.clone().normalize();

  const starLight = new THREE.DirectionalLight(
    new THREE.Color(...palette.starlightColor),
    2.4,
  );
  starLight.position.copy(sunPosition);
  rootGroup.add(starLight);

  const ambientLight = new THREE.AmbientLight(
    new THREE.Color(...palette.primaryNebula),
    0.45,
  );
  rootGroup.add(ambientLight);

  // Visible distant system sun sphere (triggers HDR bloom)
  const sunGeom = new THREE.SphereGeometry(22, 32, 32);
  const sunMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(...palette.starlightColor).multiplyScalar(2.2),
  });
  disposables.push(sunGeom, sunMat);
  const sunMesh = new THREE.Mesh(sunGeom, sunMat);
  sunMesh.position.copy(sunPosition);
  rootGroup.add(sunMesh);

  // 2. Procedural FBM Deep-Space Nebula Sky Dome
  const skyGeom = new THREE.SphereGeometry(2200, 48, 48);
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

  // 3. Multi-Depth Parallax 3D Starfield
  const starCount = 1800;
  const starPositions = new Float32Array(starCount * 3);
  const starColors = new Float32Array(starCount * 3);

  for (let i = 0; i < starCount; i++) {
    const r = 450 + ((i * 7919) % 1200);
    const theta = ((i * 104729) % 3600) * (Math.PI / 1800);
    const phi = Math.acos(1 - 2 * (((i * 3571) % 1000) / 1000));
    starPositions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    starPositions[i * 3 + 1] = r * Math.cos(phi) * 0.65;
    starPositions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);

    const tint = (i % 5) / 5;
    starColors[i * 3] = 0.8 + tint * 0.2;
    starColors[i * 3 + 1] = 0.85 + (1 - tint) * 0.15;
    starColors[i * 3 + 2] = 1.0;
  }

  const starGeometry = new THREE.BufferGeometry();
  starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
  starGeometry.setAttribute('color', new THREE.BufferAttribute(starColors, 3));
  const starPointsMat = new THREE.PointsMaterial({
    size: 2.2,
    vertexColors: true,
    transparent: true,
    opacity: 0.88,
    depthWrite: false,
  });
  disposables.push(starGeometry, starPointsMat);
  rootGroup.add(new THREE.Points(starGeometry, starPointsMat));

  // 4. InstancedMesh Asteroid Belts (Ore & Crystal clusters)
  const oreRatio =
    system.resourceSkew === 'ore_heavy'
      ? 0.75
      : system.resourceSkew === 'crystal_heavy'
        ? 0.3
        : 0.55;
  const totalAsteroids = system.isCentralHub ? 240 : 160;
  const oreCount = Math.floor(totalAsteroids * oreRatio);
  const crystalCount = totalAsteroids - oreCount;

  const oreGeometry = new THREE.DodecahedronGeometry(2.1, 1);
  const oreMaterial = new THREE.MeshStandardMaterial({
    color: 0x8c6239,
    roughness: 0.82,
    metalness: 0.45,
  });
  const crystalGeometry = new THREE.OctahedronGeometry(2.0, 0);
  const crystalMaterial = new THREE.MeshStandardMaterial({
    color: 0x38bdf8,
    emissive: 0x0ea5e9,
    emissiveIntensity: 1.5,
    roughness: 0.15,
    metalness: 0.85,
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
  for (let i = 0; i < oreCount; i++) {
    const beltAngle = (i / oreCount) * Math.PI * 2;
    const beltRadius = 115 + ((i * 37) % 30) - 15;
    dummy.position.set(
      Math.cos(beltAngle) * beltRadius,
      (((i * 19) % 14) - 7) * 0.6,
      Math.sin(beltAngle) * beltRadius,
    );
    dummy.rotation.set(i * 0.7, i * 1.1, i * 0.4);
    const scale = 0.55 + ((i * 23) % 100) / 90;
    dummy.scale.set(scale * 1.2, scale * 0.85, scale);
    dummy.updateMatrix();
    oreInstanced.setMatrixAt(i, dummy.matrix);
  }
  oreInstanced.instanceMatrix.needsUpdate = true;

  for (let i = 0; i < crystalCount; i++) {
    const beltAngle = (i / crystalCount) * Math.PI * 2 + 0.4;
    const beltRadius = 245 + ((i * 41) % 36) - 18;
    dummy.position.set(
      Math.cos(beltAngle) * beltRadius,
      (((i * 29) % 16) - 8) * 0.6,
      Math.sin(beltAngle) * beltRadius,
    );
    dummy.rotation.set(i * 0.9, i * 0.5, i * 1.3);
    const scale = 0.6 + ((i * 31) % 100) / 95;
    dummy.scale.set(scale, scale * 1.35, scale);
    dummy.updateMatrix();
    crystalInstanced.setMatrixAt(i, dummy.matrix);
  }
  crystalInstanced.instanceMatrix.needsUpdate = true;

  const beltsGroup = new THREE.Group();
  beltsGroup.add(oreInstanced, crystalInstanced);
  rootGroup.add(beltsGroup);

  // 5. Swirling Wormhole Vortex Choke Points
  const wormholeDiskGeom = new THREE.PlaneGeometry(54, 54);
  wormholeDiskGeom.rotateX(-Math.PI / 2);
  const wormholeRingGeom = new THREE.TorusGeometry(24, 0.5, 12, 64);
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
      beltsGroup.rotation.y += deltaSeconds * 0.012;
    },
    dispose(): void {
      for (const item of disposables) {
        item.dispose();
      }
    },
  };
}
