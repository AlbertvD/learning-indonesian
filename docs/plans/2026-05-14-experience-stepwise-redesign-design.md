---
status: approved
---

# Experience module — stepwise redesign

**Module touched:** `src/components/experience/` (see before-spec at `docs/current-system/modules/experience.md`).

**Surface area changed:** the session shell that today renders every block at once as a feed. Replace with a one-card-at-a-time stepper that auto-advances on correct, pauses on a Doorgaan screen on fuzzy / wrong, ends on a recap screen.

**Surface area unchanged:**
- `src/pages/Session.tsx` host — same `<ExperiencePlayer>` mount, same prop shape.
- `src/services/capabilityContentService.ts` — content resolver.
- `src/lib/session/capabilitySessionLoader.ts` — plan builder.
- `src/components/exercises/registry.ts` and every `implementations/*` — unchanged.
- `src/components/exercises/primitives/*` — unchanged.
- `src/lib/reviews/capabilityReviewProcessor.ts` and the `commit_capability_answer_report` RPC — unchanged.
- `src/services/audioService.ts` and the audio contexts — unchanged.

---

## 1. Why

Production bug reported 2026-05-14: starting a session plays N audio clips simultaneously. Root cause is structural — `ExperiencePlayer` renders every renderable block at once (`ExperiencePlayer.tsx:129-160`); each exercise implementation autoplays independently on mount. The before-spec calls this out as known-limitation §6.1.

The deeper problem behind the audio bug is that the current UX violates the single-card focus model the rest of the app and the legacy `ExerciseShell` (deleted in commit `4d00b6d`, 2026-05-02) assumed. The Doorgaan feedback screen (`ExerciseFeedback` primitive + `feedbackPropsFor` helper) still ships in the bundle and is wired across every exercise type — but is unreachable from the current shell.

Resurrecting the single-card flow restores: (a) per-card focus, (b) per-card audio sanity, (c) feedback-on-mistake learning loop, (d) framework adherence — the bespoke `ExperiencePlayer.module.css` is dropped entirely. The user's pedagogical loop returns to "see one card → answer → see correction if wrong → next".

The architecture beneath the shell (capability scheduler, content resolver, RPC commit, FSRS) is already correct; only the shell changes.

---

## 2. Goals & non-goals

### Goals

1. Render exactly **one** renderable block on screen at a time.
2. **Correct + not fuzzy** → auto-advance to next block instantly (no extra tap).
3. **Fuzzy or wrong** → show a Doorgaan screen with the correct answer + explanation; "Doorgaan" button advances.
4. **Auto-advance reduces simultaneous-mount audio** to one card at a time, restoring `useAutoplay()` to single-card semantics.
5. Replace the bespoke `ExperiencePlayer.module.css` shell with composition of existing `PageContainer` / `PageBody` + Mantine primitives (`Progress`, `Button`, `Group`, `Stack`).
6. Surface commit-RPC failures via `notifications.show()`, matching CLAUDE.md error-handling rules (lines 131-154).
7. Hide planner diagnostics from non-admin users; keep them visible to admins in a small collapsible.
8. End with a dedicated recap screen with the legacy `RecapBlock` content (hero + counts + per-card list + "Terug naar dashboard").

### Non-goals

1. **No data-layer changes.** Plan builder, content resolver, RPC, FSRS are out of scope.
2. **No host changes.** `Session.tsx` keeps the same `<ExperiencePlayer plan, contexts, audioMap, userLanguage, onAnswer, onComplete>` mount.
3. **No new tables, schema migrations, or RLS changes.** Pure UI.
4. **No `AbortController`-on-unmount.** YAGNI; session-close behaviour is emergent from the RPC's `greatest(ended_at, submittedAt)` upsert.
5. **No user-facing "skip" button.** Skip stays internal, triggered only when `CapabilityExerciseFrame` can't render (today's behaviour).
6. **No retry-this-card UI.** Idempotency-rejected answers commit "rejected_stale" responses already; user re-attempt is a follow-up if it becomes a real workflow.
7. **No mid-session re-planning.** Plan is built once; the stepper walks through it linearly.
8. **No new module spec.** The before-spec covers today's surface; after-spec lands in the implementation commit per CLAUDE.md "When to update a module spec".

---

## 3. Public interface (unchanged)

The component keeps its current external shape so the host doesn't change:

```typescript
export function ExperiencePlayer(props: {
  plan: SessionPlan
  contexts: Map<string, CapabilityRenderContext>   // keyed by block.id
  audioMap: SessionAudioMap
  userLanguage: 'nl' | 'en'
  onAnswer: (event: SessionAnswerEvent) => Promise<void>
  onComplete: () => void
}): JSX.Element
```

`SessionAnswerEvent` (`types.ts:4-13`) keeps its shape — including `pendingActivation: boolean` (carried through unchanged, populated from `block.pendingActivation` like today).

---

## 4. UX specification (decisions 1–16, normative)

### 4.1 Answer-flow state machine

For each block (one at a time):

