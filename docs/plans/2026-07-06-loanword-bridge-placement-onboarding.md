---
status: approved
reviewed_by:
  - staff-engineer   # r1 SOUND (2026-07-06)
  - architect        # r1 needs-work → r2 APPROVE (2026-07-06; ADR-0004 carve-out scoping confirmed)
  - data-architect   # r1 needs-work → r2 APPROVE (2026-07-06; §4.3 seed shape is their specification)
---
<!-- Citation line numbers in migration.sql drift with unrelated edits (data-architect r2):
     re-pin all migration.sql cites immediately before authoring the actual migration diff. -->
<!-- AMENDED 2026-07-06 post-approval: §3.2 write path corrected (carrier column
     lesson_section_item_rows.loan_source_nl + full two-stage threading) after the build
     session caught writer-carrier drift the gauntlet missed. Targeted data-architect
     re-verification of the amended §3.2/§5 dispatched same day. -->
<!-- Slice-2 implementation additionally gated on §7.4 (user ratifies the ADR-0004 carve-out)
     and §7.5 (derive frozen constants + golden round-trip test). Slice 1 is clear to build. -->


# Loanword bridge + placement onboarding — the day-one experience

> **Decisions taken with the user (2026-07-06):** design both halves as one program, shipped in slices (loanwords first, placement second). Day-one flow = loanwords first for everyone, placement optional behind an explicit branch. **Assumed while user was away (flagged for confirmation):** placement seeds FSRS state with provenance (now reconciled with ADR 0004 via §4.4 — needs user ratification); slice-1 content targets ~150–200 loanwords; the loanword collection is free-forever funnel content (Phase-2 note only, nothing built now).

## 1. Why

Two unfair advantages compose here:

1. **The NL→ID pair.** Indonesian absorbed thousands of Dutch words (*kantor ← kantoor, handuk ← handdoek, kulkas ← koelkast, wortel, knalpot, gratis…*) and Dutch borrowed back (*toko, pisang, senang, kampung*). No English-based competitor can say "je kent al duizenden Indonesische woorden."
2. **The capability model.** We know per-learner, per-word FSRS state — so a placement probe can do something no big app does: pre-seed a heritage learner's actual knowledge instead of forcing them through lesson 1.

Target users, in order: (a) the complete beginner, who gets instant wins on day one; (b) the heritage learner / returner (the Indo community, mixed NL-ID families), who gets a placement that makes the app feel clairvoyant.

## 2. Target-architecture grounding

- `lib/collections/` is the home for the loanword collection — it already resolves activated-collection member refs for the session-builder gate (`docs/current-system/modules/collections.md` §2, §5). Nothing new lands there beyond content.
- The session-builder eligibility gate is already `lesson activated OR word in activated collection` (`pedagogy.ts:393` inside `gateCandidates` at `:274`). **This design adds no new gate clause.**
- Placement is a **new noun** → new module `src/lib/placement/` (architect-approved: same post-lock precedent as `lib/collections/` itself, no fold conflict). Layering per target-architecture Rule 7 (`docs/target-architecture.md:64-67`): `lib/placement/` holds **pure logic only** (band selection, staircase, result assembly) + its adapter (the RPC call); the probe's exercise-rendering wrapper lives in the **page/component layer** — `lib/` must never import `components/`.
- **Seam (named):** `lib/placement/` does NOT import `lib/collections/` — collections' public API (`resolveActivatedMemberRefs`) doesn't serve band sampling. Placement carries its own read adapter over `collections`/`collection_items`/`learning_items.frequency_rank`. Acyclic both ways.
- Onboarding UI: new pages compose the page framework (`PageContainer`/`PageBody`/`PageHeader` + card primitives) per `feedback_ui_default_to_existing_framework`.

## 3. Slice 1 — the loanword bridge

### 3.1 Content (~150–200 words)

Curated from the Dutch-loanword corpus, selected for **recognizability** (transparent sound/spelling mapping) × **frequency** (prefer words with `frequency_rank`). Two authored categories, one collection:

- **ID ← NL loans** (the bulk): *kantor, handuk, kulkas, knalpot, wortel, gratis, bioskop, asbak, rekening, buncis…*
- **NL ← ID borrowings** Dutch speakers already know: *toko, pisang, sate, kampung, senang…*

