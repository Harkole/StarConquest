import type { PlanetVisualTheme } from '../../shared/config/index.ts';

export interface PlanetShaderThemeParams {
  readonly theme: PlanetVisualTheme;
  readonly hasAtmosphere: boolean;
  readonly hasDriftingClouds: boolean;
  readonly cloudDriftSpeed: number;
  readonly cloudCoverage: number;
  readonly atmosphereColor: readonly [number, number, number];
  readonly atmosphereIntensity: number;
  readonly lavaEmissionStrength: number;
  readonly oceanLevel: number;
}

export const PLANET_SHADER_THEME_PARAMS: Readonly<Record<PlanetVisualTheme, PlanetShaderThemeParams>> = {
  terran: {
    theme: 'terran',
    hasAtmosphere: true,
    hasDriftingClouds: true,
    cloudDriftSpeed: 0.038,
    cloudCoverage: 0.48,
    atmosphereColor: [0.22, 0.62, 1.0],
    atmosphereIntensity: 1.35,
    lavaEmissionStrength: 0.0,
    oceanLevel: 0.47,
  },
  super_earth: {
    theme: 'super_earth',
    hasAtmosphere: true,
    hasDriftingClouds: true,
    cloudDriftSpeed: 0.045,
    cloudCoverage: 0.54,
    atmosphereColor: [0.18, 0.78, 1.0],
    atmosphereIntensity: 1.65,
    lavaEmissionStrength: 0.0,
    oceanLevel: 0.5,
  },
  volcanic_lava: {
    theme: 'volcanic_lava',
    hasAtmosphere: true,
    hasDriftingClouds: false,
    cloudDriftSpeed: 0.0,
    cloudCoverage: 0.0,
    atmosphereColor: [1.0, 0.34, 0.08],
    atmosphereIntensity: 1.25,
    lavaEmissionStrength: 2.4,
    oceanLevel: 0.0,
  },
  barren_rock: {
    theme: 'barren_rock',
    hasAtmosphere: false,
    hasDriftingClouds: false,
    cloudDriftSpeed: 0.0,
    cloudCoverage: 0.0,
    atmosphereColor: [0.0, 0.0, 0.0],
    atmosphereIntensity: 0.0,
    lavaEmissionStrength: 0.0,
    oceanLevel: 0.0,
  },
} as const;

const NOISE_GLSL_CHUNK = /* glsl */ `
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

float fbm5(vec3 p) {
  float value = 0.0;
  float amplitude = 0.5;
  for (int i = 0; i < 5; i++) {
    value += amplitude * noise3D(p);
    p = p * 2.04 + vec3(7.1, -11.3, 4.7);
    amplitude *= 0.5;
  }
  return value;
}

vec3 rotateY(vec3 v, float angle) {
  float c = cos(angle);
  float s = sin(angle);
  return vec3(c * v.x + s * v.z, v.y, -s * v.x + c * v.z);
}
`;

export const PLANET_COMMON_VERTEX_SHADER = /* glsl */ `
varying vec3 vObjectNormal;
varying vec3 vWorldNormal;
varying vec3 vWorldPosition;

void main() {
  vObjectNormal = normalize(normal);
  vWorldNormal = normalize(mat3(modelMatrix) * normal);
  vec4 worldPos = modelMatrix * vec4(position, 1.0);
  vWorldPosition = worldPos.xyz;
  gl_Position = projectionMatrix * viewMatrix * worldPos;
}
`;

