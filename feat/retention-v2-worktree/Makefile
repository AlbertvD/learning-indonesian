# ============================================================================
# learning-indonesian — Makefile
# ============================================================================
# Run 'make help' to see all available commands.

SUPABASE_URL = https://api.supabase.duin.home

# Load .env.local if present
-include .env.local
export

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
migrate: ## Apply Supabase schema migration via psql (requires POSTGRES_PASSWORD in .env.local)
	@test -n "$(POSTGRES_PASSWORD)" || { echo "Error: POSTGRES_PASSWORD is required (add to .env.local)"; exit 1; }
	NODE_TLS_REJECT_UNAUTHORIZED=0 SUPABASE_DB_PASSWORD=$(POSTGRES_PASSWORD) bun scripts/migrate.ts

.PHONY: seed-lessons
seed-lessons: ## Seed lesson content (requires SUPABASE_SERVICE_KEY)
	@test -n "$(SUPABASE_SERVICE_KEY)" || { echo "Error: SUPABASE_SERVICE_KEY is required."; exit 1; }
	NODE_TLS_REJECT_UNAUTHORIZED=0 SUPABASE_SERVICE_KEY=$(SUPABASE_SERVICE_KEY) bun scripts/seed-lessons.ts

.PHONY: seed-vocabulary
seed-vocabulary: ## Seed vocabulary list (requires SUPABASE_SERVICE_KEY)
	@test -n "$(SUPABASE_SERVICE_KEY)" || { echo "Error: SUPABASE_SERVICE_KEY is required."; exit 1; }
	NODE_TLS_REJECT_UNAUTHORIZED=0 SUPABASE_SERVICE_KEY=$(SUPABASE_SERVICE_KEY) bun scripts/seed-vocabulary.ts

.PHONY: seed-podcasts
seed-podcasts: ## Seed podcast metadata and upload audio from content/podcasts/ (requires SUPABASE_SERVICE_KEY)
	@test -n "$(SUPABASE_SERVICE_KEY)" || { echo "Error: SUPABASE_SERVICE_KEY is required."; exit 1; }
	NODE_TLS_REJECT_UNAUTHORIZED=0 SUPABASE_SERVICE_KEY=$(SUPABASE_SERVICE_KEY) bun scripts/seed-podcasts.ts

.PHONY: seed-lesson-audio
seed-lesson-audio: ## Upload lesson audio files from content/lessons/ to indonesian-lessons storage (requires SUPABASE_SERVICE_KEY)
	@test -n "$(SUPABASE_SERVICE_KEY)" || { echo "Error: SUPABASE_SERVICE_KEY is required."; exit 1; }
	NODE_TLS_REJECT_UNAUTHORIZED=0 SUPABASE_SERVICE_KEY=$(SUPABASE_SERVICE_KEY) bun scripts/seed-lesson-audio.ts

.PHONY: seed-flashcards
seed-flashcards: ## Seed public flashcard decks from lesson vocabulary (requires SUPABASE_SERVICE_KEY)
	@test -n "$(SUPABASE_SERVICE_KEY)" || { echo "Error: SUPABASE_SERVICE_KEY is required."; exit 1; }
	NODE_TLS_REJECT_UNAUTHORIZED=0 SUPABASE_SERVICE_KEY=$(SUPABASE_SERVICE_KEY) bun scripts/seed-flashcards.ts

.PHONY: seed-learning-items
seed-learning-items: ## Seed learning items from data files (requires SUPABASE_SERVICE_KEY)
	@test -n "$(SUPABASE_SERVICE_KEY)" || { echo "Error: SUPABASE_SERVICE_KEY is required."; exit 1; }
	NODE_TLS_REJECT_UNAUTHORIZED=0 SUPABASE_SERVICE_KEY=$(SUPABASE_SERVICE_KEY) bun scripts/seed-learning-items.ts

.PHONY: seed-all
seed-all: seed-lessons seed-podcasts seed-learning-items ## Seed all non-audio content (requires SUPABASE_SERVICE_KEY)

.PHONY: extract-lesson
extract-lesson: ## Extract lesson content from page photos (requires LESSON and ANTHROPIC_API_KEY)
	@test -n "$(LESSON)" || { echo "Error: LESSON is required. Run: make extract-lesson LESSON=<N> ANTHROPIC_API_KEY=<key>"; exit 1; }
	@test -n "$(ANTHROPIC_API_KEY)" || { echo "Error: ANTHROPIC_API_KEY is required. Run: make extract-lesson LESSON=<N> ANTHROPIC_API_KEY=<key>"; exit 1; }
	ANTHROPIC_API_KEY=$(ANTHROPIC_API_KEY) bun scripts/extract-lesson.ts $(LESSON)

# ============================================================================
# HEALTH CHECKS
# ============================================================================

.PHONY: check-supabase
check-supabase: ## Check Supabase connectivity, CORS, schema, auth, and storage (uses .env.local)
	NODE_TLS_REJECT_UNAUTHORIZED=0 bun scripts/check-supabase.ts

.PHONY: check-supabase-deep
check-supabase-deep: ## Deep structural check: tables, RLS, grants (requires SUPABASE_SERVICE_KEY)
	@test -n "$(SUPABASE_SERVICE_KEY)" || { echo "Error: SUPABASE_SERVICE_KEY is required. Run: make check-supabase-deep SUPABASE_SERVICE_KEY=<key>"; exit 1; }
	NODE_TLS_REJECT_UNAUTHORIZED=0 SUPABASE_SERVICE_KEY=$(SUPABASE_SERVICE_KEY) bun scripts/check-supabase-deep.ts

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
