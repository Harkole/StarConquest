import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

function hash3(x: number, y: number, z: number): number {
  let n = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453123;
  return n - Math.floor(n);
}

function fbm3(x: number, y: number, z: number): number {
  let value = 0;
  let amp = 0.5;
  let freq = 1.0;
  for (let i = 0; i < 4; i++) {
    const nx = x * freq;
    const ny = y * freq;
    const nz = z * freq;
    const ix = Math.floor(nx);
    const iy = Math.floor(ny);
    const iz = Math.floor(nz);
    const fx = nx - ix;
    const fy = ny - iy;
    const fz = nz - iz;
    const ux = fx * fx * (3 - 2 * fx);
    const uy = fy * fy * (3 - 2 * fy);
    const uz = fz * fz * (3 - 2 * fz);

    const n000 = hash3(ix, iy, iz);
    const n100 = hash3(ix + 1, iy, iz);
    const n010 = hash3(ix, iy + 1, iz);
    const n110 = hash3(ix + 1, iy + 1, iz);
    const n001 = hash3(ix, iy, iz + 1);
    const n101 = hash3(ix + 1, iy, iz + 1);
    const n011 = hash3(ix, iy + 1, iz + 1);
    const n111 = hash3(ix + 1, iy + 1, iz + 1);

    const nx00 = n000 + (n100 - n000) * ux;
    const nx10 = n010 + (n110 - n010) * ux;
    const nx01 = n001 + (n101 - n001) * ux;
    const nx11 = n011 + (n111 - n011) * ux;
    const nxy0 = nx00 + (nx10 - nx00) * uy;
    const nxy1 = nx01 + (nx11 - nx01) * uy;
    value += (nxy0 + (nxy1 - nxy0) * uz) * amp;

    freq *= 2.07;
    amp *= 0.5;
  }
  return value;
}

/**
 * Creates a craggy, irregular, cratered 3D asteroid mesh (instead of a smooth sphere).
 */
export function createCraggyAsteroidGeometry(baseRadius = 2.4): THREE.BufferGeometry {
  const geom = new THREE.IcosahedronGeometry(baseRadius, 3);
  const posAttr = geom.attributes.position;
  if (!posAttr) {
    return geom;
  }

  const v = new THREE.Vector3();
  const craterCenters = [
    new THREE.Vector3(1, 0.3, 0.2).normalize(),
    new THREE.Vector3(-0.7, 0.5, -0.4).normalize(),
    new THREE.Vector3(0.2, -0.8, 0.5).normalize(),
    new THREE.Vector3(-0.3, -0.4, -0.85).normalize(),
  ];

  for (let i = 0; i < posAttr.count; i++) {
    v.fromBufferAttribute(posAttr, i);
    const dir = v.clone().normalize();

    // Large-scale rocky ridges + medium crags
    const ridgeNoise = fbm3(dir.x * 1.8 + 3.1, dir.y * 1.8 - 1.7, dir.z * 1.8 + 5.3);
    const detailNoise = fbm3(dir.x * 4.2 - 2.4, dir.y * 4.2 + 6.1, dir.z * 4.2 - 3.8);

    // Carve concave impact craters with raised rims
    let craterIndent = 0;
    for (const c of craterCenters) {
      const dist = dir.distanceTo(c);
      if (dist < 0.65) {
        const normalized = dist / 0.65;
        const bowl = (1.0 - normalized * normalized) * -0.22;
        const rim = Math.exp(-Math.pow((normalized - 0.85) * 6.0, 2.0)) * 0.08;
        craterIndent += bowl + rim;
      }
    }

    const displacement =
      0.68 + ridgeNoise * 0.48 + (detailNoise - 0.5) * 0.22 + craterIndent;
    v.multiplyScalar(displacement);
    posAttr.setXYZ(i, v.x, v.y, v.z);
  }

  geom.computeVertexNormals();
  return geom;
}

