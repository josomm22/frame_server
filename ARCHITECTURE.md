# eink-frame — Architecture & Handoff

A digital photo frame system: Google Photos → Zimaboard 2 server → custom-firmware
e-paper frame over LAN.

This document captures all decisions made before code was written, so future work
doesn't re-litigate them.

## Hardware

**Display side**

- Frame: Seeed Studio XIAO ePaper DIY Kit EE02
- SoC: ESP32-S3 Plus (XIAO ESP32-S3 Plus module, 8 MB PSRAM)
- Panel: 13.3" E Ink Spectra 6, 1600 × 1200, 6 colors (black, white, yellow, red, green, blue)
- Interface: SPI to panel via 60-pin FFC
- Refresh: ~12 seconds, no partial refresh (intrinsic to Spectra 6)
- Firmware: ESP-IDF (custom, separate project — out of scope for the server repo)

**Server side**

- Zimaboard 2 (Intel N150 quad-core "Twin Lake", x86_64, 8 or 16 GB LPDDR5,
  32/64 GB eMMC, fanless)
- ZimaOS (Debian-based, an evolution of CasaOS) pre-installed
- Container runtime: modern **Docker** engine (ZimaOS ships Docker + compose;
  apps also installable from the ZimaOS app store)
- Available headroom: ample — 8 GB minimum, vs. the ~150 MB the Node container
  needs at idle

## High-level flow

```
[User on phone]                    [Zimaboard 2]                     [EE02 frame]
      |                                   |                                |
      |-- visits http://zimaboard:8765 -->|                                |
      |<--- "Refresh" page + QR code -----|                                |
      |                                   |                                |
      |--- opens pickerUri in Google      |                                |
      |    Photos app, picks photos       |                                |
      |                                   |                                |
      |                            [Node container]                        |
      |                            polls picker session                    |
      |                            downloads bytes                         |
      |                            sharp: resize + smart crop              |
      |                            epdoptimize: tone map + dither          |
      |                            packs to 3bpp framebuffer               |
      |                            saves to /app/data/queue/*.bin          |
      |                                   |                                |
      |                                   |<--- GET /next.bin -------------|
      |                                   |     (random pick from queue)   |
      |                                   |---- 720KB octet-stream ------->|
      |                                   |                                |
      |                                   |                          DMA → panel
      |                                   |                          deep sleep ~24h
```

Key property: **the user-driven picker is the only way new photos enter the
system.** There is no watched-album sync — the Google Photos Library API
deprecated that capability on March 31, 2025. Refreshing the queue is a
deliberate human action triggered every few weeks from a phone.

## Decisions and rationale

### Why Google Photos Picker API (not Library API, not shared link scraping, not self-hosted)

- Library API no longer permits reading photos the app didn't upload itself
  (deprecated 2025-03-31).
- Shared-link scraping works but is fragile and arguably against ToS.
- Self-hosting (Immich, PhotoPrism) was considered but rejected — the user
  wants Google Photos as the canonical source.
- Picker API is the official, supported path. Trade-off: manual selection
  every refresh; no automatic ongoing sync.

### Why Node.js (not Python)

- Stack is OAuth + HTTP + image processing + small web UI. Both ecosystems handle
  this well.
- `googleapis` npm package is well-maintained.
- One language across server + any future browser-side tooling.
- The image-processing piece (epdoptimize) is itself a Node/TypeScript library
  that the user found and validated visually. Using it directly avoids a
  cross-language port.

### Why Docker (not a host Node install)

- A container pins its own Node version, decoupled from whatever ZimaOS ships,
  so the runtime doesn't drift with host OS updates.
- `node-canvas` historically required system libraries (Cairo, Pango, libjpeg,
  libgif, librsvg); bundling them in the image keeps the host clean. (The
  in-house epdoptimize port drops node-canvas entirely — see below — but the
  container isolation is still worth keeping.)
