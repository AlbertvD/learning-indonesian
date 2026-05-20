---
module: exercises
surface: src/components/exercises/
last_verified_against_code: 2026-05-20
status: stable
---

# Exercises module (UI rendering layer)

**Surface:** `src/components/exercises/`. The UI half of capability rendering — the registry that maps `ExerciseType` → React component, the 12 per-type implementations consumed at runtime, the framework primitives those implementations are built on, and the feedback-shape adapter that bridges between the player chrome and the Doorgaan card primitive.

**Files (30):**

| File | LOC | Role |
|---|---|---|
| `registry.ts` | 105 | Sole runtime dispatch — `exerciseRegistry: Partial<Record<ExerciseType, LazyExercise>>` mapping each of the 12 types to `lazy(() => import('./implementations/...'))`. Defines `ExerciseComponentProps` (the contract every implementation conforms to) and the `AnswerOutcome` discriminated union (`{skipped: true}` vs `ExerciseAnswerReport`). `resolveExerciseComponent(type)` returns `null` for unmapped types, which `CapabilityExerciseFrame` silent-skips. |
| `feedbackMapping.ts` | 241 | `feedbackPropsFor(input: FeedbackMapInput): FeedbackProps` — pure adapter that takes an `ExerciseItem` + outcome + commit state and returns the typed props for the `ExerciseFeedback` Doorgaan card primitive. 12-way switch on `exerciseType` at `:47-240` covers every supported variant including the grammar/vocab split for `cloze_mcq` (via `isGrammar` input flag). |
| `ExerciseErrorBoundary.tsx` | 110 | Class-component error boundary that wraps each exercise. Catches render-phase exceptions, logs to `error_logs`, surfaces a friendly NL/EN copy + "Doorgaan" button that fires `onAnswer({ skipped: true, reviewRecorded: false })` so the player can advance past a broken card without committing an answer. |
| `ExerciseSkeleton.tsx` | 62 | Layout-preserving skeleton shown by `<Suspense>` while a `lazy()`-imported implementation chunk loads. Variant prop (`'word' \| 'sentence' \| 'audio'`) matches `exerciseSkeletonVariant` in `registry.ts:81-94` to prevent layout shift when the real component mounts. |
| `primitives/` | — | 13 framework components + 3 helpers + barrel. See §3.1. |
| `implementations/` | — | 12 per-type renderers. See §3.2. |

**Implementations (12, `implementations/*.tsx`):**

| File | LOC | Exercise type | Direction | Input shape |
|---|---|---|---|---|
| `RecognitionMCQ.tsx` | 86 | `recognition_mcq` | ID → L1 | Tap one of 4 options |
| `CuedRecallExercise.tsx` | 66 | `cued_recall` | L1 → ID | Tap one of 4 options |
| `TypedRecall.tsx` | 71 | `typed_recall` | L1 → ID | Type the Indonesian word |
| `MeaningRecall.tsx` | 87 | `meaning_recall` | ID → L1 | Type the L1 meaning |
| `ListeningMCQ.tsx` | 99 | `listening_mcq` | audio → L1 | Tap one of 4 options after audio |
| `Dictation.tsx` | 106 | `dictation` | audio → ID | Type what you hear |
| `Cloze.tsx` | 92 | `cloze` | ID → ID typed | Fill the blank in a sentence |
| `ClozeMcq.tsx` | 85 | `cloze_mcq` | ID → ID tap | Pick the option that fills the blank |
| `ContrastPairExercise.tsx` | 78 | `contrast_pair` | ID → ID | Pick between two grammar-similar options |
| `SentenceTransformationExercise.tsx` | 95 | `sentence_transformation` | ID → ID typed | Transform a sentence per an instruction |
| `ConstrainedTranslationExercise.tsx` | 142 | `constrained_translation` | L1 → ID typed | Translate a constrained sentence |
| `SpeakingExercise.tsx` | 46 | `speaking` | ID prompt → self-rate | Read prompt, self-rate |

All conform to `ExerciseComponentProps` (`registry.ts:43-49`): `{ exerciseItem: ExerciseItem; userLanguage: 'en'|'nl'; onAnswer: (outcome: AnswerOutcome) => void; onEvent?; adminOverlay? }`. All default-export their component. All consume framework primitives only — none use raw Mantine directly.

