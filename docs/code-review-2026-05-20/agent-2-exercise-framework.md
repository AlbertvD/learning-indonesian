# Agent 2: Exercise framework

**Date:** 2026-05-20
**Files reviewed:** 56

## Files reviewed

- `src/lib/exercises/` — `exerciseResolver.ts`, `exerciseRenderPlan.ts`, `resolutionReasons.ts`, `builders/index.ts`, `builders/types.ts`, `builders/helpers.ts`, 12 per-type builders + `__tests__/builders.test.ts`
- `src/lib/answers/` — `normalizeAnswerResponse.ts` + colocated test
- `src/lib/answerNormalization.ts`, `src/lib/useExerciseScoring.ts`, `src/lib/ttsNormalize.ts`
- `src/components/exercises/primitives/` — barrel + 13 primitives + CSS + context.ts + haptics.ts + global.css
- `src/components/exercises/implementations/` — 12 thin wrappers
- `src/components/exercises/` top-level — 8 legacy `.tsx` components (RecognitionMCQ, ContrastPairExercise, ClozeMcq, ListeningMCQ, Dictation, SentenceTransformationExercise, ConstrainedTranslationExercise, SpeakingExercise, FlagButton), plus `ExerciseErrorBoundary`, `ExerciseSkeleton`, `feedbackMapping.ts`, `registry.ts`
- `src/__tests__/` exercise-related: `mcqWrongAnswer.test.tsx`, `dictationExercise.test.tsx`, `listeningMcqExercise.test.tsx`, `speakingExercise.test.tsx`, `useExerciseScoring.test.ts`, `answerNormalization.test.ts`
- `src/pages/ContentReview.tsx` (consumer of legacy components — checked for context only)
- `src/components/experience/ExperiencePlayer.tsx` (consumer of `ExerciseFeedback` + registry — checked for context only)

## Findings

### F2-1: Legacy top-level `src/components/exercises/*.tsx` runtime components are dead code paths kept alive only by tests + admin preview

- **Severity:** cleanup
- **Category:** half-finished-migration
- **Evidence:**
  - `src/components/exercises/RecognitionMCQ.tsx:19-137` — full self-contained 138-line `RecognitionMCQ` that calls `onAnswer(wasCorrect, latencyMs)` directly (no `ExerciseAnswerReport`, no `useExerciseScoring`, no primitives, draws via `<Box><Stack>` + `RecognitionMCQ.module.css`).
  - `src/components/exercises/ClozeMcq.tsx:20-208`, `ContrastPairExercise.tsx:20-195`, `ListeningMCQ.tsx:18-173`, `Dictation.tsx:17-199`, `SentenceTransformationExercise.tsx:24-211`, `ConstrainedTranslationExercise.tsx:20-340`, `SpeakingExercise.tsx:15-62` — all parallel duplicates of the live `implementations/` files.
  - Production runtime never imports them (no `from '@/components/exercises/RecognitionMCQ'` outside `__tests__/` and `src/pages/ContentReview.tsx`). `Session.tsx` → `ExperiencePlayer` → `CapabilityExerciseFrame` → registry → `implementations/`.
  - `src/pages/ContentReview.tsx:20-23,145-151` imports only 4 of them (ContrastPair, ClozeMcq, SentenceTransformation, ConstrainedTranslation), and only uses the `previewMode={true}` branch with `onAnswer={(() => {}) as any}` — confirms the live `handleSelectOption`/`handleSubmit` code paths in these files never execute in production.
  - 4 legacy components (`RecognitionMCQ.tsx`, `ListeningMCQ.tsx`, `Dictation.tsx`, `SpeakingExercise.tsx`) have NO production references whatsoever; their entire ~590-line live-mode logic exists solely to satisfy `mcqWrongAnswer.test.tsx`, `listeningMcqExercise.test.tsx`, `dictationExercise.test.tsx`, `speakingExercise.test.tsx`.
- **Recommendation:** Delete the live-mode branches of all 8 legacy files. Either (a) extract a tiny `<ExercisePreview>` component that ContentReview renders for the 4 preview-only types, or (b) move the `previewMode` JSX into `ContentReview.tsx` directly and delete the 4 unreferenced legacy files. Migrate the four legacy tests to target `src/components/exercises/implementations/*`.
- **Estimated effort:** medium
- **Cross-slice dependency:** Agent 4 (pages — ContentReview)

### F2-2: Dead top-level `src/components/exercises/FlagButton.tsx` (143 lines) duplicates `primitives/FlagButton.tsx`

- **Severity:** cleanup
- **Category:** dead-code
- **Evidence:**
  - `src/components/exercises/FlagButton.tsx:28-141` — full FlagButton implementation with SegmentedControl chips and old API.
  - `src/components/exercises/primitives/FlagButton.tsx:30-190` — refreshed FlagButton (Drawer/Popover, comment-only) referenced via `src/components/exercises/primitives/index.ts:47-48`.
  - No imports of `from '@/components/exercises/FlagButton'` anywhere in `src/` (confirmed by grep).
- **Recommendation:** Delete `src/components/exercises/FlagButton.tsx` and the now-unused `FlagButton.module.css` if no other consumers exist.
- **Estimated effort:** trivial
- **Cross-slice dependency:** null

