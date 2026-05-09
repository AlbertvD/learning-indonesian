# Lesson-Stage Module Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build `scripts/lib/pipeline/lesson-stage/` as a deep module per `docs/plans/2026-05-08-pipeline-cleanup-for-lessons-fold.md` v3.0. The module is the single canonical entry point for Stage A of the content pipeline: take staging input, run 7 validation gates, classify page blocks, write canonical DB rows, synthesise per-text audio. After this PR, `bun scripts/publish-approved-content.ts <N>` is a 30-line wrapper around `runLessonStage(input)`.

**Architecture:** Single PR with 9 commits. Module skeleton lands first (commit 1) so every subsequent commit drops files into the right places. Validators land before the orchestrator; orchestrator wires them together at commit 8. CLI thins to a wrapper at commit 8. Migrations and verification land at commit 9.

**Tech Stack:** TypeScript + Vitest + PostgreSQL (Supabase) + Bun. Module folder + file conventions per `docs/target-architecture.md` Module conventions section. Tests colocated under `__tests__/` mirroring source structure.

**Spec under execution:** `docs/plans/2026-05-08-pipeline-cleanup-for-lessons-fold.md` (v3.0, 913 lines, APPROVED).

---

## Pre-flight checks (run before opening any commit)

10 minutes; surface gotchas early.

**Check P1: confirm the legacy CHECK constraint location.**
```bash
grep -n 'block_kind' scripts/migrations/2026-04-25-content-units-lesson-blocks.sql
```
Expected: line 29 has `check (block_kind in ('hero','section','exposure','practice_bridge','recap'))`.

**Check P2: confirm `publish-approved-content.ts:232` writes the dead `source_progress_event` field.**
```bash
grep -n 'source_progress_event' scripts/publish-approved-content.ts
```
Expected: 1 match. Note for executor: this column was dropped in retirement #6 and may cause a real publish run to fail with "column does not exist". If a real publish happens during this PR, drop the field as part of commit 7's adapter extraction. Otherwise document as known follow-up.

**Check P3: confirm 13 `resolveSessionAudioUrl` direct callers exist.**
```bash
grep -rln 'resolveSessionAudioUrl' src/components --include='*.tsx' | wc -l
```
Expected: 13. If different, update commit 2's call-site list.

**Check P4: confirm no `audioUrl` is currently written by the pipeline.**
```bash
grep -n 'audioUrl\|audio_url' scripts/publish-approved-content.ts scripts/lib/content-pipeline-output.ts
```
Expected: zero matches. Item 3a (GT3) is preventive only. If matches exist, log them in the PR description.

**Check P5: confirm `generate-exercise-audio.ts` is the right template for `audio.ts`.**
```bash
sed -n '330,385p' scripts/generate-exercise-audio.ts
```
Expected: dedup via `get_audio_clips` RPC, then for each missing entry: synthesize → upload to `indonesian-tts` bucket → insert into `audio_clips`. This is the pattern commit 6 mirrors.

**Check P5b: confirm `set-lesson-voices.ts:113–207` has an extractable per-lesson body.**
```bash
sed -n '113,207p' scripts/set-lesson-voices.ts
```
Expected: a `for` loop over lessons with assignable per-lesson logic inside. Commit 6 peels the loop body out as `setLessonVoicesForLesson(lessonId)`.

---

## Branch + worktree setup

```bash
cd /Users/albert/home/learning-indonesian
git checkout main
git pull
git checkout -b feature/lesson-stage-module
```

Single feature branch with 9 commits.

---

## Commit 1 — Module skeleton

**Spec section:** §2, §3.

**Files (all new):**
- `scripts/lib/pipeline/lesson-stage/index.ts`
- `scripts/lib/pipeline/lesson-stage/model.ts`
- `scripts/lib/pipeline/lesson-stage/__tests__/runner.test.ts` (placeholder)

### Task 1.1: Create the module directory structure

**Step 1:** Create directories.
```bash
mkdir -p scripts/lib/pipeline/lesson-stage/validators
mkdir -p scripts/lib/pipeline/lesson-stage/__tests__/validators
```

### Task 1.2: Write `model.ts`

**Step 1:** Create `scripts/lib/pipeline/lesson-stage/model.ts` with the types from spec §3 verbatim:

