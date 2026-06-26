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

.PHONY: audit
audit: ## Fail on any advisory in a PRODUCTION dependency (what ships / runs). devDependency advisories (eslint/vite/vitest/jsdom/workbox build+test tooling, offline pipeline) never reach the deployed static bundle, so --prod is the signal-not-noise gate. Re-classify offline-only tools as devDependencies to keep this clean.
	bun audit --prod

# ============================================================================
# DATABASE
# ============================================================================

.PHONY: migrate
migrate: ## Apply Supabase schema migration via psql + run schema-health check (requires POSTGRES_PASSWORD in .env.local)
	@test -n "$(POSTGRES_PASSWORD)" || { echo "Error: POSTGRES_PASSWORD is required (add to .env.local)"; exit 1; }
	NODE_TLS_REJECT_UNAUTHORIZED=0 SUPABASE_DB_PASSWORD=$(POSTGRES_PASSWORD) bun scripts/migrate.ts
	@echo ""
	@echo "→ Running schema-health check to catch RLS / grant regressions..."
	@if [ -n "$(SUPABASE_SERVICE_KEY)" ]; then \
		$(MAKE) check-supabase-deep SUPABASE_SERVICE_KEY=$(SUPABASE_SERVICE_KEY) || { echo ""; echo "❌ Migration applied but post-migration health check failed."; echo "   Review the output above and fix before deploying."; exit 1; }; \
	else \
		echo "⚠  SUPABASE_SERVICE_KEY not set; skipping post-migration health check."; \
		echo "   Run: make check-supabase-deep SUPABASE_SERVICE_KEY=<key>  to verify manually."; \
	fi

.PHONY: migrate-idempotent-check
migrate-idempotent-check: ## Apply migration.sql twice + assert schema-health output is identical between runs (catches bulk-drop-class bugs without false-positives from pre-existing data gaps)
	@test -n "$(POSTGRES_PASSWORD)" || { echo "Error: POSTGRES_PASSWORD is required (add to .env.local)"; exit 1; }
	@test -n "$(SUPABASE_SERVICE_KEY)" || { echo "Error: SUPABASE_SERVICE_KEY is required (add to .env.local)"; exit 1; }
	@echo "→ First migrate.ts run..."
	@NODE_TLS_REJECT_UNAUTHORIZED=0 SUPABASE_DB_PASSWORD=$(POSTGRES_PASSWORD) bun scripts/migrate.ts
	@echo "→ Capturing schema-health snapshot after run 1..."
	@$(MAKE) -s check-supabase-deep SUPABASE_SERVICE_KEY=$(SUPABASE_SERVICE_KEY) > /tmp/migrate-idem-1.txt 2>&1 || true
	@echo "→ Second migrate.ts run..."
	@NODE_TLS_REJECT_UNAUTHORIZED=0 SUPABASE_DB_PASSWORD=$(POSTGRES_PASSWORD) bun scripts/migrate.ts
	@echo "→ Capturing schema-health snapshot after run 2..."
	@$(MAKE) -s check-supabase-deep SUPABASE_SERVICE_KEY=$(SUPABASE_SERVICE_KEY) > /tmp/migrate-idem-2.txt 2>&1 || true
	@echo "→ Comparing snapshots..."
	@if diff -q /tmp/migrate-idem-1.txt /tmp/migrate-idem-2.txt > /dev/null; then \
		echo ""; \
		echo "✅ migrate.ts is idempotent — second run produced identical schema-health output."; \
		echo "   (Pre-existing failures unrelated to this run remain unchanged — see snapshot in /tmp/migrate-idem-1.txt for live state.)"; \
	else \
		echo ""; \
		echo "❌ Idempotency regression: schema-health output differed between runs."; \
		echo "   This typically means a CREATE statement is missing a paired DROP IF EXISTS,"; \
		echo "   or a bulk-DROP loop is wiping policies the file does not recreate."; \
		echo ""; \
		echo "Diff (run-1 → run-2):"; \
		diff /tmp/migrate-idem-1.txt /tmp/migrate-idem-2.txt; \
		exit 1; \
	fi