- ZimaOS ships a modern Docker engine with compose, volume mounts, and restart
  policies, and can also manage the container from its app store UI.
- Reproducible: the whole server rebuilds from the Dockerfile, so the box is
  disposable and easy to re-flash or replace.

### Why an in-house port of epdoptimize (not the npm dep, not a custom-from-scratch ditherer)

The original plan was to use `epdoptimize` (paperlesspaper) as a dependency.
That plan was revised: the relevant pieces are ported in-house under
`src/imaging/`, keeping the algorithms and palette data verbatim but reshaping
the I/O.

Why epdoptimize's algorithms (vs. a naive ditherer):

- Two-palette system: dithers against measured/calibrated panel colors, then
  swaps to native device colors at output. Without this, the algorithm doesn't
  know the panel's "red" actually displays as brick/maroon, and quality suffers.
- Color matching modes: naive RGB Euclidean, perceptual LAB ΔE (default), and
  `chroma` — RGB distance plus chroma/hue penalties (ported from epdoptimize
  1.3.0) that bias saturated source pixels away from gray/black/white and toward
  the right hue, so colourful regions don't collapse to neutral on 6 colors.
- LAB lightness dynamic range compression — addresses the single biggest issue
  with limited-palette displays (photos crushing into pure black/white). Now
  includes epdoptimize 1.3.0's chroma protection: compression strength eases off
  on saturated pixels and a binary-search "chroma guard" backs off the lightness
  push when it would wash a saturated color toward gray.
- Tone mapping (exposure, saturation, S-curve) tuned for e-paper.
- Floyd-Steinberg error diffusion with serpentine scanning (default). The full
  epdoptimize kernel set (Atkinson, Jarvis, Stucki, Burkes, Sierra 2/3/2-4a,
  false-Floyd-Steinberg) is ported in `diffusionKernels` for per-panel tuning.
- Battle-tested: epdoptimize is published by paperlesspaper, who sell Spectra 6
  frames commercially and use this library in their product.

Why port instead of `npm install`:

- **Drops the `canvas` (node-canvas) native dep entirely.** epdoptimize's public
  API takes a `CanvasLike` (just `getImageData` / `putImageData`); under the
  hood it operates on a `Uint8ClampedArray` of RGBA bytes. We feed it raw
  `sharp` output directly. Cairo/Pango/libjpeg/librsvg are no longer required
  at all — a meaningful simplification that also shrinks the image, since the
  original Docker rationale was largely "node-canvas is awkward to install".
- Full understanding of the pipeline; trivial to tweak per-image parameters or
  swap kernels for our specific panel without forking and republishing.

Skipped (vs. upstream): the image classifier (`image-style.ts`,
`auto-processing.ts`, ~1200 lines) and the preset zoo. We hardcode one
processing config and adjust by hand. Can be added later if visual results
suggest auto-tuning is worth the complexity.

Starting palette: `aitjcize-spectra6`, copied verbatim from epdoptimize's
`default-palettes.json`. epdoptimize 1.3.0 added a second Spectra 6 calibration,
`spectra6-boeber`, also copied verbatim (`spectra6Boeber` in `palette.ts`) as an
alternative to compare once the panel is in hand. Plan to recalibrate against
our own panel by adjusting the calibrated `color` values; the two-palette format
makes this a config change, not a code change.

Sync provenance: the in-house pieces were last reconciled against upstream
epdoptimize **1.3.0** (`vendor/epdoptimize` @ `cc15cc5`). The 1.3.0 algorithm
improvements relevant to our minimal pipeline — `chroma` matching, DRC chroma
protection, the extra diffusion kernels, the boeber palette — are folded in.
Still skipped (same rationale as below): the auto classifier/preset zoo, plus
1.3.0's async/worker and WASM execution paths and the ordered/blue-noise/level
and paper-normalization stages, which our single hardcoded config doesn't use.

### Why LAN-only, no auth