export const TERRAN_SURFACE_FRAGMENT_SHADER = /* glsl */ `
precision highp float;

varying vec3 vObjectNormal;
varying vec3 vWorldNormal;
varying vec3 vWorldPosition;

uniform float uTime;
uniform float uSeed;
uniform float uOceanLevel;
uniform float uCloudDriftSpeed;
uniform float uIsSuperEarth;
uniform float uIsHabited;
uniform vec3 uSunDirection;
uniform vec3 uAtmosphereColor;

${NOISE_GLSL_CHUNK}

float sampleCloudDensity(vec3 sphereDir, float time) {
  float zonalWave = (1.0 - abs(sphereDir.y)) * 0.16 * sin(time * 0.08 + uSeed);
  vec3 drifted = rotateY(sphereDir, mod(time * uCloudDriftSpeed, 6.2831853) + zonalWave);
  vec3 morphOffset = vec3(time * 0.006, -time * 0.004, time * 0.005);
  vec3 swirl = vec3(
    fbm5(drifted * 2.8 + vec3(uSeed) + morphOffset),
    fbm5(drifted * 2.8 + vec3(uSeed + 5.2) - morphOffset),
    fbm5(drifted * 2.8 + vec3(uSeed + 9.7) + morphOffset)
  );
  float raw = fbm5(drifted * 3.6 + swirl * 1.15);
  return smoothstep(0.47, 0.74, raw);
}

void main() {
  vec3 nObj = normalize(vObjectNormal);
  vec3 nWorld = normalize(vWorldNormal);
  vec3 viewDir = normalize(cameraPosition - vWorldPosition);
  vec3 sunDir = normalize(uSunDirection);

  // Continent heightfield with domain warp & relief normal perturbation
  vec3 seedOffset = vec3(uSeed * 13.1, uSeed * 7.7, uSeed * 19.3);
  vec3 warp = vec3(
    fbm5(nObj * 2.2 + seedOffset),
    fbm5(nObj * 2.2 + seedOffset + vec3(4.1)),
    fbm5(nObj * 2.2 + seedOffset + vec3(8.6))
  );
  float elevation = fbm5(nObj * 2.8 + warp * 0.85 + seedOffset);
  float detail = fbm5(nObj * 11.0 + seedOffset);

  // Finite-difference surface relief for crisp mountains & coastlines
  float eps = 0.015;
  float elevX = fbm5((nObj + vec3(eps, 0.0, 0.0)) * 2.8 + warp * 0.85 + seedOffset);
  float elevY = fbm5((nObj + vec3(0.0, eps, 0.0)) * 2.8 + warp * 0.85 + seedOffset);
  vec3 reliefGrad = vec3(elevX - elevation, elevY - elevation, 0.0) * 5.5;
  float isLand = smoothstep(uOceanLevel - 0.012, uOceanLevel + 0.015, elevation);
  vec3 bumpedNormal = normalize(nWorld - reliefGrad * isLand);

  // Ocean vs Land palettes
  vec3 deepOcean = mix(vec3(0.015, 0.07, 0.22), vec3(0.01, 0.12, 0.28), uIsSuperEarth);
  vec3 shallowCoast = mix(vec3(0.04, 0.34, 0.56), vec3(0.06, 0.52, 0.68), uIsSuperEarth);
  float waterDepth = clamp((uOceanLevel - elevation) / max(0.001, uOceanLevel), 0.0, 1.0);
  vec3 oceanColor = mix(shallowCoast, deepOcean, smoothstep(0.0, 0.45, waterDepth));

  // Biomes: beach -> lush emerald forest/plains -> highland rock -> snow peaks
  float landHeight = clamp((elevation - uOceanLevel) / (1.0 - uOceanLevel), 0.0, 1.0);
  float latitude = abs(nObj.y);
  vec3 beachColor = vec3(0.76, 0.69, 0.50);
  vec3 lushColor = mix(vec3(0.11, 0.38, 0.16), vec3(0.08, 0.48, 0.28), uIsSuperEarth);
  vec3 savannaColor = vec3(0.38, 0.42, 0.18);
  vec3 mountainRock = vec3(0.34, 0.31, 0.29);
  vec3 snowPeak = vec3(0.92, 0.96, 1.0);

  vec3 vegetation = mix(lushColor, savannaColor, smoothstep(0.35, 0.75, detail));
  vec3 landColor = mix(beachColor, vegetation, smoothstep(0.0, 0.08, landHeight));
  landColor = mix(landColor, mountainRock, smoothstep(0.38, 0.68, landHeight));
  landColor = mix(landColor, snowPeak, smoothstep(0.66, 0.86, landHeight + latitude * 0.35));

  // Polar ice caps
  float polarIce = smoothstep(0.76, 0.90, latitude + (detail - 0.5) * 0.18);

  // Habited urban cityscapes: only appear when planet is claimed / has orbital platforms (uIsHabited > 0)
  // On the day side, cities appear as grey metropolitan sprawl; on the night side, they glow with lights
  float cityFootprint =
    smoothstep(0.62, 0.76, detail) *
    smoothstep(0.45, 0.05, landHeight) *
    isLand *
    (1.0 - polarIce) *
    uIsHabited;
  float urbanTexture = noise3D(nObj * 36.0 + seedOffset);
  vec3 urbanCityscape = mix(vec3(0.32, 0.35, 0.39), vec3(0.50, 0.53, 0.57), urbanTexture);
  landColor = mix(landColor, urbanCityscape, smoothstep(0.05, 0.55, cityFootprint));

  vec3 baseAlbedo = mix(oceanColor, landColor, isLand);
  baseAlbedo = mix(baseAlbedo, snowPeak, polarIce);

  // Projected shadow from the drifting cloud sphere onto the planet surface
  vec3 shadowSampleDir = normalize(nObj + sunDir * 0.035);
  float cloudShadow = sampleCloudDensity(shadowSampleDir, uTime);
  float shadowFactor = 1.0 - cloudShadow * 0.52;

  // Diffuse lighting + crisp terminator transition into deep night
  float ndotl = dot(bumpedNormal, sunDir);
  float diffuse = smoothstep(-0.04, 0.82, ndotl) * shadowFactor;
  float ambient = 0.012;

  // Specular sun reflection across ocean water (masked by land & clouds)
  vec3 halfVec = normalize(sunDir + viewDir);
  float specBase = max(0.0, dot(nWorld, halfVec));
  float oceanSpec = pow(specBase, 48.0) * (1.0 - isLand) * (1.0 - polarIce) * shadowFactor * max(0.0, ndotl);
  vec3 specColor = vec3(1.0, 0.93, 0.78) * oceanSpec * 0.95;

  // Night-side planetary city lights over the exact same urban cityscape footprint
  float nightMask = smoothstep(0.06, -0.20, ndotl);
  float lightSparkle = smoothstep(0.25, 0.85, urbanTexture);
  vec3 cityGlow =
    vec3(1.0, 0.72, 0.32) *
    nightMask *
    cityFootprint *
    (0.55 + 0.45 * lightSparkle) *
    (0.65 + 0.55 * uIsSuperEarth);

  // Subtle atmospheric Fresnel scatter on sunlit surface horizon only
  float fresnel = pow(1.0 - max(0.0, dot(nWorld, viewDir)), 3.2);
  vec3 horizonScatter = uAtmosphereColor * fresnel * smoothstep(-0.08, 0.55, ndotl) * 0.42;

  vec3 finalColor = baseAlbedo * (ambient + diffuse * 1.1) + specColor + cityGlow + horizonScatter;
  gl_FragColor = vec4(finalColor, 1.0);
}
`;

