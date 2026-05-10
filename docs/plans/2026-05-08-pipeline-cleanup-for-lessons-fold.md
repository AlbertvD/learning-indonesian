---
status: shipped
implementation: PR #41
merged_at: 2026-05-09
implementation_paths:
  - scripts/lib/pipeline/lesson-stage/
  - scripts/lib/pipeline/capability-stage-legacy.ts  # the extracted-but-not-yet-folded Stage B
supersedes: []
---

# Lesson-stage module spec — Phase 1 of the pipeline rewrite

**SHIPPED in PR #41 (commit `4669aaf`, merged 2026-05-09).** Architect-review-loop was completed in 5 rounds; the 9-commit implementation plan at `docs/plans/2026-05-08-pipeline-cleanup-implementation.md` was executed and merged. The prose below describes the *design as planned* — for current state, read the code at `scripts/lib/pipeline/lesson-stage/`.

Architect-review-loop history (pre-ship):
- Round 1 (v1) — NEEDS_REVISION (6 substantive + 7 warnings + 12 recommended edits)
- Round 2 (v2) — APPROVE_WITH_NITS (1 nit applied → v2.1)
- Round 3 (v2.2) — APPROVE_WITH_NITS (2 nits applied → v2.2.1)
- Round 4 (v3.0) — APPROVED with deep-module reframe + module folder factoring + scope expansion to full Phase 1
- Round 5 (v3.2) — APPROVED; shipped

Companion: `docs/plans/2026-05-08-fold-lib-lessons.md` (lessons fold — depends on this).

---

## 1. Goal + scope

The content pipeline writes data the runtime reads. Today the pipeline produces several non-canonical shapes that the runtime compensates for via fallback chains, ad-hoc field reading, runtime classifiers, and unenforced assumptions about which fields exist.

**This spec retires those compensations by canonicalising the pipeline output, formalising the contract, and reshaping the implementation as a deep module per the architectural rules locked in `docs/target-architecture.md`.**

The pipeline runs in two stages (§1.4 below). This spec covers **Stage A only** — turning raw lesson content (already in the DB or in staging files) into the canonical typed reader content. Stage B (capability authoring + projection) is target work for a later spec.

### What this spec covers

A single deep module at `scripts/lib/pipeline/lesson-stage/`, with:

1. **A typed public surface** — one entry function `runLessonStage(input): Promise<LessonStageOutput>` exposed via `index.ts` barrel.
2. **An authoritative section type + sub-shape contract** — the set of valid `lesson_sections.content.type` values + per-type required sub-fields, defined in `model.ts` and enforced by validators.
3. **Seven publish-time validation gates (GT1–GT7)** — each enforcing one slice of the canonical contract before any DB write commits.
4. **One classifier** — the 7-value `lesson_page_blocks.block_kind` derivation, moved from runtime (`src/lib/lessons/lessonExperience.ts:41–49`) into the pipeline.
5. **One adapter** — the only Supabase write surface for the lesson-stage outputs.
6. **One audio orchestrator** — adds per-text TTS for lesson-page texts (modelled on the proven pattern at `scripts/generate-exercise-audio.ts:330–385`); peels the single-lesson voice-config core out of `scripts/set-lesson-voices.ts`. `generate-section-audio.ts` (lesson-narration MP3) and `seed-lesson-audio.ts` (manual long-form upload) are out of scope per §5 audit.
7. **One stage gate** — `runner.ts` runs all validators in sequence, calls the adapter, calls audio synthesis, returns a typed report. This is the gate the CLI entry hits before any DB write commits.

Plus one out-of-module change for the runtime audio API:

8. **`src/services/audioService.ts` voice-paired API** — extends `fetchSessionAudioMap` + `resolveSessionAudioUrl` to accept `(text, voiceId)` pairs so dialogue audio resolves to the correct speaker. Sits in `src/services/`, not in the lesson-stage module, because the audio service is consumed by runtime (not pipeline). Bundled here because the lesson-stage module's audio synthesis writes the rows the runtime API resolves against — the contracts are paired.

### What this spec does NOT cover (deferred to follow-up specs)

- The lessons module fold (`docs/plans/2026-05-08-fold-lib-lessons.md`).
- Stage B (capability authoring) — to be authored as a sibling `scripts/lib/pipeline/capability-stage/` module in Phase 2.
- Lessons 1–3 backfill (`lesson_page_blocks` derivation), re-running Stage B for them, retiring the legacy per-item tables (`learning_items`, `item_meanings`, etc.) — Phase 3.
- Item 3b — stripping legacy `payload_json.audioUrl/audio_url` rows from existing `lesson_page_blocks`, plus the reader rewire to `<PlayButton>`. This ships in the lessons fold PR, atomic with the reader change. This spec only stops the pipeline from writing new inline audio (Item 3a).

---

## 1.4 Pipeline structure — two stages

**STATUS: LOCKED — 2026-05-08.**

The content pipeline runs in two sequential stages. **Stage A produces the reading content; Stage B produces the learning content.** Stage B depends on Stage A's published DB output.

### Stage A — Lesson content authoring (THIS SPEC)

**Purpose:** turn raw lesson content into typed reader content. After Stage A completes for a lesson, **the lesson page can already be rendered** — the user can read sections, see grammar sub-topics, and play long-form lesson audio. Sessions cannot yet practice the lesson's content (Stage B hasn't run).

**Inputs:** see §3 (`LessonStageInput` type).

**Internal stages (developer-side, runs locally):**
```
photograph (HEIC/JPG)
  → convert (HEIC → JPG)
  → OCR (Tesseract → text)
  → catalog (LLM section classification)
  → stage (generate staging files)
  → linguist-structurer (sections + grammar sub-topics + pattern brief)
  → linguist-reviewer (lesson-content portion)
  → runLessonStage (validators + classifier + adapter + audio synthesis)
       └─ writes: lesson rows + sections + page-blocks + audio_clips → DB
```

**Outputs:** see §3 (`LessonStageOutput` type) and the canonical DB contract in §1.5.

> **Today vs target.** The §1.4 Stage A invariants describe the **target shape**. Today, audio synthesis runs as separate manual steps (`scripts/generate-section-audio.ts`, `scripts/seed-lesson-audio.ts`, `scripts/set-lesson-voices.ts`); `scripts/publish-approved-content.ts` does NOT call TTS or insert into `audio_clips`. **This PR adds per-text TTS synthesis inside `runLessonStage` (Item 8 / §5)** — modelled on the existing pattern at `generate-exercise-audio.ts:330–385`, with `set-lesson-voices.ts`'s single-lesson core peeled out so the orchestrator can call it per-lesson. The other two scripts stay as-is (different concerns; see §5 ground-truth audit). After this PR, every publish call writes `audio_clips` atomically for any new lesson-page texts.

### Stage B — Capability creation (FUTURE SPEC)

Reads from Stage A's published DB rows, projects schedulable capabilities, authors variants + artifacts, synthesises capability-only audio. Will live in `scripts/lib/pipeline/capability-stage/`. Out of scope for this spec.

---

## 1.5 Pipeline output per lesson — the canonical DB contract

For every published lesson, the lesson-stage module produces:

