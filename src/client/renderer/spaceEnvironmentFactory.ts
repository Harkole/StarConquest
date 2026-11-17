import * as THREE from 'three';
import {
  BELT_ROTATION_SPEED_RAD_PER_SEC,
  createSeededRng,
  getSystemAsteroidLayout,
} from '../../shared/sim/asteroidBeltLayout.ts';
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
  WORMHOLE_PROXIMITY_RADIUS,
  WORMHOLE_VERTEX_SHADER,
} from '../shaders/wormholeShader.ts';

export interface WormholeInstanceHandle {
  readonly wormholeId: string;
  readonly destinationSystemId: string;
  readonly position: { readonly x: number; readonly z: number };
  isOpen(): boolean;
  getOpenProgress(): number;
  setManualOpen(open: boolean): void;
  toggleManualOpen(): boolean;
  updateShipProximity(shipPositions: readonly { readonly x: number; readonly z: number }[]): void;
}

export interface SpaceEnvironmentHandle {
  readonly rootGroup: THREE.Group;
  readonly sunDirection: THREE.Vector3;
  readonly wormholes: readonly WormholeInstanceHandle[];
  update(elapsedSeconds: number, deltaSeconds: number, simElapsedSeconds?: number): void;
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
    0.12,
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

  // 4. Dense InstancedMesh Asteroid Belts Shared Deterministically With Simulation
  const beltLayout = getSystemAsteroidLayout(system);
  const oreCount = beltLayout.oreRocks.length;
  const crystalCount = beltLayout.crystalRocks.length;

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

  beltLayout.oreRocks.forEach((rock, index) => {
    dummy.position.set(rock.localX, rock.localY, rock.localZ);
    dummy.rotation.set(rock.rotX, rock.rotY, rock.rotZ);
    dummy.scale.set(rock.scaleX, rock.scaleY, rock.scaleZ);
    dummy.updateMatrix();
    oreInstanced.setMatrixAt(index, dummy.matrix);
  });
  oreInstanced.instanceMatrix.needsUpdate = true;

  beltLayout.crystalRocks.forEach((rock, index) => {
    dummy.position.set(rock.localX, rock.localY, rock.localZ);
    dummy.rotation.set(rock.rotX, rock.rotY, rock.rotZ);
    dummy.scale.set(rock.scaleX, rock.scaleY, rock.scaleZ);
    dummy.updateMatrix();
    crystalInstanced.setMatrixAt(index, dummy.matrix);
  });
  crystalInstanced.instanceMatrix.needsUpdate = true;

  const beltsGroup = new THREE.Group();
  beltsGroup.add(oreInstanced, crystalInstanced);
  rootGroup.add(beltsGroup);

  // 5. DS9-Style Proximity Wormhole Gateways (Compact Dormant Marker -> 3D Multi-Layered Cloud Tunnel)
  const wormholeDiskGeom = new THREE.PlaneGeometry(130, 130, 72, 72);
  wormholeDiskGeom.rotateX(-Math.PI / 2);
  const dormantMarkerRingGeom = new THREE.TorusGeometry(8.5, 0.3, 10, 48);
  dormantMarkerRingGeom.rotateX(Math.PI / 2);
  const beaconPylonGeom = new THREE.OctahedronGeometry(1.2, 0);
  disposables.push(wormholeDiskGeom, dormantMarkerRingGeom, beaconPylonGeom);

  interface InternalWormholeState {
    readonly handle: WormholeInstanceHandle;
    readonly markerGroup: THREE.Group;
    readonly markerMat: THREE.MeshBasicMaterial;
    readonly openProgressUniform: { value: number };
    readonly flashBurstUniform: { value: number };
    targetOpen: boolean;
    manualOverride: boolean | null;
    openProgress: number;
    flashBurst: number;
  }

  const wormholeStates: InternalWormholeState[] = [];

  // 2 concentric 3D funnel cloud layers sharing the exact same central throat axis (0, -y, 0)
  const funnelLayers = [
    { depthOffset: 0.0, scale: 1.0, opacity: 0.95, rotY: 0.0 },
    { depthOffset: 10.0, scale: 0.88, opacity: 0.62, rotY: 0.6 },
  ] as const;

