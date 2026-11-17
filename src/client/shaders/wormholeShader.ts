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
`;

export const WORMHOLE_VERTEX_SHADER = /* glsl */ `
varying vec2 vUv;
varying float vFunnelDepth;
varying float vCloudHeight;

uniform float uTime;
uniform float uOpenProgress;
uniform float uLayerDepthOffset;
uniform float uLayerScale;

${WORMHOLE_NOISE_GLSL}

void main() {
  vUv = uv;
  vec2 centered = (uv - 0.5) * 2.0;
  float r = length(centered);
  float angle = atan(centered.y, centered.x);

  float openEase = smoothstep(0.02, 1.0, uOpenProgress);
  float aperture = mix(0.08, 0.92, openEase);
  float normR = r / max(0.08, aperture);

  // Deep 3D DS9-style curved spacetime funnel plunging below the orbital plane
  float funnelWell = exp(-pow(normR * 1.45, 2.0));
  float spiralAngle = angle + (2.3 / max(normR, 0.14)) - uTime * 0.95;
  float billow = fbm4(vec2(spiralAngle * 1.6, normR * 3.5 - uTime * 0.55));
  vCloudHeight = billow;

  vec3 displaced = position * mix(0.22, uLayerScale, openEase);

  // Curve the tunnel throat slightly sideways at depth so it looks like a 3D bent wormhole conduit
  float throatCurve = pow(funnelWell, 1.7) * openEase;
  displaced.x += throatCurve * 14.0 + uLayerDepthOffset * 0.22 * openEase;
  displaced.y -= throatCurve * 8.0;

  // PlaneGeometry is rotated -PI/2 around X, so local -Z points downward in world Y (-Y)
  float funnelDrop = funnelWell * 54.0 * openEase;
  float cloudRelief = (billow - 0.5) * 9.0 * smoothstep(0.12, 0.85, normR) * openEase;
  float layerDrop = uLayerDepthOffset * openEase;

  displaced.z -= (funnelDrop + layerDrop - cloudRelief);
  vFunnelDepth = clamp(funnelWell + (uLayerDepthOffset / 45.0), 0.0, 1.0) * openEase;

  gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
}
`;

export const WORMHOLE_FRAGMENT_SHADER = /* glsl */ `
precision highp float;

varying vec2 vUv;
varying float vFunnelDepth;
varying float vCloudHeight;

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
  vec3 flashColor = vec3(0.38, 0.54, 0.72) * shockwaveRing * uFlashBurst * 0.38;
  float flashAlpha = shockwaveRing * uFlashBurst * 0.42;

  // 3. Dark, Smoky DS9 Swirling Cloud Vortex & Warm Amber-Gold Inner Throat
  float openEase = smoothstep(0.02, 1.0, uOpenProgress);
  float aperture = mix(0.08, 0.92, openEase);
  float normR = r / max(0.001, aperture);
  if (normR > 1.05 && uOpenProgress > 0.1) {
    discard;
  }

  // Multi-arm logarithmic spiral inflow matching the DS9 reference image
  float spiralAngle = angle + 2.8 * log(max(normR, 0.06)) - uTime * 0.85;
  vec2 spiralUv = vec2(spiralAngle * 1.4, normR * 3.4 - uTime * 0.45);
  float cloudPrimary = fbm4(spiralUv);
  float cloudDetail = fbm4(vec2(spiralAngle * 2.8 + 1.7, normR * 6.5 - uTime * 0.75));
  float spiralArms = 0.5 + 0.5 * sin(spiralAngle * 2.0 + cloudPrimary * 3.2);

  float cloudDensity = smoothstep(0.18, 0.82, cloudPrimary * 0.65 + cloudDetail * 0.35) * (0.45 + 0.55 * spiralArms);
  float darkDustLane = smoothstep(0.48, 0.15, cloudPrimary * spiralArms);

  // Reference Palette:
  // - Outer vortex: dark smoky slate-blue & deep indigo clouds (strictly below HDR bloom threshold!)
  // - Mid throat wall: dusty rose-violet & warm umber/ochre clouds
  // - Deep funnel core: warm golden-amber glow at the bottom of the tunnel throat
  vec3 darkVoidLane = vec3(0.015, 0.025, 0.05);
  vec3 outerSlateBlue = vec3(0.12, 0.21, 0.34);
  vec3 midFrostBlue = vec3(0.28, 0.40, 0.54);
  vec3 innerVioletRose = vec3(0.38, 0.20, 0.34);
  vec3 innerWarmAmber = vec3(0.56, 0.32, 0.14);
  vec3 throatGoldenCore = vec3(0.78, 0.54, 0.22);

  vec3 outerCloudColor = mix(outerSlateBlue, midFrostBlue, smoothstep(0.25, 0.85, cloudDensity));
  outerCloudColor = mix(outerCloudColor, darkVoidLane, darkDustLane * 0.72);

  float throatTransition = smoothstep(0.52, 0.18, normR);
  vec3 throatWallColor = mix(innerVioletRose, innerWarmAmber, smoothstep(0.45, 0.16, normR));
  vec3 cloudColor = mix(outerCloudColor, throatWallColor * (0.45 + 0.75 * cloudDensity), throatTransition);

  // Warm golden heart deep inside the funnel throat (r < 0.18)
  float coreGlowMask = exp(-pow(normR * 5.8, 2.0));
  vec3 coreLight = throatGoldenCore * coreGlowMask * (0.75 + 0.20 * cloudDetail);

  // Soft radial fade at outer edge of the cloud vortex
  float radialEnvelope = smoothstep(1.02, 0.42, normR);
  float vortexVisibility = smoothstep(0.02, 0.22, uOpenProgress);

  vec3 vortexRgb = (cloudColor * radialEnvelope + coreLight) * vortexVisibility;
  // Cap outer cloud luminance below the 0.62 HDR bloom threshold so only the very center throat has a soft warm glow
  vortexRgb = min(vortexRgb, vec3(0.55 + coreGlowMask * 0.22));

  float cloudOpacity = clamp(
    (radialEnvelope * (0.45 + 0.50 * cloudDensity) + coreGlowMask * 0.95) * vortexVisibility * uLayerOpacity,
    0.0,
    0.94
  );

  vec3 finalRgb = mix(dormantColor, vortexRgb, vortexVisibility) + flashColor;
  float finalAlpha = clamp(mix(dormantAlpha, cloudOpacity, vortexVisibility) + flashAlpha, 0.0, 0.95);

  gl_FragColor = vec4(finalRgb, finalAlpha);
}
`;