.PHONY: seed-lessons
seed-lessons: ## Seed lesson content (requires SUPABASE_SERVICE_KEY)
	@test -n "$(SUPABASE_SERVICE_KEY)" || { echo "Error: SUPABASE_SERVICE_KEY is required."; exit 1; }
	NODE_TLS_REJECT_UNAUTHORIZED=0 SUPABASE_SERVICE_KEY=$(SUPABASE_SERVICE_KEY) bun scripts/seed-lessons.ts

.PHONY: seed-podcasts
seed-podcasts: ## Seed podcast metadata and upload audio from content/podcasts/ (requires SUPABASE_SERVICE_KEY)
	@test -n "$(SUPABASE_SERVICE_KEY)" || { echo "Error: SUPABASE_SERVICE_KEY is required."; exit 1; }
	NODE_TLS_REJECT_UNAUTHORIZED=0 SUPABASE_SERVICE_KEY=$(SUPABASE_SERVICE_KEY) bun scripts/seed-podcasts.ts

.PHONY: seed-lesson-audio
seed-lesson-audio: ## Upload lesson audio files from content/lessons/ to indonesian-lessons storage (requires SUPABASE_SERVICE_KEY)
	@test -n "$(SUPABASE_SERVICE_KEY)" || { echo "Error: SUPABASE_SERVICE_KEY is required."; exit 1; }
	NODE_TLS_REJECT_UNAUTHORIZED=0 SUPABASE_SERVICE_KEY=$(SUPABASE_SERVICE_KEY) bun scripts/seed-lesson-audio.ts

.PHONY: seed-sentences
seed-sentences: ## Seed sentence/cloze learning items (requires SUPABASE_SERVICE_KEY)
	@test -n "$(SUPABASE_SERVICE_KEY)" || { echo "Error: SUPABASE_SERVICE_KEY is required."; exit 1; }
	NODE_TLS_REJECT_UNAUTHORIZED=0 SUPABASE_SERVICE_KEY=$(SUPABASE_SERVICE_KEY) bun scripts/extract-cloze-items.ts

.PHONY: seed-cloze-contexts
seed-cloze-contexts: ## Seed cloze contexts from staging (requires SUPABASE_SERVICE_KEY and LESSON=<n>)
	@test -n "$(SUPABASE_SERVICE_KEY)" || { echo "Error: SUPABASE_SERVICE_KEY is required."; exit 1; }
	@test -n "$(LESSON)" || { echo "Error: LESSON=<number> is required."; exit 1; }
	NODE_TLS_REJECT_UNAUTHORIZED=0 SUPABASE_SERVICE_KEY=$(SUPABASE_SERVICE_KEY) bun scripts/seed-cloze-contexts.ts $(LESSON)

.PHONY: seed-all
seed-all: seed-lessons seed-podcasts seed-sentences ## Seed all non-audio content (requires SUPABASE_SERVICE_KEY)

# ============================================================================
# CONTENT PIPELINE
# ============================================================================

.PHONY: convert-heic
convert-heic: ## Convert HEIC photos to JPG (requires LESSON)
	@test -n "$(LESSON)" || { echo "Error: LESSON is required. Run: make convert-heic LESSON=<N>"; exit 1; }
	bun scripts/convert-heic-to-jpg.ts $(LESSON)

.PHONY: ocr-pages
ocr-pages: ## OCR textbook pages to text (requires LESSON, requires tesseract)
	@test -n "$(LESSON)" || { echo "Error: LESSON is required. Run: make ocr-pages LESSON=<N>"; exit 1; }
	@which tesseract > /dev/null || { echo "Error: tesseract not found. Run: brew install tesseract tesseract-lang"; exit 1; }
	bun scripts/ocr-pages.ts $(LESSON)

