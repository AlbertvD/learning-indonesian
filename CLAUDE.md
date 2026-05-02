# Learning Indonesian

## Quality Over Speed

Prefer depth and accuracy over fast answers. These rules are non-negotiable:

- **Read code before describing it.** Never summarise how something works without reading the actual implementation. Cite file + line number for every behavioural claim.
- **Never delegate research to subagents when the task is understanding how the code works.** Subagents produce volume, not verified depth. Use Read/Grep directly.
- **For design and spec work: cover every edge case before writing.** An incomplete spec costs more to fix than a slow one costs to write.
- **If a question spans multiple files, read all of them before answering.** Do not answer from memory or inference.
- **When asked to be thorough, that means exhaustive — not "long."** Length is not thoroughness. Every claim must be grounded in what was actually read.
- **Missed edge cases caught after implementation cost more time than taking longer upfront.** Always choose the slower, more careful path.

Indonesian language tutor app — React frontend connecting directly to a shared self-hosted Supabase instance.

## Architecture

**Frontend-only.** No custom backend. All data goes directly from the React app to Supabase via the JS client. The app is deployed as a static Nginx container behind Traefik on the homelab.

- **Supabase instance:** `https://api.supabase.duin.home` (shared with family-hub)
- **Database schema:** `indonesian` (all app tables live here, isolated from other apps)
- **Auth:** Shared with family-hub — one login works across both apps
- **Storage buckets:** `indonesian-lessons`, `indonesian-podcasts` (public read)
- **Homelab URL:** `indonesian.duin.home`

## Tech Stack

- React 19 + TypeScript + Vite (SWC)
- Mantine UI v8 + Tabler Icons
- Dark/Light mode support (persisted via localStorage)
- NL/EN language switching (persisted in user profile)
- Collapsible sidebar navigation
- Zustand 5 (state management)
- React Router 7
- Supabase JS v2
- vite-plugin-pwa (PWA / add to home screen)
- Bun (package manager + script runner)

## Implementation Autonomy

When implementing architectural plans (e.g., retention-v2, feature designs):

- **Execute batches independently** — Complete tasks without asking for permission between each one
- **Commit after each logical task** — Each commit represents a completed step from the plan
- **Report progress periodically** — Summarize what was implemented at the end of a work session rather than after each task
- **Stop only for blockers** — Pause if you hit a dependency issue, need clarification on requirements, or tests fail unexpectedly
- **Use the executing-plans skill** — Follow it directly when implementing multi-step plans; the skill guidance overrides default checkpoint behavior

This keeps momentum high while maintaining code quality through testing and pre-commit checks.

## Error Handling

Every error the user can encounter must have a meaningful, user-friendly message. Never show raw error strings, Supabase error codes, or technical details to the user.

**Rules:**
- All async operations (Supabase queries, auth, storage) must catch errors and display a notification via Mantine's `notifications.show()`
- Error messages explain what went wrong in plain language and, where possible, what the user can do next
- Use `notifications.show({ color: 'red', title: '...', message: '...' })` for errors
- Map known Supabase/auth error codes to friendly messages (e.g. `invalid_credentials` → "Incorrect email or password")
- Unknown errors fall back to: "Something went wrong. Please try again."
- Never `console.error` as the only error handling — always surface it to the user

**Example:**
```typescript
try {
  await authStore.signIn(email, password)
} catch (err) {
  const msg = err instanceof AuthApiError && err.code === 'invalid_credentials'
    ? 'Incorrect email or password.'
    : 'Something went wrong. Please try again.'
  notifications.show({ color: 'red', title: 'Login failed', message: msg })
  logError({ page: 'login', action: 'signIn', error: err })
}
```

## Logging

Errors are logged to `indonesian.error_logs` in Supabase. This keeps logs in the self-hosted stack with no extra infrastructure — queryable from the Supabase dashboard.

**Schema:**
```sql
indonesian.error_logs (
  id, user_id, page, action, error_message, error_code, created_at
)
```

**Usage:** Use the `logError` helper from `src/lib/logger.ts` whenever an error is caught. Always log the technical detail even when showing a friendly message to the user.