**Tests:**
- `src/__tests__/cuedRecallExercise.test.tsx`, `contrastPairExercise.test.ts`, `sentenceTransformationExercise.test.ts`, `constrainedTranslationExercise.test.ts` — type-only smoke tests asserting `ExerciseItem` compiles with each variant's sub-data shape.
- `src/__tests__/ExperiencePlayer.test.tsx` — 29 scenarios covering the player's end-to-end orchestration through each implementation. Per-implementation behaviour (correct/wrong/fuzzy/skip) is tested at this layer, not in isolated component tests.

**Consumers (production):**
- `src/components/experience/CapabilityExerciseFrame.tsx:30-83` — sole runtime caller of `resolveExerciseComponent` + sole consumer of `AnswerOutcome`.
- `src/components/experience/ExperiencePlayer.tsx:71-87` — uses `resolveExerciseComponent` for the silent-skip filter at the queue level.
- `src/components/experience/buildFeedbackInput.ts` — produces the `FeedbackMapInput` consumed by `feedbackPropsFor`.
- `src/pages/admin/DesignLab.tsx` — admin design-lab showcase of the 13 primitives. No production runtime consumption.
- `src/pages/ContentReview.tsx` — admin variant-review page. Consumes `VariantPreview` (`components/admin/VariantPreview.tsx`) which renders rich question + "Antwoord" + answer-revealed previews for the 4 types where the visual shape carries meaning (cloze_mcq, contrast_pair, sentence_transformation, constrained_translation), and falls back to `ExerciseSummaryCard` for the other 8. Does NOT call the registry. The 8 legacy preview-mode renderers that previously lived in this folder were retired 2026-05-20 in favour of this dedicated admin component.

**Status (2026-05-20):** stable. Framework migration completed by retiring the 8 legacy top-level renderers that survived from the pre-framework era (RecognitionMCQ, ClozeMcq, ContrastPair, Dictation, ListeningMCQ, SentenceTransformation, ConstrainedTranslation, Speaking) plus their divergent top-level `FlagButton.tsx` clone plus 4 test files (`mcqWrongAnswer`, `dictationExercise`, `listeningMcqExercise`, `speakingExercise`) that exercised the legacy code paths. ContentReview's per-type rich preview was dropped in favour of `ExerciseSummaryCard` for all types — admin loses inline rendering of cloze/contrast/sentence-transformation/constrained-translation variants, gains a uniform question/answer summary.

---

## 1. Purpose

Three responsibilities:

1. **Render a typed `ExerciseItem` as an interactive card.** Each implementation reads its capability-type-specific sub-data from the item, presents the prompt, accepts user input, grades the answer, and emits an `AnswerOutcome` via `onAnswer`.

2. **Provide a stable contract between the player and per-type renderers.** `ExerciseComponentProps` + `AnswerOutcome` are the seam. The player doesn't know which exercise type it's about to mount; it dispatches via the registry and trusts the contract.

3. **Provide the framework primitives every implementation is built on.** `primitives/` exposes `ExerciseFrame`, `ExercisePromptCard`, `ExerciseOptionGroup`, `ExerciseOption`, `ExerciseTextInput`, `ExerciseSubmitButton`, `ExerciseAudioButton`, `ExerciseFeedback` (the Doorgaan card), `ExerciseInstruction`, `ExerciseHint`, `LanguagePill`, `FlagButton`, plus context (`FrameInstructionIdContext`, `FrameFooterContext`, `FrameVariantContext`) and the `triggerHaptic` helper.

The module is **presentational + functional**: no data fetching, no service calls, no FSRS math. Answer grading happens locally (per implementation via `useExerciseScoring`); the commit decision and FSRS state update happen upstream in the player and server-side processor.

---

## 2. Public interface

**The contract every implementation must satisfy** — `registry.ts:43-49`:

```typescript
interface ExerciseComponentProps {
  exerciseItem: ExerciseItem
  userLanguage: 'en' | 'nl'
  onAnswer: (outcome: AnswerOutcome) => void
  onEvent?: (event: ExerciseEventPayload) => void
  adminOverlay?: React.ReactNode
}

type AnswerOutcome =
  | { skipped: true, reviewRecorded: false }
  | { wasCorrect: boolean; isFuzzy: boolean; latencyMs: number; rawResponse: string | null }
```

