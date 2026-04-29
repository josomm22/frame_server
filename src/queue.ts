import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const QUEUE_DIR = path.resolve('data/queue');

const ensureQueueDir = () => mkdir(QUEUE_DIR, { recursive: true });

export const writeToQueue = async (hash: string, buf: Buffer): Promise<string> => {
  await ensureQueueDir();
  const out = path.join(QUEUE_DIR, `${hash}.bin`);
  await writeFile(out, buf);
  return out;
};

export const listQueue = async (): Promise<string[]> => {
  await ensureQueueDir();
  const entries = await readdir(QUEUE_DIR);
  return entries.filter((f) => f.endsWith('.bin')).map((f) => path.join(QUEUE_DIR, f));
};

export const pickRandomFromQueue = async (): Promise<{ path: string; bytes: Buffer } | null> => {
  const items = await listQueue();
  if (items.length === 0) return null;
  const choice = items[Math.floor(Math.random() * items.length)];
  return { path: choice, bytes: await readFile(choice) };
};

export const clearQueue = async (): Promise<number> => {
  const items = await listQueue();
  for (const f of items) await rm(f, { force: true });
  return items.length;
};