```typescript
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
  lessonNumber: number
  dryRun?: boolean
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

### Task 1.3: Write `index.ts` with placeholder runner

**Step 1:** Create `index.ts`:
```typescript
export { runLessonStage } from './runner'
export type {
  LessonStageInput,
  LessonStageOutput,
  ValidationFinding,
  SectionContentType,
} from './model'
export { SECTION_CONTENT_TYPES } from './model'
```

**Step 2:** Create `runner.ts` placeholder:
```typescript
import type { LessonStageInput, LessonStageOutput } from './model'

export async function runLessonStage(input: LessonStageInput): Promise<LessonStageOutput> {
  throw new Error('runLessonStage not implemented yet — see commit 8')
}
```

### Task 1.4: Write a placeholder test

**Step 1:** Create `__tests__/runner.test.ts`:
```typescript
import { describe, it, expect } from 'vitest'
import { runLessonStage } from '../index'

describe('runLessonStage', () => {
  it('is exported from the barrel', () => {
    expect(typeof runLessonStage).toBe('function')
  })

  it.skip('orchestrates validators + classifier + adapter + audio (commit 8)', () => {
    // Real test lands at commit 8.
  })
})
```

### Task 1.5: Verify and commit

```bash
bun run lint
bun run test --run scripts/lib/pipeline/lesson-stage/__tests__/runner.test.ts
bun run build
```

```bash
git add scripts/lib/pipeline/lesson-stage/
git commit -m "feat(pipeline): scaffold lesson-stage deep module (commit 1/9)

Creates scripts/lib/pipeline/lesson-stage/ with index.ts barrel + model.ts
type definitions per docs/target-architecture.md Module conventions. Placeholder
runner.ts throws until commit 8; placeholder test asserts barrel exports.

Establishes the deep-module shape every subsequent commit drops files into.

Spec: docs/plans/2026-05-08-pipeline-cleanup-for-lessons-fold.md §2-§3"
```

---

## Commit 2 — Voice-paired audio API (Item 4)

**Spec section:** §8.

**Files:**
- Modify: `src/services/audioService.ts` (full rewrite, ~30 → ~70 LOC)
- Modify: `src/__tests__/audioService.test.ts` (extend with 6 cases)
- Modify: `src/pages/Session.tsx:124`
- Modify: `src/components/audio/PlayButton.tsx`
- Modify: 13 files under `src/components/exercises/`

This commit lands first because it's independent of the lesson-stage module — pure runtime change.

### Task 2.1: Failing tests first

Add the 6 cases from spec v2.2.1 §11.1 Item 4 to `src/__tests__/audioService.test.ts`:
- voice-paired requests use `get_audio_clips`
- null-voice requests use `get_audio_clip_per_text`
- mixed batch
- missing pair returns undefined
- null voice resolves only via voice-agnostic key
- text normalisation applies before keying

Run; expect FAIL.

### Task 2.2: Rewrite `audioService.ts`

Implement per spec §8 contract. Map keyed by `(normalizedText, voiceId ?? '__default__')`. Two RPC paths: `get_audio_clips` (voice-paired) and `get_audio_clip_per_text` (null-voice).

Run audio tests; expect PASS.

### Task 2.3: Update Session.tsx + PlayButton

`Session.tsx:124`:
```typescript
// before
const audioMap = await fetchSessionAudioMap(audioTexts)
// after
const audioMap = await fetchSessionAudioMap(
  audioTexts.map((text) => ({ text, voiceId: null })),
)
```

`PlayButton.tsx`: add `voiceId?: string | null` prop (default null), pass through to `resolveSessionAudioUrl`.

### Task 2.4: Update 13 exercise call sites

Mechanical edit. List from spec §8:
```bash
grep -rn 'resolveSessionAudioUrl(' src/components --include='*.tsx'
```

For each match, change `resolveSessionAudioUrl(map, text)` → `resolveSessionAudioUrl(map, text, null)`.

### Task 2.5: Verify and commit

```bash
bun run lint && bun run test --run && bun run build
```

```bash
git add src/services/audioService.ts src/__tests__/audioService.test.ts \
        src/pages/Session.tsx src/components/audio/PlayButton.tsx \
        src/components/exercises/
git commit -m "feat(audio): voice-paired API on audioService (commit 2/9)

fetchSessionAudioMap and resolveSessionAudioUrl accept (text, voiceId) pairs.
Voice-paired requests use get_audio_clips RPC; voiceId === null falls back to
get_audio_clip_per_text. All 13 existing exercise callers pass voiceId: null.
No DB migration; the two RPCs already exist.

