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
| POST   | `/admin/clear`   | Wipes the queue                                                 |

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
(Debian-based, modern Docker engine). It uses standard bridge networking with a
`ports:` mapping and relative volume paths that resolve against the repo
directory — no DSM-style absolute paths or `network_mode: host` workarounds.

```bash
# On the Zimaboard (SSH enabled, or use the ZimaOS terminal app):
# Clone or copy the repo somewhere persistent, e.g. under /DATA:
cd /DATA/eink-frame

# Place secrets next to the compose file:
cp /path/to/credentials.json ./credentials.json
mkdir -p data
cp /path/to/tokens.json ./data/tokens.json   # if pre-authed

docker compose up -d --build
```

Then visit `http://<zimaboard-ip>:8765` from a phone on the same network.

The Zimaboard 2 is x86_64 (Intel N150). If you build images on Apple Silicon,
target x86_64: `docker buildx build --platform linux/amd64 ...`.

## Data layout

`data/` is the only path that needs backing up. Everything else is rebuilt
from the Dockerfile.

```
data/
├── tokens.json       # OAuth refresh token (chmod 600)
├── queue/<hash>.bin  # packed framebuffers ready for the panel
├── cache/            # original downloaded JPEGs (process CLI / debug)
└── debug/            # per-stage PNG dumps from `npm run process`
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