| Outcome from `CapabilityExerciseFrame` | Doorgaan screen shown? | Auto-advance? | Toast? |
|---|---|---|---|
| `correct` + `!fuzzy` + commit OK | no | yes | no |
| `correct` + `!fuzzy` + commit fails | no | yes | yellow "couldn't save — we'll retry later" |
| `fuzzy` + commit OK | yes (`outcome='fuzzy'`, shows canonical) | only after Doorgaan-continue tap | no |
| `fuzzy` + commit fails | yes (`outcome='fuzzy'`, with commit-failed chip) | only after Doorgaan-continue tap | no |
| `wrong` + commit OK | yes (`outcome='wrong'`, shows correct + explanation) | only after Doorgaan-continue tap | no |
| `wrong` + commit fails | yes (`outcome='wrong'`, with commit-failed chip) | only after Doorgaan-continue tap | no |
| internal skip (registry error / `'skipped' in outcome`) | no | yes, immediately | no |

**Toast rule (resolves §4.1↔§4.5 ambiguity):** The yellow toast fires **iff there is no Doorgaan card carrying the chip** — i.e. only on the `correct + commit fails` row. For `fuzzy/wrong + commit fails`, the chip on the Doorgaan card already carries the same user-visible signal, so the toast is suppressed to avoid duplicate noise. `logError` always fires regardless of which surface carries the user-visible message (see §4.5).

`commitFailed` chip lifted from legacy `ExerciseShell.tsx:236-237` and rendered inline on the Doorgaan card via `feedbackPropsFor({ commitFailed: true, ... })` — the `ExerciseFeedback` primitive already supports it.

### 4.2 Per-card UI

- **Header** (above each card): horizontal Mantine `<Progress value={progress}>` plus text `Oefening ${currentIndex + 1} van ${effectiveTotal}` left and `${correctCount}/${currentIndex} correct` right. Both pulled from local state (see §6).
- **Body**: the current block's exercise via `CapabilityExerciseFrame`. Audio autoplays on mount (respects `useAutoplay()`).
- **Doorgaan card** (when active): replaces the body. Built via `feedbackPropsFor(buildFeedbackInput(...))` (§4.8). The "Doorgaan" button is **rendered by `<ExerciseFeedback>` itself** (`primitives/ExerciseFeedback.tsx:284-295`); the experience module supplies `onContinue={handleContinue}`, `continueLabel='Doorgaan'`, and `copy={FEEDBACK_COPY_NL}` (or `_EN`, per `userLanguage`; see §4.6). The "Herhaal audio" button is included automatically by the primitive when the `audio: { url }` prop is set (only for `audio→ID` direction exercises, i.e. `listening_mcq` and `dictation` — see `feedbackPropsFor` cases in `feedbackMapping.ts:109-138`).

### 4.3 End of session — recap screen

When `currentIndex >= renderableBlocks.length`, swap the body for a recap screen built from existing primitives.

**Standard recap (renderableBlocks.length > 0):**
- `HeroCard` with kicker "Samenvatting" + title "Sessieroute afgerond".
- Lede line `${savedCount} van ${effectiveTotal} vaardigheidskaarten zijn veilig opgeslagen.`, where `savedCount = answeredBlocks.size - skippedBlocks.size - commitFailedBlocks.size`. Only commit-OK answers count as "veilig opgeslagen"; skipped and commit-failed blocks are excluded from this count to keep the copy literal.
- When `commitFailedBlocks.size > 0`, append a second sentence. Singular/plural switch:
  - `n === 1`: `1 antwoord kon niet worden opgeslagen — we proberen het later opnieuw.`
  - `n >= 2`: `${n} antwoorden konden niet worden opgeslagen — we proberen ze later opnieuw.`
  - Omit entirely when zero so the recap reads clean on the happy path.
- Three-cell counter grid: `${savedDue}/${effectiveDueCount} herhaald`, `${savedNew}/${effectiveNewCount} geïntroduceerd`, `${Math.max(effectiveTotal - answeredBlocks.size, 0)} niet aangeraakt`. `savedDue`/`savedNew` are computed from `renderableBlocks ∩ (answeredBlocks − skippedBlocks − commitFailedBlocks)` partitioned by `kind`.
- Per-card `<ul>` listing each renderable block in order. Kicker resolves as: `commitFailedBlocks.has(b.id)` → "Niet opgeslagen"; else `skippedBlocks.has(b.id)` → "Overgeslagen"; else `b.kind === 'due_review'` → "Herhaling opgeslagen"; else → "Introductie gestart". Followed by the exercise label from `exerciseLabel(b.renderPlan.exerciseType)` (`src/lib/session/sessionLabels.ts`).
- Primary action: "Terug naar dashboard" → `onComplete()`.

**Empty-state recap (renderableBlocks.length === 0):**
- `HeroCard` kicker "Samenvatting" + title "Niets te doen".
- Lede: "Er zijn geen kaarten beschikbaar voor deze sessie."
- Counter grid + per-card list **hidden**.
- Primary action: "Terug naar dashboard" → `onComplete()`.

This is reachable on first paint when the planner returns a plan with all blocks silent-filtered (`exerciseItem === null` for every block) — `isComplete = currentIndex >= renderableBlocks.length` is `0 >= 0 = true` immediately. `onComplete()` is still wired so the user can leave.

### 4.4 Diagnostics

