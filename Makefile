# ============================================================================
# learning-indonesian — Makefile
# ============================================================================
# Run 'make help' to see all available commands.

SUPABASE_URL = https://api.supabase.duin.home

.PHONY: help
help: ## Show this help message
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'

# ============================================================================
# DEVELOPMENT
# ============================================================================

.PHONY: dev
dev: ## Start the Vite dev server
	bun run dev

.PHONY: build
build: ## Production build
	bun run build

.PHONY: test
test: ## Run tests
	bun run test

.PHONY: test-watch
test-watch: ## Run tests in watch mode
	bun run test:watch

.PHONY: lint
lint: ## Run ESLint
	bun run lint

.PHONY: typecheck
typecheck: ## Run TypeScript type checker
	bun run tsc -b --noEmit

# ============================================================================
# DATABASE
# ============================================================================

.PHONY: migrate
migrate: ## Run the Supabase schema migration (requires SUPABASE_SERVICE_KEY)
	@test -n "$(SUPABASE_SERVICE_KEY)" || { echo "Error: SUPABASE_SERVICE_KEY is required. Run: make migrate SUPABASE_SERVICE_KEY=<key>"; exit 1; }
	SUPABASE_SERVICE_KEY=$(SUPABASE_SERVICE_KEY) bun scripts/migrate.ts

.PHONY: seed-lessons
seed-lessons: ## Seed lesson content (requires SUPABASE_SERVICE_KEY)
	@test -n "$(SUPABASE_SERVICE_KEY)" || { echo "Error: SUPABASE_SERVICE_KEY is required."; exit 1; }
	SUPABASE_SERVICE_KEY=$(SUPABASE_SERVICE_KEY) bun scripts/seed-lessons.ts

.PHONY: seed-vocabulary
seed-vocabulary: ## Seed vocabulary list (requires SUPABASE_SERVICE_KEY)
	@test -n "$(SUPABASE_SERVICE_KEY)" || { echo "Error: SUPABASE_SERVICE_KEY is required."; exit 1; }
	SUPABASE_SERVICE_KEY=$(SUPABASE_SERVICE_KEY) bun scripts/seed-vocabulary.ts

.PHONY: seed-podcasts
seed-podcasts: ## Seed podcast metadata and upload audio (requires SUPABASE_SERVICE_KEY and AUDIO_DIR)
	@test -n "$(SUPABASE_SERVICE_KEY)" || { echo "Error: SUPABASE_SERVICE_KEY is required."; exit 1; }
	@test -n "$(AUDIO_DIR)" || { echo "Error: AUDIO_DIR is required. Run: make seed-podcasts SUPABASE_SERVICE_KEY=<key> AUDIO_DIR=<path>"; exit 1; }
	SUPABASE_SERVICE_KEY=$(SUPABASE_SERVICE_KEY) AUDIO_DIR=$(AUDIO_DIR) bun scripts/seed-podcasts.ts

.PHONY: seed-all
seed-all: seed-lessons seed-vocabulary ## Seed all non-audio content (requires SUPABASE_SERVICE_KEY)

# ============================================================================
# DOCKER
# ============================================================================

.PHONY: docker-build
docker-build: ## Build the Docker image (requires VITE_SUPABASE_ANON_KEY)
	@test -n "$(VITE_SUPABASE_ANON_KEY)" || { echo "Error: VITE_SUPABASE_ANON_KEY is required."; exit 1; }
	docker build \
		--build-arg VITE_SUPABASE_URL=$(SUPABASE_URL) \
		--build-arg VITE_SUPABASE_ANON_KEY=$(VITE_SUPABASE_ANON_KEY) \
		-t learning-indonesian .

.PHONY: docker-run
docker-run: ## Run the Docker image locally on port 8080
	docker run --rm -p 8080:80 learning-indonesian
