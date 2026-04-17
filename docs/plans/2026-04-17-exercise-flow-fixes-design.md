# Exercise Flow Fixes — Design

## Overview

Three small, independent correctness fixes in the exercise delivery path. None change pedagogy, user-facing UX, or the content pipeline. Each closes a real or latent bug surfaced in the 2026-04-17 exercise-type review.

Bundled into a single spec because individual specs would be heavier than the changes. Each fix is independently revertible and has its own commit.

## Scope

| # | Fix | File:line | Kind |
|---|---|---|---|
| 1 | Grammar cloze_mcq explanation plumb-through | `src/components/exercises/ExerciseShell.tsx:363` | Dropped authored content |
| 2 | Speaking no-op hardening | `src/lib/sessionQueue.ts` (selectExercises), `src/components/exercises/SpeakingExercise.tsx:33` | Latent FSRS corruption |
| 3 | Cloze `is_anchor_context` fallback cleanup | `src/lib/sessionQueue.ts:719` | Dead/unsafe code path |

**Non-goals:**
- Feedback-screen policy (already matches desired behavior: auto-advance on correct, Doorgaan on wrong)
- Distractor quality (Spec 2 — POS-aware distractors)
- New exercise types (Specs 3 and 4 — listening_mcq, dictation)
- Exercise component render-test backfill (folded into later specs)

---

## Fix 1 — Grammar cloze_mcq explanation plumb-through

### Current behavior

When a grammar exercise is answered wrong, `ExerciseShell` builds a feedback screen with the correct answer and the authored explanation. For `contrast_pair`, `sentence_transformation`, and `constrained_translation`, the explanation is pulled from the payload:

```ts
// src/components/exercises/ExerciseShell.tsx:347–367
switch (exerciseItem.exerciseType) {
  case 'contrast_pair':
    correctAnswer = exerciseItem.contrastPairData?.correctOptionId ?? ''
    explanationText = exerciseItem.contrastPairData?.explanationText ?? ''
    targetMeaning = exerciseItem.contrastPairData?.targetMeaning ?? ''
    break
  case 'sentence_transformation':
    correctAnswer = exerciseItem.sentenceTransformationData?.acceptableAnswers[0] ?? ''
    explanationText = exerciseItem.sentenceTransformationData?.explanationText ?? ''
    break
  case 'constrained_translation':
    correctAnswer = exerciseItem.constrainedTranslationData?.acceptableAnswers[0] ?? ''
    explanationText = exerciseItem.constrainedTranslationData?.explanationText ?? ''
    break
  case 'cloze_mcq':
    correctAnswer = exerciseItem.clozeMcqData?.correctOptionId ?? ''
    explanationText = ''        // ← hardcoded empty
    break
}
```

The linguist pipeline writes an `explanationText` field into `payload_json` for authored grammar `cloze_mcq` variants (see `scripts/data/staging/lesson-N/candidates.ts` and the `grammar-exercise-creator` agent output contract). It reaches `makeGrammarExercise` at `sessionQueue.ts:279`, where it is **not** copied into `clozeMcqData`:

```ts
// src/lib/sessionQueue.ts:279–289
case 'cloze_mcq':
  return {
    ...base,
    skillType: 'recognition',
    clozeMcqData: {
      sentence: payload.sentence || '',
      translation: (payload.translation as string | null) ?? null,
      options: (payload.options as string[]) || [],
      correctOptionId: (answerKey?.correctOptionId as string) || (payload.correctOptionId as string) || '',
      // explanationText missing
    },
  }
```

Same omission in `makePublishedExercise` at `sessionQueue.ts:762–772`.

### Desired behavior

Grammar `cloze_mcq` feedback screens render the authored explanation on wrong answers, same as the other three grammar types.

### Change

1. Add `explanationText?: string` to the `ClozeMcqData` type in `src/types/learning.ts`.
2. `makeGrammarExercise` (`sessionQueue.ts:279`) copies `payload.explanationText` into `clozeMcqData.explanationText`.
3. `makePublishedExercise` (`sessionQueue.ts:762`) does the same.
4. `ExerciseShell.tsx:361–363` reads `exerciseItem.clozeMcqData?.explanationText ?? ''` instead of hardcoding `''`.

Vocabulary `cloze_mcq` (runtime-generated in `makeClozeMcq`) does not set `explanationText` — the field stays optional and empty for that path. No UI change needed; the feedback screen already renders nothing when `explanationText` is empty (`ExerciseShell.tsx:400`).

### Backward compatibility

Existing grammar `cloze_mcq` variants in `exercise_variants.payload_json` already contain `explanationText` (per the pipeline contract). No data migration needed. Old variants without the field render an empty explanation, matching current behavior.