Spec: docs/plans/2026-05-08-pipeline-cleanup-for-lessons-fold.md §8"
```

---

## Commit 3 — GT1, GT5 + classifier

**Spec section:** §4 GT1, §4 GT5, §6.

**Files:**
- Create: `scripts/lib/pipeline/lesson-stage/validators/grammarTopics.ts`
- Create: `scripts/lib/pipeline/lesson-stage/validators/sectionType.ts`
- Create: `scripts/lib/pipeline/lesson-stage/classifier.ts`
- Create: corresponding `__tests__/` files
- Modify: `src/services/lessonService.ts:38` (widen TS union)
- Modify: `src/lib/lessons/lessonExperience.ts:41–49` (widen pass-through)
- Create: `src/lib/lessons/__tests__/lessonExperience.test.ts`
- Modify: `scripts/migration.sql` (add `lesson_sections_content_type_check` CHECK)
- Modify: `scripts/check-supabase-deep.ts` (add HC1 + HC5)

### Task 3.1: Failing test for `validateGrammarTopics`

Create `scripts/lib/pipeline/lesson-stage/__tests__/validators/grammarTopics.test.ts` with 7 cases per spec v2.2 §11.1 Item 1: (a) valid passes, (b) missing rejects, (c) empty rejects, (d) whitespace rejects, (e) prefixed rejects, (f) reference_table follows same rules, (g) non-grammar exempt.

Run; expect FAIL.

### Task 3.2: Implement `validateGrammarTopics`

Per spec §4 GT1 rules. Function signature:
```typescript
export function validateGrammarTopics(
  sections: Array<{ id?: string; content: Record<string, unknown> }>,
): ValidationFinding[]
```

Run; expect PASS.

### Task 3.3: Failing test for `validateSectionType`

Create `__tests__/validators/sectionType.test.ts`. For each of the 10 canonical types, write:
- (i) valid passes
- (ii) sub-shape violation rejects (e.g. `vocabulary` without `items[]`, `dialogue` without `lines[]`)
- (iii) unknown `content.type` rejects with clear message

Cover all 10 types. ~30 test cases.

### Task 3.4: Implement `validateSectionType`

Use `SECTION_CONTENT_TYPES` from `model.ts`. For each type, dispatch to a per-type sub-shape check. Per spec §4 GT5 table.

### Task 3.5: Failing test for `classifyBlockKind`

Create `__tests__/classifier.test.ts`. Cover every legacy × payload × slug combination per spec §6:
- hero → lesson_hero
- recap → lesson_recap
- practice_bridge → practice_bridge (pass-through)
- (section|exposure) + payload.type=dialogue → dialogue_card
- (section|exposure) + payload.type∈{vocabulary,numbers,expressions} → vocab_strip
- (section|exposure) + slug startsWith 'pattern-' → pattern_callout
- otherwise → reading_section

### Task 3.6: Implement `classifyBlockKind`

Per spec §6 verbatim. Pure function.

### Task 3.7: Widen TS types

`src/services/lessonService.ts:38`:
```typescript
// before
block_kind: 'hero' | 'section' | 'exposure' | 'practice_bridge' | 'recap'
// after
block_kind: 'lesson_hero' | 'reading_section' | 'vocab_strip' | 'dialogue_card' | 'pattern_callout' | 'practice_bridge' | 'lesson_recap'
```

`src/lib/lessons/lessonExperience.ts:41–49`: widen `blockKindFromPipeline` to pass through all 7 new values BEFORE the legacy branches:
```typescript
function blockKindFromPipeline(block: LessonPageBlock): LessonExperienceBlockKind {
  // Pass-through for the 7 canonical pipeline values (post-Item 2 backfill).
  // This whole function retires in the lessons fold PR.
  const direct = block.block_kind
  if (direct === 'lesson_hero' || direct === 'reading_section' || direct === 'vocab_strip'
      || direct === 'dialogue_card' || direct === 'pattern_callout'
      || direct === 'practice_bridge' || direct === 'lesson_recap') {
    return direct
  }
  // Legacy fallback (will only fire briefly, before backfill applies)
  if (direct === 'hero') return 'lesson_hero'
  if (direct === 'recap') return 'lesson_recap'
  if (block.payload_json?.type === 'dialogue') return 'dialogue_card'
  if (block.payload_json?.type === 'vocabulary' || block.payload_json?.type === 'numbers' || block.payload_json?.type === 'expressions') return 'vocab_strip'
  if (block.content_unit_slugs?.some((slug) => slug.startsWith('pattern-'))) return 'pattern_callout'
  return 'reading_section'
}
```

### Task 3.8: Add tests for the widened classifier

Create `src/lib/lessons/__tests__/lessonExperience.test.ts`. Cover the 7 pass-through cases + the legacy fallback cases.

### Task 3.9: Add CHECK constraint and HCs to migration.sql + check-supabase-deep.ts

**migration.sql** (find a stable insertion point near line 1656):
```sql
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'lesson_sections_content_type_check'
  ) then
    alter table indonesian.lesson_sections
      add constraint lesson_sections_content_type_check
      check (
        content->>'type' is null
        or content->>'type' in (
          'text','grammar','reference_table','vocabulary','expressions',
          'numbers','dialogue','pronunciation','culture','exercises'
        )
      );
  end if;
