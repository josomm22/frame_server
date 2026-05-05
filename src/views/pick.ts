import { layout } from './layout.js';

export const pickPage = (sessionId: string, pickerUri: string, qrSvg: string): string =>
  layout(
    'Pick photos',
    `
<div class="card">
  <h2>Pick photos in Google Photos</h2>
  <p class="meta">Scan the QR code with your phone, or tap the link below to open the Google Photos picker.</p>
  <div class="qr-wrap">${qrSvg}</div>
  <p class="picker-link"><a href="${pickerUri}">${pickerUri}</a></p>
  <div id="poll-status"><span class="spinner"></span> Waiting for selection…</div>
  <div class="btn-row" style="margin-top:1rem">
    <a href="/" class="btn">← Back</a>
  </div>
</div>

<script>
const sid = ${JSON.stringify(sessionId)};
async function poll() {
  try {
    const r = await fetch('/pick/status?sessionId=' + encodeURIComponent(sid));
    const s = await r.json();
    const el = document.getElementById('poll-status');
    if (s.phase === 'pending') {
      el.innerHTML = '<span class="spinner"></span> Waiting for selection…';
    } else if (s.phase === 'processing') {
      el.innerHTML = '<span class="spinner"></span> Processing ' + s.done + ' / ' + s.total + '…';
    } else if (s.phase === 'done') {
      el.textContent = '✓ Done — ' + s.processed + ' photo(s) added. Queue: ' + s.queueSize + ' frames.';
      setTimeout(() => { window.location.href = '/'; }, 2000);
      return;
    } else if (s.phase === 'error') {
      el.textContent = '✗ Error: ' + s.message;
      return;
    }
  } catch (_) { /* keep polling on network error */ }
  setTimeout(poll, 2000);
}
poll();
</script>`,
  );