```typescript
import { logError } from '@/lib/logger'

catch (err) {
  notifications.show({ color: 'red', title: 'Failed', message: 'Something went wrong.' })
  logError({ page: 'review', action: 'submitCard', error: err })
}
```

The `logError` function is fire-and-forget — it never throws or blocks the UI. Logs are write-only for authenticated users (no user can read logs via the app — admin queries them directly in Supabase).

## Supabase Connection

The client uses **`@supabase/ssr`** (`createBrowserClient`) instead of the standard `@supabase/supabase-js` `createClient`. This stores the session in a cookie scoped to `.duin.home` instead of `localStorage`, enabling future SSO with other apps on the same domain (e.g. family-hub).

```typescript
// src/lib/supabase.ts
import { createBrowserClient } from '@supabase/ssr'

export const supabase = createBrowserClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
  {
    cookieOptions: {
      domain: '.duin.home',
      path: '/',
      sameSite: 'lax',
      secure: true,
    },
  }
)
```

The API is identical to the standard supabase-js client — all queries, auth calls, and storage calls work the same way.

**Reference implementation:** `/Users/albert/home/splinterlabs/homelab-ai/openbrain/ui/src/lib/supabase/client.ts` (uses same pattern on `.ntry.home`)

**SSO status:**
- learning-indonesian: cookie-based (`.duin.home`) ✅
- family-hub: localStorage-based — session not shared yet, but same credentials work. Migrating family-hub to cookies is a separate future task.

**Auth store pattern (critical):** When fetching user data (e.g. `user_progress`) immediately after sign-in, always wrap the fetch in `setTimeout(0)` to avoid a Supabase auth deadlock:

```typescript
supabase.auth.onAuthStateChange(async (_event, session) => {
  if (session?.user) {
    setTimeout(() => fetchUserProgress(session.user.id), 0)
  }
})
```

**Required homelab-configs changes before this app works:**

These two changes must be made in the `homelab-configs` repo before developing or deploying:

1. **PostgREST schema exposure** — add `indonesian` to `PGRST_DB_SCHEMAS` in `services/supabase/docker-compose.yml`:
   ```
   PGRST_DB_SCHEMAS: public,storage,graphql_public,indonesian
   ```
   Requires PostgREST container restart (brief blip for family-hub).

2. **Kong CORS origins** — add the Indonesian app's domains to `services/supabase/kong/kong.yml`:
   ```yaml
   origins:
     - https://indonesian.duin.home
     - http://indonesian.duin.home
   ```
   Requires Kong image rebuild + restart (brief blip for family-hub). The Kong image bakes in the ANON_KEY — rebuild is triggered by pushing to `homelab-configs` main.

**Data isolation:** The `indonesian` schema is completely invisible to family-hub. Once the two changes above are live, developing against the shared Supabase instance carries no risk of affecting family-hub data.

## Email

Email is **not configured** on the self-hosted Supabase instance. GoTrue has `GOTRUE_MAILER_AUTOCONFIRM: true` — users are auto-confirmed on signup, no verification email is sent.

**Do not implement:**
- Email confirmation flows
- Password reset via email
- Any email notifications

Password resets are handled by an admin via Supabase Studio. If email is needed in the future it's a GoTrue SMTP config change — no app code changes required.

## Key Conventions

- Path alias `@/` maps to `src/`
- Supabase client: `src/lib/supabase.ts`
- All Supabase queries use `.schema('indonesian')` — never query the public schema directly
- Auth store: `src/stores/authStore.ts` wraps `supabase.auth`
- Services in `src/services/` — one file per domain (cards, lessons, podcasts, progress, leaderboard)
- Zustand stores in `src/stores/` — one file per domain
- No Axios — all HTTP via Supabase JS client

## Content Management

All lesson, vocabulary, and podcast content (including audio files) is **deployed via scripts**, not through any UI.

### Two content paths — choose based on lesson number

> **Critical:** Lessons 1–3 and lessons 4+ use completely different pipelines. Mixing them up causes vocabulary to appear in the lesson reader but never be schedulable in review sessions.

