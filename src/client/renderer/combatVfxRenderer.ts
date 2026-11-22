import * as THREE from 'three';
import type { WeaponVisualKind } from '../../shared/sim/combat.ts';
import type { CombatVisualEvent } from '../../shared/sim/gameSimulation.ts';

interface ActiveVfxItem {
  readonly object: THREE.Object3D;
  readonly material: THREE.Material;
  readonly kind: 'beam' | 'shield_patch' | 'explosion';
  readonly baseScale: number;
  readonly durationSeconds: number;
  readonly targetId?: string;
  readonly impactDirX?: number;
  readonly impactDirZ?: number;
  ageSeconds: number;
}

const WEAPON_BEAM_STYLE: Readonly<
  Record<
    WeaponVisualKind,
    { readonly color: THREE.Color; readonly radius: number; readonly duration: number }
  >
> = {
  fighter: { color: new THREE.Color(0.35, 1.35, 1.9), radius: 0.14, duration: 0.16 },
  pd: { color: new THREE.Color(1.65, 1.15, 0.45), radius: 0.12, duration: 0.14 },
  medium: { color: new THREE.Color(1.7, 0.78, 0.25), radius: 0.22, duration: 0.22 },
  heavy: { color: new THREE.Color(1.9, 0.62, 0.18), radius: 0.34, duration: 0.3 },
  siege: { color: new THREE.Color(2.1, 0.42, 0.2), radius: 0.52, duration: 0.42 },
};

const SHIELD_PATCH_HOLD_SECONDS = 0.38;
const SHIELD_PATCH_DURATION_SECONDS = 1.15;

/**
 * Renders selective-HDR-bloom combat VFX in the active star system from authoritative
 * `CombatVisualEvent` packets:
 * - Weapon tracers & heavy siege salvos (`weapon_fire`)
 * - Localized solid-fill curved Shield deflection patches right where each shot was blocked
 *   (`shield_impact`), holding steady and fading smoothly so rapid hits never pulse
 * - Hull detonation flashes & shockwave rings (`hull_explosion`)
 */
export class CombatVfxRenderer {
  public readonly rootGroup = new THREE.Group();

  private readonly unitBeamGeom = new THREE.CylinderGeometry(1, 1, 1, 6).rotateX(
    Math.PI / 2,
  );
  // Localized spherical cap facing +Z (pole rotated from +Y to +Z) so lookAt(attacker) aims the patch directly at the hit
  private readonly unitShieldPatchGeom = new THREE.SphereGeometry(
    1,
    22,
    12,
    0,
    Math.PI * 2,
    0,
    Math.PI * 0.3,
  ).rotateX(Math.PI / 2);
  private readonly unitExplosionCoreGeom = new THREE.SphereGeometry(1, 12, 10);
  private readonly unitShockwaveRingGeom = new THREE.RingGeometry(0.72, 1.0, 28).rotateX(
    -Math.PI / 2,
  );

  private readonly activeItems: ActiveVfxItem[] = [];

  constructor() {
    this.rootGroup.name = 'combat_vfx_group';
    // Shift unit beam so origin sits at z = 0 and extends to z = +1 for simple lookAt + Z-scale
    this.unitBeamGeom.translate(0, 0, 0.5);
  }

  public getActiveEffectCount(): number {
    return this.activeItems.length;
  }

  public ingestEvents(
    events: readonly CombatVisualEvent[],
    activeSystemId: string,
  ): void {
    for (const ev of events) {
      if (ev.systemId !== activeSystemId) {
        continue;
      }
      if (ev.type === 'weapon_fire') {
        this.spawnWeaponBeam(ev);
      } else if (ev.type === 'shield_impact') {
        this.spawnOrRefreshShieldPatch(ev);
      } else if (ev.type === 'hull_explosion') {
        this.spawnHullExplosion(ev);
      }
    }
  }

  public update(deltaSeconds: number): void {
    for (let i = this.activeItems.length - 1; i >= 0; i--) {
      const item = this.activeItems[i]!;
      item.ageSeconds += deltaSeconds;
      const t = Math.min(1, item.ageSeconds / Math.max(0.01, item.durationSeconds));

      if (item.ageSeconds >= item.durationSeconds) {
        this.rootGroup.remove(item.object);
        item.material.dispose();
        this.activeItems.splice(i, 1);
        continue;
      }

      if (item.kind === 'beam') {
        const mat = item.material as THREE.MeshBasicMaterial;
        mat.opacity = (1 - t) * 0.92;
      } else if (item.kind === 'shield_patch') {
        const mat = item.material as THREE.MeshBasicMaterial;
        // Hold steady solid opacity during initial block window, then fade smoothly without pulsing
        if (item.ageSeconds <= SHIELD_PATCH_HOLD_SECONDS) {
          mat.opacity = 0.68;
        } else {
          const fadeT =
            (item.ageSeconds - SHIELD_PATCH_HOLD_SECONDS) /
            Math.max(0.01, item.durationSeconds - SHIELD_PATCH_HOLD_SECONDS);
          mat.opacity = Math.max(0, (1 - fadeT) * 0.68);
        }
      } else if (item.kind === 'explosion') {
        const mat = item.material as THREE.MeshBasicMaterial;
        mat.opacity = (1 - t) * 0.9;
        const scale = item.baseScale * (0.4 + t * 1.9);
        item.object.scale.setScalar(scale);
      }
    }
  }

