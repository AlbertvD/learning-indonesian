---
module: experience
surface: src/components/experience/
last_verified_against_code: 2026-05-19
status: stable
---

# Experience module (session shell)

**Surface:** `src/components/experience/`

**Files:**
- `ExperiencePlayer.tsx` (295 LOC) — stepwise shell with a mutable queue: one card at a time, auto-advance on correct, Doorgaan on fuzzy/wrong + re-queue the block 3–6 capabilities ahead, ends on RecapScreen when every unique capability has been correctly answered (or skipped)
- `RecapScreen.tsx` (106 LOC) — dedicated recap surface with hero, counter grid, per-card list, and "Terug naar dashboard" action
- `feedbackCopy.ts` (51 LOC) — `FEEDBACK_COPY_NL/EN` + `feedbackCopyFor(userLanguage)` helper
- `buildFeedbackInput.ts` (35 LOC) — pure adapter from block + context → `FeedbackMapInput` for `feedbackPropsFor`
- `CapabilityExerciseFrame.tsx` (83 LOC) — thin dispatcher from `SessionBlock` to the matching `implementations/*` component
- `types.ts` (13 LOC) — `SessionAnswerEvent` shape

**Tests:**
- `src/__tests__/ExperiencePlayer.test.tsx` — 29 scenarios covering the full stepwise state machine (19 baseline + 10 re-drill behaviours)
- `src/components/experience/__tests__/buildFeedbackInput.test.ts` — unit tests for the feedback-input adapter (all 12 exercise types)
- `src/components/experience/__tests__/feedbackCopy.test.ts` — unit tests for `feedbackCopyFor`

**Consumers:**
- `src/pages/Session.tsx` — sole production caller; prop shape unchanged

**Status (2026-05-19):** In-session re-drill landed — a wrong or fuzzy answer re-inserts the block 3–6 capabilities ahead and the session only ends once every unique capability has been correctly answered (or skipped). Drill re-shows are UI-only: they do not post a second `onAnswer` (the original lapse already committed; the in-session snapshot would be stale). Previous redesign from feed-all-at-once to one-card-at-a-time stepper (2026-05-14) is intact.

---

## 1. Purpose

Render a typed `SessionPlan` + pre-resolved `CapabilityRenderContext[]` + pre-fetched `SessionAudioMap` as the per-card interactive session experience. Translate per-card answer outcomes into a single `SessionAnswerEvent` upward to the host so the host can drive the FSRS commit.

The module is **presentational**: no data fetching, no service calls. It reads `profile?.isAdmin` from `useAuthStore` only to gate diagnostic visibility. The `onAnswer` callback is the only outbound side-effect channel.

---

## 2. Public interface

Sole exported component from `ExperiencePlayer.tsx:67-241`:

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
- No `onSkip` prop. Skip is internal — see §3.4.
- No `onError` callback. Commit failures surface via yellow toast (correct path) or `commitFailed` chip on the Doorgaan card (fuzzy/wrong path).
- No imperative API. The host cannot programmatically advance the player.

### Input types

`SessionPlan` and `SessionBlock` — `src/lib/session/sessionPlan.ts`. Each block carries `id`, `kind` (`'due_review' | 'new_introduction'`), `capabilityId`, `canonicalKeySnapshot`, `renderPlan` (`{ exerciseType, capabilityType, skillType, … }`), `reviewContext`, and optional `pendingActivation`.

`CapabilityRenderContext` — `src/services/capabilityContentService.ts:50-56`. Carries `blockId`, `capabilityId`, the inflated `exerciseItem` (or `null` if resolution failed), `audibleTexts[]`, and an optional `diagnostic`.

`SessionAudioMap` — `src/services/audioService.ts:11`. `Map<string, string>` keyed by `${normalizedText}|${voiceId ?? '__default__'}`.

---

## 3. Internal flow

### 3.1 Block filtering (silent skip of unresolvable blocks)

`ExperiencePlayer.tsx:71-87`:

```typescript
const renderableBlocks = useMemo(() => {
  const out: SessionBlock[] = []
  for (const b of plan.blocks) {
    const ctx = contexts.get(b.id)
    if (!ctx?.exerciseItem) continue             // resolution failed
    if (!resolveExerciseComponent(b.renderPlan.exerciseType)) continue  // registry miss
    out.push(b)
  }
  return out
}, [plan.blocks, contexts])
```

