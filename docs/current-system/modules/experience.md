---
module: experience
surface: src/components/experience/
last_verified_against_code: 2026-05-14
status: stable
---

# Experience module (session shell)

**Surface:** `src/components/experience/`

**Files:**
- `ExperiencePlayer.tsx` (179 LOC) — root shell, owns local session state
- `ExperiencePlayer.module.css` — bespoke two-column flow layout
- `CapabilityExerciseFrame.tsx` (84 LOC) — thin dispatcher from `SessionBlock` to the matching `implementations/*` component
- `blocks/WarmInputBlock.tsx` (26 LOC) — opening hero
- `blocks/DueReviewBlock.tsx` (47 LOC) — wrapper around a single due-review exercise
- `blocks/NewIntroductionBlock.tsx` (49 LOC) — wrapper around a single new-introduction exercise
- `blocks/RecapBlock.tsx` (55 LOC) — closing summary + completion button
- `types.ts` (14 LOC) — `SessionAnswerEvent` shape

**Consumers:**
- `src/pages/Session.tsx:217-225` — sole production caller
- No tests target the experience module directly today. Coverage lives one layer below (`src/services/__tests__/capabilityContentService.test.ts` for the resolver feeding it; `src/__tests__/capabilitySessionLoader.test.ts` for the plan builder feeding it).

**Status (2026-05-14):** stable in code structure, but the rendered UX is being redesigned (see `docs/plans/2026-05-14-experience-stepwise-redesign-design.md` — draft).

---

## 1. Purpose

Render a typed `SessionPlan` + pre-resolved `CapabilityRenderContext[]` + pre-fetched `SessionAudioMap` as the per-card interactive session experience. Translate per-card answer outcomes into a single `SessionAnswerEvent` upward to the host so the host can drive the FSRS commit.

The module is **presentational**: no data fetching, no service calls, no store reads, no FSRS-relevant writes, no scheduler interaction. Everything it knows comes through props. The `onAnswer` callback is the only side-effect channel.

---

## 2. Public interface

Sole exported component from `ExperiencePlayer.tsx:29-176`:

```typescript
export function ExperiencePlayer(props: {
  plan: SessionPlan
  contexts: Map<string, CapabilityRenderContext>   // keyed by block.id
  audioMap: SessionAudioMap
  userLanguage: 'nl' | 'en'
  onAnswer: (event: SessionAnswerEvent) => Promise<void>
  onComplete: () => void
})
```

Re-exported type from `types.ts:4-13`:

```typescript
export interface SessionAnswerEvent {
  sessionId: string
  blockId: string
  blockKind: SessionBlock['kind']
  capabilityId: string
  canonicalKeySnapshot: string
  exerciseType: SessionBlock['renderPlan']['exerciseType']
  answerReport: AnswerReport
  pendingActivation: boolean
}
```

Notable absences (deliberate):
- No `onSkip` prop. Skip is internal — see §4.4.
- No `onError` callback. Commit failures surface as inline UI text (`submissionError`) and the user can retry that card.
- No imperative API. The host cannot programmatically advance the player; the user must answer or skip each card.

### Input types

`SessionPlan` and `SessionBlock` — `src/lib/session/sessionPlan.ts`. Each block carries `id`, `kind` (`'due_review' | 'new_introduction'`), `capabilityId`, `canonicalKeySnapshot`, `renderPlan` (`{ exerciseType, capabilityType, skillType, … }`), `reviewContext`, and optional `pendingActivation`.

`CapabilityRenderContext` — `src/services/capabilityContentService.ts:50-56`. Carries `blockId`, `capabilityId`, the inflated `exerciseItem` (or `null` if resolution failed — see §3.1), `audibleTexts[]`, and an optional `diagnostic`.

`SessionAudioMap` — `src/services/audioService.ts:11`. `Map<string, string>` keyed by `${normalizedText}|${voiceId ?? '__default__'}`.

---

## 3. Internal flow

### 3.1 Block filtering (silent skip of unresolvable blocks)

`ExperiencePlayer.tsx:38-44`:

