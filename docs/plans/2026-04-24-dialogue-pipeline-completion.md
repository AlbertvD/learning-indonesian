# Dialogue Pipeline Completion

**Revision:** v4 (2026-04-24) — final. v3 was approved by both architect + linguist-reviewer; v4 folds in the 4 implementer-clarity notes from their v3 reviews (Task 1.7 function-layer naming, Task 1.4 token normalization, Task 1.7 recall_sprint case, Task 0.3 speaker-context cross-reference).

**Goal:** Make `item_type='dialogue_chunk'` items first-class reviewable units, fulfilling the contract documented in `docs/architecture/session-engine.md` (cloze at retrieving, recognition_mcq at productive+). Deliver this via a staged rollout — validate end-to-end on lesson 9 before touching the rest of the corpus.

---

## Current state

- **The bug:** the catalog/staging step extracts dialogue lines from lesson source pages and emits one `learning_items` row per line (`item_type='dialogue_chunk'`, `context_type='dialogue'`). No producer in the pipeline fills `translation_nl` / `translation_en`, and no producer emits cloze contexts anchored on dialogue lines. `selectExercises` routes retrieving-stage dialogue_chunks *always* to cloze (`session-engine.md:125`) — with no artifacts, the render returns nothing, `buildSessionQueue` returns `[]`, session shows "No exercises available."
- **Incident surfaced 2026-04-24**: 117 `learning_items` rows identified as unreviewable (no meanings, no active variants), 52 of them `dialogue_chunk` + 65 `sentence` + 20 with no contexts at all. All 117 deactivated as `is_active=false` in DB to unblock the user. Root-caused in conversation; this plan is the proper fix.
- **Stop-gap already shipped (`publish-approved-content.ts`)**: any `dialogue_chunk` lacking `translation_nl` AND a matching cloze context gets `review_status='deferred_dialogue'` instead of being published. Prevents future regression; does not fix existing deactivated rows or unlock dialogue review as a feature.

## Why dialogue review matters

Cloze on a dialogue line is one of the strongest exercise types when well-designed: it exercises vocabulary, grammar, and discourse comprehension on *real* language the user has already seen in the lesson reader. Lessons 1–4 and 6 (no dialogue sections) don't need this; lessons 5, 7, 8, 9 (dialogue present) currently ship dialogue-as-display-only.

---

## Supabase Requirements

No schema, RLS, grant, or homelab-configs change.

- **New tables / columns:** None. `learning_items`, `item_meanings`, `item_contexts`, `exercise_variants` already have the columns needed.
- **RLS policies:** No change. Existing SELECT for `authenticated` on `indonesian.*` already covers dialogue_chunks and their children.
- **Grants:** No change.
- **PostgREST:** No schema exposure change, no cache reload needed.
- **Kong:** No CORS change.
- **GoTrue:** No auth config change.
- **Storage:** No new buckets (dialogue audio is out of scope — see `2026-04-16-exercise-audio-design.md`).
- **Health checks:** Additions scoped in Phase 4 (DB cleanup) + cross-linked to the sibling `check-content-health.ts` plan (see Out of Scope).

---

## Contract definitions (locked up front)

These were ambiguous in v1 and caused most review findings. Locked here before task work begins:

### C-1: `dialogue_chunk` reviewability = BOTH artifacts

A `dialogue_chunk` is *reviewable* iff:
- It has `item_meanings.translation_language='nl'` (required for recognition_mcq at productive+, and the meaning panel on any exercise), AND
- It has at least one `item_contexts` row with `context_type='cloze'` AND at least one active `exercise_variant` rendering against that context (required for cloze at retrieving/recall_sprint/quick stages).

"Either-or" is insufficient: `session-engine.md:125` routes retrieving-stage dialogue_chunk *always* to cloze; translation alone doesn't satisfy that path.

### C-2: `learning_item_slug` for dialogue cloze contexts

