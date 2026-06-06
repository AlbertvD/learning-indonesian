---
status: draft
parent: docs/plans/2026-06-06-capability-stage-v2.md   # umbrella (approved)
reviewed_by: []   # identity layer (§2) band-aid-checked by staff-engineer + data-architect 2026-06-06; FULL spec not yet reviewed — do not set approved until it is
implementation: null
---

# Capability Stage v2 — Slice 1: `vocabulary_src`

The first vertical slice of the v2 redesign (umbrella §9). Delivers the vocabulary capabilities end-to-end **and** the shared substrate the later slices reuse. Built **redesign-in-place**: a clean DB-native capability-stage generator on top of the untouched runtime + Lesson Stage.

> **Operating context (CLAUDE.md):** build-stage, single learner, disposable data. No live-system safety machinery — truncate and rebuild freely. Decisions below are sized for *simplicity first* (CLAUDE.md "Minimum Mechanism"); this spec deliberately strips the umbrella's live-system apparatus.

## 1. Scope

**In:** vocabulary capabilities (7 types), their MCQ/typed/dictation/cloze exercises + distractors, the cumulative-pool selection model, the local embedding service, the per-content-type module skeleton, and the shared identity/key/level layer.
**Out (later slices):** dialogue_line, grammar_pattern, word_form_pair generation. Those capabilities simply don't exist in the catalog until their slices land (fine — nobody's using the app).

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