**The registry** — `registry.ts:59-75`:

```typescript
const exerciseRegistry: Partial<Record<ExerciseType, LazyExercise>>
function resolveExerciseComponent(type: ExerciseType): LazyExercise | null
const exerciseSkeletonVariant: Record<ExerciseType, 'word' | 'sentence' | 'audio'>
```

**The feedback adapter** — `feedbackMapping.ts:40`:

```typescript
function feedbackPropsFor(input: FeedbackMapInput): FeedbackProps
```

`FeedbackProps` is `Omit<ExerciseFeedbackProps, 'onContinue' | 'continueLabel' | 'copy'>`. The three omitted props are owned by the player (which knows when to advance + which language to use for copy).

**Primitives barrel** — `primitives/index.ts:1-58`. Re-exports every primitive + its props type + the three context constants + `triggerHaptic`. `global.css` is side-effect-imported.

---

## 3. Internal flow

### 3.1 Primitives layer

13 components built directly on Mantine. Each owns its own CSS module:

| Primitive | Purpose | Notable behaviour |
|---|---|---|
| `ExerciseFrame` | The card shell every exercise lives in. Provides instruction-id context for accessibility wiring, footer slot, variant context. | `variant='session' \| 'review' \| 'preview'`. The `adminOverlay` slot is admin-only top-right (typically `FlagButton`). |
| `ExerciseInstruction` | The Dutch/English instruction line above the prompt card. | Registers its id into `FrameInstructionIdContext` so the prompt card can `aria-describedby` it. |
| `ExercisePromptCard` | The big foreground prompt — word, sentence, or audio. | `variant='word' \| 'sentence' \| 'audio'` controls type-scale. Audio variant embeds `ExerciseAudioButton` with autoplay opt-in. |
| `ExerciseOption` | A single MCQ option button. | `state='neutral' \| 'selected' \| 'correct' \| 'incorrect' \| 'show-correct'` drives styling. `variant='word' \| 'sentence'` controls size. |
| `ExerciseOptionGroup` | Vertical stack of options. | Pure layout container. |
| `ExerciseTextInput` | The typed-answer input. | `state` drives border colour same as `ExerciseOption`. |
| `ExerciseSubmitButton` | The "Controleer" / "Check" button. | Hidden during the auto-advance fade on correct answers. |
| `ExerciseAudioButton` | The play-prompt control. | `variant='primary' \| 'icon'` — primary is the big circular play, icon is the inline mini button. Plays via the resolved session audio map. |
| `ExerciseHint` | Collapsible hint reveal. | Tracks reveal in `onEvent` for FSRS hint-counting. |
| `ExerciseFeedback` | The Doorgaan card shown after a fuzzy/wrong answer. 299 LOC — the heaviest primitive. | `layout='vocab-pair' \| 'grammar-reveal'` controls the two main shapes. Owns the "Doorgaan" button (player supplies `onContinue` + label + copy). Renders accepted variants, audio playback of the correct answer, optional explanation, commit-fail chip. |
| `FlagButton` | "Report this card" trigger. | Posts via `exerciseReviewService` directly; admin-only via `adminOverlay`. |
| `LanguagePill` | "ID" / "NL" / "EN" type-coloured pill chips. | Used by `ExerciseFeedback` and primitives that show a language hint. |

Three context providers in `primitives/context.ts`: `FrameInstructionIdContext`, `FrameFooterContext` (with the `FOOTER_SLOT_SYMBOL` sentinel), `FrameVariantContext`. `primitives/haptics.ts` exports `triggerHaptic(event)` for tap/correct/wrong feedback.

### 3.2 Implementations layer

Each of the 12 components follows the same shape (`implementations/RecognitionMCQ.tsx` is the canonical example):

