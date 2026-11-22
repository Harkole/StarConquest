import * as THREE from 'three';

export function extractTurretPivots(raw: unknown): THREE.Object3D[] {
  if (raw instanceof THREE.Object3D) {
    return [raw];
  }
  if (Array.isArray(raw)) {
    const pivots: THREE.Object3D[] = [];
    for (const item of raw) {
      pivots.push(...extractTurretPivots(item));
    }
    return pivots;
  }
  if (raw !== null && typeof raw === 'object') {
    const pivots: THREE.Object3D[] = [];
    for (const value of Object.values(raw)) {
      pivots.push(...extractTurretPivots(value));
    }
    return pivots;
  }
  return [];
}

/**
 * Aims turret pivots whose barrels extend along local +X toward world delta (dx, dz).
 */
export function aimPlusXTurretPivots(
  pivots: readonly THREE.Object3D[],
  dx: number,
  dz: number,
): void {
  const yaw = Math.atan2(-dz, dx);
  for (const pivot of pivots) {
    pivot.rotation.y = yaw;
  }
}