```typescript
const renderableBlocks = useMemo(
  () => plan.blocks.filter(b => contexts.get(b.id)?.exerciseItem != null),
  [plan.blocks, contexts],
)
const effectiveTotal = renderableBlocks.length
const effectiveDueCount = renderableBlocks.filter(b => b.kind === 'due_review').length
const effectiveNewCount = renderableBlocks.filter(b => b.kind === 'new_introduction').length
```

Blocks whose context has `exerciseItem === null` are dropped before render. The capability-content service has already logged a `capability_resolution_failure_events` row for each, per spec §9.1. The user never sees them and the totals shown reflect only the renderable subset, so a partial-resolution session can still be completed at 100 %.

### 3.2 Two-column layout (`ExperiencePlayer.tsx:97-174`)

`SessionAudioProvider` wraps everything (so every descendant can call `useSessionAudio`). Inside, `PageContainer size="lg"` + `PageBody` host a custom `classes.shell` two-column grid (bespoke CSS in `ExperiencePlayer.module.css`):

1. **Progress rail** (left, `:102-108`) — fixed `<aside>` showing percentage at top, a vertical fill track in the middle, `${answered}/${effectiveTotal}` at the bottom. Recomputed every render from `progress = Math.round((answeredBlocks.size / effectiveTotal) * 100)` (`:45`).
2. **Flow column** (right, `:110-170`) — vertical scroll-feed of: `WarmInputBlock` → optional diagnostics `<section>` → optional submission-error `<section>` → one block component per `renderableBlocks` entry → `RecapBlock`.

**Every renderable block is mounted simultaneously.** The flow renders `renderableBlocks.map(...)` (`:129-160`), so an N-block session creates N exercise components on the page at once. This is the design constraint that produces the multi-audio race (each exercise component independently respects `useAutoplay()` on mount).

### 3.3 Block component dispatch (`ExperiencePlayer.tsx:131-159`)

For each renderable block:
- `block.kind === 'due_review'` → `<DueReviewBlock>` (`DueReviewBlock.tsx`)
- otherwise → `<NewIntroductionBlock>` (`NewIntroductionBlock.tsx`)

Both block components are near-identical: header with kicker + pill + h2 + meta, then `<CapabilityExerciseFrame>`, then an `answered` / `submitting` status note. They differ only in copy and the additional `classes.newPanel` modifier on introductions.

### 3.4 CapabilityExerciseFrame — registry dispatch (`CapabilityExerciseFrame.tsx:30-83`)