  for (const item of wormholesInSystem) {
    const whTimeUniform = { value: 0 };
    const openProgressUniform = { value: 0 };
    const flashBurstUniform = { value: 0 };
    timeUniforms.push(whTimeUniform);

    const markerMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(...palette.accentGlow),
      transparent: true,
      opacity: 0.42,
    });
    disposables.push(markerMat);

    const whGroup = new THREE.Group();
    whGroup.position.set(item.localPosition.x, 0.5, item.localPosition.z);
    whGroup.userData = {
      wormholeId: item.wormhole.id,
      destinationSystemId: item.destinationSystemId,
    };

    // Compact dormant marker ring + 4 subspace navigation beacons
    const markerGroup = new THREE.Group();
    markerGroup.add(new THREE.Mesh(dormantMarkerRingGeom, markerMat));
    for (let b = 0; b < 4; b++) {
      const a = (b * Math.PI) / 2;
      const pylon = new THREE.Mesh(beaconPylonGeom, markerMat);
      pylon.position.set(Math.cos(a) * 8.5, 0, Math.sin(a) * 8.5);
      markerGroup.add(pylon);
    }
    whGroup.add(markerGroup);

    // Add deep 3D cloud tunnel layers (rendered bottom-to-top with NormalBlending for smoky DS9 clouds)
    for (let idx = funnelLayers.length - 1; idx >= 0; idx--) {
      const layerCfg = funnelLayers[idx];
      if (!layerCfg) {
        continue;
      }
      const layerMat = new THREE.ShaderMaterial({
        vertexShader: WORMHOLE_VERTEX_SHADER,
        fragmentShader: WORMHOLE_FRAGMENT_SHADER,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.NormalBlending,
        uniforms: {
          uTime: whTimeUniform,
          uOpenProgress: openProgressUniform,
          uFlashBurst: flashBurstUniform,
          uLayerDepthOffset: { value: layerCfg.depthOffset },
          uLayerScale: { value: layerCfg.scale },
          uLayerOpacity: { value: layerCfg.opacity },
          uOuterColor: { value: new THREE.Color(...palette.primaryNebula) },
          uInnerColor: { value: new THREE.Color(...palette.accentGlow) },
        },
      });
      disposables.push(layerMat);

      const layerMesh = new THREE.Mesh(wormholeDiskGeom, layerMat);
      layerMesh.rotation.y = layerCfg.rotY;
      whGroup.add(layerMesh);
    }

    rootGroup.add(whGroup);

    const state: InternalWormholeState = {
      markerGroup,
      markerMat,
      openProgressUniform,
      flashBurstUniform,
      targetOpen: false,
      manualOverride: null,
      openProgress: 0,
      flashBurst: 0,
      handle: {
        wormholeId: item.wormhole.id,
        destinationSystemId: item.destinationSystemId,
        position: item.localPosition,
        isOpen(): boolean {
          return state.targetOpen;
        },
        getOpenProgress(): number {
          return state.openProgress;
        },
        setManualOpen(open: boolean): void {
          if (state.targetOpen !== open) {
            state.flashBurst = 1.0; // Trigger DS9 subspace flash burst on state change
          }
          state.manualOverride = open;
          state.targetOpen = open;
        },
        toggleManualOpen(): boolean {
          const next = !state.targetOpen;
          state.handle.setManualOpen(next);
          return next;
        },
        updateShipProximity(
          shipPositions: readonly { readonly x: number; readonly z: number }[],
        ): void {
          const anyShipNear = shipPositions.some(
            (pos) =>
              Math.hypot(
                pos.x - item.localPosition.x,
                pos.z - item.localPosition.z,
              ) <= WORMHOLE_PROXIMITY_RADIUS,
          );
          const desired = state.manualOverride ?? anyShipNear;
          if (desired !== state.targetOpen) {
            state.targetOpen = desired;
            state.flashBurst = 1.0; // Erupt with DS9 flash burst as wormhole opens/closes
          }
        },
      },
    };

    wormholeStates.push(state);
  }

  return {
    rootGroup,
    sunDirection,
    wormholes: wormholeStates.map((s) => s.handle),
    update(
      elapsedSeconds: number,
      deltaSeconds: number,
      simElapsedSeconds = elapsedSeconds,
    ): void {
      for (const uniform of timeUniforms) {
        uniform.value = elapsedSeconds;
      }
      beltsGroup.rotation.y = simElapsedSeconds * BELT_ROTATION_SPEED_RAD_PER_SEC;

      for (const wh of wormholeStates) {
        const targetVal = wh.targetOpen ? 1.0 : 0.0;
        const speed = wh.targetOpen ? 0.85 : 1.15;
        if (wh.openProgress < targetVal) {
          wh.openProgress = Math.min(targetVal, wh.openProgress + deltaSeconds * speed);
        } else if (wh.openProgress > targetVal) {
          wh.openProgress = Math.max(targetVal, wh.openProgress - deltaSeconds * speed);
        }
        wh.flashBurst = Math.max(0, wh.flashBurst - deltaSeconds * 1.35);

        wh.openProgressUniform.value = wh.openProgress;
        wh.flashBurstUniform.value = wh.flashBurst;
        wh.markerMat.opacity = 0.42 * (1.0 - wh.openProgress * 0.72);
        wh.markerGroup.rotation.y += deltaSeconds * (0.4 + wh.openProgress * 1.4);
      }
    },
    dispose(): void {
      for (const item of disposables) {
        item.dispose();
      }
    },
  };
}