- Single-user system on a trusted home network.
- No need to expose to the internet — Picker API uses outbound calls from
  the Zimaboard to Google.
- Reduces attack surface and operational complexity. Can revisit if needs
  change.

## Server architecture

### Stack

```
node:20-alpine
├── express              — HTTP server (port 8765)
├── googleapis           — OAuth2 client + token refresh
├── sharp                — resize + smart-crop, raw RGBA I/O (libvips)
└── qrcode               — render pickerUri as QR for the phone

In-house, src/imaging/:
├── palette.ts           — aitjcize-spectra6 calibrated/device color pairs
├── colorspace.ts        — RGB <-> LAB, deltaE, luma709
├── toneMap.ts           — exposure / saturation / contrast / S-curve / LAB DRC (+chroma guard)
├── dither.ts            — error diffusion (kernel set) + serpentine + rgb/lab/chroma matching
├── replaceColors.ts     — exact-match calibrated -> device swap
└── pipeline.ts          — orchestrates resize + tone map + dither + replace + 3bpp pack
```

Optional: `node-cron` if a periodic cleanup or token-refresh task is wanted.

### Endpoints (all LAN-only, no auth)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/` | Status page: queue size, last refresh time, "Refresh from Google Photos" button |
| GET | `/pick` | Creates picker session, returns page with QR code + clickable pickerUri |
| GET | `/pick/status` | Polled by `/pick` page; reports `pending` / `processing` / `done` with counts |
| GET | `/next.bin` | ESP32 endpoint. Returns one packed framebuffer (random pick from queue), `application/octet-stream` |
| POST | `/admin/clear` | Wipes queue. Manual recovery. |

### Persistent data

Container path `/app/data` ← bind-mounted from the host `./data` next to the
compose file (e.g. `/DATA/eink-frame/data` on ZimaOS).

```
/app/data/
├── tokens.json          # OAuth refresh token (chmod 600)
├── queue/
│   ├── <hash>.bin       # packed 3bpp framebuffer ready for the panel
│   └── ...
└── cache/               # optional — original downloaded JPEGs, for re-processing
    ├── <mediaItemId>.jpg
    └── ...
```

The `data/` directory is the only thing the user backs up. Code lives in git;
the container is rebuilt from the Dockerfile.

### Image pipeline (per picked photo)

1. Download bytes from picker `baseUrl` with current OAuth access token.
   Append `=w1600-h1200` for server-side resizing on Google's side as a hint.
2. `sharp(buffer).resize(1600, 1200, { fit: 'cover', position: 'attention' })
   .raw().toBuffer()` — smart crop using saliency detection, returns a raw
   RGBA buffer wrapped as `{ width, height, data: Uint8ClampedArray }`.
3. Apply tone mapping in place: exposure, saturation, then either contrast or
   S-curve depending on preset.
4. Apply LAB lightness dynamic range compression toward the calibrated
   palette's black/white luminance window.
5. Floyd-Steinberg error diffusion with serpentine scan, quantizing each pixel
   to the nearest palette color via ΔE in LAB.
6. Walk the buffer and replace each calibrated palette color with its device
   color counterpart.
7. Pack each pixel to a palette index (0-5) and write to `queue/<hash>.bin`.
   Exact packing layout TBD — the firmware spec drives this. Two candidates:
   true 3bpp (8 px per 3 bytes, ~720 KB at 1600×1200) or 4bpp nibble-packed
   (~960 KB at 1600×1200, simpler ESP32-side).
8. Optionally save the source JPG to `cache/`.

For each step the dev CLI can dump an intermediate PNG (sharp re-encodes the
buffer) so visual regressions are easy to spot.

### Frame model

- Frame wakes on its own RTC timer (firmware-side concern, every few hours).
- `GET /next.bin` → server picks a random `.bin` from the queue, streams it back.
- Server never returns 404 unless queue is empty. Random includes possible
  repeats — no "don't show same photo twice in a row" logic in v1.
