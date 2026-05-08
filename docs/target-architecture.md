# Target Architecture — learning-indonesian

**Document version:** 2026-05-07
**Status:** Architectural lock-in. Not yet built. Migration plan pending.

---

## How to use this document

This document captures the **target architecture** the codebase will migrate to. It is the result of a multi-pass design conversation that worked through every runtime module, identified what should fold, what should split, what should retire, and what should stay.

When you (a future contributor or AI working in a fresh context window) need to flesh out detailed specs for a specific module, this document gives you:

- The architectural rules every module must obey.
- Each module's scope, public API, internal structure, dependencies, and consumers.
- A complete inventory of code marked for deletion, with reasoning.
- The migration considerations and open items.

Treat this as the **intended state**. The current codebase still reflects pre-decision shapes; the migration plan to take it from here to there is open work.

When extending this — adding a module, retiring something, changing a rule — preserve the same level of specificity. Vague specs in this document defeat its purpose.

---

## Architectural rules

These rules underpin every module decision. They were derived during the design conversation and apply to all future work.

### 1. Module shape

> **A feature lives in `src/lib/<name>/` only if at least one of its functions hides non-trivial logic.** CRUD-shaped data adapters stay in `src/services/`. Cross-cutting platform utilities stay in `src/lib/` root. Forcing a thin transport into `lib/` creates module-shaped containers around nothing.

The *promotion criterion* — when does something graduate from `services/` to `lib/<name>/`? — is concrete: when at least one function hides logic a caller couldn't trivially inline.

### 2. Hexagonal modules

> **Domain modules own their model, their logic, and their I/O adapter.** They expose a narrow public API via `index.ts`. Internal files are private to the module.

This is the "fold the service into the module" pattern: types in `model.ts`, pure logic in dedicated files, adapter in `adapter.ts`, public surface in `index.ts`. Whether a function makes a network call vs computes locally is an implementation detail of the module.

### 3. One job per module

> **Each module has one job — one verb that operates on the noun**, or one cohesive set of operations on a single domain.

Capabilities is the noun; everything else (scheduling, planning, rendering, analytics) is a verb. When a module name says "X-and-Y," it's two modules.

### 4. Determinism wherever possible

> **Read functions are pure projections of state.** Calling them N times with identical inputs produces identical outputs. No random tie-breaking, no generative randomness.

`buildSession`, `resolveBlock`, every `analytics.*` function — all pure. Side effects (random distractor picking, FSRS commits) are explicitly named where they happen.

### 5. Read and write are separate concerns

> **The `analytics/` module is read-only.** A single per-answer write goes through `answerCommitService → commit-capability-answer-report`. Writes for instrumentation, if added later, are a separate write path; they are not the same module as the readers.

### 6. One source of truth per concept

> **No concept is stored in two places.** Sessions are derived from answers (no separate lifecycle table). Capabilities are projected once at publish (no runtime re-projection). FSRS lives only on the server (no browser shadow). Daily targets are not stored (no goal subsystem).

When two stores hold the same conceptual data, they drift. The cure is to pick one as canonical and derive the other.

### 7. No back-edges

> **The DAG flows in one direction.** Shared modules (capabilities, srs) → runtime modules → server. The pipeline reads shared modules and writes to the same backend the runtime reads.

`lib/<runtime>/` modules do not import from `services/` or `components/`. `lib/capabilities/` does not import from `lib/session-builder/` or `lib/scheduling/`. Cycles get fixed.

### 8. Shared modules are explicit

> **A "shared" module is one used by both runtime and pipeline.** Runtime usually consumes the types + a small subset of functions; pipeline consumes the heavy logic. Physical co-location is what keeps contracts (canonical keys, FSRS params) from drifting.

Shared modules get a third category in the architecture diagram, alongside runtime modules and the local pipeline.

### 9. User-driven gates over inferred ones

> **When something gates eligibility, prefer an explicit user act over inference from interactions.** A checkbox is honest; a heuristic that infers "the user has been exposed enough" requires tracking infrastructure that mostly doesn't earn its weight.

Applied: the source-progress state machine retired in favour of a per-lesson activation checkbox.

### 10. Don't keep dead infrastructure on speculation

> **If a subsystem has no live use case, retire it. Build event tracking later, around real needs, when there are actual events to track.**

Applied: the goal subsystem, browser FSRS, the source-progress events, grammar-state, audio multi-voice path, event log. All retired because their live callers had vanished or their motivating product layer (goals) was retired.

---

## Architecture overview

Five categories of code:

```
RUNTIME MODULES         deep modules in src/lib/<name>/
                        own model + logic + adapter
                        runtime-only

SHARED MODULES          deep modules used by both runtime and pipeline
                        co-located in src/lib/<name>/ or supabase/functions/_shared/<name>/

THIN PLATFORM ADAPTERS  in src/services/
                        transport-only, no domain logic
                        one-method or small-method services

CROSS-CUTTING UTILITIES in src/lib/ root
                        platform helpers used by many modules
                        not domain-bound

LOCAL PIPELINE          in scripts/
                        runs only on developer's machine
                        produces published content
```

### Module roster (full)

| Category | Module | Status |
|---|---|---|
| Runtime | `lib/auth/` | LOCKED |
| Runtime | `lib/profile/` | LOCKED |
| Runtime | `lib/session-builder/` | LOCKED |
| Runtime | `lib/exercise-content/` | LOCKED |
| Runtime | `lib/lessons/` | LOCKED |
| Runtime | `lib/distractors/` | LOCKED |
| Runtime | `lib/analytics/` | LOCKED (incl. mastery sub-module) |
| Runtime | `lib/audio` | LOCKED (single file) |
| Shared | `lib/capabilities/` | LOCKED |
| Shared | `supabase/functions/_shared/srs/` | LOCKED |
| Service | `services/answerCommitService` | LOCKED |
| Service | `services/podcastService` | LOCKED (stays — no module) |
| Service | `services/exerciseAvailabilityService` | LOCKED (stays — no module) |
| Service | `services/loggerService` (or `lib/logger.ts`) | LOCKED (stays in `lib/` root) |
| Server | `supabase/functions/commit-capability-answer-report` | LOCKED |
| Local | `scripts/lib/pipeline/` | LOCKED (Plate IV) |

### Data flow at runtime

```
[Dashboard]
  Streak · retention · mastery · ambient counts          ← analytics
  [ Today ]   ← only call-to-action
       │
       ▼
[Preview screen]
  buildSession(userId, 'today', now)                    ← session-builder
    └─ uses analytics.upcoming.dueCapabilities
    └─ uses lessons/, capabilities/ types
  Show summary
  [ Start ] [ Cancel ]
       │
       ▼
[Session]
  for each block:
    resolveBlock(block, ctx)                            ← exercise-content
      └─ uses distractors/, audio, capabilities types
    render via components/exercises/implementations/
    on answer:
      answerCommitService.commit(...)                   ← thin transport
        → POST /functions/v1/commit-capability-answer-report
              → inferRating + computeNextState           ← _shared/srs
              → write learner_capability_state
              → append capability_review_events
              → upsert learning_sessions (end_time)
```

Lesson practice / review uses the same flow with `mode: 'lesson_practice'` or `'lesson_review'` and a `lessonId`, launched from the lessons list.

The session entity is derived from the answer log: `learning_sessions.end_time = MAX(answer.created_at)` per session id, upserted by the commit edge function. There is no explicit session lifecycle.

---

## Runtime module specs

### `lib/auth/`

**Boundary.** Lives in `src/lib/auth/`. Owns identity, session, and authorization. The only place outside the module that talks to Supabase auth is `src/lib/supabase.ts` itself (cookie configuration), and that's because the cookie scope is part of auth's contract even though the file lives one level below.

**Public API.**

```ts
useAuth() → {
  user:    AuthUser | null
  status:  'loading' | 'authenticated' | 'unauthenticated'
  signIn(email, password)  → Promise<void>
  signUp(email, password)  → Promise<void>
  signOut()                → Promise<void>
}

useIsAdmin() → boolean

<ProtectedRoute>{children}</ProtectedRoute>
<AdminGuard>{children}</AdminGuard>

getAccessTokenSync() → string | null   // for surviving beacon paths
```

**Hides.**
- Cookie scoping (`.duin.home` in prod, omitted on localhost — browsers reject domain cookies served from localhost).
- Sign-in deadlock workaround: `setTimeout(0)` after sign-in before fetching user data, per CLAUDE.md.
- JWT tracking for synchronous beacons (`getAccessTokenSync` mirror via `onAuthStateChange`).
- Auth-state subscription wiring; broadcast to React via Zustand store.
- Role lookup: queries `indonesian.user_roles` once and caches per-user.
- Error mapping: Supabase auth error codes → user-friendly messages (per CLAUDE.md error-handling rules).
- Email-flow absence: GoTrue is configured with `MAILER_AUTOCONFIRM=true`. There is no password-reset email, no confirmation email. The module documents that absence.

