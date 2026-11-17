export const WORMHOLE_PROXIMITY_RADIUS = 240;

const WORMHOLE_NOISE_GLSL = /* glsl */ `
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
    p = p * 2.06 + vec2(3.7, -5.1);
    amp *= 0.5;
  }
  return v;
}

vec2 rotate2D(vec2 p, float a) {
  float c = cos(a);
  float s = sin(a);
  return vec2(c * p.x - s * p.y, s * p.x + c * p.y);
}
`;

export const WORMHOLE_VERTEX_SHADER = /* glsl */ `
varying vec2 vUv;
varying float vFunnelDepth;

uniform float uTime;
uniform float uOpenProgress;
uniform float uLayerDepthOffset;
uniform float uLayerScale;

${WORMHOLE_NOISE_GLSL}

void main() {
  vUv = uv;
  vec2 centered = (uv - 0.5) * 2.0;
  float r = length(centered);

  float openEase = smoothstep(0.02, 1.0, uOpenProgress);
  float aperture = mix(0.08, 0.92, openEase);
  float normR = r / max(0.08, aperture);

  // Seamless Cartesian spiral twist for 3D cloud billowing
  float twist = 2.4 * log(max(normR, 0.08)) - uTime * 0.65;
  vec2 twisted = rotate2D(centered, twist);
  float billow = fbm4(twisted * 2.8 + vec2(uTime * 0.12, -uTime * 0.09));

  // Geometry is pre-rotated into the XZ orbital plane (position.y == 0)
  // Scale radially in X and Z around the single central axis (0, y, 0)
  vec3 displaced = position;
  float radialScale = mix(0.22, uLayerScale, openEase);
  displaced.x *= radialScale;
  displaced.z *= radialScale;

  // Pull the center straight down along world -Y into a single concentric 3D tunnel throat
  float funnelWell = exp(-pow(normR * 1.85, 2.0));
  float funnelDrop = funnelWell * 28.0 * openEase;
  float cloudRelief = (billow - 0.5) * 5.5 * smoothstep(0.10, 0.80, normR) * openEase;
  float underCloudDrop = uLayerDepthOffset * smoothstep(0.15, 0.75, normR) * openEase;

  displaced.y -= (funnelDrop + underCloudDrop - cloudRelief);
  vFunnelDepth = funnelWell * openEase;

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
uniform float uLayerOpacity;
uniform vec3 uOuterColor;
uniform vec3 uInnerColor;

${WORMHOLE_NOISE_GLSL}

void main() {
  vec2 centered = (vUv - 0.5) * 2.0;
  float r = length(centered);
  if (r > 1.0) {
    discard;
  }

  float angle = atan(centered.y, centered.x);

  // 1. Dormant Subspace Anomaly Pinpoint (compact, subtle shimmer when uOpenProgress == 0)
  float dormantPulse = 0.78 + 0.22 * sin(uTime * 2.6);
  float dormantCore = exp(-r * r * 150.0) * dormantPulse;
  float dormantRipple = exp(-pow((r - mod(uTime * 0.06, 0.20)) * 30.0, 2.0)) * smoothstep(0.20, 0.02, r) * 0.35;
  vec3 dormantColor = vec3(0.28, 0.44, 0.62) * (dormantCore + dormantRipple);
  float dormantAlpha = clamp((dormantCore + dormantRipple) * 0.75, 0.0, 0.75);

  // 2. Restrained DS9 Opening Wave (soft gravimetric shimmer without any blinding flashbang)
  float shockRadius = mix(0.08, 0.88, 1.0 - uFlashBurst);
  float shockwaveRing = exp(-pow((r - shockRadius) * 14.0, 2.0)) * smoothstep(1.0, 0.15, shockRadius);
  vec3 flashColor = vec3(0.38, 0.54, 0.72) * shockwaveRing * uFlashBurst * 0.35;
  float flashAlpha = shockwaveRing * uFlashBurst * 0.38;

  // 3. Seamless DS9 Swirling Cloud Vortex & Warm Amber-Gold Inner Tunnel Entrance
  float openEase = smoothstep(0.02, 1.0, uOpenProgress);
  float aperture = mix(0.08, 0.92, openEase);
  float normR = r / max(0.001, aperture);
  if (normR > 1.02 && uOpenProgress > 0.1) {
    discard;
  }

  // Seamless Cartesian rotation for spiral FBM clouds (zero atan seam line!)
  float twistPrimary = 2.6 * log(max(normR, 0.055)) - uTime * 0.75;
  float twistDetail = 3.4 * log(max(normR, 0.055)) - uTime * 1.15;
  vec2 twistedUv1 = rotate2D(centered / max(0.18, normR * 0.85), twistPrimary);
  vec2 twistedUv2 = rotate2D(centered / max(0.18, normR * 0.85), twistDetail);

  float cloudPrimary = fbm4(twistedUv1 * 2.2 + vec2(1.7, -2.3));
  float cloudDetail = fbm4(twistedUv2 * 3.8 + vec2(-4.1, 3.2));

  // Integer-harmonic spiral arms (2.0 * angle is 100% continuous across +-PI)
  float spiralPhase = angle * 2.0 + 5.2 * log(max(normR, 0.055)) - uTime * 1.4;
  float spiralArms = 0.5 + 0.5 * sin(spiralPhase + (cloudPrimary - 0.5) * 3.5);

  float cloudDensity =
    smoothstep(0.16, 0.84, cloudPrimary * 0.62 + cloudDetail * 0.38) *
    (0.42 + 0.58 * spiralArms);
  float darkDustLane = smoothstep(0.48, 0.14, cloudPrimary * spiralArms);

  // Reference Palette:
  // - Outer vortex: dark smoky slate-blue & deep indigo clouds (strictly below HDR bloom threshold)
  // - Mid throat wall: dusty rose-violet & warm amber clouds spiraling inward
  // - Central tunnel entrance: warm golden-amber core at the center of the funnel
  vec3 darkVoidLane = vec3(0.015, 0.025, 0.05);
  vec3 outerSlateBlue = vec3(0.11, 0.20, 0.33);
  vec3 midFrostBlue = vec3(0.27, 0.39, 0.53);
  vec3 innerVioletRose = vec3(0.38, 0.20, 0.34);
  vec3 innerWarmAmber = vec3(0.56, 0.32, 0.14);
  vec3 throatGoldenCore = vec3(0.78, 0.54, 0.22);

  vec3 outerCloudColor = mix(outerSlateBlue, midFrostBlue, smoothstep(0.22, 0.85, cloudDensity));
  outerCloudColor = mix(outerCloudColor, darkVoidLane, darkDustLane * 0.72);

  float throatTransition = smoothstep(0.50, 0.16, normR);
  vec3 throatWallColor = mix(innerVioletRose, innerWarmAmber, smoothstep(0.42, 0.14, normR));
  vec3 cloudColor = mix(outerCloudColor, throatWallColor * (0.48 + 0.72 * cloudDensity), throatTransition);

  // Single centered warm golden tunnel throat (r < 0.18)
  float coreGlowMask = exp(-pow(normR * 5.6, 2.0));
  vec3 coreLight = throatGoldenCore * coreGlowMask * (0.75 + 0.20 * cloudDetail);

  // Soft outer fade into space
  float radialEnvelope = smoothstep(1.0, 0.38, normR);
  float vortexVisibility = smoothstep(0.02, 0.22, uOpenProgress);

  vec3 vortexRgb = (cloudColor * radialEnvelope + coreLight) * vortexVisibility;
  vortexRgb = min(vortexRgb, vec3(0.55 + coreGlowMask * 0.22));

  float cloudOpacity = clamp(
    (radialEnvelope * (0.46 + 0.50 * cloudDensity) + coreGlowMask * 0.96) *
      vortexVisibility *
      uLayerOpacity,
    0.0,
    0.95
  );

  vec3 finalRgb = mix(dormantColor, vortexRgb, vortexVisibility) + flashColor;
  float finalAlpha = clamp(mix(dormantAlpha, cloudOpacity, vortexVisibility) + flashAlpha, 0.0, 0.95);

  gl_FragColor = vec4(finalRgb, finalAlpha);
}
`;