| | Lessons 1–3 (legacy) | Lessons 4+ (pipeline) |
|---|---|---|
| Source of truth | `scripts/data/lessons.ts` + `vocabulary.ts` | `scripts/data/staging/lesson-N/` |
| Vocabulary seeding | `make seed-vocabulary` → `vocabulary` table | `publish-approved-content.ts` → `learning_items` table |
| Exercise scheduling | Runtime from `vocabulary` table | Runtime from `learning_items` + `exercise_variants` |
| Seed command | `make seed-lessons` + `make seed-vocabulary` | `bun scripts/publish-approved-content.ts <N>` |

**Never add vocabulary to `lessons.ts` for lessons 4+.** `lessons.ts` only populates display content (`lesson_sections`) — vocabulary in it will never be schedulable in review sessions. For lessons 4+, vocabulary lives in staging files and is published via `publish-approved-content.ts`.

---

### Adding a new lesson (lessons 4+) — full pipeline

New lessons start as physical coursebook pages photographed with a phone.

**Publishing policy:** Everything publishes immediately. There is no manual approval gate. All content (`pending_review` and `approved`) is published as-is. Review and correction happens live in the app via the admin account.

**Step 1 — Photograph pages**
Place photos in `content/raw/lesson-<N>/` as JPEGs or HEICs.

**Step 2 — Convert and OCR**
```bash
bun scripts/convert-heic-to-jpg.ts <N>   # convert HEIC to JPG
bun scripts/ocr-pages.ts <N>             # extract text via Tesseract → content/extracted/lesson-N/page-N.txt
```

**Step 3 — LLM section catalog** *(requires ANTHROPIC_API_KEY)*
```bash
bun scripts/catalog-lesson-sections.ts <N> [--level A1] [--force]
```
Claude reads every extracted page, identifies section boundaries from Dutch headers, fully parses vocabulary/expressions/numbers/dialogue/text items, and captures grammar/exercises/pronunciation as raw text. Each vocabulary/expression/number item is tagged with a part-of-speech value from the 12-value taxonomy (`verb, noun, adjective, adverb, pronoun, numeral, classifier, preposition, conjunction, particle, question_word, greeting`) for distractor filtering in runtime MCQ exercises. Reviews photos alongside OCR text to recover content the OCR missed.
Output: `scripts/data/staging/lesson-<N>/sections-catalog.json`

> **Legacy lessons (1–3) shortcut:** If the lesson content already lives in Supabase (lesson_sections + learning_items), skip steps 1–4 and run:
> ```bash
> bun scripts/reverse-engineer-staging.ts <N>
> ```
> This pulls lesson_sections and learning_items from the DB and writes sections-catalog.json, lesson.ts, and learning-items.ts directly. Grammar sections are already fully structured in the DB so no OCR or LLM catalog step is needed. Go straight to Step 5 (Linguist Creator).

**Step 4 — Generate staging files**
```bash
bun scripts/generate-staging-files.ts <N>
```
Deterministic. Reads catalog → writes `lesson.ts` (all display sections) and `learning-items.ts` (vocabulary/expressions/numbers/dialogue items). Scaffolds empty `grammar-patterns.ts`, `candidates.ts`, `cloze-contexts.ts` if absent.

**Step 5 — Linguist Structurer**
Run the `linguist-structurer` agent to structure grammar/exercise sections in `lesson.ts`, extract grammar patterns, do web research, and build the pattern brief.
Output: updated `lesson.ts`, `grammar-patterns.ts`, `pattern-brief.json`

**Step 6 — Exercise & Cloze Creators** (can run in parallel)
Run three agents:
- `grammar-exercise-creator` — generates grammar exercise candidates. Output: `candidates.ts`
- `vocab-exercise-creator` — authors curated distractors for vocab exercises. Output: `vocab-enrichments.ts`
- `cloze-creator` — generates cloze context sentences. Output: `cloze-contexts.ts`

**Step 7 — Linguist Reviewer**
Run the `linguist-reviewer` agent to validate all pipeline output against payload contracts, slug uniqueness, and distractor quality.
Output: `scripts/data/staging/lesson-<N>/review-report.json`

If `review-report.json` status is `needs_revision` (CRITICAL issues only): re-run the agent that produced the flagged file, then reviewer. Repeat until `approved`. WARNINGs are flagged for admin review in the app and do not block publishing.

