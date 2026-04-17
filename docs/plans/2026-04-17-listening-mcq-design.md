# Listening MCQ Exercise Type — Design

## Overview

Add a new exercise type `listening_mcq` that presents an Indonesian word/phrase **as audio only** (no visible Indonesian text) and asks the learner to pick the correct user-language translation from four options. Uses the existing audio pipeline (`audio_clips` table, `AudioContext`, `PlayButton`) and reuses Spec 2's `pickDistractorCascade` for distractor selection. No schema migration required; exercise type is runtime-built from existing `learning_items` and their audio clips.

Pedagogical motivation: Sydorenko (2010, *Language Learning & Technology*) and Nation & Newton (2009) show that audio-only recognition builds phonological form-meaning mapping — a different cognitive pathway from visual recognition. This is the first exercise type in the app that exercises that pathway directly.

## Scope

### In scope

1. New runtime exercise type `listening_mcq` in `src/types/learning.ts`.
2. New React component `src/components/exercises/ListeningMCQ.tsx`.
3. New builder `makeListeningMcq` in `src/lib/sessionQueue.ts` using `pickDistractorCascade` (shipped in Spec 2).
4. Stage-gating in `selectExercises` so `listening_mcq` surfaces only from `anchoring` onward (never at `new`), and only when the item has a non-missing audio clip for the session's primary voice.
5. Feature flag `VITE_FEATURE_LISTENING_MCQ` in `src/lib/featureFlags.ts`.
6. User-level setting `listening_enabled` in user profile (localStorage-backed, same pattern as `autoplay_audio`) for accessibility opt-out.
7. `ExerciseShell` dispatch branch for `listening_mcq`.
8. Tests: component render, answer handling, cascade invariants, missing-audio fallback, feature-flag gating, user-setting gating.

### Non-goals

- **Authored `listening_mcq` variants.** The type is runtime-only; the distractor pool comes from other learning items. No `exercise_variants` rows are created. If later research shows curated listening distractors outperform runtime-generated ones, that's a future spec.
- **A new skill type `listening_recognition`.** Decision: reuse the existing `recognition` skill. See Decision log. The FSRS state changes produced by `listening_mcq` are indistinguishable from those produced by `recognition_mcq`.
- **Dictation** — that's Spec 4.
- **New audio generation.** `listening_mcq` uses audio that already exists from the Spec 2026-04-16 audio rollout; if an item has no audio clip, the exercise is not constructed.
- **Alternative audio voices per exercise.** The session-level `primary_voice` drives all listening_mcq audio within a session.

## Problem statement

Today the app's audio is **always redundant with visible text**. Every exercise shows the Indonesian form and plays it through `PlayButton` — the learner can solve by reading without ever hearing. Sydorenko (2010) empirically shows that audio-only MCQ builds phonological form-meaning mapping that combined-modality exercises don't reach; this effect is **additive** to, not replaceable by, visual recognition practice. Nation & Newton (2009) also note that "hear-and-identify" exercises are most effective when interspersed, not replaced.

So the gap is concrete: the app has no exercise type that forces the learner to decode audio into a meaning. Adding one leverages the audio infrastructure already in place (`audio_clips` table plus `get_audio_clips` RPC, `AudioContext`, `PlayButton`) with no new content-pipeline work.

## User experience

### Prompt

- **No Indonesian text is displayed**. The prompt area shows: a language-appropriate instruction ("Luister en kies de juiste vertaling" / "Listen and choose the correct translation"), a large speaker icon + play button, and a visually prominent "play" affordance.
- **Audio autoplays immediately on presentation**, overriding the user's global autoplay preference (see "Autoplay override" below).
- **Replay** is available via the speaker icon — unlimited replays with no time limit.
- **No visible hint** of the Indonesian text until after answering.

### Options

- **Four options**, one correct and three distractors, in the user's language.
- Layout identical to `RecognitionMCQ` — stacked buttons, full-width, size `lg`.
- Fisher-Yates shuffled client-side at render.

### Answering