Two categories of silent-filter: resolution-failed blocks (logged upstream by `capabilityContentService`) and registry-miss blocks (logged by a `useEffect` on `registryMissCount` at `ExperiencePlayer.tsx:89-98`). Both categories are completely invisible to the user; `effectiveTotal` reflects only the renderable subset.

### 3.2 Stepwise layout (`ExperiencePlayer.tsx:228-293`)

`SessionAudioProvider` wraps the entire tree. `PageContainer size="md"` + `PageBody` host either:
- **RecapScreen** (when `isComplete = position >= queueLength`)
- **SessionHeader** + exercise body or Doorgaan card (normal play)

`SessionHeader` (inlined in `ExperiencePlayer.tsx`) renders a horizontal Mantine `<Progress>` + text counters (sized `--ex-fs-chrome`). The counters show `Oefening {position+1} van {queueLength}` (queue position; queue length grows when blocks are re-inserted) and `{correctCount}/{totalUniqueCaps} correct` (unique-capability tally). A `flagSlot` at the right end of the counter row hosts `AdminFlagOverlay` (the admin flag affordance, keyed per block) — placed in header chrome rather than overlaid on the exercise so long instructions can never collide with it (2026-07-02 mobile type audit). Admin profile sees `plan.diagnostics` in a collapsed `<details>`.

### 3.3 State machine

`ExperiencePlayer.tsx:119-227`:

| State | What's on screen |
|---|---|
| `!isComplete && !feedback` | `SessionHeader` + `CapabilityExerciseFrame` for `queue[position]` (key: `${block.id}-${position}` to force fresh mount on drill re-shows) |
| `!isComplete && feedback !== null` | `SessionHeader` + `ExerciseFeedback` (Doorgaan card) |
| `isComplete` | `RecapScreen` |

State transitions:
- **Correct + not fuzzy** → add capability to `correctCapabilityIds`, `position++`, `feedback = null` (auto-advance)
- **Fuzzy or wrong** → splice the current block back into `queue` at `position + 1 + offset` (offset = `pickRedrillOffset()` ∈ [3, 6]; clamped to `queue.length`), then set `feedback = { block, context, outcome, response, commitFailed }` (shows Doorgaan)
- **Doorgaan tapped** → `handleContinue`: `feedback = null`, `position++`
- **Skip outcome** → `handleSkip`: adds block to `answeredBlocks` + `skippedBlocks`, capability to `skippedCapabilityIds`, `position++` (block NOT re-inserted)

The queue is initialised from `renderableBlocks` (`ExperiencePlayer.tsx:112-122`) and grows by one entry per wrong/fuzzy answer. Skipped blocks do not re-insert. Drill re-shows of the same block live alongside the original in the queue but get a fresh React mount via the `position`-keyed `CapabilityExerciseFrame`.

`isComplete` is `position >= queueLength`. The queue only stops growing when every capability has resolved (correct or skipped), so reaching `position == queueLength` and "all capabilities resolved" coincide.

### 3.4 Answer submission flow (`ExperiencePlayer.tsx:131-205`)

`handleAnswerReport(report: AnswerReport)`:

1. **Idempotency guard** — `submitting` flag prevents re-entry while a commit is in-flight.
2. **Drill-reshow short-circuit** — if `answeredBlocks.has(currentBlock.id)`, the block has already committed once; subsequent in-session re-shows skip the `onAnswer` call entirely (no second FSRS event; the held `schedulerSnapshot` would be stale by then and the server would reject). The re-show still drives the UI through correct → advance or wrong → re-queue + feedback.
3. **First-attempt commit** — call `await onAnswer({ … })`, then add `currentBlock.id` to `answeredBlocks`.
4. **On commit success** → on `wasCorrect && !isFuzzy`: add capability to `correctCapabilityIds` and advance. On fuzzy/wrong: re-queue + show feedback.
5. **On commit throw** → `commitFailed = true`; the block enters `commitFailedBlocks`. Toast fires on correct path; chip fires on fuzzy/wrong path via `feedbackPropsFor({ commitFailed: true, … })`. The block still re-queues if fuzzy/wrong.
6. `logError` always fires on commit failure regardless of which surface carries the user message.

