import * as THREE from 'three';
import type {
  GalaxyTopology,
  PlanetNode,
  StarSystemNode,
} from '../../shared/sim/galaxy.ts';
import type { OrbitalCameraController } from './orbitalCamera.ts';
import {
  type AnimatedPlanetHandle,
  createLivingPlanetGroup,
} from './planetFactory.ts';
import {
  createStarSystemEnvironment,
  type SpaceEnvironmentHandle,
} from './spaceEnvironmentFactory.ts';

export class SystemSceneManager {
  private readonly scene: THREE.Scene;
  private readonly galaxy: GalaxyTopology;
  private readonly cameraController: OrbitalCameraController;

  private activeSystem: StarSystemNode;
  private environmentHandle: SpaceEnvironmentHandle | null = null;
  private planetHandles: AnimatedPlanetHandle[] = [];

  constructor(
    scene: THREE.Scene,
    galaxy: GalaxyTopology,
    cameraController: OrbitalCameraController,
  ) {
    this.scene = scene;
    this.galaxy = galaxy;
    this.cameraController = cameraController;
    const initialSystem = galaxy.systems[0];
    if (!initialSystem) {
      throw new Error('Galaxy contains no star systems');
    }
    this.activeSystem = initialSystem;
    this.loadSystem(initialSystem.id);
  }

  public getActiveSystem(): StarSystemNode {
    return this.activeSystem;
  }

  public getActivePlanets(): readonly PlanetNode[] {
    return this.activeSystem.planets;
  }

  public loadSystem(systemId: string): StarSystemNode {
    const targetSystem = this.galaxy.systems.find((s) => s.id === systemId);
    if (!targetSystem) {
      throw new Error(`Unknown star system id: ${systemId}`);
    }

    this.clearCurrentSystem();
    this.activeSystem = targetSystem;

    // Collect wormholes connected to this star system
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
      this.scene.add(handle.rootGroup);
      return handle;
    });

    // Focus camera on primary planet (Homeworld or Central Super-Earth)
    const primaryPlanet = targetSystem.planets[0];
    if (primaryPlanet) {
      const defaultDist =
        primaryPlanet.planetClass === 'super_earth' ? 128 : 102;
      this.cameraController.focusOn(
        primaryPlanet.position.x,
        primaryPlanet.position.z,
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
    const zoomDistance =
      planet.planetClass === 'super_earth'
        ? 122
        : planet.planetClass === 'large'
          ? 96
          : planet.planetClass === 'medium'
            ? 74
            : 58;
    this.cameraController.focusOn(planet.position.x, planet.position.z, zoomDistance);
  }

  public focusSystemOverview(): void {
    this.cameraController.focusOn(0, 0, 520);
  }

  public update(elapsedSeconds: number, deltaSeconds: number): void {
    this.environmentHandle?.update(elapsedSeconds, deltaSeconds);
    for (const handle of this.planetHandles) {
      handle.update(elapsedSeconds, deltaSeconds);
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
  }
}
