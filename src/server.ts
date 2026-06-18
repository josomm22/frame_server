import { createReadStream } from 'node:fs';
import { access } from 'node:fs/promises';
import path from 'node:path';
import express, { type Request, type Response } from 'express';
import multer from 'multer';
import qrcode from 'qrcode';
import sharp from 'sharp';
import { getAuthClient } from './auth.js';
import {
  defaultConfig,
  imageToPng,
  processImage,
  processToPacked,
  type PipelineStage,
} from './imaging/pipeline.js';
import type { Image } from './imaging/toneMap.js';
import {
  createSession,
  deleteSession,
  downloadMediaItem,
  getSession as getRemoteSession,
  listMediaItems,
} from './picker.js';
import {
  clearQueue,
  listQueue,
  listQueueWithPreviews,
  pickRandomFromQueue,
  writePreview,
  writeToQueue,
} from './queue.js';
import { homePage } from './views/home.js';
import { pickPage } from './views/pick.js';
import { uploadPage } from './views/upload.js';

const PORT = parseInt(process.env.PORT ?? '8765', 10);
const QUEUE_DIR = path.resolve('data/queue');

type SessionStatus =
  | { phase: 'pending'; pickerUri: string }
  | { phase: 'processing'; total: number; done: number }
  | { phase: 'done'; total: number; processed: number; queueSize: number }
  | { phase: 'error'; message: string };

const sessions = new Map<string, SessionStatus>();
let lastRefreshAt: Date | null = null;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter(_req, file, cb) {
    cb(null, file.mimetype === 'image/jpeg' || file.mimetype === 'image/png');
  },
});

const app = express();

// ── Home ────────────────────────────────────────────────────────────────────

app.get('/', async (_req: Request, res: Response) => {
  const items = await listQueueWithPreviews();
  res.type('html').send(homePage(items, lastRefreshAt));
});

// ── Google Photos picker ─────────────────────────────────────────────────────

app.get('/pick', async (_req: Request, res: Response) => {
  try {
    const auth = await getAuthClient();
    const session = await createSession(auth);
    sessions.set(session.id, { phase: 'pending', pickerUri: session.pickerUri });

    pollAndProcess(session.id).catch((err) => {
      console.error('pollAndProcess error', err);
      sessions.set(session.id, { phase: 'error', message: String(err?.message ?? err) });
    });

    const qrSvg = await qrcode.toString(session.pickerUri, { type: 'svg', margin: 1 });
    res.type('html').send(pickPage(session.id, session.pickerUri, qrSvg));
  } catch (err) {
    console.error(err);
    res.status(500).type('text/plain').send('error: ' + (err as Error).message);
  }
});

app.get('/pick/status', (req: Request, res: Response) => {
  const id = String(req.query.sessionId ?? '');
  const s = sessions.get(id);
  if (!s) {
    res.status(404).json({ phase: 'error', message: 'unknown session' });
    return;
  }
  res.json(s);
});

// ── Preview thumbnail ────────────────────────────────────────────────────────

app.get('/preview/:hash', async (req: Request, res: Response) => {
  const hash = String(req.params.hash).replace(/[^a-f0-9]/gi, '');
  const previewPath = path.join(QUEUE_DIR, `${hash}.preview.png`);
  try {
    await access(previewPath);
  } catch {
    res.status(404).type('text/plain').send('no preview');
    return;
  }
  res.type('image/png');
  createReadStream(previewPath).pipe(res);
});

// ── Simulate (preview without adding to queue) ───────────────────────────────

app.post('/preview/simulate', upload.single('image'), async (req: Request, res: Response) => {
  const file = (req as Request & { file?: Express.Multer.File }).file;
  if (!file) {
    res.status(400).type('text/plain').send('no image uploaded');
    return;
  }
  try {
    const img = await processImage(file.buffer, defaultConfig);
    const fullPng = await imageToPng(img);
    // Return 800×600 — half res is enough to judge dithering quality
    const previewPng = await sharp(fullPng)
      .resize(800, 600, { fit: 'fill' })
      .png()
      .toBuffer();
    res.type('image/png').send(previewPng);
  } catch (err) {
    console.error('/preview/simulate error', err);
    res.status(500).type('text/plain').send((err as Error).message);
  }
});

