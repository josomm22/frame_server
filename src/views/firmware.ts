import type { FirmwareRelease } from '../device.js';
import { layout } from './layout.js';

const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export interface FirmwareMessage {
  kind: 'success' | 'error';
  text: string;
}

export const firmwarePage = (release: FirmwareRelease | null, message?: FirmwareMessage): string => {
  const current = release
    ? `<p>Published version: <strong class="mono">${escapeHtml(release.version)}</strong>
       <span class="meta">(${(release.size / 1024).toFixed(0)} KiB)</span></p>`
    : `<p class="meta">No firmware published — devices skip the OTA check.</p>`;

  const banner = message
    ? `<p class="banner banner-${message.kind}">${escapeHtml(message.text)}</p>`
    : '';

  return layout(
    'Firmware',
    `
<div class="card">
  <h2>OTA firmware</h2>
  ${banner}
  ${current}
  <p class="notice"><strong>The version entered below must exactly match the
  <code>FIRMWARE_VERSION</code> compiled into the uploaded binary</strong>
  (built from <code>seeed_eink_board</code> with <code>uv run pio run</code>,
  binary at <code>.pio/build/seeed_xiao_esp32s3/firmware.bin</code>).
  If they don't match, devices detect the mismatch after one flash and stop
  retrying — the release is effectively broken.</p>
  <p class="meta">Devices update whenever the published version differs from the
  one they run (no ordering) — publishing an older version rolls them back.</p>
  <form method="POST" action="/firmware" enctype="multipart/form-data" class="upload-form">
    <div class="file-row">
      <label for="fw-version">Version</label>
      <input type="text" id="fw-version" name="version" required
             pattern="[0-9A-Za-z._-]{1,32}" maxlength="32"
             placeholder="e.g. 1.4.0" autocomplete="off">
    </div>
    <div class="file-row">
      <input type="file" name="firmware" accept=".bin,application/octet-stream" required>
    </div>
    <div class="file-row">
      <button class="btn btn-primary" type="submit">Publish release</button>
    </div>
  </form>
</div>`,
  );
};
