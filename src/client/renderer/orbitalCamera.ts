import * as THREE from 'three';

export type CameraTargetProvider = () => {
  readonly x: number;
  readonly y?: number;
  readonly z: number;
} | null;

export class OrbitalCameraController {
  public readonly camera: THREE.PerspectiveCamera;
  private readonly domElement: HTMLElement;

  private readonly target = new THREE.Vector3(0, 0, 0);
  private readonly desiredTarget = new THREE.Vector3(0, 0, 0);

  private distance = 140;
  private desiredDistance = 140;
  private azimuthAngle = 0.45;
  private desiredAzimuth = 0.45;
  private polarAngle = 0.92; // Radians from +Y axis (2.5D/3D angled orbital view)
  private desiredPolar = 0.92;

  private isPanning = false;
  private isOrbiting = false;
  private pointerDownX = 0;
  private pointerDownY = 0;
  private lastPointerX = 0;
  private lastPointerY = 0;
  private readonly pressedKeys = new Set<string>();

  private pinnedTargetProvider: CameraTargetProvider | null = null;

  constructor(camera: THREE.PerspectiveCamera, domElement: HTMLElement) {
    this.camera = camera;
    this.domElement = domElement;
    this.bindEvents();
    this.syncCameraTransform();
  }

  public focusOn(x: number, z: number, distance = 120): void {
    this.pinnedTargetProvider = null;
    this.desiredTarget.set(x, 0, z);
    this.desiredDistance = THREE.MathUtils.clamp(distance, 32, 3200);
  }

  /**
   * Pins the camera to continuously follow a dynamic target (e.g., a selected Harvester or Planet).
   * Panning the camera manually via mouse drag or WASD/Arrow keys automatically breaks the pin.
   */
  public pinToTarget(provider: CameraTargetProvider, distance?: number): void {
    this.pinnedTargetProvider = provider;
    if (distance !== undefined) {
      this.desiredDistance = THREE.MathUtils.clamp(distance, 32, 3200);
    }
    const initial = provider();
    if (initial) {
      this.desiredTarget.set(initial.x, initial.y ?? 0, initial.z);
    }
  }

  public clearPin(): void {
    this.pinnedTargetProvider = null;
  }

  public isPinned(): boolean {
    return this.pinnedTargetProvider !== null;
  }

  public update(deltaSeconds: number): void {
    const panSpeed = this.distance * 0.95 * deltaSeconds;
    const forwardX = -Math.sin(this.azimuthAngle);
    const forwardZ = -Math.cos(this.azimuthAngle);
    const rightX = Math.cos(this.azimuthAngle);
    const rightZ = -Math.sin(this.azimuthAngle);

    let manualKeyPan = false;
    if (this.pressedKeys.has('KeyW') || this.pressedKeys.has('ArrowUp')) {
      this.desiredTarget.x += forwardX * panSpeed;
      this.desiredTarget.z += forwardZ * panSpeed;
      manualKeyPan = true;
    }
    if (this.pressedKeys.has('KeyS') || this.pressedKeys.has('ArrowDown')) {
      this.desiredTarget.x -= forwardX * panSpeed;
      this.desiredTarget.z -= forwardZ * panSpeed;
      manualKeyPan = true;
    }
    if (this.pressedKeys.has('KeyD') || this.pressedKeys.has('ArrowRight')) {
      this.desiredTarget.x += rightX * panSpeed;
      this.desiredTarget.z += rightZ * panSpeed;
      manualKeyPan = true;
    }
    if (this.pressedKeys.has('KeyA') || this.pressedKeys.has('ArrowLeft')) {
      this.desiredTarget.x -= rightX * panSpeed;
      this.desiredTarget.z -= rightZ * panSpeed;
      manualKeyPan = true;
    }

    if (manualKeyPan) {
      // User manually panned with keys -> break camera pin
      this.pinnedTargetProvider = null;
      this.desiredTarget.y = 0;
    } else if (this.pinnedTargetProvider) {
      const pinnedPos = this.pinnedTargetProvider();
      if (pinnedPos) {
        this.desiredTarget.set(pinnedPos.x, pinnedPos.y ?? 0, pinnedPos.z);
      } else {
        this.pinnedTargetProvider = null;
      }
    }

    this.desiredTarget.x = THREE.MathUtils.clamp(this.desiredTarget.x, -2600, 2600);
    this.desiredTarget.z = THREE.MathUtils.clamp(this.desiredTarget.z, -2600, 2600);

    const smoothing = 1 - Math.exp(-12 * deltaSeconds);
    this.target.lerp(this.desiredTarget, smoothing);
    this.distance = THREE.MathUtils.lerp(this.distance, this.desiredDistance, smoothing);
    this.azimuthAngle = THREE.MathUtils.lerp(
      this.azimuthAngle,
      this.desiredAzimuth,
      smoothing,
    );
    this.polarAngle = THREE.MathUtils.lerp(
      this.polarAngle,
      this.desiredPolar,
      smoothing,
    );

    this.syncCameraTransform();
  }

