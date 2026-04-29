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
  toneMapping: { mode: 'contrast', exposure: 1, saturation: 1, contrast: 1 },
  dynamicRangeCompression: { mode: 'display', strength: 1 },
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
  const { buffer: packed, unmatched } = packDeviceColors(finalImage, config.palette, format);
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