1. Destructure `exerciseItem`, `userLanguage`, `onAnswer`, `onEvent`, `adminOverlay` from props.
2. Hook calls — `useSessionAudio()`, `useAutoplay()`, `useState(...)` for any local UI state.
3. Derive the prompt + correct answer + distractors (MCQ types) or accepted variants (typed types) from the item's sub-data.
4. `useExerciseScoring({ mode, checkCorrect, onAnswer, onEvent })` — the shared scoring hook that:
   - Tracks latency
   - Calls `checkCorrect(response)` to grade
   - Bridges the result to `onAnswer({ wasCorrect, isFuzzy, latencyMs, rawResponse })`
5. Return JSX composed entirely from `primitives/` components.

No implementation owns its own scoring logic, retry counter, or feedback UI. The player decides what happens after the answer fires.

### 3.3 Registry dispatch

`CapabilityExerciseFrame.tsx:30-83` is the dispatcher:

1. `resolveExerciseComponent(block.renderPlan.exerciseType)` returns a `LazyExercise` or `null`.
2. If `null` (registry miss) or `context.exerciseItem == null` (resolution failed): render `null` and silent-skip.
3. Else wrap in `<ExerciseErrorBoundary><Suspense fallback={<ExerciseSkeleton variant={...} />}><LazyExercise {...props} /></Suspense></ExerciseErrorBoundary>`.
4. `handleOutcome(outcome)`: if `{skipped: true}` → call `onSkip(blockId)`. Else translate the implementation's `ExerciseAnswerReport` into an `AnswerReport` (adding `hintUsed: false` and `normalizedResponse: normalizeAnswerResponse(rawResponse)`).

### 3.4 Feedback flow

After fuzzy/wrong, the player calls `feedbackPropsFor(input)` (via `buildFeedbackInput` in the experience module) to get typed `FeedbackProps` for `ExerciseFeedback`. The 12-way switch in `feedbackMapping.ts:47-240` covers every exercise type, picking:

- `layout`: `'vocab-pair'` (most types) vs `'grammar-reveal'` (grammar-tagged `cloze_mcq`, `contrast_pair`, `sentence_transformation`, `constrained_translation`).
- `direction`: ID→L1 / L1→ID / audio→ID / ID→ID, drives the language-pill arrangement.
- `promptShown` + `correctAnswer` + optional `userAnswer`: the three text blocks the card displays.
- Optional `audio`, `acceptedVariants`, `meaning`, `explanation`, `commitFailed` flags.

The player owns `onContinue` / `continueLabel` / `copy`; the adapter owns everything content-shaped.

---

## 4. Invariants

1. **Every `ExerciseType` in `@/types/learning` is mapped in `exerciseRegistry`.** Verified by the `Partial<Record<ExerciseType, LazyExercise>>` type at `registry.ts:59` — if a type is added without a registry entry, TypeScript permits it (the Partial bears the omission) but `resolveExerciseComponent` returns `null` and the dispatcher silent-skips. The 12 types currently mapped are exhaustive against the `ExerciseType` union as of 2026-05-20.
2. **`exerciseSkeletonVariant` is exhaustive.** `registry.ts:81` types as `Record<ExerciseType, ...>` (non-Partial) — missing entries are a compile error.
3. **Implementations consume primitives only.** No `@mantine/core` imports in `implementations/*.tsx`. (The earlier legacy renderers violated this; retired 2026-05-20.)
4. **Implementations never make service calls.** Pure UI + grading. Data flow is `props → render → onAnswer`.
5. **`onAnswer` may be called at most once per mount.** Idempotency is enforced inside `useExerciseScoring`; the player's own `submitting` flag is a second layer.
6. **`AnswerOutcome` is the sole outbound channel.** No imperative refs, no global state writes from implementations.
7. **The `feedbackMapping.ts` switch is exhaustive.** TypeScript's exhaustiveness check on `item.exerciseType` (the discriminator) catches any missing case at compile time.

---

## 5. Seams (to other modules)

### Upstream (data feeds the implementations)

- **`src/services/capabilityContentService.ts`** — `resolveBlocks(blocks, options)` produces the `CapabilityRenderContext.exerciseItem` that every implementation reads.
- **`src/lib/exercises/builders/`** — the 12 per-type builders that produce typed `ExerciseItem` sub-data structures (e.g., `clozeMcqData`, `contrastPairData`). Called transitively via `capabilityContentService → buildForExerciseType → builders/<Type>`.
- **`src/services/audioService.ts`** — `resolveSessionAudioUrl(audioMap, text, voiceId)` looks up TTS URLs for prompt audio.