Dialogue-line slugs are multi-word, potentially long (≤200 chars). Slug shape:
- `cloze-creator` writes `learning_item_slug = base_text.toLowerCase().trim()` (identical to `learning_items.normalized_text` derivation in `publish-approved-content.ts:293`).
- No `kebab-case` transform, no truncation. Dialogue lines can contain punctuation, diacritics, accents — preserve them.
- `candidateSlugs()` (`publish-approved-content.ts:124-134`) stays as-is. It's built for parentheticals/asterisks which dialogue lines won't have; `exact` candidate matches the `normalized_text` directly.
- DB lookup in step 5 of `publish-approved-content.ts` (`.eq('normalized_text', ...)`) tolerates 200-char values — no schema constraint limits normalized_text length.

### C-3: Pre-publish gate (already shipped) is authoritative

The stop-gap gate at `publish-approved-content.ts:266-284` handles dialogue_chunks. Phase 1 Task 4 *widens* step-6 verification to catch non-dialogue orphan patterns (the 65 `sentence` + 20 no-context items), but does NOT duplicate the dialogue_chunk gate. Key principle: gate dialogue-chunks pre-write (skip/defer cleanly); verify non-dialogue orphans post-write (exit CRITICAL, require re-run).

### C-4: Exercise design rules for dialogue cloze