**Module structure.**

```
src/lib/auth/
  index.ts            barrel: useAuth, useIsAdmin, ProtectedRoute,
                      AdminGuard, getAccessTokenSync, types
  model.ts            AuthUser, AuthError, AuthStatus
  store.ts            Zustand store (body of today's authStore.ts)
  guards.tsx          <ProtectedRoute>, <AdminGuard>
  hooks.ts            useAuth, useIsAdmin
  errors.ts           Supabase error code → user-friendly message
  adapter.ts          supabase.auth.* calls + user_roles query +
                      setTimeout deadlock pattern + onAuthStateChange wiring
```

Approximately 250–300 LOC total.

**Depends on.** `src/lib/supabase.ts`, the Supabase auth schema (managed externally; `supabase.auth.*` is the only API), `indonesian.user_roles` table.

**Consumed by.** `pages/Login.tsx`, `pages/Register.tsx`, `App.tsx` (route wrapping), admin surfaces, anything authenticated (the JWT cookie is sent automatically by supabase-js).

**Not part of this module.**
- User profile data (display name, language, preferences) — that's `lib/profile/`.
- The Supabase client itself (platform infrastructure).
- Email flows — not implemented and not planned.
- SSO with family-hub — future work, but the cookie scope is the architectural seam that enables it.
- Login/Register page UI — JSX lives in `pages/`; logic lives here.

**Open considerations.**
- `useIsAdmin` could become `lib/permissions/` if RBAC grows beyond a single role.
- The cookie config in `lib/supabase.ts` is technically auth's contract; could move into auth's adapter, or stay where it is and be documented as auth's responsibility.

---

### `lib/profile/`

**Boundary.** Lives in `src/lib/profile/`. Owns user-personalisation data — display name and UI language. Separate from `lib/auth/` on GDPR grounds (purpose limitation, granular erasure policies).

**Public API.**

```ts
getProfile(userId)                → Promise<Profile>
updateDisplayName(userId, name)   → Promise<void>
updateLanguage(userId, 'nl' | 'en')  → Promise<void>

// types
Profile { id, displayName, language, createdAt, updatedAt }
```

**Hides.** Direct Supabase calls against `indonesian.profiles`. The `display_name` → `displayName` snake/camel mapping. The default language fallback (`'nl'` if not set).

**Module structure.**

```
src/lib/profile/
  index.ts            barrel
  model.ts            Profile type
  adapter.ts          getProfile, updateDisplayName, updateLanguage
```

~30 LOC. Single responsibility.

**Depends on.** `src/lib/supabase.ts`, `indonesian.profiles` table.