- Read `useAuthStore().profile?.isAdmin`.
- Non-admin: do not render `plan.diagnostics` anywhere.
- Admin: render a vanilla `<details>` element under the progress header (no Mantine `<Accordion>` — single-item collapsibles don't justify the wrapper). One `<p>` per diagnostic with `reason` + `details`. Closed by default (`<details>` without `open` attribute).

### 4.5 Commit-failure surface

- **Toast**: `notifications.show({ color: 'yellow', title: 'Antwoord niet opgeslagen', message: 'We proberen het later opnieuw.' })` fires **only on `correct + commit fails`** (the path with no Doorgaan card to carry the chip). See §4.1 toast rule.
- **Chip**: for Doorgaan-bound outcomes (`fuzzy`, `wrong`), pass `commitFailed: true` to `feedbackPropsFor` so the Doorgaan card renders the inline `commitFailed` chip (`ExerciseFeedback.tsx:162-167`).
- **Always**: `logError({ page: 'session', action: 'commitAnswer', error: err })`. Slug `'session'` matches existing host-side log calls (`Session.tsx:128,137`); no new slug.
- **Never** block advance. The user is not held hostage by a network blip.
- **Known regression vs legacy** (also recorded in §11a): a wrong/fuzzy answer whose commit fails is **not recoverable** in this design — the user advances past it and FSRS never records the attempt. The chip on the Doorgaan card tells the user, but there is no "retry this card" UI. This trades availability for simplicity per §2 non-goal #6; if real users hit this often it gets a follow-up plan.

### 4.6 Feedback copy + i18n

`<ExerciseFeedback>` requires a complete `FeedbackCopy` bundle (`primitives/ExerciseFeedback.tsx:63-81`, 17 keys) and a `continueLabel` string — neither is supplied by `feedbackPropsFor`.

**File location:** `src/components/experience/feedbackCopy.ts` (new). Exports:
- `FEEDBACK_COPY_NL: FeedbackCopy` — moved verbatim from `src/pages/admin/DesignLab.tsx:28-46` (the only existing definition today). DesignLab re-imports from this module after the move so there is exactly one source of truth.
- `FEEDBACK_COPY_EN: FeedbackCopy` — new sibling. EN strings authored alongside the NL strings for parity (see Appendix A).
- `CONTINUE_LABEL_NL = 'Doorgaan'`, `CONTINUE_LABEL_EN = 'Continue'`.
- Helper: `feedbackCopyFor(userLanguage: 'nl' | 'en'): { copy: FeedbackCopy; continueLabel: string }`.

The experience module imports `feedbackCopyFor(userLanguage)` once per render and spreads the result into the `<ExerciseFeedback>` props. No runtime fallback — the existing `userLanguage: 'nl' | 'en'` prop already constrains the input.

**Appendix A — `FEEDBACK_COPY_EN` values** (drop-in mirror of the NL bundle):

| Key | NL (existing) | EN (new) |
|---|---|---|
| outcomeCorrect | Correct | Correct |
| outcomeAlmost | Bijna goed | Almost |
| outcomeWrong | Fout | Wrong |
| announceCorrect | Correct | Correct |
| announceWrong | Fout. Het juiste antwoord is {x}. | Wrong. The correct answer is {x}. |
| announceFuzzy | Bijna goed — het antwoord is {x}. | Almost — the answer is {x}. |
| roleLabelHeard | Je hoorde | You heard |
| roleLabelShown | Je zag | You saw |
| roleLabelSaid | Het woord was | The word was |
| roleLabelTarget | Juist antwoord | Correct answer |
| roleLabelYourAnswer | Jouw antwoord | Your answer |
| roleLabelMeaning | Betekent | Means |
| roleLabelExplanation | Uitleg | Explanation |
| alsoAccepted | Ook goed | Also accepted |
| replayAudio | Herhaal audio | Replay audio |
| commitFailed | Kon beoordeling niet opslaan — we gaan toch door. | Couldn't save the review — moving on anyway. |
| emptyAnswer | (geen antwoord) | (no answer) |

### 4.7 Silent-skipped blocks

The §4.7 filter widens to drop two kinds of unrenderable blocks: those with no resolved content AND those whose exercise type has no registry entry. This eliminates the "stranded blank screen" failure mode (§4.7a category 2):

```typescript
const renderableBlocks = useMemo(
  () => plan.blocks.filter(b => {
    const ctx = contexts.get(b.id)
    if (!ctx?.exerciseItem) return false
    if (!resolveExerciseComponent(b.renderPlan.exerciseType)) return false
    return true
  }),
  [plan.blocks, contexts],
)
```

`resolveExerciseComponent` (`src/components/exercises/registry.ts:103-105`) returns `null` for any `ExerciseType` not in the `exerciseRegistry` Partial Record. Registry-missing blocks are silent-filtered alongside resolution-failed blocks. The first is rare (engineering error) and the second is logged upstream — both are silent at the user layer. For category 1, failure is already logged by `capabilityContentService.resolveBlocks` to `capability_resolution_failure_events`. For category 2 (registry-missing), the filter emits a one-time `logError({ page: 'session', action: 'registryMissing', error: new Error(...) })` per filter run so it surfaces in `indonesian.error_logs`.

### 4.7a Skip-bucket semantics (registry / error-boundary skip)

Three categories of "the user didn't answer this block":

1. **Silent-filter skip** (§4.7): `exerciseItem === null` → block never enters `renderableBlocks` → not visible in any count or list.
2. **Registry-miss filter** (§4.7): `resolveExerciseComponent(exerciseType) === null` → block also filtered at the same boundary as category 1. Logged once per filter run. Not visible in any count or list.
3. **Error-boundary skip**: an exercise threw during render after passing both filters → `ExerciseErrorBoundary` catches and emits a `'skipped' in outcome` outcome → `CapabilityExerciseFrame` calls `onSkip(block.id)`. This is the only path where `handleSkip` runs in the shell.

For category 3, `handleSkip` adds the block id to **both** `answeredBlocks` (to maintain "this block has been processed" semantics so the index can advance) and `skippedBlocks` (to drive recap kicker copy). `correctCount` is not incremented. No user-visible toast.

This matches the legacy behaviour (before-spec §4.4: "Skipped blocks count as 'answered' in `answeredBlocks` and so appear in the changes list") with one refinement: a dedicated `skippedBlocks` Set lets the recap show a distinct "Overgeslagen" kicker per §4.3 instead of mislabeling them as "Herhaling opgeslagen" / "Introductie gestart".

### 4.8 Feedback-input adapter

Internal helper `buildFeedbackInput` lives in `src/components/experience/ExperiencePlayer.tsx` (file-local — promote to its own module only if a second consumer appears). Signature:

```typescript
function buildFeedbackInput(args: {
  block: SessionBlock
  context: CapabilityRenderContext
  response: string | null
  outcome: 'fuzzy' | 'wrong'   // correct never routes here (auto-advance)
  userLanguage: 'nl' | 'en'
  audioMap: SessionAudioMap
  commitFailed: boolean
}): FeedbackMapInput
```

Derivations:
- `item`: `context.exerciseItem` (non-null by §4.7 filter).
- `response`, `outcome`, `userLanguage`, `commitFailed`: direct pass-through.
- `isGrammar`: `GRAMMAR_CAPABILITY_TYPES.has(block.renderPlan.capabilityType)`, where `GRAMMAR_CAPABILITY_TYPES = new Set(['pattern_recognition', 'pattern_contrast'])` (the two grammar-pattern capability types in `src/lib/capabilities/capabilityTypes.ts:32-44`). Only consumed by `cloze_mcq` cases in `feedbackPropsFor` to route layout between `vocab-pair` and `grammar-reveal`.
- `acceptedVariants`: `context.exerciseItem.answerVariants.filter(v => v.is_accepted).map(v => v.variant_text)`. The field on `ItemAnswerVariant` is `variant_text: string` and `is_accepted: boolean` (`src/types/learning.ts:60-68`). The `is_accepted` filter excludes anti-example / disallowed shortcut variants the pipeline records but the user must not see in "Ook goed". The `feedbackPropsFor` cases that internally derive variants from data shapes (`sentence_transformation`, `constrained_translation`) ignore this field; the `cloze_mcq` case ignores it entirely (does not include `acceptedVariants` in its returned shape); the typed-recall / dictation / cloze / mcq paths surface it as the "Ook goed" line.
- `promptAudioUrl`: only set for `exerciseType ∈ {'listening_mcq', 'dictation'}` (the two `audio→ID` cases in `feedbackMapping.ts:109-138`). Resolved via `resolveSessionAudioUrl(audioMap, context.exerciseItem.learningItem?.base_text, voiceId)` (the same helper Session.tsx uses; see `src/services/audioService.ts`). `learningItem` is typed `LearningItem | null` on `ExerciseItem` (`learning.ts:178`); when `null`, skip resolution and leave `promptAudioUrl: undefined`. For other exercise types: `undefined`.

This adapter is a pure function with no side effects, easy to unit-test against the 12 exercise types.

---

## 5. Module structure (after)

```
src/components/experience/
  ExperiencePlayer.tsx                          REWRITTEN — stepwise shell (see §6)
  CapabilityExerciseFrame.tsx                   unchanged — same dispatcher, same props
  RecapScreen.tsx                               NEW — extracted recap surface; replaces blocks/RecapBlock.tsx
  feedbackCopy.ts                               NEW — `FEEDBACK_COPY_NL/EN` + `feedbackCopyFor(userLanguage)` (see §4.6)
  types.ts                                      unchanged — `SessionAnswerEvent`
  __tests__/buildFeedbackInput.test.ts          NEW — co-located unit test (see §9 scenario 16)
  __tests__/feedbackCopy.test.ts                NEW — co-located unit test (see §9 scenario 17)
  ExperiencePlayer.module.css                   DELETED — feed-shell CSS no longer needed
  blocks/                                       DELETED — WarmInputBlock, DueReviewBlock, NewIntroductionBlock, RecapBlock all gone (folded into ExperiencePlayer + RecapScreen)
```

`src/pages/admin/DesignLab.tsx` updates its import to pull `FEEDBACK_COPY_NL` from `@/components/experience/feedbackCopy` instead of defining it inline (`DesignLab.tsx:28-46` → re-export). DesignLab's display behaviour is unchanged.

`adminOverlay` plumb-through (formerly mentioned here) is **deferred** — it's not strictly required for the audio-bug fix and would expand scope. Tracked separately if needed.

LOC change: roughly −230 lines (the four block files + the CSS module ≈ −400; new `ExperiencePlayer.tsx` ≈ 170; new `RecapScreen.tsx` ≈ 60; new `feedbackCopy.ts` ≈ 40; net −230).

The decision to keep `RecapScreen` as a sibling file rather than inline it in `ExperiencePlayer`: the recap is the only sub-surface that has its own visual identity (hero + lists). Extracting it keeps `ExperiencePlayer` focused on the stepper. Lift is small (~60 LOC) and isolated.

The four `blocks/*` files are deleted because their per-kind variations (kicker copy, pill colour, "answered" status text) are trivially-inlined header text in the new layout — there's no second-kind reuse left.

---

## 6. Component sketch

```typescript
interface FeedbackState {
  block: SessionBlock
  context: CapabilityRenderContext
  outcome: 'fuzzy' | 'wrong'
  response: string | null
  commitFailed: boolean
}

export function ExperiencePlayer(props: ExperiencePlayerProps) {
  const { plan, contexts, audioMap, userLanguage, onAnswer, onComplete } = props
  const { profile } = useAuthStore()

  const loggedRegistryMissRef = useRef(false)

  const renderableBlocks = useMemo(() => {
    const out: SessionBlock[] = []
    let registryMisses = 0
    for (const b of plan.blocks) {
      const ctx = contexts.get(b.id)
      if (!ctx?.exerciseItem) continue
      if (!resolveExerciseComponent(b.renderPlan.exerciseType)) {
        registryMisses += 1
        continue
      }
      out.push(b)
    }
    if (registryMisses > 0 && !loggedRegistryMissRef.current) {
      loggedRegistryMissRef.current = true
      logError({
        page: 'session',
        action: 'registryMissing',
        error: new Error(`Filtered ${registryMisses} block(s) with missing exercise registry entry`),
      })
    }
    return out
  }, [plan.blocks, contexts])

  // effectiveTotal === renderableBlocks.length throughout; bind for header copy clarity.
  const effectiveTotal = renderableBlocks.length

  const [currentIndex, setCurrentIndex] = useState(0)
  const [answeredBlocks, setAnsweredBlocks] = useState<Set<string>>(() => new Set())
  const [skippedBlocks, setSkippedBlocks] = useState<Set<string>>(() => new Set())
  const [commitFailedBlocks, setCommitFailedBlocks] = useState<Set<string>>(() => new Set())
  const [correctCount, setCorrectCount] = useState(0)
  const [feedback, setFeedback] = useState<FeedbackState | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const isComplete = currentIndex >= effectiveTotal
  const currentBlock = renderableBlocks[currentIndex]
  const progress = effectiveTotal === 0 ? 100 : Math.round((currentIndex / effectiveTotal) * 100)

  const { copy: feedbackCopy, continueLabel } = feedbackCopyFor(userLanguage)

  async function handleAnswerReport(report: AnswerReport) {
    if (!currentBlock || submitting) return
    setSubmitting(true)
    const wasCorrect = report.wasCorrect && !report.isFuzzy
    let commitFailed = false
    try {
      await onAnswer({
        sessionId: plan.id,
        blockId: currentBlock.id,
        blockKind: currentBlock.kind,
        capabilityId: currentBlock.capabilityId,
        canonicalKeySnapshot: currentBlock.canonicalKeySnapshot,
        exerciseType: currentBlock.renderPlan.exerciseType,
        answerReport: report,
        pendingActivation: currentBlock.pendingActivation ?? false,
      })
    } catch (err) {
      commitFailed = true
      logError({ page: 'session', action: 'commitAnswer', error: err })
      if (wasCorrect) {
        // Correct + commit-fail is the only path without a Doorgaan chip — toast it.
        notifications.show({
          color: 'yellow',
          title: 'Antwoord niet opgeslagen',
          message: 'We proberen het later opnieuw.',
        })
      }
    }
    // React 18+ batches all set* within an event handler into one render;
    // ordering of these calls doesn't matter for paint, but grouping the
    // state-update block after the try/catch keeps the success-path
    // semantics readable.
    setSubmitting(false)
    setAnsweredBlocks(s => { const n = new Set(s); n.add(currentBlock.id); return n })
    if (commitFailed) {
      setCommitFailedBlocks(s => { const n = new Set(s); n.add(currentBlock.id); return n })
    }
    if (report.wasCorrect) setCorrectCount(n => n + 1)

    if (wasCorrect) {
      setCurrentIndex(i => i + 1)
    } else {
      setFeedback({
        block: currentBlock,
        context: contexts.get(currentBlock.id)!,
        outcome: report.isFuzzy ? 'fuzzy' : 'wrong',
        response: report.rawResponse,
        commitFailed,
      })
    }
  }

  function handleSkip(blockId: string) {
    if (!currentBlock || currentBlock.id !== blockId) return
    setAnsweredBlocks(s => { const n = new Set(s); n.add(blockId); return n })
    setSkippedBlocks(s => { const n = new Set(s); n.add(blockId); return n })
    setCurrentIndex(i => i + 1)
  }

  function handleContinue() {
    setFeedback(null)
    setCurrentIndex(i => i + 1)
  }

  if (isComplete) {
    return (
      <SessionAudioProvider audioMap={audioMap}>
        <PageContainer size="md">
          <PageBody>
            <RecapScreen
              renderableBlocks={renderableBlocks}
              answeredBlocks={answeredBlocks}
              skippedBlocks={skippedBlocks}
              commitFailedBlocks={commitFailedBlocks}
              onComplete={onComplete}
            />
          </PageBody>
        </PageContainer>
      </SessionAudioProvider>
    )
  }

  const feedbackInput = feedback
    ? buildFeedbackInput({
        block: feedback.block,
        context: feedback.context,
        response: feedback.response,
        outcome: feedback.outcome,
        userLanguage,
        audioMap,
        commitFailed: feedback.commitFailed,
      })
    : null

  return (
    <SessionAudioProvider audioMap={audioMap}>
      <PageContainer size="md">
        <PageBody>
          <SessionHeader
            currentIndex={currentIndex}
            total={effectiveTotal}
            correctCount={correctCount}
            progress={progress}
            diagnostics={profile?.isAdmin ? plan.diagnostics : []}
          />
          {feedbackInput
            ? <ExerciseFeedback
                {...feedbackPropsFor(feedbackInput)}
                copy={feedbackCopy}
                continueLabel={continueLabel}
                onContinue={handleContinue}
              />
            : <CapabilityExerciseFrame
                block={currentBlock}
                context={contexts.get(currentBlock.id)!}
                userLanguage={userLanguage}
                onAnswerReport={handleAnswerReport}
                onSkip={handleSkip}
              />}
        </PageBody>
      </PageContainer>
    </SessionAudioProvider>
  )
}
```

`SessionHeader` is inlined in the same file (not promoted to a new primitive unless a second consumer appears).

`RecapScreen` signature:

```typescript
export function RecapScreen(props: {
  renderableBlocks: SessionBlock[]
  answeredBlocks: Set<string>          // includes skipped + commit-failed (supersedes both)
  skippedBlocks: Set<string>           // error-boundary skips, ⊂ answeredBlocks
  commitFailedBlocks: Set<string>      // wrong/fuzzy/correct that threw on commit, ⊂ answeredBlocks, disjoint from skippedBlocks
  onComplete: () => void
}): JSX.Element
```

Internally:
- If `renderableBlocks.length === 0` → empty-state recap per §4.3.
- Otherwise, computes `effectiveTotal`, `effectiveDueCount`, `effectiveNewCount` from `renderableBlocks` and `savedDue`, `savedNew`, `savedCount` from `renderableBlocks ∩ (answeredBlocks − skippedBlocks − commitFailedBlocks)` (filtered by `kind`).
- Renders the per-card `<ul>` with kicker resolution per §4.3 (commit-failed → "Niet opgeslagen", else skipped → "Overgeslagen", else by kind).
- "Terug naar dashboard" `<button>` fires `onComplete()`.

Note: `RecapScreen` doesn't take `userLanguage` because today's recap is NL-only (legacy `RecapBlock.tsx` is hardcoded NL). EN port is a follow-up.

---

## 7. Invariants (after)

1. **Exactly one of {exercise body, Doorgaan card, recap screen} is rendered at any time.** Mutually exclusive by state machine: `isComplete` short-circuits to recap; within the not-complete branch, `feedbackInput !== null` chooses Doorgaan, else exercise body. No render path produces two.
2. **`currentIndex` only advances forward.** No back-button, no rewind. The legacy shell had the same constraint.
3. **`renderableBlocks` is derived once per `plan` / `contexts` change.** Re-computing per render is safe but `useMemo` is kept for stability of identity across child renders.
4. **`onComplete` only fires from the recap "Terug naar dashboard" button.** Never auto-fired at index ≥ length — the user always sees the recap first.
5. **Idempotency.** `submitting` guard plus the `commit_capability_answer_report` RPC's own `idempotency_key` mean re-clicks of a submit button cannot double-commit. `idempotency_key` is still `${userId}:${sessionId}:${blockId}:1` — minted by the host in `Session.tsx:160`, never by the experience module. The `submitting` flag is released in the same render cycle that advances `currentIndex` or sets `feedback`, so a fast double-tap after the guard releases lands on a different card (or on Doorgaan), not on a duplicate commit.
6. **Each Session mount mints a fresh `sessionId`.** `Session.tsx:88` is preserved. This is what closes the previous session row server-side (see §11).
7. **Audio context unchanged.** `<SessionAudioProvider audioMap>` still wraps the tree; every exercise still calls `useSessionAudio()` + `useAutoplay()` exactly as today.
8. **`answeredBlocks` is a superset of `skippedBlocks` and `commitFailedBlocks`.** Every block id in `skippedBlocks` and `commitFailedBlocks` is also in `answeredBlocks` (`handleSkip` and `handleAnswerReport` always add to `answeredBlocks` first). `skippedBlocks` and `commitFailedBlocks` are themselves disjoint — a skipped block didn't reach the RPC, so it can't have been commit-failed.
9. **Doorgaan card is owned by `<ExerciseFeedback>`.** The Doorgaan button is rendered by the primitive (`primitives/ExerciseFeedback.tsx:284-295`); the experience module supplies `onContinue`, `continueLabel`, and `copy` only.

---

## 8. Edge cases (decisions 1–16 indexed to §4)

| # | Case | Decision | Where it's handled |
|---|---|---|---|
| 1 | correct + not fuzzy | auto-advance | §4.1 row 1 |
| 2 | fuzzy | Doorgaan with `outcome='fuzzy'` | §4.1 rows 3-4 |
| 3 | wrong | Doorgaan with `outcome='wrong'` + explanation | §4.1 rows 5-6 |
| 4 | correct + commit fails | auto-advance, yellow toast | §4.1 row 2, §4.5 |
| 5 | wrong/fuzzy + commit fails | Doorgaan with commit-failed chip, no toast | §4.1 rows 4, 6, §4.5 |
| 6 | autoplay on active card | yes, default preference | §4.2 (`useAutoplay()` unchanged) |
| 7 | replay-audio on Doorgaan | yes, via `audio` prop set by `feedbackPropsFor` for `audio→ID` direction | §4.2, §4.8 |
| 8 | `adminOverlay` plumb-through | deferred — out of scope for this PR | §5 |
| 9 | user-facing skip button | none | §2 non-goal #5 |
| 10 | silent-skipped blocks | filter, denominator reflects renderable | §4.7 |
| 11 | progress indicator | top horizontal Mantine `<Progress>` | §4.2, §6 |
| 12 | recap screen | legacy-rich + dedicated empty-state | §4.3 |
| 13 | diagnostics | admin-only collapsible | §4.4 |
| 14 | submission error UI | `notifications.show` (correct path) + `commitFailed` chip (Doorgaan path) | §4.5 |
| 15 | abort on unmount | none; session-close emergent from RPC | §11 |
| 16 | pendingActivation | pure pass-through, unchanged | §3, §6 sketch |

---

## 9. Testing

Vitest + @testing-library/react, following the user-perspective testing rules in CLAUDE.md (lines 320-356). All Supabase access is mocked via `vi.mock('@/lib/supabase')` at the host level; `ExperiencePlayer` is exercised directly with hand-built `plan`, `contexts`, and `audioMap` props.

### Existing test file disposition

`src/__tests__/ExperiencePlayer.test.tsx` is **replaced wholesale**. Today's assertions encode the legacy feed-all-at-once invariants (e.g. "answered state appears in place", multiple stub exercises on screen at once); those invariants are intentionally broken by this redesign. The stub-exercise harness (`vi.mock('@/components/exercises/registry', ...)` and the `StubExercise` component, `:13-42`) is preserved and reused — it's a fine test fixture for the stepwise flow.

### Scenarios

1. **Renders the first block on mount.** Given a 3-block plan with three resolved contexts, the user sees exercise 1's prompt (one stub on screen), not exercises 2 or 3.
2. **Correct + not fuzzy auto-advances.** User clicks "Mark correct" → `onAnswer` called once → screen now shows exercise 2's stub. No Doorgaan screen flashes (no "Doorgaan" button visible during the transition).
3. **Wrong shows Doorgaan, advances on Doorgaan tap.** User clicks "Mark wrong" → Doorgaan screen appears with the correct answer text and the user's response → user clicks the Doorgaan button → screen shows exercise 2.
4. **Fuzzy shows Doorgaan with fuzzy copy.** Stub fires `wasCorrect: true, isFuzzy: true` → Doorgaan screen appears with `outcomeAlmost` badge text and the user's near-match in the diff pair.
5. **Commit failure on correct triggers toast and still auto-advances.** Mock `onAnswer` to reject → assert `notifications.show` called with `color: 'yellow'`, screen advances to exercise 2. No Doorgaan screen.
6. **Commit failure on wrong shows commit-failed chip on Doorgaan, no toast.** Mock `onAnswer` to reject + click "Mark wrong" → Doorgaan card renders `commitFailed` chip text (e.g. "Kon beoordeling niet opslaan"); `notifications.show` is NOT called; tapping continue still advances.
7. **Commit failure on fuzzy shows commit-failed chip on Doorgaan, no toast.** Mirror of #6 for `isFuzzy: true`.
8. **Recap screen renders after last block.** After answering all 3 blocks correctly (all commits OK), screen shows recap with `3 van 3 ... opgeslagen` text and an enabled "Terug naar dashboard" button. No "Niet opgeslagen" subline.
9. **Empty-state recap renders when zero renderable blocks.** Plan with 3 blocks, all contexts have `exerciseItem === null` → on first paint, recap shows "Niets te doen" + "Er zijn geen kaarten beschikbaar voor deze sessie." (no counter grid, no per-card list); clicking "Terug naar dashboard" calls `onComplete`.
9a. **Recap headline excludes commit-failed blocks from `savedCount`.** 3-block plan; answer block 1 correctly with commit OK, block 2 wrong (commit OK), block 3 wrong with `onAnswer` rejected → recap headline reads "1 van 3 vaardigheidskaarten zijn veilig opgeslagen." + the singular-form subline "1 antwoord kon niet worden opgeslagen — we proberen het later opnieuw." (per §4.3 singular branch). Per-card list shows "Niet opgeslagen" for block 3. (A separate scenario with two commit failures asserts the plural-form subline "2 antwoorden konden niet worden opgeslagen — we proberen ze later opnieuw.")
9b. **Registry-missing blocks are silent-filtered.** Plan with 3 blocks where block 2's `renderPlan.exerciseType` is removed from the registry (mock `resolveExerciseComponent` to return `null` for that type) → progress reads "Oefening 1 van 2"; block 2 never appears.
10. **`onComplete` fires from recap button only.** Assert `onComplete` is not called automatically after the last answer; only after the user clicks the recap button. The previous-test assertion that `onComplete` fires at the end is removed.
11. **Diagnostics hidden for non-admin.** Plan with diagnostics + non-admin profile → diagnostic text absent from DOM. Admin profile → diagnostic text present in a closed `<details>`/collapsible.
12. **Silent-skipped blocks filtered.** Plan with 3 blocks, contexts for 2 of them (third `exerciseItem === null`) → progress reads "Oefening 1 van 2".
13. **Skip path advances without counting toward correct.** When the stub fires `{ skipped: true, reviewRecorded: false }` (the registry skip outcome), screen advances and `correctCount` doesn't increment; the skipped block id ends up in `skippedBlocks`, surfacing as "Overgeslagen" in the recap.
14. **Idempotency guard.** Rapid double-click on "Mark correct" invokes `onAnswer` exactly once.
15. **Audio provider wraps the tree.** A child component calling `useSessionAudio()` retrieves the prop-supplied `audioMap`.
16. **`buildFeedbackInput` unit tests.** Adapter table — for each of the 12 exercise types, the helper produces the right `isGrammar` / `acceptedVariants` / `promptAudioUrl` derivations (especially: `pattern_recognition` and `pattern_contrast` capability types set `isGrammar: true`; `listening_mcq` and `dictation` produce `promptAudioUrl`; others leave it `undefined`). Co-located unit tests under `src/components/experience/__tests__/buildFeedbackInput.test.ts` (new file).
17. **`feedbackCopyFor` returns NL and EN bundles.** `feedbackCopyFor('nl').copy.outcomeCorrect === 'Correct'`, `.continueLabel === 'Doorgaan'`; `feedbackCopyFor('en').copy.outcomeAlmost === 'Almost'`, `.continueLabel === 'Continue'`. Co-located test alongside the new module.

No new e2e tests; the Playwright loop we ran today (login → start session → see N exercises) becomes "login → start session → see 1 exercise → answer → see next".

---

## 10. Migration / rollout

Single-PR change. Branch off `main`, redesign the experience module in place, ship as one commit (the redesign is a self-contained refactor that can't land partially without breaking the running app).

The commit also touches `src/pages/admin/DesignLab.tsx`: replace the inline `FEEDBACK_COPY_NL` constant (`DesignLab.tsx:28-46`) with an import from the new `@/components/experience/feedbackCopy` module. Behaviour-preserving — DesignLab continues to render every feedback variant with the same NL copy.

Two new co-located test files (`__tests__/buildFeedbackInput.test.ts`, `__tests__/feedbackCopy.test.ts`) land in the same commit. The replaced `src/__tests__/ExperiencePlayer.test.tsx` (rewrite, same path) also lands in the same commit.

Deployment follows the standard path: push to `main` → GHA builds image → Portainer pull + recreate the container per `docs/process/deploy.md`. The bundle that ships still picks blocks from the same plan, resolves the same contexts, commits via the same RPC — only the rendered shape differs.

Rollback: revert the PR, redeploy. No data migration to undo.

After-spec for `docs/current-system/modules/experience.md` is updated in the same commit as the code per CLAUDE.md §"When to update a module spec" (line 57-59). The before-spec landed today as a separate commit.

---

## 11. Session-close behaviour (preserved, not added)

The user requirement "when a new session starts, the previous session closes at the timestamp of its last answer" is **already enforced server-side** by the `commit_capability_answer_report` RPC (retirement #5, 2026-05-07). The RPC upserts `learning_sessions` per-answer with `ended_at = greatest(existing, submittedAt)`. When the user navigates back into `/session`, `Session.tsx:88` mints a fresh `sessionId = crypto.randomUUID()`; the old session row stops receiving commits and its `ended_at` is fixed at the last-answered timestamp.

The redesign **preserves** this invariant by:
- not changing `Session.tsx`'s `sessionId` minting,
- not adding any client-side "close" or "abort" call,
- not changing the commit-RPC payload shape.

No additional code is needed for this requirement.

---

## 11b. Known UX regression vs legacy (explicit trade)

The legacy shell let the user re-attempt a card whose commit failed (`ExperiencePlayer.tsx:60-81` set `submissionError` and left the block re-submittable). The redesign **drops this affordance**:

- Correct + commit fails → advances; yellow toast informs the user that the answer wasn't saved. The card is gone from the session view.
- Wrong/fuzzy + commit fails → Doorgaan card with `commitFailed` chip; tapping continue advances and the card is gone.

In both cases the FSRS state for that capability is **not updated** for that attempt. The user has no in-session recovery path.

**Why this is acceptable (for now):**
- CLAUDE.md error-handling rule is "every error has a meaningful, user-friendly message" — both surfaces (toast + chip) satisfy this.
- Commit failure is rare (network blip on a single RPC). The next session naturally re-shows the capability if FSRS still considers it due.
- Implementing in-session retry adds a per-card state machine (retrying / retry-failed / max-retries-reached) that the §2 non-goals deliberately scope out.

If real users hit this often enough to complain, a follow-up plan adds an explicit "Probeer opnieuw" button on the toast and on the Doorgaan chip. Captured here so the trade isn't silently re-discovered by review.

---

## 12. Supabase Requirements

### Schema changes

- None. This is a pure-UI refactor.

### homelab-configs changes

- [ ] PostgREST: N/A — no schema or table changes.
- [ ] Kong: N/A — no new endpoints; CORS origins unchanged.
- [ ] GoTrue: N/A — no auth changes.
- [ ] Storage: N/A — no new buckets.

### Health check additions

- None. The infrastructure surface tested by `make check-supabase` and `make check-supabase-deep` is unchanged.

---

## 13. Open questions

None. All 16 edge cases were enumerated and decided before this plan was written (see §8).

If the redesign uncovers an issue once running in the wild, it gets a follow-up plan with its own status: `draft` → no scope creep here.