**Step 7 — Publish**
```bash
bun scripts/publish-approved-content.ts <N> --dry-run   # preview
bun scripts/publish-approved-content.ts <N>             # publish
```
Publishes everything in one shot: lesson sections, vocabulary items, grammar patterns, cloze contexts, and exercise variants. All `pending_review` content is included. The `NODE_TLS_REJECT_UNAUTHORIZED=0` flag is built into the script for the homelab's internal CA.

The publish script runs quality gates at every step and exits non-zero on failure. If it fails, the `content-seeder` agent routes back to the appropriate linguist agent. Common failure → agent mappings:
- Invalid `context_type` or empty `translation_nl` in staging → **linguist-structurer** or **cloze-creator**
- Unresolved cloze slugs → **cloze-creator**
- Missing NL meanings after publish → re-run; if persistent → **linguist-structurer**
- Broken candidate payloads → **grammar-exercise-creator**
- Invalid POS value on a learning item → **linguist-structurer** (re-run catalog-lesson-sections.ts to retag)
- Missing POS on word/phrase items → WARNING only; publish succeeds. Distractor quality degrades for affected items until POS is populated.

### Staging files reference

| File | Written by | Purpose |
|---|---|---|
| `sections-catalog.json` | `catalog-lesson-sections.ts` | LLM classification output — source of truth for lesson.ts and learning-items.ts |
| `lesson.ts` | `generate-staging-files.ts` + `linguist-structurer` | Display sections for lesson reader |
| `learning-items.ts` | `generate-staging-files.ts` | Schedulable FSRS items. Includes `pos` per word/phrase item (carried from catalog). |
| `grammar-patterns.ts` | `linguist-structurer` | Grammar patterns with slug + complexity |
| `pattern-brief.json` | `linguist-structurer` | Intermediate artifact: vocab pool, research notes, pattern list |
| `candidates.ts` | `grammar-exercise-creator` | Authored grammar exercise variants |
| `vocab-enrichments.ts` | `vocab-exercise-creator` | Curated distractors for vocab exercises |
| `cloze-contexts.ts` | `cloze-creator` | Cloze sentences per vocabulary item |
| `review-report.json` | `linguist-reviewer` | Review status and flagged issues |
| `index.ts` | `generate-staging-files.ts` | Barrel export |

---

### Adding a new lesson (legacy — lessons 1–3 only)

These lessons predate the pipeline. Their content lives in `scripts/data/lessons.ts` and `vocabulary.ts`.

**Do not use this path for lessons 4+.**

```bash
make seed-lessons SUPABASE_SERVICE_KEY=<key>
make seed-vocabulary SUPABASE_SERVICE_KEY=<key>
make seed-podcasts SUPABASE_SERVICE_KEY=<key>      # uploads audio to Supabase Storage
```

---

### Text content (in repo)

```
scripts/data/
├── lessons.ts              — LEGACY: display sections for lessons 1–3 only
├── vocabulary.ts           — LEGACY: vocabulary for lessons 1–3 only
├── podcasts.ts             — podcast metadata and transcripts (all lessons)
└── staging/
    └── lesson-N/           — PIPELINE: source of truth for lessons 4+
        ├── lesson.ts       — lesson structure + sections
        ├── learning-items.ts — vocabulary with review_status
        ├── grammar-patterns.ts — grammar pattern enrichment
        └── candidates.ts   — exercise candidates
```

### Local files (not in repo)
All local content files are gitignored. Directories:

```
content/
├── raw/             — source page images (gitignored)
│   └── lesson-<N>/ — one subdirectory per lesson
├── extracted/       — intermediate JSON + plain-text exports (gitignored)
├── lessons/         — lesson audio files (gitignored)
└── podcasts/        — NotebookLM-generated podcast audio (gitignored)
```

### Deploying content

**Lessons 4+ (pipeline):**
```bash
bun scripts/publish-approved-content.ts <N> --dry-run
bun scripts/publish-approved-content.ts <N>
```

