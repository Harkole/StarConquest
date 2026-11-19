import * as THREE from 'three';
import {
  DEEP_SPACE_STRUCTURES,
  type DeepSpaceStructureId,
} from '../../shared/config/index.ts';
import type { FleetStance } from '../../shared/protocol/commands.ts';
import type {
  GalaxyTopology,
  PlanetNode,
  StarSystemNode,
} from '../../shared/sim/galaxy.ts';
import type { DockyardWaypoint } from '../../shared/sim/gameSimulation.ts';
import type { LocalSimAdapter } from '../net/localSimAdapter.ts';
import { CombatFleetRenderer } from './combatFleetRenderer.ts';
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
  private selectedCombatShipId: string | null = null;
  private selectedFleetId: string | null = null;
  private environmentHandle: SpaceEnvironmentHandle | null = null;
  private planetHandles: AnimatedPlanetHandle[] = [];
  private readonly harvesterRenderer = new HarvesterFleetRenderer();
  private readonly combatFleetRenderer = new CombatFleetRenderer();
  private readonly deepSpaceModels = new StationModelLibrary();
  private readonly deepSpaceRootGroup = new THREE.Group();
  private readonly deepSpaceGroupsById = new Map<string, THREE.Group>();
  private lastDeepSpaceSignature: string | null = null;

  private pendingDeepSpaceBuildType: DeepSpaceStructureId | null = null;
  private pendingFleetOrder: {
    readonly mode: 'rally' | 'patrol' | 'create_fleet' | 'fleet_patrol';
    readonly dockyardId?: string;
    readonly fleetId?: string;
    readonly stance: FleetStance;
    readonly autoResupply?: boolean;
    readonly collectedWaypoints: DockyardWaypoint[];
  } | null = null;
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
    this.scene.add(this.combatFleetRenderer.rootGroup);
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

  public getSelectedCombatShipId(): string | null {
    return this.selectedCombatShipId;
  }

  public getSelectedFleetId(): string | null {
    return this.selectedFleetId;
  }

  public selectFleet(fleetId: string | null): void {
    this.selectedFleetId = fleetId;
    if (!fleetId) {
      this.selectedCombatShipId = null;
      this.notifySelectionChanged();
      return;
    }
    const anchor = this.simAdapter.simulation.getFleetLiveAnchor(fleetId);
    if (anchor) {
      if (anchor.systemId !== this.activeSystem.id) {
        this.loadSystem(anchor.systemId);
      }
      this.selectedHarvesterId = null;
      this.cameraController.pinToTarget(
        () => {
          const live = this.simAdapter.simulation.getFleetLiveAnchor(fleetId);
          return live ? { x: live.position.x, y: 1.6, z: live.position.z } : null;
        },
        110,
      );
    }
    this.notifySelectionChanged();
  }

  public getPendingFleetOrder(): {
    readonly mode: 'rally' | 'patrol' | 'create_fleet' | 'fleet_patrol';
    readonly dockyardId?: string;
    readonly fleetId?: string;
    readonly waypointCount: number;
  } | null {
    if (!this.pendingFleetOrder) {
      return null;
    }
    return {
      mode: this.pendingFleetOrder.mode,
      dockyardId: this.pendingFleetOrder.dockyardId,
      fleetId: this.pendingFleetOrder.fleetId,
      waypointCount: this.pendingFleetOrder.collectedWaypoints.length,
    };
  }

  public startCreateFleetPlacement(
    stance: FleetStance = 'aggressive',
    autoResupply = true,
  ): void {
    this.startDeepSpacePlacement(null);
    this.pendingFleetOrder = {
      mode: 'create_fleet',
      stance,
      autoResupply,
      collectedWaypoints: [],
    };
    this.notifySelectionChanged();
  }

  public startFleetPatrolPlacement(fleetId: string): void {
    this.startDeepSpacePlacement(null);
    const fleet = this.simAdapter.simulation.getFleetById(fleetId);
    this.pendingFleetOrder = {
      mode: 'fleet_patrol',
      fleetId,
      stance: fleet?.stance ?? 'aggressive',
      collectedWaypoints: [],
    };
    this.notifySelectionChanged();
  }

  public startRallyPointPlacement(dockyardId: string, stance: FleetStance): void {
    this.startDeepSpacePlacement(null);
    this.pendingFleetOrder = {
      mode: 'rally',
      dockyardId,
      stance,
      collectedWaypoints: [],
    };
    this.notifySelectionChanged();
  }

  public startPatrolRoutePlacement(dockyardId: string, stance: FleetStance): void {
    this.startDeepSpacePlacement(null);
    this.pendingFleetOrder = {
      mode: 'patrol',
      dockyardId,
      stance,
      collectedWaypoints: [],
    };
    this.notifySelectionChanged();
  }

  public cancelFleetOrderPlacement(): void {
    if (this.pendingFleetOrder !== null) {
      this.pendingFleetOrder = null;
      this.notifySelectionChanged();
    }
  }

  public selectAndPinCombatShip(shipId: string | null): void {
    if (!shipId) {
      this.selectedCombatShipId = null;
      this.cameraController.clearPin();
      this.notifySelectionChanged();
      return;
    }

    const ship = this.simAdapter.simulation.getCombatShipById(shipId);
    if (!ship) {
      return;
    }
    if (ship.currentSystemId !== this.activeSystem.id) {
      this.loadSystem(ship.currentSystemId);
    }

    this.selectedHarvesterId = null;
    this.selectedCombatShipId = ship.id;
    // Selecting any ship in a fleet selects the entire fleet
    this.selectedFleetId = ship.fleetId;
    this.cameraController.pinToTarget(() => {
      const liveShip = this.simAdapter.simulation.getCombatShipById(shipId);
      if (!liveShip) {
        return null;
      }
      if (liveShip.currentSystemId !== this.activeSystem.id) {
        this.loadSystem(liveShip.currentSystemId);
        this.selectedCombatShipId = liveShip.id;
        this.notifySelectionChanged();
      }
      return { x: liveShip.position.x, y: 1.6, z: liveShip.position.z };
    }, 64);

    this.notifySelectionChanged();
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

  public focusWormhole(wormholeId: string): void {
    const wh = this.environmentHandle?.wormholes.find(
      (item) => item.wormholeId === wormholeId,
    );
    if (!wh) {
      return;
    }
    this.selectedHarvesterId = null;
    this.cameraController.pinToTarget(
      () => ({ x: wh.position.x, y: 0, z: wh.position.z }),
      92,
    );
    this.notifySelectionChanged();
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

    const combatShipsInSystem = this.simAdapter.simulation.getCombatShipsInSystem(
      this.activeSystem.id,
    );
    this.combatFleetRenderer.syncShips(
      combatShipsInSystem,
      this.selectedCombatShipId,
      this.selectedFleetId,
      elapsedSeconds,
    );

    // Render Rally / Move beacons & Patrol Route 3D markers for player Fleets & Dockyards
    const rallyPointsInSystem: { readonly x: number; readonly z: number }[] = [];
    const patrolRoutes: (readonly DockyardWaypoint[])[] = [];
    for (const fleet of this.simAdapter.simulation.getFleetsForPlayer(
      this.simAdapter.localPlayerId,
    )) {
      if (fleet.orderType === 'patrol' && fleet.patrolWaypoints.length >= 2) {
        patrolRoutes.push(fleet.patrolWaypoints);
      } else if (fleet.orderSystemId === this.activeSystem.id) {
        rallyPointsInSystem.push(fleet.orderPosition);
      }
    }
    for (const sys of this.galaxy.systems) {
      for (const planetState of this.simAdapter.simulation.getPlanetsInSystem(sys.id)) {
        for (const s of planetState.structures) {
          if (
            s.structureId === 'orbital_dockyard' &&
            s.ownerId === this.simAdapter.localPlayerId
          ) {
            if (s.rallyPoint && s.rallyPoint.systemId === this.activeSystem.id) {
              rallyPointsInSystem.push(s.rallyPoint.position);
            }
            if (s.patrolWaypoints && s.patrolWaypoints.length >= 2) {
              patrolRoutes.push(s.patrolWaypoints);
            }
          }
        }
      }
    }
    this.combatFleetRenderer.syncOrdersOverlay(
      this.activeSystem.id,
      rallyPointsInSystem,
      patrolRoutes,
    );

    const shipPositions = [
      ...harvestersInSystem.map((h) => h.position),
      ...combatShipsInSystem.map((s) => s.position),
    ];
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
      if (e.key === 'Escape') {
        if (this.pendingDeepSpaceBuildType !== null) {
          this.startDeepSpacePlacement(null);
          this.notifyPlacementResult('Cancelled deep-space placement mode.', false);
        } else if (this.pendingFleetOrder !== null) {
          this.cancelFleetOrderPlacement();
          this.notifyPlacementResult('Cancelled fleet order placement.', false);
        }
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

    let rightDownX = 0;
    let rightDownY = 0;

    canvasElement.addEventListener('pointerdown', (e) => {
      if (e.button === 0) {
        downX = e.clientX;
        downY = e.clientY;
      } else if (e.button === 2) {
        rightDownX = e.clientX;
        rightDownY = e.clientY;
      }
    });

    canvasElement.addEventListener('pointerup', (e) => {
      // Short right-click tap (not a camera orbit drag): issue fleet-wide Move order if a fleet is selected
      if (e.button === 2) {
        const rightMoveDist = Math.hypot(e.clientX - rightDownX, e.clientY - rightDownY);
        if (rightMoveDist <= 5 && this.selectedFleetId) {
          const rect = canvasElement.getBoundingClientRect();
          const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
          const ndcY = -((e.clientY - rect.top) / rect.height) * 2 + 1;
          this.raycaster.setFromCamera(
            new THREE.Vector2(ndcX, ndcY),
            this.cameraController.camera,
          );
          if (this.raycaster.ray.intersectPlane(this.orbitalPlane, hitPoint)) {
            const pos = { x: Math.round(hitPoint.x), z: Math.round(hitPoint.z) };
            const res = this.simAdapter.submitPlayerCommand({
              type: 'ORDER_FLEET_MOVE',
              playerId: this.simAdapter.localPlayerId,
              fleetId: this.selectedFleetId,
              targetSystemId: this.activeSystem.id,
              targetPosition: pos,
            });
            const fleet = this.simAdapter.simulation.getFleetById(this.selectedFleetId);
            this.notifyPlacementResult(
              res.ok
                ? `${fleet?.name ?? 'Fleet'} moving to (${pos.x}, ${pos.z}) in ${this.activeSystem.name}.`
                : `Cannot move fleet: ${res.reason}`,
              res.ok,
            );
          }
        }
        return;
      }

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

      // 0a. If in Fleet Order Placement Mode (Create Fleet, Fleet Patrol, or Dockyard Rally/Patrol)
      if (this.pendingFleetOrder) {
        if (this.raycaster.ray.intersectPlane(this.orbitalPlane, hitPoint)) {
          const pos = { x: Math.round(hitPoint.x), z: Math.round(hitPoint.z) };
          const order = this.pendingFleetOrder;
          if (order.mode === 'create_fleet') {
            const res = this.simAdapter.submitPlayerCommand({
              type: 'CREATE_FLEET',
              playerId: this.simAdapter.localPlayerId,
              rallySystemId: this.activeSystem.id,
              rallyPosition: pos,
              stance: order.stance,
              autoResupply: order.autoResupply ?? true,
            });
            this.pendingFleetOrder = null;
            if (res.ok) {
              const fleets = this.simAdapter.simulation.getFleetsForPlayer(
                this.simAdapter.localPlayerId,
              );
              const created = fleets[fleets.length - 1];
              if (created) {
                this.selectedFleetId = created.id;
              }
            }
            this.notifySelectionChanged();
            this.notifyPlacementResult(
              res.ok
                ? `Created new Fleet with Rally Point at (${pos.x}, ${pos.z}) in ${this.activeSystem.name}.`
                : `Cannot create Fleet: ${res.reason}`,
              res.ok,
            );
          } else if (order.mode === 'fleet_patrol' && order.fleetId) {
            order.collectedWaypoints.push({
              systemId: this.activeSystem.id,
              position: pos,
            });
            if (order.collectedWaypoints.length < 2) {
              this.notifySelectionChanged();
              this.notifyPlacementResult(
                `Fleet Patrol Waypoint #1 set at (${pos.x}, ${pos.z}). Click a second point to start patrolling.`,
                true,
              );
            } else {
              const res = this.simAdapter.submitPlayerCommand({
                type: 'ORDER_FLEET_PATROL',
                playerId: this.simAdapter.localPlayerId,
                fleetId: order.fleetId,
                waypoints: order.collectedWaypoints,
              });
              this.pendingFleetOrder = null;
              this.notifySelectionChanged();
              this.notifyPlacementResult(
                res.ok
                  ? `Fleet Patrol Route active (${order.collectedWaypoints.length} waypoints).`
                  : `Cannot set Fleet Patrol: ${res.reason}`,
                res.ok,
              );
            }
          } else if (order.mode === 'rally' && order.dockyardId) {
            const res = this.simAdapter.submitPlayerCommand({
              type: 'SET_RALLY_POINT',
              playerId: this.simAdapter.localPlayerId,
              dockyardId: order.dockyardId,
              targetSystemId: this.activeSystem.id,
              targetPosition: pos,
              stance: order.stance,
            });
            this.pendingFleetOrder = null;
            this.notifySelectionChanged();
            this.notifyPlacementResult(
              res.ok
                ? `Rally Point set in ${this.activeSystem.name} at (${pos.x}, ${pos.z}).`
                : `Cannot set Rally Point: ${res.reason}`,
              res.ok,
            );
          } else if (order.dockyardId) {
            order.collectedWaypoints.push({
              systemId: this.activeSystem.id,
              position: pos,
            });
            if (order.collectedWaypoints.length < 2) {
              this.notifySelectionChanged();
              this.notifyPlacementResult(
                `Patrol Waypoint #1 set at (${pos.x}, ${pos.z}). Click a second point (in this or another system) to complete route.`,
                true,
              );
            } else {
              const res = this.simAdapter.submitPlayerCommand({
                type: 'SET_PATROL_ROUTE',
                playerId: this.simAdapter.localPlayerId,
                dockyardId: order.dockyardId,
                waypoints: order.collectedWaypoints,
                stance: order.stance,
              });
              this.pendingFleetOrder = null;
              this.notifySelectionChanged();
              this.notifyPlacementResult(
                res.ok
                  ? `Patrol Route active (${order.collectedWaypoints.length} waypoints).`
                  : `Cannot set Patrol Route: ${res.reason}`,
                res.ok,
              );
            }
          }
        }
        return;
      }

      // 0b. If in Deep-Space Placement Mode, place structure at clicked (x, z) coordinate on orbital plane
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

      // 1a. Check if user clicked a Combat Ship in 3D space
      const pickedCombatShipId = this.combatFleetRenderer.pickCombatShip(this.raycaster);
      if (pickedCombatShipId) {
        this.selectAndPinCombatShip(pickedCombatShipId);
        return;
      }

      // 1b. Check if user clicked a Harvester in 3D space
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
    this.combatFleetRenderer.syncShips([], null, null, 0);
    this.combatFleetRenderer.syncOrdersOverlay('', [], []);
  }
}