/**
 * Creates a faceted multi-shard crystal cluster geometry with pointed hexagonal prisms.
 */
export function createCrystalClusterGeometry(baseScale = 2.1): THREE.BufferGeometry {
  const shardConfigs = [
    { rx: 0.08, ry: 0.0, rz: 0.05, sx: 0.55, sy: 1.55, sz: 0.55, yOff: 0.1 },
    { rx: 0.52, ry: 0.8, rz: -0.35, sx: 0.42, sy: 1.15, sz: 0.42, yOff: -0.1 },
    { rx: -0.48, ry: 2.1, rz: 0.42, sx: 0.45, sy: 1.25, sz: 0.45, yOff: -0.05 },
    { rx: 0.38, ry: 4.2, rz: 0.55, sx: 0.36, sy: 0.95, sz: 0.36, yOff: -0.15 },
  ];

  const shards: THREE.BufferGeometry[] = [];
  for (const cfg of shardConfigs) {
    // 6-sided hexagonal crystal column with sharp pyramidal tips
    const shard = new THREE.ConeGeometry(cfg.sx * baseScale, cfg.sy * baseScale * 2.1, 6, 1);
    shard.translate(0, cfg.yOff * baseScale, 0);
    shard.rotateX(cfg.rx);
    shard.rotateY(cfg.ry);
    shard.rotateZ(cfg.rz);
    shards.push(shard.toNonIndexed());
  }

  const merged = mergeGeometries(shards, false);
  for (const s of shards) {
    s.dispose();
  }
  merged.computeVertexNormals();
  return merged;
}

export const ASTEROID_ROCK_VERTEX_SHADER = /* glsl */ `
varying vec3 vLocalPos;
varying vec3 vWorldNormal;
varying vec3 vWorldPosition;
varying float vInstanceSeed;

void main() {
  vLocalPos = position;
  mat4 instMat = instanceMatrix;
  vec4 worldPos = modelMatrix * instMat * vec4(position, 1.0);
  vWorldPosition = worldPos.xyz;
  vWorldNormal = normalize(mat3(modelMatrix) * mat3(instMat) * normal);
  vInstanceSeed = fract(sin(instMat[3][0] * 12.9898 + instMat[3][2] * 78.233) * 43758.5453);
  gl_Position = projectionMatrix * viewMatrix * worldPos;
}
`;

export const ASTEROID_ROCK_FRAGMENT_SHADER = /* glsl */ `
precision highp float;

varying vec3 vLocalPos;
varying vec3 vWorldNormal;
varying vec3 vWorldPosition;
varying float vInstanceSeed;

uniform vec3 uSunDirection;

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

float fbm4(vec3 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * noise3D(p);
    p = p * 2.12 + vec3(5.3, -9.1, 3.7);
    a *= 0.5;
  }
  return v;
}

void main() {
  vec3 sunDir = normalize(uSunDirection);
  vec3 samplePos = vLocalPos * 1.45 + vec3(vInstanceSeed * 17.3);

  // Multi-scale rough rock texture + pitted craters
  float grain = fbm4(samplePos);
  float microPits = noise3D(samplePos * 4.5);
  float crevices = smoothstep(0.22, 0.55, grain * 0.75 + microPits * 0.25);

  // Finite-difference normal bump for gritty rocky surface relief
  float eps = 0.08;
  float gx = fbm4(samplePos + vec3(eps, 0.0, 0.0));
  float gy = fbm4(samplePos + vec3(0.0, eps, 0.0));
  float gz = fbm4(samplePos + vec3(0.0, 0.0, eps));
  vec3 bumpGrad = vec3(gx - grain, gy - grain, gz - grain) * 3.8;
  vec3 nWorld = normalize(vWorldNormal - bumpGrad);

  // Natural silicate & iron-nickel asteroid rock palette
  vec3 darkBasalt = vec3(0.16, 0.14, 0.13);
  vec3 dustyRegolith = vec3(0.42, 0.37, 0.32);
  vec3 warmOreVein = vec3(0.62, 0.48, 0.32);

  vec3 rockColor = mix(darkBasalt, dustyRegolith, crevices);
  float oreStreak = smoothstep(0.72, 0.85, microPits) * smoothstep(0.45, 0.75, grain);
  rockColor = mix(rockColor, warmOreVein, oreStreak * 0.65);

  float ndotl = max(0.0, dot(nWorld, sunDir));
  // Oren-Nayar style rough diffuse wrap + dark crater ambient occlusion
  float roughDiffuse = pow(ndotl, 0.85) * (0.55 + 0.45 * crevices);
  float ambient = 0.09 * (0.5 + 0.5 * crevices);

  vec3 finalColor = rockColor * (ambient + roughDiffuse * 1.15);
  gl_FragColor = vec4(finalColor, 1.0);
}
`;

