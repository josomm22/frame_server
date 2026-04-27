import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  defaultConfig,
  imageToPng,
  processImage,
  type PipelineStage,
} from '../imaging/pipeline.js';
import type { Image } from '../imaging/toneMap.js';

const DEBUG_DIR = path.resolve('data/debug');

async function main() {
  const inputPath = process.argv[2];
  if (!inputPath) {
    console.error('Usage: npm run process -- <input.jpg>');
    process.exit(1);
  }

  const stem = path.basename(inputPath, path.extname(inputPath));
  await mkdir(DEBUG_DIR, { recursive: true });

  const buf = await readFile(inputPath);

  const writeStage = async (stage: PipelineStage, image: Image) => {
    const png = await imageToPng(image);
    const out = path.join(DEBUG_DIR, `${stem}.${stage}.png`);
    await writeFile(out, png);
    console.log(`  ${stage.padEnd(24)} -> ${out}`);
  };

  console.log(`Processing ${inputPath}`);
  const t0 = Date.now();
  await processImage(buf, { ...defaultConfig, onStage: writeStage });
  console.log(`Done in ${Date.now() - t0} ms.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
