// Ported from epdoptimize (paperlesspaper), Apache-2.0. Algorithms and palette
// data are derived verbatim; only the I/O is reshaped. See CREDITS.md.
import {
  clampByte,
  deltaE,
  getHue,
  getHueDistance,
  getSaturation,
  rgbToLab,
  type Lab,
} from './colorspace.js';
import type { PaletteEntry, RGB } from './palette.js';
import type { Image } from './toneMap.js';

/**
 * - `rgb`    — Euclidean distance in sRGB.
 * - `lab`    — ΔE in CIELAB (perceptual, default).
 * - `chroma` — RGB distance plus chroma/hue penalties. Ported from epdoptimize
 *   1.3.0; biases saturated source pixels away from gray/black/white palette
 *   entries and toward the closest hue, so colourful regions keep their colour
 *   instead of washing out on a 6-colour panel.
 */
export type ColorMatchingMode = 'rgb' | 'lab' | 'chroma';

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

// Error-diffusion kernels, ported verbatim from epdoptimize's diffusion-maps.ts.
// Floyd–Steinberg is the default; the rest are available for per-panel tuning.
export const diffusionKernels = {
  floydSteinberg,
  falseFloydSteinberg: [
    { offset: [ 1, 0], factor: 3 / 8 },
    { offset: [ 0, 1], factor: 3 / 8 },
    { offset: [ 1, 1], factor: 2 / 8 },
  ],
  atkinson: [
    { offset: [ 1, 0], factor: 1 / 8 },
    { offset: [ 2, 0], factor: 1 / 8 },
    { offset: [-1, 1], factor: 1 / 8 },
    { offset: [ 0, 1], factor: 1 / 8 },
    { offset: [ 1, 1], factor: 1 / 8 },
    { offset: [ 0, 2], factor: 1 / 8 },
  ],
  jarvis: [
    { offset: [ 1, 0], factor: 7 / 48 },
    { offset: [ 2, 0], factor: 5 / 48 },
    { offset: [-2, 1], factor: 3 / 48 },
    { offset: [-1, 1], factor: 5 / 48 },
    { offset: [ 0, 1], factor: 7 / 48 },
    { offset: [ 1, 1], factor: 5 / 48 },
    { offset: [ 2, 1], factor: 3 / 48 },
    { offset: [-2, 2], factor: 1 / 48 },
    { offset: [-1, 2], factor: 3 / 48 },
    { offset: [ 0, 2], factor: 4 / 48 },
    { offset: [ 1, 2], factor: 3 / 48 },
    { offset: [ 2, 2], factor: 1 / 48 },
  ],
  stucki: [
    { offset: [ 1, 0], factor: 8 / 42 },
    { offset: [ 2, 0], factor: 4 / 42 },
    { offset: [-2, 1], factor: 2 / 42 },
    { offset: [-1, 1], factor: 4 / 42 },
    { offset: [ 0, 1], factor: 8 / 42 },
    { offset: [ 1, 1], factor: 4 / 42 },
    { offset: [ 2, 1], factor: 2 / 42 },
    { offset: [-2, 2], factor: 1 / 42 },
    { offset: [-1, 2], factor: 2 / 42 },
    { offset: [ 0, 2], factor: 4 / 42 },
    { offset: [ 1, 2], factor: 2 / 42 },
    { offset: [ 2, 2], factor: 1 / 42 },
  ],
  burkes: [
    { offset: [ 1, 0], factor: 8 / 32 },
    { offset: [ 2, 0], factor: 4 / 32 },
    { offset: [-2, 1], factor: 2 / 32 },
    { offset: [-1, 1], factor: 4 / 32 },
    { offset: [ 0, 1], factor: 8 / 32 },
    { offset: [ 1, 1], factor: 4 / 32 },
    { offset: [ 2, 1], factor: 2 / 32 },
  ],
  sierra3: [
    { offset: [ 1, 0], factor: 5 / 32 },
    { offset: [ 2, 0], factor: 3 / 32 },
    { offset: [-2, 1], factor: 2 / 32 },
    { offset: [-1, 1], factor: 4 / 32 },
    { offset: [ 0, 1], factor: 5 / 32 },
    { offset: [ 1, 1], factor: 4 / 32 },
    { offset: [ 2, 1], factor: 2 / 32 },
    { offset: [-1, 2], factor: 2 / 32 },
    { offset: [ 0, 2], factor: 3 / 32 },
    { offset: [ 1, 2], factor: 2 / 32 },
  ],
  sierra2: [
    { offset: [ 1, 0], factor: 4 / 16 },
    { offset: [ 2, 0], factor: 3 / 16 },
    { offset: [-2, 1], factor: 1 / 16 },
    { offset: [-1, 1], factor: 2 / 16 },
    { offset: [ 0, 1], factor: 3 / 16 },
    { offset: [ 1, 1], factor: 2 / 16 },
    { offset: [ 2, 1], factor: 1 / 16 },
  ],
  sierra2_4a: [
    { offset: [ 1, 0], factor: 2 / 4 },
    { offset: [-1, 1], factor: 1 / 4 },
    { offset: [ 0, 1], factor: 1 / 4 },
  ],
} satisfies Record<string, DiffusionOffset[]>;

export type DiffusionKernelName = keyof typeof diffusionKernels;

interface PaletteCache {
  rgbs: RGB[];
  labs: Lab[];
  saturations: number[];
  hues: number[];
}

const buildPaletteCache = (palette: readonly PaletteEntry[]): PaletteCache => ({
  rgbs: palette.map((p) => [p.color[0], p.color[1], p.color[2]]),
  labs: palette.map((p) => rgbToLab(p.color[0], p.color[1], p.color[2])),
  saturations: palette.map((p) => getSaturation(p.color[0], p.color[1], p.color[2])),
  hues: palette.map((p) => getHue(p.color[0], p.color[1], p.color[2])),
});

// Below this saturation a colour is treated as effectively neutral (gray/black/
// white). Matches epdoptimize's threshold.
const CHROMA_NEUTRAL = 0.12;

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

// RGB distance plus chroma/hue penalties (epdoptimize 1.3.0). A saturated source
// pixel is pushed away from near-neutral palette entries (chroma penalty) and
// toward entries sharing its hue (hue penalty), keeping colour from collapsing
// to gray/black/white on a limited palette.
const findClosestChroma = (r: number, g: number, b: number, cache: PaletteCache): RGB => {
  const srcSat = getSaturation(r, g, b);
  const srcHue = srcSat >= CHROMA_NEUTRAL ? getHue(r, g, b) : null;
  let bestIdx = 0;
  let bestDist = Number.POSITIVE_INFINITY;
  for (let i = 0; i < cache.rgbs.length; i++) {
    const c = cache.rgbs[i];
    const dr = c[0] - r;
    const dg = c[1] - g;
    const dbl = c[2] - b;
    let d = Math.sqrt(dr * dr + dg * dg + dbl * dbl);

    const palSat = cache.saturations[i];
    // Penalise mapping a colourful pixel onto a near-neutral palette entry.
    if (srcSat >= CHROMA_NEUTRAL && palSat <= CHROMA_NEUTRAL) {
      d += Math.min(330, srcSat * 1300);
    }
    // Among colourful palette entries, prefer the closest hue.
    if (srcHue !== null && palSat > CHROMA_NEUTRAL) {
      d += getHueDistance(srcHue, cache.hues[i]) * 3;
    }

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
  const findClosest =
    matching === 'lab'
      ? findClosestLab
      : matching === 'chroma'
        ? findClosestChroma
        : findClosestRgb;

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