**Lessons 1–3 (legacy) and shared infrastructure:**
```bash
make migrate                                     # apply schema via SSH → docker exec (idempotent, re-runnable)
make seed-lessons SUPABASE_SERVICE_KEY=<key>
make seed-vocabulary SUPABASE_SERVICE_KEY=<key>
make seed-podcasts SUPABASE_SERVICE_KEY=<key>    # uploads audio from content/podcasts/
make seed-flashcards SUPABASE_SERVICE_KEY=<key>  # seeds public decks from vocabulary
make seed-all SUPABASE_SERVICE_KEY=<key>         # lessons + vocabulary (legacy only)
```

`make migrate` requires `POSTGRES_PASSWORD` in `.env.local`. It SSHes into the homelab (`mrblond@192.168.2.51`), runs the SQL via `docker exec supabase-db`, and automatically reloads the PostgREST schema cache. Safe to re-run after any container recreation.

The service role key is NOT stored in the repo. Get it from the Supabase dashboard on the homelab.

### Health checks

```bash
make check-supabase       # tier 1: API, CORS, schema exposure, auth, storage (uses .env.local)
make check-supabase-deep  # tier 2: tables, RLS, grants, policies via schema_health() RPC
make pre-deploy           # full gauntlet: lint + test + build + check-supabase + check-supabase-deep
```

Run `check-supabase` any time you suspect infrastructure issues. Run `check-supabase-deep` after migrations to verify schema state — it now also fails if any RLS-enabled table has zero policies (catches the 2026-05-02 regression where `lesson_page_blocks` and 9 other tables ended up RLS-on with no SELECT policy after a deploy).

`make migrate` automatically chains `check-supabase-deep` after applying SQL — any policy/grant regression introduced by a migration is caught immediately rather than after deploying to prod.

`make pre-deploy` is the documented gate to run before merging migration changes to main. GitHub Actions cannot reach the homelab, so this gate runs locally. All three scripts print actionable fix instructions on failure.

## Testing

Write tests for every new feature where possible. The project uses **Vitest** + **@testing-library/react** + **@testing-library/user-event**.

```bash
bun run test         # run all tests
bun run test:watch   # watch mode
bun run test:ui      # Vitest UI
```

**Core principle: test from the user's perspective.** Tests should simulate what a real user does — clicking buttons, filling in forms, navigating — not call service functions directly. The Supabase client is mocked so tests run without a real database.

**Testing layers:**

| Layer | Tool | Example |
|-------|------|---------|
| Pure logic (SM-2, formatters) | Vitest unit tests | `calculateNextReview('good', 2.5, 1, 0)` |
| User interactions | RTL + userEvent | user types email, clicks login, sees dashboard |
| Store behaviour | Vitest + store actions | login updates auth state, error clears on retry |

**Example pattern:**
```typescript
it('lets a user log in and see the dashboard', async () => {
  vi.mocked(supabase.auth.signInWithPassword).mockResolvedValue({ data: mockSession, error: null })
  render(<App />)
  await userEvent.type(screen.getByLabelText('Email'), 'user@example.com')
  await userEvent.type(screen.getByLabelText('Password'), 'password')
  await userEvent.click(screen.getByRole('button', { name: /log in/i }))
  expect(await screen.findByText('Dashboard')).toBeInTheDocument()
})
```

**What not to test:**
- Simple presentational components with no logic
- The Supabase JS client itself

Tests live in `src/__tests__/` or colocated as `*.test.tsx`. Mock the Supabase client with `vi.mock('@/lib/supabase')`.

## Development

```bash
bun install          # install dependencies
bun run dev          # dev server at localhost:5173
bun run build        # production build
bun run test         # run tests
bun run lint         # lint
```

`.env.local` (gitignored) must contain:
```
VITE_SUPABASE_URL=https://api.supabase.duin.home
VITE_SUPABASE_ANON_KEY=<anon key>
SUPABASE_SERVICE_KEY=<service role key>   # for make check-supabase-deep
POSTGRES_PASSWORD=<postgres password>     # for make migrate
```

## Deployment

The image is built automatically via **GitHub Actions** on every push to `main` (workflow: "Build and Push Docker Image"). The built image is pushed to `ghcr.io/albertvd/learning-indonesian:latest`.

### Deploying a new version

1. **Push to main** — GitHub Actions builds and pushes the image automatically.

