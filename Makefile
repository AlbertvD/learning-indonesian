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

.PHONY: backup-cloud
backup-cloud: ## Local backup of cloud learner + auth data (pg_dump, content excluded — it is regenerable)
	bun scripts/backup-cloud.ts

.PHONY: backup-cloud-full
backup-cloud-full: ## Local backup of the ENTIRE cloud database, including regenerable content
	bun scripts/backup-cloud.ts --full

.PHONY: seed-lessons
seed-lessons: ## Seed lesson content (requires SUPABASE_SERVICE_KEY)
	@test -n "$(SUPABASE_SERVICE_KEY)" || { echo "Error: SUPABASE_SERVICE_KEY is required."; exit 1; }
	NODE_TLS_REJECT_UNAUTHORIZED=0 SUPABASE_SERVICE_KEY=$(SUPABASE_SERVICE_KEY) bun scripts/seed-lessons.ts

.PHONY: seed-podcasts
seed-podcasts: ## Seed podcast metadata and upload audio from content/podcasts/ (requires SUPABASE_SERVICE_KEY)
	@test -n "$(SUPABASE_SERVICE_KEY)" || { echo "Error: SUPABASE_SERVICE_KEY is required."; exit 1; }
	NODE_TLS_REJECT_UNAUTHORIZED=0 SUPABASE_SERVICE_KEY=$(SUPABASE_SERVICE_KEY) bun scripts/seed-podcasts.ts

