import { layout } from './layout.js';

export const uploadPage = (): string =>
  layout(
    'Add a photo',
    `
<div class="card">
  <h2>Add a photo to the frame</h2>
  <p class="meta">Pick a JPEG or PNG from your phone, preview how it'll look on the
  e-ink panel, then add it to the frame.</p>
  <div class="upload-form">
    <div class="file-row">
      <input type="file" id="file-input" accept="image/jpeg,image/png">
      <button class="btn" id="btn-preview" type="button" disabled>Preview</button>
      <button class="btn btn-primary" id="btn-upload" type="button" disabled>Add to frame</button>
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
    // Reset for another upload instead of leaving the guest on the admin page.
    fileInput.value = '';
    simulateResult.style.display = 'none';
    setStatus('✓ Added to the frame! Pick another photo to add more.');
  } catch (e) {
    setStatus('Error: ' + e.message);
    btnUpload.disabled = false;
    btnPreview.disabled = false;
  }
});
</script>`,
  );
