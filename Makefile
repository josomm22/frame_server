PI       ?= pi@raspberrypi.local
REPO_URL := $(shell git remote get-url origin)

.PHONY: build run push-creds deploy-init deploy install-cron

# Build image locally (dev / smoke-test)
build:
	docker build -t eink-frame:latest .

# Run locally — requires credentials.json and data/ in repo root
run:
	docker run --rm -p 8765:8765 \
		-v "$(CURDIR)/data":/app/data \
		-v "$(CURDIR)/credentials.json":/app/credentials.json:ro \
		eink-frame:latest

# First-time Pi setup: clone repo, copy credentials, build and start
deploy-init:
	ssh $(PI) "git clone $(REPO_URL) ~/eink-frame && mkdir -p ~/eink-frame/data"
	scp credentials.json $(PI):~/eink-frame/credentials.json
	@if [ -f data/tokens.json ]; then \
		scp data/tokens.json $(PI):~/eink-frame/data/tokens.json; \
	fi
	ssh $(PI) "cd ~/eink-frame && docker compose up -d --build"

# Copy credentials to Pi (re-run after re-auth or credential rotation)
push-creds:
	scp credentials.json $(PI):~/eink-frame/credentials.json
	@if [ -f data/tokens.json ]; then \
		ssh $(PI) mkdir -p ~/eink-frame/data; \
		scp data/tokens.json $(PI):~/eink-frame/data/tokens.json; \
	fi

# Pull latest code on Pi and rebuild the container
deploy:
	ssh $(PI) "cd ~/eink-frame && git pull && docker compose up -d --build"

# Install an hourly update check on the Pi via cron
# Override frequency by editing the cron expression, e.g.: CRON="*/30 * * * *"
CRON ?= 0 * * * *
install-cron:
	ssh $(PI) '(crontab -l 2>/dev/null | grep -v eink-frame/scripts/update; echo "$(CRON) $$HOME/eink-frame/scripts/update.sh >> $$HOME/eink-frame/data/update.log 2>&1") | crontab -'