### A. Lesson row (`lessons` table)
- `id`, `order_index`, `title`, `level`, `description`
- `audio_path`, `duration_seconds`, `primary_voice` — for the long-form lesson narration
- `dialogue_voices` — speaker → voice id mapping for any dialogues in the lesson

### B. Section rows (`lesson_sections`)
- Every section the lesson contains — text/reading, grammar, dialogue, vocabulary, expressions, numbers, pronunciation, culture, reference table, exercises
- Each section has a non-empty Dutch `title`
- Each section has `content.type` discriminator from the canonical 10-value set (§4 GT5)
- Each section's `content` payload conforms to the per-type sub-shape (§4 GT5)
- Grammar / reference_table sections have non-empty `content.grammar_topics: string[]` (§4 GT1)
- Vocabulary / expressions / numbers / dialogue items embedded in `content` have all per-item required fields (§4 GT6)

### C. Page-block rows (`lesson_page_blocks`)
- One per renderable block (hero, section, vocab strip, dialogue card, pattern callout, practice bridge, recap)
- `block_kind` is the canonical 7-value reader kind (§4 GT2 + §6 classifier)
- `payload_json` contains the section content; **does not contain `audioUrl` / `audio_url` keys** (§4 GT3)

### D. Per-text TTS audio (`audio_clips` rows + `indonesian-tts` bucket)
- One row per `(normalized_text, voice_id)` pair for every Indonesian text the lesson uses
- Voice id matches `lessons.primary_voice` for non-dialogue content; matches `dialogue_voices[speaker]` for dialogue lines
- Voices configured: `primary_voice` set; `dialogue_voices` set if dialogue sections exist (§4 GT4)
- Synthesised by `audio.ts` orchestrator over Cloud TTS Chirp3-HD (§5)

### E. Long-form lesson audio (`indonesian-lessons` bucket)
- Optional (0 or 1 file). Created externally in NotebookLM, uploaded manually
- The lesson row's `audio_path` references it
- Not synthesised by the lesson-stage module

### F. NOT produced by Stage A (other concerns)
- `learning_capabilities`, `capability_artifacts`, `exercise_variants` — Stage B (capability-stage module, future)
- `learner_lesson_activation` — user-written, not pipeline
- `learning_items`, `item_meanings`, `item_contexts`, `item_answer_variants` — legacy parallel infrastructure for lessons 1–3, retired in Phase 3

---

## 1.6 Supabase Requirements

### Schema changes (land in `scripts/migration.sql`)
- `lesson_page_blocks.block_kind` CHECK constraint: **widen → backfill → narrow** (§7 adapter SQL).
- `lesson_sections.content`: **CHECK constraint** that `content->>'type' IS NULL OR content->>'type' IN (10-value canonical set)` (§4 GT5 / HC5).
- No new tables. No new columns. No new RPCs. No new RLS policies. No new grants.
- Existing RLS unchanged.

### Backfills (idempotent UPDATEs in `scripts/migration.sql`)
- `lesson_sections.content.grammar_topics` enrichment (GT1 backfill).
- `lesson_page_blocks.block_kind` value migration (GT2 widen-then-narrow).
- Item 3b (strip legacy `payload.audioUrl`) ships in the lessons fold PR, not here.

All backfills use `WHERE … IS NULL` or `WHERE … IN (legacy values)` guards so a second `make migrate` run is a no-op.

### homelab-configs changes
- [x] N/A — PostgREST: `indonesian` schema already exposed.
- [x] N/A — Kong: no new origins or CORS headers.
- [x] N/A — GoTrue: no auth config changes.
- [x] N/A — Storage: no new buckets.

### Health check additions (in `scripts/check-supabase-deep.ts`)
1. **HC1** — Zero grammar/reference_table sections with NULL or empty `content.grammar_topics`.
2. **HC2** — Zero `lesson_page_blocks` rows with `block_kind` outside the 7-value set.
3. **HC4** — Zero lesson-page texts without an `audio_clips` row at the appropriate voice.
4. **HC5** — Zero `lesson_sections` rows with `content->>'type'` outside the 10-value canonical set.
5. **HC3** (DEFERRED to lessons fold PR — 3b) — Zero `lesson_page_blocks.payload_json` containing `audioUrl`/`audio_url`.

---

## 2. Module shape — `scripts/lib/pipeline/lesson-stage/`

Per `docs/target-architecture.md` Plate IV (line 1127–1156), the local pipeline factors into `scripts/lib/pipeline/<stage>/` with thin entry-point scripts in `scripts/`.

### Folder layout

```
scripts/
  publish-approved-content.ts             # thin entry — kept by CLAUDE.md command name;
                                            calls runLessonStage from the module
  lib/
    pipeline/
      lesson-stage/
        index.ts                          # barrel — exports runLessonStage + types
        model.ts                          # LessonStageInput, LessonStageOutput,
                                            SectionContentType, ValidationFinding,
                                            PerTypeContentSchema
        runner.ts                         # runLessonStage orchestrator (the stage gate)
        validators/
          index.ts                        # barrel — re-exports the 7 validators
          grammarTopics.ts                # GT1
          blockKind.ts                    # GT2
          payloadAudio.ts                 # GT3
          lessonVoices.ts                 # GT4
          sectionType.ts                  # GT5
          perItem.ts                      # GT6
          grammarPattern.ts               # GT7
        classifier.ts                     # blockKindFromPipeline (moved from
                                            src/lib/lessons/lessonExperience.ts:41–49)
        adapter.ts                        # the one Supabase write surface
        audio.ts                          # Cloud TTS orchestration — per-text synthesis
                                            (modelled on generate-exercise-audio.ts:330–385);
                                            peels per-lesson voice-config out of set-lesson-voices.ts
        __tests__/
          runner.test.ts
          classifier.test.ts
          adapter.test.ts
          audio.test.ts
          validators/
            grammarTopics.test.ts
            blockKind.test.ts
            payloadAudio.test.ts
            lessonVoices.test.ts
            sectionType.test.ts
            perItem.test.ts
            grammarPattern.test.ts
```

### Compliance with deep-module rules (target arch §1, §2, §Module conventions)

| Rule | Status |
|---|---|
| Narrow public API via `index.ts` | ✅ — exports `runLessonStage`, `LessonStageInput`, `LessonStageOutput`, `ValidationFinding`, `SectionContentType` (5 symbols, well below the 10-symbol width threshold) |
| Hides significant logic | ✅ — 7 validators + classifier + adapter + audio orchestration |
| `model.ts` for domain types (when >2 public types) | ✅ — 5 public types |
| Single `adapter.ts` for I/O | ✅ — only DB write surface in the module |
| Logic files named by job, no folder-name prefix | ✅ — `runner.ts`, `classifier.ts`, `audio.ts`, `adapter.ts` (all drop the `lesson-stage` prefix per naming rule) |
| Sub-folders justified at ≥6 logic files | ✅ — `validators/` has 7 files |
| Tests colocated under `__tests__/` mirroring source | ✅ — every source file has a paired test file |
| No back-edges (Rule §7) | ✅ — module writes to DB; runtime reads. No cycle. |
| One job per module (Rule §3) | ✅ — "take inputs, produce canonical Stage A DB rows + audio". Single coherent job. |