export const DRIFTING_CLOUDS_FRAGMENT_SHADER = /* glsl */ `
precision highp float;

varying vec3 vObjectNormal;
varying vec3 vWorldNormal;
varying vec3 vWorldPosition;

uniform float uTime;
uniform float uSeed;
uniform float uCloudDriftSpeed;
uniform float uCloudCoverage;
uniform vec3 uSunDirection;
uniform vec3 uAtmosphereColor;

${NOISE_GLSL_CHUNK}

void main() {
  vec3 nObj = normalize(vObjectNormal);
  vec3 nWorld = normalize(vWorldNormal);
  vec3 sunDir = normalize(uSunDirection);

  // Uniform planetary cloud drift + bounded latitude trade-wind wave (never winds into stripes)
  float zonalWave = (1.0 - abs(nObj.y)) * 0.16 * sin(uTime * 0.08 + uSeed);
  vec3 drifted = rotateY(nObj, mod(uTime * uCloudDriftSpeed, 6.2831853) + zonalWave);
  vec3 morphOffset = vec3(uTime * 0.006, -uTime * 0.004, uTime * 0.005);

  vec3 swirl = vec3(
    fbm5(drifted * 2.8 + vec3(uSeed) + morphOffset),
    fbm5(drifted * 2.8 + vec3(uSeed + 5.2) - morphOffset),
    fbm5(drifted * 2.8 + vec3(uSeed + 9.7) + morphOffset)
  );
  float rawCloud = fbm5(drifted * 3.6 + swirl * 1.15);
  float threshold = 1.0 - uCloudCoverage;
  float cloudAlpha = smoothstep(threshold - 0.08, threshold + 0.24, rawCloud);

  float ndotl = dot(nWorld, sunDir);
  float dayLight = smoothstep(-0.08, 0.62, ndotl);
  // Warm golden sunset scattering along the terminator band
  float terminator = exp(-pow((ndotl - 0.02) * 5.5, 2.0));
  vec3 sunsetTint = vec3(1.0, 0.55, 0.28) * terminator * 0.52;

  // Keep night-side clouds very dark and only tint sunlit clouds with atmosphere color
  vec3 cloudColor = mix(vec3(0.008, 0.012, 0.022), vec3(0.95, 0.98, 1.0), dayLight) + sunsetTint;
  cloudColor = mix(cloudColor, uAtmosphereColor, 0.12 * dayLight);

  gl_FragColor = vec4(cloudColor, cloudAlpha * (0.45 + 0.43 * dayLight));
}
`;

export const ATMOSPHERE_FRESNEL_FRAGMENT_SHADER = /* glsl */ `
precision highp float;

varying vec3 vWorldNormal;
varying vec3 vWorldPosition;

uniform vec3 uSunDirection;
uniform vec3 uAtmosphereColor;
uniform float uAtmosphereIntensity;

void main() {
  vec3 nWorld = normalize(vWorldNormal);
  vec3 viewDir = normalize(cameraPosition - vWorldPosition);
  vec3 sunDir = normalize(uSunDirection);

  // BackSide outer shell rim glow — strong on sunlit crescent, near-black on night side
  float viewDot = abs(dot(nWorld, viewDir));
  float rim = pow(clamp(1.0 - viewDot, 0.0, 1.0), 2.5);
  float sunLight = smoothstep(-0.15, 0.52, dot(-nWorld, sunDir));
  float alpha = rim * (0.03 + 0.97 * sunLight) * uAtmosphereIntensity;

  gl_FragColor = vec4(uAtmosphereColor * (0.25 + 1.25 * sunLight), clamp(alpha, 0.0, 0.92));
}
`;

