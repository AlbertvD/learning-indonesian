# Learning Indonesian

## Operating Context (read first — it changes what "good" means)

This app is **pre-launch / build-stage: a single learner (the author), and disposable data** — no production users, no FSRS history worth preserving (it is test data), lesson content re-derives from staging. This is load-bearing:

- **Do not add machinery whose only purpose is keeping a live system safe during change** — no maintenance-window choreography, no mixed-version coexistence layers, no additive-then-subtractive "provably inert" parity rollouts, no backfill-then-cleanup dances. Truncate and rebuild freely; an intermediate state may break the deployed app (nobody is there) as long as the code is coherent and tests pass.
- **What "good" means here, in order: simple, high-quality, maintainable code; fewer tokens in the build/generation pipeline; then runtime polish.** Correctness is assumed throughout. When a design trades simplicity for runtime safety that only matters with live users, drop the safety.
- A spec written under a live-system lens (most of `docs/plans/`) must be **re-derived against this context before implementing** — see Minimum Mechanism.

> Revisit this section at launch. Once there are real users with real history, the live-system safety machinery it tells you to skip becomes mandatory again.

## Minimum Mechanism (counterweight to "Quality Over Speed")

Everything below "Quality Over Speed", every `feedback_*` memory, and every gate punishes *under*-engineering — drift, missed edge cases, shallow modules. Almost nothing punishes *over*-engineering. The result is a standing bias toward convoluted, token-heavy solutions and toward implementing approved specs verbatim. Correct it: **unnecessary mechanism is a defect of the same severity as drift.**

- **⭐ Minimize the MEANS, never the GOAL — reaching the agreed deliverable is always the aspiration.** Minimum Mechanism is the *least mechanism that **fully reaches** the agreed goal*; the goal is the fixed constraint, mechanism the only free variable. Shrinking the deliverable to save effort is **goal-erosion / the "easy way out"** (`feedback_target_state_over_minimal_diff`) — the *opposite* of this rule, even when it wears the rule's name. "Do the minimum" must always mean *minimum path to the fixed goal*, never *minimum work including shrinking the goal*. If the goal genuinely should change, that is an **explicit decision with the user**, framed as a scope reduction ("spec says X; I propose Y because Z") — never a quiet mid-build narrowing dressed as pragmatism. (Lived example, 2026-06-07: the cap-v2 vocabulary slice was narrowed from "full `vocabulary/` module + lesson 11 e2e" down to distractors-only mid-build and called "minimum mechanism / over-scoped"; a reviewer was then dispatched with the *pre-narrowed* question, so its correct answer laundered the error. The clean read — "rebuild clean, don't untangle" — yields *less* mechanism **and** the full goal.)
- **The omission test** — for every new table, column, function, generated column, trigger, gate, enum value, abstraction, or layer, state in one line what breaks if it is omitted. If the honest answer is "a problem another part of *this same design* introduced," delete both the mechanism and the part that created the need. (Lived example, 2026-06-06: a generated `capability_type` column → forced dropping the type from the key → forced an axis-only uniqueness rule → forced a new `context_to_id` direction → plus a SQL-function↔enum sync health-check: five parts enforcing one consistency a single pre-write validator already gives. The whole chain was the defect; storing the type — as the live system already does — deletes all five.)
- **Cheapest mechanism that gives the guarantee.** A pre-write validator (the existing three-layer-gate habit) beats a DB generated column / trigger / + sync check unless a non-pipeline writer genuinely needs DB-level enforcement.
- **Approved ≠ immune.** `status: approved` means "passed review under its day's assumptions," not "implement verbatim." Re-derive it against Operating Context and strip what no longer earns its keep. Flagging over-engineering in an approved spec is expected, not insubordinate.
- **Tokens are complexity.** Re-running generation, re-publishing all lessons to diff for parity, or an LLM call a deterministic rule could replace — failing the bar even if correct.
- **"Durable target-state" ≠ maximal.** `feedback_target_state_over_minimal_diff` bans the band-aid that creates debt; it does **not** license extra parts. The durable choice is usually the *simpler* one.