2. **Wait for the build** — monitor with:
   ```bash
   gh run list --repo AlbertvD/learning-indonesian --limit 5
   gh run watch <run-id> --repo AlbertvD/learning-indonesian
   ```

3. **Pull the new image on the homelab** — ghcr.io is not reachable from the Portainer container, so pull via SSH:
   ```bash
   ssh mrblond@master-docker "sudo docker pull ghcr.io/albertvd/learning-indonesian:latest"
   ```

4. **Recreate the container** — stop, remove, and relaunch with the same labels:
   ```bash
   ssh mrblond@master-docker "sudo docker stop learning-indonesian && sudo docker rm learning-indonesian && sudo docker run -d \
     --name learning-indonesian \
     --restart unless-stopped \
     --network proxy \
     --label 'traefik.enable=true' \
     --label 'traefik.http.routers.learning-indonesian.rule=Host(\`indonesian.duin.home\`)' \
     --label 'traefik.http.routers.learning-indonesian.entrypoints=websecure' \
     --label 'traefik.http.routers.learning-indonesian.tls.certresolver=stepca' \
     --label 'traefik.http.routers.learning-indonesian.middlewares=duinhuis-auth@docker' \
     --label 'traefik.http.services.learning-indonesian.loadbalancer.server.port=80' \
     --label 'traefik.http.routers.learning-indonesian-static.rule=Host(\`indonesian.duin.home\`) && (Path(\`/manifest.webmanifest\`) || PathRegexp(\`^/pwa-icon\`))' \
     --label 'traefik.http.routers.learning-indonesian-static.entrypoints=websecure' \
     --label 'traefik.http.routers.learning-indonesian-static.tls.certresolver=stepca' \
     --label 'traefik.http.routers.learning-indonesian-static.service=learning-indonesian' \
     ghcr.io/albertvd/learning-indonesian:latest"
   ```

5. **Verify** — check the container is running:
   ```bash
   ssh mrblond@master-docker "sudo docker inspect learning-indonesian --format '{{.State.Status}} — image: {{.Config.Image}}'"
   ```

**Note:** Docker is not installed locally. All image operations happen on the homelab via SSH (`mrblond@master-docker`). The Portainer MCP can list containers (environment ID 3) but cannot pull images — ghcr.io is unreachable from the Portainer host network.

The `docker-compose.yml` reference in `homelab-configs/services/learning-indonesian/` is kept for documentation but the container is managed directly via `docker run` as above.

## Admin design surfaces

Two admin-gated routes render every primitive in isolation + composition for visual review. Both require an admin row in `indonesian.user_roles`.

- **`/admin/design-lab`** — exercise framework primitives (`src/components/exercises/primitives/`). Established 2026-04-23. The 12 production exercise components in `src/components/exercises/implementations/` consume these primitives via the runtime registry (Session → registry → implementations/).
- **`/admin/page-lab`** — page framework primitives (`src/components/page/primitives/`) plus the seam-contract smoke test (PageContainer fit + PageBody variant=fit at iPhone 390×844). Established 2026-04-25. As of 2026-05-01, **16 of 18 user-facing page surfaces are on the framework** (Dashboard, Lessons, LessonReader internals, Lesson wrapper, Profile, Leaderboard, Podcasts, Podcast detail, Progress, Login, Register, Session chrome, LocalPreview, ContentReview, ExerciseCoverage, SectionCoverage). The remaining two (`AdminGuard`, `DesignLab`) are intentionally excluded. See `docs/current-system/page-framework-status.md` for the full map and residuals.

Use these when iterating on primitive visuals or validating that a refactor didn't regress the rendered output.

When adding a new page, prefer composing `PageContainer` / `PageBody` / `PageHeader` + the relevant card primitives over hand-rolled `<Container>` + `<Title>` + `<Paper>`. If a page has a recurring shape that no existing primitive covers (the `MediaShowcaseCard` extraction during the Lessons travel-journal redesign is the canonical example), extract a new primitive rather than letting the page drift into bespoke CSS.

## Data Model Overview