end $$;
```

**check-supabase-deep.ts** — add HC1 + HC5 per spec §11.4. Match the existing `pass()`/`fail()` pattern.

### Task 3.10: Verify and commit

```bash
bun run lint && bun run test --run && bun run build
make migrate-idempotent-check SUPABASE_SERVICE_KEY=<key>
make check-supabase-deep SUPABASE_SERVICE_KEY=<key>
```

```bash
git add scripts/lib/pipeline/lesson-stage/validators/grammarTopics.ts \
        scripts/lib/pipeline/lesson-stage/validators/sectionType.ts \
        scripts/lib/pipeline/lesson-stage/classifier.ts \
        scripts/lib/pipeline/lesson-stage/__tests__/ \
        src/services/lessonService.ts \
        src/lib/lessons/lessonExperience.ts \
        src/lib/lessons/__tests__/lessonExperience.test.ts \
        scripts/migration.sql \
        scripts/check-supabase-deep.ts
git commit -m "feat(lesson-stage): GT1 + GT5 validators + classifier (commit 3/9)

Three pure-logic pieces of the lesson-stage module:
- validators/grammarTopics.ts (GT1) — every grammar/reference_table section
  must have non-empty content.grammar_topics
- validators/sectionType.ts (GT5) — content.type in the canonical 10-value set
  + per-type sub-shape conformance
- classifier.ts — blockKindFromPipeline moved here from lessonExperience.ts:41-49

Widens LessonPageBlock.block_kind TS union to the 7-value set; widens runtime
blockKindFromPipeline to pass-through all 7 new values (interim until lessons fold).

Adds lesson_sections_content_type_check CHECK constraint to migration.sql.
Adds HC1 + HC5 to check-supabase-deep.ts.

Spec: docs/plans/2026-05-08-pipeline-cleanup-for-lessons-fold.md §4 GT1, §4 GT5, §6"
```

---

## Commit 4 — GT2, GT3, GT4 + GT1 backfill + block_kind widen-then-narrow

**Spec section:** §4 GT2, GT3, GT4; §7 (widen-then-narrow SQL).

**Files:**
- Create: `scripts/lib/pipeline/lesson-stage/validators/blockKind.ts`
- Create: `scripts/lib/pipeline/lesson-stage/validators/payloadAudio.ts`
- Create: `scripts/lib/pipeline/lesson-stage/validators/lessonVoices.ts`
- Create: corresponding `__tests__/` files
- Modify: `scripts/migration.sql` (GT1 backfill DO $$ block + GT2 widen-then-narrow BEGIN/COMMIT block)
- Modify: `scripts/check-supabase-deep.ts` (HC2)

### Task 4.1–4.3: Failing tests + implementations

For each validator:
1. Failing test exercising the rule
2. Implementation per spec §4 GT2/GT3/GT4
3. Tests pass

GT2: every page-block has block_kind in 7-value set after classifier runs.
GT3: no payload contains audioUrl/audio_url.
GT4: lessons with dialogue sections have primary_voice and dialogue_voices set.

### Task 4.4: GT1 backfill in migration.sql

Paste the precedence-respecting `DO $$` block from spec §4 GT1 verbatim.

### Task 4.5: GT2 widen-then-narrow in migration.sql

Paste the `BEGIN; ... COMMIT;` block from spec §7 verbatim.

### Task 4.6: HC2 in check-supabase-deep.ts

```typescript
// HC2: every lesson_page_blocks.block_kind in the 7-value set
const sql = `select count(*)::int as gap
             from indonesian.lesson_page_blocks
             where block_kind not in (
               'lesson_hero','reading_section','vocab_strip','dialogue_card',
               'pattern_callout','practice_bridge','lesson_recap'
             )`
