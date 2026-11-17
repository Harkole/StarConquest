export const WORMHOLE_PROXIMITY_RADIUS = 240;

export const WORMHOLE_VERTEX_SHADER = /* glsl */ `
varying vec2 vUv;
varying float vFunnelDepth;

uniform float uTime;
uniform float uOpenProgress;

void main() {
  vUv = uv;
  vec2 centered = (uv - 0.5) * 2.0;
  float r = length(centered);

  // When opening (uOpenProgress > 0), pull the center downward into a 3D DS9-style gravity funnel
  float aperture = mix(0.08, 0.88, smoothstep(0.05, 1.0, uOpenProgress));
  float funnelWell = exp(-pow(r / max(0.12, aperture * 0.72), 2.0));
  float ripple = sin(r * 18.0 - uTime * 4.5) * 0.6 * uOpenProgress * (1.0 - smoothstep(0.0, aperture, r));

  vec3 displaced = position;
  // PlaneGeometry is rotated -PI/2 around X, so local -Z points downward in world Y
  float depthOffset = (funnelWell * 26.0 * smoothstep(0.1, 1.0, uOpenProgress)) + ripple;
  displaced.z -= depthOffset;
  vFunnelDepth = funnelWell * uOpenProgress;

  gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
}
`;

export const WORMHOLE_FRAGMENT_SHADER = /* glsl */ `
precision highp float;

varying vec2 vUv;
varying float vFunnelDepth;

uniform float uTime;
uniform float uOpenProgress;
uniform float uFlashBurst;
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

float fbm4(vec2 p) {
  float v = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 4; i++) {
    v += amp * noise2D(p);
    p = p * 2.08 + vec2(3.7, -5.1);
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

  // 1. Dormant Subspace Anomaly Pinpoint (always subtly visible when uOpenProgress == 0)
  float dormantPulse = 0.75 + 0.25 * sin(uTime * 3.2);
  float dormantCore = exp(-r * r * 140.0) * dormantPulse;
  float dormantRipple = exp(-pow((r - mod(uTime * 0.08, 0.22)) * 28.0, 2.0)) * smoothstep(0.22, 0.02, r) * 0.65;
  vec3 dormantColor = mix(uOuterColor, vec3(0.85, 0.95, 1.0), 0.6) * (dormantCore * 1.4 + dormantRipple);
  float dormantAlpha = clamp(dormantCore + dormantRipple, 0.0, 0.9);

  // 2. DS9-Style Opening Subspace Flash & Expanding Shockwave Ring
  // Cross-shaped gravimetric lens flare + expanding shockwave wave during transition
  float crossFlare =
    (exp(-abs(centered.x) * 28.0) * exp(-abs(centered.y) * 4.5) +
     exp(-abs(centered.y) * 28.0) * exp(-abs(centered.x) * 4.5)) *
    smoothstep(0.95, 0.0, r);
  float flashCore = exp(-r * r * 18.0);
  float shockRadius = mix(0.06, 0.92, 1.0 - uFlashBurst);
  float shockwaveRing = exp(-pow((r - shockRadius) * 16.0, 2.0)) * smoothstep(1.0, 0.15, shockRadius);
  vec3 flashColor =
    mix(uInnerColor, vec3(1.0, 0.97, 0.88), 0.7) *
    (crossFlare * 2.2 + flashCore * 2.5 + shockwaveRing * 2.0) *
    uFlashBurst;
  float flashAlpha = clamp((crossFlare + flashCore + shockwaveRing) * uFlashBurst, 0.0, 1.0);

  // 3. Unfurling DS9 Swirling Cloud Vortex & Luminous Tunnel Throat (scales with uOpenProgress)
  float aperture = mix(0.06, 0.86, smoothstep(0.02, 1.0, uOpenProgress));
  float normR = r / max(0.001, aperture);

  // Spiral inflow toward the wormhole throat
  float spiralAngle = angle + (2.4 / max(normR, 0.14)) - uTime * 1.85;
  vec2 cloudUv = vec2(spiralAngle * 1.5, normR * 3.8 - uTime * 1.05);
  float cloudBillow = fbm4(cloudUv);
  float lightningStreaks = fbm4(vec2(spiralAngle * 3.4, normR * 7.2 - uTime * 1.9));
  float electricArc = pow(max(0.0, 1.0 - abs(cloudBillow - lightningStreaks) * 3.2), 3.0);

  // Outer billowing cloud wall + bright inner event horizon rim + glowing subspace throat
  float outerLip = smoothstep(1.08, 0.68, normR) * smoothstep(0.10, 0.28, normR);
  float horizonRim = exp(-pow((normR - 0.30) * 5.8, 2.0)) * 1.8;
  float innerThroat = smoothstep(0.32, 0.0, normR);

  vec3 cloudPalette = mix(uOuterColor * 1.2, uInnerColor, smoothstep(0.95, 0.25, normR));
  vec3 vortexColor =
    cloudPalette * (0.4 + 1.25 * cloudBillow) * outerLip +
    mix(uInnerColor, vec3(1.0, 0.94, 0.82), 0.55) * (horizonRim + electricArc * outerLip * 1.35) +
    mix(uInnerColor, vec3(0.95, 0.98, 1.0), 0.75) * innerThroat * (1.35 + 0.35 * sin(uTime * 4.0)) * vFunnelDepth;

  float vortexVisibility = smoothstep(0.02, 0.25, uOpenProgress);
  vortexColor *= vortexVisibility;
  float vortexAlpha =
    clamp((outerLip * (0.65 + 0.35 * cloudBillow) + horizonRim + innerThroat * 0.92), 0.0, 1.0) *
    vortexVisibility;

  vec3 finalRgb = dormantColor * (1.0 - vortexVisibility * 0.7) + vortexColor + flashColor;
  float finalAlpha = clamp(max(dormantAlpha * (1.0 - vortexVisibility * 0.5), vortexAlpha) + flashAlpha, 0.0, 0.98);

  gl_FragColor = vec4(finalRgb, finalAlpha);
}
`;
