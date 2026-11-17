import * as THREE from 'three';

export class OrbitalCameraController {
  public readonly camera: THREE.PerspectiveCamera;
  private readonly domElement: HTMLElement;

  private readonly target = new THREE.Vector3(0, 0, 0);
  private readonly desiredTarget = new THREE.Vector3(0, 0, 0);

  private distance = 125;
  private desiredDistance = 125;
  private azimuthAngle = 0.45;
  private desiredAzimuth = 0.45;
  private polarAngle = 0.92; // Radians from +Y axis (2.5D/3D angled orbital view)
  private desiredPolar = 0.92;

  private isPanning = false;
  private isOrbiting = false;
  private lastPointerX = 0;
  private lastPointerY = 0;
  private readonly pressedKeys = new Set<string>();

  constructor(camera: THREE.PerspectiveCamera, domElement: HTMLElement) {
    this.camera = camera;
    this.domElement = domElement;
    this.bindEvents();
    this.syncCameraTransform();
  }

  public focusOn(x: number, z: number, distance = 105): void {
    this.desiredTarget.set(x, 0, z);
    this.desiredDistance = THREE.MathUtils.clamp(distance, 48, 720);
  }

  public update(deltaSeconds: number): void {
    const panSpeed = this.distance * 0.85 * deltaSeconds;
    const forwardX = -Math.sin(this.azimuthAngle);
    const forwardZ = -Math.cos(this.azimuthAngle);
    const rightX = Math.cos(this.azimuthAngle);
    const rightZ = -Math.sin(this.azimuthAngle);

    if (this.pressedKeys.has('KeyW') || this.pressedKeys.has('ArrowUp')) {
      this.desiredTarget.x += forwardX * panSpeed;
      this.desiredTarget.z += forwardZ * panSpeed;
    }
    if (this.pressedKeys.has('KeyS') || this.pressedKeys.has('ArrowDown')) {
      this.desiredTarget.x -= forwardX * panSpeed;
      this.desiredTarget.z -= forwardZ * panSpeed;
    }
    if (this.pressedKeys.has('KeyD') || this.pressedKeys.has('ArrowRight')) {
      this.desiredTarget.x += rightX * panSpeed;
      this.desiredTarget.z += rightZ * panSpeed;
    }
    if (this.pressedKeys.has('KeyA') || this.pressedKeys.has('ArrowLeft')) {
      this.desiredTarget.x -= rightX * panSpeed;
      this.desiredTarget.z -= rightZ * panSpeed;
    }

    this.desiredTarget.x = THREE.MathUtils.clamp(this.desiredTarget.x, -550, 550);
    this.desiredTarget.z = THREE.MathUtils.clamp(this.desiredTarget.z, -550, 550);

    const smoothing = 1 - Math.exp(-10 * deltaSeconds);
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
          48,
          720,
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
