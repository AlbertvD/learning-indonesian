---
status: superseded
superseded_by: 2026-06-07-capability-generation-quality-salvage.md
parent: docs/plans/2026-06-06-capability-stage-v2.md   # umbrella (approved)
reviewed_by: [architect, data-architect]   # design APPROVED both; strangler-to-prod go-live seam ruled + framing corrected 2026-06-06 (round 4)
implementation: null
---

# Capability Stage v2 — Slice 1: `vocabulary_src`

The first vertical slice of the v2 redesign (umbrella §9). Delivers the vocabulary capabilities **end-to-end, to production**, **and** the shared substrate the later slices reuse. Built as a **strangler**: a clean DB-native vocabulary pipeline becomes the **live writer** for all `source_kind=item` capabilities, replacing the existing runner's item branch in one cutover commit; the existing `runCapabilityStage` runner keeps emitting the other source kinds (dialogue_line, pattern, affixed_form_pair) until each later slice peels its kind off. The **Lesson Stage is untouched**; the **runtime reader** (`byKind/item.ts`) and the **runner's item branch** are both cut over in this slice (§7). This is the target per CONTEXT.md ("each content origin gets its own separate pipeline … separation stops at the shared capability table") — not the inherit-the-runner anti-pattern: the new module is built clean DB-native from the first line and the runner *loses* its item branch to it.

> **Operating context (CLAUDE.md):** build-stage, single learner, disposable data. No live-system safety machinery — truncate and rebuild freely. Decisions below are sized for *simplicity first* (CLAUDE.md "Minimum Mechanism"); this spec deliberately strips the umbrella's live-system apparatus.

## 1. Scope

**In:** vocabulary capabilities (7 types), their MCQ/typed/dictation/cloze exercises + distractors, the cumulative-pool selection model, the local embedding service, the per-content-type module skeleton, and the shared identity/key/level layer.
**Out (later slices):** dialogue_line, grammar_pattern, word_form_pair generation. Under the strangler, those capabilities **keep being emitted by the existing runner** during this slice — they remain in the catalog, unchanged; this slice does not touch them. Each later slice migrates its kind off the runner into its own clean pipeline.

## 2. Capability identity — RESOLVED (band-aid-checked)

