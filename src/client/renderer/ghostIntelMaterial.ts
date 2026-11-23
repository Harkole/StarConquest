import * as THREE from 'three';

const GHOST_TINT = new THREE.Color(0x64748b);
const GHOST_EMISSIVE_TINT = new THREE.Color(0x38bdf8);

function cloneAsGhostMaterial(mat: THREE.Material): THREE.Material {
  const cloned = mat.clone();
  cloned.transparent = true;
  cloned.opacity = Math.min(cloned.opacity, 0.38);
  cloned.depthWrite = false;

  if ('color' in cloned && cloned.color instanceof THREE.Color) {
    cloned.color.lerp(GHOST_TINT, 0.55).multiplyScalar(0.7);
  }
  if ('emissive' in cloned && cloned.emissive instanceof THREE.Color) {
    cloned.emissive.lerp(GHOST_EMISSIVE_TINT, 0.35).multiplyScalar(0.35);
  }
  if (
    'emissiveIntensity' in cloned &&
    typeof cloned.emissiveIntensity === 'number'
  ) {
    cloned.emissiveIntensity = Math.min(cloned.emissiveIntensity, 0.35);
  }

  cloned.needsUpdate = true;
  return cloned;
}

/**
 * Applies a dimmed, semi-transparent ghosted material treatment to a last-known-intel
 * orbital or deep-space structure mesh hierarchy without mutating shared live materials.
 */
export function applyGhostIntelMaterial(root: THREE.Object3D): void {
  root.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      if (obj.name.includes('shield_bubble')) {
        obj.visible = false;
        return;
      }
      if (Array.isArray(obj.material)) {
        obj.material = obj.material.map(cloneAsGhostMaterial);
      } else if (obj.material) {
        obj.material = cloneAsGhostMaterial(obj.material);
      }
    }
  });
}