Authoring path = the **existing vocab pipeline**, nothing new. Many words already exist in `learning_items` (check overlap against the **live DB**, not staging — `project_staging_learning_items_drifts_from_db`). Gap words follow the frequency-band precedent exactly (architect finding 3, corrected): the collection seeder **reports** gaps, it does not create them (`scripts/collections/seed-collection.ts:83-88`); gaps are hand-authored into the hidden **lesson-999 "Common Words"** synthetic unit (`scripts/data/staging/lesson-999/lesson.ts`, `module_id='common-words'`), published via `publish-approved-content.ts 999` (giving `lesson_id` → satisfies ADR 0006's CHECK), then picked up by a second collection-seed run. Loanword gaps go into a **new section of lesson-999** (not a new synthetic lesson — one home-lesson mechanism, not two).

### 3.2 Schema: `loan_source_nl`

One nullable column: `learning_items.loan_source_nl text` — the Dutch source/cognate word (`kantoor` for *kantor*). It is a property of the word, not of collection membership, so it lives on `learning_items`. The UI uses it for the "je kent dit al" reveal (`kantoor → kantor`).

**Writer — AMENDED 2026-07-06 (implementation-time finding by the build session; verified against code).** The r1-corrected text named the endpoint writer (`upsertLearningItemIdempotent`) but omitted the **carrier**: per ADR 0012 the capability stage reads item data **only from the DB** — its `LearningItemInput` is built from `TypedItemRow` (`projectors/vocab.ts:113-130`), which is SELECTed from **`lesson_section_item_rows`** (`loadFromDb.ts:112-114`), a lesson-stage-written table with no etymology column. As r2-approved, the writer was wired to a value that never arrives. The **full verified write path** (the exact groove `translation_nl` travels — every touch point below is its one-line sibling):

1. **Staging:** the lesson staging **vocabulary entry** gains optional `loanSourceNl` — the same authoring shape whose `dutch` field `projectSections.ts:179` reads (NOT `learning-items.ts`; that file is a different capability-stage input).
2. **Lesson stage — TWO files, not one (data-architect re-verification):** `projectSections.ts` emits `ProjectedItemRow` (`:25-33`); then **`lesson-stage/runner.ts:276-285`** converts `ProjectedItemRow → ItemRowInput` in a **separate field-by-field object literal** — because `loan_source_nl` is optional, the type-checker will NOT force this edit; forgetting it silently writes `null` forever (the same drift class, one hop later). ⚠️ Required: thread the field here explicitly + one unit test asserting `ProjectedItemRow` keys reach their `ItemRowInput` counterparts. Then `replaceLessonSectionItemRows` (`lesson-stage/adapter.ts:262-280`, plain bulk insert — additive-safe) writes **`lesson_section_item_rows.loan_source_nl`** (new carrier column — second migration column, see §5).
3. **Capability stage:** `loadFromDb.ts` SELECT + `TypedItemRow` gain the field → the vocab projector passes it into `LearningItemInput` → `upsertLearningItemIdempotent` (`capability-stage/adapter.ts:1089-1117`) adds it to the insert payload AND the on-conflict targeted-update list beside `translation_nl`/`translation_en`.

Regime unchanged: staging-canonical, rewritten every publish, no flag→review loop for etymology. ~7 mechanical touch points across both stages — the established two-stage carrier, not new mechanism. **Data-architect targeted re-verification (2026-07-06): amended-path-confirmed** — additionally verified: GT9 (`sectionShape.ts:47-51`) correctly needs NO entry (field is optional); no other `lesson_section_item_rows` consumer (`patternPath.ts`, `generateGrammarExercises.ts`, `contentUnits.ts`) needs changes (each destructures its own narrow type); no health check enumerates columns; carrier-table RLS is lesson-content-standard, nothing new needed.

**Authoring consequence (architect note 7):** for loanwords already in `learning_items`, `loan_source_nl` is added in **whichever single lesson-staging file owns each item** (ADR 0006 one-declaration-per-item) — scattered across lesson dirs, not centralized.

**Omission test:** without the column, the welcome experience can't show *why* the learner already knows the word — the entire point of the bridge. No alternative home exists (`item_meanings` is gloss, not etymology).

### 3.3 Collection

One authored theme collection (`kind='theme'`, slug `nl-leenwoorden`), membership = authored `collection_items` rows. Reuses the collections runbook (`scripts/collections/README.md`). It appears in Ontdek like any theme pack.

### 3.4 Onboarding flow

- `Register.tsx` post-signup navigate changes `/` → `/welkom` (one line at `Register.tsx:55`; the invite-gated `signup-with-invite` flow is untouched — architect note 8).
- `/welkom` (new route behind `ProtectedRoute`, page-framework primitives):
  1. **The reveal** — a curated ~10-word wall of `loan_source_nl → indonesian` pairs ("Je kent al Indonesisch. Serieus.").
  2. **One tap** — activates `nl-leenwoorden` via the existing `set_collection_activation` RPC (`src/lib/collections/activation.ts:19`) and starts a first session drawn from it (existing session builder; the collection gate makes the words eligible — zero session-engine changes).
  3. **The branch** — a quiet secondary link: "Ik ken al wat Indonesisch → doe de instaptoets" (routes to slice 2; until slice 2 ships, the link is absent, not stubbed).
- Skippable at every step ("Later" → dashboard). Existing users: `/welkom` is deep-linkable and the collection is in Ontdek; no dashboard nag mechanism (omission test: nothing breaks — existing users find it via Ontdek).

## 4. Slice 2 — the placement probe

### 4.1 Probe mechanics

- **Item selection:** stratified sample over `frequency_rank` bands (aligned to the live top-100/300/500/1000 collections) — bands only; a lesson-vocab stratum was cut in staff-engineer review (it had no defined output). ~20–30 items, adaptive: start mid-band, step up/down by answer correctness (simple staircase, not IRT — the bands are coarse anyway).
- **Exercise form:** recognition MCQ + typed recall. The rendering wrapper is a page-layer component reusing exercise primitives; `lib/placement/` supplies items + scoring logic only (Rule 7, §2). No FSRS commit during the probe.
- **Output:** an estimated frontier — the highest **fully-cleared** band (staff-engineer: no p(known) threshold; 2–3 samples per band make thresholds false precision) — plus the concrete list of correctly-answered item `normalized_text`s.
- **Abandon mid-probe:** nothing was written; no partial state to clean up.

### 4.2 What it writes — one RPC, two effects

A single `SECURITY DEFINER` RPC `apply_placement_result(p_band_slugs text[], p_known_texts text[])` (`auth.uid()`-scoped — no user_id argument), one transaction:

1. **Activations:** resolve slugs → ids (`select id from indonesian.collections where slug = any(p_band_slugs)` — data-architect 7b), then call the existing `set_collection_activation` RPC (`migration.sql:3559`) per band — never a second hand-rolled writer for `learner_collection_activation` (staff-engineer). *Without this effect, seeded state is invisible to the eligibility gate — seeding alone schedules nothing.*
2. **FSRS seed:** for every item capability of a judged-known word **where no `learner_capability_state` row exists** (only-if-absent, never update), insert the seed shape in §4.3. Judged-known = items directly answered correctly in the probe + items in fully-cleared bands. Uniform across the word's item caps — FSRS self-corrects fast on a lapse; per-cap-type differentiation fails the omission test.
3. **Idempotent & additive:** re-running can only add. Retake allowed (it can only extend, never overwrite real review history).

**Why seed at all (vs. activation-only):** a heritage learner with ~400 known words would otherwise grind them all as "new" at short intervals for weeks — the exact churn moment this feature exists to prevent.

### 4.3 The seed shape (data-architect-specified — resolves former blocking OQ1)

| column | value | why |
|---|---|---|
| `activation_state` | `'active'` | schedulable |
| `activation_source` | `'placement'` | provenance; **sticky forever** — the commit RPC's `coalesce` (`migration.sql:1725`) never overwrites it, so it must NOT be read as "still unreviewed" (comment this next to the CHECK extension) |
| `review_count` | **`3`** | lands in `'strengthening'` in BOTH mastery readers (`migration.sql:2167`, `masteryModel.ts:194`) — never "introduced/unpracticed" (the `review_count=0` short-circuit at `:2164`/`:190-192`), never `'mastered'` (needs ≥4, `:2165-2166`/`:1961`): **mastery is earned by real reviews, never claimed by a probe** |
| `lapse_count`, `consecutive_failure_count`, `state_version` | `0` | clean slate |
| `stability`, `difficulty` | **frozen named constants, always paired** | derived once from the real engine (verified below), tied to `fsrsAlgorithmVersion='ts-fsrs:language-learning-v1'` (`migration.sql:1495`) with a test that fails if the version changes without re-derivation. Never re-implement FSRS math in PL/pgSQL |
| `last_reviewed_at` | **`NULL`** | the honesty + reversibility key: "assessed via placement, never genuinely reviewed." Flips exactly once, irreversibly, on the first real commit (`migration.sql:1730`) |
| `next_due_at` | `now() + jitter(1..N days)` | spread so the review queue doesn't spike |
| `fsrs_state_json` | mirror of the above, carrying every key the commit RPC's required-keys check enforces (`migration.sql:1536-1551`) | so the existing generic read-and-resubmit path round-trips with **zero placement-specific client code** |

**Reversibility (replaces the r1 draft's dead `review_count=0` rule — data-architect finding 4):**
`delete from indonesian.learner_capability_state where activation_source='placement' and last_reviewed_at is null` — matches exactly the rows never genuinely reviewed.

**Engine continuation — VERIFIED (closes data-architect finding 6):** the FSRS engine is the `commit-capability-answer-report` edge function; `computeNextState` (`supabase/functions/commit-capability-answer-report/index.ts:119-142`) treats a card as new iff `activationState==='dormant' || stability==null || difficulty==null` — **not** by reviewCount/lastReviewedAt. The seeded row therefore continues from its seeded stability/difficulty as a Review-state card (`state: 2`), via the pre-existing `last_review: lastReviewedAt ?? undefined` branch (`:137`). Residual to pin with the required golden test: first post-seed review computes with elapsed-days≈0 (slightly conservative growth — acceptable). **Type updates required:** add `'placement'` to the `activationSource` unions in `capabilityReviewProcessor.ts:15` and the edge function's `ScheduleSnapshot`/`StateRow`.

**Analytics read-model — zero new branches (data-architect):** `_mastery_label`, `labelForCapability`, `get_lessons_overview` inline filters read the seed as `'strengthening'`/practiced; `get_weekly_movement` and `get_stability_series` are event-driven, so seeds are invisible to them until a real review. `get_memory_health` does not exist as a function (comment-only reference at `migration.sql:2268`; verified 2026-07-06) — no live state-averaging reader to guard.

### 4.4 ADR 0004 reconciliation (architect findings 1–2 — CRITICAL, resolved by a new ADR)

ADR 0004 (`docs/adr/0004-capability-review-commits-are-atomic-and-idempotent.md:13,20`) reserves learner-state writes to the Review Processor (+ migration-time admin backfill). The reading-harvest precedent (`migration.sql:3584-3597`) deliberately chose membership-rows + mint-on-first-review — "no new RPC, no `activation_source` widening, no direct write."

**Why placement is a genuine exception, argued explicitly:**
- Harvest words are **new** to the learner — mint-on-first-review is correct there. Placement words are **claimed-known** — mint-on-first-review reproduces the regrind this feature exists to prevent. Same gate problem, different knowledge state.
- The ADR-0004-compliant alternative (replay probe answers through `commit_capability_answer_report`) can only cover the ~20–30 **tested** items, not the inferred bands — shrinking the deliverable (goal-erosion), and fabricating events for untested words would corrupt the event log's meaning (every event = a real learner answer), which is *worse* for data honesty than a flagged state row.

**Deliverable:** a new numbered ADR — *"Placement seeding is a permitted second learner-state writer"* — scoped to exactly: the one RPC, insert-only/only-if-absent, the §4.3 seed shape, the `last_reviewed_at IS NULL` reversibility predicate, and **no `capability_review_events` writes ever** (the event log remains exclusively Review-Processor-owned). The ADR text MUST state the load-bearing mutation-boundary invariant explicitly: *placement CREATES initial rows only; it never MUTATES an existing row — the Review Processor remains the sole mutator* (this is what preserves ADR 0004's bug-localization guarantee; architect N-2). Add a "Superseded-in-part by <new ADR>" back-link line to ADR 0004 so the carve-out is discoverable from 0004 itself (architect N-1). Data-architect has co-signed the shape (their r1 specification IS this carve-out's content); architect approved the scoping in re-review. **This ADR is also the user-ratification point for the seeding decision assumed on 2026-07-06.**

### 4.5 Learner-data gates

`learner_capability_state` + `learner_collection_activation` writes → full chain: **architect + data-architect sign-off** in `reviewed_by`, `make migrate-idempotent-check`, `make migrate`, `make pre-deploy`. Restore path unaffected (data, not schema shape). Required tests: the golden round-trip test (§4.3, seeded row → one real "Good" review → no stability cliff) and the frozen-constants version-pin test.

## 5. Supabase Requirements

### Schema changes (`scripts/migration.sql`)
- `learning_items` ADD COLUMN `loan_source_nl text` (nullable; pipeline-written per §3.2).
- `lesson_section_item_rows` ADD COLUMN `loan_source_nl text` (nullable; the lesson-stage-written **carrier** — added by the 2026-07-06 §3.2 amendment; without it the capability-stage writer's value never arrives).
- `learner_capability_state.activation_source` CHECK gains `'placement'` — via the **drop-then-recreate constraint idiom** (`alter table … drop constraint if exists …; alter table … add constraint … check (…)`, the `learning_capabilities_source_kind_check` precedent at `migration.sql:1205-1207`; NOT `EXCEPTION WHEN duplicate_object`). One-line comment on provenance stickiness (§4.3).
- New RPC `apply_placement_result` — `SECURITY DEFINER`, `auth.uid()`-scoped. Grants per the codebase idiom (`migration.sql:3581-3582`): **`revoke all … from public;`** then `grant execute … to authenticated, service_role` — revoking from `anon` alone leaves the implicit PUBLIC grant in place (data-architect finding 2).
- New collection row + authored `collection_items` (content, via the collections runbook — not migration.sql).

### RLS / grants
- No new tables ⇒ no new policies beyond the RPC grants above. Seed rows are owner-scoped by construction (`auth.uid()`).

### homelab-configs changes
- PostgREST schema exposure: N/A (schema `indonesian` already exposed).
- Kong CORS: N/A. GoTrue: N/A. Storage: N/A.

### Health check additions
- `check-supabase-deep`: assert the `activation_source` CHECK includes `'placement'`; assert `has_function_privilege('anon', 'indonesian.apply_placement_result(text[],text[])', 'execute') = false` (existence alone is not the check — data-architect finding 2).
- `check-supabase` (tier 1): N/A — no anon-visible surface changes.

## 6. Out of scope (named so they aren't smuggled in)

- Monetization gating of the collection (Phase 2; noted: `nl-leenwoorden` is intended free-forever funnel content).
- SEO/marketing pages generated from `loan_source_nl` (separate future design).
- i+1 generated stories, AI conversation (separate Tier-1 designs).
- Recording probe answers as real review events (rejected — see §4.4: covers only tested items, and fabricated events for inferred words corrupt the event log).
- IRT/ELO placement models; p(known) band thresholds (staff-engineer: false precision).
- A `placement_runs` audit table (omission test: reversibility works via the §4.3 predicate; provenance via `activation_source`; retakes are safe via only-if-absent).

## 7. Open questions

1. ~~Seed shape vs mastery model~~ **RESOLVED** — §4.3 (data-architect-specified; staff-engineer's blocking finding closed).
2. ~~Where seed state is computed~~ **RESOLVED** — RPC-constructs from frozen versioned constants (data-architect: no real answer event exists to validate a client-supplied number against).
3. ~~Band inference threshold~~ **RESOLVED** — fully-cleared bands only (staff-engineer).
4. **OPEN (user ratification):** the ADR 0004 carve-out itself (§4.4) — the "seed FSRS state" decision was assumed while the user was away and now carries an ADR amendment; ratify before slice 2 implementation. Slice 1 has no dependency on it.
5. **OPEN (implementation-time):** derive the frozen stability/difficulty constants from the live engine + write the golden round-trip test (§4.3) before any migration merges.