### Folder naming

Per the target arch's existing precedents: `session-builder/`, `exercise-content/` use kebab-case for multi-word folders. `lesson-stage` follows this pattern. Files inside drop the prefix and use camelCase per the naming rules.

---

## 3. Public API — `runLessonStage`

The entire module's public surface, exported from `index.ts`:

```typescript
// scripts/lib/pipeline/lesson-stage/model.ts
export const SECTION_CONTENT_TYPES = [
  'text',
  'grammar',
  'reference_table',
  'vocabulary',
  'expressions',
  'numbers',
  'dialogue',
  'pronunciation',
  'culture',
  'exercises',
] as const

export type SectionContentType = typeof SECTION_CONTENT_TYPES[number]

export interface LessonStageInput {
  /** Lesson order_index (the user-visible "lesson N") */
  lessonNumber: number
  /** When true: validate + classify, but skip DB writes and audio synthesis. */
  dryRun?: boolean
  /** Cap on Cloud TTS calls per run; default 500. Beyond this: fail rather than rack up unbounded cost. */
  audioBudget?: { maxNewSyntheses: number }
}

export interface LessonStageOutput {
  status: 'ok' | 'validation_failed' | 'partial'
  lesson: { id: string; orderIndex: number; title: string }
  counts: {
    sections: number
    pageBlocks: number
    audioClipsSynthesised: number
    audioClipsReused: number
  }
  findings: ValidationFinding[]
  durationMs: number
}

export interface ValidationFinding {
  gate: 'GT1' | 'GT2' | 'GT3' | 'GT4' | 'GT5' | 'GT6' | 'GT7'
  severity: 'error' | 'warning'
  message: string
  context?: { sectionId?: string; blockKey?: string; itemSlug?: string }
}
```

```typescript
// scripts/lib/pipeline/lesson-stage/index.ts
export { runLessonStage } from './runner'
export type {
  LessonStageInput,
  LessonStageOutput,
  ValidationFinding,
  SectionContentType,
} from './model'
export { SECTION_CONTENT_TYPES } from './model'
```

Callers (today only `scripts/publish-approved-content.ts`) use only the barrel:

```typescript
// scripts/publish-approved-content.ts (post-refactor, ~30 LOC)
import { runLessonStage } from './lib/pipeline/lesson-stage'

const lessonNumber = Number(process.argv[2])
const dryRun = process.argv.includes('--dry-run')
if (!Number.isFinite(lessonNumber)) {
  console.error('Usage: bun scripts/publish-approved-content.ts <N> [--dry-run]')
  process.exit(1)
}

const result = await runLessonStage({ lessonNumber, dryRun })
console.log(JSON.stringify(result, null, 2))
process.exit(result.status === 'ok' ? 0 : 1)
```

---

## 4. Internal validators — GT1 through GT7

All validators are pure functions: take typed input, return `ValidationFinding[]`. No I/O. Tested in isolation.

The runner (§7) calls them in deterministic order before any DB write. If any returns `severity: 'error'` findings, `runLessonStage` exits with `status: 'validation_failed'` and no DB writes occur.

### GT1 — `validators/grammarTopics.ts`

**Rule:** Every `lesson_sections` row whose `content.type ∈ {'grammar', 'reference_table'}` MUST have non-empty `content.grammar_topics: string[]`. Each entry trimmed; no `"grammar:"` / `"grammatica:"` prefix.

**Why:** Today's runtime extractor at `src/services/lessonService.ts:102–125` walks a 5-step fallback chain (`content.grammarTopics` → `content.grammar_topics` → `content.categories[].title` → `content.title` → `section.title`). The canonicalisation retires the chain.

**Backfill:** an idempotent `DO $$` PL/pgSQL block in `scripts/migration.sql` derives `grammar_topics` for legacy rows using strict precedence matching the runtime extractor exactly.

```sql
do $$
declare
  rec record;
  derived text[];
begin
  for rec in
    select id, title as section_title, content
    from indonesian.lesson_sections
    where content->>'type' in ('grammar','reference_table')
      and (content->'grammar_topics' is null
           or jsonb_array_length(coalesce(content->'grammar_topics', '[]'::jsonb)) = 0)
  loop
    derived := null;

    -- Step 1: explicit topics (camelCase ∪ snake_case, per runtime spread at lessonService.ts:108–110)
    select array_agg(distinct trim(both ' ' from
        regexp_replace(t, '^\s*(grammar|grammatica)\s*:\s*', '', 'i')))
      filter (where t is not null
              and length(trim(both ' ' from regexp_replace(t, '^\s*(grammar|grammatica)\s*:\s*', '', 'i'))) > 0)
      into derived
      from (
        select jsonb_array_elements_text(rec.content->'grammarTopics') as t
        where jsonb_typeof(rec.content->'grammarTopics') = 'array'
        union all
        select jsonb_array_elements_text(rec.content->'grammar_topics') as t
        where jsonb_typeof(rec.content->'grammar_topics') = 'array'
      ) explicit_topics;

    -- Step 2: categories[].title (only if step 1 empty)
    if derived is null or array_length(derived, 1) is null then
      select array_agg(distinct trim(both ' ' from
          regexp_replace(t, '^\s*(grammar|grammatica)\s*:\s*', '', 'i')))
        filter (where t is not null
                and length(trim(both ' ' from regexp_replace(t, '^\s*(grammar|grammatica)\s*:\s*', '', 'i'))) > 0)
        into derived
        from (
          select cat->>'title' as t
          from jsonb_array_elements(coalesce(rec.content->'categories', '[]'::jsonb)) cat
        ) cat_titles;
    end if;

    -- Step 3: content.title (only if step 2 empty)
    if derived is null or array_length(derived, 1) is null then
      if rec.content->>'title' is not null
         and length(trim(both ' ' from regexp_replace(rec.content->>'title', '^\s*(grammar|grammatica)\s*:\s*', '', 'i'))) > 0 then
        derived := array[trim(both ' ' from
          regexp_replace(rec.content->>'title', '^\s*(grammar|grammatica)\s*:\s*', '', 'i'))];
      end if;
    end if;

    -- Step 4: section.title (only if step 3 empty)
    if derived is null or array_length(derived, 1) is null then
      if rec.section_title is not null
         and length(trim(both ' ' from regexp_replace(rec.section_title, '^\s*(grammar|grammatica)\s*:\s*', '', 'i'))) > 0 then
        derived := array[trim(both ' ' from
          regexp_replace(rec.section_title, '^\s*(grammar|grammatica)\s*:\s*', '', 'i'))];
      end if;
    end if;

    if derived is null or array_length(derived, 1) is null then
      raise warning 'Section % has no derivable grammar_topics; leaving as-is for manual fix', rec.id;
      continue;
    end if;

    update indonesian.lesson_sections
       set content = jsonb_set(content, '{grammar_topics}', to_jsonb(derived))
     where id = rec.id;
  end loop;
end $$;
```

### GT2 — `validators/blockKind.ts`

**Rule:** Every `lesson_page_blocks` row written by the pipeline MUST have `block_kind` in the 7-value set: `'lesson_hero' | 'reading_section' | 'vocab_strip' | 'dialogue_card' | 'pattern_callout' | 'practice_bridge' | 'lesson_recap'`.

