import type { PaletteEntry } from './palette.js';
import type { Image } from './toneMap.js';

const colorKey = (r: number, g: number, b: number) => (r << 16) | (g << 8) | b;

/**
 * Walks the image and replaces every calibrated palette color with its
 * device-color counterpart. Pixels not in the palette are left untouched and
 * counted as a warning — after dithering against the calibrated palette,
 * unmatched pixels indicate a pipeline bug.
 */
export const replaceColors = (img: Image, palette: readonly PaletteEntry[]): void => {
  const map = new Map<number, [number, number, number]>();
  for (const entry of palette) {
    map.set(
      colorKey(entry.color[0], entry.color[1], entry.color[2]),
      [entry.deviceColor[0], entry.deviceColor[1], entry.deviceColor[2]],
    );
  }

  const d = img.data;
  let unmatched = 0;
  for (let i = 0; i < d.length; i += 4) {
    const repl = map.get(colorKey(d[i], d[i + 1], d[i + 2]));
    if (!repl) {
      unmatched++;
      continue;
    }
    d[i]     = repl[0];
    d[i + 1] = repl[1];
    d[i + 2] = repl[2];
  }
  if (unmatched > 0) {
    console.warn(
      `replaceColors: ${unmatched} px did not match any calibrated color`,
    );
  }
};