- Clicking an option finalizes immediately (`MAX_FAILURES = 0`, matching all other MCQs).
- **Correct**: in-component 1500ms "✓ Correct" badge with the Indonesian base text revealed, then auto-advance. Matches the system-wide correct-answer policy in `feedback_exercise_answer_screen.md`.
- **Wrong**: Doorgaan feedback screen shows the Indonesian base text, the correct translation, and (optionally) a note saying what the learner heard. Per the same memory.

### Visual after answering

Post-answer (either correct or wrong), the Indonesian form `base_text` is revealed in the prompt area with a replay button, so the learner can hear it again while seeing the written form — this creates the dual-coding reinforcement that was deliberately withheld during the question phase.

## Component design

### File

`src/components/exercises/ListeningMCQ.tsx`. Styling: reuse `RecognitionMCQ.module.css` classes where applicable (it's structurally similar); add listening-specific styles inline or as a module CSS addition if they diverge materially.

### Props

```ts
interface ListeningMCQProps {
  exerciseItem: ExerciseItem  // exerciseType === 'listening_mcq', learningItem non-null
  userLanguage: 'en' | 'nl'
  onAnswer: (wasCorrect: boolean, latencyMs: number) => void
}
```

Matches `RecognitionMCQ` shape. No `previewMode` needed initially (the Content Review page does not preview runtime-generated exercises); can be added later if needed without breaking the contract.

### State

- `selectedOption: string | null`
- `isAnswered: boolean`
- `showWrong: boolean` — mirror of the existing MCQ wrong-answer flash (for consistency, though `MAX_FAILURES = 0` means it barely flashes)
- `startTime: number` — for latency
- `hasPlayedOnce: boolean` — tracks whether audio has played at all. If false when the user clicks an option, we disable scoring until audio plays (edge case: mobile browsers may block autoplay — see Accessibility).

### Audio resolution

Inside the component:
```ts
const { audioMap, voiceId } = useAudio()
const audioUrl = voiceId
  ? resolveAudioUrl(audioMap, learningItem.base_text, voiceId)
  : undefined
```

If `audioUrl` is undefined at render time, the component renders an error state: "Audio niet beschikbaar voor deze oefening" / "Audio not available for this exercise" and a Doorgaan button that skips the item. This should be a very rare fallback because `selectExercises` filters out items without audio (below); it's defense in depth.

### Autoplay override

The global `autoplay_audio` user setting controls whether audio plays automatically on **text-based** exercises. `listening_mcq` ignores that setting — audio **always** autoplays, because audio is the prompt; without it there is no question. This is documented in the component and in the user setting description ("autoplay for text exercises"). The rationale is that opting out of autoplay globally should not disable listening exercises entirely; users who want no audio whatsoever disable listening via the separate `listening_enabled` setting.

### Distractor options

Same pattern as `RecognitionMCQ`: `[correctTranslation, ...distractors].slice(0, 4).sort(() => Math.random() - 0.5)`. The distractors come from the `ExerciseItem.distractors` array populated by `makeListeningMcq` — identical shape to `recognition_mcq`'s distractors field. No new field on `ExerciseItem` is strictly needed, but see "Types" below for a small alternative.

## Runtime construction

### `makeListeningMcq` in `sessionQueue.ts`

```ts
function makeListeningMcq(
  item: LearningItem,
  meanings: ItemMeaning[],
  contexts: ItemContext[],
  variants: ItemAnswerVariant[],
  userLanguage: 'en' | 'nl',
  allItems: LearningItem[],
  meaningsByItem: Record<string, ItemMeaning[]>,
): ExerciseItem {
  // Uses the shared pickDistractorCascade helper (Spec 2).
  // Target pool construction identical to makeRecognitionMCQ, returning translation as option.
  // Skill type: recognition (same as recognition_mcq — see Decision log).
}
```

Signature mirrors `makeRecognitionMCQ` exactly. The distractor cascade is identical: POS-filter + semantic-group + level cascade over other items' primary user-language translations.

### Selection in `selectExercises`

`listening_mcq` is a **supplement**, not a replacement. It surfaces probabilistically at stages where recognition practice is active. The substitution carves directly from the existing `recognition_mcq` slice of each stage's rotation, preserving the recognition-skill-facet ratio.

| Stage | listening_mcq share | Source slice | Notes |
|---|---|---|---|
| `new` | 0% | — | Never at new — learner has not seen the form in text yet (research: Nation & Newton 2009 recommend hear-and-identify after some visual exposure; Nakata 2017 expanding retrieval) |
| `anchoring` (word) | ~15% | Half of the existing `recognition_mcq` slice | Split the current `else → recognition_mcq` branch at `sessionQueue.ts:425` and `:429` into 50% `recognition_mcq` / 50% `listening_mcq` when `canListen` |
| `retrieving` (word or sentence) | 0% | — | **Removed from spec.** The prior draft proposed carving from the `cloze_mcq` slice at line 438, but that slice is conditional on `hasAnchorContext`, so the carve would only fire for items with a cloze context — producing uneven coverage. Cleaner: no listening at retrieving. Anchoring provides enough audio-recognition practice before the item advances. If post-launch data shows retention gaps, revisit. |
| `productive`/`maintenance` (word) | ~10% | Half of the final `recognition_mcq` slice at line 475 | Split the existing `else → recognition_mcq` (roll ≥ 0.80, the 20% tail) into 50% `recognition_mcq` / 50% `listening_mcq` when `canListen`. Net: 10% listening, 10% recognition, preserving the 20% recognition-facet budget. |
| `sentence`/`dialogue_chunk` (any stage) | 0% | — | Sentences are too long for listening MCQ to be fair — learner can't hold a full sentence in working memory while scanning options |

**Arithmetic sanity check**: carving "5%" from a 20% branch would only yield 1% actual substitution — that confusion in the earlier draft motivated the halving-of-branch approach above. The "half of the recognition_mcq slice" formulation gives a concrete, correct implementation.

The exact split ratio (50/50 within the recognition_mcq slice) is tunable; the skeleton is: within each stage's `recognition_mcq` slice, flip a coin between `recognition_mcq` and `listening_mcq` when `canListen`. Percentages above are starting points; tune based on user feedback and retention data.

**Gating rules** — `listening_mcq` is only selected when ALL of:
1. Feature flag `VITE_FEATURE_LISTENING_MCQ` enabled (checked by `isExerciseTypeEnabled`).
2. User setting `listening_enabled` is true (read from localStorage).
3. Item has an audio clip for the session's `voiceId` (checked against `audioMap`).
4. Item is `item_type === 'word' || item_type === 'phrase'` (never `sentence` or `dialogue_chunk`).
5. Stage is `anchoring`, `productive`, or `maintenance` (never `new` or `retrieving` per the table above).
6. The skill under review is `recognition` (via the `targetSkillType === 'recognition'` branch at `sessionQueue.ts:391`, or via the anchoring/productive stage-rotation rolls described above).

If any fails, fall back to whatever `recognition_mcq` selection would have done — zero user-visible disruption.

### Checking for available audio

The session builder already fetches `audioMap` before session start (per audio-design.md). Add a plain check inside `selectExercises`:

```ts
function hasAudioFor(item: LearningItem, audioMap: AudioMap, voiceId: string | null): boolean {
  if (!voiceId) return false
  const normalized = normalizeTtsText(item.base_text)
  return !!audioMap.get(voiceId)?.get(normalized)
}
```

`makeListeningMcq` is only called when `hasAudioFor` returns true. This requires threading `audioMap` + `voiceId` into `selectExercises` — a signature change touching `buildSessionQueue` and `Session.tsx` at the call site.

**Threading model — React-side vs session-builder**: `AudioContext` (`src/contexts/AudioContext.tsx`) is the React surface — used by exercise components via `useAudio()` to resolve audio URLs at render time. The session-builder path (`buildSessionQueue` → `selectExercises`) runs outside the React tree, cannot call `useAudio()`, and therefore must receive `audioMap` + `voiceId` as plumbed function arguments. This is why `buildSessionQueue`'s input gains `audioMap?: AudioMap` and `voiceId?: string | null` — explicit plumb through. `Session.tsx` obtains these from its session-start audio fetch, passes them both into `buildSessionQueue` *and* into `AudioContext.Provider`. The two paths (context for rendering, props for selection) share the same underlying data.

### Signature changes

- `selectExercises(candidate, meaningsByItem, contextsByItem, variantsByItem, exerciseVariantsByContext, userLanguage, allItems, audioMap?, voiceId?)`
  - New final two params, optional; when absent, listening_mcq is never selected (safe default for tests and callers that don't have audio data).
- `buildSessionQueue` input gets `audioMap?: AudioMap` and `voiceId?: string | null`. Session.tsx populates these from the existing session-start audio fetch.

## Skill tracking

### Decision: reuse `recognition` skill

`listening_mcq` advances the `recognition` skill — same as `recognition_mcq`. Rationale:

- The FSRS state produced by either exercise is a signal of "the learner can map an Indonesian form to meaning"; whether the form was presented visually or auditorily is an encoding detail.
- Tracking a separate `listening_recognition` skill doubles the per-item skill-state rows, complicates FSRS scheduling (which skill is overdue?), and requires new stage-promotion logic.
- The pedagogical evidence (Sydorenko 2010) argues for including audio-only exercises as **practice**, not for tracking audio-only recognition as an independent learning goal.
- If retention data later shows that listening practice fails to transfer to reading recognition (or vice versa), a future spec can split the skill. Starting unified is reversible; starting split is hard to merge.

### Consequence for FSRS

- A `listening_mcq` correct answer increments the item's `recognition` skill's `success_count` and grows its stability, same as a `recognition_mcq` correct answer would.
- A listening_mcq wrong answer increments `failure_count` and triggers the usual demotion checks.
- No changes to `reviewHandler.ts` logic beyond mapping `listening_mcq` → `recognition` skill in its skill-type lookup.

## Stage-rotation integration

The selection logic in `sessionQueue.ts:405–479` gains branches for listening_mcq:

### `anchoring` (lines 407–427)

Current `anchoring` without cloze context randomly picks among `cued_recall`, `meaning_recall`, `recognition_mcq`. After this spec:

```ts
if (stage === 'anchoring' && !hasAnchorContext) {
  const roll = Math.random()
  if (roll < 0.30) → cued_recall
  else if (roll < 0.55) → meaning_recall
  else if (roll < 0.70 && canListen) → listening_mcq
  else → recognition_mcq
}
```

Similarly carve a slice from the branch with cloze context. Exact rolls in the implementation plan.

### `retrieving` (word)

**Not scheduled** — see the selection table above. The earlier draft proposed carving from `cloze_mcq` at line 438 but the carve only fires when `hasAnchorContext`, producing uneven coverage. Simpler: no listening at retrieving. Anchoring-stage exposure is sufficient.

### `productive`/`maintenance` (word, no published variant)

Split the existing `recognition_mcq` tail slice (roll ≥ 0.80, `sessionQueue.ts:475`) 50/50 into `recognition_mcq` and `listening_mcq` when `canListen`. Net: ~10% of productive/maintenance goes to listening_mcq, preserving the 20% recognition-facet budget. See the selection table above for the canonical figures.

### Sentence-type items

`listening_mcq` is never scheduled for `sentence` or `dialogue_chunk` items. The cognitive load of holding a 10-word Indonesian sentence in working memory while scanning four Dutch translations is too high for a fair MCQ. If we later want sentence-level listening practice, that's a separate exercise type (e.g. listening comprehension with more scaffolding).

## Feature flag and user setting

### Feature flag

Add to `src/lib/featureFlags.ts`:
```ts
listeningMcq: parseEnvFlag('VITE_FEATURE_LISTENING_MCQ'),
```
And to `isExerciseTypeEnabled`:
```ts
case 'listening_mcq':
  return featureFlags.listeningMcq
```

**Classification**: `listening_mcq` is an **optional** exercise type (same category as `cued_recall`, `contrast_pair`, `sentence_transformation`, `constrained_translation`, `speaking`). It is **not** in the "Core types cannot be disabled via feature flags" list (`featureFlags.ts:55–59`) which hardcodes `recognition_mcq`, `typed_recall`, `cloze`, `meaning_recall` to always enabled. Listening MCQ requires audio infrastructure and hearing ability — both are legitimate deployment-level and per-user reasons to disable.

Default: true (same convention as other optional types). To disable at the deployment level: `VITE_FEATURE_LISTENING_MCQ=false`.

### User setting

`listening_enabled: boolean`, localStorage-backed, default `true`, mirroring the `autoplay_audio` pattern:
- New file `src/lib/listeningPreferences.ts` with `getListeningEnabled()` / `setListeningEnabled(enabled)`.
- New context `src/contexts/ListeningContext.tsx` following `AutoplayContext`.
- Settings page gains a toggle "Luisteroefeningen inschakelen" / "Enable listening exercises".
- When false, `makeListeningMcq` is never called; all other exercise types unaffected.

The user setting is distinct from the feature flag because it's for **accessibility**: a hard-of-hearing learner should be able to opt out even when the admin has the feature enabled deployment-wide.

## Types

Add to `src/types/learning.ts`:

```ts
// Add to the exerciseType union
exerciseType: ... | 'listening_mcq'
```

Distractors reuse the existing `ExerciseItem.distractors: string[]` field (same as recognition_mcq). **No new `listeningMcqData` field** is created because the data shape is identical to recognition_mcq — both use `learningItem.base_text`, `meanings`, and `distractors`. The differentiator is `exerciseType`, which the component reads to decide whether to hide the text. Keeping the fields flat avoids a parallel payload type that duplicates recognition_mcq's.

**Alternative considered**: a nested `listeningMcqData: { distractors: string[], correctTranslation: string }`. Rejected — it's gratuitous indirection.

## Accessibility

### Audio autoplay on mobile

Safari and some Android browsers block autoplay without user gesture. The component handles this:
1. On mount, attempt `audio.play()`.
2. If the play() Promise rejects (autoplay blocked), render a large "Tap to play" overlay instead of the normal UI. The learner taps, audio plays, overlay dismisses, options become enabled.
3. Track this state in `hasPlayedOnce`; disable the option buttons until audio has started at least once, so a learner can't accidentally answer blind.

### Hard-of-hearing learners

The `listening_enabled` user setting provides a clean opt-out. Setting it to false removes all `listening_mcq` exercises from the session — the learner is not penalized in any way; they get slightly more `recognition_mcq` instead. Setting is opt-out (default on), not opt-in, so hearing learners get the benefit without configuration.

### Screen readers

The component's prompt area has a visible instruction ("Listen and choose..."), a speaker icon with `aria-label="Play Indonesian audio"`, and options with standard button semantics. Screen readers announce the instruction and buttons. Post-answer, the revealed Indonesian form has `aria-live="polite"` so it's read when the feedback screen appears.

### Captions / transcript availability

The Indonesian form is hidden during the question; revealed after answering. A deaf learner who disables `listening_enabled` never sees this exercise, so captions are moot. For users who leave listening enabled but have intermittent hearing: the replay button is always available; the visible text-reveal on answer is always provided.

## Data Model Impact

No schema changes.

- `learning_items` — unchanged. Needs `pos` from Spec 2 for distractor quality; that's a Spec 2 dependency, not a new Spec 3 change.
- `audio_clips` — unchanged. `listening_mcq` reads existing rows.
- `learner_skill_state` — unchanged. `listening_mcq` writes to the existing `recognition` skill row.
- `exercise_variants` — unchanged. No authored variants.
- `exercise_type_availability` — **gains one row** as part of data seeding: `('listening_mcq', true, false, false, 'alpha', ...)`. This is a seed-script change, not a schema change.

---

## Pipeline integration

Audio is the load-bearing dependency. `listening_mcq` surfaces only when the item has an audio clip for the session's primary voice. The pipeline must guarantee that new lessons ship with audio, or `listening_mcq` silently never fires for them.

### Audio-generation prerequisite

Today, `scripts/generate-exercise-audio.ts` (from the 2026-04-16 audio rollout) is a separate, manually-invoked step that runs *after* `publish-approved-content.ts` completes. For `listening_mcq` to work on a newly published lesson, audio generation must have run. Two options:

- **(a) Integrate into publish.** `publish-approved-content.ts` invokes `generate-exercise-audio.ts` as a final step on success. Pros: no operator coordination needed; pipeline is one-shot. Cons: publish time lengthens by the Google TTS generation run (~30–60 s for a new lesson); any TTS API failure now blocks publish.
- **(b) Document the ordering; add a health check.** Keep audio generation separate; document in CLAUDE.md that `generate-exercise-audio.ts` must run post-publish before listening exercises work for the new content. Add a check in `check-supabase-deep.ts` that reports the count of word/phrase items missing audio clips.

**Decision**: (b). Rationale: (a) couples TTS availability to publish, creating a failure mode where content publish breaks because of an unrelated external-service outage. Keeping them separate preserves the publishability of pure-text content even when TTS is down. The health check covers discoverability of the gap; the operator remains the actor who ties the two together.

Operator workflow (documented in CLAUDE.md post-update):
```
bun scripts/publish-approved-content.ts 9
bun scripts/generate-exercise-audio.ts 9
```

### `publish-approved-content.ts` audio-availability report

Add a post-publish report: after publishing lesson N, query the count of word/phrase items for that lesson that have audio clips vs. don't. Print a summary so the operator sees whether audio generation has been run yet:

```
Audio coverage for lesson 9:
  - Items with audio: 0 / 142
  - Run `bun scripts/generate-exercise-audio.ts 9` to enable listening exercises.
```

If the count is `N / N`, the message reduces to a single line confirming full coverage.

### Health check additions

`scripts/check-supabase-deep.ts`:
- Query `indonesian.learning_items l LEFT JOIN indonesian.audio_clips ac ON l.normalized_text = ac.normalized_text WHERE l.item_type IN ('word', 'phrase') AND ac.id IS NULL GROUP BY l.id`. Report the count of word/phrase items lacking any audio clip (regardless of voice). This is a coarse check; a voice-specific check would be noisy because each lesson uses one primary voice.
- Report the count of `exercise_type_availability` rows where `exercise_type = 'listening_mcq'` (should be exactly 1 after seed).

### `exercise_type_availability` seed row

Placement: append to `scripts/migration.sql` after the existing `exercise_type_availability` seed rows (the existing block starts at `scripts/migration.sql:871`).

**Verified**: `exercise_type` is the table's PRIMARY KEY (`scripts/migration.sql:803–804`: `CREATE TABLE ... exercise_type_availability (exercise_type text PRIMARY KEY, ...)`), so `ON CONFLICT (exercise_type) DO NOTHING` is valid and idempotent. `make migrate` is safe to re-run.

```sql
INSERT INTO indonesian.exercise_type_availability
  (exercise_type, session_enabled, authoring_enabled, requires_approved_content, rollout_phase, notes)
VALUES
  ('listening_mcq', true, false, false, 'alpha',
   'Audio-only Indonesian prompt, user-language MCQ. Runtime-built. No authored variants.')
ON CONFLICT (exercise_type) DO NOTHING;
```

### `linguist-reviewer` changes

No change. `listening_mcq` has no authored variants and no staging content; the reviewer has nothing to validate for it.

### `content-seeder` failure mapping

No new mappings. The type is runtime-only; publish failures don't route back to a linguist agent for it.

### CLAUDE.md documentation update

Add to the "Content Management" section:
- A note under "Adding a new lesson (lessons 4+)" Step 7 (Publish): after publish, run `generate-exercise-audio.ts <N>` to enable audio-dependent exercises (currently `listening_mcq`).
- Update the exercise-type inventory (if present) to list `listening_mcq` with its audio dependency.
- Update the feature-flag summary to include `VITE_FEATURE_LISTENING_MCQ`.

### Feature-flag default considerations for rollout

Per CLAUDE.md's environment-variable convention, `VITE_FEATURE_LISTENING_MCQ` defaults to `true`. For a cautious rollout the operator can deploy with `VITE_FEATURE_LISTENING_MCQ=false`, verify audio coverage on existing lessons via the new health check, then enable. No code change required to flip.

## Supabase Requirements

### Schema changes
- N/A — no new columns, tables, indexes, triggers, functions, or RLS policies.

### RLS policies
- N/A — no new tables.

### Grants
- N/A.

### Seed data
- `INSERT INTO indonesian.exercise_type_availability` row for `listening_mcq` with `session_enabled = true`, `authoring_enabled = false`, `requires_approved_content = false`. Idempotent via `ON CONFLICT DO NOTHING`.

### homelab-configs changes
- [ ] PostgREST: N/A — no new schema exposure
- [ ] Kong: N/A — no new CORS origins or headers
- [ ] GoTrue: N/A
- [ ] Storage: N/A — audio infra from the 2026-04-16 rollout is reused; `indonesian-tts` bucket already exists

### Health check additions
- `scripts/check-supabase-deep.ts`: verify the `exercise_type_availability` row exists for `listening_mcq` with the expected flags. Add to the existing availability-table verification section if one exists; otherwise add a new check.
- `scripts/check-supabase.ts`: N/A — functional health already covers the `indonesian-tts` bucket.

## Tests

### Files touched

| Path | Status | Purpose |
|---|---|---|
| `src/__tests__/listeningMcqExercise.test.tsx` | New | Component render, answer flow, missing-audio error state, autoplay behavior |
| `src/__tests__/sessionQueue.test.ts` | Extend | `makeListeningMcq` cascade invariants; selectExercises gating (feature flag, user setting, audio presence, item_type, stage) |
| `src/__tests__/featureFlags.test.ts` (new if absent) | New | `isExerciseTypeEnabled('listening_mcq')` respects `VITE_FEATURE_LISTENING_MCQ` |
| `src/__tests__/listeningPreferences.test.ts` | New | localStorage get/set round-trip, default true |

### Unit / component tests

`listeningMcqExercise.test.tsx`:
- **Renders without Indonesian text visible** — query by Indonesian `base_text` returns null before answering.
- **Correct click → `onAnswer(true)`** — via `userEvent` on the correct translation.
- **Wrong click → `onAnswer(false)` immediately** (MAX_FAILURES = 0), using fake timers to advance past the setTimeout.
- **Post-answer Indonesian form visible** — `base_text` is shown after the click.
- **Replay button exists and is operable** — presence assertion.
- **Missing-audio error state** — mount with `audioMap` missing the target, assert the error message appears and option buttons are disabled.
- **Autoplay-blocked fallback** — mock `HTMLAudioElement.prototype.play` to reject; assert "Tap to play" overlay renders and option buttons are disabled until play succeeds.
- **Autoplay-succeeds path** — mock `HTMLAudioElement.prototype.play` to resolve immediately; assert the overlay is not rendered, `hasPlayedOnce` becomes true, and option buttons are enabled from the start. Prevents a regression where the overlay sticks even after successful autoplay.

### Session-queue tests

`sessionQueue.test.ts` additions:
- **Feature flag off** — `VITE_FEATURE_LISTENING_MCQ=false` → `makeListeningMcq` never called; selection falls through to recognition_mcq.
- **User setting off** — `listening_enabled=false` → same behavior.
- **Item without audio** — `audioMap.get(voiceId)?.get(baseText)` undefined → selection falls through to recognition_mcq.
- **Sentence-type item** — `item_type === 'sentence'` → never gets listening_mcq regardless of stage.
- **New stage** — stage === 'new' → never gets listening_mcq.
- **Distractor cascade** — `makeListeningMcq` uses `pickDistractorCascade`; asserts the same cascade invariants as the Spec 2 tests (POS filter, structural filter, semantic group).

### Integration-ish

Add to the existing session-flow integration test (`sessionFlow.test.tsx`) one scenario where an item at `anchoring` with known audio is served as `listening_mcq` — verifying the prop threading from `buildSessionQueue` → `Session.tsx` → `ExerciseShell` → `ListeningMCQ` works end-to-end.

## Rollout

Ordered to keep the system functional at every step:

1. **Types + feature flag** — add `'listening_mcq'` to the `exerciseType` union; add `listeningMcq` to `featureFlags`. No visible change.
2. **User setting infrastructure** — `listeningPreferences.ts`, `ListeningContext.tsx`. No visible change.
3. **Seed data** — `exercise_type_availability` row insert. No visible change.
4. **Builder** — `makeListeningMcq` in `sessionQueue.ts` using `pickDistractorCascade`. Still not routed from `selectExercises`; dead code but testable.
5. **Component** — `ListeningMCQ.tsx` + dispatch in `ExerciseShell`. Still not reached; renders only if something forces `exerciseType: 'listening_mcq'`.
6. **Session-builder signature change** — thread `audioMap` + `voiceId` into `selectExercises`. No behavior change yet — just the data is available.
7. **Selection logic** — add the stage-rotation branches and gating. **This is the behavior-changing step**; users start seeing listening_mcq after this lands.
8. **Settings page toggle** — add the user-level control. Users can opt out after this.
9. **Health checks + tests** — land alongside each step.

**Revertibility**: steps 1–6 are non-user-facing; revert the step-7 commit to disable the type without touching the rest. Step 8 is additive UI; step 7 can also ship with the UI in a single batch if preferred.

**Dependency on Spec 2**: `pickDistractorCascade` must exist. If Spec 2 has not landed when Spec 3 is implemented, the builder can use the existing inline cascade from `makeRecognitionMCQ` as an interim (copy-paste); it just won't benefit from POS filtering until Spec 2 does land. Cleaner sequencing is Spec 2 → Spec 3, but dependency is soft not hard.

## Decision log

### Rejected: new `listening_recognition` skill type

Considered splitting recognition into visual-recognition + audio-recognition. Rejected because:
- Per-item skill-state rows would double for what is pedagogically practice, not a separate learning goal.
- FSRS scheduling would need to reason about two recognition skills per item, complicating the most-overdue-first logic and the promotion rules.
- The SLA evidence (Sydorenko 2010, Nation & Newton 2009) supports audio-only exercises as practice interspersed with text exercises — not as a distinct skill to master.
- Reversible later: if retention data shows transfer failure, splitting is a future schema change; starting unified costs nothing.

### Rejected: authored `listening_mcq` variants

Considered an authored path where linguists curate listening distractors. Rejected because:
- Distractors come from other learning items' translations; the cascade in Spec 2 delivers high-quality distractors without authoring.
- No pedagogical evidence I found suggests curated-listening-distractors outperform cascade-selected ones.
- Authoring burden and pipeline complexity not justified by the marginal quality gain.

### Rejected: listening_mcq for sentence-type items

Considered extending to sentences for "listening comprehension" practice. Rejected because:
- MCQ with sentence audio has high working-memory load — the learner can't simultaneously hold a 10-word Indonesian sentence and scan four Dutch translations.
- Sentence-level listening comprehension is a distinct skill that deserves its own exercise type (shadowing, sentence reconstruction, or scaffolded MCQ with visible Indonesian after first play). Out of scope here.

### Rejected: expose a `listeningMcqData` payload field

Considered a nested data object to carry listening-specific metadata. Rejected because the data is identical to recognition_mcq (translation, distractors). A separate field would duplicate without conveying new information.

### Accepted: autoplay always-on for listening_mcq regardless of global autoplay setting

The global `autoplay_audio` setting controls autoplay for text-visible exercises. For listening_mcq, audio IS the prompt; opting out of autoplay would break the exercise. Users who want zero audio disable `listening_enabled` instead, which removes the exercise entirely.

### Accepted: starting-point substitution rates (15% anchoring, 10% retrieving, 5% productive/maintenance)

Chosen based on qualitative balance: enough exposure to build phonological mapping (≥ ~10 listening exposures per word over the word's lifetime) without dominating the session. Tunable post-launch based on user feedback and retention data.

## Open questions

1. **Telemetry for tuning**: should we log per-answer whether the user replayed audio, and if so how many times? Useful for understanding difficulty but adds per-answer data volume. Suggestion: defer to post-launch if tuning is needed; don't add telemetry prospectively.
2. **Sentence item future**: is a separate `listening_comprehension` exercise type a near-term plan? If yes, avoid naming decisions here that preclude it (e.g. don't name the component `AudioExercise`).

## References

- Sydorenko (2010), *Language Learning & Technology* — audio-only vs audio+text vocabulary MCQ. Empirical basis for this exercise type.
- Nation & Newton (2009), *Teaching ESL/EFL Listening and Speaking* — "hear-and-identify" exercises and their role in listening skill development.
- Nakata (2017), *Modern Language Journal* — expanding retrieval practice; supports interspersing audio and text exercises.
- Memory `research_audio_sla.md` — prior research synthesis, section 3 (Listening Comprehension MCQ).
- Spec 2 (`docs/plans/2026-04-17-pos-aware-distractors-design.md`) — source of `pickDistractorCascade`.
- `docs/plans/2026-04-16-exercise-audio-design.md` — source of `audio_clips` infrastructure this spec depends on.
