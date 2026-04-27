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
