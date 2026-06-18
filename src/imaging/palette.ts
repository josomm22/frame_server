// Palette data copied verbatim from epdoptimize (paperlesspaper), Apache-2.0.
// The Spectra 6 calibrations originate with aitjcize/epaper-image-convert.
// See CREDITS.md.
export type RGB = [number, number, number];

export interface PaletteEntry {
  name: string;
  /** Calibrated panel color — what the panel actually displays. Used during dithering. */
  color: RGB;
  /** Device color — pure primary, written to the panel buffer. */
  deviceColor: RGB;
}

// Copied verbatim from epdoptimize default-palettes.json:"aitjcize-spectra6"
// (see vendor/epdoptimize/src/dither/data/default-palettes.json)
export const aitjcizeSpectra6: readonly PaletteEntry[] = [
  { name: 'black',  color: [0x02, 0x02, 0x02], deviceColor: [0x00, 0x00, 0x00] },
  { name: 'white',  color: [0xBE, 0xC8, 0xC8], deviceColor: [0xFF, 0xFF, 0xFF] },
  { name: 'blue',   color: [0x05, 0x40, 0x9E], deviceColor: [0x00, 0x00, 0xFF] },
  { name: 'green',  color: [0x27, 0x66, 0x3C], deviceColor: [0x00, 0xFF, 0x00] },
  { name: 'red',    color: [0x87, 0x13, 0x00], deviceColor: [0xFF, 0x00, 0x00] },
  { name: 'yellow', color: [0xCD, 0xCA, 0x00], deviceColor: [0xFF, 0xFF, 0x00] },
];

// Alternative Spectra 6 calibration added in epdoptimize 1.3.0 ("spectra6-boeber").
// Brighter, more saturated calibrated primaries than aitjcize — worth comparing
// once the physical panel is in hand. Default stays aitjcizeSpectra6 until
// recalibrated against our own panel.
export const spectra6Boeber: readonly PaletteEntry[] = [
  { name: 'black',  color: [0x1F, 0x22, 0x26], deviceColor: [0x00, 0x00, 0x00] },
  { name: 'white',  color: [0xD6, 0xD6, 0xD6], deviceColor: [0xFF, 0xFF, 0xFF] },
  { name: 'blue',   color: [0x41, 0x6C, 0xE1], deviceColor: [0x00, 0x00, 0xFF] },
  { name: 'green',  color: [0x06, 0x74, 0x06], deviceColor: [0x00, 0xFF, 0x00] },
  { name: 'red',    color: [0xEA, 0x48, 0x43], deviceColor: [0xFF, 0x00, 0x00] },
  { name: 'yellow', color: [0xDB, 0xD5, 0x29], deviceColor: [0xFF, 0xFF, 0x00] },
];