### Preferred solutions (defaults; deviate only with a one-line reason)

| Fork | Default |
|---|---|
| Orchestration | thin composition of pure functions > stateful multi-file "runner" |
| Generation | deterministic selection from existing data > LLM generation (LLM only for genuinely creative work, e.g. grammar authoring) |
| Consistency enforcement | pre-write validator > DB generated column / trigger (+ sync check) |
| Identity | store it explicitly and keep it in the key > derive-and-drop |
| Changing a data shape (build-stage) | build the target and delete the old in one move > additive-then-subtractive parity rollout |
| Storage | typed column the DB + type-checker enforce > JSON blob |
| Touching an existing module | extend a composing primitive > a new parallel per-case branch; but rebuild clean > inherit a mid-cutover accreted module |

## Quality Over Speed

Prefer depth and accuracy over fast answers. These rules are non-negotiable:

- **Read code before describing it.** Never summarise how something works without reading the actual implementation. Cite file + line number for every behavioural claim.
- **Never delegate research to subagents when the task is understanding how the code works.** Subagents produce volume, not verified depth. Use Read/Grep directly.
- **For design and spec work: cover every edge case before writing.** An incomplete spec costs more to fix than a slow one costs to write.
- **If a question spans multiple files, read all of them before answering.** Do not answer from memory or inference.
- **When asked to be thorough, that means exhaustive — not "long."** Length is not thoroughness. Every claim must be grounded in what was actually read.
- **Missed edge cases caught after implementation cost more time than taking longer upfront.** Always choose the slower, more careful path.
- **Before drafting any plan under `docs/plans/`, ground it in the target architecture first.** Read `docs/target-architecture.md` for every `src/lib/<module>/` or `src/services/` file the plan would touch, and read the matching `docs/current-system/modules/<name>.md` spec. Cite the result in the plan ("the target architecture folds X into Y, so this plan lands at the new seam, not the legacy file") or explicitly note "no constraints found in target architecture for this surface." Why: a plan that adds code to a file slated for folding creates shallow-module drift the architecture explicitly warns against (`docs/target-architecture.md:130-137`). This rule was added 2026-05-21 after a dialogue_line plan was drafted that added parallel branches to a file slated for the `lib/exercise-content/` fold.
- **A spec that touches the data model needs BOTH `architect` and `data-architect` sign-off — architect alone is not review-complete.** When a `docs/plans/` spec touches schema, the typed content tables (`learning_items`, `translation_nl`, `item_meanings`, `item_answer_variants`, `capability_artifacts`, `learning_capabilities`, `lesson_*`, `grammar_patterns`, `exercise_variants`, …), a migration, or a writer/reader/validator contract, the orchestrator must dispatch the **`data-architect`** in addition to the `architect`, and record both in the plan's `reviewed_by:` frontmatter before marking it `status: approved`. The two agents own different lenses — `architect` = module placement / ADR fit / seams; `data-architect` = writer-reader-validator shape drift. Why: 2026-06-02, an approved spec's `CS19` gate was aimed at the wrong column (`item_meanings` vs the live `translation_nl`) and passed two `architect` rounds; only the `data-architect`'s triangle pass caught it. The pre-commit `plan-review-gate` enforces this at the harness level — an approved data-model plan missing `data-architect` from `reviewed_by` is blocked.
- **Before every `git commit`, run `git diff --cached --stat` and confirm the staged file list matches the commit message.** Never trust your memory of what you ran `git add` on — staging accumulates across agents, and other sessions may have staged files without your knowledge. If the file list doesn't match the message, `git reset` to unstage and re-stage only the files this commit is actually about. Mixed doc + code commits without explicit acknowledgement, or commits >5 files without the message enumerating them, are smells. Why: this session has shipped two commits that swept unintended files (one near-miss, one actual). The pre-commit hook `verify-staged-set-before-commit` enforces this at the harness level.

