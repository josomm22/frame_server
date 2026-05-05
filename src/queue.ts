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

export const writePreview = async (hash: string, pngBuf: Buffer): Promise<void> => {
  await ensureQueueDir();
  await writeFile(path.join(QUEUE_DIR, `${hash}.preview.png`), pngBuf);
};

export interface QueueEntry {
  hash: string;
  hasPreview: boolean;
}

export const listQueue = async (): Promise<string[]> => {
  await ensureQueueDir();
  const entries = await readdir(QUEUE_DIR);
  return entries.filter((f) => f.endsWith('.bin')).map((f) => path.join(QUEUE_DIR, f));
};

export const listQueueWithPreviews = async (): Promise<QueueEntry[]> => {
  await ensureQueueDir();
  const entries = await readdir(QUEUE_DIR);
  const set = new Set(entries);
  return entries
    .filter((f) => f.endsWith('.bin'))
    .map((f) => {
      const hash = f.slice(0, -4);
      return { hash, hasPreview: set.has(`${hash}.preview.png`) };
    });
};

export const pickRandomFromQueue = async (): Promise<{ path: string; bytes: Buffer } | null> => {
  const items = await listQueue();
  if (items.length === 0) return null;
  const choice = items[Math.floor(Math.random() * items.length)];
  return { path: choice, bytes: await readFile(choice) };
};

export const clearQueue = async (): Promise<number> => {
  await ensureQueueDir();
  const entries = await readdir(QUEUE_DIR);
  const toDelete = entries.filter((f) => f.endsWith('.bin') || f.endsWith('.preview.png'));
  for (const f of toDelete) await rm(path.join(QUEUE_DIR, f), { force: true });
  return toDelete.filter((f) => f.endsWith('.bin')).length;
};