  public clear(): void {
    for (const item of this.activeItems) {
      this.rootGroup.remove(item.object);
      item.material.dispose();
    }
    this.activeItems.length = 0;
  }

  public dispose(): void {
    this.clear();
    this.unitBeamGeom.dispose();
    this.unitShieldPatchGeom.dispose();
    this.unitExplosionCoreGeom.dispose();
    this.unitShockwaveRingGeom.dispose();
  }

  private spawnWeaponBeam(ev: CombatVisualEvent): void {
    const kind: WeaponVisualKind = ev.weaponKind ?? 'medium';
    const style = WEAPON_BEAM_STYLE[kind];
    const start = new THREE.Vector3(ev.fromPos.x, 1.8, ev.fromPos.z);
    const end = new THREE.Vector3(ev.toPos.x, 1.8, ev.toPos.z);
    const length = Math.max(1.0, start.distanceTo(end));

    const mat = new THREE.MeshBasicMaterial({
      color: style.color,
      transparent: true,
      opacity: 0.92,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(this.unitBeamGeom, mat);
    mesh.position.copy(start);
    mesh.lookAt(end);
    mesh.scale.set(style.radius, style.radius, length);
    this.rootGroup.add(mesh);

    this.activeItems.push({
      object: mesh,
      material: mat,
      kind: 'beam',
      baseScale: style.radius,
      durationSeconds: style.duration,
      ageSeconds: 0,
    });
  }

  private spawnOrRefreshShieldPatch(ev: CombatVisualEvent): void {
    const dx = ev.fromPos.x - ev.toPos.x;
    const dz = ev.fromPos.z - ev.toPos.z;
    const len = Math.hypot(dx, dz);
    const dirX = len > 1e-4 ? dx / len : 1;
    const dirZ = len > 1e-4 ? dz / len : 0;
    const radius = Math.max(3.5, ev.targetRadius ?? 6.0) * 1.12;

    // Refresh existing solid shield patch on the same target & impact side so rapid hits stay steady without pulsing
    if (ev.targetId) {
      const existing = this.activeItems.find(
        (item) =>
          item.kind === 'shield_patch' &&
          item.targetId === ev.targetId &&
          (item.impactDirX ?? 0) * dirX + (item.impactDirZ ?? 0) * dirZ >= 0.78,
      );
      if (existing) {
        existing.ageSeconds = Math.min(existing.ageSeconds, 0.1);
        existing.object.position.set(ev.toPos.x, 1.6, ev.toPos.z);
        existing.object.lookAt(
          ev.toPos.x + dirX * 20,
          1.6,
          ev.toPos.z + dirZ * 20,
        );
        return;
      }
    }

    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(0.22, 0.78, 1.25),
      transparent: true,
      opacity: 0.68,
      wireframe: false,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(this.unitShieldPatchGeom, mat);
    mesh.position.set(ev.toPos.x, 1.6, ev.toPos.z);
    mesh.lookAt(ev.toPos.x + dirX * 20, 1.6, ev.toPos.z + dirZ * 20);
    mesh.scale.setScalar(radius);
    this.rootGroup.add(mesh);

    this.activeItems.push({
      object: mesh,
      material: mat,
      kind: 'shield_patch',
      baseScale: radius,
      durationSeconds: SHIELD_PATCH_DURATION_SECONDS,
      targetId: ev.targetId,
      impactDirX: dirX,
      impactDirZ: dirZ,
      ageSeconds: 0,
    });
  }

  private spawnHullExplosion(ev: CombatVisualEvent): void {
    const radius = Math.max(3.0, ev.targetRadius ?? 5.0);

    const coreMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(1.9, 0.95, 0.3),
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const core = new THREE.Mesh(this.unitExplosionCoreGeom, coreMat);
    core.position.set(ev.toPos.x, 1.6, ev.toPos.z);
    core.scale.setScalar(radius * 0.45);
    this.rootGroup.add(core);

    this.activeItems.push({
      object: core,
      material: coreMat,
      kind: 'explosion',
      baseScale: radius * 0.8,
      durationSeconds: 0.55,
      ageSeconds: 0,
    });

    const ringMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(1.75, 0.58, 0.2),
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const ring = new THREE.Mesh(this.unitShockwaveRingGeom, ringMat);
    ring.position.set(ev.toPos.x, 1.6, ev.toPos.z);
    ring.scale.setScalar(radius * 0.6);
    this.rootGroup.add(ring);

    this.activeItems.push({
      object: ring,
      material: ringMat,
      kind: 'explosion',
      baseScale: radius * 1.5,
      durationSeconds: 0.68,
      ageSeconds: 0,
    });
  }
}
