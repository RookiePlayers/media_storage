

# Default environment: dev | prod
ENV ?= dev

# Map ENV -> compose/env files & project name
ifeq ($(ENV),dev)
  COMPOSE_FILE := docker-compose.yml
  ENV_FILE     := .env
  PROJECT_NAME := producer
else
  $(error ENV must be one of: dev, prod)
endif

# Base docker compose command
dc = docker compose -p $(PROJECT_NAME) -f $(COMPOSE_FILE) --env-file $(ENV_FILE)

# Default goal
.DEFAULT_GOAL := help

.PHONY: help up down build rebuild restart ps logs logs-api logs-cache logs-typesense \
        sh sh-api sh-cache sh-typesense tail tail-api tail-cache tail-typesense \
        prune clean volumes images

help:
	@echo ""
	@echo "Make targets (ENV=$(ENV))"
	@echo "  up             - Start all services in the background"
	@echo "  down           - Stop & remove services (keeps volumes)"
	@echo "  build          - Build images (no up)"
	@echo "  rebuild        - Rebuild images and start (-d)"
	@echo "  restart        - Down (orphans) then up (-d)"
	@echo "  ps             - List services"
	@echo "  logs s=<svc>   - Follow logs for a service (api|cache|kafka)"
	@echo "  logs-api       - Follow api logs"
	@echo "  logs-cache     - Follow redis logs"
	@echo "  logs-kafka     - Follow kafka logs"
	@echo "  sh-<svc>       - Shell into a container (producer|cache|kafka)"
	@echo "  prune          - Remove orphans & dangling networks"
	@echo "  clean          - Down and remove orphans (keeps volumes)"
	@echo "  volumes        - Remove named volumes for this project"
	@echo "  images         - Remove images built for this project"
	@echo ""
	@echo "Examples:"
	@echo "  make up                         # dev by default"
	@echo "  make ENV=prod rebuild           # prod rebuild"
	@echo "  make logs s=producer            # follow producer logs"
	@echo "  make sh-producer                # shell into producer"
	@echo ""

# Core lifecycle
up:
	$(dc) up -d

down:
	$(dc) down

build:
	$(dc) build

rebuild:
	$(dc) up -d --build

restart:
	$(dc) down --remove-orphans
	$(dc) up -d

ps:
	$(dc) ps

# Logging
# Usage: make logs s=api
s ?= api
logs:
	$(dc) logs -f --tail=200 $(s)

logs-api:
	$(dc) logs -f --tail=200 producer

logs-cache:
	$(dc) logs -f --tail=200 cache

logs-kafka:
	$(dc) logs -f --tail=200 kafka

# Quick tail (last 100 lines without following)
tail:
	$(dc) logs --tail=100 $(s)

tail-api:
	$(dc) logs --tail=100 producer

tail-cache:
	$(dc) logs --tail=100 cache

tail-kafka:
	$(dc) logs --tail=100 kafka

# Shell / exec helpers
sh:
	$(dc) exec $(s) sh

sh-api:
	$(dc) exec producer sh

sh-cache:
	$(dc) exec cache sh

sh-kafka:
	$(dc) exec kafka sh

# Cleanup helpers
prune:
	$(dc) down --remove-orphans
	docker network prune -f || true

clean:
	$(dc) down --remove-orphans

# DANGER: removes named volumes/images associated with the project
volumes:
	$(dc) down -v --remove-orphans

images:
	$(dc) down --rmi local --remove-orphans