**Why:** Today's pipeline writes the legacy 5-value enum (`hero | section | exposure | practice_bridge | recap`); the runtime classifier at `src/lib/lessons/lessonExperience.ts:41–49` derives the 7-value reader kind. Per Rule #6 (one source of truth per concept), the derivation belongs upstream. Classifier code moves to `classifier.ts` (§6).

**Knock-on changes:**
- `src/services/lessonService.ts:38` — `LessonPageBlock.block_kind` TypeScript union widens to the 7-value set in this PR.
- `src/lib/lessons/lessonExperience.ts:41–49` — `blockKindFromPipeline` widens to pass-through all 7 new values (interim wart that retires in the lessons fold PR).

### GT3 — `validators/payloadAudio.ts`

**Rule:** No `lesson_page_blocks.payload_json` written by the pipeline contains `audioUrl` or `audio_url` keys.

**Why:** Per-text audio resolves through `audio_clips` only (the canonical source, keyed by `(normalized_text, voice_id)`). Inline payload audio is duplication.

**Scope clarification:** This is **Item 3a** of the original 4-item scope — stop new writes. **Item 3b** (strip legacy rows + rewire the lesson reader to `<PlayButton>`) ships atomically in the lessons fold PR to avoid a transitional window.

### GT4 — `validators/lessonVoices.ts`

**Rule:** If the lesson contains dialogue sections (`content.type = 'dialogue'`), the `lessons` row MUST have `primary_voice` set AND `dialogue_voices` set as a non-empty `{speaker: voice_id}` map covering every speaker in the dialogue.

**Why:** The audio orchestrator (§5) needs voice routing; runtime audio resolution at `audioService.ts` needs the same. A missing voice configuration silently breaks dialogue audio.

### GT5 — `validators/sectionType.ts`

**Rule:** Every `lesson_sections.content.type` value MUST be one of the canonical 10-value `SECTION_CONTENT_TYPES` set. The `content` payload MUST conform to the per-type sub-shape:

**Sub-shape table — aligned with real staging shapes** (verified against `scripts/data/staging/lesson-4/lesson.ts`; lessons 1–3 vary slightly but conform to the same set):

| Type | Required sub-fields (must exist) | Allowed sub-fields (may exist) |
|---|---|---|
| `text` | `paragraphs: string[]` (non-empty) — OR — at least one of `intro`, `sentences[]`, `examples[]`, `spelling[]` (legacy lessons 1–3 use these) | `intro`, `examples[]`, `sentences[]`, `spelling[]`, `paragraphs[]` |
| `grammar` | `grammar_topics: string[]` (GT1, non-empty after backfill) | `intro`, `categories[]` (each `{title, rules[]?, examples[]?}`), `title` (legacy fallback source — tolerated) |
| `reference_table` | `grammar_topics: string[]` (GT1, non-empty after backfill) | `categories[]`, `headers[]`, `rows[]`, `intro` |
| `vocabulary` | `items: Array<{indonesian: string, dutch?: string, english?: string}>` (non-empty; each item has `indonesian` + at least one of `dutch`/`english`) | `intro` |
| `expressions` | `items: Array<{indonesian, dutch?, english?}>` (same shape as vocabulary) | `intro` |
| `numbers` | `items[]` (each with `indonesian` + at least one translation) | `intro` |
| `dialogue` | `lines: Array<{text: string, speaker: string, translation?: string}>` (non-empty; per real staging shape — `text`+`speaker`+`translation`, NOT `indonesian`+`dutch`) | `intro`, `setting` |
| `pronunciation` | `letters: Array<{letter: string, rule: string, examples: string[]}>` (non-empty; per real staging shape at `scripts/data/staging/lesson-1/lesson.ts:469–477`) | `intro` |
| `culture` | — (no `culture` sections exist in staging today; "Cultuur" content currently uses `type='text'`. Defer the `culture` shape definition to Phase 3 when Lesson 2 republishes; GT5 does not enforce a `culture` shape in Phase 1 — it accepts the type as canonical but does not require any sub-fields.) | `paragraphs[]`, `intro` (when introduced) |
| `exercises` | `exercises: Array<{title: string, type: string}>` (each exercise has at least title + type) | `intro` |

**Why:** Today the type set is implicit — scattered across the renderer's switch statements, the LLM cataloguer's prompt, and `scripts/data/lessons.ts`. Without an authoritative list, anyone can write any string and the DB accepts it.

