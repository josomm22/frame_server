import { clampByte, deltaE, rgbToLab, type Lab } from './colorspace.js';
import type { PaletteEntry, RGB } from './palette.js';
import type { Image } from './toneMap.js';

export type ColorMatchingMode = 'rgb' | 'lab';

export interface DiffusionOffset {
  offset: [number, number];
  factor: number;
}

export const floydSteinberg: DiffusionOffset[] = [
  { offset: [ 1, 0], factor: 7 / 16 },
  { offset: [-1, 1], factor: 3 / 16 },
  { offset: [ 0, 1], factor: 5 / 16 },
  { offset: [ 1, 1], factor: 1 / 16 },
];

interface PaletteCache {
  rgbs: RGB[];
  labs: Lab[];
}

const buildPaletteCache = (palette: readonly PaletteEntry[]): PaletteCache => ({
  rgbs: palette.map((p) => [p.color[0], p.color[1], p.color[2]]),
  labs: palette.map((p) => rgbToLab(p.color[0], p.color[1], p.color[2])),
});

const findClosestRgb = (r: number, g: number, b: number, cache: PaletteCache): RGB => {
  let bestIdx = 0;
  let bestDist = Number.POSITIVE_INFINITY;
  for (let i = 0; i < cache.rgbs.length; i++) {
    const c = cache.rgbs[i];
    const dr = c[0] - r;
    const dg = c[1] - g;
    const dbl = c[2] - b;
    const d = dr * dr + dg * dg + dbl * dbl;
    if (d < bestDist) {
      bestDist = d;
      bestIdx = i;
    }
  }
  return cache.rgbs[bestIdx];
};

const findClosestLab = (r: number, g: number, b: number, cache: PaletteCache): RGB => {
  const lab = rgbToLab(r, g, b);
  let bestIdx = 0;
  let bestDist = Number.POSITIVE_INFINITY;
  for (let i = 0; i < cache.labs.length; i++) {
    const d = deltaE(cache.labs[i], lab);
    if (d < bestDist) {
      bestDist = d;
      bestIdx = i;
    }
  }
  return cache.rgbs[bestIdx];
};

export interface ErrorDiffusionOptions {
  matrix?: DiffusionOffset[];
  serpentine?: boolean;
  colorMatching?: ColorMatchingMode;
}

export const errorDiffusionDither = (
  img: Image,
  palette: readonly PaletteEntry[],
  options: ErrorDiffusionOptions = {},
): void => {
  const matrix = options.matrix ?? floydSteinberg;
  const serpentine = options.serpentine ?? true;
  const matching: ColorMatchingMode = options.colorMatching ?? 'lab';
  const cache = buildPaletteCache(palette);
  const findClosest = matching === 'lab' ? findClosestLab : findClosestRgb;

  const { width, height, data } = img;

  for (let y = 0; y < height; y++) {
    const reverse = serpentine && y % 2 === 1;
    const xStart = reverse ? width - 1 : 0;
    const xEnd = reverse ? -1 : width;
    const xStep = reverse ? -1 : 1;

    for (let x = xStart; x !== xEnd; x += xStep) {
      const idx = (y * width + x) * 4;
      const oldR = data[idx];
      const oldG = data[idx + 1];
      const oldB = data[idx + 2];

      const [nr, ng, nb] = findClosest(oldR, oldG, oldB, cache);
      data[idx]     = nr;
      data[idx + 1] = ng;
      data[idx + 2] = nb;

      const er = oldR - nr;
      const eg = oldG - ng;
      const eb = oldB - nb;

      for (const { offset, factor } of matrix) {
        const dx = reverse ? -offset[0] : offset[0];
        const nx = x + dx;
        const ny = y + offset[1];
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
        const ni = (ny * width + nx) * 4;
        data[ni]     = clampByte(data[ni]     + er * factor);
        data[ni + 1] = clampByte(data[ni + 1] + eg * factor);
        data[ni + 2] = clampByte(data[ni + 2] + eb * factor);
      }
    }
  }
};
