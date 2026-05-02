PI       ?= pi@raspberrypi.local
REPO_URL := $(shell git remote get-url origin)

.PHONY: build run deploy-init

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
	ssh $(PI) "cd ~/eink-frame && bash scripts/deploy.sh"
