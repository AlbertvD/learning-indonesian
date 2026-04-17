# Dictation Exercise Type — Design

## Overview

Add a new exercise type `dictation` that plays an Indonesian word or phrase as audio and asks the learner to **type what they hear** (free text). Highest-impact exercise type in the SLA literature (Elgort 2011 — strongest lexical retention effect at 1-month delayed posttest; Bjork 1994 — desirable difficulty) and the final type in the audio-exercise trilogy alongside `listening_mcq` (Spec 3).

Runtime-built, like `listening_mcq` and `typed_recall` before it: the audio already exists from the 2026-04-16 audio rollout, and grading reuses `checkAnswer` from `src/lib/answerNormalization.ts`. No content-pipeline authoring.

## Scope

### In scope

1. New runtime exercise type `dictation` in `src/types/learning.ts`.
2. New React component `src/components/exercises/Dictation.tsx`.
3. New builder `makeDictation` in `src/lib/sessionQueue.ts`.
4. Stage-gating in `selectExercises` so `dictation` surfaces only from `retrieving` stage onward (never at `new` or `anchoring`), for word/phrase items with audio available.
5. Feature flag `VITE_FEATURE_DICTATION` in `src/lib/featureFlags.ts`.
6. Gating via the `listening_enabled` user setting (introduced in Spec 3) — one user-level audio opt-out toggle covers both listening_mcq and dictation.
7. `ExerciseShell` dispatch branch for `dictation`.
8. Tests: component render, answer flow, fuzzy match, punctuation leniency, missing-audio error state, feature-flag gating, autoplay blocked/succeeds flows.

### Non-goals

- **Authored `dictation` variants.** Runtime only; no `exercise_variants` rows.
- **A new `audio_form_recall` skill type.** Dictation advances the existing `form_recall` skill — same as `typed_recall` and `cloze`. See Decision log.
- **Meaning cue during the prompt.** The prompt is audio only. No translation shown before answering. This maximizes the phonological → lexical → orthographic processing chain Oller (1979) identifies as the core of dictation's effectiveness.
- **Word-bank scaffolding.** Rejected in favor of free text per Laufer & Rozovski-Roitblat (2015) and the earlier research thread in memory `research_audio_sla.md` §8: free text produces ~150% better long-term retention than passive exposure; word banks underperform for anything beyond early scaffolding. For Indonesian specifically (transparent orthography), free text is low-friction.
- **"Show hint" / first-letter reveal.** Deferred. Desirable-difficulty literature (Bjork 1994) argues against hints; if needed for mobile UX later, it's a future enhancement.
- **Sentence-type dictation.** First release covers `word` and `phrase` items only. Sentence dictation compounds error opportunities (typing speed, working-memory hold, cascading mistakes) and deserves a later scaffolded treatment (e.g. sentence-reconstruction or dictogloss).
- **Speech recognition for pronunciation training.** Out of scope; covered by the dormant `speaking` exercise type (see Spec 1 Fix 2).

## Problem statement

Today the app has no exercise that asks the learner to convert Indonesian audio into Indonesian orthography. The existing productive exercises (`typed_recall`, `cloze`, `sentence_transformation`) all present a visual or meaning-language cue and ask the learner to produce Indonesian. None exercise the audio→orthography pathway.

Research supporting dictation specifically:

- **Elgort (2011), *Language Learning*** — productive tasks including dictation create stronger lexical representations than receptive-only; effects persist at 1-month delayed posttest. One of the strongest empirical results on exercise-type durability.
- **Kiany & Shiramiry (2002), *TESOL Quarterly*** — dictation significantly improved spelling accuracy and listening comprehension (p < .01).
- **Oller (1979)** — dictation simultaneously engages phonological decoding, lexical access, and orthographic encoding. Theoretically the densest information-processing task in beginner L2.
- **Bjork (1994) desirable difficulty** — effortful retrieval predicts better long-term retention. Free-text dictation is maximally effortful within the constraints of a digital exercise.

