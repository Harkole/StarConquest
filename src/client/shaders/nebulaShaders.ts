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
    deepSpaceBg: [0.015, 0.025, 0.06],
    primaryNebula: [0.04, 0.52, 0.78],
    secondaryNebula: [0.68, 0.12, 0.55],
    accentGlow: [0.25, 0.88, 1.0],
    starlightColor: [0.88, 0.95, 1.0],
  },
  golden_expanse: {
    id: 'golden_expanse',
    displayName: 'Golden Dust Expanse',
    deepSpaceBg: [0.035, 0.022, 0.012],
    primaryNebula: [0.82, 0.48, 0.12],
    secondaryNebula: [0.45, 0.18, 0.08],
    accentGlow: [1.0, 0.78, 0.32],
    starlightColor: [1.0, 0.94, 0.82],
  },
  crimson_rift: {
    id: 'crimson_rift',
    displayName: 'Deep Crimson Rift',
    deepSpaceBg: [0.04, 0.01, 0.02],
    primaryNebula: [0.75, 0.08, 0.18],
    secondaryNebula: [0.32, 0.05, 0.38],
    accentGlow: [1.0, 0.32, 0.22],
    starlightColor: [1.0, 0.88, 0.86],
  },
  emerald_veil: {
    id: 'emerald_veil',
    displayName: 'Emerald Ion Veil',
    deepSpaceBg: [0.01, 0.035, 0.03],
    primaryNebula: [0.08, 0.65, 0.45],
    secondaryNebula: [0.06, 0.28, 0.55],
    accentGlow: [0.35, 0.98, 0.68],
    starlightColor: [0.88, 1.0, 0.94],
  },
  violet_core: {
    id: 'violet_core',
    displayName: 'Central Nexus Violet Core',
    deepSpaceBg: [0.025, 0.015, 0.055],
    primaryNebula: [0.48, 0.16, 0.85],
    secondaryNebula: [0.12, 0.58, 0.92],
    accentGlow: [0.85, 0.45, 1.0],
    starlightColor: [0.94, 0.9, 1.0],
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
  float galacticBand = exp(-abs(dir.y) * 2.2);

  // Domain-warped FBM for swirling volumetric nebula curtains
  vec3 warp = vec3(
    fbm(dir * 2.2 + vec3(uTime * 0.004, 0.0, 0.0)),
    fbm(dir * 2.2 + vec3(0.0, uTime * 0.003, 4.2)),
    fbm(dir * 2.2 + vec3(2.1, -1.7, -uTime * 0.004))
  );

  float cloud1 = fbm(dir * 3.0 + warp * 1.4);
  float cloud2 = fbm(dir * 5.2 - warp * 1.1 + vec3(8.3));
  float darkDust = smoothstep(0.42, 0.72, fbm(dir * 4.5 + warp * 0.8));

  float primaryMask = smoothstep(0.32, 0.78, cloud1) * (0.35 + 0.65 * galacticBand);
  float secondaryMask = smoothstep(0.38, 0.82, cloud2) * (0.25 + 0.75 * galacticBand);
  float filamentMask = pow(max(0.0, 1.0 - abs(cloud1 - cloud2) * 3.5), 3.0) * galacticBand;

  vec3 color = uDeepSpaceBg;
  color = mix(color, uPrimaryNebula, primaryMask * 0.65);
  color = mix(color, uSecondaryNebula, secondaryMask * 0.55);
  color += uAccentGlow * filamentMask * 0.42;

  // Carve dark interstellar dust lanes
  color *= mix(1.0, 0.35, darkDust * 0.65);

  // Embedded high-frequency background stars
  float starCell = hash31(floor(dir * 380.0));
  float starSparkle = smoothstep(0.9965, 1.0, starCell);
  float twinkle = 0.7 + 0.3 * sin(uTime * 2.5 + starCell * 90.0);
  color += vec3(starSparkle * twinkle * 1.1);

  gl_FragColor = vec4(color, 1.0);
}
`;
