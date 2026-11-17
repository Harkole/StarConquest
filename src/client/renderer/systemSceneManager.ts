import * as THREE from 'three';
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
  private readonly raycaster = new THREE.Raycaster();
  private readonly selectionListeners: (() => void)[] = [];

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

    const harvestersInSystem = this.simAdapter.simulation.getHarvestersInSystem(
      this.activeSystem.id,
    );
    this.harvesterRenderer.syncHarvesters(
      harvestersInSystem,
      this.selectedHarvesterId,
    );

    const shipPositions = harvestersInSystem.map((h) => h.position);
    if (this.environmentHandle) {
      for (const wh of this.environmentHandle.wormholes) {
        wh.updateShipProximity(shipPositions);
      }
      this.environmentHandle.update(elapsedSeconds, deltaSeconds, simElapsed);
    }
  }

  private bindCanvasPicking(canvasElement: HTMLElement): void {
    let downX = 0;
    let downY = 0;

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

      // 1. Check if user clicked a Harvester in 3D space
      const pickedHarvesterId = this.harvesterRenderer.pickHarvester(this.raycaster);
      if (pickedHarvesterId) {
        this.selectAndPinHarvester(pickedHarvesterId);
        return;
      }

      // 2. Check if user clicked a Planet in 3D space
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
    this.harvesterRenderer.syncHarvesters([]);
  }
}