Summary cited in memory `research_audio_sla.md` §4 ("Dictation / Transcription — STRONGEST EXERCISE TYPE"). This is the single highest-expected-payoff exercise type from the 2026-04-17 pedagogical review.

## User experience

### Prompt

- **No Indonesian text is displayed**. Instruction area says "Luister en typ wat je hoort" / "Listen and type what you hear".
- **Audio autoplays immediately on presentation**, overriding the global `autoplay_audio` setting (same policy as `listening_mcq` — audio is the prompt).
- **Replay** via speaker icon — unlimited, no time limit.
- **Text input** below the audio prompt. Autocorrect / autocapitalize / spellcheck disabled (matching `Cloze.tsx` pattern) so the learner's Indonesian isn't silently "fixed" by the browser.
- **No meaning cue** (no translation visible) before answering.

### Answering

- **Submit** via button or Enter. Empty-input submit is disabled (same as `typed_recall`).
- **Correct**: 1500ms "✓ Correct" badge with the Indonesian form revealed, then auto-advance. Matches the system-wide correct-answer policy.
- **Wrong**: Doorgaan feedback screen shows the correct Indonesian form, the learner's response, and the translation. Per `feedback_exercise_answer_screen.md`.
- **Fuzzy match** (Levenshtein ≤ 1 of `base_text` or any variant): treated as correct but flagged `isFuzzy: true` via the existing `checkAnswer` contract. Identical behavior to `typed_recall`. The translation badge reads "Bijna goed!" / "Almost correct!" via the existing `t.session.feedback.almostCorrect` string.

### Visual after answering

Post-answer, the Indonesian form is revealed in the prompt area with a replay button, and the user-language translation appears below. Same dual-coding reinforcement pattern as `listening_mcq`.

## Component design

### File

`src/components/exercises/Dictation.tsx`. Reuse `Cloze.module.css` classes for input styling (the cloze input is also a centered transparent-background typed field) or author a new `Dictation.module.css` if styling diverges.

### Props

```ts
interface DictationProps {
  exerciseItem: ExerciseItem  // exerciseType === 'dictation', learningItem non-null
  userLanguage: 'en' | 'nl'
  onAnswer: (wasCorrect: boolean, isFuzzy: boolean, latencyMs: number, rawResponse: string) => void
}
```

Matches the typed-exercise pattern (`TypedRecall`, `Cloze`, `MeaningRecall`). No preview mode in v1.

### State

- `response: string`
- `isAnswered: boolean`
- `startTime: number` — for latency
- `hasPlayedOnce: boolean` — same autoplay-blocked handling as `listening_mcq`

### Audio resolution

Same pattern as `listening_mcq`:
```ts
const { audioMap, voiceId } = useAudio()
const audioUrl = voiceId
  ? resolveAudioUrl(audioMap, learningItem.base_text, voiceId)
  : undefined
```

If `audioUrl` is undefined at render time, render an error state with a Doorgaan button that skips the item (same as `listening_mcq`). Rare; `selectExercises` filters upstream.

### Autoplay override

Always autoplay, regardless of the global `autoplay_audio` setting — audio is the prompt. Same rationale as `listening_mcq`. Users who want no audio use the `listening_enabled` toggle.

### Grading

```ts
const result = checkAnswer(response, learningItem.base_text, answerVariants.map(v => v.variant_text))
```

`checkAnswer` (in `src/lib/answerNormalization.ts`) already:
- Lowercases + trims
- Strips punctuation (including `?`, `!`, `.`, `,`)
- Strips parentheticals
- Accepts slash-separated alternatives
- Accepts **insertion/deletion** (length differs by 1, Levenshtein = 1) or **transposition** (same length, Damerau = 1, Levenshtein ≠ 1) as fuzzy matches. **Substitutions are explicitly rejected** — see `answerNormalization.ts:76`: "Substitutions are EXCLUDED (prevent minimal pair errors like membeli/memberi)."