.PHONY: parse-lesson
parse-lesson: ## Parse OCR text into structured staging files (requires LESSON)
	@test -n "$(LESSON)" || { echo "Error: LESSON is required. Run: make parse-lesson LESSON=<N>"; exit 1; }
	bun scripts/parse-lesson-content.ts $(LESSON)

.PHONY: review
review: ## Start the review UI (tools/review/)
	cd tools/review && bun run dev

.PHONY: pipeline
pipeline: convert-heic ocr-pages parse-lesson ## Run full pipeline steps 1-3 (requires LESSON)
	@echo "\n✓ Pipeline complete. Run 'make review' to review and edit content."

.PHONY: spoken-variants
spoken-variants: ## Generate spoken variant tracks from verified transcript (requires LESSON)
	@test -n "$(LESSON)" || { echo "Error: LESSON is required. Run: make spoken-variants LESSON=<N>"; exit 1; }
	bun scripts/generate-spoken-variants.ts $(LESSON)

.PHONY: spoken-variants-dry
spoken-variants-dry: ## Preview spoken variants without writing files (requires LESSON)
	@test -n "$(LESSON)" || { echo "Error: LESSON is required. Run: make spoken-variants-dry LESSON=<N>"; exit 1; }
	bun scripts/generate-spoken-variants.ts $(LESSON) --dry-run

.PHONY: generate-audio
generate-audio: ## Generate per-section TTS audio (requires LESSON; optional: GOOGLE_TTS_API_KEY or --mock)
	@test -n "$(LESSON)" || { echo "Error: LESSON is required. Run: make generate-audio LESSON=<N> [MOCK=1]"; exit 1; }
	bun scripts/generate-section-audio.ts $(LESSON) $(if $(MOCK),--mock,)

.PHONY: asr-qa
asr-qa: ## Run ASR quality gate on generated audio (requires LESSON; optional: GOOGLE_STT_API_KEY or --mock)
	@test -n "$(LESSON)" || { echo "Error: LESSON is required. Run: make asr-qa LESSON=<N> [MOCK=1]"; exit 1; }
	bun scripts/asr-quality-gate.ts $(LESSON) $(if $(MOCK),--mock,)

.PHONY: audio-pipeline
audio-pipeline: generate-audio asr-qa ## Run full audio pipeline: TTS + ASR quality gate (requires LESSON)

.PHONY: publish-content
publish-content: ## Publish approved content to Supabase (requires LESSON)
	@test -n "$(LESSON)" || { echo "Error: LESSON is required. Run: make publish-content LESSON=<N>"; exit 1; }
	NODE_TLS_REJECT_UNAUTHORIZED=0 SUPABASE_SERVICE_KEY=$(SUPABASE_SERVICE_KEY) bun scripts/publish-approved-content.ts $(LESSON)

.PHONY: publish-lesson-content
publish-lesson-content: ## Stage-A-only publish: lesson content + Lesson Gate, no capability generation (requires LESSON)
	@test -n "$(LESSON)" || { echo "Error: LESSON is required. Run: make publish-lesson-content LESSON=<N>"; exit 1; }
	NODE_TLS_REJECT_UNAUTHORIZED=0 SUPABASE_SERVICE_KEY=$(SUPABASE_SERVICE_KEY) bun scripts/publish-lesson-content.ts $(LESSON)

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

.PHONY: check-supabase-rls
check-supabase-rls: ## RLS deny-path check: signs in as test user + admin, verifies RLS policies (uses .env.local)
	NODE_TLS_REJECT_UNAUTHORIZED=0 bun scripts/check-supabase-rls.ts