### F2-3: Spec drift — `registry.ts` references retired `ExerciseShell` repeatedly; no `ExerciseShell.tsx` exists

- **Severity:** cleanup
- **Category:** spec-drift
- **Evidence:**
  - `src/components/exercises/registry.ts:3` — "ExerciseShell falls through to its legacy switch for unmapped types."
  - `src/components/exercises/registry.ts:14` — "ExerciseShell translates this into a processReview(...) call".
  - `src/components/exercises/registry.ts:31` — "Shell reads `outcome.skipped`".
  - `src/components/exercises/registry.ts:59` — "While `undefined`, ExerciseShell falls back to its legacy switch".
  - `src/components/exercises/registry.ts:101` — "Caller (ExerciseShell) falls back to legacy switch when null."
  - `find /Users/albert/home/learning-indonesian -name "ExerciseShell*"` returns nothing. The shell was retired; the comment about a fallback is stale — `resolveExerciseComponent` is now consumed by `CapabilityExerciseFrame` at `src/components/experience/CapabilityExerciseFrame.tsx:71-78` which has no legacy switch.
  - Similarly `src/components/exercises/primitives/FlagButton.tsx:7-8` ("Wired into ExerciseShell in PR #6") and `src/components/exercises/primitives/ExerciseFeedback.tsx:2-3` ("Replaces the legacy ExerciseShell.tsx feedback block") and `src/lib/answers/normalizeAnswerResponse.ts:4-5` ("Lifted from ExerciseShell.tsx:116").
- **Recommendation:** Sweep the comments and update to reference `ExperiencePlayer` / `CapabilityExerciseFrame`. Replace the "while `undefined`, ExerciseShell falls back" sentence with "registry is exhaustive over `ExerciseType`; consumers can assume non-null". (Actually `exerciseRegistry` is typed as `Partial<…>` but all 12 entries are populated.)
- **Estimated effort:** trivial
- **Cross-slice dependency:** null

### F2-4: `ExerciseAnswerReport` translation is duplicated verbatim in 11 implementations

- **Severity:** cleanup
- **Category:** duplication
- **Evidence:** Identical 6-line block in every implementation, e.g.
  - `src/components/exercises/implementations/RecognitionMCQ.tsx:49-56`
  - `src/components/exercises/implementations/Cloze.tsx:33-40`
  - `src/components/exercises/implementations/ClozeMcq.tsx:29-37`
  - `src/components/exercises/implementations/ContrastPairExercise.tsx:32-39`
  - `src/components/exercises/implementations/Dictation.tsx:40-47`
  - …same block in CuedRecallExercise.tsx, MeaningRecall.tsx, ListeningMCQ.tsx, TypedRecall.tsx, SentenceTransformationExercise.tsx, ConstrainedTranslationExercise.tsx (11 total).
- **Recommendation:** Add a helper `toAnswerReport(result: AnswerResult<string>): ExerciseAnswerReport` next to `useExerciseScoring`. Each impl shrinks to `onAnswer: r => parentOnAnswer(toAnswerReport(r))`, or expose a `useExerciseScoring` overload that takes a parent `(report: ExerciseAnswerReport) => void` and synthesises the translation internally.
- **Estimated effort:** trivial
- **Cross-slice dependency:** null

### F2-5: `pickUserLangMeaning` already exists as a builder helper but components re-implement it inline (4 sites)

- **Severity:** cleanup
- **Category:** duplication
- **Evidence:**
  - Helper: `src/lib/exercises/builders/helpers.ts:10-19` — exact `find(primary) ?? find(any) ?? null` pattern.
  - Component duplicates of the same expression:
    - `src/components/exercises/implementations/RecognitionMCQ.tsx:31-32`
    - `src/components/exercises/implementations/ListeningMCQ.tsx:26-27`
    - `src/components/exercises/implementations/TypedRecall.tsx:23-24`
    - `src/components/exercises/implementations/MeaningRecall.tsx:28-29` (uses `filter` variant, same intent)
  - Also feedbackMapping at `src/components/exercises/feedbackMapping.ts:43-44`.
- **Recommendation:** Promote `pickUserLangMeaning` to a shared module (e.g. `src/lib/exercises/meanings.ts`) and import from both builders and components. Keeps builder/component parity for "primary meaning" resolution.
- **Estimated effort:** trivial
- **Cross-slice dependency:** null

### F2-6: Inline cloze blank rendering duplicated across 3 implementations (no `ExercisePromptCard` variant covers it)

- **Severity:** cleanup
- **Category:** duplication
- **Evidence:**
  - `src/components/exercises/implementations/Cloze.tsx:51-66` — `<span style={{ lineHeight: 1.6 }}>{parts[0]}<ExerciseTextInput inline …>{parts[1] ?? ''}</span>`.
  - `src/components/exercises/implementations/ConstrainedTranslationExercise.tsx:67-82` — identical wrapping `<span style={{ lineHeight: 1.6 }}>` around `parts[0] + ExerciseTextInput inline + parts[1]`.
  - `src/components/exercises/implementations/ClozeMcq.tsx:48-60` — same `<span style={{ lineHeight: 1.6 }}>…<span style={{ display: 'inline-block', minWidth: '4ch', borderBottom: '2px solid var(--accent-primary)', margin: '0 4px', textAlign: 'center' }}>{blankText}</span>…</span>` for the underline pseudo-blank.
