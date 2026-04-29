import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { aitjcizeSpectra6 } from '../imaging/palette.js';
import { packDeviceColors, type PackFormat } from '../imaging/pack.js';
import {
  defaultConfig,
  imageToPng,
  processImage,
  type PipelineStage,
} from '../imaging/pipeline.js';
import type { Image } from '../imaging/toneMap.js';

const DEBUG_DIR = path.resolve('data/debug');
const QUEUE_DIR = path.resolve('data/queue');

async function main() {
  const inputPath = process.argv[2];
  if (!inputPath) {
    console.error('Usage: npm run process -- <input.jpg> [--format=nibble4bpp|pack3bpp]');
    process.exit(1);
  }

  const formatArg = process.argv.find((a) => a.startsWith('--format='));
  const format = (formatArg?.split('=')[1] ?? 'nibble4bpp') as PackFormat;
  if (format !== 'nibble4bpp' && format !== 'pack3bpp') {
    console.error(`Unknown --format=${format}. Expected nibble4bpp or pack3bpp.`);
    process.exit(1);
  }

  const stem = path.basename(inputPath, path.extname(inputPath));
  await mkdir(DEBUG_DIR, { recursive: true });
  await mkdir(QUEUE_DIR, { recursive: true });

  const buf = await readFile(inputPath);
  const hash = createHash('sha256').update(buf).digest('hex').slice(0, 16);

  const writeStage = async (stage: PipelineStage, image: Image) => {
    const png = await imageToPng(image);
    const out = path.join(DEBUG_DIR, `${stem}.${stage}.png`);
    await writeFile(out, png);
    console.log(`  ${stage.padEnd(24)} -> ${out}`);
  };

  console.log(`Processing ${inputPath}`);
  const t0 = Date.now();
  const finalImage = await processImage(buf, { ...defaultConfig, onStage: writeStage });
  const tProcess = Date.now() - t0;

  const t1 = Date.now();
  const { buffer: packed, unmatched } = packDeviceColors(finalImage, aitjcizeSpectra6, format);
  const tPack = Date.now() - t1;

  const binPath = path.join(QUEUE_DIR, `${hash}.bin`);
  await writeFile(binPath, packed);

  console.log(`  ${('packed:' + format).padEnd(24)} -> ${binPath} (${packed.length} bytes)`);
  if (unmatched > 0) {
    console.warn(`  WARNING: ${unmatched} pixel(s) could not be mapped to a palette index`);
  }
  console.log(`Done. process=${tProcess}ms pack=${tPack}ms`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