### Edge cases

- Runtime vocabulary `cloze_mcq` has no authored explanation — `explanationText` is undefined, feedback screen renders nothing. Unchanged from today.
- A grammar variant with an empty-string `explanationText` renders nothing (feedback screen guards on truthy).
- A grammar variant missing the field entirely: defaults to `''`, feedback screen renders nothing. Safe.

### Tests

- `src/__tests__/sessionQueue.test.ts`: add a case that `makeGrammarExercise` for `cloze_mcq` (the grammar `buildGrammarQueue` call path) populates `clozeMcqData.explanationText` when the variant payload contains it.
- Same file: add a case that `makePublishedExercise` for `cloze_mcq` (the productive/maintenance `selectExercises` call path at line 460, not grammar) populates `clozeMcqData.explanationText` from `payload_json`.
- New `src/__tests__/exerciseShell.test.tsx` (no existing ExerciseShell-specific test file — `sessionFlow.test.tsx` is a Session-page integration test, not an ExerciseShell unit test). Named broadly enough to host future ExerciseShell tests. First test: render the feedback screen for a grammar `cloze_mcq` with an authored explanation and assert the explanation text is visible. Second test: render with empty explanation and assert the explanation box is absent.

---

## Fix 2 — Speaking no-op hardening

### Current behavior

`SpeakingExercise.tsx:24–35`:

```ts
const handleSubmitAnswer = () => {
  if (isAnswered) return
  setIsAnswered(true)
  // Speaking exercises are not scored automatically yet (requires transcription API).
  // Treat as acknowledged (correct) so FSRS state is not corrupted.
  const FEEDBACK_DELAY_MS = 1500
  setTimeout(() => {
    const latencyMs = Date.now() - startTime - FEEDBACK_DELAY_MS
    onAnswer(true, latencyMs)
  }, FEEDBACK_DELAY_MS)
}
```

The comment's premise ("FSRS state is not corrupted") is wrong. Calling `onAnswer(true, ...)` triggers `processReview` / `processGrammarReview` via `ExerciseShell.handleAnswerFromExercise`: the corresponding skill row has stability grow, `next_due_at` push out, `success_count` increment — all on a click with no evidence of skill.

Today this is dormant because `exercise_type_availability.session_enabled = false` for `speaking` (DB flag set in migration). The failure mode is load-bearing on a single DB flag: if anyone toggles `session_enabled = true` for `speaking` before ASR is wired up, every click silently corrupts FSRS state.

### Desired behavior

- Belt-and-braces: gate `speaking` out of `selectExercises` and `buildGrammarQueue` regardless of the DB flag. Defense in depth.
- `SpeakingExercise.tsx` retains the scaffolding for a future microphone wiring, but is not reachable via normal session flow.
- Preview mode (Content Review page) still renders the component — that path reaches it via direct props, not `selectExercises`. Preview-mode behavior for the record button: **no-op click by design**. The admin reviewer sees the prompt and the "coming soon" alert that the component already renders; there is no gradeable content to preview for `speaking`, so "submitting" has no reviewable output. A dead click is preferable to calling `onAnswer(true, …)` from preview because preview callers don't always wire a meaningful `onAnswer` — a stale wiring that does trigger a fake correct review from the admin UI would be worse than a no-op.
- No schema change; no component deletion.

### Change

1. `src/lib/sessionQueue.ts buildGrammarQueue` (line 154): filter out `speaking` variants before the random pick at line 195:
   ```ts
   const nonSpeakingVariants = variants.filter(v => v.exercise_type !== 'speaking')
   if (nonSpeakingVariants.length === 0) continue  // skip this pattern
   const variant = nonSpeakingVariants[Math.floor(Math.random() * nonSpeakingVariants.length)]
   ```
2. `src/lib/sessionQueue.ts selectExercises` productive/maintenance path (line 455): when picking a published variant, filter out `speaking`. If all published variants for the selected context are `speaking`, fall through to the unpublished-variant rotation instead of calling `makePublishedExercise`.
3. Defensive no-op in the component: even though it should be unreachable, add an early-return in `SpeakingExercise.handleSubmitAnswer` if some future call path were to reach it — short-circuit without calling `onAnswer`. This means the component becomes a true dead-end visually; the button click does nothing. Today it already requires a DB flag to appear in sessions, so this is defense in depth rather than user-visible change.

### Rationale for not deleting the component

The agent pipeline can author `speaking` candidates behind `exercise_type_availability.authoring_enabled = true`. Keeping the component means when ASR lands, re-enabling the type is: (a) wire ASR into the component, (b) re-grade real answers, (c) remove the selection-path filter, (d) flip the DB flag. Deleting the component now saves no complexity and costs reinstatement work later.

