import type { PaletteEntry } from './palette.js';
import type { Image } from './toneMap.js';

const colorKey = (r: number, g: number, b: number) => (r << 16) | (g << 8) | b;

/**
 * The pixel-index ordering written to the .bin matches the order of `palette`
 * entries. With the default `aitjcizeSpectra6` that is:
 *   0=black  1=white  2=blue  3=green  4=red  5=yellow
 * The ESP32 firmware MUST decode against the same order. If the panel driver
 * expects a different order, remap inside the firmware rather than reordering
 * the palette here (the calibrated/device-color pairing depends on this order).
 */
const buildIndexMap = (palette: readonly PaletteEntry[]): Map<number, number> => {
  const map = new Map<number, number>();
  for (let i = 0; i < palette.length; i++) {
    const c = palette[i].deviceColor;
    map.set(colorKey(c[0], c[1], c[2]), i);
  }
  return map;
};

export type PackFormat = 'nibble4bpp' | 'pack3bpp';

export interface PackResult {
  buffer: Buffer;
  format: PackFormat;
  unmatched: number;
}

/**
 * 4bpp nibble-packed: two pixel indices per byte.
 * Layout: high nibble = first pixel, low nibble = second pixel.
 * 1600x1200 -> 960 000 bytes (~937 KB).
 */
export const packNibble4bpp = (
  img: Image,
  palette: readonly PaletteEntry[],
): PackResult => {
  const indexMap = buildIndexMap(palette);
  const totalPixels = img.width * img.height;
  const packed = Buffer.alloc(Math.ceil(totalPixels / 2));
  let unmatched = 0;
  for (let p = 0; p < totalPixels; p++) {
    const i = p * 4;
    const lookup = indexMap.get(colorKey(img.data[i], img.data[i + 1], img.data[i + 2]));
    if (lookup === undefined) {
      unmatched++;
      continue;
    }
    const idx = lookup & 0x0f;
    const byteIdx = p >> 1;
    if (p & 1) {
      packed[byteIdx] |= idx;
    } else {
      packed[byteIdx] = idx << 4;
    }
  }
  return { buffer: packed, format: 'nibble4bpp', unmatched };
};

/**
 * True 3bpp packing: 8 pixels per 3 bytes (24 bits), MSB-first.
 * 1600x1200 -> 720 000 bytes (~703 KB).
 */
export const pack3bpp = (
  img: Image,
  palette: readonly PaletteEntry[],
): PackResult => {
  const indexMap = buildIndexMap(palette);
  const totalPixels = img.width * img.height;
  const packed = Buffer.alloc(Math.ceil((totalPixels * 3) / 8));
  let unmatched = 0;
  let bitPos = 0;
  for (let p = 0; p < totalPixels; p++) {
    const i = p * 4;
    const lookup = indexMap.get(colorKey(img.data[i], img.data[i + 1], img.data[i + 2]));
    if (lookup === undefined) unmatched++;
    const idx = (lookup ?? 0) & 0x07;
    for (let b = 2; b >= 0; b--) {
      const bit = (idx >> b) & 1;
      packed[bitPos >> 3] |= bit << (7 - (bitPos & 7));
      bitPos++;
    }
  }
  return { buffer: packed, format: 'pack3bpp', unmatched };
};

export const packDeviceColors = (
  img: Image,
  palette: readonly PaletteEntry[],
  format: PackFormat = 'nibble4bpp',
): PackResult =>
  format === 'nibble4bpp'
    ? packNibble4bpp(img, palette)
    : pack3bpp(img, palette);