export const VOLCANIC_ROCK_SURFACE_FRAGMENT_SHADER = /* glsl */ `
precision highp float;

varying vec3 vObjectNormal;
varying vec3 vWorldNormal;
varying vec3 vWorldPosition;

uniform float uTime;
uniform float uSeed;
uniform float uIsVolcanicLava;
uniform float uLavaEmissionStrength;
uniform vec3 uSunDirection;
uniform vec3 uAtmosphereColor;

${NOISE_GLSL_CHUNK}

void main() {
  vec3 nObj = normalize(vObjectNormal);
  vec3 nWorld = normalize(vWorldNormal);
  vec3 viewDir = normalize(cameraPosition - vWorldPosition);
  vec3 sunDir = normalize(uSunDirection);

  vec3 seedOffset = vec3(uSeed * 9.3, uSeed * 15.1, uSeed * 4.7);
  float rockBase = fbm5(nObj * 3.8 + seedOffset);
  float craters = fbm5(nObj * 9.5 - seedOffset);
  float ridge = abs(noise3D(nObj * 6.5 + seedOffset) - 0.5) * 2.0;

  // Finite-difference normal perturbation for rugged cratered basalt
  float eps = 0.015;
  float rx = fbm5((nObj + vec3(eps, 0.0, 0.0)) * 6.0 + seedOffset);
  float ry = fbm5((nObj + vec3(0.0, eps, 0.0)) * 6.0 + seedOffset);
  vec3 bumpedNormal = normalize(nWorld - vec3(rx - rockBase, ry - rockBase, 0.0) * 6.0);

  vec3 darkBasalt = mix(vec3(0.22, 0.20, 0.19), vec3(0.09, 0.07, 0.08), uIsVolcanicLava);
  vec3 highRock = mix(vec3(0.46, 0.42, 0.38), vec3(0.24, 0.18, 0.16), uIsVolcanicLava);
  vec3 albedo = mix(darkBasalt, highRock, smoothstep(0.25, 0.78, rockBase * 0.7 + craters * 0.3));

  float ndotl = max(0.0, dot(bumpedNormal, sunDir));
  vec3 litRock = albedo * (0.015 + ndotl * 0.98);

  // Animated flowing magma fissures & glowing caldera pools (HDR bloom trigger)
  vec3 flowOffset = vec3(uTime * 0.06, -uTime * 0.045, uTime * 0.05);
  float warpCrack = fbm5(nObj * 4.5 + flowOffset + seedOffset);
  float fissurePattern = abs(noise3D(nObj * 5.2 + vec3(warpCrack * 1.4)) - 0.5);
  float fissureMask = smoothstep(0.075, 0.008, fissurePattern);
  float calderaPool = smoothstep(0.70, 0.84, fbm5(nObj * 2.6 - flowOffset * 0.5 + seedOffset));
  float pulse = 0.82 + 0.18 * sin(uTime * 2.4 + rockBase * 12.0);

  float totalLava = clamp((fissureMask + calderaPool * 0.85) * uIsVolcanicLava, 0.0, 1.0);
  vec3 magmaCore = mix(vec3(1.0, 0.18, 0.02), vec3(1.4, 0.82, 0.18), smoothstep(0.3, 0.95, totalLava));
  vec3 lavaEmission = magmaCore * totalLava * uLavaEmissionStrength * pulse;

  // Crystalline / metallic ore glints on sunlit Barren Rock worlds
  float sunMask = smoothstep(-0.1, 0.55, dot(nWorld, sunDir));
  float crystalVein = smoothstep(0.84, 0.92, craters) * (1.0 - uIsVolcanicLava) * (1.0 - ridge);
  vec3 oreGlint = vec3(0.25, 0.75, 1.0) * crystalVein * (0.12 + 0.55 * sunMask);

  float fresnel = pow(1.0 - max(0.0, dot(nWorld, viewDir)), 3.0);
  vec3 rimHaze = uAtmosphereColor * fresnel * (0.04 + 0.36 * sunMask);

  vec3 finalColor = mix(litRock + oreGlint, lavaEmission, totalLava * 0.85) + lavaEmission * 0.45 + rimHaze;
  gl_FragColor = vec4(finalColor, 1.0);
}
`;
