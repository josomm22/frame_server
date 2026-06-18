import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { aitjcizeSpectra6, type PaletteEntry } from './palette.js';
import {
  applyDynamicRangeCompression,
  applyToneMapping,
  type DynamicRangeCompressionOptions,
  type Image,
  type ToneMappingOptions,
} from './toneMap.js';
import {
  errorDiffusionDither,
  floydSteinberg,
  type ErrorDiffusionOptions,
} from './dither.js';
import { replaceColors } from './replaceColors.js';
import { packDeviceColors, type PackFormat } from './pack.js';

export type PipelineStage =
  | 'resized'
  | 'toneMapped'
  | 'dynamicRangeCompressed'
  | 'dithered'       // calibrated colors only
  | 'deviceColors';  // device colors (final)

export interface PipelineConfig {
  width: number;
  height: number;
  palette: readonly PaletteEntry[];
  toneMapping?: ToneMappingOptions;
  dynamicRangeCompression?: DynamicRangeCompressionOptions;
  diffusion?: ErrorDiffusionOptions;
  /** Optional hook called after each stage with a fresh copy of the image. */
  onStage?: (stage: PipelineStage, image: Image) => Promise<void> | void;
}

export const defaultConfig: Omit<PipelineConfig, 'onStage'> = {
  width: 1600,
  height: 1200,
  palette: aitjcizeSpectra6,
  // Six-colour dithering desaturates and the panel can't reach bright white, so
  // pre-boost saturation/contrast and lift exposure to counter the "dark & dull"
  // look. Tune these against /preview/simulate per panel.
  toneMapping: { mode: 'contrast', exposure: 1.06, saturation: 1.35, contrast: 1.08 },
  // strength 1 crushed highlights down to the dim calibrated white (L*≈79)
  // before dithering; 0.6 keeps brights closer to true white.
  dynamicRangeCompression: { mode: 'display', strength: 0.6 },
  diffusion: { matrix: floydSteinberg, serpentine: true, colorMatching: 'lab' },
};

const cloneImage = (img: Image): Image => ({
  width: img.width,
  height: img.height,
  data: new Uint8ClampedArray(img.data),
});

export const processImage = async (
  input: Buffer,
  cfg: PipelineConfig = defaultConfig,
): Promise<Image> => {
  const { data, info } = await sharp(input)
    .resize(cfg.width, cfg.height, { fit: 'cover', position: 'attention' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const img: Image = {
    width: info.width,
    height: info.height,
    data: new Uint8ClampedArray(data.buffer, data.byteOffset, data.length),
  };
  if (cfg.onStage) await cfg.onStage('resized', cloneImage(img));

  applyToneMapping(img, cfg.toneMapping);
  if (cfg.onStage) await cfg.onStage('toneMapped', cloneImage(img));

  applyDynamicRangeCompression(
    img,
    cfg.dynamicRangeCompression,
    cfg.palette.map((p) => [p.color[0], p.color[1], p.color[2]]),
  );
  if (cfg.onStage) await cfg.onStage('dynamicRangeCompressed', cloneImage(img));

  errorDiffusionDither(img, cfg.palette, cfg.diffusion);
  if (cfg.onStage) await cfg.onStage('dithered', cloneImage(img));

  replaceColors(img, cfg.palette);
  if (cfg.onStage) await cfg.onStage('deviceColors', cloneImage(img));

  return img;
};

/**
 * Panel buffer orientation.
 *
 * The firmware copies `/next.bin` byte-for-byte into the panel framebuffer and
 * the GDEP133C02 driver walks it as 1200 px wide (600 bytes/row) × 1600 px tall
 * (`EPD_WIDTH`/`EPD_HEIGHT` in src/eink/GDEP133C02.c). The pipeline produces an
 * upright 1600×1200 landscape image (so on-screen previews look natural), so the
 * packed buffer MUST be rotated 90° into the driver's native 1200×1600 portrait
 * layout — otherwise the row stride is wrong and the panel shows garbage.
 *
 * Only 90 and 270 swap width↔height to match the driver geometry; pick whichever
 * makes photos upright on the physical panel, and toggle PANEL_FLIP if the image
 * comes out mirrored. (This is the server-side counterpart of the firmware's
 * "Color remap orientation" / mirrored-image caveat.)
 */
export const PANEL_ROTATION: 90 | 270 = 270;
export const PANEL_FLIP = false;

/**
 * Rotate (and optionally mirror) the device-color image into the panel's native
 * orientation. Rotation is by a multiple of 90°, so sharp does an exact pixel
 * move with no resampling — device colors are preserved and still pack to exact
 * palette indices.
 */
export const rotateForPanel = async (img: Image): Promise<Image> => {
  let pipe = sharp(
    Buffer.from(img.data.buffer, img.data.byteOffset, img.data.length),
    { raw: { width: img.width, height: img.height, channels: 4 } },
  ).rotate(PANEL_ROTATION);
  if (PANEL_FLIP) pipe = pipe.flop();
  const { data, info } = await pipe.raw().toBuffer({ resolveWithObject: true });
  return {
    width: info.width,
    height: info.height,
    data: new Uint8ClampedArray(data.buffer, data.byteOffset, data.length),
  };
};

export interface ProcessToPackedOptions {
  config?: PipelineConfig;
  format?: PackFormat;
}

export interface ProcessToPackedResult {
  packed: Buffer;
  format: PackFormat;
  /** 16-hex sha256 prefix of the input bytes — used as queue filename. */
  hash: string;
  unmatched: number;
}

export const processToPacked = async (
  input: Buffer,
  opts: ProcessToPackedOptions = {},
): Promise<ProcessToPackedResult> => {
  const config = opts.config ?? defaultConfig;
  const format: PackFormat = opts.format ?? 'nibble4bpp';
  const finalImage = await processImage(input, config);
  // Pack in the panel's native orientation (1200×1600), not the upright
  // landscape the pipeline renders for previews. See PANEL_ROTATION.
  const panelImage = await rotateForPanel(finalImage);
  const { buffer: packed, unmatched } = packDeviceColors(panelImage, config.palette, format);
  const hash = createHash('sha256').update(input).digest('hex').slice(0, 16);
  return { packed, format, hash, unmatched };
};

export const imageToPng = async (img: Image): Promise<Buffer> => {
  return sharp(
    Buffer.from(img.data.buffer, img.data.byteOffset, img.data.length),
    { raw: { width: img.width, height: img.height, channels: 4 } },
  )
    .png()
    .toBuffer();
};