### Plan status awareness

Every `docs/plans/*.md` carries YAML frontmatter with a `status` field. **Read the frontmatter before reasoning from any plan.** A plan can be in one of four states:

| status | Meaning | How to treat it |
|---|---|---|
| `draft` | Spec being written; not yet approved | Forward-looking design; refuse to implement |
| `approved` | Architect-reviewed; not yet implemented | Forward-looking; safe to implement |
| `implementing` | A PR is open or merging | Verify against the in-flight PR before adding anything |
| `shipped` | Merged to main | **Changelog, not a spec.** Verify claims against the code at `implementation_paths`. Never treat as forward work. |

Frontmatter schema:

```yaml
---
status: shipped
implementation: PR #41                              # required when status=implementing or shipped
merged_at: 2026-05-09                               # required when status=shipped
implementation_paths:                               # required when status=shipped
  - scripts/lib/pipeline/lesson-stage/
supersedes: []                                      # optional
---
```

**Why this matters:** the failure mode this prevents is reasoning from a shipped plan as if it were forward work. The plan's prose describes the design *as planned*; the merged code is what was actually built. Plan prose lags code. When a plan ships, its frontmatter status updates to `shipped` and any subsequent analysis must anchor to the code, not the prose.

When you finish a PR that implements a plan, update the plan's frontmatter as part of the same commit. The PR template enforces this.

Grep for `grep -L "^status:" docs/plans/*.md` to find plans missing frontmatter — these need backfilling before any agent uses them.

## Module specs

Every deep module has a living spec at `docs/current-system/modules/<name>.md`. The spec is the contract: public interface, internal flow (functional, not stepwise), invariants, seams to other modules, known limitations. **Every behavioural claim cites `file:line`** so the spec stays verifiable as code drifts.

`docs/current-system/modules/lesson-renderer.md` is the canonical example.

### When to create a module spec

- Any new top-level folder under `src/lib/` is a deep module — write its spec when the second non-trivial file lands.
- Any non-trivial folder under `src/components/` that owns a coherent surface (the UI deep modules — `lessons/`, `experience/`, `exercises/primitives/`, `page/primitives/`, `progress/`).
- Any service that survives the target-architecture fold (per `docs/target-architecture.md` § Service specs).
- Any pipeline stage in `scripts/lib/pipeline/<stage>/` (`lesson-stage`, `capability-stage`, `podcast-stage`).

### When to update a module spec

When you change a module's public interface, internal flow, or invariants — **same commit as the code change**. Spec drift is treated like a code regression. The pre-commit hook does not enforce this yet; enforce it in code review.

### When to trust a module spec

As a starting point for navigation and as a map of seams to adjacent modules.

**Never as the authority for a behavioural claim.** For those, re-verify against the code at the cited `file:line`. Specs lag code; the code is authoritative. If you find spec drift, fix the spec as part of whatever you're working on.

### Before refactoring a module

Write or update its spec first. The before-spec is your diff target; the after-spec is your acceptance criterion. A fold without a before-spec produces code that's no easier to understand than the code it replaced.

### Navigating between specs

Each spec's §5 "Seams" lists upstream / downstream / sibling modules with concrete file paths. Each spec's "What this spec does NOT cover" section names which sibling spec answers the next question.

**To understand the system, follow the seam links — do not read every spec sequentially.** Specs pin each other down by saying what they don't cover; chase those pointers when the question shifts. Avoid grep-by-keyword when the spec graph already maps the dependency.

### Module spec frontmatter

```yaml
---
module: lesson-renderer
surface: src/components/lessons/
last_verified_against_code: 2026-05-14   # date the file:line cites were checked against the code
status: stable                            # stable | in-flight | partial
---
```

