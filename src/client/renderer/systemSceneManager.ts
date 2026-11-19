import * as THREE from 'three';
import {
  DEEP_SPACE_STRUCTURES,
  type DeepSpaceStructureId,
} from '../../shared/config/index.ts';
import type {
  GalaxyTopology,
  PlanetNode,
  StarSystemNode,
} from '../../shared/sim/galaxy.ts';
import type { LocalSimAdapter } from '../net/localSimAdapter.ts';
import { HarvesterFleetRenderer } from './harvesterFleetRenderer.ts';
import type { OrbitalCameraController } from './orbitalCamera.ts';
import {
  type AnimatedPlanetHandle,
  createLivingPlanetGroup,
} from './planetFactory.ts';
import {
  createStarSystemEnvironment,
  type SpaceEnvironmentHandle,
  type WormholeInstanceHandle,
} from './spaceEnvironmentFactory.ts';
import { StationModelLibrary } from './stationModels.ts';

export class SystemSceneManager {
  private readonly scene: THREE.Scene;
  private readonly galaxy: GalaxyTopology;
  public readonly cameraController: OrbitalCameraController;
  public readonly simAdapter: LocalSimAdapter;

  private activeSystem: StarSystemNode;
  private selectedPlanetId: string;
  private selectedHarvesterId: string | null = null;
  private environmentHandle: SpaceEnvironmentHandle | null = null;
  private planetHandles: AnimatedPlanetHandle[] = [];
  private readonly harvesterRenderer = new HarvesterFleetRenderer();
  private readonly deepSpaceModels = new StationModelLibrary();
  private readonly deepSpaceRootGroup = new THREE.Group();
  private readonly deepSpaceGroupsById = new Map<string, THREE.Group>();
  private lastDeepSpaceSignature: string | null = null;

