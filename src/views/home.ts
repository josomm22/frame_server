import type { DeviceTelemetry } from '../device.js';
import { layout } from './layout.js';

export interface QueueItem {
  hash: string;
  hasPreview: boolean;
}

const timeAgo = (d: Date): string => {
  const secs = Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000));
  if (secs < 60) return 'just now';
  if (secs < 3600) return `${Math.floor(secs / 60)} min ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)} h ago`;
  return `${Math.floor(secs / 86400)} d ago`;
};

// MAC and firmware version are validated to safe charsets before they are
// stored (see recordDeviceTelemetry), so they can be interpolated directly.
const devicesSection = (devices: DeviceTelemetry[]): string => {
  const rows =
    devices.length === 0
      ? ''
      : `<table>
      <tr><th>Device</th><th>Firmware</th><th>Battery</th><th>Last seen</th></tr>
      ${devices
        .map((d) => {
          const mac = d.mac.match(/.{2}/g)!.join(':');
          const battery =
            d.batteryPercent === null
              ? '—'
              : `${d.batteryPercent}%${d.batteryVoltage === null ? '' : ` (${d.batteryVoltage.toFixed(2)} V)`}`;
          return `<tr>
        <td class="mono">${mac}</td>
        <td class="mono">${d.firmwareVersion ?? '—'}</td>
        <td>${battery}</td>
        <td>${timeAgo(d.lastSeen)}</td>
      </tr>`;
        })
        .join('')}
    </table>`;

  return `
<div class="card">
  <h2>Devices</h2>
  ${
    devices.length === 0
      ? `<p class="meta">No devices have checked in since the server started.</p>`
      : rows
  }
</div>`;
};

export const homePage = (
  items: QueueItem[],
  lastRefreshAt: Date | null,
  devices: DeviceTelemetry[],
): string => {
  const last = lastRefreshAt ? lastRefreshAt.toLocaleString() : '(never)';
  const count = items.length;

  const gallery =
    count === 0
      ? `<p class="meta" style="margin-top:.75rem">Queue is empty — add photos via Google Photos or upload below.</p>`
      : `<div class="gallery">${items
          .map(
            ({ hash, hasPreview }) => `
        <div class="frame-card">
          ${
            hasPreview
              ? `<img src="/preview/${hash}" alt="frame ${hash.slice(0, 8)}" loading="lazy">`
              : `<div class="placeholder">no preview</div>`
          }
          <div class="frame-card-meta">${hash.slice(0, 12)}</div>
        </div>`,
          )
          .join('')}</div>`;

  return layout(
    'Home',
    `
<div class="card">
  <h2>Queue</h2>
  <p class="meta">${count} frame${count === 1 ? '' : 's'} &nbsp;·&nbsp; Last refresh: ${last}</p>
  <div class="btn-row">
    <a href="/pick" class="btn btn-primary">Refresh from Google Photos</a>
    <form method="POST" action="/admin/clear" onsubmit="return confirm('Clear the entire queue?')" style="margin:0">
      <button class="btn btn-danger">Clear queue</button>
    </form>
  </div>
  ${gallery}
</div>

${devicesSection(devices)}

<div class="card">
  <h2>Upload a photo</h2>
  <p class="meta">Add a JPEG or PNG directly — no Google Photos needed.</p>
  <div class="upload-form">
    <div class="file-row">
      <input type="file" id="file-input" accept="image/jpeg,image/png">
      <button class="btn" id="btn-preview" type="button" disabled>Preview</button>
      <button class="btn btn-primary" id="btn-upload" type="button" disabled>Add to queue</button>
    </div>
    <span id="upload-status"></span>
    <div class="simulate-result" id="simulate-result">
      <img id="simulate-img" alt="Dithered preview">
      <div class="sim-label">E-ink simulation (1600×1200 → 800×600, 6-color dithered)</div>
    </div>
  </div>
</div>

<script>
const fileInput = document.getElementById('file-input');
const btnPreview = document.getElementById('btn-preview');
const btnUpload = document.getElementById('btn-upload');
const simulateResult = document.getElementById('simulate-result');
const simulateImg = document.getElementById('simulate-img');
const uploadStatus = document.getElementById('upload-status');

function setStatus(msg) {
  uploadStatus.innerHTML = msg;
}

fileInput.addEventListener('change', () => {
  const hasFile = !!fileInput.files?.[0];
  btnPreview.disabled = !hasFile;
  btnUpload.disabled = !hasFile;
  simulateResult.style.display = 'none';
  setStatus('');
});

btnPreview.addEventListener('click', async () => {
  const file = fileInput.files?.[0];
  if (!file) return;
  btnPreview.disabled = true;
  setStatus('<span class="spinner"></span> Running pipeline…');
  try {
    const fd = new FormData();
    fd.append('image', file);
    const res = await fetch('/preview/simulate', { method: 'POST', body: fd });
    if (!res.ok) throw new Error(await res.text());
    const blob = await res.blob();
    simulateImg.src = URL.createObjectURL(blob);
    simulateResult.style.display = 'block';
    setStatus('');
  } catch (e) {
    setStatus('Error: ' + e.message);
  }
  btnPreview.disabled = false;
});

btnUpload.addEventListener('click', async () => {
  const file = fileInput.files?.[0];
  if (!file) return;
  btnUpload.disabled = true;
  btnPreview.disabled = true;
  setStatus('<span class="spinner"></span> Processing…');
  try {
    const fd = new FormData();
    fd.append('image', file);
    const res = await fetch('/upload', { method: 'POST', body: fd });
    if (!res.ok) throw new Error(await res.text());
    window.location.href = '/';
  } catch (e) {
    setStatus('Error: ' + e.message);
    btnUpload.disabled = false;
    btnPreview.disabled = false;
  }
});
</script>`,
  );
};