### 3.5 Feedback-input adapter (`buildFeedbackInput.ts:9-34`)

Pure function: block + context + response → `FeedbackMapInput` for `feedbackPropsFor`. Derives:
- `isGrammar`: `capabilityType ∈ {'pattern_recognition', 'pattern_contrast'}`
- `acceptedVariants`: `item.answerVariants.filter(v => v.is_accepted).map(v => v.variant_text)`
- `promptAudioUrl`: resolved via `resolveSessionAudioUrl` for `listening_mcq` and `dictation` only

### 3.6 Recap screen (`RecapScreen.tsx:17-105`)

On `isComplete`, shows:
- **Standard** (`renderableBlocks.length > 0`): HeroCard "Sessieroute afgerond" + lede with `savedCount` + optional commit-fail subline (singular/plural) + counter grid + per-card `<ul>` + "Terug naar dashboard" button.
- **Empty-state** (`renderableBlocks.length === 0`): HeroCard "Niets te doen" + lede + just the button.

`savedCount = answeredBlocks.size - skippedBlocks.size - commitFailedBlocks.size`. Per-card kicker: "Niet opgeslagen" if `commitFailedBlocks.has(b.id)`, else "Overgeslagen" if `skippedBlocks.has(b.id)`, else by kind ("Herhaling opgeslagen" / "Introductie gestart").

Drill re-shows do not inflate the recap: `answeredBlocks` is only written on the first-attempt commit branch (drill-reshow short-circuit at §3.4 step 2 skips that write), and the per-card `<ul>` iterates `renderableBlocks` (the original immutable list) — not the grown `queue`. So a block that was wrong-then-drilled-correct counts as one row, with the standard "Herhaling opgeslagen" / "Introductie gestart" kicker.

---

## 4. Invariants

1. **Exactly one of {exercise body, Doorgaan card, recap screen} is rendered at any time.** `ExperiencePlayer.tsx:228-293`.
2. **`position` only advances forward.** No back-button, no rewind. The queue itself can grow via re-insertion of wrong/fuzzy-answered blocks (see invariant 7); `position` never moves backwards through it.
3. **`renderableBlocks` is stable per `plan.blocks` + `contexts` change.** `useMemo` over both deps. The mutable `queue` initialises from `renderableBlocks` and is reset whenever `renderableBlocks` changes identity.
4. **`onComplete` only fires from the recap "Terug naar dashboard" button.** Never auto-fired.
5. **Idempotency.** `submitting` flag prevents double-submit; the RPC's own `idempotency_key` is a second layer. **Drill re-shows never call `onAnswer`** — `answeredBlocks` membership gates the commit branch in `handleAnswerReport`.
6. **Audio context unchanged.** `<SessionAudioProvider audioMap>` still wraps the tree; `useAutoplay()` semantics are preserved — now applied to one card at a time (the audio race is resolved by structural collapse to one mount).
7. **Queue growth is bounded by wrong/fuzzy attempts.** Each wrong/fuzzy answer inserts exactly one entry; correct and skip never grow the queue. The re-insert index is `clamp(position + 1 + offset, queue.length)` where `offset = 3 + floor(random()*4)` ∈ [3, 6]. Spacing rolls fresh per insertion.
8. **`answeredBlocks` ⊇ `skippedBlocks` ∪ `commitFailedBlocks`.** Every id in `skippedBlocks` and `commitFailedBlocks` is also in `answeredBlocks`. `skippedBlocks` and `commitFailedBlocks` are disjoint.
9. **Completion ⇔ all capabilities resolved.** `isComplete = position >= queueLength` is equivalent to "every unique `capabilityId` in `renderableBlocks` is in `correctCapabilityIds ∪ skippedCapabilityIds`", because wrong answers always re-insert and the queue only stops growing when every capability has resolved.

---

## 5. Seams (to other modules)

### Upstream (data feeds the experience)

