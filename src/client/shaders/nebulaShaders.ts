import type { StarSystemNode } from '../../shared/sim/galaxy.ts';

export type NebulaPaletteId = StarSystemNode['nebulaPalette'];

export interface NebulaPaletteColors {
  readonly id: NebulaPaletteId;
  readonly displayName: string;
  readonly deepSpaceBg: readonly [number, number, number];
  readonly primaryNebula: readonly [number, number, number];
  readonly secondaryNebula: readonly [number, number, number];
  readonly accentGlow: readonly [number, number, number];
  readonly starlightColor: readonly [number, number, number];
}

export const NEBULA_PALETTES: Readonly<Record<NebulaPaletteId, NebulaPaletteColors>> = {
  cyan_magenta: {
    id: 'cyan_magenta',
    displayName: 'Cyan-Magenta Emission Nebula',
    deepSpaceBg: [0.002, 0.003, 0.007],
    primaryNebula: [0.04, 0.45, 0.68],
    secondaryNebula: [0.58, 0.1, 0.46],
    accentGlow: [0.22, 0.75, 0.92],
    starlightColor: [0.92, 0.96, 1.0],
  },
  golden_expanse: {
    id: 'golden_expanse',
    displayName: 'Golden Dust Expanse',
    deepSpaceBg: [0.004, 0.003, 0.002],
    primaryNebula: [0.76, 0.42, 0.1],
    secondaryNebula: [0.42, 0.16, 0.06],
    accentGlow: [0.95, 0.72, 0.28],
    starlightColor: [1.0, 0.95, 0.86],
  },
  crimson_rift: {
    id: 'crimson_rift',
    displayName: 'Deep Crimson Rift',
    deepSpaceBg: [0.005, 0.002, 0.003],
    primaryNebula: [0.68, 0.07, 0.16],
    secondaryNebula: [0.28, 0.04, 0.32],
    accentGlow: [0.92, 0.28, 0.18],
    starlightColor: [1.0, 0.9, 0.88],
  },
  emerald_veil: {
    id: 'emerald_veil',
    displayName: 'Emerald Ion Veil',
    deepSpaceBg: [0.002, 0.005, 0.004],
    primaryNebula: [0.06, 0.56, 0.38],
    secondaryNebula: [0.05, 0.24, 0.46],
    accentGlow: [0.3, 0.86, 0.6],
    starlightColor: [0.9, 1.0, 0.95],
  },
  violet_core: {
    id: 'violet_core',
    displayName: 'Central Nexus Violet Core',
    deepSpaceBg: [0.003, 0.002, 0.007],
    primaryNebula: [0.42, 0.14, 0.74],
    secondaryNebula: [0.1, 0.46, 0.78],
    accentGlow: [0.76, 0.38, 0.92],
    starlightColor: [0.95, 0.92, 1.0],
  },
} as const;

export const NEBULA_SKYBOX_VERTEX_SHADER = /* glsl */ `
varying vec3 vWorldDirection;

void main() {
  vWorldDirection = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const NEBULA_SKYBOX_FRAGMENT_SHADER = /* glsl */ `
precision highp float;

varying vec3 vWorldDirection;

uniform float uTime;
uniform vec3 uDeepSpaceBg;
uniform vec3 uPrimaryNebula;
uniform vec3 uSecondaryNebula;
uniform vec3 uAccentGlow;

// 3D value noise & Fractional Brownian Motion (FBM)
float hash31(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y) * p.z);
}

float noise3D(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);

  return mix(
    mix(
      mix(hash31(i + vec3(0.0, 0.0, 0.0)), hash31(i + vec3(1.0, 0.0, 0.0)), f.x),
      mix(hash31(i + vec3(0.0, 1.0, 0.0)), hash31(i + vec3(1.0, 1.0, 0.0)), f.x),
      f.y
    ),
    mix(
      mix(hash31(i + vec3(0.0, 0.0, 1.0)), hash31(i + vec3(1.0, 0.0, 1.0)), f.x),
      mix(hash31(i + vec3(0.0, 1.0, 1.0)), hash31(i + vec3(1.0, 1.0, 1.0)), f.x),
      f.y
    ),
    f.z
  );
}

float fbm(vec3 p) {
  float value = 0.0;
  float amplitude = 0.5;
  for (int i = 0; i < 5; i++) {
    value += amplitude * noise3D(p);
    p = p * 2.03 + vec3(13.7, -7.3, 5.1);
    amplitude *= 0.5;
  }
  return value;
}

void main() {
  vec3 dir = normalize(vWorldDirection);

  // Keep the vast majority of the sky pitch-black deep space, with localized nebula pockets
  float galacticPlane = exp(-abs(dir.y) * 2.8);
  float regionEnvelope = smoothstep(0.48, 0.78, fbm(dir * 1.4 + vec3(3.1, -1.8, 5.4))) * (0.2 + 0.8 * galacticPlane);

  vec3 warp = vec3(
    fbm(dir * 2.4 + vec3(uTime * 0.002, 0.0, 0.0)),
    fbm(dir * 2.4 + vec3(0.0, uTime * 0.002, 4.2)),
    fbm(dir * 2.4 + vec3(2.1, -1.7, -uTime * 0.002))
  );

  float cloud1 = fbm(dir * 3.2 + warp * 1.25);
  float cloud2 = fbm(dir * 5.4 - warp * 1.0 + vec3(8.3));
  float darkDust = smoothstep(0.42, 0.70, fbm(dir * 4.8 + warp * 0.7));

  float primaryMask = smoothstep(0.50, 0.84, cloud1) * regionEnvelope;
  float secondaryMask = smoothstep(0.54, 0.86, cloud2) * regionEnvelope;
  float coreRim = pow(max(0.0, primaryMask * secondaryMask), 1.5) * 1.3;

  vec3 color = uDeepSpaceBg;
  color = mix(color, uPrimaryNebula, primaryMask * 0.52);
  color = mix(color, uSecondaryNebula, secondaryMask * 0.45);
  color += uAccentGlow * coreRim * 0.35;

  // Dark interstellar dust lanes carving into the nebula clouds
  color *= mix(1.0, 0.18, darkDust * regionEnvelope);

  // Layer 1: Dense field of crisp, steady pinpoint deep-space stars (kept below bloom threshold)
  float fineCell = hash31(floor(dir * 520.0));
  float fineStar = smoothstep(0.9935, 1.0, fineCell) * 0.42;

  // Layer 2: Steady brighter stars with subtle warm/cool stellar tints (no pulsing, below bloom threshold)
  float brightCell = hash31(floor(dir * 260.0 + vec3(19.3)));
  float brightStar = smoothstep(0.9968, 1.0, brightCell) * 0.56;
  vec3 starTint = mix(vec3(1.0, 0.92, 0.82), vec3(0.84, 0.93, 1.0), fract(brightCell * 43.7));

  color += vec3(fineStar) + starTint * brightStar;

  gl_FragColor = vec4(color, 1.0);
}
`;
