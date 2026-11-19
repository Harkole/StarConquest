import * as THREE from 'three';

export interface ProceduralPbrTextureSet {
  readonly map: THREE.DataTexture;
  readonly bumpMap: THREE.DataTexture;
  readonly roughnessMap: THREE.DataTexture;
}

export interface HullTextureBundle {
  readonly hullPlating: ProceduralPbrTextureSet;
  readonly weatheredOchre: ProceduralPbrTextureSet;
  readonly darkRibbing: ProceduralPbrTextureSet;
  readonly machinedSteel: ProceduralPbrTextureSet;
  dispose(): void;
}

function hash2D(ix: number, iy: number, seed: number): number {
  let n = Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(seed, 1442695041);
  n = (n ^ (n >>> 13)) >>> 0;
  n = Math.imul(n, 1274126177) >>> 0;
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function createDataTexture(
  data: Uint8Array<ArrayBuffer>,
  size: number,
  colorSpace: THREE.ColorSpace,
  repeatX: number,
  repeatY: number,
): THREE.DataTexture {
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.colorSpace = colorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeatX, repeatY);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

/**
 * Generates an asymmetric industrial armor-plating PBR texture set:
 * - Multi-scale interlocking armor plates with per-panel tonal shifts
 * - Recessed seam grooves and corner rivet dots in both albedo and bump
 * - Edge-wear highlights and matte/grime roughness variation
 */
function generateArmorPlatingSet(
  size: number,
  seed: number,
  options: {
    readonly rows: number;
    readonly cols: number;
    readonly seamWidth: number;
    readonly tonalVariation: number;
    readonly edgeWearBoost: number;
    readonly weatheringStrength: number;
    readonly repeat: number;
  },
): ProceduralPbrTextureSet {
  const albedoData = new Uint8Array(size * size * 4);
  const bumpData = new Uint8Array(size * size * 4);
  const roughData = new Uint8Array(size * size * 4);

  const rowHeight = size / options.rows;
  const colWidth = size / options.cols;

  for (let y = 0; y < size; y++) {
    const rowIdx = Math.floor(y / rowHeight);
    const localY = y - rowIdx * rowHeight;
    // Stagger alternate rows like welded armor hull plating
    const rowOffset = (rowIdx % 2) * (colWidth * 0.5);

    for (let x = 0; x < size; x++) {
      const shiftedX = (x + rowOffset) % size;
      const colIdx = Math.floor(shiftedX / colWidth);
      const localX = shiftedX - colIdx * colWidth;

      const panelRand = hash2D(colIdx, rowIdx, seed);
      const subRand = hash2D(colIdx + 31, rowIdx + 17, seed + 7);
      const fineGrain = (hash2D(x, y, seed + 101) - 0.5) * 14;
      const coarseMottle =
        (hash2D(Math.floor(x / 8), Math.floor(y / 8), seed + 211) - 0.5) *
        20 *
        options.weatheringStrength;

      // Distance from nearest outer panel seam
      const distX = Math.min(localX, colWidth - 1 - localX);
      const distY = Math.min(localY, rowHeight - 1 - localY);
      const minEdgeDist = Math.min(distX, distY);

      // Optional internal sub-panel divider on ~50% of plates
      const hasSubSplit = subRand > 0.45;
      const subSplitDist = hasSubSplit ? Math.abs(localX - colWidth * 0.5) : 999;
      const seamDist = Math.min(minEdgeDist, subSplitDist);

      const isSeam = seamDist < options.seamWidth;
      const isEdgeWear = !isSeam && seamDist < options.seamWidth + 2.2;

      // Corner rivets inset slightly from seams
      const rivetInset = Math.max(4, Math.floor(options.seamWidth + 3));
      const nearCornerX =
        Math.abs(localX - rivetInset) <= 1.2 ||
        Math.abs(localX - (colWidth - 1 - rivetInset)) <= 1.2;
      const nearCornerY =
        Math.abs(localY - rivetInset) <= 1.2 ||
        Math.abs(localY - (rowHeight - 1 - rivetInset)) <= 1.2;
      const isRivet = nearCornerX && nearCornerY;

      // Base panel brightness centered near 232 so material.color stays faithful to docs/artstyle.md
      let albedo = 232 + (panelRand - 0.5) * 2 * options.tonalVariation + fineGrain + coarseMottle;
      let bump = 165 + (panelRand - 0.5) * 18 + fineGrain * 0.4;
      let rough = 185 + (0.5 - panelRand) * 32 + coarseMottle * 0.7;

      // Subtle vertical weathering streak near the top seam of plates
      if (localY < 7 && !isSeam) {
        const streakMask = hash2D(Math.floor(shiftedX / 3), rowIdx, seed + 307);
        if (streakMask > 0.68) {
          const fade = 1 - localY / 7;
          albedo -= 18 * fade * options.weatheringStrength;
          rough += 26 * fade * options.weatheringStrength;
        }
      }

      if (isSeam) {
        albedo = 122 + fineGrain * 0.3;
        bump = 42;
        rough = 242;
      } else if (isEdgeWear) {
        albedo += options.edgeWearBoost;
        bump += 16;
        rough -= 42;
      }

      if (isRivet) {
        albedo -= 24;
        bump = 235;
        rough = 130;
      }

      const idx = (y * size + x) * 4;
      const aByte = clampByte(albedo);
      const bByte = clampByte(bump);
      const rByte = clampByte(rough);

      albedoData[idx] = aByte;
      albedoData[idx + 1] = aByte;
      albedoData[idx + 2] = aByte;
      albedoData[idx + 3] = 255;

      bumpData[idx] = bByte;
      bumpData[idx + 1] = bByte;
      bumpData[idx + 2] = bByte;
      bumpData[idx + 3] = 255;

      roughData[idx] = rByte;
      roughData[idx + 1] = rByte;
      roughData[idx + 2] = rByte;
      roughData[idx + 3] = 255;
    }
  }

  return {
    map: createDataTexture(albedoData, size, THREE.SRGBColorSpace, options.repeat, options.repeat),
    bumpMap: createDataTexture(bumpData, size, THREE.NoColorSpace, options.repeat, options.repeat),
    roughnessMap: createDataTexture(
      roughData,
      size,
      THREE.NoColorSpace,
      options.repeat,
      options.repeat,
    ),
  };
}

/**
 * Generates tightly ribbed structural iron grating & bolt tracks for dark frames, collars, and trusses.
 */
function generateDarkRibbingSet(size: number, seed: number): ProceduralPbrTextureSet {
  const albedoData = new Uint8Array(size * size * 4);
  const bumpData = new Uint8Array(size * size * 4);
  const roughData = new Uint8Array(size * size * 4);

  const ribPitch = 16;
  for (let y = 0; y < size; y++) {
    const ribPos = y % ribPitch;
    const isGroove = ribPos < 3;
    const isBevel = ribPos === 3 || ribPos === ribPitch - 1;

    for (let x = 0; x < size; x++) {
      const grain = (hash2D(x, y, seed) - 0.5) * 14;
      const isCrossBrace = x % 64 < 3;

      let albedo = 228 + grain;
      let bump = 175 + grain * 0.4;
      let rough = 172 + grain * 0.6;

      if (isGroove || isCrossBrace) {
        albedo = 128 + grain * 0.3;
        bump = 48;
        rough = 238;
      } else if (isBevel) {
        albedo = 248 + grain * 0.3;
        bump = 220;
        rough = 122;
      }

      const idx = (y * size + x) * 4;
      const aByte = clampByte(albedo);
      const bByte = clampByte(bump);
      const rByte = clampByte(rough);

      albedoData[idx] = aByte;
      albedoData[idx + 1] = aByte;
      albedoData[idx + 2] = aByte;
      albedoData[idx + 3] = 255;

      bumpData[idx] = bByte;
      bumpData[idx + 1] = bByte;
      bumpData[idx + 2] = bByte;
      bumpData[idx + 3] = 255;

      roughData[idx] = rByte;
      roughData[idx + 1] = rByte;
      roughData[idx + 2] = rByte;
      roughData[idx + 3] = 255;
    }
  }

  return {
    map: createDataTexture(albedoData, size, THREE.SRGBColorSpace, 2, 2),
    bumpMap: createDataTexture(bumpData, size, THREE.NoColorSpace, 2, 2),
    roughnessMap: createDataTexture(roughData, size, THREE.NoColorSpace, 2, 2),
  };
}

/**
 * Generates brushed metallic steel & machined cooling-jacket banding for turret barrels and mechanical trim.
 */
function generateMachinedSteelSet(size: number, seed: number): ProceduralPbrTextureSet {
  const albedoData = new Uint8Array(size * size * 4);
  const bumpData = new Uint8Array(size * size * 4);
  const roughData = new Uint8Array(size * size * 4);

  for (let y = 0; y < size; y++) {
    // Machined cooling rings every 32px along the barrel axis
    const ringPhase = y % 32;
    const isRingGroove = ringPhase < 2;
    const isRingCollar = ringPhase >= 2 && ringPhase <= 4;
    // Subtle heat-tempering gradient toward barrel tip
    const heatFactor = y / (size - 1);

    for (let x = 0; x < size; x++) {
      // Longitudinal brushed metal streaks
      const streak = (hash2D(x, Math.floor(y / 12), seed) - 0.5) * 18;
      const fine = (hash2D(x, y, seed + 41) - 0.5) * 8;

      let albedo = 236 + streak + fine - heatFactor * 14;
      let bump = 168 + streak * 0.5;
      let rough = 132 - streak * 0.6 + heatFactor * 20;

      if (isRingGroove) {
        albedo = 140;
        bump = 55;
        rough = 225;
      } else if (isRingCollar) {
        albedo = 252;
        bump = 225;
        rough = 96;
      }

      const idx = (y * size + x) * 4;
      const aByte = clampByte(albedo);
      const bByte = clampByte(bump);
      const rByte = clampByte(rough);

      albedoData[idx] = aByte;
      albedoData[idx + 1] = aByte;
      albedoData[idx + 2] = aByte;
      albedoData[idx + 3] = 255;

      bumpData[idx] = bByte;
      bumpData[idx + 1] = bByte;
      bumpData[idx + 2] = bByte;
      bumpData[idx + 3] = 255;

      roughData[idx] = rByte;
      roughData[idx + 1] = rByte;
      roughData[idx + 2] = rByte;
      roughData[idx + 3] = 255;
    }
  }

  return {
    map: createDataTexture(albedoData, size, THREE.SRGBColorSpace, 1, 1),
    bumpMap: createDataTexture(bumpData, size, THREE.NoColorSpace, 1, 1),
    roughnessMap: createDataTexture(roughData, size, THREE.NoColorSpace, 1, 1),
  };
}

function disposeTextureSet(set: ProceduralPbrTextureSet): void {
  set.map.dispose();
  set.bumpMap.dispose();
  set.roughnessMap.dispose();
}

/**
 * Creates a deterministic, zero-DOM-dependency bundle of procedural PBR hull textures
 * (albedo, bump, roughness) shared by orbital stations, deep-space towers, and starships.
 */
export function createProceduralHullTextures(size = 256): HullTextureBundle {
  const hullPlating = generateArmorPlatingSet(size, 17, {
    rows: 6,
    cols: 4,
    seamWidth: 1.8,
    tonalVariation: 22,
    edgeWearBoost: 16,
    weatheringStrength: 0.9,
    repeat: 2,
  });

  const weatheredOchre = generateArmorPlatingSet(size, 53, {
    rows: 5,
    cols: 3,
    seamWidth: 2.0,
    tonalVariation: 26,
    edgeWearBoost: 22,
    weatheringStrength: 1.15,
    repeat: 2,
  });

  const darkRibbing = generateDarkRibbingSet(size, 97);
  const machinedSteel = generateMachinedSteelSet(size, 131);

  return {
    hullPlating,
    weatheredOchre,
    darkRibbing,
    machinedSteel,
    dispose: () => {
      disposeTextureSet(hullPlating);
      disposeTextureSet(weatheredOchre);
      disposeTextureSet(darkRibbing);
      disposeTextureSet(machinedSteel);
    },
  };
}