- **`src/lib/session/capabilitySessionLoader.ts`** — `loadCapabilitySessionPlanForUser` builds the `SessionPlan`. Called by `Session.tsx`; result becomes the `plan` prop.
- **`src/services/capabilityContentService.ts`** — `resolveCapabilityBlocks` resolves each block to a `CapabilityRenderContext`. Result map becomes the `contexts` prop.
- **`src/services/audioService.ts`** — `fetchSessionAudioMap` produces the `SessionAudioMap`. Used by `buildFeedbackInput.ts` to resolve prompt audio for listening/dictation exercises.

### Downstream (the experience consumes these)

- **`src/components/exercises/registry`** — `resolveExerciseComponent(exerciseType)` used at two callsites: filter (`ExperiencePlayer.tsx:76`) and dispatch (`CapabilityExerciseFrame.tsx:40-43`).
- **`src/components/exercises/feedbackMapping.ts`** — `feedbackPropsFor(FeedbackMapInput)` builds `ExerciseFeedback` props from the adapter output (`ExperiencePlayer.tsx:220`).
- **`src/components/exercises/primitives/ExerciseFeedback`** — the Doorgaan card rendered when `feedbackInput !== null`. Owns the "Doorgaan" button; experience module supplies `onContinue`, `continueLabel`, and `copy` only.
- **`src/components/exercises/implementations/*`** — the 12 exercise implementations rendered via `CapabilityExerciseFrame`.
- **`src/components/page/primitives/`** — `PageContainer`, `PageBody`, and `HeroCard` compose the layout. No bespoke CSS module.
- **`src/lib/answerNormalization.ts`** — `normalizeAnswerResponse` applied at the frame boundary (`CapabilityExerciseFrame.tsx:60`) for storage-side normalisation of the `AnswerReport`.
- **`src/contexts/SessionAudioContext.tsx`** — `<SessionAudioProvider audioMap>` wraps the entire tree.
- **`src/stores/authStore.ts`** — `useAuthStore().profile?.isAdmin` gates diagnostic rendering (`ExperiencePlayer.tsx:70`).

### Sibling (consumed alongside)

- **`src/pages/Session.tsx`** — hosts all I/O; experience module is a leaf.
- **`src/lib/reviews/capabilityReviewProcessor.ts`** — called by the host, not by the experience module.

---

## 6. Known limitations

1. **Wrong/fuzzy commit-fail is unrecoverable in-session.** A wrong answer whose `onAnswer` throws is committed to `commitFailedBlocks` and the user advances past it with a chip notification but no recovery path. FSRS state is not updated for that attempt. Drill re-shows of that block do not retry the commit either. Tracked in plan §11b.
2. **RecapScreen is NL-only.** Strings are hardcoded Dutch. EN port is a follow-up.
3. **No abort handling.** Unmount during in-flight commit leaves the fetch unaborted; it resolves/rejects against a dead React tree without UI consequence.
4. **Drill re-shows do not record additional events server-side.** A capability that the learner gets right only after multiple drills appears in `capability_review_events` as a single lapse (the first wrong attempt). The eventual correct attempt is UI-only — it does not advance FSRS state again within the same session. Subsequent sessions schedule against the lapse outcome.
5. **No max-attempts cap on drilling.** A capability stays in the queue forever if every drill is wrong. The skip button is the only learner-facing escape. If a stuck loop is suspected, look at `answeredBlocks` membership (the first-attempt set) vs `correctCapabilityIds`/`skippedCapabilityIds` (resolution sets).

---

## 7. What this spec does NOT cover

- The block-planner upstream — `src/lib/session/capabilitySessionLoader.ts`.
- The capability-content resolver — `src/services/capabilityContentService.ts`.
- The exercise registry and its 12 implementations — `src/components/exercises/registry.ts` and `implementations/`.
- The `commit_capability_answer_report` RPC and FSRS logic — `src/lib/reviews/capabilityReviewProcessor.ts`.
- The audio map, TTS URL convention, storage bucket — `src/services/audioService.ts`.
- The autoplay/listening preferences (`AutoplayContext`, `ListeningContext`).
- The `feedbackPropsFor` mapper and `ExerciseFeedback` primitive — `src/components/exercises/feedbackMapping.ts` + `primitives/` module spec.