### Edge cases

- A grammar pattern whose only variants are `speaking`: filtered out of `buildGrammarQueue`, effectively invisible until other variant types exist. Logged implicitly (skipped patterns reduce the grammar queue fill — may cause sessions to fall short of the 15% grammar target; acceptable because `speaking` should not be scheduled).
- Mixed-variant pattern (some `speaking`, some `contrast_pair`): only non-speaking variants are picked. Same pattern, same pedagogical intent, delivered via non-speaking variants.
- Published `speaking` variants attached to vocabulary contexts (productive stage): filtered in `selectExercises`, fall through to unpublished rotation.

### Tests

- `src/__tests__/sessionQueue.test.ts`: new case — `buildGrammarQueue` with a pattern whose only variants are `speaking` skips the pattern entirely.
- Same file: new case — `buildGrammarQueue` with mixed variants (speaking + contrast_pair) only ever returns the non-speaking variant across 20 trials.
- Same file: new case — `selectExercises` at productive stage never returns a `speaking` exercise even when the context has one published.
- New `src/__tests__/speakingExercise.test.tsx`: clicking the record button does not invoke `onAnswer`. **Must use fake timers** (`vi.useFakeTimers()` + `vi.advanceTimersByTime(2000)`) because today's component calls `onAnswer` after a 1500ms `setTimeout` — a naive test that only checks synchronous invocation would pass even before the fix. The assertion is: advance timers past 1500ms, then assert `onAnswer` was not called.

---

## Fix 3 — Cloze `is_anchor_context` fallback cleanup

### Current behavior

`makeClozeExercise` (`sessionQueue.ts:712–734`) falls back to any `is_anchor_context` context if no `context_type === 'cloze'` context exists:

```ts
const clozeContext = contexts.find(c => c.context_type === 'cloze')
  ?? contexts.find(c => c.is_anchor_context)
```

`makeClozeMcq` (`sessionQueue.ts:681–682`) has the identical fallback.

`selectExercises` at lines 383 and 438 gates cloze selection on `contexts.some(c => c.context_type === 'cloze')` — so the fallback never fires in the normal selection path.

Two latent risk paths:
- **Due-skill targeting at line 388–397**: the `form_recall` branch routes to `makeClozeExercise` when `hasAnchorContext` is true. `hasAnchorContext` is defined at line 383 strictly (`c.context_type === 'cloze'`), so today this is safe — but the fallback in `makeClozeExercise` still lives one code-change away from firing on a `lesson_snippet` context.
- **`lesson_snippet` contexts with `is_anchor_context = true`** can reach the fallback if any future caller doesn't pre-check, producing cloze exercises with full-sentence paragraphs where only a single word should be gapped. That would produce semantically broken exercises (the entire snippet becomes the "sentence with blank", with only one word blanked out and many unrelated sentences displayed).

### Desired behavior

`makeClozeExercise` and `makeClozeMcq` strictly require `context_type === 'cloze'`. If no such context exists, they return an `ExerciseItem` with `clozeContext: undefined` / `clozeMcqData: undefined` (current behavior when no context is found at all). Callers already handle this — the components render an error message. `selectExercises` already guards against the no-context case.

### Change

1. `src/lib/sessionQueue.ts:681–682` — remove the `?? contexts.find(c => c.is_anchor_context)` fallback in `makeClozeMcq`.
2. `src/lib/sessionQueue.ts:718–719` — remove the same fallback in `makeClozeExercise`.

Two-line deletions across two functions.

### Edge cases

- Items with no `cloze`-type context: behavior unchanged from today (selectExercises never routes to them; direct calls get `undefined` data, components render an error message).
- Items with both `cloze` and `lesson_snippet` anchor contexts: unchanged — `cloze` is still the first match.
- Items with only `lesson_snippet` anchor contexts: today these would theoretically hit the fallback if a caller bypassed selectExercises; after the fix they get `undefined` data. The component's error path handles it.

### Tests

- `src/__tests__/sessionQueue.test.ts`: new case — `makeClozeExercise` on an item with only `lesson_snippet` contexts (`is_anchor_context: true`, `context_type: 'lesson_snippet'`) returns `clozeContext: undefined`, not the snippet text.
- Same for `makeClozeMcq` → returns `clozeMcqData: undefined`.
- Same file: positive case — `makeClozeExercise` still returns valid `clozeContext` when a `context_type: 'cloze'` context exists alongside a `lesson_snippet`.

---

## Data Model Impact