| Table | Who writes | Who reads |
|-------|-----------|-----------|
| `lessons`, `podcasts`, `vocabulary` | Admin via scripts | All authenticated users |
| `user_progress`, `lesson_progress`, `learning_sessions` | Row owner | All (for leaderboard) |
| `card_sets`, `anki_cards` | Owner | Owner + shared users + public |
| `leaderboard` | View (read-only) | All authenticated users |

Admin access is controlled via `indonesian.user_roles` table — no separate auth role needed.

## Sharing Model (Card Sets)

Card sets have three visibility levels:
- `private` — owner only
- `shared` — owner + specific users listed in `card_set_shares`
- `public` — all authenticated users

## Feature Design Rule: Supabase Requirements

Every design document MUST include a **"Supabase Requirements"** section. No feature design is complete without it. If a line item does not apply, mark it `N/A` with a one-line reason — never omit the section.

```markdown
## Supabase Requirements

### Schema changes
- New tables / columns (add to `scripts/migration.sql` and `scripts/migrate.ts`)
- RLS policies needed — who can read/write each table (anon, authenticated, owner-only)
- Grants needed (anon SELECT, authenticated INSERT/UPDATE/DELETE)

### homelab-configs changes
- [ ] PostgREST: new schema exposure needed? (edit `PGRST_DB_SCHEMAS` in `services/supabase/docker-compose.yml`)
- [ ] Kong: new CORS headers or origins needed? (edit `services/supabase/kong/kong.yml`, rebuild image)
- [ ] GoTrue: auth config changes? (edit `services/supabase/docker-compose.yml`)
- [ ] Storage: new buckets needed? Public or private? (create via Studio or seed script)

### Health check additions
- New checks to add to `scripts/check-supabase.ts` (functional, anon key)
- New checks to add to `scripts/check-supabase-deep.ts` (structural, service key)
```

## Docs

- Design: `docs/plans/2026-03-16-learning-indonesian-design.md`
- Implementation plan: `docs/plans/2026-03-16-learning-indonesian-implementation.md`

## Related Repos

- `homelab-configs` — Traefik config, docker-compose for deployment, original app source in `Indonesian app/`
- `family-hub` — shares the same Supabase instance; reference for Dockerfile pattern and Supabase client setup

## Supabase Infrastructure Fixes

When encountering Supabase permission errors, auth errors, or API errors (e.g. `password authentication failed`, CORS rejections, missing schema exposure), **do not fix these by making changes directly inside the running container or database**. Those changes are lost on container recreate or volume wipe.

Instead, fix them by modifying the relevant config files in the `homelab-configs` repo so the fix survives redeployment:

- **PostgreSQL auth errors** (`pg_hba.conf`) → edit the Dockerfile at `services/supabase/postgres/Dockerfile` in `homelab-configs` (Postgres reads `/etc/postgresql/pg_hba.conf`, baked into the image — not the data dir file)
- **Kong CORS / routing issues** → edit `services/supabase/kong/kong.yml` and rebuild the Kong image
- **PostgREST schema exposure** → edit `PGRST_DB_SCHEMAS` in `services/supabase/docker-compose.yml`

After committing the fix to `homelab-configs`, apply it to the live container manually (e.g. `docker exec` + reload, or rebuild + redeploy) so it takes effect immediately without waiting for the next full redeploy.

## Homelab Infrastructure

This app runs on a self-hosted homelab. For infrastructure details see `/Users/albert/home/homelab-configs/`.

Key facts relevant to this app:
- **Reverse proxy:** Traefik — handles routing and TLS termination for all services
- **TLS certificates:** Issued by Step-CA (internal CA); cert resolver name in Traefik labels is `stepca`. TLS fullchain must include leaf cert + Root CA (Safari fails with leaf-only)
- **Docker network:** All services join the external `proxy` network — Traefik discovers them via container labels
- **Supabase:** Self-hosted at `https://api.supabase.duin.home`. Kong is the API gateway in front of PostgREST, GoTrue, and Storage. CORS must include `Accept-Profile` and `Content-Profile` headers (required by supabase-js)
- **Data persistence:** App data lives in the Supabase PostgreSQL instance. No local storage volumes needed for this app
- **Internal networking:** Services communicate over internal Docker networks via HTTP. Only external-facing URLs use HTTPS via Traefik
