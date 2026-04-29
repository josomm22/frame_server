import express, { type Request, type Response } from 'express';
import qrcode from 'qrcode';
import { getAuthClient } from './auth.js';
import {
  createSession,
  deleteSession,
  downloadMediaItem,
  getSession as getRemoteSession,
  listMediaItems,
} from './picker.js';
import { processToPacked } from './imaging/pipeline.js';
import { clearQueue, listQueue, pickRandomFromQueue, writeToQueue } from './queue.js';

const PORT = parseInt(process.env.PORT ?? '8765', 10);

type SessionStatus =
  | { phase: 'pending'; pickerUri: string }
  | { phase: 'processing'; total: number; done: number }
  | { phase: 'done'; total: number; processed: number; queueSize: number }
  | { phase: 'error'; message: string };

const sessions = new Map<string, SessionStatus>();
let lastRefreshAt: Date | null = null;

const app = express();

app.get('/', async (_req: Request, res: Response) => {
  const items = await listQueue();
  const last = lastRefreshAt ? lastRefreshAt.toLocaleString() : '(never)';
  res.type('html').send(`<!doctype html>
<html><head><title>eink-frame</title>
<meta name=viewport content="width=device-width,initial-scale=1">
<style>body{font-family:system-ui,sans-serif;max-width:36em;margin:2em auto;padding:0 1em;color:#222}
.card{border:1px solid #ccc;padding:1em 1.25em;border-radius:6px;margin-bottom:1em}
button{padding:.5em 1em;font-size:1em;cursor:pointer}</style>
</head><body>
<h1>eink-frame</h1>
<div class=card>
  <p>Queue size: <strong>${items.length}</strong></p>
  <p>Last refresh: ${last}</p>
  <p><a href=/pick><button>Refresh from Google Photos</button></a></p>
</div>
<form method=POST action=/admin/clear onsubmit="return confirm('Clear the entire queue?')">
  <button>Clear queue</button>
</form>
</body></html>`);
});

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

    res.type('html').send(`<!doctype html>
<html><head><title>Pick photos</title>
<meta name=viewport content="width=device-width,initial-scale=1">
<style>body{font-family:system-ui,sans-serif;max-width:36em;margin:2em auto;padding:0 1em;color:#222}
svg{max-width:18em;display:block;margin:1em 0}
a{word-break:break-all}
#status{margin-top:1em;padding:.75em;background:#f4f4f4;border-radius:4px}</style>
</head><body>
<h1>Pick photos</h1>
<p>Scan with your phone or open the link below:</p>
${qrSvg}
<p><a href="${session.pickerUri}">${session.pickerUri}</a></p>
<div id=status>Waiting for selection...</div>
<p><a href=/>back</a></p>
<script>
const sid = ${JSON.stringify(session.id)};
async function poll() {
  try {
    const r = await fetch('/pick/status?sessionId=' + encodeURIComponent(sid));
    const s = await r.json();
    const el = document.getElementById('status');
    if (s.phase === 'pending') { el.textContent = 'Waiting for selection...'; }
    else if (s.phase === 'processing') { el.textContent = 'Processing ' + s.done + ' / ' + s.total + '...'; }
    else if (s.phase === 'done') { el.textContent = 'Done. ' + s.processed + ' photo(s) added. Queue now: ' + s.queueSize; return; }
    else if (s.phase === 'error') { el.textContent = 'Error: ' + s.message; return; }
  } catch (e) { /* keep polling */ }
  setTimeout(poll, 2000);
}
poll();
</script>
</body></html>`);
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

app.get('/next.bin', async (req: Request, res: Response) => {
  const item = await pickRandomFromQueue();
  if (!item) {
    res.status(404).type('text/plain').send('queue empty');
    return;
  }
  console.log(`/next.bin -> ${item.path} (${item.bytes.length} bytes) for ${req.ip}`);
  res.type('application/octet-stream').send(item.bytes);
});

app.post('/admin/clear', async (_req: Request, res: Response) => {
  const removed = await clearQueue();
  console.log(`/admin/clear: removed ${removed} item(s)`);
  res.redirect('/');
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`eink-frame server listening on http://0.0.0.0:${PORT}`);
});

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
      const result = await processToPacked(buf);
      await writeToQueue(result.hash, result.packed);
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