Audio types are gated on the item having an audio clip. (The cosmetic rename is optional; if deferred, keep the live names + the mis-level fix.)

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
- **Reader** `byKind/item.ts`: **rewritten before the old tables drop** — resolve item_ids → each item's meaning (learner language) or form, per capability type; replaces the current text-array maps (`renderContracts.ts:329`). Dropping the old tables first = silent pool fallback / PGRST205 (the Slice-4a lesson). **Add the curated leg to `buildListeningMCQ`** — today `recognise_meaning_from_audio` has no curated path and would ignore its rows (DA M1).
- **Validator + health check** (semantic, can't be DB constraints — DA I1): count = `min(3, |eligible Pool(N)|)`; no distractor item == the answer item; every distractor item ∈ Pool(N). (FK now guarantees existence, so the HC drops its "item exists" arm.)

### 4b. Vocab cloze — RESOLVED

The substrate already exists: **1,171 authored `cloze` carriers in `item_contexts`** (sentence-with-blank in `source_text` + `translation_text`; answer = the linked item's form), and the runtime reader already reads them (`renderContracts.ts:511`). Item cloze is "0 live capabilities" only because the `produce_form_from_context` capability was never emitted (deferred #148).

- **Slice 1 cloze work = emit the `produce_form_from_context` capability** for each item that has a cloze carrier. **No new cloze table** — read `item_contexts` directly (copying = drift, same as distractors; the umbrella's unified `cloze` table is dropped from scope, so the `dialogue_line_id` CHECK / DA NEW-M2 is a Slice-2 concern).
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
- `src/lib/semanticGroups.ts` is a **dead re-export shim — zero importers** → delete.
- ⇒ `src/lib/distractors/` (cascade/options/semanticGroups/structuralTypes/index + tests) is **fully deleted** once the 3 vocab MCQ builders move to the pointer reader. Entirely a vocab/Slice-1 concern (affixed distractors were never wired to it).

**Safe because the coverage gate replaces the fallback:** the cascade was the "no curated rows → pool fallback." Remove it only in the same commit that wires the curated reader + the pool-relative coverage gate (DA C1). `insufficient_distractor_pool` (§4 / Q3) is the defined surface for the impossible no-coverage case — no blank-card risk without the cascade.

## 5. Module structure — RESOLVED

Per-content-type vertical sub-pipelines in one deep module; the slicing falls out of the structure (umbrella §9). Built **clean / DB-native from the first line** (no staging reads — the no-disk property is true by construction, not retrofitted); do **not** inherit the mid-cutover #98 runner.

```
scripts/lib/pipeline/capability-stage/
├── orchestrate.ts        # thin: publish(contentType) | publishLesson(lessonId)
├── shared/               # db · canonicalKey+level map · idempotent upsert · embeddings · gate framework
└── vocabulary/           # read → project → select-distractors → select-cloze → write → verify
```

`publish('vocabulary')` walks lessons ascending so Pool(N) is complete; `publishLesson(N)` selects against the live ≤N pool.

## 6. Supabase Requirements

### Schema changes (`scripts/migration.sql`)
- **Fold** the 4 live capability tables (`learning_capabilities`, `capability_aliases`, `capability_review_events`, `learner_capability_state`) + `capability_resolution_failure_events` from the standalone `2026-04-25-capability-core.sql` / `2026-05-02-*` into `migration.sql` — **including their RLS policies** (the dynamic `DROP POLICY` loop at `migration.sql:319` else leaves them RLS-on-zero-policies). Exclude the 3 already-retired tables.
- `UNIQUE INDEX IF NOT EXISTS` on `learning_capabilities(source_ref, capability_type)`.
- `CREATE EXTENSION IF NOT EXISTS vector` (installed 0.8.0, in `extensions` schema — idempotent); new `item_embeddings(learning_item_id PK, embedding extensions.vector(384))`.
- **New `distractors` table** (§4a): pointers, FK-enforced, `item_id` `on delete restrict`, RLS + comments. **Drop** `recognition_mcq_distractors` + `cued_recall_distractors` **only in the commit that rewrites `byKind/item.ts` to the pointer reader** (else PGRST205 / silent pool fallback — Slice-4a lesson). Also drop `cloze_mcq_item_distractors` (0 rows).
- **No new cloze table** (§4b) — vocab cloze reads `item_contexts` as-is.
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
- Acceptance gate **must include a real publish** (health-checks + idempotent-check never exercise the publish path — the Slice-4a lesson), down to a `capability_review_events` row landing after answering an item exercise.
- Tests: identity boot-assertion fires on a missing contract/level; pool-relative coverage on L1 function words; orthographic form-distractors; meaning-distractor synonym exclusion; idempotent re-publish = zero delta.

## 8. Open questions
**All resolved.** distractors triangle → §4a · vocab cloze → §4b · audio → §4c · `lib/distractors` retirement → §4d · gate set → §6a. _Tracked end-of-v2 (not Slice 1):_ split the cloze rows out of `item_contexts` into a precise typed table (ADR 0009) once the pool + audio jobs move off it.

Spec is **design-complete** → ready for `architect` + `data-architect` review (data-model spec ⇒ both required, CLAUDE.md) before `status: approved`.

## 9. Review history
- 2026-06-06: identity layer (§2) designed via grill, then band-aid-checked — `staff-engineer` **SOUND**, `data-architect` **no blocker** (C1/M1/M2/M3 guardrails folded into §2). Full spec unreviewed → `status: draft`. Before `approved`: resolve §8, then dispatch `architect` + `data-architect` (data-model spec ⇒ both required, CLAUDE.md).
- 2026-06-06: distractors triangle (§4a) audited by `data-architect` — shape SOUND; 5 requirements folded in (same-commit pointer reader, `listening_mcq` curated leg, `on delete restrict`, RLS + comments, idempotent writer contract). Vocab cloze (§4b) resolved via grill (read `item_contexts`, emit the capability, no new table).
- 2026-06-06: audio (§4c) resolved via grill — Slice 1 generates no audio; reads `audio_clips`, gates the two audio capabilities on clip existence; the umbrella §5 capability-stage audio service dropped for vocab.
- 2026-06-06: `lib/distractors` retirement (§4d) — callers enumerated, all vocab MCQs Slice 1 rewrites; `semanticGroups.ts` shim is dead (0 importers); clean delete. Gate set (§6a) consolidated. **Spec design-complete; ready for dual review.**