To prevent the pedagogical pitfalls the linguist flagged:
- **Minimum line length:** only dialogue lines with ≥6 tokens are cloze-eligible (starting threshold; Phase 1.2 tunes it empirically against lesson 9's observed distribution before rollout). Shorter lines (e.g. `"Ada apa?"`, `"Ya."`) are allowed to have no cloze context and remain `deferred_dialogue` indefinitely — the lint rule permits this exemption, annotated by `cloze-creator` writing an explicit skip reason to `cloze-contexts.ts` metadata.
- **Blank selection (lint-enforceable):** the blanked word must be (a) a vocabulary item present in `learning_items` for the current or a prior lesson (no unknown-word-in-unknown-line double-miss), (b) have a POS where at least two same-POS plausible distractors exist from the lesson's vocabulary pool. These are structural — `lint-staging.ts` can verify both.
- **Blank selection (reviewer-judgment):** the blanked word must be the unique semantic fit in the sentence (not a slot where any same-POS word would work). This is LLM-judgment, not lintable — enforced by `linguist-reviewer` per Task 0.2 alone.
- **`translation_en` policy:** dropped from this plan. The app is NL-first; `cloze-creator` and `linguist-structurer` produce NL only. EN translations are a separate future concern.

---

## Phases

The v1 flat 6-task list is restructured into phases with an explicit validation gate between Phase 1 and Phase 2 (linguist's recommendation: prove the contract end-to-end on lesson 9 before rolling across the corpus).

### Phase 0 — Agent contract updates (no DB writes)

Addresses the head-on conflicts between the plan and existing agent prompts. Nothing in DB changes during this phase. All edits confined to `.claude/agents/*.md`.

**Pre-work (Task 0.0):** `grep -n 'dialogue' .claude/agents/*.md` to confirm no dialogue-related rules in `grammar-exercise-creator.md` or `vocab-exercise-creator.md` contradict C-1/C-4. If any found, add a 0.x task for each. Low probability but a 30-second check.

#### Task 0.1 — Rewrite `cloze-creator.md` dialogue rule

**File:** `.claude/agents/cloze-creator.md`

Today lines 50-55 say: *"Do NOT write cloze contexts for: Full dialogue sentences (entire turns like 'Selamat pagi, apa kabar?') — these are display-only and would be unnatural to blank."*

This rule reflects a prior design decision that dialogue is display-only. It's now wrong. Rewrite that section to:

- Dialogue lines **are** valid cloze targets when the line satisfies C-4 (≥6 tokens, blanked word is vocab from current/prior lessons, POS-unique fit).
- Short lines (<6 tokens) or lines with no vocabulary word in them get no cloze context — and that's acceptable. Record the skip reason in `cloze-contexts.ts` so the reviewer can confirm intentional.
- Preserve the existing rule against blanking grammar particles or proper nouns.

Include in the rewritten section: one positive example (a long dialogue line with a cleanly-blanked content word) and one negative example (a short pleasantry that's intentionally skipped).

#### Task 0.2 — Rewrite `linguist-reviewer.md` dialogue check

**File:** `.claude/agents/linguist-reviewer.md`

Today Check 13 (lines 286-291) flags dialogue-turn clozes as a coverage error. Rewrite to:

- **CRITICAL** if a dialogue line satisfies C-4 requirements (≥6 tokens, contains a current/prior-lesson vocab word) but has no cloze context in `cloze-contexts.ts`.
- **OK** if a dialogue line doesn't satisfy C-4 requirements and is skipped (skip reason recorded).
- Add new check (lint also enforces — Task 1.4): **CRITICAL** if a dialogue cloze blanks a word that isn't in `learning_items` within the current or prior lessons.
- Add new check (lint also enforces — Task 1.4): **CRITICAL** if a dialogue cloze's blanked word has no same-POS distractors available in the lesson's vocabulary pool (render-time distractor cascade would degrade quality).
- **Reviewer-only (LLM judgment, not lintable):** **CRITICAL** if the blanked word is not the unique semantic fit for the sentence — i.e. another same-POS word from the pool would be equally or more natural. Reviewer prompts must explicitly include this rule with one positive example (unique fit) and one negative example (multiple same-POS words plausible).

#### Task 0.3 — Widen `linguist-structurer.md` write scope for dialogue translations

**File:** `.claude/agents/linguist-structurer.md`

Today line 39 says: *"Update grammar/exercise sections to structured format. Do NOT touch vocabulary/expressions/numbers/dialogue/text sections."*

Widen to allow one specific write to `learning-items.ts`: for every `dialogue_chunk` item with empty `translation_nl`, populate it with a literal Dutch translation. Translation rules:

- Literal, preserves register (casual / formal / imperative).
- Preserves idiom (do not over-localize).
- **Preserves speaker voice.** `learning-items.ts` dialogue entries don't carry a speaker field — the speaker attribution lives in `sections-catalog.json` `dialogue` sections (`lines[].speaker`). Structurer MUST cross-reference the catalog before translating: match each `learning_items.ts` dialogue_chunk against its catalog `lines[]` entry by `base_text` to recover the speaker role, then apply register consistently (e.g. Indonesian politeness-level — `anda` / `Bapak/Ibu` vs. familiar — should propagate to Dutch u/jij distinctions where the source language encodes it).
- Never translate proper nouns or loan-words that stay in the target language.

Leave the rest of the "do not touch" list intact — vocabulary/expressions/numbers still come from the catalog unchanged.

### Phase 1 — End-to-end validation on lesson 9

Full-chain proof before any rollout. Lesson 9 has 11 dialogue chunks currently deferred; it's a natural test target.

#### Task 1.1 — Run updated `linguist-structurer` on lesson 9

Produce `translation_nl` for each of the 11 dialogue chunks in `scripts/data/staging/lesson-9/learning-items.ts`. Verify manually that translations are natural Dutch (not DeepL-literal).

#### Task 1.2 — Run updated `cloze-creator` on lesson 9

Emit cloze contexts for each of the 11 dialogue chunks that satisfies C-4. Expect some to skip (short utterances); `cloze-contexts.ts` records skip reasons. Blanked words must come from lesson 9's own vocabulary pool (`learning-items.ts` word/phrase items).

#### Task 1.3 — Run `linguist-reviewer` (Task 0.2 updated)

Verify the updated Check 13 + new distractor/vocab-membership checks fire correctly. Iterate until clean.

#### Task 1.4 — Tighten `lint-staging.ts`

**File:** `scripts/lint-staging.ts`

Add CRITICAL severity check: for each `dialogue_chunk` in `learning-items.ts`:

- If `translation_nl` is empty → CRITICAL unless `review_status='deferred_dialogue'` and skip reason recorded in cloze-contexts.ts
- If no `cloze_context.learning_item_slug === normalized(base_text)` exists AND line token-count ≥ 6 → CRITICAL
- Carve out dialogue_chunk from the existing `vocab-enrichments.ts` lint rule (`lint-staging.ts:730`) — dialogue chunks rely on cloze contexts, not enrichments; runtime distractor cascade is authoritative for recognition_mcq at productive+. Alternative considered (emit enrichments for dialogue_chunk) rejected as over-authoring.

Add CRITICAL checks on the cloze-context contents themselves (structural half of C-4):

- For every dialogue cloze, the blanked word must match a `learning_item.normalized_text` in the same or a prior lesson (reject cross-lesson jumps forward). Lint cross-references `cloze-contexts.ts` against `learning-items.ts` files for current + prior lessons.

  **Token normalization:** the lint extracts the blanked word from the cloze's `source_text` (the token replaced by `___` or the answer key) and must normalize it identically to `publish-approved-content.ts:293` before comparing — `.toLowerCase().trim()` plus strip trailing punctuation. Without this, a cloze authoring `Ada` → lookup against `ada` trips a false CRITICAL. Spell out the normalization helper in the lint implementation (ideally import a shared util from the publish script or a new `scripts/lib/normalize.ts`).
- For every dialogue cloze, the blanked word's POS must have ≥2 other `learning_items` in the same lesson with matching POS (so the runtime distractor cascade has options). Reject if the lesson pool lacks same-POS siblings.
- **Duplicate normalized_text across dialogue lines in a single lesson** → CRITICAL. Expected empty set, but two dialogue lines collapsing to the same `normalized_text` after punctuation/case trim would break the cloze-context lookup and let one cloze silently mask another. Low probability; cheap assertion.

#### Task 1.5 — Tighten `publish-approved-content.ts` step-6 (non-dialogue orphan guard)

**File:** `scripts/publish-approved-content.ts` (step 6, `:626-638`)

*Widen* the existing NL-meaning check to catch non-dialogue orphans (the 65 `sentence` + 20 no-context items from the incident):

```
For each id in publishedItemIds where item_type != 'dialogue_chunk':
  reviewable = (item has item_meanings.translation_language='nl')
            OR (item has item_contexts row with active exercise_variant)
  if not reviewable: CRITICAL exit
```

Dialogue_chunks are explicitly excluded from this check — the pre-publish gate (`:266-284`) already handles them. This preserves the principle in C-3: dialogue gated pre-write, non-dialogue verified post-write.

**Transaction note:** step 6 CRITICAL exit still leaves partial writes (step 3 items inserted, step 5 cloze contexts possibly inserted). Admin re-runs the script after fixing staging; upsert handles step 3, step 4/5 inserts are not upserted but duplication is rare in practice. Full transactional publish is out of scope.

#### Task 1.6 — Publish lesson 9 + runtime verification

Run `bun scripts/publish-approved-content.ts 9`. Expect: 11 dialogue chunks publish successfully (not deferred), step 6 passes, cloze contexts land, exercise_variants generated where applicable.

**Runtime verification (acceptance criterion for Phase 1):**

1. Reactivate the 11 lesson-9 dialogue_chunk rows via Phase-4 tooling (Task 4.1 script run against lesson 9).
2. Log in as the test user. Force one dialogue chunk into an immediately-due state via service-role UPDATE:
   ```sql
   UPDATE indonesian.learner_skill_state
   SET next_due_at = now() - interval '1 day'
   WHERE user_id = '<test-user-uuid>'
     AND learning_item_id = '<lesson-9-dialogue-chunk-uuid>'
     AND skill_type = 'recognition';
   ```
   (Also ensure `learner_item_state.stage='retrieving'` for that item to route to cloze per `session-engine.md:125`; otherwise it routes to anchoring-stage MCQ which doesn't prove the cloze contract.)
3. Confirm: a dialogue-cloze exercise renders. User can answer. Review result persists. No "No exercises available" error.
4. Force stage to productive to exercise the second path:
   ```sql
   UPDATE indonesian.learner_item_state
   SET stage = 'productive'
   WHERE user_id = '<test-user-uuid>'
     AND learning_item_id = '<lesson-9-dialogue-chunk-uuid>';
   ```
   Confirm: a recognition_mcq renders with the Dutch translation as the prompt.
5. Reset state after verification so the test user's real FSRS history isn't polluted (optional but recommended — snapshot + restore).

**Gate:** Phases 2 and 3 do not start until Phase 1 runtime verification passes.

#### Task 1.7 — Unit test for dialogue_chunk routing

**File:** `src/__tests__/sessionQueue.test.ts` (extend)

Add test cases that lock in the C-1 contract at the code level (catches regressions independent of staging data).

**Runtime enforcement (new, added as part of Task 1.7 prep):** `filterEligible` in `src/lib/sessionQueue.ts` carries a `dialogue_chunk`-specific branch: `eligible = (hasUserLanguageMeaning) AND (hasClozeTypedContext)`. This enforces C-1 at runtime in addition to the publish-time gate and lint. Non-dialogue items keep the existing lenient OR-logic (`hasMeaning OR (hasContextWithActiveVariant)`).

The test matrix asserts against `filterEligible` when the C-1 contract is relevant, and against `selectExercises` when the item is eligible and routing matters:

| # | item_type | Artifacts | Stage | Target | Expected |
|---|---|---|---|---|---|
| 1 | `dialogue_chunk` | translation_nl + cloze context | retrieving | `selectExercises` | returns a cloze exercise with `clozeContext` populated |
| 2 | `dialogue_chunk` | translation_nl + cloze context | productive | `selectExercises` | returns a recognition_mcq with non-empty Dutch prompt |
| 3 | `dialogue_chunk` | translation_nl + cloze context | recall_sprint (item has `form_recall` skill due) | `selectExercises` | returns a cloze exercise (per `session-engine.md:137`) |
| 4 | `dialogue_chunk` | translation_nl only (no cloze context) | any | `filterEligible` | drops the item |
| 5 | `dialogue_chunk` | cloze context only (no translation_nl) | any | `filterEligible` | drops the item |
| 6 | `dialogue_chunk` | neither | any | `filterEligible` | drops the item |
| 7 | `sentence` (non-dialogue) | translation_nl only (no cloze context) | any | `filterEligible` | keeps the item — lenient OR-logic for non-dialogue types stays unchanged |
| 8 | `word` (non-dialogue) | no translation_nl, context with active exercise_variant | any | `filterEligible` | keeps the item — second path of lenient OR-logic |

Tests formalise the "BOTH artifacts required for dialogue_chunk" rule + the "non-dialogue lenient OR-logic" rule, so any future refactor that relaxes or conflates the two trips CI. Row 7/8 guard against accidental scope creep — if someone widens the AND-logic to all item types, they trip here.

### Phase 2 — Rollout to lessons 5, 7, 8

Once lesson 9 confirms the design, roll Tasks 0–1 content work across lessons 5 (6 chunks), 7 (11 chunks), 8 (17 chunks). Mechanical re-run of the phase-1 agent chain against each lesson's staging directory. No code changes in this phase.

After publish, reactivate the previously-deactivated rows (scripted — see Phase 4).

### Phase 3 — Legacy lessons 1–3 (authoring, not backfill)

Legacy lessons have dialogue only in `lesson_sections.content` — no `dialogue_chunk` learning_items exist in the DB. This is **net-new authoring**, not reverse-engineering: ~4–6 dialogues × ~6 lines per lesson × manual translation + cloze = several hours of agent time per lesson.

#### Task 3.1 — Extend `reverse-engineer-staging.ts`

**File:** `scripts/reverse-engineer-staging.ts`

Currently pulls only grammar + exercises; `INNER JOIN` on `item_meanings` at line 140-145 excludes items without translations. Extend to:

- Pull `lesson_sections` rows with `content.type='dialogue'` for the lesson.
- For each dialogue line in `content.lines`, synthesize a new `dialogue_chunk` entry in `learning-items.ts` with `review_status='pending_review'`, `translation_nl=''` (to be filled by Phase 1-equivalent agent run), `context_type='dialogue'`.
- For the dialogue path specifically, DROP the `INNER JOIN item_meanings` requirement — legacy dialogue has no meanings yet, so the join would eliminate exactly the rows we need. Implement as a separate query branch that reads from `lesson_sections.content` directly, not via the learning_items join.
- **Do NOT re-catalog `lesson_sections`** — the section rows already exist in DB and match what the lesson reader renders. This task only synthesises *new* `learning_items` staging entries alongside them. The reader and the review scheduler then share the same dialogue content, one display surface, one schedulable surface. (Alternative considered: regenerate lesson_sections from the new catalog — rejected as risking cosmetic drift in the reader for no gain.)
- Do NOT write any DB rows; staging only.

#### Task 3.2 — Author translations + clozes via Phase 1 chain

Run the updated `linguist-structurer` → `cloze-creator` → `linguist-reviewer` chain against lesson 1, 2, 3 staging directories. Blanked words must come from the same lesson's vocabulary pool (each legacy lesson has one).

#### Task 3.3 — Publish

`bun scripts/publish-approved-content.ts <N>` for each. Verify runtime.

### Phase 4 — DB cleanup

Standalone tooling that makes Phase 1/2/3 reactivation idempotent and disposes of permanently-unreviewable rows.

#### Task 4.1 — `scripts/reactivate-dialogue-chunks.ts`

Reads the just-published staging `learning-items.ts` for a given lesson. For each `dialogue_chunk`:

1. Look up the DB lesson by order_index → get `lesson_id`.
2. Find `item_contexts` rows for that lesson (`source_lesson_id = lesson_id`) joined to `learning_items` to narrow the reactivation target.
3. `UPDATE learning_items SET is_active=true WHERE id IN (<scoped subset>) AND item_type='dialogue_chunk' AND is_active=false`.

Critical: the scoping via `source_lesson_id` is defensive against cross-lesson collisions — two lessons could theoretically have a dialogue line that normalizes to the same text; without the lesson scope we'd reactivate items in unrelated lessons.

- Leaves existing `learner_item_state` and `learner_skill_state` rows untouched. `next_due_at` stays where FSRS left it — items that were overdue on deactivation become immediately due on reactivation. Acceptable: user wants to see those items anyway.
- Idempotent: re-runs no-op when everything is already `is_active=true`.

Run per-lesson after its publish. Phase 2 runs it 3 times (5, 7, 8); Phase 3 runs it 3 times (1, 2, 3).

**Helper companion SQL** (inline reuse for Phase 1.6 runtime verification):
```sql
-- Force a specific item immediately due for the test user (Phase 1.6 step 2)
UPDATE indonesian.learner_skill_state
SET next_due_at = now() - interval '1 day'
WHERE user_id = $1 AND learning_item_id = $2 AND skill_type = $3;

-- Force a stage promotion (Phase 1.6 step 4)
UPDATE indonesian.learner_item_state
SET stage = $stage
WHERE user_id = $1 AND learning_item_id = $2;
```

Wrap these in `scripts/dev-stage-force.ts` helper so Phase 1 verification doesn't rely on ad-hoc SQL.

#### Task 4.2 — Zombie disposition policy

Items that remain `is_active=false` after all phases complete are permanently unreviewable. Categories:
- **Dutch grammar prompts misclassified as `sentence`** (e.g. `"Pilih yang benar: …"`). Root cause is the catalog agent's classification rules — see Out of Scope. Disposition: stay inactive indefinitely until that fix ships. `check-content-health.ts` will list them as zombies; acceptable until the catalog fix lands.
- **Dialogue lines too short for cloze AND with no translation value** (hypothetical edge case; expected empty set after Phase 1). Disposition: stay inactive.

No hard-delete in this plan. Lossy; no rollback. A `status_audit` report in Phase 4.3 captures zombie inventory before any future deletion decision.

#### Task 4.3 — `scripts/status-audit.ts`

One-shot report run after all phases:

```
- Count of inactive dialogue_chunks (expected 0 after Phase 2+3, excluding short-line skips)
- Count of inactive non-dialogue items with no meanings and no variants (expected: Dutch grammar prompts, flagged for catalog-agent follow-up)
- Count of item_contexts.source_lesson_id IS NULL (expected 0)
- Count of zombie learner_skill_state rows (where referenced learning_item.is_active=false)
```

---

## Acceptance criteria

Phase-1 gate:

- [ ] Task 0.0 grep of `grammar-exercise-creator.md` + `vocab-exercise-creator.md` confirms no dialogue-related contradictions (or additional 0.x tasks added if found)
- [ ] `cloze-creator.md` + `linguist-reviewer.md` + `linguist-structurer.md` updated per Task 0.1–0.3
- [ ] Lesson 9's 11 dialogue_chunks publish (not deferred); `translation_nl` filled; ≥1 cloze context per eligible line; short-line skips documented
- [ ] `src/__tests__/sessionQueue.test.ts` extended with Task 1.7 routing cases; all pass
- [ ] 6-token threshold confirmed or tuned based on observed lesson-9 token distribution; threshold documented in C-4
- [ ] After Phase 1 publish + reactivation, **a session where a dialogue item is due renders a cloze exercise without error** (user-visible outcome; session walkthrough recorded)
- [ ] After Phase 1 publish + a forced stage promotion, **recognition_mcq for a productive-stage dialogue_chunk renders the Dutch translation as the prompt**
- [ ] `lint-staging.ts` fails CRITICAL on an intentionally-broken test fixture (dialogue_chunk without translation + cloze)
- [ ] `publish-approved-content.ts` step-6 fails CRITICAL on an intentionally-broken non-dialogue item (sentence without meaning + variant)

Full-plan completion:

- [ ] All 11 + 6 + 11 + 17 = 45 pipeline-lesson dialogue chunks reactivated and pass the reviewability contract
- [ ] All ~24–36 legacy-lesson dialogue chunks (estimated from lesson-1/2/3 sections) authored and reactivated
- [ ] `status-audit.ts` shows: 0 inactive dialogue_chunks (except intentional short-line skips), 0 NULL `source_lesson_id`, 0 zombie skill_state rows
- [ ] A session pulled with only dialogue items due renders ≥1 cloze exercise — regression test for the 2026-04-24 incident

---

## Out of scope

- **`scripts/check-content-health.ts`** (sibling plan). Standalone DQ-at-rest audit — orphan-by-context, orphan-by-lesson, zombie schedules. Decoupled from dialogue completion because the invariants apply regardless of dialogue state. To be written as `docs/plans/2026-04-24-content-health-check.md`.
- **Dutch grammar prompts misclassified as `sentence`** (e.g. `"Pilih yang benar: …"`). Root cause is `catalog-lesson-sections.ts` classification rules and/or the `linguist-creator` / `linguist-structurer` agents. Requires its own plan. Until then, `status-audit.ts` surfaces the inventory; Phase 4's zombie disposition leaves them inactive.
- **Audio for dialogue lines (listening_mcq).** See `docs/plans/2026-04-16-exercise-audio-design.md`.
- **Transactional publish rollback.** Step 6 CRITICAL failures leave partial writes; mitigated by upsert on step 3 and admin re-run. Full transaction wrap is a separate refactor.
- **`translation_en` for dialogue chunks.** App is NL-first; EN fill-in is a separate concern if the app later goes multilingual on user language.

---

## Verification (end-to-end regression test for the 2026-04-24 incident)

Scripted: after full plan completion, the test user should be able to:

1. Trigger a session with `?mode=backlog_clear`
2. The session surfaces dialogue-line cloze exercises (at least one among the rendered items) when dialogue items are scheduled
3. No `Session Error: No exercises available` under any scheduling state where dialogue items are due

This is the regression test that would have caught the original incident and is the plan's user-visible success criterion.