The frame resolves the runtime component from the exercise registry once per `exerciseType` (memoised against the React 19 compiler's component-during-render lint, see comment at `:37-43`), wraps it in `ExerciseErrorBoundary` + `Suspense<ExerciseSkeleton>`, and adapts the underlying `AnswerOutcome` shape into the experience module's `AnswerReport` shape via `handleOutcome` (`:50-63`):

- `'skipped' in outcome` → `onSkip(block.id)` — see §4.4
- otherwise → `onAnswerReport({ wasCorrect, hintUsed: false, isFuzzy, rawResponse, normalizedResponse, latencyMs })`

Normalisation of `rawResponse` happens here via `normalizeAnswerResponse` (`src/lib/answers/normalizeAnswerResponse.ts`), so individual `implementations/*` don't repeat it.

### 3.5 Answer submission flow (`ExperiencePlayer.tsx:60-81`)

`handleAnswerReport(block, answerReport)`:

1. **Idempotency guard** — if `answeredBlocks.has(block.id)` or `submittingBlockId !== null`, return immediately. Prevents double-submit during in-flight commit and re-submit after the user has already answered the card.
2. Set `submittingBlockId = block.id`, clear any previous `submissionError`.
3. `await onAnswer({ … })` — the host (`Session.tsx:148-178`) calls `commitCapabilityAnswerReport`, which calls the `commit_capability_answer_report` Supabase function.
4. On success → `answeredBlocks.add(block.id)`, leaving the block visible but switched to its "answered" status note.
5. On throw → set `submissionError` to a fixed Dutch retry-prompt string ("Je antwoord kon niet worden opgeslagen. Controleer je verbinding en probeer deze kaart opnieuw.") and leave the block re-submittable.
6. `finally` clears `submittingBlockId`.

The submission error is **per-session**, not per-block — there's a single string slot. A new submit clears it (`setSubmissionError(null)` at `:63`).

### 3.6 Recap (`RecapBlock.tsx:20-54`)

A summary `<section>` rendered after every block. `complete = totalCount === 0 || answeredCount === totalCount` (`:21`). The "Sessie afronden" button is disabled until `complete` is true; when clicked, calls `onComplete` (today: `Session.tsx:146` → `navigate('/')`). For incomplete sessions the button reads "Rond af na de kaarten" and stays disabled.

The recap lists every answered or skipped block as `<li>` with the kind kicker + exercise label. Skipped blocks count as "answered" in `answeredBlocks` (see §4.4) and so appear in the changes list.

---

## 4. Invariants

1. **Presentational.** No `useEffect` for data work, no service calls, no store reads, no FSRS writes. The only outbound side effect is the `onAnswer` callback.
2. **Idempotent answer.** A block whose id is in `answeredBlocks` cannot be re-submitted (`ExperiencePlayer.tsx:61`).
3. **Total = renderable.** The denominator the user sees (`effectiveTotal`) is the count after the silent-skip filter, not `plan.blocks.length`.
4. **Skip is internal.** `handleSkip` (`ExperiencePlayer.tsx:85-87`) marks a block answered locally without calling `onAnswer`, so no FSRS state changes. The host has no visibility into skips today.
5. **Every renderable block is mounted at once.** No card-at-a-time rendering, no virtualization, no `<details>` collapsing — all are on the page from initial render.
6. **Submission error is shared.** One `submissionError` slot across the whole session; the next attempt clears it.
7. **Two block kinds only.** Anything not `'due_review'` falls to `NewIntroductionBlock` (`ExperiencePlayer.tsx:131-159`). The `kind` union admits more values in principle but no other branch exists today.

---

## 5. Seams (to other modules)

### Upstream (data feeds the experience)

- **`src/lib/session/capabilitySessionLoader.ts`** — `loadCapabilitySessionPlanForUser` builds the `SessionPlan` (blocks, ordering, diagnostics). Called by `Session.tsx:97-107`; result becomes the `plan` prop.
- **`src/services/capabilityContentService.ts`** — `resolveCapabilityBlocks` resolves each `SessionBlock` to a `CapabilityRenderContext`. Called by `Session.tsx:115-119`; result map becomes the `contexts` prop. The capability-content service is what `docs/target-architecture.md:441-498` folds into the planned `src/lib/exercise-content/` module.
- **`src/services/audioService.ts`** — `fetchSessionAudioMap` produces the `SessionAudioMap` from the audible-text list collected via `collectAudibleTexts(contexts.values())`. Called by `Session.tsx:122-126`.

### Downstream (the experience consumes these)

- **`src/components/exercises/registry`** — `resolveExerciseComponent(exerciseType)` returns the `React.lazy` reference for the matching implementation. Used by `CapabilityExerciseFrame.tsx:40-43`.
- **`src/components/exercises/implementations/*`** — the 12 production exercise components. Receive `{ exerciseItem, userLanguage, onAnswer }` from the frame and report `AnswerOutcome` upward.
- **`src/components/exercises/primitives/*`** — every implementation composes these primitives (`ExerciseFrame`, `ExercisePromptCard`, `ExerciseTextInput`, etc.). The experience module never reaches in directly.
- **`src/components/page/primitives/`** — `PageContainer` + `PageBody` at `ExperiencePlayer.tsx:99-100`. The rest of the shell layout is bespoke CSS in `ExperiencePlayer.module.css`, not page-primitive composition.
- **`src/lib/answers/normalizeAnswerResponse.ts`** — applied to every `rawResponse` at the frame boundary (`CapabilityExerciseFrame.tsx:60`).
- **`src/contexts/SessionAudioContext.tsx`** — `<SessionAudioProvider audioMap>` wraps the entire tree. Used by exercise implementations via `useSessionAudio()`.
- **`src/contexts/AutoplayContext.tsx`** — read independently by each exercise implementation. The experience module does not coordinate autoplay across blocks — every implementation autoplays on its own mount if the global preference is on. With every block mounted at once (§4.5), this causes simultaneous playback.

### Sibling (consumed alongside)

- **`src/pages/Session.tsx`** owns all the I/O (plan load, context resolution, audio fetch, RPC commit, navigation). The experience module is invoked as a leaf component once those inputs are ready.
- **`src/lib/reviews/capabilityReviewProcessor.ts`** — `commitCapabilityAnswerReport` is called by the host's `handleCapabilityAnswer` (`Session.tsx:155-171`), not by the experience module directly. The module hands the host an `AnswerReport`; the host packages it for the RPC.

---

## 6. Known limitations

1. **Simultaneous-mount audio race.** Every renderable block mounts on initial render; every exercise implementation autoplays on its own mount; the global `useAutoplay()` preference applies to all. Result: N audio clips play at once. Reported by the user 2026-05-14. Fix is the stepwise redesign tracked in `docs/plans/2026-05-14-experience-stepwise-redesign-design.md`.
2. **No card-at-a-time flow.** The "answered" state of a card is a label change in place, not a screen transition. No auto-advance, no per-card focus.
3. **No Doorgaan feedback screen.** Wrong answers commit silently and the user sees only the "Antwoord opgeslagen" line; the previous design's per-card feedback screen (`ExerciseFeedback` primitive + `feedbackPropsFor`) is unused by this player though both still ship in the bundle.
4. **Skip is invisible to the host and to FSRS.** Useful for unrecoverable render errors; potentially undesirable if the user uses it as an escape hatch since no event is logged.
5. **Bespoke shell CSS.** `ExperiencePlayer.module.css` is the only place in the codebase that builds a session-shell layout out of raw CSS grid; nothing in `src/components/page/primitives/` covers it. Per CLAUDE.md ("If a page has a recurring shape that no existing primitive covers, extract a new primitive rather than letting the page drift into bespoke CSS"), the redesign is also the opportunity to retire this CSS file.
6. **Diagnostics are user-visible.** `plan.diagnostics` is rendered as plain text in the flow (`ExperiencePlayer.tsx:113-121`), with reason codes like `missing_capability_projection` exposed to the learner. Admin-only would be more appropriate.
7. **`SessionAnswerEvent` carries a fixed `attemptNumber=1` semantics implicitly.** The host hardcodes `attemptNumber: 1` and `idempotencyKey: \`${userId}:${sessionId}:${blockId}:1\`` (`Session.tsx:159-160`). The experience module emits no attempt number at all. Re-attempts on the same card are not modelled.
8. **No abort handling.** Browser back, sidebar nav-away, or a sign-out mid-session leaves the in-flight commit unaborted. The component just unmounts and the fetch resolves/rejects against a dead React tree.

---

## 7. What this spec does NOT cover

- The block-planner upstream (which blocks land in `plan.blocks` and in what order) — belongs in `src/lib/session/capabilitySessionLoader.ts` and the `lib/session-builder/` target-architecture module.
- The capability-content resolver (how `CapabilityRenderContext.exerciseItem` is materialised) — belongs in `src/services/capabilityContentService.ts` / planned `src/lib/exercise-content/` module spec.
- The exercise registry and its 12 implementations — belongs in `src/components/exercises/registry.ts` and `src/components/exercises/implementations/`.
- The `commit_capability_answer_report` server function and its FSRS/idempotency logic — belongs in the `srs/` and `answerCommitService` specs per `docs/target-architecture.md`.
- The audio map, the TTS URL convention, the `indonesian-tts` storage bucket — belongs in the `lib/audio` module per `docs/target-architecture.md:769-825`.
- The autoplay/listening preferences (`AutoplayContext`, `ListeningContext`) — belongs in the same `lib/audio` module spec.
- The Doorgaan feedback screen + `feedbackPropsFor` — belongs in `src/components/exercises/feedbackMapping.ts` + the `exercises/primitives/` module spec.