None. No schema changes, no migrations, no seed changes, no data backfills.

The `ClozeMcqData` type in `src/types/learning.ts` gains an optional `explanationText?: string` field — but that's a TypeScript-only addition; the underlying DB column `exercise_variants.payload_json` is unchanged and already contains the field for authored grammar variants.

---

## Pipeline integration

Only Fix 1 touches the content pipeline; Fixes 2 and 3 are app-only.

### `linguist-reviewer` changes (Fix 1)

The reviewer agent (`linguist-reviewer` in `.claude/agents/` or equivalent) writes `review-report.json` flagging payload-contract violations. Today the agent may not verify that grammar `cloze_mcq` variants carry `explanationText`. Update the agent's check list:

- **New check**: for every authored grammar `cloze_mcq` variant in `candidates.ts`, `explanationText` is present and non-empty.
- **Severity**: WARNING (non-blocking) — per CLAUDE.md "WARNINGs are flagged for admin review in the app and do not block publishing." This matches how the reviewer treats similar content-quality gaps.
- **Concrete implementer action**: before editing, grep the existing `linguist-reviewer` agent config file (in `.claude/agents/` or wherever the agent's prompt lives) for `explanationText`. If other grammar types are already checked for this field, add `cloze_mcq` to the same check. If no explanationText check exists, add a unified check covering all four grammar types — `contrast_pair`, `sentence_transformation`, `constrained_translation`, `cloze_mcq` — as a single consistency pass.

### `publish-approved-content.ts` quality gate (Fix 1)

Belt-and-braces: the publisher should not write an `exercise_variants` row for a grammar `cloze_mcq` whose `payload_json.explanationText` is missing or empty. Options:

- **(a) Reject publish.** The script exits non-zero, the `content-seeder` agent routes back to `grammar-exercise-creator` per CLAUDE.md's documented mapping.
- **(b) Publish with warning.** Emit a console warning, continue — matches the reviewer's WARNING severity.

**Decision**: (b) — publish with warning. Missing explanation degrades wrong-answer feedback but doesn't break the exercise; blocking the whole lesson publish for an optional field is disproportionate. The warning is actionable post-publish via the Content Review page / Supabase Studio.

### `content-seeder` failure mapping

No change. The existing mapping in CLAUDE.md ("Broken candidate payloads → grammar-exercise-creator") already covers the case where the publisher rejects. Since Fix 1 uses a warning (not a reject), no new routing is needed.

### CLAUDE.md documentation

Update the "Content Management" section of CLAUDE.md's pipeline description:
- Where the per-exercise-type payload contracts are documented in the grammar-exercise-creator agent file (CLAUDE.md itself points readers to the agent configs for these contracts), ensure the `cloze_mcq` contract lists `explanationText` as expected.
- In CLAUDE.md's "content-seeder failure → agent mapping" list, the existing "Broken candidate payloads → grammar-exercise-creator" entry covers this case; no new entry needed.

### Seed data placement

No seed changes for Spec 1.

---

## Supabase Requirements

### Schema changes
- N/A — all three fixes are application-layer only. No new columns, no new tables, no new indexes.

### RLS policies
- N/A — no new tables or policies.

### Grants
- N/A.

### homelab-configs changes
- [ ] PostgREST: N/A — no new schema or schema exposure changes
- [ ] Kong: N/A — no new CORS origins or headers
- [ ] GoTrue: N/A
- [ ] Storage: N/A — no new buckets

### Health check additions
- N/A. No new tables, buckets, or functions to verify.

---

## Rollout

Each fix ships as its own commit for clean revertibility:

1. `fix: plumb explanation through grammar cloze_mcq feedback`
2. `fix: gate speaking exercises out of session selection`
3. `fix: remove is_anchor_context fallback in cloze builders`

All three can land in a single PR or as three separate PRs — no coupling between them. No user-facing behavior change on the happy path; only previously-dormant or silent failure modes are tightened.

Deployment order: any order is safe. Each fix is independently complete.

---

## Risk assessment

- **Fix 1**: Changes wrong-answer feedback for authored grammar `cloze_mcq` only. Runtime `cloze_mcq` path is unaffected. Lowest risk.
- **Fix 2**: Affects which exercises surface at productive/maintenance stage and within grammar slots. If a learner has grammar patterns whose only variants are `speaking`, those patterns silently disappear from sessions — expected and desired, but worth noting for anyone expecting them.
- **Fix 3**: Deletes a fallback code path. Today's selectExercises guards prevent it from firing, so behavior for all current call sites is unchanged. Low risk.

---

## Open questions

None at design time. All three changes have a single defensible implementation.
