# GEMINI.md - Learning Indonesian

Indonesian language tutor app — React frontend connecting directly to a shared self-hosted Supabase instance.

## Project Context
- **Architecture:** Frontend-only React app.
- **Backend:** Shared self-hosted Supabase instance (`https://api.supabase.duin.home`).
- **Database Schema:** All tables live in the `indonesian` schema (not `public`).
- **Auth:** Shared with `family-hub`; uses `@supabase/ssr` with cookie-based sessions on `.duin.home`.

## Tech Stack
- **Framework:** React 19 + TypeScript + Vite (SWC)
- **UI:** Mantine UI v8 + Tabler Icons
- **State:** Zustand 5
- **Routing:** React Router 7
- **Database/Auth:** Supabase JS v2 (`@supabase/ssr`)
- **Package Manager:** Bun

## Core Mandates for Gemini

### 1. Supabase Queries
- **ALWAYS** specify the schema: `supabase.schema('indonesian').from('table_name')`.
- **NEVER** query the `public` schema directly unless explicitly required for auth-related metadata.

### 2. Error Handling & Notifications
- Use Mantine's `notifications.show()` for all user-facing errors.
- **NEVER** show raw error strings or technical codes to the user.
- Map known error codes to friendly messages.
- **Log all errors** using the `logError` helper from `@/lib/logger`.

### 3. Path Aliases
- Use `@/` for `src/` (e.g., `import { ... } from '@/lib/supabase'`).

### 4. Auth & Session Management
- Use `createBrowserClient` from `@supabase/ssr` for the Supabase client.
- When fetching data immediately after auth state changes, use `setTimeout(0)` to avoid deadlocks.

### 5. Supabase Infrastructure Fixes

When encountering Supabase permission errors, auth errors, or API errors (e.g. `password authentication failed`, CORS rejections, missing schema exposure), **do not fix these by making changes directly inside the running container or database**. Those changes are lost on container recreate or volume wipe.

Instead, fix them by modifying the relevant config files in the `homelab-configs` repo so the fix survives redeployment:

- **PostgreSQL auth errors** (`pg_hba.conf`) → edit `services/supabase/postgres/init.sh` in `homelab-configs`
- **Kong CORS / routing issues** → edit `services/supabase/kong/kong.yml` and rebuild the Kong image
- **PostgREST schema exposure** → edit `PGRST_DB_SCHEMAS` in `services/supabase/docker-compose.yml`

After committing the fix to `homelab-configs`, apply it to the live container manually (e.g. `docker exec` + reload, or rebuild + redeploy) so it takes effect immediately without waiting for the next full redeploy.

### 6. Git & Husky Hooks
- **Pre-commit:** Automatically runs type checking (`tsc`) and linting (`eslint`). Fix all issues before committing.
- **Pre-push:** Automatically runs tests (`vitest`). Ensure all tests pass before pushing.

## Content Management Workflow
1. **Photograph pages:** Place in `content/raw/lesson-<N>/`.
2. **Extract:** `make extract-lesson LESSON=<N> ANTHROPIC_API_KEY=<key>`.
3. **Audio:** Generate via NotebookLM, save to `content/podcasts/lesson-<N>.mp3`.
4. **Deploy:** Use `make seed-all` and `make seed-podcasts` (once implemented).

## Makefile Commands
- **Development:** `make dev`, `make build`, `make lint`, `make typecheck`.
- **Testing:** `make test`, `make test-watch`.
- **Database:** `make migrate`, `make seed-lessons`, `make seed-vocabulary`, `make seed-podcasts`, `make seed-flashcards`, `make seed-all`, `make extract-lesson`.
- **Docker:** `make docker-build`, `make docker-run`.

## Coding Standards
- **Services:** Group logic in `src/services/` by domain (one file per domain).
- **Stores:** Use Zustand stores in `src/stores/`.
- **Icons:** Use `@tabler/icons-react`.
- **Styling:** Prefer Mantine components and theme-based styling.
- **Scripts:** Data files live in `scripts/data/`, extraction scripts in `scripts/`.

## Testing Strategy
- **Framework:** Vitest + React Testing Library.
- **Mocking:** Always mock the Supabase client (`vi.mock('@/lib/supabase')`).
- **Perspective:** Test from the user's perspective (interactions, finding text) rather than implementation details.
- **Location:** Tests live in `src/__tests__/` or are colocated as `*.test.tsx`.

## Reference Implementation
- Refer to `CLAUDE.md` for detailed infrastructure and deployment facts if needed.
- Refer to `family-hub` (local repo) for similar patterns in Supabase setup.
