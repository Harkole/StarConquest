export const WORMHOLE_VERTEX_SHADER = /* glsl */ `
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const WORMHOLE_FRAGMENT_SHADER = /* glsl */ `
precision highp float;

varying vec2 vUv;

uniform float uTime;
uniform vec3 uOuterColor;
uniform vec3 uInnerColor;

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float noise2D(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float fbm2(vec2 p) {
  float v = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 4; i++) {
    v += amp * noise2D(p);
    p *= 2.1;
    amp *= 0.5;
  }
  return v;
}

void main() {
  vec2 centered = (vUv - 0.5) * 2.0;
  float r = length(centered);
  if (r > 1.0) {
    discard;
  }

  float angle = atan(centered.y, centered.x);
  // Gravitational spiral twist towards the event horizon
  float spiral = angle + (2.6 / max(r, 0.12)) - uTime * 2.1;
  vec2 polarUv = vec2(spiral * 1.4, r * 4.5 - uTime * 0.9);

  float swirl = fbm2(polarUv);
  float streaks = fbm2(vec2(spiral * 3.2, r * 8.0 - uTime * 1.6));

  // Dark singularity core surrounded by high-energy accretion ring
  float coreMask = smoothstep(0.14, 0.24, r);
  float horizonRing = exp(-pow((r - 0.24) * 9.5, 2.0)) * 2.4;
  float diskFade = smoothstep(1.0, 0.22, r) * coreMask;

  vec3 color = mix(uOuterColor, uInnerColor, smoothstep(0.75, 0.22, r));
  color *= (0.45 + 1.15 * swirl + 0.85 * streaks) * diskFade;
  color += uInnerColor * horizonRing;

  float alpha = clamp(diskFade * (0.55 + 0.45 * swirl) + horizonRing, 0.0, 1.0);
  // Keep inner event horizon opaque black
  float innerVoid = 1.0 - coreMask;
  vec3 finalRgb = mix(color, vec3(0.01, 0.01, 0.03), innerVoid);
  float finalAlpha = max(alpha, innerVoid * 0.95);

  gl_FragColor = vec4(finalRgb, finalAlpha);
}
`;
