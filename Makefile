# ─────────────────────────────────────────────────────────────────────────────
# GG League · J2 — toutes les commandes de la journée.        →  make help
# ─────────────────────────────────────────────────────────────────────────────
.DEFAULT_GOAL := help
SHELL := /bin/bash

# Fichier optionnel (non versionné) pour surcharger les ports : voir README
-include .env
export

# Le conteneur de l'API tourne avec votre identifiant (voir compose.yaml)
export UID := $(shell id -u)
export GID := $(shell id -g)

COMPOSE   := docker compose
EXEC_API  := $(COMPOSE) exec api
EXEC_TEST := $(COMPOSE) exec -T api-test
HURL      := $(COMPOSE) run --rm --no-deps hurl
# ERRORS=long affiche la réponse HTTP complète de chaque test en échec (make test ERRORS=long)
ERRORS    ?= short
HURL_FLAGS := --test --jobs 1 --color --error-format $(ERRORS) --variable host=http://api-test:3000
API_URL   := http://localhost:$(or $(API_PORT),8000)
UPSTREAM  ?= upstream

GREEN  := \033[32m
YELLOW := \033[33m
RED    := \033[31m
BOLD   := \033[1m
RESET  := \033[0m

.PHONY: help doctor install up down restart build ps logs sh \
        npm typecheck own db-reset db-shell redis-cli prisma prisma-studio \
        test test-env test-db report

## —— 🚀 Démarrage ————————————————————————————————————————————————————————————
help: ## Affiche cette aide
	@printf "$(BOLD)GG League · J2$(RESET) — commandes disponibles\n"
	@grep -hE '(^[a-zA-Z0-9_-]+:.*?## .*$$)|(^## )' $(firstword $(MAKEFILE_LIST)) \
		| sed -E 's/^## (.*)/\n\1/' \
		| awk 'BEGIN {FS = ":.*?## "}; /^[a-zA-Z0-9_-]+:/ {printf "  $(GREEN)%-12s$(RESET) %s\n", $$1, $$2; next} {print}'
	@printf "\nExemples : make install · make test · make test f=01 · make npm c=\"install dayjs\"\n"

doctor: ## Vérifie votre poste (Docker, ports, git, fins de ligne)
	@ok()   { printf "  $(GREEN)✔$(RESET) %s\n" "$$1"; }; \
	 warn() { printf "  $(YELLOW)!$(RESET) %s\n" "$$1"; }; \
	 ko()   { printf "  $(RED)✘$(RESET) %s\n" "$$1"; FAIL=1; }; \
	 FAIL=0; \
	 printf "$(BOLD)Diagnostic du poste$(RESET)\n"; \
	 command -v docker >/dev/null && ok "Docker : $$(docker --version | cut -d, -f1)" || ko "Docker n'est pas installé"; \
	 docker info >/dev/null 2>&1 && ok "Le démon Docker répond" || ko "Le démon Docker ne répond pas (Docker Desktop est-il lancé ?)"; \
	 docker compose version >/dev/null 2>&1 && ok "$$(docker compose version)" || ko "Docker Compose v2 introuvable (« docker compose », sans tiret)"; \
	 MEM=$$(docker info --format '{{.MemTotal}}' 2>/dev/null || echo 0); \
	 [ "$$MEM" -ge 3000000000 ] 2>/dev/null && ok "Mémoire allouée à Docker : $$((MEM / 1024 / 1024)) Mo" || warn "Mémoire Docker faible ($$((MEM / 1024 / 1024)) Mo) : 4 Go recommandés"; \
	 RUNNING=$$($(COMPOSE) ps -q api 2>/dev/null); \
	 for P in $(or $(API_PORT),8000) $(or $(DB_PORT),5433) $(or $(REDIS_PORT),6379); do \
	   if [ -z "$$RUNNING" ] && (exec 3<>/dev/tcp/127.0.0.1/$$P) 2>/dev/null; then ko "Port $$P déjà utilisé (changez-le dans un fichier .env, voir README)"; \
	   else ok "Port $$P disponible"; fi; \
	 done; \
	 command -v git >/dev/null && ok "Git : $$(git --version)" || ko "Git n'est pas installé"; \
	 [ -n "$$(git config user.name)" ] && [ -n "$$(git config user.email)" ] && ok "Git identifié : $$(git config user.name) <$$(git config user.email)>" || warn "Configurez git : git config --global user.name / user.email"; \
	 git remote get-url $(UPSTREAM) >/dev/null 2>&1 && ok "Remote « $(UPSTREAM) » (dépôt de l'enseignant) configuré" || warn "Remote « $(UPSTREAM) » absent (facultatif) : git remote add $(UPSTREAM) <url du dépôt de l'enseignant>"; \
	 if grep -q $$'\r' Makefile api/docker-entrypoint.sh 2>/dev/null; then ko "Fins de ligne Windows (CRLF) détectées : git config --global core.autocrlf input, puis reclonez"; else ok "Fins de ligne Unix (LF)"; fi; \
	 echo; [ $$FAIL -eq 0 ] && printf "$(GREEN)Tout est prêt.$(RESET) Lancez : make install\n" || { printf "$(RED)Corrigez les points en rouge avant de continuer.$(RESET)\n"; exit 1; }

install: ## Première installation (construit l'image et installe les dépendances)
	@mkdir -p reports
	@if [ -n "$(API_IMAGE)" ]; then $(COMPOSE) pull api; else $(COMPOSE) build; fi
	$(COMPOSE) up -d --wait
	@$(MAKE) --no-print-directory db-reset
	@printf "\n$(GREEN)✔ Installation terminée$(RESET)\n"
	@printf "  Votre API                $(API_URL)/api/games\n"
	@printf "  Swagger UI               $(API_URL)/api/docs\n"
	@printf "  PostgreSQL               localhost:$(or $(DB_PORT),5433) (app / app)\n"
	@printf "  Redis                    localhost:$(or $(REDIS_PORT),6379) (make redis-cli)\n"
	@printf "  Vérifier : make test (le fichier 00-games doit être vert)\n"

up: ## Démarre l'environnement
	$(COMPOSE) up -d --wait

down: ## Arrête l'environnement (les données sont conservées)
	$(COMPOSE) --profile test --profile tools down --remove-orphans

restart: ## Redémarre l'environnement
	@$(MAKE) --no-print-directory down
	@$(MAKE) --no-print-directory up

build: ## Reconstruit l'image (après une modification du Dockerfile)
	$(COMPOSE) build

ps: ## État des conteneurs
	$(COMPOSE) --profile test ps

logs: ## Journaux en direct (requêtes, erreurs, rechargements) : make logs [s=api|database]
	$(COMPOSE) logs -f --tail=100 $(s)

sh: ## Shell dans le conteneur de l'API
	$(EXEC_API) sh

## —— 🟩 Node ———————————————————————————————————————————————————————————————
npm: ## npm dans le conteneur : make npm c="install dayjs"
	$(EXEC_API) npm $(c)

typecheck: ## Vérifie les types TypeScript (tsc --noEmit), sans lancer le serveur
	$(EXEC_API) npm run typecheck

prisma: ## La CLI Prisma dans le conteneur : make prisma c="db pull" · make prisma c=generate · make prisma c=validate
	$(EXEC_API) npx prisma $(c)

prisma-studio: ## Prisma Studio, l'explorateur de données : http://localhost:5555 (Ctrl+C pour arrêter)
	$(COMPOSE) exec -e PRISMA_PORT=$(or $(PRISMA_PORT),5555) api sh scripts/studio.sh

# Filet de sécurité : si des fichiers de api/ appartiennent à un autre utilisateur (hôte dont
# l'identifiant diffère de celui du conteneur), les rendre à l'utilisateur courant.
own: ## Rend les fichiers de api/ à votre utilisateur
	@$(COMPOSE) exec -u root api chown -R $(UID):$(GID) /app

db-reset: ## Recrée les tables (db/schema.sql) et recharge les données de démo (db/seed.sql) — ⚠ efface tout
	$(EXEC_API) npm run --silent db:reset

db-shell: ## Console psql sur la base de développement
	$(COMPOSE) exec database psql -U app app

redis-cli: ## Console redis-cli sur le Redis de développement (base 0) : KEYS *, GET, TTL…
	$(COMPOSE) exec redis redis-cli

## —— ✅ Tests ————————————————————————————————————————————————————————————————
test: test-db test-env ## Lance les tests Hurl : make test · make test f=01 · make test ERRORS=long
	$(HURL) $(HURL_FLAGS) $(if $(REPORT),--report-junit /reports/j2.xml) --glob '*$(if $(f),$(f)*,).hurl'

report: ## Rapport JUnit dans reports/ (pour l'enseignant)
	@mkdir -p reports && rm -f reports/*.xml
	-@$(MAKE) --no-print-directory test REPORT=1
	@printf "\nRapport écrit dans reports/j2.xml\n"

# 1. La base de test est (re)créée vide par un conteneur éphémère, et la base Redis 1 vidée, AVANT de démarrer api-test
#    (son healthcheck interroge la base : sans elle, il ne serait jamais « healthy »).
test-db:
	@$(COMPOSE) up -d --wait database redis >/dev/null 2>&1
	@$(COMPOSE) --profile test run --rm --no-deps -T api-test npm run --silent db:reset -- --no-seed >/dev/null
	@$(COMPOSE) exec -T redis redis-cli -n 1 FLUSHDB >/dev/null

# 2. api-test ne recharge pas le code tout seul (pas de « watch ») : on le recrée à chaque fois.
#    S'il ne démarre pas (erreur de syntaxe, import cassé...), on montre ses journaux.
test-env: test-db
	@$(COMPOSE) --profile test up -d --wait --force-recreate api-test >/dev/null 2>&1 || { \
	  printf "$(RED)L'API de test ne démarre pas. Ses derniers journaux :$(RESET)\n"; \
	  $(COMPOSE) --profile test logs --no-log-prefix --tail=25 api-test; exit 1; }