- **Recommendation:** Add an `ExerciseClozeSentence` primitive (or `<ExercisePromptCard variant="cloze">` with `sentence` + `blank` slots) that owns the inline-block underline + lineHeight styling. Eliminates inline `style={{…}}` from three implementations and makes the visual stable across cloze, cloze_mcq, and constrained_translation cloze-mode.
- **Estimated effort:** small
- **Cross-slice dependency:** null

### F2-7: Disallowed-shortcut guard logic lives in both legacy and new ConstrainedTranslation; only `feedbackMapping` would handle a future move

- **Severity:** cleanup
- **Category:** duplication
- **Evidence:**
  - `src/components/exercises/ConstrainedTranslationExercise.tsx:153-161` — `if (isCorrect && data.disallowedShortcutForms) { …for (const shortcut of …) if (normalized === shortcut.toLowerCase()) { isCorrect = false; break } }`.
  - `src/components/exercises/implementations/ConstrainedTranslationExercise.tsx:38-45` — same guard, slightly reworked: `if (r.isCorrect && !isClozeMode && disallowed.length > 0) { …if (disallowed.some(s => normalized === s.toLowerCase())) return { isCorrect: false, isFuzzy: false } }`.
  - Both shells re-implement the same Indonesian-language pedagogy rule. Wrong-form acceptance behaviour will diverge if one is updated without the other (the legacy variant runs the guard for cloze mode too — line 153 doesn't check `isClozeMode`; the new variant explicitly excludes cloze).
- **Recommendation:** Extract `applyShortcutGuard(response, baseResult, disallowed, { skipForCloze })` next to `checkAnswer` in `src/lib/answerNormalization.ts`. Both shells call it; remove the inline branches. Pick the new-impl semantics (skip in cloze) as the truth.
- **Estimated effort:** small
- **Cross-slice dependency:** null

### F2-8: `Record<string, any>` previewPayload + `as any` cast on `onAnswer` for the 4 ContentReview-preview exercises

- **Severity:** cleanup
- **Category:** type-hole
- **Evidence:**
  - `src/components/exercises/ClozeMcq.tsx:17` — `previewPayload?: Record<string, any>`.
  - `src/components/exercises/ContrastPairExercise.tsx:17` — same.
  - `src/components/exercises/SentenceTransformationExercise.tsx:21` — same.
  - `src/components/exercises/ConstrainedTranslationExercise.tsx:17` — same.
  - `src/pages/ContentReview.tsx:145,147,149,151` — `onAnswer={(() => {}) as any}` casts to silence the (correct, narrower) onAnswer signature.
  - The 4 preview-mode JSX bodies then do `p.options as string[]`, `p.acceptableAnswers as string[]`, etc., which loses every guarantee from `ContentUnit.payload_json`.
- **Recommendation:** Bundle this with F2-1's resolution. If the preview JSX moves into ContentReview or a dedicated `<ExercisePreview>`, type the preview-payload with a discriminated union keyed on `exerciseType` derived from `capabilities`/`content-units` types — kills four `Record<string, any>` declarations and four `as any` callsites.
- **Estimated effort:** small
- **Cross-slice dependency:** Agent 4 (pages — ContentReview)

### F2-9: `previewPayload as any` casts inside `payload_json` access in the 4 legacy components are unsafe

- **Severity:** cleanup
- **Category:** type-hole
- **Evidence:**
  - `src/components/exercises/ClozeMcq.tsx:31-33` — `const p = previewPayload; const options = p.options as string[]; const parts = (p.sentence as string).split('___')`.
  - `src/components/exercises/ConstrainedTranslationExercise.tsx:51-52,94` — `(p.targetSentenceWithBlank as string).split('___')`, `(p.blankAcceptableAnswers as string[])`, `(p.acceptableAnswers as string[])`.
  - `src/components/exercises/SentenceTransformationExercise.tsx:47-48` — `(p.acceptableAnswers as string[])`.
  - `src/components/exercises/ContrastPairExercise.tsx:31` — `(p.options as { id: string; text: string }[])`.
  - All silently lie about runtime shape: nothing validates that the admin-supplied payload has these fields.
- **Recommendation:** Either narrow to the actual builder-output shapes (`exerciseItem.constrainedTranslationData`, etc.) so the preview consumes the same `ExerciseItem` the runtime would build — or define and validate a `PreviewPayloadFor<T extends ExerciseType>` discriminated union. Drop the casts.
- **Estimated effort:** small
- **Cross-slice dependency:** Agent 4 (pages — ContentReview)

### F2-10: `ExercisePromptCard` `pair` variant is dead — declared but no consumer

- **Severity:** cleanup
- **Category:** dead-code
- **Evidence:**
  - `src/components/exercises/primitives/ExercisePromptCard.tsx:9` — `export type PromptCardVariant = 'word' | 'sentence' | 'audio' | 'transform' | 'pair'`.
  - `src/components/exercises/primitives/ExercisePromptCard.tsx:65` — `case 'pair': return 'Contrasterend paar'`.
  - `grep -rn "variant=\"pair\"" src/` returns nothing.
  - `ContrastPairExercise` (the natural consumer) uses `<ExercisePromptCard variant="sentence">` (`src/components/exercises/implementations/ContrastPairExercise.tsx:57`).
- **Recommendation:** Either wire ContrastPairExercise to the `pair` variant (preferred — it's the reason it was added) or remove the variant + its CSS rules in `ExercisePromptCard.module.css`. Don't leave a dead branch in the discriminator.
- **Estimated effort:** trivial
- **Cross-slice dependency:** null

### F2-11: `ExerciseHint` primitive used by exactly one implementation — possibly premature abstraction

- **Severity:** nice-to-have
- **Category:** dead-code
- **Evidence:**
  - `src/components/exercises/primitives/ExerciseHint.tsx:1-31` — primitive component.
  - Sole consumer: `src/components/exercises/implementations/SentenceTransformationExercise.tsx:80-84`.
  - Not used by `ConstrainedTranslationExercise.tsx`, `Cloze.tsx`, or any other typed exercise (the legacy SentenceTransformation also inlines a hint at `src/components/exercises/SentenceTransformationExercise.tsx:147-151` rather than reaching for the primitive).
- **Recommendation:** Either fold the hint markup back into SentenceTransformationExercise (keep as inline `<div>` w/ a CSS class) or onboard ConstrainedTranslation and the cloze flows to share the primitive — pick a direction.
- **Estimated effort:** trivial
- **Cross-slice dependency:** null

### F2-12: `LanguagePill` primitive consumed only by `ExerciseFeedback`

- **Severity:** nice-to-have
- **Category:** dead-code
- **Evidence:**
  - Sole non-feedback callsite check: `grep -rn "LanguagePill" src/` returns only definitions in `primitives/LanguagePill.tsx`, barrel re-export in `primitives/index.ts:29-30`, and three usages inside `primitives/ExerciseFeedback.tsx:187,209,218`.
- **Recommendation:** Either inline the pill into `ExerciseFeedback.tsx` (it's 18 lines), or actually expose it on the prompt cards (`promptShown.lang` chip would make the prompt direction visible during the exercise, not just after).
- **Estimated effort:** trivial
- **Cross-slice dependency:** null

### F2-13: No exercise-framework module spec under `docs/current-system/modules/`

- **Severity:** cleanup
- **Category:** spec-drift
- **Evidence:**
  - `ls docs/current-system/modules/` shows `capabilities.md`, `experience.md`, `lesson-renderer.md`, `session-builder.md` — no `exercise-framework.md` or `exercise-primitives.md`.
  - CLAUDE.md "Module specs" rule requires one for any non-trivial folder under `src/components/` that owns a coherent surface, and explicitly names `exercises/primitives/` as one of the UI deep modules requiring a spec.
  - 13 primitives + 12 implementations + 12 builders + scoring hook = clearly above the threshold.
- **Recommendation:** Write `docs/current-system/modules/exercise-framework.md` covering the primitives → registry → implementations → useExerciseScoring → feedbackMapping → ExperiencePlayer seam. Use `lesson-renderer.md` as the template. Cite the registry, useExerciseScoring reducer phases, and feedbackMapping dispatch table.
- **Estimated effort:** medium
- **Cross-slice dependency:** null

### F2-14: Primitives have zero unit tests; `useExerciseScoring` is the only `lib/exercises` runtime piece with coverage

- **Severity:** cleanup
- **Category:** test-gap
- **Evidence:**
  - `find src/components -name "*.test.*"` returns only experience-module tests (`feedbackCopy.test.ts`, `buildFeedbackInput.test.ts`).
  - No tests for `ExerciseFeedback` (300-line component with role-derivation, fuzzy diff-pair, focus-after-400ms logic), `ExerciseFrame`, `ExerciseOption` (state matrix + glyph rendering), `ExercisePromptCard` (5 variants + reveal slot), `ExerciseAudioButton` (autoplay-blocked / replay state machine), `FlagButton`, `ExerciseTextInput` (inline + hintedAnswerLength width).
  - No tests under `src/components/exercises/implementations/` either. The only existing tests in `src/__tests__/*Exercise.test.tsx` target the LEGACY top-level files (see F2-1) — they verify code that doesn't run in production.
  - `src/__tests__/useExerciseScoring.test.ts` covers the hook (good — 8 specs covering tap, typed, retry, gate, analytics, lifecycle).
- **Recommendation:** Add primitive-level unit tests for `ExerciseFeedback` (role × direction matrix, fuzzy diff-pair, commitFailed banner, focus-delay), `ExerciseFrame` (footer slot symbol enforcement), `ExerciseOption` (state → disabled/glyph), and `ExerciseAudioButton` (autoplay-blocked path). Migrate the legacy `__tests__/*Exercise.test.tsx` files to target `implementations/*` so they cover the live code.
- **Estimated effort:** medium
- **Cross-slice dependency:** null

### F2-15: `Cloze.tsx` shows raw red error text instead of an error notification — violates CLAUDE.md error-handling rule

- **Severity:** cleanup
- **Category:** error-handling
- **Evidence:**
  - `src/components/exercises/implementations/Cloze.tsx:44-46` — `if (!clozeContext) { return <div style={{ color: 'red' }}>Error: missing cloze context</div> }`.
  - `src/components/exercises/implementations/ClozeMcq.tsx:40-42`, `CuedRecallExercise.tsx:39-41`, `ContrastPairExercise.tsx:43-45`, `ConstrainedTranslationExercise.tsx:59-61`, `SentenceTransformationExercise.tsx:53-55`, `SpeakingExercise.tsx:23-25` — same pattern.
  - CLAUDE.md "Error Handling" section: "Never show raw error strings, Supabase error codes, or technical details to the user. … Every error the user can encounter must have a meaningful, user-friendly message."
  - These dead-end fallbacks should never trigger in production (the pipeline projector + builder guarantee non-null data), but if they do, the user sees a hard-coded English string that isn't even i18n'd; no `logError`, no `notifications.show`, no `ExerciseErrorBoundary` invocation (boundary catches throws, not returned strings).
- **Recommendation:** Throw an Error from these branches so `ExerciseErrorBoundary` catches them, logs via `logError`, fires `exercise_skipped`, and shows the friendly "Even overslaan / Let's skip this one" UI. Alternatively, render `<ExerciseErrorBoundary>`'s "skip" state inline and call `onAnswer({ skipped: true, reviewRecorded: false })`. Don't leave raw red-text divs.
- **Estimated effort:** trivial
- **Cross-slice dependency:** null

### F2-16: `useExerciseScoring` gate-polling effect runs on EVERY render (no dep array)

- **Severity:** cleanup
- **Category:** bug
- **Evidence:**
  - `src/lib/useExerciseScoring.ts:220-225`:
    ```ts
    useEffect(() => {
      if (!gate) return
      if (state.phase === 'gated' && gate()) {
        dispatch({ type: 'GATE_OPENED' })
      }
    })
    ```
  - No second argument to `useEffect` — fires after every render, intentionally per the comment "Gate polling — re-evaluate when phase or gate identity changes". That works for Dictation (gate = `hasPlayedRef.current` + `setHasPlayedTick` trigger), but the gate function is called on every render including when nothing relevant changed. Cheap for `hasPlayedRef.current` but a latent footgun: a future gate that does anything more expensive (e.g. checking a list, calling a service) will execute unbounded.
- **Recommendation:** Pass `[state.phase, gate]` as deps and document why both must be stable. Better, fold the gate into the reducer (`GATE_CHECK` action dispatched from a `useEffect` keyed on a `gateNonce` increment caller pushes).
- **Estimated effort:** trivial
- **Cross-slice dependency:** null

### F2-17: `ExerciseAudioButton` effect re-runs and re-attaches audio when `onPlay`/`onError` change identity

- **Severity:** cleanup
- **Category:** bug
- **Evidence:**
  - `src/components/exercises/primitives/ExerciseAudioButton.tsx:38-64` — `useEffect(…, [audioUrl, autoplay, onPlay, onError])`. Parents (e.g. `Dictation.tsx:88-92`) pass inline arrow functions for `onPlay`, which are a new reference every render. The effect tears down and re-creates the `Audio(audioUrl)` element on every parent render where the user has typed a character — for autoplay buttons this could re-trigger `audio.play()`.
  - The reproduction path: while the user is typing into the dictation input, `Dictation`'s parent re-renders, `<ExerciseAudioButton onPlay={() => { hasPlayedRef.current = true; setHasPlayedTick(n => n + 1) }}>` gets a new `onPlay` ref → effect cleanup → new Audio created → if `autoplay=true`, second `audio.play()` fires.
- **Recommendation:** Drop `onPlay` / `onError` from the dep array (move them through a ref like `useExerciseScoring` does for its callbacks), or memo the callbacks with `useCallback` on the parent side. The former is the local fix.
- **Estimated effort:** trivial
- **Cross-slice dependency:** null

### F2-18: `Math.random()` shuffle during render-via-`useState(initializer)` is not strictly impure but two tests rely on no-shuffle determinism

- **Severity:** nice-to-have
- **Category:** inconsistency
- **Evidence:**
  - `src/components/exercises/implementations/RecognitionMCQ.tsx:38-41` — `useState(() => { const all = [correctAnswer, …distractors].slice(0,4); return [...all].sort(() => Math.random() - 0.5) })`. Inline `Math.random` in sort comparator is biased and non-uniform.
  - `src/components/exercises/implementations/ListeningMCQ.tsx:30-33` — same pattern.
  - `src/lib/exercises/builders/helpers.ts:21-28` already provides a proper `shuffle()` using Fisher-Yates, used by builders like `CuedRecall.ts:46` and `ClozeMcq.ts:96`. The legacy top-level files `RecognitionMCQ.tsx:37`, `ContrastPairExercise.tsx` (via builder) and `ListeningMCQ.tsx:37` exhibit the same bias.
- **Recommendation:** Import `shuffle` (or extract to a shared module — see F2-5) and use it everywhere instead of `.sort(() => Math.random() - 0.5)`. Mantine/RTL tests that depend on order can mock `Math.random`.
- **Estimated effort:** trivial
- **Cross-slice dependency:** null

### F2-19: `ExerciseFeedback`'s `userText` fallback uses `copy.emptyAnswer` but feeds it into `strike` styling that compares to `correctAnswer.text`

- **Severity:** nice-to-have
- **Category:** bug
- **Evidence:**
  - `src/components/exercises/primitives/ExerciseFeedback.tsx:154` — `const userText = userAnswer?.text?.trim() || copy.emptyAnswer`.
  - `src/components/exercises/primitives/ExerciseFeedback.tsx:237-239` — `className={…${userAnswer && userAnswer.text !== correctAnswer.text ? classes.strike : ''}}`.
  - The strike-through is computed against `userAnswer.text`, but the displayed text falls back to `copy.emptyAnswer` ("Geen antwoord" / "No answer") when `userAnswer.text` is empty. If empty-answer ever fluke-equals the canonical answer (extremely unlikely for normal content but trivially constructible for explanation/edge content), the placeholder is rendered un-struck, which is fine; the opposite case is the bug — when the user typed a non-empty answer that's *empty after trim* (whitespace-only), `userText` falls back to `copy.emptyAnswer` but the strike rule still fires because `userAnswer.text !== correctAnswer.text`. Visually: the user sees a struck-through "Geen antwoord", which is confusing.
- **Recommendation:** Either skip the strike when falling back to `copy.emptyAnswer`, or compute the user-vs-correct comparison on the *trimmed* userAnswer text, not the raw text.
- **Estimated effort:** trivial
- **Cross-slice dependency:** null

### F2-20: `ExperiencePlayer` correct-answer auto-advance bypasses `ExerciseFeedback`; fuzzy answers go through feedback (matches CLAUDE.md rule)

- **Severity:** N/A (verification, not finding)
- **Category:** spec-drift (none — matches policy)
- **Evidence:**
  - `src/components/experience/ExperiencePlayer.tsx:120` — `const wasCorrect = report.wasCorrect && !report.isFuzzy`.
  - `src/components/experience/ExperiencePlayer.tsx:151-161` — `if (wasCorrect) { setCurrentIndex(i => i + 1) } else { setFeedback({ … outcome: report.isFuzzy ? 'fuzzy' : 'wrong', … }) }`.
  - `src/lib/useExerciseScoring.ts:286-290` — fuzzy "does NOT auto-advance (design decision: learner must see diff before proceeding)".
  - This is **correct** per CLAUDE.md "correct answers auto-advance (no feedback screen); wrong answers show a Doorgaan screen". The fuzzy classification as "wrong-shaped" for the purpose of feedback is a deliberate pedagogy choice and matches `useExerciseScoring`'s own design (the fuzzy diff-pair card in `ExerciseFeedback.tsx:204-224`).
- **Recommendation:** None — included to confirm policy compliance.
- **Estimated effort:** trivial
- **Cross-slice dependency:** Agent 3 (experience player)

### F2-21: `feedbackMapping.ts` `speaking` branch builds props for a path that is gated out — but commitFailed flag still flows

- **Severity:** nice-to-have
- **Category:** dead-code
- **Evidence:**
  - `src/components/exercises/feedbackMapping.ts:228-239` — `case 'speaking': return { outcome, layout: 'vocab-pair', direction: 'ID→ID', promptShown: { text: item.speakingData?.promptText ?? '', lang: 'ID', role: 'shown' }, … }`.
  - `src/components/exercises/implementations/SpeakingExercise.tsx:1-6` — comment confirms: "Speaking is gated out of session selection (sessionQueue.ts filters it before dispatch). … Never commits via onAnswer."
  - `sessionQueue.ts` was retired in #7 (CLAUDE.md says so) — the gate is now in builders / readiness. Either way, `feedbackMapping`'s speaking branch is unreachable: speaking never reaches `ExperiencePlayer`'s `setFeedback({…})` path because the live `SpeakingExercise` never calls `onAnswer`.
- **Recommendation:** Either delete the `case 'speaking'` branch and have `feedbackMapping` throw if invoked with speaking, or document this as forward-looking ASR-stub and add a unit test that exercises the branch. Today it's silently dead.
- **Estimated effort:** trivial
- **Cross-slice dependency:** null

### F2-22: Bilingual labels hard-coded into Dictation, ListeningMCQ, MeaningRecall — bypasses the `translations` i18n bundle

- **Severity:** nice-to-have
- **Category:** inconsistency
- **Evidence:**
  - `src/components/exercises/implementations/Dictation.tsx:57-59` — `{userLanguage === 'nl' ? 'Audio niet beschikbaar' : 'Audio not available'}`.
  - `src/components/exercises/implementations/Dictation.tsx:77-79` — `{userLanguage === 'nl' ? 'Luister en typ wat je hoort' : 'Listen and type what you hear'}`.
  - `src/components/exercises/implementations/Dictation.tsx:93` — `aria-label={userLanguage === 'nl' ? 'Speel audio af' : 'Play audio'}`.
  - `src/components/exercises/implementations/ListeningMCQ.tsx:61-63,70-72,82` — same pattern, three sites.
  - `src/components/exercises/implementations/MeaningRecall.tsx:69` — `'Wat betekent dit woord?'` vs `'What does this word mean?'`.
  - The rest of the codebase routes through `translations[userLanguage]` (`@/lib/i18n`) — e.g. RecognitionMCQ uses `t.session.recognition.question`.
- **Recommendation:** Add `t.session.dictation.*`, `t.session.listening.*`, `t.session.meaningRecall.*` keys and remove the inline ternaries. Aligns with the rest of the slice and keeps EN/NL parity in one place.
- **Estimated effort:** trivial
- **Cross-slice dependency:** Agent 5 (i18n / locales) if separate

### F2-23: `normalizeAnswerResponse` (lowercase+trim) and `normalizeAnswer` (full Unicode + strip + parens) diverge — risk of mismatched FSRS keys vs match decisions

- **Severity:** nice-to-have
- **Category:** inconsistency
- **Evidence:**
  - `src/lib/answers/normalizeAnswerResponse.ts:12-14` — `return rawResponse ? rawResponse.toLowerCase().trim() : null`. This is what's persisted in the review-event row.
  - `src/lib/answerNormalization.ts:10-17` — `normalizeAnswer` does case fold + strip parentheticals + strip punctuation + collapse whitespace + trim. This is what `checkAnswer` uses for match decisions.
  - Concretely: user types `"Hoe gaat het?"` for prompt `"apa kabar?"`. `checkAnswer` accepts it (matches "hoe gaat het" after punctuation strip). `normalizeAnswerResponse` stores `"hoe gaat het?"` (lowercase+trim only). Re-submitting `"hoe gaat het."` produces a different stored value but the same match decision — these strings diverge in fuzzy-attempt deduplication / spam-detection paths that key on the stored value.
- **Recommendation:** Either align the two normalisers (raw stays raw for display; the *match key* should use the same normalisation as `checkAnswer`), or document the design intent inline ("we store the lowercase form for display continuity but match using a stricter normaliser — these are intentionally different keys"). Cross-check the FSRS-write path in `services/answerService.ts` (out of slice) for what it stores.
- **Estimated effort:** small
- **Cross-slice dependency:** Agent 5 (services — answerService)

### F2-24: Inline-styled error/skeleton blocks bypass primitives (`ExerciseInstruction` / shimmer CSS)

- **Severity:** nice-to-have
- **Category:** architecture-violation
- **Subtype:** primitive-bypass
- **Evidence:**
  - `src/components/exercises/implementations/Cloze.tsx:44-46`, `ClozeMcq.tsx:40-42`, `ContrastPairExercise.tsx:43-45`, `CuedRecallExercise.tsx:39-41`, `ConstrainedTranslationExercise.tsx:59-61`, `SentenceTransformationExercise.tsx:53-55`, `SpeakingExercise.tsx:23-25` — all return `<div style={{ color: 'red' }}>Missing X data</div>`, ignoring `ExerciseFrame` / `ExerciseInstruction` / `ExercisePromptCard` entirely.
  - The skeleton primitive (`ExerciseSkeleton.tsx`) does the same with `<div className={classes.instructionShimmer}>` — a deliberate bypass to avoid the auto-focus side effect of `ExerciseInstruction` (`src/components/exercises/ExerciseSkeleton.tsx:30-43` documents the reason; that's fine, since `<ExerciseFrame variant="preview">` is doing the heavy lift).
- **Recommendation:** Same as F2-15 — route these through `ExerciseErrorBoundary` so the user sees the "Even overslaan" screen built from primitives, not a raw red div. Eliminates the inline-style bypass in 7 components.
- **Estimated effort:** trivial
- **Cross-slice dependency:** null

### F2-25: `useExerciseScoring.test.ts` has no test for `mode='tap' + allowRetry` interaction; reducer reads `allowRetry` for typed-submit only

- **Severity:** nice-to-have
- **Category:** test-gap
- **Evidence:**
  - `src/lib/useExerciseScoring.ts:293-294` — `const shouldRetry = allowRetry && nextFailures <= maxFailures && isTypedSubmit`. Tap-mode answers never enter the retry branch.
  - `src/__tests__/useExerciseScoring.test.ts:97-115` — only retry-on-typed-mode test. No assertion that tap-mode + `allowRetry: true` commits wrong on the first miss anyway. Today no implementation passes `allowRetry: true` for tap mode, but the contract should be locked down.
- **Recommendation:** Add a tap-mode + retry assertion ("`allowRetry` is ignored for `mode='tap'`") to pin behaviour.
- **Estimated effort:** trivial
- **Cross-slice dependency:** null

### F2-26: `audio.play()` in `ExerciseAudioButton` ignores returned promise on the manual `play()` path when `result.then` is missing

- **Severity:** nice-to-have
- **Category:** error-handling
- **Evidence:**
  - `src/components/exercises/primitives/ExerciseAudioButton.tsx:66-83` — the manual `play()` (button click) calls `audio.play()` and assumes `setState('playing')` is correct even when the engine returned `undefined`. Legacy components (`src/components/exercises/Dictation.tsx:55-63`, `ListeningMCQ.tsx:56-70`) defended against this by calling `onOk()`/`setHasPlayedOnce(true)` synchronously, matching the primitive's behaviour. But the autoplay branch at `:48-56` treats the same engine-shape as `setState('blocked')` — inconsistent assumption.
  - If the engine returned `undefined` because of a transient failure, the user sees `state === 'playing'` but no sound played, with no replay affordance.
- **Recommendation:** Either route both autoplay and manual `play()` through a single helper that tests `result?.catch`/`result?.then` and falls back to the same `'blocked'`/`'error'` resolution, or accept the inconsistency and document it. Today's split makes the autoplay-blocked overlay appear inconsistently in old-Safari/jsdom.
- **Estimated effort:** small
- **Cross-slice dependency:** null

### F2-27: Builder `ConstrainedTranslation.ts` leaves `patternName` as the empty string — not a bug yet, but a typed contract that says "I can't carry this"

- **Severity:** nice-to-have
- **Category:** type-hole
- **Evidence:**
  - `src/lib/exercises/builders/ConstrainedTranslation.ts:30-39` — `constrainedTranslationData: { … patternName: '', … }`.
  - The destination type (`ExerciseItem.constrainedTranslationData`) presumably types `patternName: string`. Builder always emits `''`. Either the field is dead or the builder is missing a projection.
  - Comparable: `src/lib/exercises/builders/SentenceTransformation.ts` is the natural sibling (grammar exercise) and doesn't carry a pattern name at all — so the field exists only here.
- **Recommendation:** Either type it as `patternName?: string | null` and stop emitting `''`, or wire the projector to surface `requiredTargetPattern`'s human-readable name from the grammar pattern projection.
- **Estimated effort:** trivial
- **Cross-slice dependency:** Agent 1 (capabilities — projectBuilderInput / grammar patterns)

### F2-28: `useExerciseScoring` `commitFailed` only fires once but `processing` state is never reset — if onAnswer rejects, UI stays committed

- **Severity:** nice-to-have
- **Category:** bug
- **Evidence:**
  - `src/lib/useExerciseScoring.ts:264-266` — `.catch((err: unknown) => { onEv?.({ type: 'exercise_commit_failed', payload: { error: String(err) } }) })`. The promise rejection emits an event but doesn't re-dispatch any action.
  - `src/lib/useExerciseScoring.ts:280-283` — for the correct branch, `dispatch({ type: 'MARK_PROCESSING', … })` happens before the timeout fires `commit('correct')`. If `onAns` rejects, the reducer is already in `answered-correct` (`commit()` dispatches the COMMIT before the catch resolves — both run as microtasks).
  - This is correctly observed by the test at `useExerciseScoring.test.ts:170-189` ("UI still answered" on reject). But the resulting UX is: user got it right, the FSRS write failed, the exercise auto-advances anyway (1500ms later). `ExperiencePlayer`'s notifications.show for commitFailed only fires on the wrong path (`src/components/experience/ExperiencePlayer.tsx:136-142`, gated on `wasCorrect`), so a failed-correct commit shows no user feedback at all.
- **Recommendation:** Either (a) surface the commit failure on the correct path too — fire `notifications.show` regardless of `wasCorrect`, or (b) gate auto-advance on commit success (await the promise before dispatching COMMIT_CORRECT). Today's behaviour silently drops state for correct answers.
- **Estimated effort:** small
- **Cross-slice dependency:** Agent 3 (experience player)

## Open questions for orchestrator

1. **F2-1 (legacy components)** is the largest cleanup win (~1700 lines of dead code) but touches `ContentReview.tsx` (Agent 4) and 4 test files. Coordinate with Agent 4 on whether the preview JSX moves into `ContentReview` or a new `<ExercisePreview>` primitive.
2. **F2-23 (normalizer divergence)** depends on what `answerService` writes to `review_events.normalized_response_text` (Agent 5 slice). If it stores `normalizeAnswerResponse` output, then `checkAnswer`-style fuzzy-attempt dedupe is broken. Worth a cross-slice verification pass.
3. **F2-27 (patternName)** — does the projector / grammar capability layer plan to surface this, or is the field genuinely dead? Question for Agent 1.

## Coverage notes

- All 12 production exercise implementations under `src/components/exercises/implementations/` were read in full.
- All 13 primitives + 12 builders read in full. Module index/barrel + helpers + types read.
- All 8 legacy top-level `.tsx` runtime components read in full (RecognitionMCQ, ClozeMcq, ContrastPairExercise, ListeningMCQ, Dictation, SentenceTransformationExercise, ConstrainedTranslationExercise, SpeakingExercise). `ExerciseErrorBoundary` + `ExerciseSkeleton` + `feedbackMapping` + `registry` read in full.
- Cross-slice context files read: `ContentReview.tsx` (only the imports + preview-render block), `ExperiencePlayer.tsx` (handleAnswerReport + feedback render).
- Did NOT exhaustively read every test file in `src/__tests__/`; focused on the four `*Exercise.test.tsx` and `useExerciseScoring.test.ts` / `answerNormalization.test.ts` that target the slice.
- Capped at 28 findings; could plausibly extract 5-10 more nice-to-haves around CSS-module separation, prop-drilling depth, and missed `useCallback` opportunities, but those are subjective taste rather than concrete bugs.