- ESP32 reads bytes directly into panel buffer, triggers refresh, deep sleeps.
- 720 KB transfer over WiFi is trivial compared to the 12-second panel refresh.

## Zimaboard 2 / ZimaOS notes

1. **Put `data/` and `credentials.json` next to the compose file.** The compose
   uses relative bind mounts (`./data`, `./credentials.json`), so clone the repo
   somewhere persistent — `/DATA` is ZimaOS's storage root, e.g.
   `/DATA/eink-frame`.
2. **Manage compose via SSH or the ZimaOS terminal app.** `docker compose up -d
   --build` from the repo directory. ZimaOS can also adopt/manage the running
   container from its app/container UI.
3. **Standard bridge networking is fine.** The DS713+ host-mode workaround is
   gone — the `ports: ["8765:8765"]` mapping binds 8765 on the host.
4. **Pick an unused port.** Project uses **8765**; keep clear of anything ZimaOS
   services already bind (the web UI, Samba, etc.).
5. **Build for x86_64.** Zimaboard 2 is Intel N150 (x86_64). If developing on
   Apple Silicon, build with `--platform linux/amd64` or use buildx, otherwise
   images won't run on the box.

## Out of scope for v1

- Multi-user (the entire system assumes one OAuth identity)
- Authentication on LAN endpoints
- Watched-album auto-sync (Picker API forbids this)
- Calibration UI (will manually edit palette JSON once panel is in hand)
- Pre-computing multiple aspect-ratio variants (assume crop-to-fill is fine)
- HTTPS (LAN only)
- Web UI for queue management beyond clear-all
- Frame firmware (separate project, separate repo)

## Development workflow

1. Develop and test locally on x86_64 dev machine. Don't develop on the Zimaboard.
2. End-to-end milestones, in order:
   - **Milestone 1**: CLI script — create picker session, print URL, poll, download bytes. No Express, no Docker yet. Validates Google's flow.
   - **Milestone 2**: Add the image pipeline. Process one downloaded photo end-to-end into a `.bin` file. Verify visually as PNG before binary packing.
   - **Milestone 3**: Wrap in Express. Add `/`, `/pick`, `/pick/status`, `/next.bin`. Test from a browser and `curl`.
   - **Milestone 4**: Dockerize. Test container locally on dev machine.
   - **Milestone 5**: Deploy to the Zimaboard. Verify auto-restart, persistence, ESP32 fetches.
3. Use git from milestone 1.
4. OAuth client setup is browser-only — Google Cloud Console, enable Photos
   Picker API, create "Desktop app" OAuth client, add yourself as a test user
   while the consent screen is in Testing status.
5. While the consent screen stays in Testing, refresh tokens expire after
   7 days. For long-term use, either submit for verification or accept weekly
   re-auth.

## Calibration plan (post-panel-arrival)

1. Display a known reference (e.g., a calibration card or test pattern image)
   on the panel using `aitjcizeSpectra6Palette` as-is.
2. Photograph the panel under neutral daylight or a known light source.
3. Sample the actual rendered colors for each of the 6 primaries.
4. Replace the `color` values in the palette JSON with measured values.
   Leave `deviceColor` values untouched.
5. Reprocess test images and compare. Iterate.

## References

- epdoptimize: https://github.com/paperlesspaper/epdoptimize
  (Apache-2.0; the `src/imaging/` pipeline is an in-house port — see `CREDITS.md`)
- Google Photos Picker API: https://developers.google.com/photos/picker
- aitjcize/epaper-image-convert (origin of the calibrated palette):
  https://github.com/aitjcize/epaper-image-convert
- Seeed XIAO ePaper EE02: https://www.seeedstudio.com/XIAO-ePaper-DIY-Kit-EE02-for-13-3-Spectratm-6-E-Ink.html

Full attribution chain (epdoptimize and the projects it builds on): `CREDITS.md`.