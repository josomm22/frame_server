import { clamp, clampByte, labToRgb, luma709, rgbToLab } from './colorspace.js';
import type { RGB } from './palette.js';

export interface Image {
  width: number;
  height: number;
  /** RGBA bytes, 4 per pixel. */
  data: Uint8ClampedArray;
}

export type ToneMappingMode = 'off' | 'contrast' | 'scurve';

export interface ToneMappingOptions {
  mode?: ToneMappingMode;
  exposure?: number;
  saturation?: number;
  /** contrast mode */
  contrast?: number;
  /** scurve mode */
  strength?: number;
  shadowBoost?: number;
  highlightCompress?: number;
  midpoint?: number;
}

export type DynamicRangeCompressionMode = 'off' | 'display' | 'auto';

export interface DynamicRangeCompressionOptions {
  mode?: DynamicRangeCompressionMode;
  strength?: number;
  /** auto-mode percentile bounds for source range estimation. */
  lowPercentile?: number;
  highPercentile?: number;
}

export const applyExposure = (img: Image, exposure: number): void => {
  if (exposure === 1) return;
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    d[i]     = clampByte(d[i]     * exposure);
    d[i + 1] = clampByte(d[i + 1] * exposure);
    d[i + 2] = clampByte(d[i + 2] * exposure);
  }
};

export const applyContrast = (img: Image, contrast: number): void => {
  if (contrast === 1) return;
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    d[i]     = clampByte((d[i]     - 128) * contrast + 128);
    d[i + 1] = clampByte((d[i + 1] - 128) * contrast + 128);
    d[i + 2] = clampByte((d[i + 2] - 128) * contrast + 128);
  }
};

export const applySaturation = (img: Image, saturation: number): void => {
  if (saturation === 1) return;
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i] / 255;
    const g = d[i + 1] / 255;
    const b = d[i + 2] / 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const lightness = (max + min) / 2;
    if (max === min) continue;

    const delta = max - min;
    const sat =
      lightness > 0.5
        ? delta / (2 - max - min)
        : delta / Math.max(max + min, 1e-6);

    let hue: number;
    if (max === r) hue = ((g - b) / delta + (g < b ? 6 : 0)) / 6;
    else if (max === g) hue = ((b - r) / delta + 2) / 6;
    else hue = ((r - g) / delta + 4) / 6;

    const newSat = clamp(sat * saturation, 0, 1);
    const c = (1 - Math.abs(2 * lightness - 1)) * newSat;
    const x = c * (1 - Math.abs(((hue * 6) % 2) - 1));
    const m = lightness - c / 2;

    let rp = 0;
    let gp = 0;
    let bp = 0;
    const sector = Math.floor(hue * 6);
    if      (sector === 0) [rp, gp, bp] = [c, x, 0];
    else if (sector === 1) [rp, gp, bp] = [x, c, 0];
    else if (sector === 2) [rp, gp, bp] = [0, c, x];
    else if (sector === 3) [rp, gp, bp] = [0, x, c];
    else if (sector === 4) [rp, gp, bp] = [x, 0, c];
    else                   [rp, gp, bp] = [c, 0, x];

    d[i]     = clampByte((rp + m) * 255);
    d[i + 1] = clampByte((gp + m) * 255);
    d[i + 2] = clampByte((bp + m) * 255);
  }
};

export const applyScurve = (
  img: Image,
  strength: number,
  shadowBoost: number,
  highlightCompress: number,
  midpoint: number,
): void => {
  if (strength === 0) return;
  const d = img.data;
  const mid = clamp(midpoint, 0.01, 0.99);
  for (let i = 0; i < d.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      const n = d[i + c] / 255;
      let result: number;
      if (n <= mid) {
        const sv = n / mid;
        result = Math.pow(sv, 1 - strength * shadowBoost) * mid;
      } else {
        const hv = (n - mid) / (1 - mid);
        result = mid + Math.pow(hv, 1 + strength * highlightCompress) * (1 - mid);
      }
      d[i + c] = clampByte(result * 255);
    }
  }
};

export const applyToneMapping = (
  img: Image,
  opts: ToneMappingOptions | undefined,
): void => {
  if (!opts || opts.mode === 'off') return;
  applyExposure(img, opts.exposure ?? 1);
  applySaturation(img, opts.saturation ?? 1);
  const mode = opts.mode ?? 'contrast';
  if (mode === 'contrast') {
    applyContrast(img, opts.contrast ?? 1);
  } else if (mode === 'scurve') {
    applyScurve(
      img,
      opts.strength ?? 0.9,
      opts.shadowBoost ?? 0,
      opts.highlightCompress ?? 1.5,
      opts.midpoint ?? 0.5,
    );
  }
};

const percentile = (vals: number[], p: number): number => {
  if (vals.length === 0) return 0;
  const sorted = vals.slice().sort((a, b) => a - b);
  const idx = clamp(Math.round((sorted.length - 1) * p), 0, sorted.length - 1);
  return sorted[idx];
};

const getPaletteLuminanceWindow = (palette: RGB[]): { blackL: number; whiteL: number } => {
  let darkest = palette[0];
  let lightest = palette[0];
  for (const c of palette) {
    if (luma709(c[0], c[1], c[2]) < luma709(darkest[0], darkest[1], darkest[2])) darkest = c;
    if (luma709(c[0], c[1], c[2]) > luma709(lightest[0], lightest[1], lightest[2])) lightest = c;
  }
  const [blackL] = rgbToLab(darkest[0], darkest[1], darkest[2]);
  const [whiteL] = rgbToLab(lightest[0], lightest[1], lightest[2]);
  return { blackL, whiteL };
};

export const applyDynamicRangeCompression = (
  img: Image,
  opts: DynamicRangeCompressionOptions | undefined,
  palette: RGB[],
): void => {
  if (!opts || opts.mode === 'off') return;
  const mode = opts.mode ?? 'display';
  const strength = clamp(opts.strength ?? 1, 0, 1);
  if (strength === 0) return;

  const { blackL, whiteL } = getPaletteLuminanceWindow(palette);
  const targetRange = whiteL - blackL;
  if (targetRange <= 0) return;

  const d = img.data;
  let sourceBlackL = 0;
  let sourceWhiteL = 100;
  if (mode === 'auto') {
    const ls: number[] = [];
    for (let i = 0; i < d.length; i += 4) {
      const [l] = rgbToLab(d[i], d[i + 1], d[i + 2]);
      ls.push(l);
    }
    sourceBlackL = percentile(ls, opts.lowPercentile ?? 0.01);
    sourceWhiteL = percentile(ls, opts.highPercentile ?? 0.99);
  }
  const sourceRange = sourceWhiteL - sourceBlackL;
  if (sourceRange <= 1e-4) return;

  for (let i = 0; i < d.length; i += 4) {
    const [l, a, b] = rgbToLab(d[i], d[i + 1], d[i + 2]);
    const normalizedL = clamp((l - sourceBlackL) / sourceRange, 0, 1);
    const compressedL = blackL + normalizedL * targetRange;
    const blendedL = l + (compressedL - l) * strength;
    const [r, g, blue] = labToRgb(blendedL, a, b);
    d[i]     = r;
    d[i + 1] = g;
    d[i + 2] = blue;
  }
};