**The capability type is the single source of truth.** No generated column, no `derive_capability_type` SQL function, no SQL↔code sync check, no `context_to_id`, no axis-uniqueness rule, no `v1→v2` version dance. (These were the umbrella's §3 D1b/§7 apparatus — all live-system or self-created machinery; cut per Minimum Mechanism.)

- `learning_capabilities.capability_type` (enum string) is stored, as today, and identifies the capability.
- `canonical_key` keeps the live `cap:v1:` format unchanged (the runtime decoder hard-requires the `v1` literal — `adapter.ts:70`). It is treated as an **opaque, deterministic, unique** id: callers compare by equality, nothing parses its segments. No version bump.
- `direction` / `modality` stay **stored columns**, the writer fills them from one TS mapping (the same map that derives level). `learner_language` (∈ {nl, none}) stays **data-sourced** — it is per-word, not derivable from the type.
- `level` (recognise / recall / produce) is derived from the capability type via `deriveSkillTypeFromCapabilityType`. "Level belongs to the capability" (umbrella §3, model doc §7) holds because each type encodes a unique (direction, modality, level).

**Two cheap guardrails replace the deleted generated column's by-construction guarantee:**
1. **Boot-time assertion** (a module-load IIFE beside `renderContracts.ts:167`): every `CAPABILITY_TYPES` member must have (a) a `RENDER_CONTRACTS` entry and (b) a `deriveSkillTypeFromCapabilityType` branch, or the app refuses to start. Catches the silent "type schedules but renders nothing" failure (data-architect C1/M3).
2. **`UNIQUE(source_ref, capability_type)`** on `learning_capabilities` (idempotent index) — the semantic-identity guard a writer bug can't slip past (data-architect M1). `UNIQUE(canonical_key)` stays as the FSRS/dedup guard.

**The actual v2 identity change collapses to:** (1) fix `deriveSkillTypeFromCapabilityType` so `l1_to_id_choice` → `recognition`; (2) add the item-cloze type `produce_form_from_context`; (3) optional readable rename of the type strings; (4) land each new/renamed type with its `RENDER_CONTRACTS` entry + level branch **in the same commit** (atomicity replaces the SQL gate). Verify the receptive-before-productive sequencing (ADR 0007, `pedagogy.ts`) keys off the derived level, not the raw type string (data-architect I1).

## 3. The vocabulary capability set — RESOLVED

7 capability types (6 live + the new item cloze):

| capability_type | direction | modality | level | lang |
|---|---|---|---|---|
| `recognise_meaning_from_text` (was `text_recognition`) | id_to_l1 | text | recognise | nl |
| `recall_meaning_from_text` (was `meaning_recall`) | id_to_l1 | text | recall | nl |
| `recognise_form_from_meaning` (was `l1_to_id_choice`) | l1_to_id | text | **recognise** (mis-level fix) | nl |
| `produce_form_from_meaning` (was `form_recall`) | l1_to_id | text | produce | nl |
| `recognise_meaning_from_audio` (was `audio_recognition`) | audio_to_l1 | audio | recognise | nl |
| `produce_form_from_audio` (was `dictation`) | audio_to_id | audio | produce | none |
| `produce_form_from_context` (new — item cloze) | context_or_existing | text | produce | none |

Audio types are gated on the item having an audio clip. **Slice 1 defers the cosmetic rename** (tracked follow-up) — it keeps the live `replaces` names and makes only the *functional* type changes: (1) the `l1_to_id_choice` mis-level fix in `deriveSkillTypeFromCapabilityType` (→ recognition), and (2) emitting item-source **`contextual_cloze`** caps for cloze (the existing type already routes to the `cloze` builder — no new type, no `RENDER_CONTRACTS` addition). Item `cloze_mcq` is removed (item cloze is typed-only), so `contextual_cloze` drops from `RENDER_CONTRACTS.cloze_mcq.capabilityTypes`. The readable v2 rename of all type strings is its own later migration.

## 4. Distractor + cloze selection — RESOLVED (design level)

**Pool(N) = learning items introduced in lessons 1..N** (cumulative; the current lesson + all below). Selection draws **only** from Pool(N) — never a higher lesson (no forward leakage). Forward-only ⇒ earlier lessons' selections never churn when later lessons land (idempotent, ADR 0011).

- **`form` distractors** (pick the Indonesian word): **orthographic + frequency** similarity within same-POS Pool(N). No embeddings (look-alikes are the right signal).
- **`meaning` distractors** (pick the L1 gloss): **embedding-ranked** same-POS Pool(N) candidates. Embed the **`translation_nl`** gloss with a local model; exclude answer + its `/`-variants + morphological variants + near-synonyms (`cosine ≥ synonym_threshold`, start ~0.85, tune on real L1 cases); take top-k by cosine.
- **Degradation ladder** (never leaves Pool(N)): same-POS+band → relax band → relax POS → accept fewer. The real data shows nouns/verbs/adjectives are well-supplied from L1; only closed-class function words (particle/adverb/pronoun, classifier always) need the relax-POS rung.
- **Coverage is pool-relative:** the gate asserts `chosen = min(3, |eligible Pool(N)|)`, not an absolute floor. Runtime floor 2; `<2` eligible ⇒ typed `insufficient_distractor_pool` resolution-failure, skip that *render* (the capability stays schedulable via its other exercises). On real data this never fires.
- Selection-from-pool makes the old "distractor equals the answer" bug structurally impossible.

**Embeddings:** local `transformers.js` (`paraphrase-multilingual-MiniLM-L12-v2`, 384 dims), embedding `translation_nl`, cached in `item_embeddings(learning_item_id PK, embedding vector(384))`, computed once per new item. Behind one `shared/embeddings.ts` interface so the model is swappable. Scope: **meaning distractors only.**

### 4a. The `distractors` table + triangle — RESOLVED (data-architect audited 2026-06-06)

Wrong MCQ options are stored as **pointers to learning items**, not copied text (no drift when a translation is corrected; renders in the learner's language; items already loaded at runtime). DB-enforced FK integrity:

```sql
create table if not exists indonesian.distractors (
  capability_id uuid not null references indonesian.learning_capabilities(id) on delete cascade,
  item_id       uuid not null references indonesian.learning_items(id)        on delete restrict,
  primary key (capability_id, item_id)
);
create index if not exists distractors_item_id_idx on indonesian.distractors(item_id);
-- + RLS (authenticated SELECT; writes service_role only) + COMMENT ON TABLE/COLUMN
--   (item_id = a WRONG-option pointer, not the answer)
```

- **No `distractor_kind`, no `position`, no `options[]`** — the capability type implies meaning-vs-form; options shuffle at render.
- **`item_id` is `on delete restrict`** (not cascade): a deduped item used as a distractor across many capabilities can't be silently deleted out from under them — the delete fails loud until distractors are cleared/re-seeded. `capability_id` stays cascade.
- Supersedes + **drops** `recognition_mcq_distractors` + `cued_recall_distractors`.

**Triangle (all in ONE commit — data-architect C1/M1):**
- **Writer** `vocabulary/select-distractors`: select item_ids from Pool(N) (meaning-embedding | orthographic by capability type); idempotent — **skip a capability that already has distractor rows** (ADR 0011 seed-once); `--regenerate` deletes the capability's rows then re-selects (a naive per-row insert is NOT idempotent when the selection changes — DA Q5).
- **Reader** `byKind/item.ts`: **rewritten before the old tables drop**. A single new `fetchDistractors(capabilityIds)` queries `from('distractors').select('capability_id, item_id').in('capability_id', …)` (chunked, like the existing fetchers) — **replacing both** `fetchRecognitionMcqDistractors` + `fetchCuedRecallDistractors` (`item.ts:147-152`) — and resolves each `item_id` → that item's meaning (learner language) or form, per the capability type. It feeds **all three** MCQ builders: `recognitionMcq`, `cuedRecall`, and **`listeningMcq`** — the last is **newly wired**: today `recognise_meaning_from_audio` has no curated path at all (`listeningMcq.ts:37` is cascade-only), so its rows would be silently ignored (DA M1). The old text-array maps (built at `byKind/item.ts:155-160`, typed at `renderContracts.ts:329`) are removed. Dropping the old tables first = silent pool fallback / PGRST205 (the Slice-4a lesson) — so this rewrite and the drops ride in one commit (§7).
- **Validator + health check** (semantic, can't be DB constraints — DA I1): count = `min(3, |eligible Pool(N)|)`; no distractor item == the answer item; every distractor item ∈ Pool(N). (FK now guarantees existence, so the HC drops its "item exists" arm.)

### 4b. Vocab cloze — RESOLVED

The substrate already exists: **1,171 authored `cloze` carriers in `item_contexts`** (sentence-with-blank in `source_text` + `translation_text`; answer = the linked item's form), and the runtime reader already reads them (`byKind/item.ts:95` `fetchContexts` → `byType/cloze.ts`; the projector find is `renderContracts.ts:511`). Item cloze is "0 live capabilities" only because no item-source `contextual_cloze` capability was ever emitted (deferred #148).

- **Slice 1 cloze work = emit item-source `contextual_cloze` capabilities** for each item that has a cloze carrier (existing type — already routed; **no new type, no `RENDER_CONTRACTS` addition**). **No new cloze table** — read `item_contexts` directly (copying = drift, same as distractors; the umbrella's unified `cloze` table is dropped from scope, so the `dialogue_line_id` CHECK / DA NEW-M2 is a Slice-2 concern). Remove item-source from `RENDER_CONTRACTS.cloze_mcq` so item cloze is typed-only.
- **Pool constraint:** the answer is in Pool(N) by construction. A **validator/health-check flags** any carrier containing a word introduced above the capability's lesson (flag-and-fix via the review loop, not runtime sentence-selection).
- **Liveness:** this render path has never run (0 live caps ever) — Slice 1 must actually emit a capability, open a session, and confirm a cloze renders + a review event lands (feedback_answer_log_check).
- **Tracked end-of-v2 cleanup (NOT Slice 1):** `item_contexts` does 3 jobs today — cloze carriers, audio-text harvesting (`audibleTexts.ts:42`), and lesson-membership for the pool (`item.ts:124`). v2 moves the pool off it (Pool(N) derives from the capability `lesson_id`) and audio to its own service. Once those move, split the cloze rows into a precise typed table per ADR 0009 — clean then, cosmetic now.

### 4c. Audio — RESOLVED

The two audio capabilities (`recognise_meaning_from_audio`, `produce_form_from_audio`) need only the **word spoken**, which is lesson content the **Lesson Stage already generates** (`ensureLessonAudio` voices the vocab-list words and dedups against `audio_clips`). The capability stage already *reads* `audio_clips` (`loader.ts` / `adapter.ts:750`).

- **Slice 1 generates no audio.** Read `audio_clips`; emit the two audio capabilities **only when a clip exists** for the word's `normalized_text`.
- **The umbrella §5 "capability-stage audio service" is dropped** for vocab — the words are lesson content the Lesson Stage already voices; a capability-stage gap-fill service is mechanism the omission test rejects.
- **Verify during build (don't assume):** confirm `ensureLessonAudio` voices *every* vocab-list word, so gating-on-clip-existence doesn't silently drop a word. A gap is fixed in the Lesson Stage's text set, not here.
- **Deferred to later slices:** where *exercise-text* audio (contrast-pair options etc., not on the lesson page) gets generated — decided when a slice actually needs it.

### 4d. Retiring `src/lib/distractors/` — RESOLVED (callers enumerated)

The runtime cascade is fully enumerable and **all its callers are vocab MCQs Slice 1 already rewrites** — no hidden consumer:
- `pickDistractorCascade` callers: `recognitionMcq.ts`, `cuedRecall.ts`, `listeningMcq.ts` → cascade replaced by the curated pointer reader (§4a). `clozeMcq.ts` **item path** → removed (item `cloze_mcq` dropped — item cloze is typed-only); its **pattern path** uses authored grammar rows, not the cascade — untouched.
- `getSemanticGroup` / `SEMANTIC_GROUPS` are used only by the cascade + those builders' cascade calls; the new selection uses embeddings (meaning) + orthographic (form), so they retire with it.
- `src/lib/semanticGroups.ts` is a **dead re-export shim — zero *production* importers** (only `src/__tests__/semanticGroups.test.ts` imports it) → delete the shim **and** that test.
- ⇒ `src/lib/distractors/` (cascade/options/semanticGroups/structuralTypes/index + tests) is **fully deleted** once the 3 vocab MCQ builders move to the pointer reader, **and ALL `lib/distractors/` references are struck from `target-architecture.md`** — not just the roster row: `:178` (roster), `:461`, `:507`, the `lib/distractors/` section `:582-623`, and `:1538` (architect round-2 W1). Also drop the now-dangling `import … from '@/lib/distractors'` at `clozeMcq.ts:17` (architect round-2 W2). Entirely a vocab/Slice-1 concern (affixed distractors were never wired to it).

**Safe because the coverage gate replaces the fallback:** the cascade was the "no curated rows → pool fallback." Remove it only in the same commit that wires the curated reader + the pool-relative coverage gate (DA C1). `insufficient_distractor_pool` (§4 / Q3) is the defined surface for the impossible no-coverage case — no blank-card risk without the cascade.

## 5. Module structure — RESOLVED

Per-content-type vertical sub-pipelines in one deep module; the slicing falls out of the structure (umbrella §9). Built **clean / DB-native from the first line** (no staging reads); the existing `runner.ts` is already the shipped no-disk Slice-5b runner, so "don't inherit" governs **module shape** (build the new tree clean), not cutover ordering. Stays under `scripts/lib/pipeline/capability-stage/` for this slice — `shared/` is reused by later slices that still live beside the runner; any top-level per-origin dir rename is end-of-program cleanup, not now.

```
scripts/lib/pipeline/capability-stage/
├── orchestrate.ts        # thin: publish(contentType) | publishLesson(lessonId)
├── shared/               # db · canonicalKey+level map · idempotent upsert · embeddings · gate framework
└── vocabulary/           # read → project → select-distractors → select-cloze → audio-gate → write → verify
```

`publish('vocabulary')` walks lessons ascending so Pool(N) is complete; `publishLesson(N)` selects against the live ≤N pool.

**no-disk enforcement:** the new module is no-disk **by gate, not by assertion** — extend `scripts/lib/pipeline/capability-stage/__tests__/enforcement/noDiskReads.test.ts` to cover the new `vocabulary/` + `shared/` paths in this slice (§5 "no-disk by construction" is otherwise an unenforced claim — architect WARNING).

**Module spec:** create `docs/current-system/modules/capability-stage-vocabulary.md` (or update the capability-stage spec) in the landing PR. §5 Seams = upstream lesson-content tables (Stage Contract); sibling = the shrunk `runCapabilityStage` (non-vocab kinds) sharing only `learning_capabilities`; downstream = the runtime reader `byKind/item.ts`.

### 5a. Writer seam / publish invocation — RESOLVED (architect round 4)

The runner's **item branch is scattered**, not one call: item projection (`projectItemsFromTypedRows`, `runner.ts:211`), item-cap write (`upsertCapabilitiesSkipIfExists`, `:538`), learning_items+anchor (`:464-475`), DB-native POS backfill (`:489-533`), item distractor gen+write (`:559-697`, incl. `fetchSeededDistractorCapIds:564`, `deleteItemDistractors:575`, `upsertRecognitionDistractors`/`upsertCuedRecallDistractors:690-691`), item junction rows (`:767-797`), CS14-17 gate inputs (`:943-1011`). The strangler **amputates the whole item branch** out of `runner.ts` into the new `vocabulary/` module — it is *removed*, not filtered (a `source_kind` runtime filter would leave the item code resident = shallow-module drift, contra CONTEXT.md). What remains in `runner.ts` is exactly the non-item branch (pattern, dialogue cloze, affixed).

**Publish call shape** (`publish-approved-content.ts`, replacing the single Stage B call):
```ts
const stageA   = await runLessonStage({ lessonNumber, dryRun: false })
const stageB   = await runCapabilityStage({ lessonNumber, lessonId: stageA.lesson.id, dryRun, regenerate }) // non-vocab kinds (runner shrunk of its item branch)
const stageVoc = await orchestrate.publishLesson(stageA.lesson.id, { lessonNumber, dryRun, regenerate })     // vocabulary (new module)
```
Order **runner-first, vocab-second** (item rows are independent today; keeps a stable direction for any future cross-kind reference). `runCapabilityStage` stays the entry for non-vocab kinds and is deleted only at the program endpoint when its last kind peels off.

**No coexistence window for item caps.** The runner's item-branch removal and the new pipeline's first live run **ride the same commit** — `UNIQUE(source_ref, capability_type)` is the writer-bug backstop, **not** a license for both writers to emit item caps in one publish (they disagree on satellite rows — the runner writes the old text-array distractor tables, the new pipeline writes the `distractors` pointer table). Safe because vocab keeps its live `cap:v1:` keys + live type strings (the cosmetic rename stays deferred, §3).

## 6. Supabase Requirements

### Schema changes (`scripts/migration.sql`)
- **Fold** the 4 live capability tables (`learning_capabilities`, `capability_aliases`, `capability_review_events`, `learner_capability_state`) + `capability_resolution_failure_events` from the standalone `2026-04-25-capability-core.sql` / `2026-05-02-*` into `migration.sql` — **including their RLS policies**, because these tables are currently created **only** in the standalone files (not in `migration.sql`), so a `migration.sql`-only fresh rebuild (the build-stage truncate-and-rebuild path) would leave them RLS-enabled-but-policy-less. Use the per-policy `drop policy if exists; create policy` idiom for the folded policies (the old bulk DROP-POLICY loop was removed 2026-05-08 — `migration.sql:353-355`; no double-policy collision since `migration.sql` owns none of these today). Exclude the 3 already-retired tables.
- `UNIQUE INDEX IF NOT EXISTS` on `learning_capabilities(source_ref, capability_type)`.
- `CREATE EXTENSION IF NOT EXISTS vector` (installed 0.8.0, in `extensions` schema — idempotent); new `item_embeddings(learning_item_id PK, embedding extensions.vector(384))`.
- **New `distractors` table** (§4a): pointers, FK-enforced, `item_id` `on delete restrict`, RLS + comments. **Drop** `recognition_mcq_distractors` + `cued_recall_distractors` **only in the commit that rewrites `byKind/item.ts` to the pointer reader** (else PGRST205 / silent pool fallback — Slice-4a lesson). Also drop `cloze_mcq_item_distractors` (0 rows).
- **No new cloze table** (§4b) — vocab cloze reads `item_contexts` as-is. **`dialogue_clozes` is NOT dropped in Slice 1** — it still backs dialogue cloze until Slice 2 lands that path.
- **NOT added:** generated `capability_type` column, `derive_capability_type` function, `context_to_id` direction, axis-uniqueness constraint, `cap:v2:` version + guards.
- **Ops (not in migration.sql):** truncate `learner_capability_state` / `capability_review_events` / `learner_lesson_activation`, then re-publish vocabulary ascending. One-shot, build-stage; no maintenance window.

### homelab-configs changes
- PostgREST / Kong / GoTrue / Storage: **N/A** (indonesian exposed; pgvector present; `indonesian-tts` bucket exists for audio gap-fill).

### Health check additions
- See **§6a (gate set)** for the authoritative list. New HCs (≈HC26–30): identity, level-match, distractor coverage, cloze out-of-pool, audio-clip gating. Uniqueness + distractor-existence get **no** HC — the `UNIQUE` constraint + FK already guarantee them.

## 6a. Gate set (three-layer where the invariant is cross-module; DB constraint otherwise)

| Invariant | Enforcement | Health check |
|---|---|---|
| Identity — every `capability_type` has a contract + level mapping | boot-time module-load assertion + pre-write validator | HC: no live cap with a type lacking contract/level |
| Capability uniqueness `(source_ref, capability_type)` | **DB `UNIQUE`** | none (constraint suffices) |
| Level-match — no cross-level render | shared `level()` + `renderContracts.ts` load assertion | HC: no cap mapped to a cross-level exercise |
| Distractor coverage — `min(3,\|eligible Pool(N)\|)`, none==answer, all ∈ Pool(N) | shared Pool(N) helpers + pre-write validator | HC: coverage + no-answer + in-pool |
| Distractor existence | **DB FK** | none (FK suffices) |
| Cloze pool — no carrier word above the cap's lesson | Pool(N) helper + pre-write flag | HC: out-of-pool carrier words |
| Audio gating — audio caps only when a clip exists | writer emit rule | HC: no audio cap without a clip |

**Minimum mechanism:** uniqueness + distractor-existence get **no** health check — the `UNIQUE` constraint + FK already guarantee them. So Slice 1 adds **5 health checks** (≈HC26–30, confirm at build) + 2 module-load assertions + one `Pool(N)` helper reused across distractors + cloze.

## 7. Rollout / testing
- One branch, build clean each commit; intermediate states may break the deployed app (nobody's there) but tests stay green.
- **Additive-first (migrate-anytime, no ordering constraint):** the schema fold + `distractors` + `item_embeddings` + `UNIQUE(source_ref, capability_type)` (all already committed), the embedding service + `item_embeddings` population, and the `vocabulary/select-distractors` writer. The writer must complete a **full ascending publish pass populating `distractors` BEFORE the cutover commit** — else a switched reader hits empty curated rows.
- **Writer go-live commit (the strangler — §5a).** Amputate the runner's entire **item branch** (incl. its distractor writers `upsertRecognitionDistractors`/`upsertCuedRecallDistractors` `runner.ts:690-691`, `fetchSeededDistractorCapIds:564`, `deleteItemDistractors:575`) and bring the new `vocabulary/` module live as the item-cap writer, **same commit**. No publish exists where both emit item caps.
- **Cutover commit (one commit — the order-sensitive step).** These ride together so there is no intermediate broken state: (1) the new `fetchDistractors` reader — queries `distractors(capability_id,item_id)`, batch-loads items, **resolves pointers → strings** and populates the *same* `curatedRecognitionDistractors`/`curatedCuedRecallDistractors` `Map<string,string[]>` keys (so builders are unchanged; §4a); replaces `fetchRecognitionMcqDistractors`+`fetchCuedRecallDistractors` (`byKind/item.ts:112-121`, callsite `:150-151`); (2) `recognitionMcq` + `cuedRecall` rewired to the resolved maps, their `pickDistractorCascade` calls removed; **`listeningMcq` newly given a curated read** — today `byType/listeningMcq.ts` has **no** curated path at all (the whole function is cascade-only; the earlier `:37` cite was wrong), so mirror `recognitionMcq.ts:16-25`; (2b) the `BuilderInputFor` note is a **comment fix only** — the two map keys + their `Map<string,string[]>` types do **not** change (DA round-4: the reader resolves before populating); (3) the `renderContracts.ts` `cloze_mcq` edit (remove the item leg, `:126`) + `clozeMcq.ts` item-path deletion + dropping its `@/lib/distractors` import (`clozeMcq.ts:17`); (4) delete `src/lib/distractors/` + the `semanticGroups.ts` shim + its test; (5) `drop table if exists … recognition_mcq_distractors / cued_recall_distractors / cloze_mcq_item_distractors cascade;` in `migration.sql`. Deploy **runtime-before-or-with** the table drops — never drop-first (PGRST205 / silent pool fallback, the Slice-4a lesson).
  - _(The writer go-live and the reader cutover MAY be the same commit if the `distractors` populate pass has already run; the invariant is: populate → reader+writer swap together → drops, never a window where a live writer/reader references a dropped table.)_
- **Pre-merge gate:** `make migrate-idempotent-check` (migration.sql applied twice = green; the new `drop table if exists` keeps it idempotent) + `make pre-deploy`.
- **Acceptance — fresh lesson (lesson 11).** Acceptance is a **real end-to-end publish of a brand-new lesson** (photos → OCR → catalog → staging → Lesson Stage → the new vocab pipeline), then open a session and confirm a `capability_review_events` row lands **for each vocab exercise family** — explicitly including `recognise_meaning_from_audio` (the new listening-MCQ curated leg) and item `contextual_cloze` (the never-yet-run render path) — per `feedback_answer_log_check`. A fresh lesson also proves the **fresh-lesson-safe** path (no prior capability/learner state for its words). Health-checks + idempotent-check never exercise the publish path (the Slice-4a lesson), so this real publish is mandatory, not optional.
- Tests: identity boot-assertion fires on a missing contract/level; pool-relative coverage on L1 function words; orthographic form-distractors; meaning-distractor synonym exclusion; idempotent re-publish = zero delta; the extended `noDiskReads` gate covers the new module.

## 8. Open questions
**All resolved.** distractors triangle → §4a · vocab cloze → §4b · audio → §4c · `lib/distractors` retirement → §4d · gate set → §6a · writer seam / publish invocation → §5a. _Tracked end-of-v2 (not Slice 1):_ split the cloze rows out of `item_contexts` into a precise typed table (ADR 0009) once the pool + audio jobs move off it.

Spec is **approved** (architect + data-architect, round 4 — see §9). Acceptance is a fresh-lesson (lesson 11) end-to-end publish (§7).

## 9. Review history
- 2026-06-06: identity layer (§2) designed via grill, then band-aid-checked — `staff-engineer` **SOUND**, `data-architect` **no blocker** (C1/M1/M2/M3 guardrails folded into §2). Full spec unreviewed → `status: draft`. Before `approved`: resolve §8, then dispatch `architect` + `data-architect` (data-model spec ⇒ both required, CLAUDE.md).
- 2026-06-06: distractors triangle (§4a) audited by `data-architect` — shape SOUND; 5 requirements folded in (same-commit pointer reader, `listening_mcq` curated leg, `on delete restrict`, RLS + comments, idempotent writer contract). Vocab cloze (§4b) resolved via grill (read `item_contexts`, emit the capability, no new table).
- 2026-06-06: audio (§4c) resolved via grill — Slice 1 generates no audio; reads `audio_clips`, gates the two audio capabilities on clip existence; the umbrella §5 capability-stage audio service dropped for vocab.
- 2026-06-06: `lib/distractors` retirement (§4d) — callers enumerated, all vocab MCQs Slice 1 rewrites; `semanticGroups.ts` shim is dead (0 importers); clean delete. Gate set (§6a) consolidated. **Spec design-complete; ready for dual review.**
- 2026-06-06 **full-spec dual review round 1** — `architect` NEEDS REVISION, `data-architect` NEEDS REVISION; both confirmed the **design is sound + correctly sized** (passes gate #5 both ways) and **type-as-source reversal re-confirmed sound** (DA). All findings were spec-accuracy / explicit-scope, now fixed: cloze keeps `contextual_cloze` + defers the rename (DA C1); RLS-fold rationale corrected (the bulk-DROP loop was removed 2026-05-08 — both CRITICAL/M1); `semanticGroups.ts` has a test importer, added to the delete set (architect CRITICAL); reader cites repointed to `byKind/item.ts` (architect mis-stated the file length — verified, lines exist); `lib/distractors` retirement strikes its target-arch entry; §7 gained cutover order + `migrate-idempotent-check`/`pre-deploy` + audio/cloze liveness checks; `dialogue_clozes` Slice-2 note. → round 2.
- 2026-06-06 **dual review round 2** — `architect` **APPROVED** (round-1 fixes verified against code; 2 non-blocking impl-PR warnings folded into §4d: strike ALL target-arch `lib/distractors` refs + drop the `clozeMcq.ts:17` import). `data-architect` **NEEDS REVISION** (round 3) on two items, now fixed: §4a names the concrete `fetchDistractors` reader + the `listeningMcq` curated wiring; §7 enumerates the full one-commit cutover bound set. → data-architect round 3.
- 2026-06-06 **data-architect round 3 — READY / approved.** Both round-2 items verified resolved against code, no new drift, gate set holds; one non-blocking INFO (the `BuilderInputFor` type update rides in the cutover commit — folded into §7). With the architect's round-2 APPROVED, the spec is now **`status: approved`, `reviewed_by: [architect, data-architect]`.** Next phase: BUILD.
- 2026-06-06 **round 4 — go-live seam (strangler-to-prod).** Operator decision: ship vocabulary as ONE vertical slice **to production** (not the earlier "build unwired, repoint at Slice 4" — that ruling is superseded). `architect` + `data-architect` ruled on the writer go-live seam; **DESIGN APPROVED**, framing corrected here:
  - **Stale-premise correction:** `runner.ts` is already the shipped no-disk Slice-5b runner — "don't inherit" governs module *shape*, not cutover ordering (§5).
  - **§5a added** — the writer seam: the runner's scattered **item branch is amputated** (not filtered) into the new `vocabulary/` module; concrete `publish-approved-content.ts` call shape (runner-first, vocab-second); one-commit go-live, no coexistence window.
  - **§7 CRITICAL fix** — the cutover must also strike the **runner's distractor writers** (`upsertRecognitionDistractors`/`upsertCuedRecallDistractors`, `runner.ts:690-691` + `fetchSeededDistractorCapIds:564`/`deleteItemDistractors:575`) in the same commit as the table drops, else a surviving writer → PGRST205 → all publishing blocked.
  - **Triangle confirmed** (DA): `fetchDistractors` resolves pointers→strings into the *unchanged* `Map<string,string[]>` builder interface (the `BuilderInputFor` change is a comment fix, not a type rename); `listeningMcq` has **no** curated path today (whole function, not `:37`) — wire it. RESTRICT/`--regenerate` no deadlock; item-cloze-via-`item_contexts` sound; no committed-migration defect.
  - **§1 framing reconciled** (Lesson Stage untouched; runtime reader + runner item branch cut over; non-vocab kinds stay on the runner — not absent). **no-disk gate** extended to the new module (§5); **module spec** to be created in the landing PR (§5).
  - **Acceptance = fresh lesson 11** end-to-end publish (§7). Next phase: BUILD.