- `stable` — the module is settled; the spec should match code exactly.
- `in-flight` — actively being refactored; spec may be ahead of or behind code.
- `partial` — spec covers some surfaces but explicitly skips others (named in the spec's §7).

A spec with `last_verified_against_code` older than ~30 days should be re-verified before trusting any specific cite. The date is the spec's freshness signal.

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

All lesson, vocabulary, and podcast content is **deployed via scripts**, not through a UI. See `docs/process/content-pipeline.md` for the full authoring + publishing workflow (the 8 authoring steps, the 2-stage publish pipeline internals, agent invocations, failure-mode debugging).

### Two source-of-truth regimes (ADR 0011) — read this before reasoning about content

Content has **two** source-of-truth rules, split by layer. **Do not apply one to the other** — conflating them is what produced the capability-stage redesign confusion:

- **Lesson content** — `lessons`, `lesson_sections`, `lesson_dialogue_lines`, `audio_clips`: the material a learner *reads*. **Regime: pipeline-is-writer, DB-is-projection.** The canonical source is the staging files (`scripts/data/staging/lesson-N/*` + `scripts/data/lessons.ts`); a re-publish regenerates these tables from them. Migrations here are additive schema + re-publish + final cleanup — never SQL backfills. (This is the original rule; see `memory/feedback_pipeline_is_writer_not_db.md`.)
- **Capability content** — `learning_capabilities` and the typed capability / exercise / distractor tables: what FSRS *schedules*. **Regime: DB-authoritative after seeding (ADR 0011).** The Capability Stage is a generator/seeder, not a continuous projector: it seeds each capability once; routine re-runs are idempotent and additive-only (skip-if-exists on `normalized_text` / `canonical_key`); post-publish corrections live **in the DB** via the flag→agent loop (`CONTEXT.md` → Capability Review) and are **never** overwritten by a routine publish. `--regenerate <unit>` is the explicit, destructive opt-out.

**The Stage Contract follows from this:** the Capability Stage reads lesson content **from the database** (the typed lesson-content tables the Lesson Stage wrote), not from staging files. No staging file crosses the Lesson→Capability boundary. See `CONTEXT.md` → Stage Contract / Capability Stage / Capability Review, and the authoritative decision in **`docs/adr/0011-capability-content-is-db-authoritative-after-seeding.md`**.

### Runtime is unified — every lesson goes through the capability pipeline

`src/pages/Session.tsx` is the only production caller of any session builder, and it always invokes `buildSession({ enabled: true, ... })`. Every lesson in the live DB sits on `projection_version='capability-v3'` with `lesson_id` set on every non-podcast capability row. The lessons 1–3 "legacy projection" path was retired in 2026-05-21; the live DB confirmation is recorded in `docs/code-review-2026-05-20/README.md` §"2026-05-21 — Pattern I + retirement".

The legacy seed surface (`scripts/data/vocabulary.ts`, `scripts/seed-learning-items.ts`, the `seed-vocabulary` Makefile target) is **deleted**. Do not reintroduce it.

**`scripts/data/lessons.ts` is still live for display content.** It populates `lesson_sections` (the reader-facing material) only. Capability rows are projected off `learning_items` written by the capability-stage runner — vocabulary added only to `lessons.ts` will never become schedulable.

### Publish pipeline shape

`bun scripts/publish-approved-content.ts <N>` runs two stages in sequence: **Stage A = `runLessonStage`** (`scripts/lib/pipeline/lesson-stage/`) writes lessons + sections + page-blocks + audio_clips; **Stage B = `runCapabilityStage`** (`scripts/lib/pipeline/capability-stage/`) writes everything capability-related + learning_items. Stage A returns a `lesson.id`; Stage B requires it. Each stage has its own validators, enrichments, and adapter writes — see `docs/process/content-pipeline.md` for the detail.

### Derived staging files

The capability-stage runner regenerates `content-units.ts`, `capabilities.ts`, and `exercise-assets.ts` from canonical inputs (`learning-items.ts`, `grammar-patterns.ts`, `morphology-patterns.ts`) AFTER enrichment runs (POS, level, EN translations, dialogue NL propagation). **Hand-edits to these three files are overwritten on the next publish.** (`lesson-page-blocks.ts` was retired in PR 5 with the `lesson_page_blocks` table — bespoke per-lesson pages are the sole lesson renderer.)

### Publishing policy

Everything publishes immediately. There is no manual approval gate. All content publishes as-is. The pipeline always emits `quality_status: 'approved'` for generated artifacts. Review and correction happens live in the app via the admin account.

### Local content directories (gitignored)

```
content/
├── raw/             — source page images (per-lesson subdirs)
├── extracted/       — OCR + LLM intermediates
├── lessons/         — lesson audio files
└── podcasts/        — NotebookLM-generated podcast audio
```

### Migration source-of-truth rule

All schema changes that should reach the live DB via `make migrate` must land in `scripts/migration.sql` — that file is the canonical source applied by the pipeline. Files in `scripts/migrations/*.sql` are paper-trail audit logs and emergency rollback tools; **do NOT add new schema there**. See the comment block at the top of `scripts/migration.sql` for the per-policy `drop policy if exists; create policy ...` idiom that replaces the old bulk-drop pattern (removed 2026-05-08 — it silently wiped policies declared in standalone files).

**Before merging any change to `scripts/migration.sql`**, run `make migrate-idempotent-check` — it applies the file twice and asserts the second run leaves the DB green, catching the bulk-drop bug class.

`make migrate` requires `POSTGRES_PASSWORD` in `.env.local`. It SSHes to the homelab, runs the SQL via `docker exec supabase-db`, automatically reloads the PostgREST schema cache, and chains `check-supabase-deep` after applying SQL — any policy/grant regression is caught immediately. The service role key is NOT in the repo; get it from the Supabase dashboard on the homelab.

### Health checks (quick reference)

```bash
make check-supabase            # tier 1: API, CORS, schema exposure, auth, storage
make check-supabase-deep       # tier 2: tables, RLS, grants, policies (catches the 2026-05-02 RLS-no-policy class)
make migrate-idempotent-check  # gate before merging migration.sql changes
make pre-deploy                # full gauntlet: lint + test + build + tier 1 + tier 2
```

`make pre-deploy` is the documented gate before merging migration changes — GitHub Actions cannot reach the homelab, so this runs locally.

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

GitHub Actions builds and pushes to `ghcr.io/albertvd/learning-indonesian:latest` on every push to `main`. The homelab container recreate is **manual** — Portainer MCP (preferred, environment id `3`) or SSH (`mrblond@master-docker`, fallback). See `docs/process/deploy.md` for the full procedure with the verified pull/recreate/verify commands and the Traefik label set.

Architectural facts that matter:
- The container is managed directly via `docker run`, not docker-compose. The `homelab-configs/services/learning-indonesian/docker-compose.yml` is documentation only.
- Docker is **not** installed locally. All image operations happen on the homelab.
- Pre-deploy gate (run locally before merging anything touching `scripts/migration.sql`): `make pre-deploy` — GitHub Actions cannot reach the homelab.

## Admin design surfaces

Two admin-gated routes render every primitive in isolation + composition for visual review. Both require an admin row in `indonesian.user_roles`.

- **`/admin/design-lab`** — exercise framework primitives (`src/components/exercises/primitives/`). Established 2026-04-23. The 12 production exercise components in `src/components/exercises/implementations/` consume these primitives via the runtime registry (Session → registry → implementations/).
- **`/admin/page-lab`** — page framework primitives (`src/components/page/primitives/`) plus the seam-contract smoke test (PageContainer fit + PageBody variant=fit at iPhone 390×844). Established 2026-04-25. As of 2026-05-01, **16 of 18 user-facing page surfaces are on the framework** (Dashboard, Lessons, LessonReader internals, Lesson wrapper, Profile, Leaderboard, Podcasts, Podcast detail, Progress, Login, Register, Session chrome, LocalPreview, ContentReview, ExerciseCoverage, SectionCoverage). The remaining two (`AdminGuard`, `DesignLab`) are intentionally excluded. See `docs/current-system/page-framework-status.md` for the full map and residuals.

Use these when iterating on primitive visuals or validating that a refactor didn't regress the rendered output.

When adding a new page, prefer composing `PageContainer` / `PageBody` / `PageHeader` + the relevant card primitives over hand-rolled `<Container>` + `<Title>` + `<Paper>`. If a page has a recurring shape that no existing primitive covers (the `MediaShowcaseCard` extraction during the Lessons travel-journal redesign is the canonical example), extract a new primitive rather than letting the page drift into bespoke CSS.

## Data Model Overview

| Table | Who writes | Who reads |
|-------|-----------|-----------|
| `lessons`, `lesson_sections`, `podcasts` | Admin via scripts | All authenticated users |
| `learning_items`, `item_meanings`, `item_contexts`, `grammar_patterns`, `exercise_variants` | Pipeline (capability-stage) | All authenticated users |
| `learning_capabilities`, `content_units` | Pipeline | All authenticated users |
| `learner_capability_state`, `capability_review_events` | Capability review processor (server RPC) | Row owner |
| `learner_lesson_activation` | `set_lesson_activation` RPC | Row owner |
| `lesson_progress`, `learning_sessions` | Row owner / lazy materialiser | All (for leaderboard) |
| `leaderboard` | View (read-only) | All authenticated users |

Admin access is controlled via the `indonesian.user_roles` table — no separate auth role needed. For the full schema reference (including legacy-retained and retired tables) see `docs/current-system/data-model.md`.

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

| Where | What you'll find |
|---|---|
| `docs/target-architecture.md` | The locked-in module roster the codebase is migrating toward (status: not yet built). Reference for fold decisions. |
| `docs/adr/` | Architecture Decision Records — the *why* behind the capability system (0001 capability core, 0002 stages derived, 0003 FSRS on capabilities, 0004 atomic review commits, 0005 lesson reader passivity, 0006 every lesson-derived capability has an introducing lesson, 0008 retire generic capability_artifacts, 0009 typed-table-per-content-concept, 0010 wire grammar via pattern capabilities, **0011 capability content is DB-authoritative after seeding** — the source-of-truth split in § Content Management, **0012 stage responsibilities + no-disk Capability Stage** — Lesson Stage owns ingestion + learner-facing enrichment incl. translations; Capability Stage reads only the DB, **0013 the Lesson Gate** — the Lesson Stage's self-contained, three-layer, fresh-lesson-safe certification of one lesson's output; decomposes the monolithic `lint-staging` into stage-specific gates). |
| `docs/current-system/` | Living reference docs of the *current* implementation. See `README.md` for the index. |
| `docs/current-system/modules/` | Per-module specs (see "Module specs" above). |
| `docs/process/` | Operational workflows: `content-pipeline.md` (authoring + 2-stage publish), `deploy.md` (homelab container recreate). |
| `docs/plans/` | Forward-looking specs (`draft`/`approved`/`implementing`). Shipped plans are archived to `/Users/albert/home/learning-indonesian-archive/`. See `ARCHIVE.md` at repo root. |

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

## Agent skills

### Issue tracker

Issues and PRDs live as GitHub issues on `AlbertvD/learning-indonesian`, via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

The default five-role vocabulary (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). `wontfix` pre-existed; the other four were created during setup. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` + `docs/adr/` at the repo root, plus the living `docs/current-system/modules/<name>.md` specs. See `docs/agents/domain.md`.