**Enforcement layers:**
- TS const `SECTION_CONTENT_TYPES` exported from `model.ts` (single source of truth).
- Validator GT5 rejects unknown types and per-type sub-shape violations at publish time.
- DB CHECK constraint `lesson_sections_content_type_check` (added in this PR's `scripts/migration.sql`) blocks unknown values at write time:

```sql
alter table indonesian.lesson_sections
  add constraint lesson_sections_content_type_check
  check (
    content->>'type' is null  -- legacy rows tolerated; HC5 surfaces them
    or content->>'type' in (
      'text','grammar','reference_table','vocabulary','expressions',
      'numbers','dialogue','pronunciation','culture','exercises'
    )
  );
```

**Backfill:** none required (existing data already conforms per the §1.4 audit; cosmetic fixes for Lesson 1 "Uitspraak" and Lesson 2 "Cultuur" land naturally when those lessons re-publish in Phase 3).

### GT6 — `validators/perItem.ts`

**Rule:** Every embedded item in a `lesson_sections.content` payload MUST have its display fields. Stage-B-only enrichment fields are **warnings** in Phase 1; they become errors in Phase 2 once `linguist-structurer` prompts emit them.

**Display fields (errors):**

| Field | Required for | Purpose |
|---|---|---|
| `indonesian` (vocabulary/expressions/numbers items) | vocabulary, expressions, numbers | Source text for rendering + capability projection |
| `dutch` OR `english` | vocabulary, expressions, numbers | Translation pair for rendering + capability authoring |
| `text` | dialogue lines | The Indonesian text shown in the dialogue card (per real staging shape) |
| `speaker` | dialogue lines | Voice routing through `lessons.dialogue_voices` |

**Stage-B-only enrichment (warnings in Phase 1):**

| Field | Wanted for | Status today |
|---|---|---|
| `pos` (part-of-speech) | Distractor cascade in `src/lib/distractors/` | NOT in staging files today; `learning-items.ts` doesn't carry it either. Phase 2 work: structurer prompt updates emit it. |
| `level` | Distractor cascade tier filtering | NOT in staging files today. Phase 2. |
| `normalized_text` | Audio_clips lookup + capability `source_ref` | Computed at publish time today (not authored); stays computed. Not a staging requirement. |
| `translation` (dialogue lines) | Capability authoring NL/EN pair | Empty `""` in current staging (real shape) — warning, not error. Phase 2 fills it. |

**Why this split:** Reading actual staging files (`scripts/data/staging/lesson-4/lesson.ts:42–67, 432–441`) and `learning-items.ts:1–30` confirms today's authored data has the display fields but lacks `pos`/`level`/rich `normalized_text`. Making those errors would reject every existing publish. Phase 2 (when `linguist-structurer` prompts update + agents read DB) is the right place to upgrade these to errors.

GT6 still earns its keep by:
- Catching missing display fields (real bugs that break rendering)
- Surfacing warnings for Stage-B-readiness gaps so Phase 2 has a tracked baseline
- Routing operator back to `linguist-structurer` with a clear message when display fields are missing

### GT7 — `validators/grammarPattern.ts`

**Rule:** Every grammar section's pattern metadata MUST have:

- `pattern_slug` (non-empty, matches `^[a-z0-9-]+$`)
- `pattern_name` (non-empty trimmed string)
- `complexity_level` ∈ `{'beginner', 'intermediate', 'advanced'}`
- Pattern slugs are unique within a single lesson

**Why:** Capability projection keys grammar capabilities by slug. Duplicates or missing slugs break the canonical key contract.

---

## 5. Audio orchestrator — `audio.ts`

The orchestrator is **net-new logic** modelled on the existing exercise-side per-text writer at `scripts/generate-exercise-audio.ts:330–385` (verified working pattern: dedup against `audio_clips` via `get_audio_clips` RPC → synthesise via Cloud TTS → upload to `indonesian-tts` bucket → insert into `audio_clips` table). It is NOT extracted from the three legacy audio scripts because they do unrelated things:

### Ground-truth audit of today's audio scripts

Verified by reading each file:

| Script | What it actually does | Folded? |
|---|---|---|
| `scripts/generate-section-audio.ts` | Generates **per-section MP3 + SRT subtitle files** to a local output directory for lesson narration. Does NOT touch `audio_clips`. Uses SSML for prosody. | **NO** — out of scope (it's lesson narration, not per-text TTS). Stays as-is or retires later. |
| `scripts/seed-lesson-audio.ts` | Uploads long-form lesson narration files to the `indonesian-lessons` bucket + updates `lessons.audio_path`. | **NO** — out of scope per §1.5 E ("Created externally in NotebookLM, uploaded manually"). Stays as-is. |
| `scripts/set-lesson-voices.ts` | Iterates **all lessons** in `main()` (line 113+), assigning `primary_voice` and `dialogue_voices` based on rules. | **PARTIAL** — its single-lesson core gets peeled out as `setLessonVoicesForLesson(lessonId)`. The all-lessons CLI loop stays. |
| `scripts/generate-exercise-audio.ts` | The actual per-text writer pattern: dedup → synthesise → upload → insert into `audio_clips`. | **TEMPLATE** — its synthesis loop body (lines 330–385) is the model for the new `synthesiseLessonPageTexts` function. |

### After this spec

```typescript
// scripts/lib/pipeline/lesson-stage/audio.ts (sketch)
import { setLessonVoicesForLesson } from '../../../set-lesson-voices'  // peeled out of main loop

export async function ensureLessonAudio(input: {
  lessonId: string
  lessonNumber: number
  texts: Array<{ text: string; voiceId: string }>
  audioBudget: number
}): Promise<{ synthesised: number; reused: number }> {
  // 1. Apply voice configuration (idempotent — peeled out of set-lesson-voices.ts main loop)
  await setLessonVoicesForLesson(input.lessonId)

  // 2-5. Per-text synthesis: dedup against audio_clips, budget check,
  //      synthesise via Cloud TTS, upload to bucket, insert into audio_clips.
  //      Authored as new logic following the proven pattern at
  //      generate-exercise-audio.ts:330-385.
  return await synthesiseLessonPageTexts(input)
}

async function synthesiseLessonPageTexts(input: {
  lessonId: string
  texts: Array<{ text: string; voiceId: string }>
  audioBudget: number
}): Promise<{ synthesised: number; reused: number }> {
  // Dedup pattern: query get_audio_clips RPC for (text, voiceId) pairs;
  // filter to texts not already present.
  // Then for each missing text: synthesizeSpeech() → upload to indonesian-tts bucket
  // → insert into audio_clips table. Same shape as generate-exercise-audio.ts:330-385.
  // …
}
```

The `synthesizeSpeech` Cloud TTS helper, `buildStoragePath`, and the bucket-upload pattern get extracted from `generate-exercise-audio.ts` into shared module-internal helpers (or imported directly if cleanly exportable).

`generate-exercise-audio.ts` itself stays as the entry point for capability-only exercise audio (Stage B's responsibility, not Stage A's). The shared helpers live in `audio.ts` and `generate-exercise-audio.ts` imports from there in a follow-up cleanup; not blocking this PR.

`generate-section-audio.ts` and `seed-lesson-audio.ts` keep their current CLI behaviour — they handle different concerns (lesson narration MP3 + manual long-form upload). Possible future retirement, not this PR's concern.

---

## 6. Classifier — `classifier.ts`

The 5→7 `block_kind` derivation, moved out of `src/lib/lessons/lessonExperience.ts:41–49` into the pipeline.

```typescript
// scripts/lib/pipeline/lesson-stage/classifier.ts
import type { SectionContentType } from './model'

export type ReaderBlockKind =
  | 'lesson_hero' | 'reading_section' | 'vocab_strip'
  | 'dialogue_card' | 'pattern_callout' | 'practice_bridge' | 'lesson_recap'

export function classifyBlockKind(input: {
  legacyKind: 'hero' | 'section' | 'exposure' | 'practice_bridge' | 'recap'
  payloadType?: SectionContentType
  contentUnitSlugs: string[]
}): ReaderBlockKind {
  if (input.legacyKind === 'hero') return 'lesson_hero'
  if (input.legacyKind === 'practice_bridge') return 'practice_bridge'
  if (input.legacyKind === 'recap') return 'lesson_recap'
  if (input.payloadType === 'dialogue') return 'dialogue_card'
  if (input.payloadType === 'vocabulary'
      || input.payloadType === 'numbers'
      || input.payloadType === 'expressions') return 'vocab_strip'
  if (input.contentUnitSlugs.some(s => s.startsWith('pattern-'))) return 'pattern_callout'
  return 'reading_section'
}
```

Tests in `__tests__/classifier.test.ts` cover every legacy × payload × slug combination.

---

## 7. Adapter — `adapter.ts`

The single Supabase write surface for the lesson-stage module. Hides:

- Schema name (`'indonesian'`)
- Upsert conflict targets per table
- The widen-then-narrow CHECK constraint sequence for `block_kind` (one-time, idempotent — runs as part of `make migrate`, not in `runLessonStage`)
- Row shaping (TS → DB column)

Public functions (internal to the module):

```typescript
// scripts/lib/pipeline/lesson-stage/adapter.ts (sketch)
export async function upsertLesson(...): Promise<{ id: string; orderIndex: number }>
export async function upsertLessonSections(lessonId: string, sections: ValidatedSection[]): Promise<number>
export async function upsertLessonPageBlocks(lessonId: string, blocks: ValidatedPageBlock[]): Promise<number>
export async function fetchExistingAudioClips(texts: Array<{text, voiceId}>): Promise<Map<string, string>>
```

The widen-then-narrow CHECK constraint sequence (one-time DB-level guard, runs in `scripts/migration.sql` not in adapter code), wrapped in `BEGIN; ... COMMIT;` for transactional hygiene:

```sql
begin;

alter table indonesian.lesson_page_blocks
  drop constraint if exists lesson_page_blocks_block_kind_check;

update indonesian.lesson_page_blocks
   set block_kind = case
     when block_kind = 'hero' then 'lesson_hero'
     when block_kind = 'recap' then 'lesson_recap'
     when block_kind = 'practice_bridge' then 'practice_bridge'
     when block_kind in ('section', 'exposure') and (payload_json->>'type') = 'dialogue' then 'dialogue_card'
     when block_kind in ('section', 'exposure') and (payload_json->>'type') in ('vocabulary','numbers','expressions') then 'vocab_strip'
     when block_kind in ('section', 'exposure') and exists (
       select 1 from unnest(content_unit_slugs) slug where slug like 'pattern-%'
     ) then 'pattern_callout'
     else 'reading_section'
   end
 where block_kind in ('hero','section','exposure','practice_bridge','recap');

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'lesson_page_blocks_block_kind_check'
  ) then
    alter table indonesian.lesson_page_blocks
      add constraint lesson_page_blocks_block_kind_check
      check (block_kind in (
        'lesson_hero','reading_section','vocab_strip','dialogue_card',
        'pattern_callout','practice_bridge','lesson_recap'
      ));
  end if;
end $$;

commit;
```

The `lesson_sections.content_type_check` CHECK constraint (GT5 / HC5) lands in the same `migration.sql` block.

---

## 7.5 Runner — `runner.ts`

The stage gate. Sequences validators → classifier → adapter → audio. Returns a typed report.

```typescript
// scripts/lib/pipeline/lesson-stage/runner.ts (sketch)
export async function runLessonStage(input: LessonStageInput): Promise<LessonStageOutput> {
  const start = Date.now()
  const findings: ValidationFinding[] = []

  // 1. Load staging input from disk
  const staging = await loadStagingForLesson(input.lessonNumber)

  // 2. Run all validators in sequence; collect findings
  findings.push(...validateGrammarTopics(staging.sections))      // GT1
  findings.push(...validateBlockKind(staging.pageBlocks))        // GT2
  findings.push(...validatePayloadAudio(staging.pageBlocks))     // GT3
  findings.push(...validateLessonVoices(staging.lesson, staging.sections))  // GT4
  findings.push(...validateSectionType(staging.sections))        // GT5
  findings.push(...validatePerItem(staging.sections))            // GT6
  findings.push(...validateGrammarPattern(staging.sections))     // GT7

  const errors = findings.filter(f => f.severity === 'error')
  if (errors.length > 0) {
    return { status: 'validation_failed', findings, /* ... */ }
  }

  if (input.dryRun) {
    return { status: 'ok', findings, /* counts: 0 */ }
  }

  // 3. Run classifier on page blocks
  const classifiedBlocks = staging.pageBlocks.map(b => ({
    ...b,
    block_kind: classifyBlockKind({
      legacyKind: b.legacy_kind,
      payloadType: b.payload_json?.type,
      contentUnitSlugs: b.content_unit_slugs ?? [],
    }),
  }))

  // 4. Adapter — DB writes
  const lesson = await upsertLesson(staging.lesson)
  const sectionCount = await upsertLessonSections(lesson.id, staging.sections)
  const pageBlockCount = await upsertLessonPageBlocks(lesson.id, classifiedBlocks)

  // 5. Audio synthesis
  const audioCounts = await ensureLessonAudio({
    lessonId: lesson.id,
    lessonNumber: input.lessonNumber,
    texts: collectLessonPageTexts(staging),
    audioBudget: input.audioBudget?.maxNewSyntheses ?? 500,
  })

  return {
    status: 'ok',
    lesson,
    counts: {
      sections: sectionCount,
      pageBlocks: pageBlockCount,
      audioClipsSynthesised: audioCounts.synthesised,
      audioClipsReused: audioCounts.reused,
    },
    findings,
    durationMs: Date.now() - start,
  }
}
```

This is the single point where Stage A's contract is enforced + DB writes happen. Every gate fires before any write commits.

---

## 8. Voice-paired audio API — `src/services/audioService.ts`

Lives outside the lesson-stage module (in `src/services/`, runtime-side). Bundled in this PR because the contract is paired with the audio orchestrator's writes.

### Current state

```ts
fetchSessionAudioMap(texts: string[]): Promise<SessionAudioMap>
resolveSessionAudioUrl(map: SessionAudioMap, text: string): string | undefined
```

Voice-agnostic. Calls `get_audio_clip_per_text(p_texts)` which "prefers the earliest lesson's clip per text". Breaks for dialogues with multiple speakers.

### Target contract

```ts
fetchSessionAudioMap(
  items: Array<{ text: string; voiceId: string | null }>
): Promise<SessionAudioMap>

resolveSessionAudioUrl(
  map: SessionAudioMap,
  text: string,
  voiceId: string | null,
): string | undefined
```

**Resolution semantics:**
- `voiceId !== null` → uses `get_audio_clips(p_texts, p_voice_ids)` (`scripts/migration.sql:973–982`) for exact `(text, voice)` lookup.
- `voiceId === null` → falls back to `get_audio_clip_per_text(p_texts)` (`scripts/migration.sql:986–997`), preserving today's behaviour.

### Code changes

| File | Change |
|---|---|
| `src/services/audioService.ts` | Update signatures; split implementation into voice-paired vs voice-agnostic batches; merge results into a single `SessionAudioMap` keyed by `(normalizedText, voiceId ?? '__default__')`. |
| `src/pages/Session.tsx:124` | Update caller — pass `voiceId: null` for now. (Real voice-aware audibleTexts arrives in `lib/session-builder/` fold.) |
| `src/components/audio/PlayButton.tsx` | Add optional `voiceId?: string \| null` prop, pass through to `resolveSessionAudioUrl`. |
| 13 direct `resolveSessionAudioUrl` callers under `src/components/exercises/` | Pass `voiceId: null` (mechanical edit; CI catches misses). Full call-site list in §8 of v2.2.1 still applies. |
| `src/__tests__/audioService.test.ts` | Extend with the 6 test cases for the new signature. |

No DB migration. The voice-paired RPC already exists.

---

## 9. Migration order — 9 commits

Each commit must build + test green. Order chosen so the module shape exists from commit 1 and grows incrementally.

1. **Commit 1 — Module skeleton.** Create `scripts/lib/pipeline/lesson-stage/` with `index.ts` + `model.ts` only. Just types + constants, no logic. Add empty barrel export. Add `__tests__/runner.test.ts` with one placeholder test that imports `runLessonStage` (will fail until commit 8). ~80 LOC.

2. **Commit 2 — Item 4 (voice-paired audio API).** Pure TypeScript change to `src/services/audioService.ts` + 13 caller updates + tests. No DB touch. No interaction with the new module yet. Ships first because it's independent. ~120 LOC.

3. **Commit 3 — Validators GT1, GT5 (section type / sub-shape) + classifier.** Implement `validators/grammarTopics.ts`, `validators/sectionType.ts`, `classifier.ts`, with tests. Add `SECTION_CONTENT_TYPES` to `model.ts`. Add `lesson_sections_content_type_check` CHECK constraint to `scripts/migration.sql`. Add HC1 + HC5 to `check-supabase-deep.ts`. Update `src/services/lessonService.ts:38` `LessonPageBlock.block_kind` TS union to the 7-value set. Update `src/lib/lessons/lessonExperience.ts:41–49` to widen pass-through. ~180 LOC.

4. **Commit 4 — Validators GT2, GT3, GT4 (block kind, payload audio, voices).** Implement the three validators + tests. Add the widen-then-narrow CHECK constraint sequence for `block_kind` to `scripts/migration.sql` (wrapped in `BEGIN; ... COMMIT;`). Add HC2 to `check-supabase-deep.ts`. Add the §4 GT1 backfill `DO $$` block to `scripts/migration.sql`. ~150 LOC + ~80 LOC SQL.

5. **Commit 5 — Validators GT6, GT7 (per-item, grammar pattern).** Implement the two validators + tests. ~100 LOC.

6. **Commit 6 — Audio orchestrator.** Implement `audio.ts` — author per-text TTS modelled on `generate-exercise-audio.ts:330–385`. Peel `setLessonVoicesForLesson(lessonId)` out of `set-lesson-voices.ts`'s all-lessons CLI loop; CLI behaviour unchanged. `generate-section-audio.ts` and `seed-lesson-audio.ts` are NOT folded — they handle different concerns (lesson-narration MP3 / manual long-form upload). Add HC4 to `check-supabase-deep.ts`. ~150 LOC.

7. **Commit 7 — Adapter.** Implement `adapter.ts`. Extract DB-write logic from current `publish-approved-content.ts:200–237` (the inline upsert code) into typed adapter functions. Tests use mocked Supabase. ~120 LOC.

8. **Commit 8 — Runner + thin CLI.** Implement `runner.ts` (`runLessonStage`). Wires validators → classifier → adapter → audio in sequence. Rewrite `scripts/publish-approved-content.ts` to ~30-line wrapper that imports `runLessonStage`. The placeholder test from commit 1 becomes a real integration test. ~80 LOC orchestration + ~30 LOC CLI shrinkage.

9. **Commit 9 — Apply migrations + verify on homelab.** Run `make migrate` against the homelab. Run `make migrate-idempotent-check`. Run `make pre-deploy`. Run §10 manual smoke test. Document outputs in PR description.

Total: ~1030 LOC of code + ~80 LOC of SQL + ~400 LOC of tests = ~1510 LOC. Of this, ~630 LOC is reorganisation of existing logic (relocations, type widening, CLI thinning); ~400 LOC is genuinely new (validators, audio orchestrator, runner).

---

## 10. Verification gates

Pre-merge:

- `bun run lint` clean
- `bun run test --run` clean (with all new tests in §11)
- `bun run build` clean — catches TS-compile breaks from the type widening
- `make migrate-idempotent-check` clean
- `make check-supabase-deep` clean (with HC1, HC2, HC4, HC5)
- §4 audio coverage parity query reports `gap_count = 0` (or gaps documented + scheduled for fill)
- Architect-review-loop on this spec → APPROVE
- Architect-review-loop on the executed diff → APPROVE

Post-merge manual smoke test (in dev browser at `indonesian.duin.home`):

1. **Lessons list page** (`/lessons`) renders without console errors. Grammar topic chips show on every lesson.
2. **Lesson reader page** (`/lesson/<id>` for at least one each of: a legacy lesson 1–3, a pipeline lesson 4+, a lesson with dialogues):
   - All sections render in display order.
   - Grammar topics show in the lesson reader's grammar block.
   - Per-text audio plays via `<PlayButton>`.
   - Each of the 7 `block_kind` values renders correctly: hero card, reading section, vocab strip, dialogue card, pattern callout, practice bridge, recap.
3. **Session start** (open a session, hit "Start"): audio loads via the new voice-paired API even with all `voiceId: null` callers.
4. **Graceful failure**: pick one Indonesian text, manually point its `voiceId` to a non-existent voice, reload the session, confirm `<PlayButton>` silently disappears (no crash). Revert.
5. **`runLessonStage` end-to-end**: pick a small lesson, run `bun scripts/publish-approved-content.ts <N> --dry-run`. Verify the JSON output reports zero validation findings. Run without `--dry-run`. Verify DB rows materialise + audio_clips rows appear for any new texts.
6. **Idempotency**: re-run `bun scripts/publish-approved-content.ts <N>`. Verify no DB writes change (counts unchanged), no audio re-synthesised (`audioClipsSynthesised: 0, audioClipsReused: N`).

**Special focus on legacy lessons 1–3** (per §9 risk #5): run `runLessonStage` for each, verify backfilled `grammar_topics` matches what the runtime extractor would have produced. Document the diff in PR description.

**No transitional regression window in this PR**: the reader still works because Item 3 is split (3a here, 3b in lessons fold).

---

## 11. Tests + content-seeding hooks

Tests colocate inside the module under `__tests__/`, mirroring the source structure (Rule §2 / Module conventions §Tests).

### 11.1 Per-file tests

Each source file has a paired test file with the same basename:

| Source | Test |
|---|---|
| `runner.ts` | `__tests__/runner.test.ts` — mocks adapter + audio; asserts validator sequencing, error short-circuit, dry-run, idempotency |
| `classifier.ts` | `__tests__/classifier.test.ts` — every legacy × payload × slug combination → expected 7-value output |
| `adapter.ts` | `__tests__/adapter.test.ts` — mocks Supabase; asserts upsert shapes + conflict targets |
| `audio.ts` | `__tests__/audio.test.ts` — mocks TTS client + DB; asserts dedup, budget, voice routing |
| `validators/grammarTopics.ts` | `__tests__/validators/grammarTopics.test.ts` — 7 cases per spec v2.2 §11.1 Item 1 |
| `validators/blockKind.ts` | `__tests__/validators/blockKind.test.ts` |
| `validators/payloadAudio.ts` | `__tests__/validators/payloadAudio.test.ts` |
| `validators/lessonVoices.ts` | `__tests__/validators/lessonVoices.test.ts` |
| `validators/sectionType.ts` | `__tests__/validators/sectionType.test.ts` — every type, every per-type sub-shape rule |
| `validators/perItem.ts` | `__tests__/validators/perItem.test.ts` — every required field, every item type |
| `validators/grammarPattern.ts` | `__tests__/validators/grammarPattern.test.ts` |

### 11.2 Outside the module

- `src/__tests__/audioService.test.ts` — extended with 6 test cases for the voice-paired API (per §8).
- `src/lib/lessons/__tests__/lessonExperience.test.ts` — added; covers the widened `blockKindFromPipeline` pass-through for all 7 new values + legacy fallback.

### 11.3 Content seed integrity (cross-cutting acceptance test)

`scripts/lib/pipeline/lesson-stage/__tests__/runner.test.ts` includes the cross-cutting acceptance test: build a synthetic in-memory lesson fixture covering every section type + every item type + dialogue voices; call `runLessonStage(input)`; assert all five canonical invariants hold + the run is idempotent on a second call (zero new findings, zero new audio synthesised).

### 11.4 Health checks (`scripts/check-supabase-deep.ts`)

- **HC1** — Zero grammar/reference_table sections with NULL or empty `content.grammar_topics` (with `jsonb_typeof` guard).
- **HC2** — Zero `lesson_page_blocks` rows with `block_kind` outside the 7-value set.
- **HC4** — Zero lesson-page texts without an `audio_clips` row at the appropriate voice (the parity query from v2.2.1 §4, fully fleshed out per block_kind).
- **HC5** — Zero `lesson_sections` rows with `content->>'type'` outside the 10-value canonical set.
- **HC3** — DEFERRED to lessons fold PR (3b).

Failure messages route to the right fix:
- HC1 fails → "Re-run `linguist-structurer` for affected lesson(s) and re-publish via `bun scripts/publish-approved-content.ts <N>`."
- HC2 fails → "Pipeline bug in `lesson-stage/classifier.ts` or its caller. File issue with row's id, block_kind, payload_json.type, content_unit_slugs."
- HC4 fails → "Re-run `bun scripts/publish-approved-content.ts <N>` for affected lesson(s) — the audio orchestrator will fill gaps."
- HC5 fails → "Section content.type outside canonical set. Likely a pipeline regression — check GT5 validator's last release."

### 11.5 What's NOT covered (out of scope)

- E2E browser tests for the lesson reader (Playwright). Deferred to lessons fold PR or later.
- Audio-file decode integrity. Existing `make check-supabase` Tier 1 covers basic storage availability.
- Capability-row coverage. Stage B's contract; out of scope for this PR.

> **CI scope reminder.** The post-publish health checks (HC1, HC2, HC4, HC5) run via `make check-supabase-deep` **locally**, as part of `make pre-deploy`. They do **not** run in GitHub Actions — CI cannot reach the homelab DB. The PR author runs `make pre-deploy` locally before merging and pastes the green output into the PR description.

---

## 12. Acknowledgements (doc-claim corrections to `docs/target-architecture.md`)

This PR retires assumptions from the target arch:

1. `lib/audio` API listed as `fetchSessionAudioMap(texts: string[])` (line 777) — extends to voice-paired form. Doc amendment lands when the audio fold (target step 6) ships; this PR only updates `src/services/audioService.ts`.
2. Per-block audio resolution implicitly via `payload.audioUrl` — runtime now resolves through `audio_clips`. Item 3a here; Item 3b in lessons fold PR.
3. `block_kind` enum implicitly the legacy 5-value form — becomes 7-value reader kind directly.
4. Plate IV's "Today: 50+ scripts in scripts/" → after this PR, `scripts/lib/pipeline/lesson-stage/` exists as the locked deep-module shape for Stage A. Sibling `capability-stage/` lands in Phase 2.

---

## 13. Risks + open questions

1. **Transitional broken state for per-block audio — RESOLVED by Item 3 split.** Item 3a (here) stops new writes; Item 3b (lessons fold) strips legacy + rewires reader atomically. No transitional window.

2. **Audio coverage parity for legacy lessons 1–3.** Stage A audio invariants (HC4) require every lesson-page text to have `audio_clips` rows. For lessons 1–3, audio coverage may be partial. The runner's audio orchestrator will fill gaps automatically when the lesson re-publishes — but in Phase 1 we don't re-publish lessons 1–3. The HC4 health check will flag any pre-existing gap. The fix is operational: run `bun scripts/publish-approved-content.ts <N>` for any lesson HC4 flags, and the orchestrator synthesises missing texts.

3. **`make migrate-idempotent-check`.** All backfill blocks must be safely re-runnable.
   - GT1 grammar_topics backfill: idempotent via `WHERE content->'grammar_topics' IS NULL`.
   - GT2 block_kind widen-then-narrow: idempotent via `WHERE block_kind IN (legacy values)` UPDATE + `do $$ if not exists` constraint re-add.
   - GT5 content.type CHECK constraint: idempotent via the same `do $$ if not exists` pattern.
   - No data migration in commits 2, 3, 5, 6, 7, 8.

4. **Atomic deployment.** This PR + the lessons fold's PR ship close in time. The widened `blockKindFromPipeline` (commit 3) handles the gap correctly until the fold's reader rewire lands.

5. **`grammar_topics` derivation correctness for legacy lessons 1–3.** The PL/pgSQL backfill mirrors the runtime extractor's strict precedence chain at `src/services/lessonService.ts:102–125`. Smoke test (deliverable in executor's PR): pick 3 grammar sections from lessons 1–3, query the live homelab DB for current content, run the backfill in a transaction, verify `grammar_topics` matches the runtime's output, rollback. Document the diff in PR.

6. **`block_kind` derivation correctness.** The widen-then-narrow backfill applies the same classifier rules as `classifier.ts`. Smoke test: verify a sample of each legacy × payload combination is correctly classified by the SQL CASE expression.

7. **`set-lesson-voices.ts` interaction.** Today's script sets `lessons.primary_voice` and `dialogue_voices` after the lesson row exists. The audio orchestrator (§5) calls its core function before audio synthesis. GT4 fires if voices are missing — operator runs `set-lesson-voices.ts` (or now: the orchestrator does it automatically) before retrying.

8. **Audio budget cap.** Default 500 syntheses per `runLessonStage` call. A typical lesson has ~50–100 unique texts; 500 is generous. Hard cap prevents runaway TTS cost from a buggy fixture or forgotten dedup. Configurable via `audioBudget.maxNewSyntheses` input.

9. **Validator sequencing is deterministic but not parallel.** Each validator is a pure function; in principle they could run in parallel. We don't, because (a) any error short-circuits (no point continuing other validators), (b) at ~60 sections × 7 validators the total time is sub-second regardless. Determinism > marginal speed.

---

## 14. What this enables

Immediately:
- The lessons fold PR's adapter and pure logic become significantly simpler (no fallback chains, no runtime classifier, voice-paired audio).
- HC1/HC2/HC4/HC5 give automated proof that every lesson conforms to canonical shape.

Near-term (Phase 2 — sibling `capability-stage/` module):
- Stage B's authoring agents read from DB instead of staging files. The DB contract is now rich enough (per-item fields validated by GT6, pattern slugs validated by GT7, section types canonical) for capability projection to read everything it needs.
- The deep-module shape generalises: `scripts/lib/pipeline/capability-stage/` mirrors `lesson-stage/`.

Mid-term (Phase 3 — lessons 1–3 migration + legacy retirement):
- Re-running `runLessonStage` for lessons 1–3 brings them onto the canonical shape.
- After Phase 2, re-running `runCapabilityStage` for them generates modern capability rows.
- Legacy infrastructure (`learning_items`, `item_meanings`, `item_contexts`, `item_answer_variants` tables; `seed-learning-items.ts`, `seed-cloze-contexts.ts`, `repair-item-meanings.ts` scripts; `scripts/data/vocabulary.ts`) retires.

---

## 15. Companion specs

- `docs/plans/2026-05-08-fold-lib-lessons.md` — the lessons module fold (runtime). Depends on this PR landing first.
- Future: Phase 2 spec — `scripts/lib/pipeline/capability-stage/` deep module.
- Future: Phase 3 spec — lessons 1–3 backfill + legacy retirement.