**Consumed by.** `pages/Profile.tsx` (settings UI), `lib/auth/` indirectly (when displaying the user's name in nav), `i18n` setup (reading the language preference).

**Not part of this module.**
- Audio-related preferences (autoplay, listening). Those live in `lib/audio`.
- Identity/auth concerns. Those live in `lib/auth/`.

**Note on `preferred_session_size`:** column lives in `indonesian.profiles` (this module's table) and survives — pedagogy stack consumes it for queue sizing (loadBudgets, sessionPosture, queueDrying, capabilitySessionLoader, pedagogyPlanner). The original retirement list claimed this column would die; grep proved otherwise during retirement #4 (2026-05-07).

**GDPR hooks (planned, not yet built).**

```ts
exportForUser(userId) → { displayName, language }
purgeForUser(userId)  → anonymise display name, reset language to default
```

These hooks pair with a future `lib/user-data-rights/` orchestrator that enumerates personal-data hooks across all domain modules. Not built; documented for when the GDPR work becomes pressing.

---

### `lib/session-builder/`

**Boundary.** Lives in `src/lib/session-builder/`. Called from the preview screen on a button press, and freely from anywhere else that wants to know what would be in the next session (Dashboard preview, tests, dev surfaces). Pure read: no DB writes, no side effects, no identity minted.

**Public API.**

```ts
buildSession(input: {
  userId:    string
  mode:      'today' | 'lesson_practice' | 'lesson_review'
  lessonId?: string                  // required for lesson_*
  now:       Date
}) → Promise<SessionPlan>

// stage functions exposed for previews / tests / introspection:
listEligibleCapabilities(input) → Capability[]
decideLoadBudget(input)         → LoadBudgetDecision
composeQueue(eligible, budget)  → SessionBlock[]
```

**SessionPlan shape.**

```ts
SessionPlan {
  blocks:           SessionBlock[]      // ordered: { capabilityId, exerciseType }
  audibleTexts:     string[]            // for the player to prefetch TTS
  labels:           Record<…, string>   // per-block UI labels
  planningSignals:  PlanningSignals     // backlog pressure, load budget, posture
  diagnostics:      PlanningDiagnostic[]
}
```

**Determinism.** `buildSession` is a deterministic function of `input` + state at time `now`. Two calls with identical inputs produce identical output (modulo state changes between calls). **There is no re-roll feature** — the same items would be due. Implication: the planner is a *query*, not a generator. It can be called as many times as needed (preview, retry, refresh) without risk.

**Hides.**
- Lesson eligibility — capabilities are eligible only if their owning lesson is activated by the learner (single boolean, replaced the source-progress state machine).
- Pedagogic order — known-word coverage, intro before practice.
- FSRS due-filtering — delegated to `analytics.upcoming.dueCapabilities` (read-only projection of state).
- Load budget — how many items belong in this queue (internal policy, not user-visible target).
- Backlog pressure / session posture.
- Queue composition — mix of due / new / weak.
- Queue drying — fallback when the due pool is empty.
- Item identity / review idempotency.
- Audible-text collection (for prefetch).
- Per-block label generation.

**Module structure (after fold-in from current scattered files).**

```
src/lib/session-builder/
  index.ts                 barrel
  model.ts                 SessionPlan, SessionBlock, PlanningSignals,
                           PlanningDiagnostic, ResolveContext
  builder.ts               buildSession orchestrator
  eligibility.ts           lesson activation gate + capability filtering
                           (folds isLessonActivated check)
  pedagogy.ts              known-word coverage, intro-before-practice rules
                           (folds lib/pedagogy/sessionPosture, lessonIntroduction,
                            knownWordCoverage)
  loadBudget.ts            decide queue size given backlog / activity
                           (folds lib/pedagogy/loadBudgets)
  compose.ts               final queue composition + drying fallback
                           (folds lib/session/sessionComposer, queueDrying)
  audibleTexts.ts          collect audible texts for prefetch
                           (folds lib/session/collectAudibleTexts)
  itemIdentity.ts          stable session-item identity + idempotency keys
                           (folds lib/session/sessionItemIdentity)
  labels.ts                per-block UI labels
                           (folds lib/session/sessionLabels, learnerSkillLabels)
  signals.ts               planning signals derivation
                           (folds lib/session/sessionPlanningSignals)
  adapter.ts               read-only Supabase queries for capability state,
                           lesson activation, FSRS state
                           (folds capabilitySessionDataService.ts)
```

Approximately 1500 LOC total — the largest runtime module by far, reflecting the depth of pedagogical policy.

**Depends on.**
- `lib/capabilities/` — types + projection
- `lib/lessons/` — `listActivatedLessons(userId)` for the activation gate
- `lib/analytics/` — `upcoming.dueCapabilities` (read-only due-list projection)
- A read adapter against `learner_capability_state`, `learner_lesson_activation`, `learning_capabilities`, `capability_review_events`

**External dependencies.** None. All reads against the runtime DB via PostgREST.

**Consumed by.** `pages/Session.tsx` (preview screen + session start). Possibly `pages/Dashboard.tsx` for previews if added.

**Not part of this module.**
- Session lifecycle. There is no `startSession`/`endSession`. The `learning_sessions` row is a derived view of the answer log; `scheduling.commitAnswerReport` upserts it (insert if absent, update `end_time = MAX(existing, NEW answer.created_at)` on every commit). Each call to `buildSession` represents a new session boundary; the *first answer* tagged with that boundary materialises a row.
- Capability content resolution. Blocks are abstract (`capabilityId + exerciseType`). `lib/exercise-content/` inflates one block at a time, at render time.
- Per-answer scheduling. `_shared/srs/` (server-side) owns the FSRS commit.
- Rendering. `components/exercises/` consumes the inflated `RenderPlan`.

**Open considerations.**
- Mid-session replanning is not supported today. Easy to add: the player can call `buildSession` again at any card boundary. Deterministic, so no inconsistency risk.

---

### `lib/exercise-content/`

**Boundary.** Lives in `src/lib/exercise-content/`. Called from `pages/Session.tsx` per card (or in batch as a prefetch for the next N). Reads only; produces a render plan.

**Public API.**

```ts
resolveBlock(block: SessionBlock, ctx: ResolveContext)
  → Promise<CapabilityRenderPlan>

resolveBatch(blocks: SessionBlock[], ctx: ResolveContext)
  → Promise<CapabilityRenderPlan[]>

ResolveContext { userId: string, now: Date }
```

**`CapabilityRenderPlan`** is a discriminated union keyed on `exerciseType`. Each variant carries everything the matching component in `components/exercises/implementations/` needs to render: prompt, correct answer, distractors (for MCQ types), variant id, audio url, hint, existing flag state.

**Hides.**
- Variant choice from `exercise_variants` per capability (which authored variant to show).
- K-of-N distractor selection (delegates to `lib/distractors/` for the actual cascade).
- Audio URL resolution (delegates to `lib/audio`).
- The user's existing `content_flags` row, if any.
- Artifact lookup via `capability_artifacts`.
- The content joins across `learning_items`, `item_meanings`, `item_contexts`, `item_answer_variants`.
- Per-exercise-type packaging logic (12 exercise types; ~5 of them MCQ-shaped).

**Module structure.**

```
src/lib/exercise-content/
  index.ts                  barrel
  model.ts                  RenderPlan discriminated union per exercise type
  resolver.ts               resolveBlock orchestrator
  variantChoice.ts          which authored exercise_variant to use
  flagState.ts              user's existing content_flag for this card, if any
  byType/
    recognitionMcq.ts
    cloze.ts
    clozeMcq.ts
    dictation.ts
    contrastPair.ts
    sentenceTransformation.ts
    constrainedTranslation.ts
    speaking.ts
    cuedRecall.ts
    listeningMcq.ts
    typedRecall.ts
    meaningRecall.ts
  availability.ts           folds exerciseAvailabilityService — reads
                            exercise_type_availability lookup
  adapter.ts                folds capabilityContentService.ts +
                            capabilityContentService.internal.ts
                            (~456 LOC) — Supabase reads
```

Approximately 600–700 LOC after splitting the current single file across per-type packagers.

**Depends on.**
- `lib/capabilities/` — types + artifact registry
- `lib/distractors/` — `pickDistractorCascade`
- `lib/audio` — TTS URL resolution
- Its own DB adapter

**Consumed by.**
- `pages/Session.tsx` (per card / prefetch)
- `components/exercises/implementations/*` (receive the `RenderPlan` as props)

**Not part of this module.**
- Planning. The renderer never decides what to ask next.
- Scheduling. Once the user answers, the answer goes to `services/answerCommitService`, not back here.
- Display. Rendering JSX is the components' job.

---

### `lib/lessons/`

**Boundary.** Lives in `src/lib/lessons/`. Owns lesson overview, lesson reader logic, and per-learner lesson activation. The single user-controlled gate for whether a lesson's capabilities are eligible for review.

**Public API.**

```ts
// overview & status
getLessonOverview(lessonId)                → Promise<LessonOverview>
getLessonOverviewStatus(lessonId, userId)  → Promise<LessonOverviewStatus>
buildLessonExperience(...)                 → LessonExperience
buildLessonPracticeActions(...)            → LessonPracticeAction[]
isMeaningfulDialogueAudio(...)             → boolean
isMeaningfulGrammarAudio(...)              → boolean

// activation (replaces source-progress)
isLessonActivated(userId, lessonId)        → Promise<boolean>
listActivatedLessons(userId)               → Promise<string[]>
setLessonActivated(userId, lessonId, on)   → Promise<void>

// types
Lesson, LessonOverview, LessonActivation,
LessonExperience, LessonPracticeAction
```

**Hides.**
- The activation table shape (existence-of-row in `learner_lesson_activation` = activated).
- Auto-activation of legacy lessons (1–3) at signup (one signup hook + one backfill migration for existing users).
- Pattern-follows-lesson activation rule (a pattern's parent lesson activation activates the pattern's capabilities).
- Lesson order, readiness rules, exposure derivation.

**Module structure.**

```
src/lib/lessons/
  index.ts
  model.ts                Lesson, LessonOverview, LessonActivation,
                          LessonExperience, LessonPracticeAction
  overview.ts             folds lessonOverviewModel, lessonOverviewStatus
  experience.ts           folds lessonExperience
  readiness.ts            folds lessonReadiness (isMeaningfulDialogueAudio etc.)
  actionModel.ts          folds lessonActionModel (buildLessonPracticeActions)
  activation.ts           NEW — replaces source-progress
  adapter.ts              folds lessonService.ts + progressService.ts
```

**Depends on.**
- `lib/capabilities/` (types only)
- `lib/supabase.ts` (client)

**Consumed by.**
- `pages/Lessons.tsx` — overview list, activation toggle
- `pages/Lesson.tsx` — detail page, activation checkbox, lesson reading
- `components/lessons/LessonReader.tsx` — display only (no longer tracks progress)
- `lib/session-builder/` — eligibility filter via `listActivatedLessons`
- `lib/analytics/mastery/` — introduced-vs-not-assessed via `isLessonActivated`

**Not part of this module.**
- Source-progress event log. Retired entirely; replaced by the activation checkbox.
- Per-section progress UI. Retired with source-progress.
- Lesson-bound capabilities themselves. Those are owned by `lib/capabilities/`; this module just gates them.

---

### `lib/distractors/`

**Boundary.** Lives in `src/lib/distractors/`. Picks "plausibly wrong" answer options for multiple-choice exercises. Pure logic — no I/O, no Supabase calls. Stochastic per call (uses `Math.random()` in `shuffle`).

**Public API.**

```ts
pickDistractorCascade(
  target:       { itemType: string; pos: string | null;
                  level: string; semanticGroup: string | null },
  pool:         DistractorCandidate[],
  count:        number,
  targetOption: string = '',
) → string[]

DistractorCandidate {
  id: string
  option: string
  itemType: string
  pos: string | null
  level: string
  semanticGroup: string | null
}

STRUCTURALLY_SIMILAR_TYPES        // word/phrase, sentence/dialogue_chunk
optionComponents(s)               → string[]
sharesMeaningfulWord(c, selected) → boolean
SEMANTIC_GROUPS_NL, SEMANTIC_GROUPS_EN
getSemanticGroup(translation, language) → string | null
```

**Hides.**
- The 6-tier cascade strategy (POS-aware → POS+level → POS-only → semantic-group → level → full-pool fallback).
- Structural-type compatibility matrix (`word`/`phrase` interchangeable; `sentence`/`dialogue_chunk` interchangeable; never mix).
- Visual-overlap deduplication (e.g. `"omdat"` and `"omdat, de reden is"` won't both surface).
- Shuffle randomisation.
- Semantic-group keyword matching across NL and EN.

**Module structure.**

```
src/lib/distractors/
  index.ts              barrel — already exists, keep
  cascade.ts            pickDistractorCascade
  options.ts            optionComponents, sharesMeaningfulWord
  semanticGroups.ts     SEMANTIC_GROUPS_NL/EN, getSemanticGroup
  structuralTypes.ts    STRUCTURALLY_SIMILAR_TYPES
```

~216 LOC. Already module-shaped today (only existing module with a real `index.ts` barrel). No structural changes needed.

**Depends on.** Nothing. Pure logic.

**Consumed by.** `lib/exercise-content/` (the only runtime caller; calls `pickDistractorCascade` for MCQ-shaped exercise types).

**Not part of this module.**
- The distractor *pool*. Authored at content-pipeline time by the `vocab-exercise-creator` agent. Stored in `vocab-enrichments.ts` → DB tables. The runtime fetches the pool; this module picks from it.

---

### `lib/analytics/`

**Boundary.** Lives in `src/lib/analytics/`. Read-only. No writes, no mutations. The substrate for every UI surface that displays facts about a learner. Bimodal depth: orchestration in TS, heavy aggregation in Postgres analytics functions.

**Public API.** Categorised by sub-module, accessed via namespaced exports.

```ts
// engagement — does the user show up?
analytics.engagement.streak(userId)             → number
analytics.engagement.streakBest(userId)         → number
analytics.engagement.activeDays(userId, window) → number
analytics.engagement.recentSessions(userId, n)  → SessionSummary[]

// memory — how well is FSRS holding?
analytics.memory.retention(userId, window)       → RetentionStats
analytics.memory.accuracy(userId, window)        → AccuracyByDirection
analytics.memory.health(userId)                  → MemoryHealth
analytics.memory.latency(userId)                 → ReviewLatencyStats

// progress — what's growing?
analytics.progress.usableVocabularyGain(userId, window)  → number
analytics.progress.lessonProgress(userId)        → LessonProgress[]

// upcoming — what's around the corner?
analytics.upcoming.dueCount(userId)              → number
analytics.upcoming.dueCapabilities(userId, mode, limit) → DueCapability[]
analytics.upcoming.forecast(userId, days, tz)    → ReviewForecastDay[]
analytics.upcoming.lapsing(userId)               → LapsingCountResult
analytics.upcoming.lapsePrevention(userId)       → LapsePreventionResult
analytics.upcoming.vulnerable(userId, limit?)    → VulnerableCapability[]

// social — cross-user
analytics.leaderboard.top(metric, limit)         → LeaderboardEntry[]

// mastery — labelled interpretation of FSRS state
analytics.mastery.contentUnit(contentUnitId, userId)  → ContentUnitMastery
analytics.mastery.pattern(patternId, userId)          → PatternMastery
analytics.mastery.overview(userId)                    → MasteryOverview
```

**Module structure.**

```
src/lib/analytics/
  index.ts              top-level barrel: { engagement, memory, upcoming,
                        progress, leaderboard, mastery }
  engagement/
    index.ts            streak, streakBest, activeDays, recentSessions
    rules.ts            "what counts as a study day", streak break rules
    adapter.ts
  memory/
    index.ts            retention, accuracy, health, latency
    adapter.ts
  upcoming/
    index.ts            dueCount, dueCapabilities, forecast, lapsing, vulnerable
    filter.ts           the read-side filter for "what's due" — filters by
                        nextDueAt + activation/readiness/publication flags
                        (folds from capabilityScheduler.ts read side)
    adapter.ts
  progress/
    index.ts            usableVocabularyGain, lessonProgress
    adapter.ts
  leaderboard/
    index.ts            top
    adapter.ts
  mastery/
    index.ts            contentUnit, pattern, overview
    model.ts            MasteryLabel, MasteryDimension, MasteryConfidence,
                        ContentUnitMastery, PatternMastery, MasteryOverview
    rules.ts            labelForCapability (the 6-state hierarchy),
                        dimensionForCapability (12 types → 11 dimensions)
    derive.ts           deriveMasteryDimensions, deriveContentUnitMastery,
                        derivePatternMastery, deriveMasteryOverview
    aggregate.ts        weakestLabel, aggregateConfidence,
                        confidenceForDimension (5-point scoring)
    adapter.ts          createMasteryModel + DB queries
                        (folds masteryModel.ts ~524 LOC)
```

**Hides.**
- All time-window math (week boundaries, timezones, recency).
- Streak and study-day rules.
- Retention vs stability conversion.
- Mastery labeling rules (when does "mastered" trigger?). The 6-state hierarchy with `at_risk` short-circuit is in `mastery/rules.ts`.
- Dimension grouping (12 capability types → 11 dimensions).
- Confidence scoring (5-point system: sample size ≥ 2/5, recency, modality variety, artifact completeness).
- Weakest-wins aggregation across dimensions and scopes.
- The 13 Postgres analytics functions in `scripts/migrations/2026-05-01-learner-progress-functions.sql`.
- Cross-table joins (capability state + artifacts + source progress + content units).

**Mastery labeling rules** (preserved from `masteryModel.ts:191`):

```
1. consecutiveFailureCount > 0 OR lapseCount > 0  → 'at_risk'
2. reviewCount === 0:
     if lesson is activated  → 'introduced'
     else                    → 'not_assessed'
3. requiredArtifacts not all approved              → 'learning'
4. reviewCount ≥ 4 AND stability ≥ 14d AND
   recently reviewed                               → 'mastered'
5. reviewCount ≥ 3 OR stability ≥ 5d               → 'strengthening'
6. fallthrough                                     → 'learning'
```

(Rule 2 simplifies under the new lesson-activation model; "introduced" requires lesson activation rather than source-progress state.)

**Depends on.**
- `lib/capabilities/` — types + canonical-key contract
- `lib/lessons/` — `isLessonActivated` for the introduced/not_assessed distinction
- `chunkedQuery` utility
- Supabase client
- The 13 Postgres analytics functions

**Consumed by.**
- `pages/Dashboard.tsx` — engagement.streak, memory.retention, progress.*, upcoming.dueCount
- `pages/Progress.tsx` — memory.*, upcoming.forecast, upcoming.vulnerable, mastery.overview
- `pages/Leaderboard.tsx` — leaderboard.top
- Lesson detail page — mastery.contentUnit per content unit
- Pattern detail (when surfaced) — mastery.pattern
- `lib/session-builder/` — upcoming.dueCapabilities (the eligibility input)

**Not part of this module.**
- Writes. Event-log writes are retired entirely (the goal-flavoured event types had no live use case after the goal subsystem retired).
- Goal subsystem. Retired. If anything resurrects, it lives in its own module, not here.
- Per-card timing instrumentation. Not built; if added later, it's a write path with its own thin service.

---

### `lib/audio` (single file)

**Boundary.** Lives in `src/lib/audio.tsx`. Owns TTS playback for sessions plus user audio preferences. Single file — the module is too small and stable to deserve a folder.

**Public API.**

```ts
// data
fetchSessionAudioMap(texts: string[])              → Promise<SessionAudioMap>
resolveSessionAudioUrl(map, text)                  → string | undefined

// hooks
useSessionAudio()                                  → { audioMap }
useAutoplay()                                      → { autoPlay, setAutoPlay }
useListening()                                     → { listeningEnabled, setListeningEnabled }

// providers (mounted in main.tsx + ExperiencePlayer)
<SessionAudioProvider audioMap>
<AutoplayProvider>
<ListeningProvider>

// types
SessionAudioMap, AudioPreferences
```

**Hides.**
- URL construction for `indonesian-tts` bucket (`${SUPABASE_URL}/storage/v1/object/public/indonesian-tts/${path}`).
- `get_audio_clip_per_text` RPC contract.
- Text normalization (lowercase + whitespace collapse) — `normalizeTtsText` is internal.
- localStorage keys (`autoplay_audio`, `listening_enabled`) and cross-tab sync via the storage event.
- Default values for both preferences (autoplay = true, listening = true).

**Module structure.**

```
src/lib/audio.tsx           ← the entire module, ~230 LOC
src/components/audio/
  PlayButton.tsx            ← UI primitive (~56 LOC)
  PlayButton.module.css
```

**Depends on.** Supabase client, `indonesian-tts` storage bucket, `get_audio_clip_per_text` Postgres function.

**Consumed by.**
- `pages/Session.tsx` — calls `fetchSessionAudioMap` on session start with `SessionPlan.audibleTexts`
- `ExperiencePlayer` — wraps children in `SessionAudioProvider`
- 5+ exercise components — `useSessionAudio`, `resolveSessionAudioUrl`, `useAutoplay`, `<PlayButton>`
- `pages/Profile.tsx` — toggles preferences
- `main.tsx` — wraps app in `AutoplayProvider` and `ListeningProvider`
- `lib/session-builder/` — reads `useListening()` preference (or its localStorage key directly) when filtering exercise types

**Not part of this module.**
- Long-form lesson audio (`indonesian-lessons` bucket; resolved via `lessonService.getAudioUrl` which folds into `lib/lessons/`).
- Podcast audio (`indonesian-podcasts` bucket; resolved via `podcastService` which stays as a thin service).
- TTS synthesis. That's content-pipeline work (Plate IV); this module reads pre-synthesized audio.
- The `audibleTexts` list itself. Computed by `lib/session-builder/`.
- Listening-mode gating in the planner. The session-builder reads the preference and filters; the gate logic lives there.

---

## Shared module specs

### `lib/capabilities/`

**Status: SHARED.** Used by both runtime and content pipeline. The runtime consumes types + a small subset of functions; the pipeline consumes the heavy projection and validation logic.

**Boundary.** Lives in `src/lib/capabilities/`. Defines the canonical noun of the app — "capability" is one item × one skill type, the atomic unit of what can be learned and tested. There are 12 `CapabilityType` values × 2 `CapabilityDirection` values, producing thousands of capability rows when projected over the corpus of items.

**The 12 capability types:**

```ts
type CapabilityType =
  | 'text_recognition'       | 'meaning_recall'
  | 'l1_to_id_choice'        | 'form_recall'
  | 'contextual_cloze'       | 'audio_recognition'
  | 'dictation'              | 'podcast_gist'
  | 'pattern_recognition'    | 'pattern_contrast'
  | 'root_derived_recognition' | 'root_derived_recall'

type CapabilityDirection =
  | 'id_to_l1'    // Indonesian → user's L1
  | 'l1_to_id'    // user's L1 → Indonesian
```

**Public API.**

```ts
// types — runtime + pipeline (the lingua franca)
export type {
  CapabilityType, CapabilitySourceKind, ProjectedCapability,
  CapabilityProjection, ArtifactKind, ArtifactIndex,
  ArtifactQualityStatus, CapabilityArtifact,
  CapabilityReadiness, CapabilityHealthReport, CurrentContentSnapshot,
  LearnerCapabilityStateRow,
}

export const CAPABILITY_SOURCE_KINDS

// runtime + pipeline (the contract both sides need)
export { buildCanonicalKey, normalizeLessonSourceRef }

// validation — runtime calls 1×, pipeline calls 5×
export { validateCapability, validateCapabilities }

// projection — pipeline only
export { projectCapabilities }

// runtime read-side filter (post-FSRS-retirement)
export { getDueCapabilitiesFromRows }
```

**Runtime consumption pattern.** Of ~40 import lines, ~35 are `import type {…}` — the runtime uses capability types as the vocabulary for the rest of the codebase. Function calls from runtime:
- `validateCapability` — 1 call site (`lib/session-builder/` defensive re-validation at session-load).
- `getDueCapabilitiesFromRows` — used by `lib/session-builder/` for the eligibility filter (post-FSRS-retirement; just a date+flag filter, not FSRS math).

**Pipeline consumption pattern.** All four heavy functions are pipeline-side: `projectCapabilities`, `validateCapability`/`validateCapabilities`, `buildCanonicalKey` (transitively via projection). Called by `materialize-capabilities.ts`, `check-capability-health.ts`, `promote-capabilities.ts`, `generate-staging-files.ts`, `lint-staging.ts`, and the staging projection files.

**Why shared (not split).** The canonical-key contract MUST be shared between pipeline (which writes keys) and runtime (which decodes them). If the keying function diverged, learner FSRS state would silently orphan when content was edited.

**Module structure.**

```
src/lib/capabilities/
  index.ts                       barrel
  capabilityTypes.ts             types — the glossary
  canonicalKey.ts                buildCanonicalKey + normalizeLessonSourceRef
                                 (the contract both sides need)
  capabilityContracts.ts         validateCapability + validateCapabilities
  capabilityCatalog.ts           projectCapabilities (pipeline-heavy)
  artifactRegistry.ts            ArtifactIndex
  
  RETIRES (browser FSRS gone, sessionQueue dead):
    capabilityScheduler.ts       was the FSRS preview + due-list. The FSRS
                                 math has retired. The due-list filter
                                 (getDueCapabilitiesFromRows) survives but
                                 moves into lib/analytics/upcoming/filter.ts.
    sessionCapabilityDiagnostics.ts   RETIRED in retirement #7
```

**Depends on.** Nothing in `src/lib/`. Imports types from runtime row shapes and `chunkedQuery` utility for batched IN queries.

**Consumed by.**
- Runtime: `lib/session-builder/`, `lib/exercise-content/`, `lib/analytics/` (esp. mastery), `lib/lessons/` (transitively for activation gating), `services/answerCommitService` (for AnswerReport types).
- Pipeline: `scripts/lib/pipeline/` plus several top-level scripts.

**Open considerations (optional refactor, behaviour-neutral).**

A cleaner physical split is possible but not required:

```
src/types/capability.ts                          ← glossary the runtime needs
src/lib/capabilities/canonicalKey.ts             ← contract both sides need
src/lib/capabilities/validator.ts                ← validate one (runtime + pipeline)
scripts/lib/pipeline/capabilities/projection.ts  ← projectCapabilities (pipeline)
scripts/lib/pipeline/capabilities/validate.ts    ← batch validation (pipeline)
```

Pipeline-only code physically lives in pipeline-land. Runtime + shared-contract code stays in `src/`. This is purer architecturally; not required for the lock to hold.

---

### `supabase/functions/_shared/srs/`

**Status: SHARED (server-side only at present).** Pure FSRS — params + algorithm. Single source of truth for the language-learning weights. Today imported by the `commit-capability-answer-report` edge function. Could in principle also be imported by the browser if optimistic UI is ever wanted, but that's not built — the browser side is currently retired.

**Boundary.** Lives at `supabase/functions/_shared/srs/` (Supabase Edge Functions convention for cross-function shared code).

**Public API.**

```ts
computeNextState(state: SrsState | null, rating: SrsRating, now: Date): SrsResult
inferRating(outcome: ReviewOutcome): SrsRating
getRetrievability(state: SrsState, now: Date): number
applyGrammarAdjustment(...): ...

DEFAULT_PARAMS: SrsParams
SrsState, SrsResult, ReviewOutcome, SrsRating, SrsParams
```

**Hides.**
- The `request_retention: 0.85` constant (more frequent reviews than ts-fsrs default of 0.9).
- The `w[]` weights tuned for language learning (see `params.ts`).
- The mapping from review outcome (was correct, hint used, fuzzy match, latency) to FSRS Grade.
- ts-fsrs library wrapping.

**Module structure.**

```
supabase/functions/_shared/srs/
  index.ts            barrel
  params.ts           DEFAULT_PARAMS — language-learning weights
                      Documents the rationale for request_retention=0.85
                      and the w[] choices.
  algorithm.ts        computeNextState, inferRating, getRetrievability,
                      applyGrammarAdjustment
                      Plus the SrsState, SrsResult, ReviewOutcome,
                      SrsRating types.
  README.md           explains the parameter choices and trade-offs
```

~110 LOC.

**Depends on.** `ts-fsrs@5.3.2` (npm package, imported in Deno via `npm:ts-fsrs@5.3.2`).

**Consumed by.** `supabase/functions/commit-capability-answer-report/index.ts` (the only consumer at present).

**Not part of this module.**
- Domain knowledge. FSRS doesn't know about capabilities, lessons, sessions. Pure math.
- Scheduling decisions. *When* to call FSRS is the caller's concern.
- DB writes. The edge function writes; this module computes.

---

## Service specs (thin transport adapters)

### `services/answerCommitService`

**Boundary.** Lives in `src/services/answerCommitService.ts`. Ships answer reports to the edge function. ~30 LOC.

**Public API.**

```ts
commitAnswer(input: {
  capabilityId:  string
  stateBefore:   SrsState | null
  stateVersion:  number
  answerReport:  AnswerReport
  reviewedAt:    Date
}) → Promise<CommitResult>

AnswerReport {
  wasCorrect:         boolean
  hintUsed:           boolean
  isFuzzy:            boolean
  rawResponse:        string | null
  normalizedResponse: string | null
  latencyMs:          number | null
}

CommitResult {
  newState:    SrsState
  newVersion:  number
  nextDueAt:   string | null
}
```

**Hides.** `supabase.functions.invoke('commit-capability-answer-report', {...})` call. Nothing else.

**Why a service, not a module.** Pure transport — one method, one HTTP call. The depth lives server-side in `_shared/srs/` and the edge function. The TS file here is one network adapter.

**Consumed by.** The session player in `pages/Session.tsx` after every card answer.

---

### `services/podcastService` (stays as service — no module)

**Decision:** Stays in `src/services/podcastService.ts`. Does not promote to `lib/podcasts/`.

**Why not a module.** Three thin functions over one DB table and one storage bucket. No non-trivial logic to hide. Pages do the rest of the work.

**Public API.**

```ts
listPodcasts()                  → Promise<Podcast[]>
getPodcast(podcastId)           → Promise<Podcast>
getAudioUrl(audioPath)          → string

Podcast {
  id, title, description, audio_path, level, duration_seconds,
  transcript_indonesian, transcript_english, transcript_dutch, created_at
}
```

**Bucket:** `indonesian-podcasts`.
**Table:** `indonesian.podcasts`.

**Promotion criterion (when to graduate to a module).** If real podcast logic accrues — listening-progress tracking, recommendations, transcript-with-timestamps, podcast-streak handling — promote to `lib/podcasts/` then. Not before.

**Note on the schedulable side.** The `podcast_gist` capability type is fully integrated into the locked capability + session-builder + exercise-content + scheduling stack. Reviewing a podcast's gist is a normal capability review; nothing podcast-specific in that path. This service handles only the browsing/listening surface.

---

### `services/exerciseAvailabilityService` (stays as service — no module)

**Decision:** Stays in `src/services/exerciseAvailabilityService.ts`.

**Why not a module.** Reads one table (`exercise_type_availability`) — a flat lookup of which exercise types are session-enabled. No logic to hide.

**Public API.**

```ts
isExerciseTypeEnabled(type: ExerciseType) → Promise<boolean>
getEnabledExerciseTypes()                 → Promise<ExerciseType[]>
```

**Consumed by.** `lib/session-builder/` when filtering exercise types ("listening preference is off → drop listening exercises from the queue"). The filtering logic itself lives in the session-builder; this service is just the data fetch.

**Optional future fold.** Could move into `lib/exercise-content/availability.ts` if the session-builder ever stops using it directly. For now, sits in `services/`.

---

## Cross-cutting utilities (`src/lib/` root)

These are not modules. They're shared platform helpers used across the codebase.

| File | What it does |
|---|---|
| `lib/supabase.ts` | The Supabase client. Cookie-scoped to `.duin.home` in prod, omitted on localhost. |
| `lib/logger.ts` | Fire-and-forget error logger. Writes to `indonesian.error_logs`. Never throws. |
| `lib/i18n.ts` | NL/EN translation strings. `useT` hook lives in `hooks/`. |
| `lib/featureFlags.ts` | Feature flag reads. |
| `lib/chunkedQuery.ts` | `chunkedIn(...)` helper for batched IN queries. |

These stay where they are. They are not promoted to modules and not moved to `services/`.

---

## Server-side specs

### Edge function: `commit-capability-answer-report`

**Location:** `supabase/functions/commit-capability-answer-report/index.ts`.
**Runtime:** Deno (Supabase Edge Functions).

**Job.** Authoritative FSRS scheduler. Receives an `AnswerReport`, computes the new FSRS state via `_shared/srs/`, writes `learner_capability_state` + appends `capability_review_events` + upserts `learning_sessions` (`end_time = MAX(existing, NEW answer.created_at)`). Also handles state-version optimistic concurrency.

**Input (POST body).**

```ts
{
  capabilityId:  string
  stateBefore:   SrsState | null
  stateVersion:  number              // for optimistic concurrency
  answerReport:  AnswerReport
  reviewedAt:    string              // ISO timestamp
  sessionId:     string              // uuid; first answer materialises the row
}
```

**Output.**

```ts
{
  newState:    SrsState
  newVersion:  number
  nextDueAt:   string | null
}
```

**Side effects.**
- Insert/update `indonesian.learner_capability_state` (with version check).
- Append to `indonesian.capability_review_events`.
- Upsert `indonesian.learning_sessions` — insert if no row for `sessionId`, update `end_time = GREATEST(existing, reviewedAt)` on every commit.

**Why server-authoritative.** The browser doesn't run FSRS. This is the single source of truth for review outcomes. The session-builder and analytics modules read the resulting state; they never write it.

---

## Local pipeline (Plate IV)

See `docs/architecture-layers.html` Plate IV for the full description. Summary:

```
Module: content-pipeline (local, scripts/lib/pipeline/)

Inputs:
  lessonNumber: number
  photoDir:     string

Outputs (idempotent side effects on the runtime backend):
  lesson_sections, lesson_page_blocks, learning_items,
  item_meanings, item_contexts, item_answer_variants,
  learning_capabilities, capability_artifacts,
  exercise_variants, grammar_patterns, audio bytes

External dependencies:
  - Anthropic API (cataloguing + 5 Claude subagents)
  - Google Cloud TTS Chirp3-HD (audio synthesis)
  - Tesseract (OCR)

Conceptual stages:
  capture → catalog → stage → author → review → publish → 
  capability materialisation → audio synthesis

Today: 50+ scripts in scripts/ + ~12 utility files in scripts/lib/.
Target: factored into scripts/lib/pipeline/<stage>/ with thin
        per-stage scripts as entry points.
```

The pipeline imports from `lib/capabilities/` for projection and validation. That's the only runtime → pipeline shared code path.

---

## Code flagged for deletion

Total retirement: **~2300+ LOC** plus tables, jobs, RPCs, and analytics rows.

### 1. Goal / target subsystem

**Status: RETIRED in retirement #4 (2026-05-07, branch `retire/goal-subsystem`).** Spec: `docs/plans/2026-05-07-retire-goal-subsystem.md`. See that doc for the full per-symbol grep evidence and the seven claims this section originally got wrong (table/function counts, retiring `preferred_session_size`).

**Why.** Replaced by streak-only motivation. Daily and weekly targets were UX ceremony; the underlying mechanic (FSRS) already prescribes what to do. A target either over-prescribes (when nothing's due) or under-prescribes (when lots is due).

**Retired (actual scope after grep verification):**

```
src/services/goalService.ts                     609 LOC (whole file)
scripts/lib/goal-job-service.ts                 401 LOC (whole file)
src/components/progress/WeeklyGoalsList.tsx     80 LOC + .module.css (orphan)
src/pages/Dashboard.module.css                  192 LOC (every class was goal/today-plan)
src/components/SessionSummary.tsx               121 LOC + .module.css (orphan)
src/__tests__/Progress.test.tsx                 870 LOC (was Vitest-excluded dead weight)

Tables (4, not the 2 originally listed):
  indonesian.learner_weekly_goal_sets
  indonesian.learner_weekly_goals
  indonesian.learner_stage_events           (originally missed)
  indonesian.learner_daily_goal_rollups     (originally missed)

Postgres functions (4 from master + 5 from 2026-05-01-learner-progress-functions.sql):
  indonesian.job_pregenerate_current_week
  indonesian.job_finalize_weekly_goals
  indonesian.job_daily_rollup_snapshot      (originally missed)
  indonesian.job_integrity_repair           (originally missed)
  indonesian.compute_todays_plan_raw
  indonesian.get_study_days_count           (sole caller was goalService)
  indonesian.get_recall_stats_for_week      (sole caller was goalService)
  indonesian.get_usable_vocabulary_gain     (sole caller was goalService)
  indonesian.get_overdue_count              (sole caller was goalService)

pg_cron schedules (4):
  goal-finalize-weekly, goal-pregenerate-weekly, goal-daily-rollup, goal-integrity-repair

Profile column (NOT retired):
  indonesian.profiles.preferred_session_size — column survives. The original
  retirement list claimed it would die; grep proved it is consumed pervasively
  by the pedagogy stack (loadBudgets, sessionPosture, queueDrying,
  capabilitySessionLoader, pedagogyPlanner, Profile.tsx, Session.tsx). Ownership
  reclassified to lib/profile/.
```

**Replaced by.** Streak counter (already exists, derived from `capability_review_events.created_at` distinct dates) and ambient counts on the dashboard (derivable live from current state).

---

### 2. Browser-side FSRS

**Why.** The server is authoritative. Browser-side FSRS produced a `stateAfter` snapshot that the server recomputed and ignored — pure duplication with drift risk.

**Retire:**

```
src/lib/fsrs.ts                                 134 LOC

In src/lib/capabilities/capabilityScheduler.ts:
  previewScheduleUpdate function                ~25 LOC (zero callers)
  CapabilityReviewPreview type
  SchedulePreview type

In src/lib/reviews/capabilityReviewProcessor.ts:
  the import of computeNextState
  the call of computeNextState at line 156
  the resulting stateAfter packaging
  
  → file shrinks from 208 LOC to ~50 LOC. Plan packager only;
    no FSRS math.
```

**Replaced by.** `supabase/functions/_shared/srs/` — single FSRS source of truth, server-side. The commit edge function does all FSRS computation.

**Retained.** `inferRating` moves into `_shared/srs/algorithm.ts` (server-side).

---

### 3. Session lifecycle module

**Status: RETIRED in retirement #5 (2026-05-07, branch `retire/session-lifecycle`).** Spec: `docs/plans/2026-05-07-retire-session-lifecycle.md`. See that doc for the full per-symbol grep evidence and the corrections this section originally got wrong.

**Why.** Sessions are derived from the answer log. `learning_sessions.ended_at = MAX(answer.created_at)` per session id, upserted by the `commit_capability_answer_report` Postgres RPC. No explicit start/end calls needed; no stale-session repair needed.

**Retired (actual scope after grep verification):**

```
src/lib/session.ts                              110 LOC (whole file)
  startSession, endSession, endSessionBeacon

src/lib/useSessionBeacon.ts                     30 LOC (whole file)
  (the original "largely obsolete" wording was wrong — under bundled scope
   the file retires 100%. Lesson + Podcast pages also drop their explicit
   session lifecycle, so no caller needs the beacon.)

src/types/learning.ts:285                       1 LOC (SessionType type alias —
                                                  orphaned once src/lib/session.ts retires)

Caller surgery:
  src/pages/Session.tsx                         drops imports + sessionId useState +
                                                 sessionIdRef + useSessionBeacon; mints
                                                 sid via crypto.randomUUID()
  src/pages/Lesson.tsx                          drops imports + sessionIdRef + beacon +
                                                 startSession/endSession lifecycle
  src/pages/Podcast.tsx                         same surgery as Lesson.tsx + drops
                                                 entire return cleanup arrow

Postgres functions:
  indonesian.job_finalize_stale_sessions        retired (no callers under the
                                                 derived-from-answers model)

Postgres cron:
  finalize-stale-sessions                       hourly cron job retired

RLS policies:
  learning_sessions_write                       dropped — was FOR ALL granted to
                                                 authenticated; under #5 the underlying
                                                 GRANT narrows to SELECT only, so the
                                                 INSERT/UPDATE/DELETE branches were dead.
                                                 SELECT continues via learning_sessions_read.

GRANT narrowing:
  indonesian.learning_sessions                  authenticated GRANT narrowed from
                                                 (SELECT, INSERT, UPDATE, DELETE) to
                                                 (SELECT only). Defense-in-depth: only
                                                 the service_role RPC writes.

RPC modification:
  commit_capability_answer_report               adds submittedAt to required-fields
                                                 validation + new learning_sessions
                                                 UPSERT before final return; session_type
                                                 hardcoded 'learning' (only the capability
                                                 path commits via this RPC).
```

**Architectural shift (corrected).** `pages/Session.tsx` mints a fresh sessionId client-side via `crypto.randomUUID()` (not via `buildSession` — the doc's prior framing assumed buildSession was the only minting site, but session minting is upstream of buildSession in the actual data flow). The first answer commit upserts the row with `started_at = ended_at = submittedAt`. Subsequent answers update `ended_at = GREATEST(existing, submittedAt)`. Sessions with zero answers leave no row (improvement over pre-#5 ghost rows). One-answer sessions have `duration_seconds = 0` (acceptable: a single-click session has zero meaningful duration).

**Doc-claim corrections logged during retirement #5:**

1. **Three caller pages, not one.** `startSession` was called by `Session.tsx`, `Lesson.tsx`, AND `Podcast.tsx`. Doc framing focused on `Session.tsx` / `buildSession` only — the Lesson + Podcast paths had to be bundled into the same retirement.
2. **Upsert lives in the RPC, not the edge function TS.** Doc §1039 said "the commit edge function… upserts `learning_sessions`". Reality: the edge function delegates DB writes to the Postgres RPC `commit_capability_answer_report`. Upsert lives in the RPC.
3. **`capability_review_events.session_id` is `text not null` with NO FK** to `learning_sessions.id`. Wire format is unblocked — events can be written before any session row exists; the upsert fires in the same RPC transaction without dependency ordering.
4. **Test surgery: `src/__tests__/Lesson.test.tsx`** mocks all four exports of `@/lib/session` + `@/lib/useSessionBeacon`. Doc never enumerated test surgery.
5. **Leaderboard view semantic shift.** `total_seconds_spent` and `days_active` no longer count Lesson reading or Podcast listening (only answer-emitting study). One-answer sessions also have `duration_seconds = 0` by construction. Acceptable per the streak-only motivation lock-in.

---

### 4. Source-progress state machine

**Status: RETIRED in retirement #6 (2026-05-07, branch `retire/source-progress`).** Replaced by a single per-lesson activation checkbox. The 7-event state machine, inclusion rules, evidence-bypass policy, exposure-map translator, and idempotent event-log were all in service of inferring "has the user been exposed enough" — which the user can simply tell us.

**Retired:**

```
src/services/sourceProgressService.ts           ~161 LOC
src/lib/pedagogy/sourceProgressGates.ts         ~94 LOC
src/lib/lessons/lessonExposureProgress.ts       ~48 LOC

Postgres functions:
  indonesian.record_source_progress_event       ~140 LOC plpgsql
  indonesian._capability_source_progress_met    ~60 LOC plpgsql

Tables:
  indonesian.learner_source_progress_events
  indonesian.learner_source_progress_state

Column:
  indonesian.lesson_page_blocks.source_progress_event (DROPPED)

Type field on capabilities:
  CapabilitySourceProgressRequirement           (kind, requiredState, sourceRef)
  + the requiredSourceProgress field in capability metadata
```

**Replaced by.** A single boolean per learner per lesson:

```sql
create table indonesian.learner_lesson_activation (
  user_id      uuid       not null references auth.users,
  lesson_id    uuid       not null references indonesian.lessons,
  activated_at timestamptz not null default now(),
  primary key (user_id, lesson_id)
);
```

Owned by `lib/lessons/`. The session-builder's eligibility filter is now `capability.lessonId == null || activatedLessons.has(capability.lessonId)`. The mastery model's `'introduced'` label depends on `lessonActivated` instead of source-progress state. The lesson reader is purely informational. New users get lessons 1–3 auto-activated on first sign-in via `authStore.activateStarterLessons` (idempotent, gated on the `SIGNED_IN` auth event). Existing users have the same activation backfilled by master `migration.sql`.

`learning_capabilities` gained a nullable `lesson_id` column — NULL for cross-lesson capabilities (podcast, etc.); otherwise the capability is owned by that lesson and gated by activation.

---

### 5. Grammar-state subsystem

**Why.** Dead code. The capability system already handles per-pattern FSRS state via `learner_capability_state`. `learner_grammar_state` is parallel state nothing writes to.

**Retire:**

```
src/services/grammarStateService.ts             69 LOC (zero callers)
  All methods unused at runtime.

Table:
  indonesian.learner_grammar_state              + RLS policies + grants
                                                + idx_learner_grammar_state_due

Type:
  LearnerGrammarState in src/types/learning.ts
```

**Stays live (not retired):**
- `indonesian.grammar_patterns` table (content)
- `indonesian.item_context_grammar_patterns` (junction)
- `confusion_group` field on `grammar_patterns` (used at runtime by `applyGrammarAwareInterleaving` in session-builder for queue ordering)

---

### 6. Audio multi-voice path

**Why.** Dead code. Single-voice path superseded multi-voice; the older code never had its callers removed.

**Retire:**

```
src/contexts/AudioContext.tsx                   29 LOC (zero callers)
src/components/MiniAudioPlayer.tsx              86 LOC (zero callers)
src/components/MiniAudioPlayer.module.css       (paired CSS)

In src/services/audioService.ts (which folds into lib/audio anyway):
  fetchAudioMap                                 multi-voice variant
  resolveAudioUrl                               multi-voice variant
  AudioMap type                                 multi-voice variant
```

**Replaced by.** The single-voice path (`fetchSessionAudioMap`, `resolveSessionAudioUrl`, `SessionAudioMap`) which folds into `lib/audio`.

---

### 7. Event log (analytics write path)

**Status: RETIRED in retirement #4 (2026-05-07), bundled with the goal subsystem.** All 3 production callers (`Progress.tsx`, `Session.tsx`, `SessionSummary.tsx`) were goal-flavoured and retired transitively in the same PR.

**Why.** All 7 defined event types are goal-flavoured (`goal_generated`, `goal_viewed`, `daily_plan_viewed`, `session_started_from_today`, `goal_achieved`, `goal_missed`, `session_summary_viewed`). With the goal subsystem retired, no event has a live caller. Don't keep dead infrastructure on speculation.

**Retired:**

```
src/services/analyticsService.ts                134 LOC
src/__tests__/analyticsService.test.ts          122 LOC

Table:
  indonesian.learner_analytics_events
```

If event tracking becomes useful later, design it then with whatever events actually matter.

---

### 8. Legacy `src/lib/` root files

**Status: PARTIALLY RETIRED in retirement #7 (2026-05-08, branch `retire/legacy-lib-root`).** Spec: `docs/plans/2026-05-08-retire-legacy-lib-root.md`. The function/test surface of the four legacy files plus the transitively-orphaned `sessionCapabilityDiagnostics.ts` are gone (~2518 LOC delete). `useExerciseScoring.ts` remains for a separate relocation PR (it has 11 production callers — relocation, not retirement).

**Retired (actual scope after grep verification):**

```
src/lib/sessionQueue.ts                         RETIRED in retirement #7
src/lib/session.ts                              RETIRED in retirement #5
src/lib/sessionPolicies.ts                      RETIRED in retirement #7
src/lib/stages.ts                               RETIRED in retirement #7
src/lib/capabilities/sessionCapabilityDiagnostics.ts
                                                RETIRED in retirement #7
                                                (transitive orphan; only
                                                caller was sessionQueue.ts)
src/lib/useSessionBeacon.ts                     RETIRED in retirement #5

Type relocation:
  CapabilitySessionMode → SessionMode           renamed in lib/session/sessionPlan.ts;
                                                12 occurrences across 3 files; two
                                                production importers (Session.tsx +
                                                capabilityScheduler.ts) became
                                                path-only edits.
```

**Deferred (out of scope for retirement #7):**

```
src/lib/useExerciseScoring.ts                   relocate to src/hooks/
                                                 (it's a hook, not lib code).
                                                 Has 11 production callers; this
                                                 is a relocation, not a retirement.
                                                 Separate PR.
```

---

## Things that explicitly stay

To prevent confusion in future passes:

- **`indonesian.grammar_patterns` and `item_context_grammar_patterns`** stay — they're content.
- **`confusion_group` field** stays — used at runtime by queue-ordering in session-builder.
- **`indonesian.error_logs` table** stays — written by `lib/logger.ts`.
- **`indonesian.user_roles` table** stays — used by auth's admin check.
- **`indonesian.profiles` table** stays — `lib/profile/` owns it. **All columns stay**, including `preferred_session_size` (consumed by the pedagogy stack for queue sizing) and `timezone` (consumed by `learnerProgressService.getCurrentStreakDays`/`getReviewForecast`). The original retirement list claimed `preferred_session_size` would die; corrected during retirement #4.
- **`indonesian-tts`, `indonesian-lessons`, `indonesian-podcasts` storage buckets** all stay — owned by `lib/audio`, `lib/lessons/`, `services/podcastService` respectively.
- **All audio synthesis Postgres functions** (`get_audio_clip_per_text`, `get_audio_clips`, `audio_coverage_report`) — used by audio module + content pipeline.
- **The 13 analytics Postgres functions** in `2026-05-01-learner-progress-functions.sql` — used by `lib/analytics/`.
- **The capability-related tables** (`learning_capabilities`, `learner_capability_state`, `capability_artifacts`, `capability_review_events`, `capability_resolution_failure_events`, `capability_aliases`, `capability_content_units`) — central to the architecture.

---

## Migration considerations

### What's NOT done

This document captures *decisions*. The codebase has not yet been refactored. Every lock-in here describes the *target*, not the present. The migration plan is open work.

### Suggested migration order

1. **Retirements first.** Removing dead code is the easiest and safest start. Order:
   - Audio multi-voice path (dead, no callers) — DONE (#1, PR #34)
   - Grammar-state subsystem (dead, no callers) — DONE (#2, PR #35)
2. **Goal subsystem retirement.** DONE (#4, 2026-05-07, branch `retire/goal-subsystem`). Bundled with event-log retirement (originally listed as a separate step) since all 3 event-log call sites were goal-flavoured. ~3700 LOC + 5 tables + 9 functions + 4 cron jobs. See `docs/plans/2026-05-07-retire-goal-subsystem.md`.
3. **Browser FSRS retirement.** DONE (#3, PR #36). Move `inferRating` to `_shared/srs/`; delete `src/lib/fsrs.ts`; simplify `capabilityReviewProcessor.ts`; delete `previewScheduleUpdate`.
4. **Session lifecycle retirement.** DONE (#5, 2026-05-07, branch `retire/session-lifecycle`). Replaced `startSession`/`endSession` with client-side UUID minting + RPC-side upsert from answer commits. Deleted `lib/session.ts` (110 LOC) and `useSessionBeacon.ts` (30 LOC) entirely; bundled Lesson + Podcast caller surgery; dropped `job_finalize_stale_sessions` cron + function; dropped dead `learning_sessions_write` RLS policy; narrowed `learning_sessions` GRANT to SELECT only. ~221 LOC + 1 fn + 1 cron + 1 RLS policy + RPC modification. See `docs/plans/2026-05-07-retire-session-lifecycle.md`.
5. **Source-progress retirement → lesson-activation.** DONE (#6, 2026-05-07, branch `retire/source-progress`). Added the `learner_lesson_activation` table + `set_lesson_activation` RPC; auto-activated legacy lessons (1–3) for existing users via master-migration backfill, and for new sign-ins via the `authStore.onAuthStateChange` SIGNED_IN hook; replaced the lesson-page mark-as-X buttons with a single Mantine activation Checkbox; rewrote the eligibility filter from `isSourceProgressSatisfied` to `capability.lessonId == null || activatedLessons.has(capability.lessonId)`; simplified mastery rule 2 to depend on `lessonActivated` instead of `sourceProgressState`. Deleted `sourceProgressService`, `sourceProgressGates`, `lessonExposureProgress`, the source-progress tables, the `record_source_progress_event` + `_capability_source_progress_met` RPCs, the `lesson_page_blocks.source_progress_event` column, and ~2,820 staging-file occurrences. Added `learning_capabilities.lesson_id` for the eligibility gate. ~4,173 LOC delete + ~830 LOC add. See `docs/plans/2026-05-07-retire-source-progress.md`.
6. **Module folds.** One at a time. Suggested order: lessons, capabilities (cleanup), session-builder, exercise-content, analytics (incl. mastery), audio, auth, profile.
7. **Legacy `src/lib/` root cleanup.** PARTIALLY DONE (#7, 2026-05-08, branch `retire/legacy-lib-root`). Retired `sessionQueue.ts`, `sessionPolicies.ts`, `stages.ts`, and the transitively-orphaned `capabilities/sessionCapabilityDiagnostics.ts` (~2518 LOC delete). `useExerciseScoring.ts` deferred to a separate relocation PR (11 production callers; relocation, not retirement). See `docs/plans/2026-05-08-retire-legacy-lib-root.md`.
8. **Test colocation.** Disperse `src/__tests__/` into the modules.

Each step should be a separate PR with passing tests + the `make pre-deploy` gate.

### Constraints to honour

- **The canonical-key contract must not change.** `buildCanonicalKey` produces FSRS-keying strings. Any change orphans every learner's state. Refactor only its physical location, never its logic.
- **`make migrate` must remain idempotent.** Migrations are SSH'd into the homelab and run via `docker exec`; they need to be safely re-runnable.
- **The `make pre-deploy` gauntlet** (lint + test + build + check-supabase + check-supabase-deep) is the documented gate; CI cannot reach the homelab.
- **GitHub Actions builds the image on every push to main** but does not deploy. The image must be pulled to the homelab and the container recreated manually (per CLAUDE.md).

---

## Backlog (not locked, optional follow-ups)

| Item | Effort | Notes |
|---|---|---|
| Migration plan execution | Significant | The largest open piece — taking the locks above and rewriting code to match. |
| `src/lib/` root cleanup | Medium | Relocate the few stragglers above. |
| Test colocation | Medium | Disperse `src/__tests__/` into modules. |
| Update `docs/architecture-layers.html` | Small | Currently reflects current state. Could add a Plate V or rebuild to reflect target. |
| Future GDPR orchestrator | Future | `lib/user-data-rights/` enumerating personal-data hooks across modules. Build when needed. |
| Optionally split `lib/capabilities/` physically | Small | Pipeline-only functions could move to `scripts/lib/pipeline/capabilities/`, with the shared contract staying in `src/`. Behaviour-neutral; nice-to-have. |
| Promote podcasts to `lib/podcasts/` | Future | Only if real podcast logic accrues (progress tracking, recommendations, etc.). The promotion criterion is concrete: at least one function hides non-trivial logic. |

---

## Glossary

Terms used throughout this document and in module specs:

- **Capability** — one item × one skill type (e.g., `(rumah, recognition_meaning)`). The atomic unit of what's learned and reviewed. 12 type values × 2 directions; thousands of rows when projected.
- **CapabilityRenderPlan** — the inflated form of a `SessionBlock`, with everything needed to render the card (prompt, correct answer, distractors, audio URL, etc.).
- **SessionBlock** — abstract queue entry: `{ capabilityId, exerciseType }`. Output of `lib/session-builder/`; input of `lib/exercise-content/`.
- **SessionPlan** — the full output of `buildSession`: blocks, audible texts (for prefetch), labels, planning signals, diagnostics.
- **Lesson activation** — a single boolean per learner per lesson, set by a checkbox. Replaces the source-progress state machine. Owned by `lib/lessons/`.
- **AnswerReport** — what the player ships after every answer: `{ wasCorrect, hintUsed, isFuzzy, rawResponse, normalizedResponse, latencyMs }`.
- **FSRS state** — the per-capability schedule data: stability, difficulty, last-reviewed-at, next-due-at, review count, lapse count. Stored in `learner_capability_state`. Computed by `_shared/srs/`.
- **Plate IV** — the local content pipeline. Capture → OCR → catalogue → staging → agents → publish → capability materialisation → audio synthesis. Detailed in `docs/architecture-layers.html`.
- **Promotion criterion** — when a feature graduates from `services/` to `lib/<name>/`. Concrete: at least one function hides non-trivial logic.
- **Shared module** — used by both runtime and pipeline. Co-located in `src/lib/<name>/` or `supabase/functions/_shared/<name>/`.

---

## Source references

The decisions in this document derive from inspecting the following files at the time of writing. Any future contributor can re-verify the findings by reading the same files.

- `src/services/*.ts` — all 19 service files; the runtime data adapters.
- `src/lib/supabase.ts` — Supabase client configuration.
- `src/stores/authStore.ts` — Zustand auth store.
- `src/lib/capabilities/*.ts` — capability projection, validation, keying, types.
- `src/lib/mastery/masteryModel.ts` — 524 LOC of pedagogical labeling rules.
- `src/lib/distractors/*.ts` — 6-tier cascade and helpers.
- `src/lib/pedagogy/*.ts` — load budget, source-progress gates, session posture.
- `src/lib/session/*.ts` — session composer, capability session loader, planning signals.
- `src/lib/lessons/*.ts` — overview, readiness, activation gate (planned).
- `src/lib/audio*.ts` + `src/contexts/*Context.tsx` — audio module surface.
- `src/lib/fsrs.ts` (retired) — browser-side FSRS adapter.
- `supabase/functions/commit-capability-answer-report/index.ts` — authoritative scheduler.
- `scripts/migration.sql`, `scripts/migrations/*.sql` — schema and Postgres functions.
- `scripts/*.ts`, `scripts/lib/*.ts` — content pipeline.
- `CLAUDE.md` — project conventions, deploy procedures, sharp-edge documentation.

---

**End of target architecture document.**
