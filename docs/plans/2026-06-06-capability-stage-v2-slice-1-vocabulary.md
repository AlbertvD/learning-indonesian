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

## 5. Module structure — RESOLVED

Per-content-type vertical sub-pipelines in one deep module; the slicing falls out of the structure (umbrella §9). Built **clean / DB-native from the first line** (no staging reads — the no-disk property is true by construction, not retrofitted); do **not** inherit the mid-cutover #98 runner.

```
scripts/lib/pipeline/capability-stage/
├── orchestrate.ts        # thin: publish(contentType) | publishLesson(lessonId)
├── shared/               # db · canonicalKey+level map · idempotent upsert · embeddings · audio · gate framework
└── vocabulary/           # read → project → select-distractors → select-cloze → write → verify
```

`publish('vocabulary')` walks lessons ascending so Pool(N) is complete; `publishLesson(N)` selects against the live ≤N pool.

## 6. Supabase Requirements

### Schema changes (`scripts/migration.sql`)
- **Fold** the 4 live capability tables (`learning_capabilities`, `capability_aliases`, `capability_review_events`, `learner_capability_state`) + `capability_resolution_failure_events` from the standalone `2026-04-25-capability-core.sql` / `2026-05-02-*` into `migration.sql` — **including their RLS policies** (the dynamic `DROP POLICY` loop at `migration.sql:319` else leaves them RLS-on-zero-policies). Exclude the 3 already-retired tables.
- `UNIQUE INDEX IF NOT EXISTS` on `learning_capabilities(source_ref, capability_type)`.
- `CREATE EXTENSION IF NOT EXISTS vector` (installed 0.8.0, in `extensions` schema — idempotent); new `item_embeddings(learning_item_id PK, embedding extensions.vector(384))`.
- **New `distractors` table** — shape OPEN (§8).
- **New / vocab `cloze` rows** — shape OPEN (§8).
- **Drop** `recognition_mcq_distractors`, `cued_recall_distractors`, `cloze_mcq_item_distractors` (0 rows) — grep `scripts/lib/pipeline/` + `src/` for readers first (the Slice-4a PGRST205 lesson).
- **NOT added:** generated `capability_type` column, `derive_capability_type` function, `context_to_id` direction, axis-uniqueness constraint, `cap:v2:` version + guards.
- **Ops (not in migration.sql):** truncate `learner_capability_state` / `capability_review_events` / `learner_lesson_activation`, then re-publish vocabulary ascending. One-shot, build-stage; no maintenance window.

### homelab-configs changes
- PostgREST / Kong / GoTrue / Storage: **N/A** (indonesian exposed; pgvector present; `indonesian-tts` bucket exists for audio gap-fill).

### Health check additions
- `check-supabase-deep.ts`: `item_embeddings` reachable; `UNIQUE(source_ref, capability_type)` holds (0 duplicates); pool-relative distractor coverage; `capability_id` FK integrity. Level-match HC number TBD with the gate set.

## 7. Rollout / testing
- One branch, build clean each commit; intermediate states may break the deployed app (nobody's there) but tests stay green.
- Acceptance gate **must include a real publish** (health-checks + idempotent-check never exercise the publish path — the Slice-4a lesson), down to a `capability_review_events` row landing after answering an item exercise.
- Tests: identity boot-assertion fires on a missing contract/level; pool-relative coverage on L1 function words; orthographic form-distractors; meaning-distractor synonym exclusion; idempotent re-publish = zero delta.

## 8. Open questions — grill next (NOT yet resolved; do not invent)
1. **`distractors` writer/reader/validator triangle** (DA NEW-M1): table shape (store distractor *items* vs strings; how EN-language options render given we rank on NL), the `byKind/item.ts` reader, the validator, + the `renderContracts.ts` change — same commit.
2. **Vocab item cloze** (DA NEW-M2): the `cloze` table shape, which carrier sentences are eligible, blank rules, and how `produce_form_from_context`'s direction is recorded (it must not collide — but with type-as-source the *type* already distinguishes it, so this is a labelling choice, not an identity one).
3. **Audio service** interface (reuse-then-gap-fill, idempotency, bucket path convention).
4. **Final gate set** + HC numbers (level-match, pool-relative coverage, FK integrity, the boot assertion, the uniqueness index).
5. **Retire `src/lib/distractors/`** (the runtime cascade) — enumerate every caller before deleting.

## 9. Review history
- 2026-06-06: identity layer (§2) designed via grill, then band-aid-checked — `staff-engineer` **SOUND**, `data-architect` **no blocker** (C1/M1/M2/M3 guardrails folded into §2). Full spec unreviewed → `status: draft`. Before `approved`: resolve §8, then dispatch `architect` + `data-architect` (data-model spec ⇒ both required, CLAUDE.md).