### Downstream (the implementations + framework feed these)

- **`src/components/experience/CapabilityExerciseFrame.tsx`** — sole dispatcher, calls `resolveExerciseComponent` + applies the `AnswerOutcome` → `AnswerReport` translation.
- **`src/components/experience/ExperiencePlayer.tsx`** — calls `resolveExerciseComponent` for the queue-level filter (block silent-skip) and orchestrates the Doorgaan/recap state machine.
- **`src/components/experience/buildFeedbackInput.ts`** — builds the `FeedbackMapInput` passed to `feedbackPropsFor`.
- **`src/contexts/SessionAudioContext.tsx`** — implementations call `useSessionAudio()` for the audio map.
- **`src/contexts/AutoplayContext.tsx`** — implementations call `useAutoplay()` for the prompt-autoplay opt-in.

### Sibling (consumed alongside)

- **`src/lib/useExerciseScoring.ts`** — the scoring hook every implementation uses. Owns the `mode='tap'`/`'typed'` state machine, latency tracking, correct/fuzzy/wrong outcome.
- **`src/lib/i18n.ts`** — `translations[userLanguage]` per-locale string table for instruction copy.
- **`src/lib/answerNormalization.ts`** — `normalizeAnswerResponse(raw)` applied at the frame boundary (`CapabilityExerciseFrame.tsx:60`) before the report ships upstream.
- **`src/services/exerciseReviewService.ts`** — `FlagButton` writes user-flagged variants here directly.
- **`src/components/admin/VariantPreview.tsx`** + **`src/components/admin/ExerciseSummaryCard.tsx`** — the ContentReview admin page's static variant preview. Live outside this module surface and do NOT route through the registry; they read `payload_json` directly.

---

## 6. Known limitations

1. **Registry exhaustiveness is not compile-enforced.** `exerciseRegistry: Partial<Record<ExerciseType, LazyExercise>>` permits omission. The dispatcher silent-skips missing types at runtime — visible only via the `registryMissCount` log in `ExperiencePlayer.tsx:89-98`. A `satisfies` check at module load would catch this earlier; not added today.
2. **`feedbackMapping.ts`'s 12-way switch is duplicated logic relative to the implementations.** Each implementation knows its data shape; the feedback adapter re-knows it to project the right `promptShown` / `correctAnswer` / `direction`. A refactor that has each implementation declare its own feedback projection would remove the duplication; out of scope for the cleanup.
3. **`primitives/FlagButton.tsx` is showcased in DesignLab but not yet wired into any production card.** The `ExerciseFrame.adminOverlay` slot exists for this, but no implementation currently passes it. Admin-flagging from inside a session is therefore not surfaced today.
4. **`speaking` exercise type has no commit path.** `SpeakingExercise.tsx` displays the prompt + target but emits no answer report — the player advances past it as a self-rate. The `feedbackMapping.ts:228-239` branch exists defensively but is unreachable through the normal flow.

---

## 7. What this spec does NOT cover

- **The player chrome** — `src/components/experience/`. Stepwise state machine, recap, re-drill. See `docs/current-system/modules/experience.md`.
- **The capability content resolver** — `src/services/capabilityContentService.ts`. Builds the `ExerciseItem` from capability rows.
- **The session builder** — `src/lib/session-builder/`. Produces the `SessionPlan` whose blocks become the queue.
- **The lesson reader** — `src/components/lessons/`. See `docs/current-system/modules/lesson-renderer.md`.
- **The capability projection + readiness** — `src/lib/capabilities/`. See `docs/current-system/modules/capabilities.md`.
- **The admin variant-review page** — `src/pages/ContentReview.tsx` + `src/components/admin/VariantPreview.tsx` + `src/components/admin/ExerciseSummaryCard.tsx`. Their preview/summary-card path is independent of the runtime registry — it reads `payload_json` directly and renders without going through capability resolution.
- **The audio service + storage bucket** — `src/services/audioService.ts`.
- **The FSRS commit path** — `supabase/functions/commit-capability-answer-report/`. Server-side.