// ── Upload (add to queue) ────────────────────────────────────────────────────

// Standalone, guest-friendly upload page (no admin/queue controls).
app.get('/upload', (_req: Request, res: Response) => {
  res.type('html').send(uploadPage());
});

app.post('/upload', upload.single('image'), async (req: Request, res: Response) => {
  const file = (req as Request & { file?: Express.Multer.File }).file;
  if (!file) {
    res.status(400).type('text/plain').send('no image uploaded');
    return;
  }
  try {
    const { result, previewPng } = await processAndPreview(file.buffer);
    await writeToQueue(result.hash, result.packed);
    await writePreview(result.hash, previewPng);
    console.log(`/upload: added ${result.hash} (${result.unmatched} unmatched px)`);
    res.status(200).type('text/plain').send('ok');
  } catch (err) {
    console.error('/upload error', err);
    res.status(500).type('text/plain').send((err as Error).message);
  }
});

// ── ESP32 endpoint ───────────────────────────────────────────────────────────

app.get('/next.bin', async (req: Request, res: Response) => {
  const item = await pickRandomFromQueue();
  if (!item) {
    res.status(404).type('text/plain').send('queue empty');
    return;
  }
  console.log(`/next.bin -> ${item.path} (${item.bytes.length} bytes) for ${req.ip}`);
  res.type('application/octet-stream').send(item.bytes);
});

// ── Admin ────────────────────────────────────────────────────────────────────

app.post('/admin/clear', async (_req: Request, res: Response) => {
  const removed = await clearQueue();
  console.log(`/admin/clear: removed ${removed} item(s)`);
  res.redirect('/');
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`eink-frame server listening on http://0.0.0.0:${PORT}`);
});

// ── Helpers ──────────────────────────────────────────────────────────────────

async function processAndPreview(
  buf: Buffer,
): Promise<{ result: Awaited<ReturnType<typeof processToPacked>>; previewPng: Buffer }> {
  let capturedPng: Buffer | null = null;

  const onStage = async (stage: PipelineStage, img: Image) => {
    if (stage === 'deviceColors') {
      const fullPng = await imageToPng(img);
      capturedPng = await sharp(fullPng)
        .resize(400, 300, { fit: 'fill' })
        .png()
        .toBuffer();
    }
  };

  const result = await processToPacked(buf, {
    config: { ...defaultConfig, onStage },
  });

  return { result, previewPng: capturedPng! };
}

async function pollAndProcess(sessionId: string): Promise<void> {
  const auth = await getAuthClient();
  let session = await getRemoteSession(auth, sessionId);
  while (!session.mediaItemsSet) {
    await new Promise((r) => setTimeout(r, 4000));
    session = await getRemoteSession(auth, sessionId);
  }

  const items = await listMediaItems(auth, sessionId);
  const total = items.length;
  sessions.set(sessionId, { phase: 'processing', total, done: 0 });

  let processed = 0;
  for (const item of items) {
    try {
      const buf = await downloadMediaItem(auth, item, 1600, 1200);
      const { result, previewPng } = await processAndPreview(buf);
      await writeToQueue(result.hash, result.packed);
      await writePreview(result.hash, previewPng);
      processed++;
    } catch (err) {
      console.error(`failed processing ${item.id}:`, err);
    }
    sessions.set(sessionId, { phase: 'processing', total, done: processed });
  }

  await deleteSession(auth, sessionId).catch(() => {});
  const queue = await listQueue();
  lastRefreshAt = new Date();
  sessions.set(sessionId, { phase: 'done', total, processed, queueSize: queue.length });
}