  private pendingDeepSpaceBuildType: DeepSpaceStructureId | null = null;
  private readonly placementPreviewGroup = new THREE.Group();
  private readonly hubRadiusRingGeom = new THREE.RingGeometry(
    DEEP_SPACE_STRUCTURES.logistics_hub.buildRadiusProvided - 1.2,
    DEEP_SPACE_STRUCTURES.logistics_hub.buildRadiusProvided,
    64,
  ).rotateX(-Math.PI / 2);
  private readonly hubRadiusRingMat = new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.35,
    side: THREE.DoubleSide,
  });
  private readonly placementPreviewWireframeMat = new THREE.MeshBasicMaterial({
    color: 0x22c55e,
    wireframe: true,
    transparent: true,
    opacity: 0.85,
  });
  private readonly placementPreviewRingMat = new THREE.MeshBasicMaterial({
    color: 0x22c55e,
    transparent: true,
    opacity: 0.42,
    side: THREE.DoubleSide,
  });

  private readonly raycaster = new THREE.Raycaster();
  private readonly orbitalPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private readonly selectionListeners: (() => void)[] = [];
  private readonly placementResultListeners: ((message: string, ok: boolean) => void)[] =
    [];

  constructor(
    scene: THREE.Scene,
    galaxy: GalaxyTopology,
    cameraController: OrbitalCameraController,
    simAdapter: LocalSimAdapter,
    canvasElement?: HTMLElement,
  ) {
    this.scene = scene;
    this.galaxy = galaxy;
    this.cameraController = cameraController;
    this.simAdapter = simAdapter;
    this.scene.add(this.harvesterRenderer.rootGroup);
    this.scene.add(this.deepSpaceRootGroup);
    this.placementPreviewGroup.visible = false;
    this.scene.add(this.placementPreviewGroup);

    const initialSystem = galaxy.systems[0];
    if (!initialSystem) {
      throw new Error('Galaxy contains no star systems');
    }
    this.activeSystem = initialSystem;
    this.selectedPlanetId = initialSystem.planets[0]?.id ?? '';
    this.loadSystem(initialSystem.id);

    if (canvasElement) {
      this.bindCanvasPicking(canvasElement);
    }
  }

  public onSelectionChange(listener: () => void): void {
    this.selectionListeners.push(listener);
  }

  public onDeepSpacePlacementResult(
    listener: (message: string, ok: boolean) => void,
  ): void {
    this.placementResultListeners.push(listener);
  }

  public getPendingDeepSpacePlacement(): DeepSpaceStructureId | null {
    return this.pendingDeepSpaceBuildType;
  }

  public startDeepSpacePlacement(structureId: DeepSpaceStructureId | null): void {
    this.pendingDeepSpaceBuildType = structureId;
    this.placementPreviewGroup.clear();
    if (!structureId) {
      this.placementPreviewGroup.visible = false;
      this.notifySelectionChanged();
      return;
    }

    const previewMesh = this.deepSpaceModels.buildStationMesh(structureId, false);
    previewMesh.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.material = this.placementPreviewWireframeMat;
      }
    });
    this.placementPreviewGroup.add(previewMesh);
    if (structureId === 'logistics_hub') {
      const radiusMesh = new THREE.Mesh(
        this.hubRadiusRingGeom,
        this.placementPreviewRingMat,
      );
      radiusMesh.position.set(0, 0.25, 0);
      this.placementPreviewGroup.add(radiusMesh);
    }

    const initialHit = new THREE.Vector3(0, 0, 0);
    this.raycaster.setFromCamera(
      new THREE.Vector2(0, 0),
      this.cameraController.camera,
    );
    this.raycaster.ray.intersectPlane(this.orbitalPlane, initialHit);
    this.placementPreviewGroup.position.set(
      Math.round(initialHit.x),
      0,
      Math.round(initialHit.z),
    );
    this.placementPreviewGroup.visible = true;
    this.updatePlacementPreviewValidity();
    this.notifySelectionChanged();
  }

  private updatePlacementPreviewValidity(): void {
    if (!this.pendingDeepSpaceBuildType) {
      return;
    }
    const validation = this.simAdapter.simulation.validateDeepSpacePlacement(
      this.simAdapter.localPlayerId,
      this.activeSystem.id,
      {
        x: Math.round(this.placementPreviewGroup.position.x),
        z: Math.round(this.placementPreviewGroup.position.z),
      },
      this.pendingDeepSpaceBuildType,
    );
    const previewColor = validation.ok ? 0x22c55e : 0xef4444;
    this.placementPreviewWireframeMat.color.setHex(previewColor);
    this.placementPreviewRingMat.color.setHex(previewColor);
  }

  public focusDeepSpaceStructure(structureId: string): void {
    const ds = this.simAdapter.simulation.getDeepSpaceStructureById(structureId);
    if (!ds) {
      return;
    }
    if (ds.systemId !== this.activeSystem.id) {
      this.loadSystem(ds.systemId);
    }
    this.selectedHarvesterId = null;
    this.cameraController.pinToTarget(
      () => ({ x: ds.position.x, y: 0, z: ds.position.z }),
      76,
    );
    this.notifySelectionChanged();
  }

  public getActiveSystem(): StarSystemNode {
    return this.activeSystem;
  }

  public getActivePlanets(): readonly PlanetNode[] {
    return this.activeSystem.planets;
  }

  public getSelectedPlanetId(): string {
    return this.selectedPlanetId;
  }

  public getSelectedHarvesterId(): string | null {
    return this.selectedHarvesterId;
  }

  public getActiveWormholes(): readonly WormholeInstanceHandle[] {
    return this.environmentHandle?.wormholes ?? [];
  }

  public loadSystem(systemId: string): StarSystemNode {
    const targetSystem = this.galaxy.systems.find((s) => s.id === systemId);
    if (!targetSystem) {
      throw new Error(`Unknown star system id: ${systemId}`);
    }

    this.clearCurrentSystem();
    this.activeSystem = targetSystem;

    const wormholesInSystem = this.galaxy.wormholes
      .filter(
        (wh) => wh.fromSystemId === targetSystem.id || wh.toSystemId === targetSystem.id,
      )
      .map((wh) => {
        const isOutgoing = wh.fromSystemId === targetSystem.id;
        return {
          wormhole: wh,
          localPosition: isOutgoing ? wh.fromPosition : wh.toPosition,
          destinationSystemId: isOutgoing ? wh.toSystemId : wh.fromSystemId,
        };
      });

    this.environmentHandle = createStarSystemEnvironment(
      targetSystem,
      wormholesInSystem,
    );
    this.environmentHandle.syncBeltDepletion?.(
      this.simAdapter.simulation.getMiningBeltsInSystem(targetSystem.id),
    );
    this.scene.add(this.environmentHandle.rootGroup);

    const sunDir = this.environmentHandle.sunDirection;
    this.planetHandles = targetSystem.planets.map((planet) => {
      const handle = createLivingPlanetGroup(planet, sunDir);
      const runtimeState = this.simAdapter.simulation.getPlanetState(planet.id);
      handle.syncStructures(runtimeState);
      this.scene.add(handle.rootGroup);
      return handle;
    });

    const primaryPlanet = targetSystem.planets[0];
    if (primaryPlanet) {
      this.selectedPlanetId = primaryPlanet.id;
      const defaultDist =
        primaryPlanet.planetClass === 'super_earth' ? 140 : 112;
      this.cameraController.pinToTarget(
        () => ({ x: primaryPlanet.position.x, y: 0, z: primaryPlanet.position.z }),
        defaultDist,
      );
    }

    return targetSystem;
  }

  public focusPlanet(planetId: string): void {
    const planet = this.activeSystem.planets.find((p) => p.id === planetId);
    if (!planet) {
      return;
    }
    this.selectedPlanetId = planet.id;
    this.selectedHarvesterId = null;
    const zoomDistance =
      planet.planetClass === 'super_earth'
        ? 128
        : planet.planetClass === 'large'
          ? 102
          : planet.planetClass === 'medium'
            ? 78
            : 60;
    this.cameraController.pinToTarget(
      () => ({ x: planet.position.x, y: 0, z: planet.position.z }),
      zoomDistance,
    );
    this.notifySelectionChanged();
  }

  public selectAndPinHarvester(harvesterId: string | null): void {
    if (!harvesterId) {
      this.selectedHarvesterId = null;
      this.cameraController.clearPin();
      this.notifySelectionChanged();
      return;
    }

    const h = this.simAdapter.simulation.getHarvesterById(harvesterId);
    if (!h) {
      return;
    }

    if (h.currentSystemId !== this.activeSystem.id) {
      this.loadSystem(h.currentSystemId);
    }

    this.selectedHarvesterId = h.id;
    this.cameraController.pinToTarget(() => {
      const liveH = this.simAdapter.simulation.getHarvesterById(harvesterId);
      if (!liveH) {
        return null;
      }
      // If the pinned Harvester transits a wormhole into another system, switch system view with it
      if (liveH.currentSystemId !== this.activeSystem.id) {
        this.loadSystem(liveH.currentSystemId);
        this.selectedHarvesterId = liveH.id;
        this.notifySelectionChanged();
      }
      return {
        x: liveH.position.x,
        y: liveH.targetRockWorldPos ? liveH.targetRockWorldPos.y : 1.5,
        z: liveH.position.z,
      };
    }, 52);

    this.notifySelectionChanged();
  }

  public focusAndToggleWormhole(wormholeId: string): boolean {
    const wh = this.environmentHandle?.wormholes.find(
      (item) => item.wormholeId === wormholeId,
    );
    if (!wh) {
      return false;
    }
    this.selectedHarvesterId = null;
    this.cameraController.pinToTarget(
      () => ({ x: wh.position.x, y: 0, z: wh.position.z }),
      92,
    );
    this.notifySelectionChanged();
    return wh.toggleManualOpen();
  }

  public focusSystemOverview(): void {
    this.selectedHarvesterId = null;
    this.cameraController.focusOn(0, 0, 2350);
    this.notifySelectionChanged();
  }

  public update(elapsedSeconds: number, deltaSeconds: number): void {
    this.simAdapter.update(deltaSeconds);
    const simElapsed = this.simAdapter.simulation.elapsedSeconds;

    for (const handle of this.planetHandles) {
      const runtimeState = this.simAdapter.simulation.getPlanetState(handle.planet.id);
      handle.syncStructures(runtimeState);
      handle.update(elapsedSeconds, deltaSeconds, simElapsed);
    }

    this.syncAndAnimateDeepSpaceStructures(elapsedSeconds);
    if (this.pendingDeepSpaceBuildType !== null) {
      this.updatePlacementPreviewValidity();
    }

    const harvestersInSystem = this.simAdapter.simulation.getHarvestersInSystem(
      this.activeSystem.id,
    );
    this.harvesterRenderer.syncHarvesters(
      harvestersInSystem,
      this.selectedHarvesterId,
    );

    const shipPositions = harvestersInSystem.map((h) => h.position);
    if (this.environmentHandle) {
      this.environmentHandle.syncBeltDepletion?.(
        this.simAdapter.simulation.getMiningBeltsInSystem(this.activeSystem.id),
      );
      for (const wh of this.environmentHandle.wormholes) {
        wh.updateShipProximity(shipPositions);
      }
      this.environmentHandle.update(elapsedSeconds, deltaSeconds, simElapsed);
    }
  }

  private syncAndAnimateDeepSpaceStructures(elapsedSeconds: number): void {
    const deepSpaceStructs = this.simAdapter.simulation.getDeepSpaceStructuresInSystem(
      this.activeSystem.id,
    );
    const sig = deepSpaceStructs
      .map((s) => `${s.id}:${s.isComplete ? '1' : '0'}`)
      .join('|');

    if (sig !== this.lastDeepSpaceSignature) {
      this.lastDeepSpaceSignature = sig;
      this.deepSpaceRootGroup.clear();
      this.deepSpaceGroupsById.clear();

      for (const ds of deepSpaceStructs) {
        const stationGroup = this.deepSpaceModels.buildStationMesh(
          ds.structureId,
          ds.isComplete,
        );
        stationGroup.position.set(ds.position.x, 0, ds.position.z);

        // Display operational 180u build-radius tether ring around completed Logistics Hubs
        if (ds.structureId === 'logistics_hub' && ds.isComplete) {
          const radiusRing = new THREE.Mesh(
            this.hubRadiusRingGeom,
            this.hubRadiusRingMat,
          );
          radiusRing.position.set(0, 0.2, 0);
          stationGroup.add(radiusRing);
        }

        this.deepSpaceRootGroup.add(stationGroup);
        this.deepSpaceGroupsById.set(ds.id, stationGroup);
      }
    }

    for (const ds of deepSpaceStructs) {
      const group = this.deepSpaceGroupsById.get(ds.id);
      if (group) {
        this.deepSpaceModels.updateStationAnimation(group, elapsedSeconds, null);
      }
    }
  }

  private bindCanvasPicking(canvasElement: HTMLElement): void {
    let downX = 0;
    let downY = 0;
    const hitPoint = new THREE.Vector3();

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.pendingDeepSpaceBuildType !== null) {
        this.startDeepSpacePlacement(null);
        this.notifyPlacementResult('Cancelled deep-space placement mode.', false);
      }
    });

    canvasElement.addEventListener('pointermove', (e) => {
      if (!this.pendingDeepSpaceBuildType) {
        return;
      }
      const rect = canvasElement.getBoundingClientRect();
      const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const ndcY = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      this.raycaster.setFromCamera(
        new THREE.Vector2(ndcX, ndcY),
        this.cameraController.camera,
      );
      if (this.raycaster.ray.intersectPlane(this.orbitalPlane, hitPoint)) {
        this.placementPreviewGroup.position.set(
          Math.round(hitPoint.x),
          0,
          Math.round(hitPoint.z),
        );
        this.placementPreviewGroup.visible = true;
        this.updatePlacementPreviewValidity();
      }
    });

    canvasElement.addEventListener('pointerdown', (e) => {
      if (e.button === 0) {
        downX = e.clientX;
        downY = e.clientY;
      }
    });

    canvasElement.addEventListener('pointerup', (e) => {
      if (e.button !== 0) {
        return;
      }
      const moveDist = Math.hypot(e.clientX - downX, e.clientY - downY);
      if (moveDist > 5) {
        return; // Ignore camera pan drags
      }

      const rect = canvasElement.getBoundingClientRect();
      const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const ndcY = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      this.raycaster.setFromCamera(
        new THREE.Vector2(ndcX, ndcY),
        this.cameraController.camera,
      );

      // 0. If in Deep-Space Placement Mode, place structure at clicked (x, z) coordinate on orbital plane
      if (this.pendingDeepSpaceBuildType) {
        if (this.raycaster.ray.intersectPlane(this.orbitalPlane, hitPoint)) {
          const structId = this.pendingDeepSpaceBuildType;
          const pos = { x: Math.round(hitPoint.x), z: Math.round(hitPoint.z) };
          this.placementPreviewGroup.position.set(pos.x, 0, pos.z);
          const res = this.simAdapter.submitPlayerCommand({
            type: 'BUILD_DEEP_SPACE_STRUCTURE',
            playerId: this.simAdapter.localPlayerId,
            systemId: this.activeSystem.id,
            position: pos,
            structureId: structId,
          });
          if (res.ok) {
            const cfg = DEEP_SPACE_STRUCTURES[structId];
            this.startDeepSpacePlacement(null);
            this.notifyPlacementResult(
              `Started constructing ${cfg.displayName} at (${pos.x}, ${pos.z})`,
              true,
            );
          } else {
            this.updatePlacementPreviewValidity();
            this.notifyPlacementResult(
              `Cannot place here: ${res.reason}`,
              false,
            );
          }
        }
        return;
      }

      // 1. Check if user clicked a Harvester in 3D space
      const pickedHarvesterId = this.harvesterRenderer.pickHarvester(this.raycaster);
      if (pickedHarvesterId) {
        this.selectAndPinHarvester(pickedHarvesterId);
        return;
      }

      // 2. Check if user clicked a Deep-Space Structure in 3D space
      for (const [dsId, dsGroup] of this.deepSpaceGroupsById.entries()) {
        const hits = this.raycaster.intersectObject(dsGroup, true);
        if (hits.length > 0) {
          this.focusDeepSpaceStructure(dsId);
          return;
        }
      }

      // 3. Check if user clicked a Planet in 3D space
      for (const pHandle of this.planetHandles) {
        const hits = this.raycaster.intersectObject(pHandle.rootGroup, true);
        if (hits.length > 0) {
          this.focusPlanet(pHandle.planet.id);
          return;
        }
      }
    });
  }

  private notifySelectionChanged(): void {
    for (const cb of this.selectionListeners) {
      cb();
    }
  }

  private notifyPlacementResult(message: string, ok: boolean): void {
    for (const cb of this.placementResultListeners) {
      cb(message, ok);
    }
  }

  private clearCurrentSystem(): void {
    if (this.environmentHandle) {
      this.scene.remove(this.environmentHandle.rootGroup);
      this.environmentHandle.dispose();
      this.environmentHandle = null;
    }
    for (const handle of this.planetHandles) {
      this.scene.remove(handle.rootGroup);
      handle.dispose();
    }
    this.planetHandles = [];
    this.deepSpaceRootGroup.clear();
    this.deepSpaceGroupsById.clear();
    this.lastDeepSpaceSignature = null;
    this.harvesterRenderer.syncHarvesters([]);
  }
}
