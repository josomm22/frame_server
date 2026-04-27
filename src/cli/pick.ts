import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { getAuthClient } from '../auth.js';
import {
  createSession,
  deleteSession,
  downloadMediaItem,
  getSession,
  listMediaItems,
} from '../picker.js';

const CACHE_DIR = path.resolve('data/cache');

function parseDuration(d: string | undefined, fallbackMs: number): number {
  if (!d) return fallbackMs;
  const m = d.match(/^(\d+(?:\.\d+)?)s$/);
  return m ? Math.round(parseFloat(m[1]) * 1000) : fallbackMs;
}

async function main() {
  const auth = await getAuthClient();
  console.log('Authenticated.');

  const session = await createSession(auth);
  console.log('\n=== Open this on your phone (Google Photos app installed): ===');
  console.log(session.pickerUri);
  console.log('\nWaiting for you to pick photos...');

  const interval = parseDuration(session.pollingConfig?.pollInterval, 5000);
  let current = session;
  while (!current.mediaItemsSet) {
    await new Promise((r) => setTimeout(r, interval));
    current = await getSession(auth, session.id);
    process.stdout.write('.');
  }
  console.log('\nPicker session complete.');

  const items = await listMediaItems(auth, session.id);
  console.log(`Got ${items.length} item(s).`);

  await mkdir(CACHE_DIR, { recursive: true });
  for (const item of items) {
    const buf = await downloadMediaItem(auth, item, 1600, 1200);
    const filename = item.mediaFile.filename ?? `${item.id}.jpg`;
    const safe = filename.replace(/[^\w.\-]/g, '_');
    const out = path.join(CACHE_DIR, safe);
    await writeFile(out, buf);
    console.log(`  -> ${out} (${buf.length} bytes)`);
  }

  await deleteSession(auth, session.id);
  console.log('Session deleted. Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
