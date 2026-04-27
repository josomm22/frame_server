import type { RGB } from './palette.js';

export type Lab = [number, number, number];

export const clamp = (v: number, lo: number, hi: number): number =>
  v < lo ? lo : v > hi ? hi : v;

export const clampByte = (v: number): number => {
  if (!Number.isFinite(v)) return 0;
  return Math.round(clamp(v, 0, 255));
};

export const luma709 = (r: number, g: number, b: number): number =>
  0.2126 * r + 0.7152 * g + 0.0722 * b;

const rgbToXyz = (r: number, g: number, b: number): RGB => {
  let rn = r / 255;
  let gn = g / 255;
  let bn = b / 255;
  rn = rn > 0.04045 ? Math.pow((rn + 0.055) / 1.055, 2.4) : rn / 12.92;
  gn = gn > 0.04045 ? Math.pow((gn + 0.055) / 1.055, 2.4) : gn / 12.92;
  bn = bn > 0.04045 ? Math.pow((bn + 0.055) / 1.055, 2.4) : bn / 12.92;
  return [
    (rn * 0.4124564 + gn * 0.3575761 + bn * 0.1804375) * 100,
    (rn * 0.2126729 + gn * 0.7151522 + bn * 0.072175) * 100,
    (rn * 0.0193339 + gn * 0.119192 + bn * 0.9503041) * 100,
  ];
};

const xyzToLab = (x: number, y: number, z: number): Lab => {
  // D65 illuminant
  let xn = x / 95.047;
  let yn = y / 100;
  let zn = z / 108.883;
  xn = xn > 0.008856 ? Math.pow(xn, 1 / 3) : 7.787 * xn + 16 / 116;
  yn = yn > 0.008856 ? Math.pow(yn, 1 / 3) : 7.787 * yn + 16 / 116;
  zn = zn > 0.008856 ? Math.pow(zn, 1 / 3) : 7.787 * zn + 16 / 116;
  return [116 * yn - 16, 500 * (xn - yn), 200 * (yn - zn)];
};

export const rgbToLab = (r: number, g: number, b: number): Lab => {
  const [x, y, z] = rgbToXyz(r, g, b);
  return xyzToLab(x, y, z);
};

const labToXyz = (l: number, a: number, b: number): RGB => {
  let y = (l + 16) / 116;
  let x = a / 500 + y;
  let z = y - b / 200;
  x = x > 0.206897 ? Math.pow(x, 3) : (x - 16 / 116) / 7.787;
  y = y > 0.206897 ? Math.pow(y, 3) : (y - 16 / 116) / 7.787;
  z = z > 0.206897 ? Math.pow(z, 3) : (z - 16 / 116) / 7.787;
  return [x * 95.047, y * 100, z * 108.883];
};

const xyzToRgb = (x: number, y: number, z: number): RGB => {
  const xn = x / 100;
  const yn = y / 100;
  const zn = z / 100;
  let r = xn *  3.2404542 + yn * -1.5371385 + zn * -0.4985314;
  let g = xn * -0.969266  + yn *  1.8760108 + zn *  0.041556;
  let b = xn *  0.0556434 + yn * -0.2040259 + zn *  1.0572252;
  r = r > 0.0031308 ? 1.055 * Math.pow(r, 1 / 2.4) - 0.055 : 12.92 * r;
  g = g > 0.0031308 ? 1.055 * Math.pow(g, 1 / 2.4) - 0.055 : 12.92 * g;
  b = b > 0.0031308 ? 1.055 * Math.pow(b, 1 / 2.4) - 0.055 : 12.92 * b;
  return [clampByte(r * 255), clampByte(g * 255), clampByte(b * 255)];
};

export const labToRgb = (l: number, a: number, b: number): RGB => {
  const [x, y, z] = labToXyz(l, a, b);
  return xyzToRgb(x, y, z);
};

export const deltaE = (lab1: Lab, lab2: Lab): number => {
  const dl = lab1[0] - lab2[0];
  const da = lab1[1] - lab2[1];
  const db = lab1[2] - lab2[2];
  return Math.sqrt(dl * dl + da * da + db * db);
};