export const CRYSTAL_SHARD_VERTEX_SHADER = /* glsl */ `
varying vec3 vLocalPos;
varying vec3 vWorldNormal;
varying vec3 vWorldPosition;
varying float vInstanceSeed;

void main() {
  vLocalPos = position;
  mat4 instMat = instanceMatrix;
  vec4 worldPos = modelMatrix * instMat * vec4(position, 1.0);
  vWorldPosition = worldPos.xyz;
  vWorldNormal = normalize(mat3(modelMatrix) * mat3(instMat) * normal);
  vInstanceSeed = fract(sin(instMat[3][0] * 31.7 + instMat[3][2] * 53.9) * 43758.5453);
  gl_Position = projectionMatrix * viewMatrix * worldPos;
}
`;

export const CRYSTAL_SHARD_FRAGMENT_SHADER = /* glsl */ `
precision highp float;

varying vec3 vLocalPos;
varying vec3 vWorldNormal;
varying vec3 vWorldPosition;
varying float vInstanceSeed;

uniform vec3 uSunDirection;

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

void main() {
  vec3 nWorld = normalize(vWorldNormal);
  vec3 viewDir = normalize(cameraPosition - vWorldPosition);
  vec3 sunDir = normalize(uSunDirection);

  // Internal frost & quartz-like refraction planes
  float internalFacet = noise3D(vLocalPos * 2.6 + vec3(vInstanceSeed * 11.0));
  float frostVeins = smoothstep(0.58, 0.82, noise3D(vLocalPos * 6.2 + vec3(vInstanceSeed * 23.0)));

  // Pale Ice-Blue palette kept below the HDR bloom threshold (0.62) for crisp facet contrast
  vec3 shadowIceBlue = vec3(0.18, 0.30, 0.42);
  vec3 paleIceBlue = vec3(0.42, 0.58, 0.72);
  vec3 frostHighlight = vec3(0.58, 0.74, 0.86);

  vec3 baseIce = mix(shadowIceBlue, paleIceBlue, smoothstep(0.2, 0.8, internalFacet));
  baseIce = mix(baseIce, frostHighlight, frostVeins * 0.35);

  // Faceted directional lighting with distinct shadow & sunlit sides
  float ndotl = max(0.0, dot(nWorld, sunDir));
  float subsurface = pow(max(0.0, dot(-viewDir, sunDir) * 0.5 + 0.5), 2.5) * 0.12;

  // Subtle Fresnel rim & restrained specular glint (capped below bloom threshold)
  float fresnel = pow(1.0 - max(0.0, dot(nWorld, viewDir)), 3.0);
  vec3 halfVec = normalize(sunDir + viewDir);
  float specular = pow(max(0.0, dot(nWorld, halfVec)), 48.0) * 0.22;

  vec3 finalColor =
    baseIce * (0.24 + ndotl * 0.62 + subsurface) +
    frostHighlight * fresnel * 0.14 +
    frostHighlight * specular;

  gl_FragColor = vec4(clamp(finalColor, 0.0, 0.56), 1.0);
}
`;