.PHONY: pre-deploy
pre-deploy: ## Run the full pre-deploy gauntlet: lint + tests + build + Supabase health checks
	@echo "→ Lint..."
	@$(MAKE) -s lint
	@echo ""
	@echo "→ Tests..."
	@$(MAKE) -s test
	@echo ""
	@echo "→ Production build..."
	@$(MAKE) -s build
	@echo ""
	@echo "→ Dependency audit (production deps only)..."
	@$(MAKE) -s audit
	@echo ""
	@echo "→ Supabase tier-1 connectivity..."
	@$(MAKE) -s check-supabase
	@echo ""
	@echo "→ Supabase deep schema health (RLS + policies + grants)..."
	@test -n "$(SUPABASE_SERVICE_KEY)" || { echo "❌ SUPABASE_SERVICE_KEY required for deep check. Run: make pre-deploy SUPABASE_SERVICE_KEY=<key>"; exit 1; }
	@$(MAKE) -s check-supabase-deep SUPABASE_SERVICE_KEY=$(SUPABASE_SERVICE_KEY)
	@echo ""
	@echo "✅ All pre-deploy checks passed."

.PHONY: check-exercise-coverage
check-exercise-coverage: ## Check that every grammar pattern has all required exercise types in staging
	bun scripts/check-exercise-coverage.ts

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

# ============================================================================
# AI CONTENT PIPELINE (lessons 4+)
# ============================================================================

.PHONY: build-sections
build-sections: ## Structure raw grammar/exercise sections via Claude (requires LESSON and ANTHROPIC_API_KEY)
	@test -n "$(LESSON)" || { echo "Error: LESSON is required. Run: make build-sections LESSON=<N>"; exit 1; }
	@test -n "$(ANTHROPIC_API_KEY)" || { echo "Error: ANTHROPIC_API_KEY is required (add to .env.local)"; exit 1; }
	bun scripts/build-sections.ts $(LESSON) $(if $(FORCE),--force,) $(if $(DRY_RUN),--dry-run,)

.PHONY: generate-exercises
generate-exercises: ## Generate exercise candidates via Claude (requires LESSON and ANTHROPIC_API_KEY)
	@test -n "$(LESSON)" || { echo "Error: LESSON is required. Run: make generate-exercises LESSON=<N>"; exit 1; }
	@test -n "$(ANTHROPIC_API_KEY)" || { echo "Error: ANTHROPIC_API_KEY is required (add to .env.local)"; exit 1; }
	bun scripts/generate-exercises.ts $(LESSON) \
		$(if $(PATTERN),--pattern $(PATTERN),) \
		$(if $(TYPES),--types $(TYPES),) \
		$(if $(FORCE),--force,) \
		$(if $(DRY_RUN),--dry-run,)

.PHONY: linguist
linguist: build-sections generate-exercises ## Run full linguist-creator pass: structure sections then generate exercises (requires LESSON)

.PHONY: catalog-sections
catalog-sections: ## Catalog lesson sections via Claude OCR+vision (requires LESSON and ANTHROPIC_API_KEY)
	@test -n "$(LESSON)" || { echo "Error: LESSON is required. Run: make catalog-sections LESSON=<N>"; exit 1; }
	@test -n "$(ANTHROPIC_API_KEY)" || { echo "Error: ANTHROPIC_API_KEY is required (add to .env.local)"; exit 1; }
	bun scripts/catalog-lesson-sections.ts $(LESSON) \
		$(if $(LEVEL),--level $(LEVEL),) \
		$(if $(MODULE),--module $(MODULE),) \
		$(if $(FORCE),--force,)

.PHONY: staging-files
staging-files: ## Generate staging files from catalog (requires LESSON)
	@test -n "$(LESSON)" || { echo "Error: LESSON is required. Run: make staging-files LESSON=<N>"; exit 1; }
	bun scripts/generate-staging-files.ts $(LESSON) $(if $(FORCE),--force,)

.PHONY: full-pipeline
full-pipeline: catalog-sections staging-files linguist ## Run full AI content pipeline steps 3-5 (requires LESSON and ANTHROPIC_API_KEY)