// run, pass/fail
```

### Task 4.7: Verify and commit

```bash
bun run lint && bun run test --run && bun run build
make migrate-idempotent-check SUPABASE_SERVICE_KEY=<key>
make check-supabase-deep SUPABASE_SERVICE_KEY=<key>
```

```bash
git commit -m "feat(lesson-stage): GT2 + GT3 + GT4 validators + backfills (commit 4/9)

Three more validators in the lesson-stage module:
- validators/blockKind.ts (GT2) — every page-block in canonical 7-value set
- validators/payloadAudio.ts (GT3) — no inline audioUrl/audio_url in payload
- validators/lessonVoices.ts (GT4) — voices configured if dialogues exist

migration.sql gets the GT1 grammar_topics backfill (idempotent DO \$\$) plus
the GT2 widen-then-narrow CHECK constraint sequence (BEGIN/COMMIT-wrapped).
check-supabase-deep.ts gets HC2.

Spec: docs/plans/2026-05-08-pipeline-cleanup-for-lessons-fold.md §4 GT2-GT4, §7"
```

---

## Commit 5 — GT6, GT7 validators

**Spec section:** §4 GT6, GT7.

**Files:**
- Create: `scripts/lib/pipeline/lesson-stage/validators/perItem.ts`
- Create: `scripts/lib/pipeline/lesson-stage/validators/grammarPattern.ts`
- Create: corresponding `__tests__/` files

### Task 5.1: GT6 — per-item field validator

Per spec §4 GT6 table. For each item type (vocabulary, expressions, numbers, dialogue lines), verify required fields present.

Failing tests first (one per required field per item type), then implementation.

### Task 5.2: GT7 — grammar pattern validator

Per spec §4 GT7. Verify pattern_slug, pattern_name, complexity_level present + slugs unique within lesson.

### Task 5.3: Verify and commit

```bash
bun run lint && bun run test --run && bun run build
```

```bash
git commit -m "feat(lesson-stage): GT6 + GT7 validators (commit 5/9)

- validators/perItem.ts (GT6) — embedded items have indonesian, normalized_text,
  pos, level, translation pair, speaker (per item type)
- validators/grammarPattern.ts (GT7) — pattern_slug, pattern_name,
  complexity_level present; slugs unique within lesson

Spec: docs/plans/2026-05-08-pipeline-cleanup-for-lessons-fold.md §4 GT6-GT7"
```

---

## Commit 6 — Audio orchestrator (per-text TTS for lesson-page texts)

**Spec section:** §5.

**Important rewrite from v3.0:** `generate-section-audio.ts` and `seed-lesson-audio.ts` are NOT folded into the orchestrator — they handle different concerns (lesson-narration MP3 generation; manual long-form audio upload). Only `set-lesson-voices.ts`'s single-lesson core is extracted. The new per-text synthesis logic is **authored**, modelled on the proven pattern at `scripts/generate-exercise-audio.ts:330–385`.

**Files:**
- Create: `scripts/lib/pipeline/lesson-stage/audio.ts`
- Create: `scripts/lib/pipeline/lesson-stage/__tests__/audio.test.ts`
- Modify: `scripts/set-lesson-voices.ts` (peel single-lesson body out of all-lessons loop; export `setLessonVoicesForLesson(lessonId)`; CLI keeps the loop)
- Modify: `scripts/check-supabase-deep.ts` (add HC4)

**NOT touched in this commit:**
- `scripts/generate-section-audio.ts` — stays as-is (lesson-narration MP3, separate concern)
- `scripts/seed-lesson-audio.ts` — stays as-is (manual long-form upload)
- `scripts/generate-exercise-audio.ts` — stays as-is (Stage B exercise audio); its `synthesizeSpeech` + `buildStoragePath` patterns are the authoring template for `audio.ts`

### Task 6.1: Failing test for `ensureLessonAudio`

Mock TTS client + Supabase. Test cases:
- empty texts → no synthesis, no DB call
- all texts already exist (dedup via `get_audio_clips` RPC) → 0 synthesised, N reused
- new texts within budget → synthesised, inserted into `audio_clips`
- new texts exceeds budget → throws error
- voice config applied via `setLessonVoicesForLesson` before synthesis (verify call order)

### Task 6.2: Peel `setLessonVoicesForLesson(lessonId)` out of `set-lesson-voices.ts`

**Step 1:** Read `scripts/set-lesson-voices.ts:113–207` (the `main()` function with all-lessons loop).

**Step 2:** Identify the body of the per-lesson iteration (typically `for (const lesson of lessons) { ... }`). Extract it as:
```typescript
export async function setLessonVoicesForLesson(
  lessonId: string,
  supabase: SupabaseClient,
): Promise<void> {
  // body of the per-lesson loop iteration, parameterised on lessonId
}
```

**Step 3:** Update `main()` to call `setLessonVoicesForLesson` for each lesson. CLI behaviour unchanged.

**Step 4:** Test: a unit test against `setLessonVoicesForLesson` with a mocked client; the all-lessons CLI behaviour is covered by existing manual smoke.

### Task 6.3: Author `synthesiseLessonPageTexts` in `audio.ts`

Modelled on `scripts/generate-exercise-audio.ts:330–385`. Step-by-step:

```typescript
// scripts/lib/pipeline/lesson-stage/audio.ts
import { setLessonVoicesForLesson } from '../../../set-lesson-voices'

