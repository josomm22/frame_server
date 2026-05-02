#!/usr/bin/env bash
# Checks whether the local repo is behind its upstream and, if so, pulls and
# rebuilds the container. Designed to run as a cron job on the Pi.
# Logs are written to data/update.log (appended by cron redirection).
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_DIR"

ts() { date -Iseconds; }

if ! git fetch origin; then
    echo "[$(ts)] fetch failed, skipping"
    exit 0
fi

LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse "@{u}")

if [ "$LOCAL" = "$REMOTE" ]; then
    echo "[$(ts)] up to date ($LOCAL)"
    exit 0
fi

echo "[$(ts)] update available: $LOCAL -> $REMOTE"
git pull
docker compose up -d --build
echo "[$(ts)] deployed $REMOTE"
