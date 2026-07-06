# eink-frame server

LAN server that pulls photos from Google Photos via the Picker API, processes
them for a 13.3" Spectra 6 e-paper panel, and serves packed framebuffers to a
custom-firmware ESP32 frame.

For the full design rationale (hardware, why-Picker-API, why-Docker, image
pipeline details) see [ARCHITECTURE.md](ARCHITECTURE.md). This README is
operations-only.

## Prerequisites

- Node.js 20+ (for local dev)
- Docker + docker compose (for container runs / Zimaboard deploy)
- A Google Cloud project with OAuth credentials (see below)

## One-time Google Cloud setup

1. Create a project at https://console.cloud.google.com/
2. Enable the **Photos Picker API**.
3. Configure the OAuth consent screen as **External**, status **Testing**, and
   add your own Google account as a test user.
4. Create an **OAuth client ID** of type **Desktop app**.
5. Download the JSON and save it as `credentials.json` in the repo root
   (gitignored).

While the consent screen stays in Testing, refresh tokens expire after 7 days.
For long-term use either submit for verification or accept weekly re-auth.

## Local development

```bash
npm install

# 1) Authenticate + download chosen photos to data/cache/
npm run pick

# 2) Process a single JPG end-to-end into a packed framebuffer
npm run process -- data/cache/IMG_1234.jpg
# optional: --format=pack3bpp (default is nibble4bpp)

# 3) Run the full server
npm run server
# -> http://localhost:8765
```

First run of `npm run pick` (or `npm run server`) opens a browser window for
OAuth and writes `data/tokens.json`. Subsequent runs reuse the saved refresh
token.

## Endpoints

All LAN-only, no auth.

| Method | Path             | Purpose                                                         |
|--------|------------------|-----------------------------------------------------------------|
| GET    | `/`              | Status page: queue size, last refresh, "Refresh" button         |
| GET    | `/pick`          | Creates picker session, shows QR + link for the phone           |
| GET    | `/pick/status`   | Polled by the `/pick` page; returns `pending`/`processing`/`done` |
| GET    | `/next.bin`      | ESP32 endpoint. Returns one random `.bin` from the queue        |
| GET    | `/firmware/version` | ESP32 endpoint. Published OTA version string (404 = no release) |
| GET    | `/firmware/latest.bin` | ESP32 endpoint. OTA binary, with `X-Firmware-MD5` header (404 = no release) |
| GET    | `/firmware`      | OTA publishing page: current release + upload form              |
| POST   | `/firmware`      | Publishes a release (multipart: `version` text + `firmware` file) |
| POST   | `/admin/clear`   | Wipes the queue                                                 |

### OTA releases

Publish a release on the `/firmware` page: enter the version string and upload
the compiled binary (built from `seeed_eink_board` with `uv run pio run`,
binary at `.pio/build/seeed_xiao_esp32s3/firmware.bin`). The server stores the
pair in `data/firmware/` and starts serving it to devices.

On each wake a device compares `/firmware/version` against its own version by
plain inequality — there is no semver ordering, so publishing an older version
deliberately rolls devices back. **The version entered must exactly match the
`FIRMWARE_VERSION` compiled into the uploaded binary**: if they differ, devices
detect the mismatch after one flash and stop retrying, leaving the release
effectively broken.

Every device request carries `X-Device-MAC`, `X-Firmware-Version`, and (when
the reading succeeds) `X-Battery-Voltage` / `X-Battery-Percent` headers. The
server logs them and shows the latest per-device values in the "Devices"
section of the home page (in-memory only — it repopulates on the next device
wake after a restart).

## Docker (local test)

```bash
docker build -t eink-frame:latest .
docker run --rm -p 8765:8765 \
  -v "$PWD/data":/app/data \
  -v "$PWD/credentials.json":/app/credentials.json:ro \
  eink-frame:latest
```

Note: OAuth's first-run flow expects a browser. Authenticate locally with
`npm run pick` first so `data/tokens.json` exists, then mount `data/` into the
container.

## Zimaboard 2 deploy

The committed `docker-compose.yml` targets the Zimaboard 2 running ZimaOS
(Debian-based, modern Docker engine), with standard bridge networking and a
`ports:` mapping — no DSM-style `network_mode: host` workaround.

**Two separate locations** (this is the part that trips people up):

- **Repo / build context** — the cloned source + Dockerfile. Docker only reads
  it at `build` time; nothing is written here at runtime. Clone it anywhere
  persistent (e.g. `/DATA/eink-frame`). Safe to delete and re-clone.
- **Persistent data** — `/DATA/AppData/eink-frame/`, ZimaOS's AppData folder.
  This is where `tokens.json`, the `.bin` queue, and `credentials.json` live,
  bind-mounted into the container. It survives image rebuilds and re-clones, and
  it's the only thing you back up. The compose file hardcodes this path.

```bash
# On the Zimaboard (SSH enabled, or use the ZimaOS terminal app):

# 1) Clone the repo (build context) somewhere persistent:
git clone <repo-url> /DATA/eink-frame
cd /DATA/eink-frame

# 2) Create the AppData data dir and drop in secrets:
mkdir -p /DATA/AppData/eink-frame/data

# credentials.json: the OAuth client JSON downloaded from Google Cloud.
cp /path/to/credentials.json /DATA/AppData/eink-frame/credentials.json

# tokens.json: generated by the OAuth browser flow, which the headless
# Zimaboard can't run. Authenticate on your dev machine first (`npm run pick`
# writes data/tokens.json), then copy that file here:
cp /path/to/tokens.json /DATA/AppData/eink-frame/data/tokens.json

# 3) Build + run:
docker compose up -d --build
```

Then visit `http://<zimaboard-ip>:8765` from a phone on the same network.

To deploy a new version later, just `git pull` in the repo dir and re-run
`docker compose up -d --build`; the AppData volume is untouched.

The Zimaboard 2 is x86_64 (Intel N150). If you build images on Apple Silicon,
target x86_64: `docker buildx build --platform linux/amd64 ...`.

> If you'd rather keep eink-frame's data somewhere other than
> `/DATA/AppData/eink-frame`, change both volume paths in `docker-compose.yml`
> to match.

## Data layout

`data/` is the only path that needs backing up. Everything else is rebuilt
from the Dockerfile.

```
data/
├── tokens.json          # OAuth refresh token (chmod 600)
├── firmware/            # published OTA release (written via the /firmware page)
│   ├── firmware.bin     # the binary served to devices
│   └── version.txt      # its version string
├── queue/<hash>.bin     # packed framebuffers ready for the panel
├── cache/               # original downloaded JPEGs (process CLI / debug)
└── debug/               # per-stage PNG dumps from `npm run process`
```

## Troubleshooting

- **`/next.bin` returns 404 "queue empty"** — open `/pick` and add photos.
- **`invalid_grant` on startup** — refresh token expired (7-day Testing limit).
  Delete `data/tokens.json` and re-run `npm run pick` to re-auth.
- **Container can't reach Google** — check the Zimaboard's outbound DNS / proxy. The
  Picker API requires outbound HTTPS from the container.

## Credits

The image pipeline in `src/imaging/` is an in-house port of
[epdoptimize](https://github.com/paperlesspaper/epdoptimize) by paperlesspaper
(Apache-2.0), which itself builds on
[aitjcize/epaper-image-convert](https://github.com/aitjcize/epaper-image-convert)
and [GuySie/opendithering](https://github.com/GuySie/opendithering), among
others. Full attribution and license: [`CREDITS.md`](CREDITS.md).