export async function ensureLessonAudio(input: {
  lessonId: string
  lessonNumber: number
  texts: Array<{ text: string; voiceId: string }>
  audioBudget: number
  supabase: SupabaseClient  // injected for testability
}): Promise<{ synthesised: number; reused: number }> {
  await setLessonVoicesForLesson(input.lessonId, input.supabase)
  return await synthesiseLessonPageTexts(input)
}

async function synthesiseLessonPageTexts(input: {
  lessonId: string
  texts: Array<{ text: string; voiceId: string }>
  audioBudget: number
  supabase: SupabaseClient
}): Promise<{ synthesised: number; reused: number }> {
  // 1. Build (normalizedText, voiceId) keys for dedup
  // 2. Call get_audio_clips RPC; collect existing keys
  // 3. Filter to missing entries
  // 4. Budget check: throw if missing.length > audioBudget
  // 5. For each missing entry:
  //    - synthesizeSpeech(entry.text, entry.voiceId) — same helper as generate-exercise-audio.ts
  //    - upload to indonesian-tts bucket
  //    - insert into audio_clips with { text_content, normalized_text, voice_id, storage_path, generated_for_lesson_id }
  //    - rate-limit 100ms between calls
  // 6. Return { synthesised: count, reused: existing.size }
}
```

The `synthesizeSpeech` and `buildStoragePath` helpers can be:
- (a) imported from `generate-exercise-audio.ts` if they're already exported, OR
- (b) extracted as shared helpers in `scripts/lib/tts-client.ts` (which already exists per the lib structure inventory) — preferred long-term.

Pick whichever is less invasive in this PR. Option (a) for now keeps the diff small.

### Task 6.4: Add HC4 to check-supabase-deep.ts

The audio coverage parity query, fully fleshed out per block_kind. Joins `lesson_page_blocks` → enumerates the texts each block surfaces → joins `audio_clips` at the appropriate `(normalized_text, voice_id)` → counts gaps. Per spec §11.4 HC4.

### Task 6.5: Verify and commit

```bash
bun run lint && bun run test --run && bun run build
make check-supabase-deep SUPABASE_SERVICE_KEY=<key>
```

```bash
git commit -m "feat(lesson-stage): audio orchestrator + HC4 (commit 6/9)

audio.ts adds ensureLessonAudio + synthesiseLessonPageTexts, modelled on the
proven pattern at generate-exercise-audio.ts:330-385. Per-text TTS for lesson-page
texts: dedup against existing audio_clips, budget cap, synthesise via Cloud TTS,
upload to indonesian-tts bucket, insert into audio_clips.

set-lesson-voices.ts: peeled setLessonVoicesForLesson(lessonId) out of the
all-lessons CLI loop so the orchestrator can call it per-lesson.

generate-section-audio.ts and seed-lesson-audio.ts NOT folded — they handle
different concerns (lesson-narration MP3, manual long-form upload).

check-supabase-deep.ts gets HC4 (audio coverage parity).