Examples for dictation:
- Target `Apa kabar?`, typed `"apa kabar"` — **exact match** (punctuation stripped, case folded).
- Target `"kabar"`, typed `"kabr"` — **fuzzy match** (deletion, length differs by 1, L-dist = 1).
- Target `"kabar"`, typed `"kbaar"` — **fuzzy match** (transposition, same length, Damerau = 1, L-dist = 2).
- Target `"membeli"`, typed `"memberi"` — **rejected** (substitution of l→r, L-dist = 1 but same length and Damerau = 1 with L-dist = 1 which fails the transposition rule; also the code's stated intent is to reject minimal-pair substitutions).
- Target `"kabar"`, typed `"apa"` — **rejected** (length differs by 2).

This is identical to `typed_recall` — no new grading logic. See the "Fuzzy-match concern" section below for a pedagogical caveat specific to dictation.

### Fuzzy-match concern specific to dictation

Because dictation has no meaning cue, a fuzzy-correct response can silently teach the wrong meaning. Two realistic scenarios:

- **Insertion yielding a real word**: target `tahu` (know / tofu), heard as "tahun" (year). Length +1, L-dist = 1 → **accepted as fuzzy**. The learner gets ✓ but has misheard and written the wrong word.
- **Transposition yielding a real word**: target `mahal` (expensive), typed `mahla` — transposition, accepted as fuzzy. Less common because many transpositions aren't real words.

`typed_recall` does not have this failure mode: the meaning cue ("expensive") anchors the answer, so the learner wouldn't type "tahun" when the prompt is "know".

**Policy for dictation** (first release): accept fuzzy matches as today's `checkAnswer` does — but **surface the mismatch prominently on the feedback reveal**. The post-answer screen shows both forms side-by-side: "You typed: **tahun** / Target: **tahu**" so the learner immediately sees the discrepancy even though the exercise marks them correct. This is cheaper than building a dictionary-lookup tightening and preserves FSRS calibration (a typed-one-edit-off is still meaningful retrieval). A stricter post-launch policy (e.g. reject fuzzy when both forms are real Indonesian words) is a future option.

## Runtime construction

### `makeDictation` in `sessionQueue.ts`

```ts
function makeDictation(
  item: LearningItem,
  meanings: ItemMeaning[],
  contexts: ItemContext[],
  variants: ItemAnswerVariant[],
): ExerciseItem {
  return {
    learningItem: item,
    meanings,
    contexts,
    answerVariants: variants,
    skillType: 'form_recall',
    exerciseType: 'dictation',
  }
}
```

Structurally identical to `makeTypedRecall` (`sessionQueue.ts:603`). The only differences are `exerciseType` and the component that renders it. No distractor cascade needed — this is typed input. No new payload field on `ExerciseItem`.

### Selection in `selectExercises`

`dictation` is a **form_recall** exercise and surfaces alongside `typed_recall` and `cloze`. Substitutes from the `typed_recall` slice to preserve the form_recall facet ratio.

| Stage | dictation share | Source slice | Notes |
|---|---|---|---|
| `new` | 0% | — | Never — learner has not seen the form in text yet |
| `anchoring` | 0% | — | Never — learner not yet at productive stage (the meaning_recall gate from `anchoring → retrieving` requires at least one successful meaning_recall review first) |
| `retrieving` (word) | ~9% | Half of the `typed_recall` tail at `sessionQueue.ts:445` | The current `retrieving`-word branch has a final `else → typed_recall` (roll ≥ 0.82, ~18% of the stage). Split 50/50 into `typed_recall` / `dictation` when `canListen` — net ~9% dictation, ~9% typed_recall, preserving the 18% form_recall-via-typed slice. |
| `retrieving` (sentence) | 0% | — | Sentences too long for dictation at current scope |
| `productive`/`maintenance` (word) | ~17% | Half of the `typed_recall` branch at `sessionQueue.ts:469` | The current productive-word rotation leads with 35% `typed_recall`. Split 50/50 when `canListen` — net ~17% dictation, ~17% typed_recall, preserving the 35% typed slice. |
| `productive`/`maintenance` (sentence) | 0% | — | Sentences excluded first-release |

**Arithmetic check**: the 50/50 split within a source slice delivers a concrete percentage (half the source), unlike vague "carve N%" language. Same discipline as Spec 3.

**Gating rules** — `dictation` is only selected when ALL of:
1. Feature flag `VITE_FEATURE_DICTATION` enabled.
2. User setting `listening_enabled` is true (shared with `listening_mcq`).
3. Item has an audio clip for the session's `voiceId` (`hasAudioFor(item, audioMap, voiceId)` — helper from Spec 3).
4. Item is `item_type === 'word' || item_type === 'phrase'`.
5. Stage is `retrieving`, `productive`, or `maintenance`.
6. The skill under review is `form_recall` (via `targetSkillType === 'form_recall'` branch at `sessionQueue.ts:394`, or via the stage-rotation random rolls above).

If any fails, fall back to `typed_recall` (the natural alternative for the form_recall slice).

### Due-skill targeting interaction

The existing due-skill targeting branch at `sessionQueue.ts:388–403` serves `typed_recall` for due `form_recall` skills (with a 50% chance of `cloze` if `hasAnchorContext`). With dictation in place, the form_recall branch becomes a multi-way choice depending on which alternatives are available.

**Correct approach — enumerate eligible options and pick uniformly:**

```ts
case 'form_recall': {
  const options: Array<() => ExerciseItem> = [() => makeTypedRecall(item, meanings, contexts, variants)]
  if (hasAnchorContext) options.push(() => makeClozeExercise(item, meanings, contexts, variants))
  if (canListen) options.push(() => makeDictation(item, meanings, contexts, variants))
  return [options[Math.floor(Math.random() * options.length)]()]
}
```

Resulting distribution (verified by enumeration):

| Item has | Distribution |
|---|---|
| Cloze context + audio | 33% cloze / 33% dictation / 33% typed_recall |
| Audio only | 50% dictation / 50% typed_recall |
| Cloze context only | 50% cloze / 50% typed_recall |
| Neither | 100% typed_recall |

**Why this formulation, not sequential `if … return` with `Math.random() < 0.33`**: the sequential-guard formulation from an earlier draft of this spec (`if (hasAnchorContext && Math.random() < 0.33) return cloze; if (canListen && Math.random() < 0.33) return dictation; return typed`) rolls independently in each branch, producing ~33% cloze / ~22% dictation / ~45% typed when both are eligible — not the intended 33/33/33. The `options[]` formulation above rolls once over a uniform distribution, yielding the correct balance.

## Skill tracking

### Decision: reuse `form_recall` skill

Same reasoning as Spec 3's reuse of `recognition`: dictation produces FSRS signals indistinguishable in purpose from `typed_recall`'s — "the learner can produce the Indonesian form." Splitting into `audio_form_recall` would double per-item skill rows and complicate FSRS scheduling without a clear downstream benefit at beginner scale.

Reversibility is preserved: if later evidence shows audio-only form recall doesn't transfer to visual-cued form recall, a future spec can split. Starting unified is the reversible default.

### Consequence for FSRS

- Dictation correct answer: increments `form_recall` skill's `success_count`, grows stability, pushes `next_due_at` per FSRS.
- Dictation wrong answer: increments `failure_count`, triggers demotion checks.
- Fuzzy match: treated as correct (same as `typed_recall` today), with `isFuzzy: true` logged for analytics but not affecting the FSRS update path.
- No changes to `reviewHandler.ts` beyond mapping `dictation` → `form_recall` skill in its exercise-to-skill lookup table.

## Stage-rotation integration

Concrete code changes in `sessionQueue.ts selectExercises`:

### `retrieving` (word) — current code at lines 437–446

Current branches for word items with a cloze context (`hasAnchorContext`):
```
roll < 0.40 → cloze_mcq
roll < 0.65 → meaning_recall
roll < 0.82 → cloze (if hasAnchorContext)
else → typed_recall
```

Proposed change: within the `else → typed_recall` branch (final ~18%), split 50/50 with `dictation` when `canListen`:
```
else {  // roll >= 0.82
  exercises.push(canListen && Math.random() < 0.5
    ? makeDictation(item, meanings, contexts, variants)
    : makeTypedRecall(item, meanings, contexts, variants))
}
```

### `productive`/`maintenance` (word, no published variant) — current code at lines 466–477

Current leading branch: `roll < 0.35 → typed_recall` (35%).

Proposed change: within the typed_recall branch, split 50/50 with `dictation` when `canListen`:
```
if (roll < 0.35) {
  exercises.push(canListen && Math.random() < 0.5
    ? makeDictation(item, meanings, contexts, variants)
    : makeTypedRecall(item, meanings, contexts, variants))
}
```

This preserves the 35% form-recall-typed budget while delivering ~17% dictation when the item has audio.

### Spec 3 interaction

Spec 3 proposes substituting within the `recognition_mcq` tail slice at line 475 for `listening_mcq`. Spec 4 substitutes within the `typed_recall` slice at line 469. The two substitutions are orthogonal — they target different slices and different skill facets, so they compose cleanly.

## Feature flag and user setting

### Feature flag

Add to `src/lib/featureFlags.ts`:
```ts
dictation: parseEnvFlag('VITE_FEATURE_DICTATION'),
```

And to `isExerciseTypeEnabled`:
```ts
case 'dictation':
  return featureFlags.dictation
```

**Classification**: `dictation` is an **optional** exercise type (same category as `listening_mcq`, `cued_recall`, `contrast_pair`, etc.). Not a core type — requires audio infrastructure and hearing ability, both legitimate per-deployment and per-user opt-out reasons.

Default: true. To disable: `VITE_FEATURE_DICTATION=false`.

### User setting

**Reuses `listening_enabled`** from Spec 3. No new toggle needed. Rationale:
- Both `listening_mcq` and `dictation` are audio-prompt exercises; a learner who can't hear has the same opt-out reason for both.
- A single toggle (labeled "Luisteroefeningen inschakelen" / "Enable listening exercises") covers all audio-prompt exercises.
- Settings page UI copy can clarify: "Enable listening and dictation exercises. Disable if you can't hear audio or prefer text-only practice."

If a future learner wants one but not the other (e.g. hearing-fine but struggles with typing accuracy), they can split via `VITE_FEATURE_DICTATION=false` at deployment level. A per-user split is not worth the UI complexity now.

## Types

Add to `src/types/learning.ts`:
```ts
// Add to exerciseType union
exerciseType: ... | 'dictation'
```

No nested `dictationData` payload field. Dictation uses `learningItem.base_text` and `answerVariants` for grading — same fields as `typed_recall`. A nested type would be gratuitous.

## Accessibility

Largely inherits from Spec 3's considerations:

- **Autoplay-blocked on mobile**: same tap-to-play overlay as `listening_mcq`. Block input submission until audio has played at least once (`hasPlayedOnce`).
- **Hearing opt-out**: via the shared `listening_enabled` setting.
- **Screen readers**: the instruction text is visible; the speaker icon has `aria-label`; the input has `aria-label="Dictation answer input"`. Post-answer reveal uses `aria-live="polite"`.
- **Keyboard-only input**: Enter submits, same as typed_recall. No mouse-only interactions.
- **Mobile keyboard**: `autocomplete="off"`, `autocapitalize="off"`, `autocorrect="off"`, `spellcheck={false}`. Matches `Cloze.tsx` pattern.

## Data Model Impact

No schema changes.

- `learning_items` — unchanged. Benefits from Spec 2's `pos` for distractor quality in other types, but dictation has no distractors, so POS is irrelevant here.
- `audio_clips` — unchanged. Dictation reads existing rows.
- `learner_skill_state` — unchanged. Dictation writes to the existing `form_recall` skill.
- `exercise_variants` — unchanged.
- `exercise_type_availability` — gains one row via seed script.

## Supabase Requirements

### Schema changes
- N/A — no new columns, tables, indexes, triggers, functions, or RLS policies.

### RLS policies
- N/A.

### Grants
- N/A.

### Seed data
- `INSERT INTO indonesian.exercise_type_availability` row for `dictation`. Details in Pipeline integration below.

### homelab-configs changes
- [ ] PostgREST: N/A
- [ ] Kong: N/A
- [ ] GoTrue: N/A
- [ ] Storage: N/A — `indonesian-tts` bucket already exists

### Health check additions
- `scripts/check-supabase-deep.ts`: verify `exercise_type_availability` row exists for `dictation` with expected flags. The Spec 3 health-check addition covering audio coverage (count of word/phrase items lacking audio clips) applies equally here — no separate check needed.

## Tests

### Files touched

| Path | Status | Purpose |
|---|---|---|
| `src/__tests__/dictationExercise.test.tsx` | New | Component render, answer flow (correct, wrong, fuzzy), missing-audio error state, autoplay behaviors |
| `src/__tests__/sessionQueue.test.ts` | Extend | `makeDictation` structural test; selectExercises gating (feature flag, user setting, audio presence, item_type, stage) |
| `src/__tests__/featureFlags.test.ts` | Extend (new from Spec 3) | `isExerciseTypeEnabled('dictation')` respects `VITE_FEATURE_DICTATION` |

### Unit / component tests

`dictationExercise.test.tsx`:
- **Renders without Indonesian text visible** — query for `base_text` returns null before answering.
- **Correct typed answer** — user types `base_text` exactly, Enter submits, `onAnswer(true, false, ..., base_text)`.
- **Fuzzy match** — user types a single-character typo of `base_text`, `onAnswer(true, true, ..., response)`. Levenshtein 1.
- **Punctuation-insensitive match** — target is `"Apa kabar?"`, user types `"apa kabar"` (no capital, no `?`), treated as correct (non-fuzzy). Proves the existing `normalizeAnswer` path covers this case for dictation.
- **Wrong answer** — user types a distant string, `onAnswer(false, false, ..., response)`, feedback screen shows correct form.
- **Missing audio** — `audioMap` lacks the target, error state rendered, input disabled.
- **Autoplay-blocked fallback** — mock `HTMLAudioElement.play` to reject, assert "Tap to play" overlay, input disabled until played.
- **Autoplay-succeeds path** — mock `play` to resolve, assert no overlay, input focused, `hasPlayedOnce` true.
- **Empty-submit prevention** — pressing Enter with empty input does not call `onAnswer`.
- **Input attributes** — `autocorrect=off`, `autocapitalize=off`, `spellcheck=false` present on the input element.

### Session-queue tests

`sessionQueue.test.ts` additions:
- **Feature flag off** — `VITE_FEATURE_DICTATION=false` → `makeDictation` never scheduled, falls through to `typed_recall`.
- **User setting off** — `listening_enabled=false` → same.
- **No audio** — `audioMap` missing target → falls through to `typed_recall`.
- **Sentence item** — `item_type === 'sentence'` → never gets dictation.
- **New / anchoring stage** — never gets dictation.
- **Due form_recall skill** — with audio + cloze context, the 3-way random lands each option at least once across 30 trials (stochastic smoke).

### Integration

One scenario in `sessionFlow.test.tsx`: an item at `retrieving` stage with known audio is served as `dictation` when the stage-rotation roll falls in the dictation slice. Verifies prop threading end-to-end.

## Rollout

1. **Types + feature flag** — `'dictation'` added to exerciseType union; `featureFlags.dictation`.
2. **Seed data** — `exercise_type_availability` row.
3. **Builder** — `makeDictation` in `sessionQueue.ts`. Dead code until selection uses it.
4. **Component** — `Dictation.tsx` + `ExerciseShell` dispatch.
5. **Selection logic** — stage-rotation branches + gating + due-skill three-way branch. Behavior-changing step.
6. **Health check + tests** — alongside each step.

Dependency on Spec 3: `hasAudioFor` helper and the `audioMap` / `voiceId` threading into `selectExercises`. If Spec 3 has not landed, Spec 4 implementation can ship the helper and threading itself (effectively pulling that subset of Spec 3 forward). Cleaner: land Spec 3 first, then Spec 4.

Revertibility: step 5 is the only behavior-changing commit. Revert it to disable dictation while retaining the builder and component.

## Decision log

### Rejected: new `audio_form_recall` skill type

Same reasoning as Spec 3's `listening_recognition` rejection. Splitting would double per-item skill rows without clear scheduling benefit at beginner scale. Reversible later.

### Rejected: meaning cue during prompt

Oller (1979) identifies dictation's efficacy as simultaneous phonological decoding + lexical access + orthographic encoding. Adding a translation shown during the question phase short-circuits the lexical-access step — the learner knows the answer's meaning before they decode the sound. That dilutes the exercise's distinctive value. Post-answer, both form and meaning are shown for dual-coding reinforcement.

### Rejected: word-bank scaffolding

Per Laufer & Rozovski-Roitblat (2015) and the earlier research in memory `research_audio_sla.md` §8: free text produces ~150% better long-term retention than passive exposure; word banks are effective scaffolding but underperform for retention beyond early stages. Duolingo's own pattern (word bank → free text progression) supports starting at free text given Indonesian's orthographic transparency (Winskel & Widjaja 2007). Learners who need scaffolding can still replay audio unlimited times.

### Rejected: "Show hint" button

Bjork (1994) desirable difficulty. Hints reduce effort, which reduces retention. First release is no-hint; revisit post-launch if mobile-UX data suggests otherwise.

### Rejected: sentence-type dictation in v1

Sentence dictation has three compounding problems: (a) cognitive load of holding a 10-word Indonesian sentence in working memory while typing, (b) typing-speed bottleneck increasing time-per-item, (c) cascading errors (one misheard word propagates). A scaffolded sentence-level exercise (dictogloss, sentence reconstruction) deserves its own spec.

### Accepted: reuse `listening_enabled` user setting

Both `listening_mcq` and `dictation` require the same cognitive capability (auditory perception). A single user toggle covers the legitimate opt-out cases. If later data suggests learners want one without the other, adding a per-type setting is cheap.

### Accepted: stage gate at retrieving (form_recall-ready)

`retrieving` is the first stage where `form_recall` is on the menu per the existing architecture (stages.ts). Dictation is a form_recall exercise, so gating at retrieving aligns with the FSRS + stage progression design. `anchoring → retrieving` promotion requires at least one successful `meaning_recall` review, meaning the learner has already decoded the form-meaning link receptively before being asked to produce via dictation — matches Mondria & Wiersma (2004) receptive-before-productive ordering.

## Open questions

1. **Post-launch hint UX**: if telemetry shows high abandon rates on dictation, a "Show hint" button (first letter reveal after N replays or T seconds) is the first escalation. Defer until data warrants.
2. **Stricter-than-typed_recall fuzzy policy post-launch**: the "Fuzzy-match concern" section in the Grading block flags that dictation's lack of meaning cue allows fuzzy-correct responses to silently teach wrong forms when the fuzzy variant is itself a real Indonesian word (e.g. `tahu` → `tahun`). First release mitigates via side-by-side post-answer reveal. If telemetry shows this happening often enough to matter, a stricter policy — reject fuzzy when both forms are real Indonesian words, requiring a dictionary — is the next escalation. Defer until data warrants; the dictionary dependency is non-trivial and may not pay off.
3. **Substitution-based minimal-pair confusion is NOT a concern for dictation grading.** `checkAnswer` already rejects substitutions (e.g. `makan` vs `makal`, `membeli` vs `memberi`) regardless of exercise type, so the classic Indonesian minimal-pair confusions surface as wrong answers, not silent fuzzy matches. This is worth noting explicitly because an earlier draft of this spec incorrectly framed substitution confusions as an open concern; they are in fact already handled correctly.

## References

- Elgort (2011), *Language Learning* — productive tasks (incl. dictation) create stronger lexical representations.
- Bjork (1994) — desirable difficulty; effortful retrieval predicts long-term retention.
- Kiany & Shiramiry (2002), *TESOL Quarterly* — dictation improved spelling + listening comprehension.
- Oller (1979) — dictation as integrated phonological/lexical/orthographic task.
- Laufer & Rozovski-Roitblat (2015), *Language Teaching Research* — retrieval practice outperforms passive exposure by ~150%.
- Mondria & Wiersma (2004), *Studies in Second Language Acquisition* — receptive-first then productive ordering outperforms reverse.
- Winskel & Widjaja (2007), *Applied Psycholinguistics* — Indonesian orthographic transparency reduces spelling-error concerns.
- Memory `research_audio_sla.md` §4 and §8 — prior research syntheses.
- Spec 3 (`docs/plans/2026-04-17-listening-mcq-design.md`) — shares audio-gating infrastructure, `listening_enabled` setting, autoplay override policy.
- `docs/plans/2026-04-16-exercise-audio-design.md` — origin of the `audio_clips` infrastructure this spec depends on.

---

## Pipeline integration

Same structure as Spec 3 — dictation depends on audio, which depends on a manual post-publish script. No new content authoring.

### Audio-generation prerequisite

`generate-exercise-audio.ts` must have run for a lesson before dictation surfaces for that lesson's items. Same operator workflow as Spec 3:

```
bun scripts/publish-approved-content.ts 9
bun scripts/generate-exercise-audio.ts 9
```

The health check from Spec 3 (count of word/phrase items lacking audio clips) covers dictation as well — no additional check needed.

### `publish-approved-content.ts` report

Spec 3 adds a post-publish audio-coverage report ("0/142 items with audio → run generate-exercise-audio.ts 9"). The same report covers dictation. No additional reporting for Spec 4.

### `exercise_type_availability` seed row

Append to `scripts/migration.sql` after the Spec 3 seed row (so Specs 3 and 4 land in one migration commit if deployed together; separate commits work too given the `ON CONFLICT DO NOTHING` idempotency).

**Verified**: `exercise_type` is PRIMARY KEY at `scripts/migration.sql:803–804`, so `ON CONFLICT (exercise_type) DO NOTHING` is valid.

```sql
INSERT INTO indonesian.exercise_type_availability
  (exercise_type, session_enabled, authoring_enabled, requires_approved_content, rollout_phase, notes)
VALUES
  ('dictation', true, false, false, 'alpha',
   'Audio-only Indonesian prompt, typed Indonesian answer. Runtime-built. Free text with fuzzy grading.')
ON CONFLICT (exercise_type) DO NOTHING;
```

### `linguist-reviewer` changes

None. No authored variants.

### `content-seeder` failure mapping

None. Runtime-only type.

### CLAUDE.md documentation update

Add to the "Content Management" section:
- Update the exercise-type inventory (if present) to list `dictation` with its audio dependency.
- Update the feature-flag summary to include `VITE_FEATURE_DICTATION`.
- The Spec 3 note about running `generate-exercise-audio.ts` post-publish covers dictation; no additional operator step.

### Feature-flag default rollout

Default `VITE_FEATURE_DICTATION=true` per convention. Cautious rollout: deploy with `VITE_FEATURE_DICTATION=false`, verify audio coverage, then enable.