  private syncCameraTransform(): void {
    const sinPolar = Math.sin(this.polarAngle);
    const offsetX = this.distance * sinPolar * Math.sin(this.azimuthAngle);
    const offsetY = this.distance * Math.cos(this.polarAngle);
    const offsetZ = this.distance * sinPolar * Math.cos(this.azimuthAngle);

    this.camera.position.set(
      this.target.x + offsetX,
      this.target.y + offsetY,
      this.target.z + offsetZ,
    );
    this.camera.lookAt(this.target);
  }

  private bindEvents(): void {
    this.domElement.addEventListener('contextmenu', (e) => e.preventDefault());

    this.domElement.addEventListener('pointerdown', (e) => {
      this.pointerDownX = e.clientX;
      this.pointerDownY = e.clientY;
      this.lastPointerX = e.clientX;
      this.lastPointerY = e.clientY;
      if (e.button === 2) {
        this.isOrbiting = true;
      } else if (e.button === 0 || e.button === 1) {
        this.isPanning = true;
      }
    });

    window.addEventListener('pointerup', () => {
      this.isPanning = false;
      this.isOrbiting = false;
    });

    window.addEventListener('pointermove', (e) => {
      const dx = e.clientX - this.lastPointerX;
      const dy = e.clientY - this.lastPointerY;
      this.lastPointerX = e.clientX;
      this.lastPointerY = e.clientY;

      if (this.isOrbiting) {
        this.desiredAzimuth -= dx * 0.0065;
        this.desiredPolar = THREE.MathUtils.clamp(
          this.desiredPolar - dy * 0.0055,
          0.25,
          1.38,
        );
      } else if (this.isPanning) {
        const dragTotal = Math.hypot(
          e.clientX - this.pointerDownX,
          e.clientY - this.pointerDownY,
        );
        if (dragTotal > 4) {
          // User dragged to pan -> break camera follow pin
          this.pinnedTargetProvider = null;
          this.desiredTarget.y = 0;
        }
        const panScale = this.distance * 0.0016;
        const rightX = Math.cos(this.azimuthAngle);
        const rightZ = -Math.sin(this.azimuthAngle);
        const forwardX = -Math.sin(this.azimuthAngle);
        const forwardZ = -Math.cos(this.azimuthAngle);

        this.desiredTarget.x -= (dx * rightX - dy * forwardX) * panScale;
        this.desiredTarget.z -= (dx * rightZ - dy * forwardZ) * panScale;
      }
    });

    this.domElement.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        const zoomFactor = e.deltaY > 0 ? 1.12 : 0.89;
        this.desiredDistance = THREE.MathUtils.clamp(
          this.desiredDistance * zoomFactor,
          32,
          3200,
        );
      },
      { passive: false },
    );

    window.addEventListener('keydown', (e) => {
      this.pressedKeys.add(e.code);
    });
    window.addEventListener('keyup', (e) => {
      this.pressedKeys.delete(e.code);
    });
  }
}