Spec: docs/plans/2026-05-08-pipeline-cleanup-for-lessons-fold.md §5"
```

---

## Commit 7 — Adapter

**Spec section:** §7.

**Files:**
- Create: `scripts/lib/pipeline/lesson-stage/adapter.ts`
- Create: `scripts/lib/pipeline/lesson-stage/__tests__/adapter.test.ts`

### Task 7.1: Failing test for adapter functions

Mock Supabase client. Test each adapter function:
- `upsertLesson` — correct conflict target, correct columns
- `upsertLessonSections` — correct count returned
- `upsertLessonPageBlocks` — uses 7-value block_kind from input
- `fetchExistingAudioClips` — correct keys returned

### Task 7.2: Implement `adapter.ts`

Extract DB-write logic from `scripts/publish-approved-content.ts:200–237` (the inline upsert code) into typed adapter functions. Drop the dead `source_progress_event` field from the upsert payload (per pre-flight P2).

### Task 7.3: Verify and commit

```bash
bun run lint && bun run test --run && bun run build
```

```bash
git commit -m "feat(lesson-stage): adapter — single Supabase write surface (commit 7/9)

adapter.ts extracts the DB upsert logic from publish-approved-content.ts:200-237
into typed functions: upsertLesson, upsertLessonSections, upsertLessonPageBlocks,
fetchExistingAudioClips. Drops the dead source_progress_event field write
(retirement #6 cleanup).

Spec: docs/plans/2026-05-08-pipeline-cleanup-for-lessons-fold.md §7"
```

---

## Commit 8 — Runner + thin CLI

**Spec section:** §7.5.

**Files:**
- Modify: `scripts/lib/pipeline/lesson-stage/runner.ts` (replace placeholder with real impl)
- Modify: `scripts/lib/pipeline/lesson-stage/__tests__/runner.test.ts` (replace placeholder with real test)
- Rewrite: `scripts/publish-approved-content.ts` (~200 LOC → ~30 LOC wrapper)

### Task 8.1: Real test for `runLessonStage`

Mock validators + classifier + adapter + audio. Cross-cutting acceptance test from spec §11.3:
- synthetic lesson fixture covering every section type + every item type + dialogue voices
- assert all 5 canonical invariants hold post-call
- second call is idempotent (zero new findings, zero new audio)

Plus:
- validation error short-circuits — no DB calls when GT findings include errors
- dryRun skips DB + audio calls
- `status` field reflects validation outcome

### Task 8.2: Implement `runLessonStage`

Per spec §7.5 sketch. Sequence:
1. Load staging
2. Run all 7 validators; collect findings
3. If any errors → return validation_failed
4. If dryRun → return ok (skip writes)
5. Run classifier on page blocks
6. Adapter writes (lesson, sections, page-blocks)
7. Audio synthesis
8. Return typed report

### Task 8.3: Thin the CLI

Rewrite `scripts/publish-approved-content.ts` to ~30 lines:
```typescript
#!/usr/bin/env bun
import { runLessonStage } from './lib/pipeline/lesson-stage'

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

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

### Task 8.4: Verify and commit

```bash
bun run lint && bun run test --run && bun run build
```

```bash
git commit -m "feat(lesson-stage): runner + thin CLI wrapper (commit 8/9)

runner.ts implements runLessonStage — sequences GT1-GT7 → classifier → adapter
→ audio. Single entry point for Stage A of the content pipeline. Returns typed
LessonStageOutput report. Validation errors short-circuit before any DB writes.

scripts/publish-approved-content.ts shrinks from ~200 LOC of inline orchestration
to ~30 LOC wrapper that imports runLessonStage. CLI command name preserved per
CLAUDE.md.

Closes the deep-module shape per docs/target-architecture.md Plate IV.

Spec: docs/plans/2026-05-08-pipeline-cleanup-for-lessons-fold.md §7.5"
```

---

## Commit 9 — Apply migrations + verify on homelab

**Spec section:** §10.

### Task 9.1: Apply migration to homelab

```bash
make migrate SUPABASE_SERVICE_KEY=<key>
```

Applies all SQL added in commits 3, 4, 6: GT1 backfill, block_kind widen-then-narrow, content.type CHECK constraint. Chained `check-supabase-deep` runs at the end.

### Task 9.2: Idempotency check

```bash
make migrate-idempotent-check SUPABASE_SERVICE_KEY=<key>
```

Applies migration.sql twice. Confirms second run is a no-op.

### Task 9.3: Full pre-deploy gauntlet

```bash
make pre-deploy SUPABASE_SERVICE_KEY=<key>
```

Lint + test + build + check-supabase + check-supabase-deep with HC1, HC2, HC4, HC5.

### Task 9.4: End-to-end smoke

```bash
bun scripts/publish-approved-content.ts 4 --dry-run
```
Expect zero validation findings, no DB writes.

```bash
bun scripts/publish-approved-content.ts 4
```
Expect DB rows materialise + audio_clips for any new texts.

```bash
bun scripts/publish-approved-content.ts 4
```
Run again. Expect `audioClipsSynthesised: 0` (full reuse).

### Task 9.5: Manual smoke per spec §10

Walk through the 6 steps in spec §10 in dev browser. Especially: each of the 7 `block_kind` values renders correctly post-backfill.

**Special focus on legacy lessons 1–3** (per spec §13 risk #5): verify backfilled `grammar_topics` matches expected output.

### Task 9.6: Final commit + PR

```bash
git commit --allow-empty -m "chore(lesson-stage): apply migrations + verify on homelab (commit 9/9)

Empty commit marking the verification milestone. PR description includes:
- make pre-deploy output (green)
- make migrate-idempotent-check output (green)
- runLessonStage dry-run + real-run output for one lesson
- HC4 audio coverage parity output
- Manual smoke sign-off

Spec: docs/plans/2026-05-08-pipeline-cleanup-for-lessons-fold.md §10"

git push -u origin feature/lesson-stage-module
gh pr create --title "Phase 1: lesson-stage deep module" --body "$(cat <<'EOF'
## Summary

Builds scripts/lib/pipeline/lesson-stage/ as a deep module per the v3.0 spec.
Single entry point runLessonStage(input) replaces ~200 LOC of inline
orchestration in publish-approved-content.ts. Seven publish-time validation
gates (GT1-GT7) enforce the canonical Stage A contract. Audio synthesis folded
into the publish path. CLI shrinks to a 30-line wrapper.

This is Phase 1 of the pipeline rewrite. Phase 2 (capability-stage sibling
module) and Phase 3 (lessons 1-3 migration + legacy retirement) follow.

## Test plan

- [x] bun run lint clean
- [x] bun run test --run clean (with all new tests in §11)
- [x] bun run build clean
- [x] make migrate-idempotent-check clean
- [x] make check-supabase-deep clean (HC1, HC2, HC4, HC5)
- [x] runLessonStage dry-run + real-run for one lesson (output in PR description)
- [x] Manual smoke per spec §10 (6 steps + legacy-lessons focus)

## Companion

Lessons fold PR follows; owns Item 3b (strip legacy payload.audioUrl + reader
rewire to <PlayButton>).
EOF
)"
```

---

## Risks during execution

1. **`source_progress_event` dead field write at `publish-approved-content.ts:232`** — drop in commit 7 when the upsert moves to `adapter.ts`. Don't try to fix in commit 1 or 8.

2. **Audio script core extraction** (commit 6) — the three scripts may have intertwined concerns (CLI parsing + business logic). If extraction is gnarly, extract minimal cores first and refactor for clarity in a follow-up. Don't bundle scope creep here.

3. **`make migrate` requires SSH access to homelab.** Commits 3, 4, 6 add SQL. The full migration only runs in commit 9 against the homelab. If executor lacks credentials, commit 9 defers to a session with access.

4. **Audio budget cap defaults to 500.** If a single lesson legitimately exceeds this (large lesson with many dialogues + grammar examples), pass a higher `audioBudget.maxNewSyntheses`. The budget exists to prevent runaway TTS cost on a buggy fixture, not to throttle real usage.

5. **`linguist-structurer` agent prompt updates** are not in this PR's scope — they happen in Phase 2 when Stage B reads from DB. The current cleanup PR only enforces the contract on whatever the structurer outputs today (which it already mostly satisfies; GT5/GT6/GT7 surface any gaps as findings, routing back to the structurer for re-run).

---

## Done definition

This PR is done when:
- All 9 commits land on `main` via the PR.
- The PR description includes:
  - Green `make pre-deploy` output.
  - `make migrate-idempotent-check` green output.
  - `runLessonStage` dry-run + real-run output for at least one lesson.
  - HC4 audio coverage parity output.
  - Manual smoke sign-off (6 steps + legacy-lessons focus).
- `.forge-state.json` advances to capture phase.
- The lessons fold PR (`docs/plans/2026-05-08-fold-lib-lessons.md`) is unblocked and can open immediately.
- The `scripts/lib/pipeline/lesson-stage/` module conforms to the deep-module rules per `docs/target-architecture.md`: narrow public API via `index.ts`, `model.ts` for types, `adapter.ts` for I/O, sub-folders for ≥6 logic files, tests colocated mirroring source.
