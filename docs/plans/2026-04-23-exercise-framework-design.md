# Exercise UI Framework Design

**Date:** 2026-04-23
**Status:** approved, ready for implementation-plan phase
**Scope:** redesign of the exercise rendering surface — 12 exercise types, session page chrome, feedback screen, admin flag workflow. Mobile-first, production-grade.
**Stack:** React 19.2 + TypeScript 6.0 + Vite (SWC) + Mantine v9.1 + Zustand 5 + React Router 7 + Supabase JS v2 + Bun.

---

## 1. Motivation

The current exercise UI (`src/components/exercises/`) is mobile-unfriendly, architecturally duplicated, and carries a feedback-screen bug that breaks for half the exercise types. A targeted mobile polish pass would leave the duplication and the feedback bug intact. This redesign instead builds a primitive-based design system and a small infrastructure layer that exercises compose from. One change → all exercises update. Adding a new exercise type is ~40 lines.

Goals:

- **Mobile-first typography and tap targets.** 16px body baseline, 44×44 min icon hitboxes, no iOS zoom-on-focus, sticky thumb-reachable actions with `env(safe-area-inset-bottom)` clearance.
- **Architectural consolidation.** One scoring state machine, one feedback screen, one registry. Every current duplication maps to a single source of truth.
- **Extensibility.** New exercise types land as thin wrappers over primitives + a registry entry + scoring config.
- **Production-grade a11y.** Every interactive primitive has defined semantics, focus behavior, and screen-reader announcement. WCAG AA passes in both themes.

Non-goals: upgrading Mantine to v9 (separate project), redesigning non-exercise pages, rewriting FSRS scheduling.

---

## 2. Today's problems (evidence from code)

- **Scoring state machine copy-pasted 12× with drift.** Each exercise hand-rolls `startTime`, `isAnswered`, `failureCount`, `showWrong`, and a 1500ms correct-delay `setTimeout` (e.g. `RecognitionMCQ.tsx:27-69`, `CuedRecallExercise.tsx:24-65`, `ContrastPairExercise.tsx:24-115`, `TypedRecall.tsx:23-66`). Subtle divergences between the 12 copies have been shipped multiple times.
- **Inline style repetition.** `padding: '16px', border: '1px solid var(--card-border)', borderRadius: 'var(--r-md)'` appears verbatim 30+ times across the 12 files (sample hits: `ExerciseShell.tsx:348, 354, 414, 427`, `ContrastPairExercise.tsx:69`, `ConstrainedTranslationExercise.tsx:44, 73`, `ClozeMcq.tsx`).
- **Badge magic-number override in 9 files.** `size="xl" fontSize: '16px' padding: '12px 20px'` — the same copy-pasted override contradicts the requested Mantine size. Found in `RecognitionMCQ.tsx:123`, `CuedRecallExercise.tsx:122`, `ContrastPairExercise.tsx:173, 187`, `SentenceTransformationExercise.tsx:155, 196`, `ConstrainedTranslationExercise.tsx:257, 323`, `TypedRecall.tsx:110`, `Cloze.tsx:115`, `MeaningRecall.tsx:103`, `Dictation.tsx:169`.
- **Admin preview is a second JSX tree inside each exercise.** `ContrastPairExercise.tsx:30-76` and `ClozeMcq.tsx:29-95` each render a completely different component tree for preview-mode. Two codepaths per exercise drift silently.
- **`ExerciseShell.tsx:163-314`** is a 12-case switch dispatching to components. Adding a 13th type requires edits in multiple files.
- **Wrong answers show both an inline Badge AND the `ExerciseShell` feedback screen** (`ExerciseShell.tsx:93-96` flips to the screen immediately; the inline Badge at e.g. `SentenceTransformationExercise.tsx:190-206` is visible for ~0ms but still rendered — dead UI that confuses maintainers).
- **Feedback screen language-direction bug.** `ExerciseShell.tsx:347-359` hardcodes Dutch on left, Indonesian on right. Breaks for 6 of 12 exercise types: `recognition_mcq`, `meaning_recall`, `listening_mcq`, `dictation`, `cloze`, `cloze_mcq` all run the other direction. Equally wrong on desktop; mobile just makes it more visible.
- **Mobile CSS reduces padding and font-size** (`RecognitionMCQ.module.css:87-111`, `TypedRecall.module.css:64-80`, `Session.module.css:13-21`) — the opposite direction from Section 2's "mobile = more breathing room" rule.
- **Icon-only tap targets below iOS minimum** — `ActionIcon size="sm"` at 30×30 (`FlagButton.tsx:89-98`), `ActionIcon size="lg"` at 36×36 (`ListeningMCQ.tsx:114, 132`, `Dictation.tsx:109, 127`). Apple HIG and WCAG 2.5.5 both require 44×44.
- **iOS input zoom on typed exercises.** Mantine's default `<TextInput>` font-size is <16px on mobile → iOS Safari auto-zooms the viewport on focus. Verified in `TypedRecall.module.css:22` (parent at 18px but actual `<input>` inherits from narrower contexts).
- **FlagButton popover unusable on mobile.** 280px width + SegmentedControl + Textarea → on 390px phone the comment field is pushed off-screen when iOS zoom kicks in (below-16px textarea font triggers zoom + rescales popover out of frame). Admin workflow is blocked on mobile today.

---

## 3. Design philosophy

**Refine the existing aesthetic, don't reinvent.** Dark-first with cyan accent, off-black surfaces, Plus Jakarta Sans, 10–12px corners. Apple-HIG posture. No pivot to Duolingo-style flat / illustrated / mascotted aesthetics.

**Mobile-first typography.** 16px body baseline. Reverse the current "mobile = smaller" rule — type, padding, and min-heights grow on phones, not shrink. Desktop picks up a hero-prompt size bump; everything else stays equal.

**Breathable cards.** Every prompt card and MCQ option sized for one-handed reading at arm's length. Vertical padding ≥ horizontal on mobile so multi-line options don't feel squeezed.

**Thumb-reachable primary actions.** Check / Doorgaan sticks to the bottom of the viewport via `env(safe-area-inset-bottom)`. Pointer-events gated for 150ms after feedback mount so a mid-flight tap doesn't double-advance.

**One canonical exercise shell.** Four zones — instruction, prompt, interaction, feedback — identical proportions across all 12 exercise types. No per-exercise layout invention.

**One feedback moment, not two.** Eliminate the inline Badge → ExerciseShell-screen double-burst. Correct = auto-advance with a single tint pulse. Wrong = one clean feedback screen.

**A motion vocabulary.** Tap-depress, correct scale+tint pulse, wrong-shake, feedback cross-fade. Wrong motion is *less* dramatic than correct (pedagogical: correct = celebration, wrong = correction, not punishment). All motion gated by `prefers-reduced-motion` which collapses transforms to zero and keeps only opacity.

**Pedagogical feedback ordering.** User's wrong attempt renders *above* the correct answer with a `"Jouw antwoord"` label + dim + strikethrough, and a 1px hairline separating it from the prominent correct answer below. Natural reading order: "you tried X, the answer was Y."

---

## 4. Architecture — three layers

```
┌──────────────────────────────────────────────────────────────┐
│  LAYER 1 — Design tokens (src/main.tsx cssVariablesResolver) │
│  Type, spacing, semantic color triplets, motion, focus ring  │
│  One change → every exercise updates                         │
└──────────────────────────────────────────────────────────────┘
                           ▲
┌──────────────────────────────────────────────────────────────┐
│  LAYER 2 — 13 primitives                                     │
│  src/components/exercises/primitives/                        │
│  Frame · Instruction · PromptCard · Option · OptionGroup     │
│  TextInput · SubmitButton · LanguagePill · Feedback          │
│  AudioButton · Hint · FlagButton (admin) · context.ts        │
└──────────────────────────────────────────────────────────────┘
                           ▲
┌──────────────────────────────────────────────────────────────┐
│  LAYER 3 — 12 thin exercise implementations                  │
│  src/components/exercises/implementations/                   │
│  ~40 lines each, only wiring primitives + scoring config     │
└──────────────────────────────────────────────────────────────┘
```

Supporting infrastructure:
- `useExerciseScoring(config)` reducer (`src/lib/useExerciseScoring.ts`)
- Exercise registry with `React.lazy` (`src/components/exercises/registry.ts`)
- `<ExerciseErrorBoundary>` per registry entry
- Inline `triggerHaptic(event)` helper (`src/components/exercises/primitives/haptics.ts`)
- `FrameFooterContext` + `FrameInstructionIdContext` (`src/components/exercises/primitives/context.ts`)
- Per-component `usesNewFeedback` export, aggregated session-wide at session-start
- `feedbackPropsFor()` content mapper (`src/components/exercises/feedbackMapping.ts`)
- `/admin/design-lab` route (permanent, admin-gated, lazy-loaded)

---

## 5. Design tokens

Added to `src/main.tsx` `cssVariablesResolver`.

### 5.1 Type scale (mobile-first, ≤640px = base)

| Token | px | Use |
|---|---|---|
| `--fs-xs` | 12 | language pills only — never body |
| `--fs-sm` | 14 | counter, captions, dim metadata |
| `--fs-md` | 16 | body, `<Text>` default, MCQ options |
| `--fs-lg` | 18 | emphasized body, long sentence options |
| `--fs-xl` | 20 | instruction line above prompt |
| `--fs-2xl` | 24 | Indonesian sentence prompt |
| `--fs-3xl` | 30 | Indonesian word prompt |
| `--fs-4xl` | 36 | hero / reserved |

Desktop ≥641px: only `--fs-3xl → 36` and `--fs-4xl → 44`. Everything else unchanged.

### 5.2 Spacing (mobile / desktop)

```
--ex-pad-x      16 / 24    screen gutter
--ex-pad-y      24 / 32
--ex-zone-gap   28 / 40    between the 4 zones
--ex-card-pad   20 / 24    inside prompt card
--ex-opt-pad-y  20 / 24    option vertical padding
--ex-opt-pad-x  16 / 20    option horizontal padding
--ex-opt-gap    12 / 16    between options
--ex-footer-h   88 / 96    sticky submit zone
```

### 5.3 Semantic colors (per-theme triplets)

```
Dark mode
--ex-correct-bg:     rgba(50,215,75,.10)
--ex-correct-fg:     #32D74B
--ex-correct-border: rgba(50,215,75,.30)
--ex-wrong-bg:       rgba(255,69,58,.10)
--ex-wrong-fg:       #FF453A
--ex-wrong-border:   rgba(255,69,58,.30)

Light mode (WCAG-AA-audited)
--ex-correct-bg:     rgba(34,150,50,.10)         → tinted bg #E9F4EB
--ex-correct-fg:     #1B6B27                     → 6.2:1 on white, 5.78:1 on tint
--ex-correct-border: rgba(27,107,39,.25)
--ex-wrong-bg:       rgba(200,40,31,.08)         → tinted bg #FCECEB
--ex-wrong-fg:       #C8281F                     → 6.0:1 on white, 5.44:1 on tint
--ex-wrong-border:   rgba(200,40,31,.25)

Both themes
--ex-card-border     (merged from --ex-prompt-border + --ex-option-border)
--ex-focus-ring      2px cyan + 2px offset
--ex-fg              primary text
--ex-fg-muted        secondary text
--ex-option-bg / -hover / -border     subtle raised surface
```

**Token rename.** `--ex-text-primary/secondary` renamed to `--ex-fg / --ex-fg-muted` to avoid shadowing Mantine's `--mantine-color-text`. `--ex-prompt-border` + `--ex-option-border` merged to `--ex-card-border` (no practical distinction at runtime).

### 5.4 Motion

```
--ex-motion-fast      80ms    tap depress
--ex-motion-correct   180ms   scale 1→1.04→1 + tint bg fade-in
--ex-motion-wrong     200ms   ±4px × 2 shake oscillations
--ex-motion-feedback  120ms   feedback screen enter
--ex-ease             cubic-bezier(.4, 0, .2, 1)
```

Reduced-motion override (in the resolver, gated by `@media (prefers-reduced-motion: reduce)`):
```
transforms: none (shake, scale dropped entirely)
opacity transitions: 120ms (kept — feels instant, not jarring)
```

Rationale for the motion retune: wrong motion is *less* dramatic than correct (correct scale 1.04 + tint > wrong ±4px shake). Correct = celebration; wrong = correction, not punishment.

### 5.5 Focus & `@layer` declaration

Focus ring: `2px solid var(--ex-focus-ring) + 2px offset`, visible in both themes. Applied via `:focus-visible` (never `:focus` alone — avoids visible ring for mouse users).

CSS `@layer` declaration goes in a dedicated file `src/styles/layers.css` imported **first** via JS import in `src/main.tsx` (not CSS `@import`, which Vite hoists unpredictably):

```css
/* src/styles/layers.css */
@layer mantine, exercises;
```

Every primitive CSS module wraps its rules in `@layer exercises { ... }`. Mantine's own styles stay in `@layer mantine`. The declaration order above makes `exercises` always win regardless of stylesheet load order.

Vitest assertion in CI confirms `layers.css` is present in the main entry chunk (prevents accidental reorder regressions).

---

## 6. Primitive catalog

All 13 primitives live in `src/components/exercises/primitives/`. Each has its own CSS module wrapping rules in `@layer exercises`. Each primitive CSS module references only tokens — no raw colors, sizes, or durations.

### 6.1 `<ExerciseFrame>`

Container. 4 zones + safe-area + sticky footer slot + admin overlay.

```ts
interface Props {
  children: ReactNode
  mode?: 'live' | 'preview'                 // default 'live'
  variant?: 'session' | 'preview'           // default 'preview'. 'session' triggers auto-focus on Instruction's h2.
  footer?: ReactNode                        // required when exercise has submit step
  adminOverlay?: ReactNode                  // absolutely positioned top-right; typically <FlagButton>
}
```

- Layout: `padding: var(--ex-pad-y) var(--ex-pad-x)`, `min-height: 100dvh` (dvh, not vh — iOS Safari correctness), flex column with `gap: var(--ex-zone-gap)`. Reserves `--ex-footer-h` at bottom when `footer` is set.
- `footer` wraps its node at render time with `<FrameFooterContext.Provider value={FOOTER_SLOT_SYMBOL}>` and absolutely-positioned sticky bottom container: `position: sticky; bottom: 0; padding-bottom: max(16px, env(safe-area-inset-bottom))`. A 12px gradient fade from `var(--bg-main)` transparent-to-solid sits above the footer container so content doesn't abut sharply.
- `adminOverlay` renders in an absolutely positioned top-right slot at `top: 8px; right: 8px`, with 44×44 hit area.
- `mode="preview"` renders the subtree as a question-half + answer-half pair (side-by-side ≥768px, stacked below). Only the `ContentReview` admin page consumes preview mode today; synthetic `ExerciseItem` is fed through the real renderer (no separate JSX tree).
- `variant="session"` opts Instruction into auto-focus. `variant="preview"` (default) leaves focus alone — critical for the design-lab's inspector UX and StrictMode double-mount safety.
- **Container query root**: declares `container-name: exercise; container-type: inline-size` on its outer box. All primitive responsive behavior uses `@container exercise (max-width: ...)` queries against this, never `@media`.
- `role="main"`, `aria-label={t.session.exercise.label}`.

### 6.2 `<ExerciseInstruction>`

Small instruction line above the prompt. Auto-focus in `session` variant.

```ts
interface Props {
  children: ReactNode
  icon?: ReactNode
}
```

- `--fs-xl` / weight 500 / `--ex-fg-muted` / left-aligned / line-height 1.4.
- Renders as `<h2 id={useId()} tabIndex={-1}>`.
- Reads `{variant}` from `FrameVariantContext`. If `variant === 'session'`, auto-focuses its `<h2>` on mount via `useLayoutEffect`, with `{preventScroll: true}` to suppress any scroll jump. Focus ring suppressed via `:focus:not(:focus-visible) { outline: none }` — sighted users don't see a flash on every next-exercise transition; screen-reader users get the announcement.
- Writes its auto-generated id into `FrameInstructionIdContext` so `<ExerciseOptionGroup>` can reference it via `aria-labelledby`.
- No state, no motion, no haptics.

### 6.3 `<ExercisePromptCard>`

The prompt container. 5 variants cover all 12 exercise types without bespoke JSX.

```ts
interface Props {
  variant: 'word' | 'sentence' | 'audio' | 'transform' | 'pair'
  children: ReactNode
  audio?: { url: string; autoplay?: boolean }        // decorative top-right button, non-audio variants only
  meta?: ReactNode                                   // secondary line (source sentence, etc.)
  constraint?: ReactNode                             // transform variant only — "use past tense" chip
  revealSlot?: ReactNode                             // audio variant only — post-answer transcript
}
```

Container: `padding: var(--ex-card-pad)`, `border: 1px solid var(--ex-card-border)`, `border-radius: var(--r-md)`, `background: var(--bg-surface)`, `position: relative` (for audio button anchor).

Per-variant:

| variant | align | typography | min-h | notes |
|---|---|---|---|---|
| word | center | `--fs-3xl` / 700 / `--accent-primary`, letter-spacing 0.03em | 120 | |
| sentence | left | `--fs-2xl` / 500 / line-height 1.5 | 100 | Cloze exercises nest `<ExerciseTextInput inline>` in `children` |
| audio | center | (audio button is the prompt) | 140 | sub-states `before-play | playing | revealed`, `revealSlot` renders below at `--fs-2xl`/700 post-answer |
| transform | left | `--fs-2xl` / 500 | 100 | `constraint` chip absolutely top-right (pill at `--fs-xs`) |
| pair | center | two tokens `--fs-2xl` / 600 separated by `│` (U+2502, vertical rule, weight 300, `--ex-fg-muted`, 24px horizontal padding each side) | 120 | for contrast_pair |

Decorative audio button (non-audio variants): absolute `top: 12px; right: 12px`, 44×44 via `<ExerciseAudioButton variant="decorative">`.

A11y: `role="group"`, `aria-label` derived from variant. Audio sub-states announced via `aria-live="polite"`.

### 6.4 `<ExerciseOption>`

MCQ option button. Tap-to-commit (no pre-commit per product decision).

```ts
interface Props {
  children: ReactNode
  state: 'idle' | 'focused' | 'disabled' | 'correct' | 'wrong' | 'answer'
  variant: 'word' | 'sentence'
  onClick: () => void
  audio?: { url: string; onPlay?: () => void }      // row-attached (contrast_pair)
}
```

`state: 'answer'` = "this was the correct option" (muted checkmark), shown after user committed a different (wrong) option.

Visual (mobile / desktop):
- word: min-h 64/56, padding `var(--ex-opt-pad-y) var(--ex-opt-pad-x)`, text `--fs-md`
- sentence: min-h 88/72, same padding, text `--fs-lg`, line-height 1.45

State visuals (triplet tokens — no raw colors):

| state | bg | fg | border | glyph |
|---|---|---|---|---|
| idle | `--ex-option-bg` | `--ex-fg` | transparent | — |
| focused | `--ex-option-bg` | `--ex-fg` | `--ex-focus-ring` via `:focus-visible` | — |
| disabled | `--ex-option-bg` (opacity 0.5) | — | transparent | — |
| correct | `--ex-correct-bg` | `--ex-correct-fg` | `--ex-correct-border` 2px | ✓ |
| wrong | `--ex-wrong-bg` | `--ex-wrong-fg` | `--ex-wrong-border` 2px | ✕ |
| answer | `--ex-option-bg` | `--ex-fg` | `--ex-correct-border` 2px | ✓ (muted) |

Glyph rendered alongside color (not color alone) — critical for colorblind users.

A11y:
- `role="button"` inside parent `role="group"` (not `role="radio"` — tap-to-commit UX, radio semantics imply selection-before-submit).
- `aria-pressed` reflects committed state.
- Focus ring via `--ex-focus-ring` on `:focus-visible` only.
- Glyph has `aria-label="correct"` / `"incorrect"`.

Motion (all with `transform-origin: center` — off-center origin reads as nudge, not pulse):
- tap: `scale 0.98` / `--ex-motion-fast` (80ms)
- correct: `scale 1 → 1.04 → 1` / `--ex-motion-correct` (180ms) + bg-tint fade-in 80ms
- wrong: `translateX ±4px × 2 oscillations` / `--ex-motion-wrong` (200ms)
- answer: border fade-in 120ms, no scale, muted glyph

Reduced-motion: all transforms → 0; opacity transitions stay.

Haptics (via inline `triggerHaptic`):
- tap: `selection`
- correct: `notificationSuccess`
- wrong: `notificationWarning`

`prefers-reduced-motion` does NOT gate haptics (tactile ≠ vestibular; Apple HIG keeps haptics under Reduce Motion). A future `hapticsEnabled` user-profile toggle (default true) will gate them; out of scope for the initial design.

### 6.5 `<ExerciseOptionGroup>`

Stack of options.

```ts
interface Props {
  children: ReactNode[]
  disabled?: boolean
}
```

- Visual: flex column, `gap: var(--ex-opt-gap)`.
- A11y: `role="group"` with `aria-labelledby={instructionId}` (read from `FrameInstructionIdContext`). NVDA/VoiceOver announce the Instruction's text as the group's accessible name. Focus flows naturally via Tab (no roving tabindex needed — options are buttons, not radios).
- Motion: mount stagger 40ms opacity fade (first 0ms, last ≤160ms for 4 options); 0ms stagger under reduced-motion.

### 6.6 `<ExerciseTextInput>`

Canonical typed-answer input. Kills iOS zoom.

```ts
interface Props {
  value: string                              // controlled only — no internal value fallback
  onChange: (v: string) => void
  onSubmit?: () => void
  state?: 'idle' | 'correct' | 'wrong' | 'fuzzy' | 'disabled'
  placeholder?: string
  autoFocus?: boolean                        // default true
  label: string                              // required, visually-hidden
  inline?: boolean                           // cloze mode
  hintedAnswerLength?: number                // cloze: widths to max(4ch, n+1 ch)
}
```

Block mode:
- CSS in `src/components/exercises/primitives/global.css`:
  ```css
  @layer exercises {
    .exerciseInput {
      font-size: max(16px, var(--fs-lg)) !important;
    }
  }
  ```
  `!important` + layer ordering wins against Mantine's inconsistent inline styles across versions. iOS Safari never auto-zooms because the computed font-size is always ≥16px.
- padding 14×16, 1px `--ex-card-border`, radius `--r-md`, background transparent, width 100%, min-h 56.

Inline mode (cloze only):
- inline-block, `width: max(4ch, (hintedAnswerLength + 1)ch)`, border-bottom only (`2px solid var(--ex-card-border)`), background transparent. Same font-size rule via `.exerciseInput` class.

State borders: idle → card-border · correct → correct-border + correct-fg · wrong → wrong-border + wrong-fg · fuzzy → `--warning` border + fg · disabled → opacity 0.5.

A11y: visually-hidden `<label>`, `autoCapitalize="off" autoCorrect="off" spellCheck="false" inputMode="text"`, `aria-invalid={state === 'wrong'}`, `aria-describedby` for `<ExerciseHint>` association, focus ring `--ex-focus-ring`.

Motion: border-color 120ms. No shake (reserved for options).

### 6.7 `<ExerciseSubmitButton>`

Full-width primary action. Doesn't own its own positioning — Frame's `footer` slot does.

```ts
interface Props {
  children: ReactNode
  onClick: () => void
  disabled?: boolean
  loading?: boolean
  rightIcon?: ReactNode                      // default IconArrowRight
}
```

- Visual: min-h 56, width 100%, padding 16×20, `--fs-lg`/600, `background: var(--accent-primary)`, `color: var(--text-on-accent)`, radius `--r-md`.
- **Dev-mode slot check**: reads `FrameFooterContext`. If context value !== `FOOTER_SLOT_SYMBOL` (Symbol-tagged to prevent consumer spoofing) AND `import.meta.env.DEV`: `console.error` once via `invariant` + warn-once ref guard (not throw — throwing inside render during StrictMode double-invoke causes crash loops; React de-dupes `console.error`). In prod: silent no-op — graceful degradation.
- Disabled: opacity 0.4, cursor not-allowed. Loading: icon swapped for spinner, text kept, `aria-busy={true}`.
- Motion: press scale 0.98 / 80ms.
- Haptic: tap = `selection`.

### 6.8 `<LanguagePill>`

Tiny language tag. Inline-left of role labels in feedback cards.

```ts
interface Props { lang: 'ID' | 'NL' | 'EN' }
```

- `--fs-xs` / weight 700 / uppercase / letter-spacing 0.05em, padding 3×8, 1px `--ex-card-border`, radius `--r-sm`, `background: transparent`, `color: var(--ex-fg-muted)`.
- Inline-left of role label in feedback cards with middle-dot separator: `ID · Je zag` (separator: U+00B7 at `--fs-sm`, `--ex-fg-muted`, 8px margin each side).
- A11y: `aria-hidden="true"` when adjacent to language-identified content.

No state, no motion, no haptics.

### 6.9 `<ExerciseFeedback>`

The single canonical correct/wrong feedback screen. Replaces `ExerciseShell.tsx:316-440`.

```ts
type Language = 'ID' | 'NL' | 'EN'

interface Props {
  outcome: 'correct' | 'fuzzy' | 'wrong'
  layout: 'vocab-pair' | 'grammar-reveal'
  direction: 'ID→L1' | 'L1→ID' | 'audio→ID' | 'ID→ID'
  promptShown: { text: string; lang: Language; role: 'heard' | 'shown' }
  correctAnswer: { text: string; lang: Language; role: 'said' | 'target' }
  userAnswer?: { text: string; lang: Language; role: 'typed' | 'picked' }
  acceptedVariants?: string[]                // "Ook goed:" list
  meaning?: string                           // grammar only
  explanation?: string                       // grammar only
  audio?: { url: string }                    // direction includes audio
  onContinue: () => void
  onEvent?: (event: ExerciseEvent) => void   // audio_replayed, etc.
}
```

**Label derivation** (invariant table enforced in dev; fallback to generic in prod):

| direction | promptShown.role | → default label | correctAnswer.role | → default label |
|---|---|---|---|---|
| ID→L1 | shown | "Je zag" | target | "Betekent" |
| L1→ID | shown | "Je zag" | target | "Juist antwoord" |
| audio→ID | heard | "Je hoorde" | said | "Het woord was" |
| ID→ID | heard/shown | "Je hoorde" / "Je zag" | target | "Juist antwoord" |

Any tuple not in the above throws in dev and renders generic "Antwoord" / "Juist antwoord" in prod.

**Mobile stack order** (`@container exercise (max-width: 768px)`):

1. Outcome badge (pill, `role="status"`, `aria-live="assertive"`)
2. `promptShown` card with inline `<LanguagePill>` ("ID · Je zag")
3. `userAnswer` card — dimmed (`--ex-fg-muted`), `--fs-sm`, strikethrough if differs, label "Jouw antwoord" (fs-xs/fg-muted/sentence-case) above value
4. 1px `--border-light` hairline
5. `correctAnswer` card — accent-fg, full size, prominent
6. (grammar only) meaning line: "Betekent: ..."
7. (grammar only) explanation card — always visible, not a disclosure
8. Continue button inside `<ExerciseFrame footer>` (sticky, thumb-reachable)

**Desktop grid** (`@container exercise (min-width: 769px)`):
- Outcome badge full-width
- Row: promptShown (left) + correctAnswer (right, prominent)
- userAnswer dimmed full-width below
- meaning / explanation stacked
- Continue not sticky

**Fuzzy outcome special case (typed exercises):**
On `outcome === 'fuzzy'`, positions 3+4+5 collapse into a single **diff-pair card** occupying both userAnswer and correctAnswer slots:

```
┌─────────────────────────────────────────┐
│ Jouw antwoord              Doel          │
│ ID                         ID             │
│ tujuuh          →          tujuh          │
└─────────────────────────────────────────┘
```

- Both values `--fs-lg` / 700
- Arrow `→` glyph between, `aria-hidden`
- Rendered semantically as `<dl>` with `<dt>` role labels and `<dd>` values so screen readers announce "Your answer: tujuuh. Target: tujuh."
- `@container` query on the card: horizontal ≥420px, stacked below

Fuzzy ALWAYS shows the feedback screen (no auto-advance). Only exact-match canonical answer auto-advances. (Product decision: language learner needs to SEE the difference for retention.)

**Accepted variants** (for outcome='fuzzy' or 'wrong' with acceptedVariants.length > 0):
- Secondary line below correctAnswer: `Ook goed: tujuh, tujuhan, tujuh-tujuh +2` at `--fs-sm` / `--ex-fg-muted`
- Max 3 variants inline, sorted by Levenshtein distance from userAnswer (most relevant first)
- If >3 variants: show 3 + "+N" non-interactive count (no expander — that's a tap-target trap on a feedback screen)
- If 0 or 1 acceptedVariants: omit entirely

**Audio replay** (direction includes audio):
- `<ExerciseAudioButton variant="primary">` inside `promptShown` card
- Tap replays from start; count tracked via `audio_replayed` event through `onEvent` prop → session analytics sink (NOT through the scoring hook, which is closed by the time feedback renders)
- Placement: inline right of text when `promptShown.text.length ≤ 24` AND container ≥ 360px; otherwise on its own row below the text as a full-width secondary button

**Service failure notice** (when `onAnswer` / `processReview` failed before feedback rendered):
- Warning chip above the outcome badge: `background: var(--warning-subtle)`, `border: 1px solid var(--warning-border)`, icon + text at `--fs-sm` (NOT italic — this is a real incident signal, not a footnote), copy `t.session.feedback.commitFailed`
- `role="status"`, `aria-live="polite"` (not assertive — doesn't compete with outcome announcement)
- Non-blocking. Continue still works. FSRS unaffected because no `review_events` row was written.

**Content length handling**:
- All value cells: `word-break: break-word; overflow-wrap: anywhere`.
- Long Indonesian compound words (e.g. "mempertanggungjawabkan") use **shrink-to-fit**: when content overflows the container, font-size drops one step (`--fs-lg` → `--fs-md`). Floor at `--fs-md`; below that the container scrolls. Implementation via `container-type: inline-size` + a small `ResizeObserver`-free CSS strategy using `fit-content`.

**Empty userAnswer** (outcome='wrong' with empty response): render the card with `(geen antwoord)` at `--ex-fg-muted`. Don't silently omit — the user needs "what happened" context.

**A11y**:
- Outer `role="region"` with `aria-label` = the region name.
- Outcome badge: `role="status"`, `aria-live="assertive"`. **Full-sentence announcement**: "Incorrect. The answer is `correctAnswer.text`." or "Correct" or "Bijna goed — the answer is `correctAnswer.text`."
- **No `aria-describedby` on Continue** — aria-live already announced the region; describedby would cause double-announcement on focus-chirp.
- Focus moves to Continue **after 400ms** delay (allows VoiceOver to finish the assertive utterance before focus arrives).
- Continue button has `pointer-events: none` for the same 400ms window, with 0→1 opacity transition, to prevent accidental tap-through when a user's finger is mid-flight as feedback renders. Applies to **every** feedback mount (muscle memory + rapid sessions makes the hazard persistent, not first-mount-only).
- Language pills `aria-hidden="true"`.
- Diff-pair rendered as `<dl>/<dt>/<dd>` — announces semantically, not as bare strings.
- Service-failure notice `role="status"` `aria-live="polite"`.
- Long content: `tabindex="0"` on the scrollable region so keyboard users can focus + arrow-scroll.

**Motion**: mount opacity fade 120ms + 8px slide from below. Reduced-motion: opacity only.

### 6.10 `<ExerciseAudioButton>`

Playback control. Distinct from the generic `<PlayButton>` which ships elsewhere.

```ts
interface Props {
  audioUrl: string
  variant: 'primary' | 'decorative'          // primary = 56×56 min; decorative = fixed 36×36
  autoplay?: boolean
  onPlay?: () => void
  onError?: () => void
  onReplay?: () => void                      // for feedback replay count
  aria-label?: string
}
```

- Circular, 1px `--ex-card-border`, `background: transparent`. Icons from `@tabler/icons-react`: IconPlay (idle), IconVolume (replay), Loader (loading), IconAlertTriangle (error).
- `variant="decorative"` allowed only in row-attached (ContrastPair option) and PromptCard corner positions. Can't be used as primary audio control.
- States: `idle` (optional 3s pulse if autoplay was expected but blocked) · `playing` (border wave 1200ms loop, opacity-only under reduced-motion) · `played` (replay icon, less prominent) · `loading` (spinner) · `error` (alert icon + console log).
- Autoplay-blocked fallback: inline-button only (shows "Tap to play" label until first tap). Overlay mode cut as YAGNI.
- A11y: native `<button>`, playback state announced via `aria-live="polite"`, keyboard Space/Enter, `aria-label` required (defaults to a state-aware description if omitted).
- Motion: press scale 0.96 / 80ms. Playing wave 1200ms loop.
- Haptic: tap = `selection`.

### 6.11 `<ExerciseHint>`

Secondary guidance. Used by `sentence_transformation` after N failures today; primitive-ready for future hint patterns.

```ts
interface Props {
  children: ReactNode
  icon?: ReactNode                           // default IconBulb
  defaultRevealed?: boolean                  // default true
}
```

- Padding 12×16, **full 1px `--ex-fg-muted` border** (not `--ex-card-border` — avoids visual collision with `<ExercisePromptCard>`'s cyan border when stacked in sentence_transformation), background `var(--accent-primary-subtle)`, radius `--r-sm`, `--fs-sm` / `--ex-fg-muted` / line-height 1.5. Icon 16×16, inline with text, `--accent-primary`.
- Collapsed (`defaultRevealed={false}`): ghost "Show hint" button + chevron; reveal transitions opacity + height 120ms (reduced-motion: opacity only, no height transition).
- A11y: `role="note"`. Collapsed: `aria-expanded` + `aria-controls` on trigger button; content `aria-live="polite"` on reveal.
- Controlled variant dropped (YAGNI — no current consumer; uncontrolled + `defaultRevealed` covers all 12 exercise types).

### 6.12 `<FlagButton>` (admin)

Admin workflow: flag an exercise during practice. Real live-practice feature, not a follow-up.

```ts
interface Props {
  userId: string
  learningItemId: string | null
  grammarPatternId?: string | null
  exerciseType: ExerciseType
  exerciseVariantId?: string | null
  existingFlag?: ContentFlag | null
  onFlagged?: (flag: ContentFlag) => void
  onUnflagged?: () => void
}
```

- 44×44 wrapper with 16-20px icon centered. Gray outline `IconFlag` when no flag exists; orange filled `IconFlag2Filled` when flagged.
- Mobile (<768px via `@container` on Frame): **bottom sheet** (Mantine `<Drawer position="bottom">`), `max-height: 45vh`, 30% backdrop opacity (exercise visible through dimmed backdrop). Desktop (≥768px): 360px `<Popover>`.
- Content (both surfaces): auto-focused comment textarea using `.exerciseInput` class (16px min font via `@layer exercises` — kills the iOS zoom bug that breaks today's flow). Save button pinned at sheet-footer or popover-footer.
- **No chips.** Comment is the sole input. User hardly used the 5 existing chips (`wrong_translation | bad_sentence | confusing | sunset | other`) and flagged primarily on aesthetics which the taxonomy didn't cover. Downstream keyword-extract from comments later if categorization is ever needed.
- Save requires non-empty comment (no empty flags).
- Flag state indicator: orange filled icon when `existingFlag !== null`. No banner at top of exercise — the icon color is sufficient visual cue.
- Sheet never dismisses the exercise — user can see the prompt behind the dimmed backdrop while writing the comment.

Data-layer: `indonesian.content_flags.flag_type` becomes nullable (see §12 Supabase Requirements). App sends `null` for the column when no category is provided. Existing rows with their enum values (`wrong_translation` etc.) remain valid.

### 6.13 `context.ts` — shared contexts

Two contexts live here:

```ts
export const FrameInstructionIdContext = createContext<{
  instructionId: string | null
  setInstructionId: (id: string | null) => void
}>({ instructionId: null, setInstructionId: () => {} })

const FOOTER_SLOT_SYMBOL = Symbol('FrameFooter')
export const FrameFooterContext = createContext<symbol | null>(null)
export { FOOTER_SLOT_SYMBOL }

export const FrameVariantContext = createContext<'session' | 'preview'>('preview')
```

`FOOTER_SLOT_SYMBOL` is Symbol-tagged so consumers can't spoof the context by providing `true` from their own provider. Only `<ExerciseFrame>` can set it.

---

## 7. Infrastructure

### 7.1 `useExerciseScoring(config)` — the reducer

Single source of truth for the per-exercise state machine.

```ts
interface ScoringConfig<TResponse = string> {
  mode: 'tap' | 'typed'
  checkCorrect: (response: TResponse) => { isCorrect: boolean; isFuzzy: boolean }
  onAnswer: (result: AnswerResult<TResponse>) => Promise<void> | void
  allowRetry?: boolean                       // default false
  maxFailures?: number                        // default 0
  hintAfter?: number                          // show hint after N failures
  gate?: () => boolean                        // precondition (dictation's hasPlayedOnce)
  correctDelayMs?: number                     // default 1500
  onEvent?: (event: ExerciseEvent) => void
}

type ScoringPhase =
  | { phase: 'idle', response: string, failureCount: 0, hintShown: false }
  | { phase: 'gated', reason: string }                                           // gate fn returned false
  | { phase: 'wrong-retry', response: '', failureCount: number, hintShown: boolean }
  | { phase: 'processing', response: TResponse, failureCount: number }
  | { phase: 'answered-correct', result: AnswerResult<TResponse> }
  | { phase: 'answered-fuzzy', result: AnswerResult<TResponse> }
  | { phase: 'answered-wrong', result: AnswerResult<TResponse> }

interface AnswerResult<TResponse> {
  outcome: 'correct' | 'fuzzy' | 'wrong'
  response: TResponse
  latencyMs: number
  failureCount: number
  hintWasShown: boolean
}
```

**Legal-action matrix per phase** (actions in other phases are no-ops):

| phase | accepts |
|---|---|
| idle | TYPE, SELECT, SUBMIT, GATE_CHECK |
| gated | GATE_CHECK |
| wrong-retry | TYPE, SELECT, SUBMIT |
| processing | — (no user input during the 1500ms delay) |
| answered-* | — |

**Implementation via `useReducer`**:
- Actions: `TYPE(value)`, `SELECT(option)`, `SUBMIT`, `GATE_CHECK`.
- Side effects in `useEffect` keyed on phase transitions. Timer cleanup on unmount prevents leaks during mid-answer navigation.
- **StrictMode idempotency guard**: `exercise_shown` fires on mount via `useEffect` with a `didEmitShownRef` guard so the double-invoke in StrictMode doesn't emit twice. Follows the `Session.tsx:69-70` `didInit` pattern established elsewhere in the codebase. Note: only `exercise_shown` needs the guard. Reducer state is not guarded — StrictMode re-initialization lands in `phase: 'idle'` which is a legitimate initial state; the `useReducer` internal is automatically reset by React on remount. Timers in `useEffect` are cleaned up via the standard return-function pattern; no leak across StrictMode double-mount.
- **onAnswer atomicity**: `processReview` is one Supabase insert (one row in `indonesian.review_events`) — either succeeds or throws. On throw: reducer still transitions to `answered-*` (UI truth), but the scoring hook does NOT write local FSRS cache. Next session re-surfaces the item because no `review_events` row exists. Invariant: "local FSRS cache writes are gated on `processReview` success."

**Exposed API** (consumed by exercise implementations):
```ts
interface ScoringAPI<TResponse> {
  // Typed inputs
  response: string
  setResponse: (v: string) => void
  submit: () => void
  canSubmit: boolean              // response non-empty AND gate passes AND phase allows submit

  // MCQ input
  selectOption: (option: TResponse) => void

  // UI-derived state
  isProcessing: boolean
  isAnswered: boolean
  showHint: boolean
  inputState: 'idle' | 'correct' | 'wrong' | 'fuzzy' | 'disabled'
  optionState: (option: TResponse) => 'idle' | 'focused' | 'disabled' | 'correct' | 'wrong' | 'answer'

  result: AnswerResult<TResponse> | null
}
```

**Branch coverage**:
- Auto-commit MCQ (most): `allowRetry: false, maxFailures: 0`
- Retry-with-hint (sentence_transformation): `allowRetry: true, maxFailures: 0, hintAfter: 2`
- Gated (dictation): `gate: () => hasPlayedOnce`
- No-op (speaking): registry-refused — component never mounts in-session

**Events emitted** (via `onEvent`) — 8 events, each with a concrete consumer or routing destination. The initial spec's 12-event list was trimmed per YAGNI review (removed `option_selected`, `answer_submitted`, `hint_shown`, `hint_dismissed`, `exercise_dismissed`, `exercise_abandoned` as either redundant with `answer_committed` or lacking any concrete downstream):

```
exercise_shown             on mount (StrictMode-guarded)           → analyticsService.trackExerciseShown
answer_committed           final, with outcome + latency + fc + h  → writes row to indonesian.review_events via processReview
exercise_skipped           via ErrorBoundary catch                 → analyticsService.trackExerciseSkipped
exercise_commit_failed     processReview threw                     → logError + inline warning chip in feedback
audio_replayed             dictation / listening replay            → analyticsService.trackAudioReplay (retention signal)
continue_pressed           feedback Continue tap                   → dwell-time metric (confusion proxy)
flag_created               FlagButton save completion              → telemetry signal + complements the content_flags row write
content_gap                grammar explanation missing at runtime  → auto-inserts content_flags row (§8.2)
```

Event types are additive — new events can be added in future PRs without breaking changes. The `onEvent` config is optional; default no-op. Wired upstream in `ExerciseShell` via `analyticsService.trackExerciseEvent()`.

### 7.2 Exercise registry + `React.lazy`

`src/components/exercises/registry.ts`:

```ts
type LazyExercise = LazyExoticComponent<ComponentType<ExerciseComponentProps>>

export const exerciseRegistry: Record<ExerciseType, LazyExercise> = {
  recognition_mcq:         lazy(() => import('./implementations/RecognitionMCQ')),
  cued_recall:             lazy(() => import('./implementations/CuedRecallExercise')),
  contrast_pair:           lazy(() => import('./implementations/ContrastPairExercise')),
  sentence_transformation: lazy(() => import('./implementations/SentenceTransformationExercise')),
  constrained_translation: lazy(() => import('./implementations/ConstrainedTranslationExercise')),
  typed_recall:            lazy(() => import('./implementations/TypedRecall')),
  meaning_recall:          lazy(() => import('./implementations/MeaningRecall')),
  cloze:                   lazy(() => import('./implementations/Cloze')),
  cloze_mcq:               lazy(() => import('./implementations/ClozeMcq')),
  speaking:                lazy(() => import('./implementations/SpeakingExercise')),
  listening_mcq:           lazy(() => import('./implementations/ListeningMCQ')),
  dictation:               lazy(() => import('./implementations/Dictation')),
}

export const exerciseSkeletonVariant: Record<ExerciseType, 'word' | 'sentence' | 'audio'> = {
  recognition_mcq: 'word',
  cued_recall: 'word',
  typed_recall: 'word',
  meaning_recall: 'word',
  cloze: 'sentence',
  cloze_mcq: 'sentence',
  contrast_pair: 'word',
  sentence_transformation: 'sentence',
  constrained_translation: 'sentence',
  listening_mcq: 'audio',
  dictation: 'audio',
  speaking: 'word',
}

export function resolveExerciseComponent(type: ExerciseType): LazyExercise {
  const c = exerciseRegistry[type]
  if (!c) throw new Error(`Exercise type "${type}" not in registry`)
  return c
}
```

Replaces `ExerciseShell.tsx:163-314`'s 12-case switch.

**`ExerciseComponentProps` contract** (enforced by TypeScript at registry-construction time):

```ts
type AnswerOutcome =
  | ReviewResult                                    // normal path: committed an answer
  | { skipped: true, reviewRecorded: false }        // error-boundary path: no review written

interface ExerciseComponentProps {
  exerciseItem: ExerciseItem
  userLanguage: 'en' | 'nl'
  onAnswer: (outcome: AnswerOutcome) => void
  onEvent?: (event: ExerciseEvent) => void
  adminOverlay?: ReactNode
}
```

The discriminated union lets `<ExerciseErrorBoundary>` (§7.3) report a skip without fabricating a `ReviewResult`. Session reads `outcome.skipped` to distinguish "counts toward session length but not FSRS" from a committed review.

**Chunk preload**: on `answer_committed` event, the next exercise's chunk is prefetched via `import()` — so the skeleton is a fallback, not the norm. Session scheduler determines the next exercise and invokes `exerciseRegistry[nextType]._payload._result` (React's internal ensure-loaded pattern) before the user taps Continue.

### 7.3 `<ExerciseErrorBoundary>`

Per-registry-entry safety net. One broken exercise can't kill the session.

```tsx
class ExerciseErrorBoundary extends Component<Props, State> {
  state = { hasError: false }
  static getDerivedStateFromError() { return { hasError: true } }
  componentDidCatch(error: Error) {
    logError({ page: 'exercise', action: `render:${this.props.exerciseType}`, error })
    this.props.onEvent?.({
      type: 'exercise_error',
      exerciseType: this.props.exerciseType,
      error: error.message,
    })
    // Critical: emit skip to scoring layer so session accounting stays consistent.
    this.props.onAnswer({ skipped: true, reviewRecorded: false })
  }
  render() {
    if (!this.state.hasError) return this.props.children
    return (
      <ExerciseFrame variant="session" footer={
        <ExerciseSubmitButton onClick={this.props.onSkip}>
          {t.session.exercise.next}
        </ExerciseSubmitButton>
      }>
        <ExerciseInstruction icon={<IconMoodConfuzed size={20} />}>
          {t.session.exercise.evenOverslaan}
        </ExerciseInstruction>
        <ExercisePromptCard variant="sentence">
          {t.session.exercise.weGaanDoor}
        </ExercisePromptCard>
      </ExerciseFrame>
    )
  }
}
```

**FSRS consistency**: `onAnswer({skipped: true, reviewRecorded: false})` is called from `componentDidCatch`. Session treats the exercise as skipped — counts toward session length but not toward FSRS (no `review_events` row). Documented invariant: "skipped-via-error exercises count toward session length but not toward FSRS scheduling."

**Consumer-side propagation** — the `AnswerOutcome` widening from §7.2 flows to `Session.tsx`'s `recordAnswer` handler at the migration seam. Today `recordAnswer` in `Session.tsx:344-359` signature is `(_result: ReviewResult | GrammarReviewResult, wasCorrect: boolean)`; it must widen to accept the skip shape and route it past FSRS:

```ts
const recordAnswer = (outcome: AnswerOutcome, wasCorrect: boolean) => {
  if ('skipped' in outcome) {
    // Skipped-via-error: advance queue + increment total for session-length accounting.
    // Do NOT call processReview; no review_events row is written.
    setResults(r => ({ ...r, total: r.total + 1 }))
    return
  }
  // Existing path — committed review
  if (wasCorrect) { /* ... */ } else { /* ... */ }
}
```

Separately: `useExerciseScoring.onAnswer` (§7.1) stays typed as `(result: AnswerResult<TResponse>) => void` — the hook emits committed results only. Skip path bypasses the hook; `<ExerciseErrorBoundary>` calls the component-level `onAnswer` prop directly. This is deliberate — the hook and the boundary are orthogonal concerns.

**Skeleton**: `<ExerciseSkeleton>` renders **inside** a real `<ExerciseFrame variant="session">` during lazy chunk load, so there's no layout shift. Uses the `exerciseSkeletonVariant` map from the registry to pick a PromptCard shape. Shapes: Instruction shimmer bar (24px tall), PromptCard placeholder matching the variant (word = 120px centered block, sentence = 100px left-aligned block, audio = centered 56×56 button shape + 140px card), 4 muted option shapes. No spinner — spinners signal "waiting for server"; skeletons signal "rendering." Animation: `--bg-surface` with opacity pulse 0.6→1.0 / 1200ms (`@keyframes`, reduced-motion static at 0.8).

### 7.4 `triggerHaptic(event)` — inline helper

```ts
// src/components/exercises/primitives/haptics.ts
export type HapticEvent = 'selection' | 'success' | 'warning' | 'error'

const PATTERNS: Record<HapticEvent, number | number[]> = {
  selection: 5,
  success:   [15, 30, 15],
  warning:   [30, 50, 30, 50],
  error:     [50, 100, 50],
}

export function triggerHaptic(event: HapticEvent) {
  if (typeof navigator === 'undefined' || !('vibrate' in navigator)) return
  // TODO: replace with hapticsEnabled user-profile toggle when available
  navigator.vibrate(PATTERNS[event])
}
```

**No abstraction, no hook.** `useHaptics()` was cut as speculative. Inline helper; swap to `@capacitor/haptics` when the iOS wrapper exists (the event names are the stable API).

**Reduced-motion gating**: deliberately NOT applied. Haptics are tactile, not vestibular — Apple HIG explicitly keeps them under Reduce Motion. Some users opt into reduced-motion and rely on haptics for confirmation feedback. A future `hapticsEnabled` user-profile toggle will gate them independently.

### 7.5 `usesNewFeedback` — migration flag

**Synchronous manifest** in `src/components/exercises/registryMeta.ts` — a flat `Record<ExerciseType, boolean>` that's eagerly evaluated (no chunk load needed):

```ts
// src/components/exercises/registryMeta.ts
import type { ExerciseType } from '@/types/learning'

export const usesNewFeedback: Record<ExerciseType, boolean> = {
  recognition_mcq:         false,   // flip to true when implementation migrates
  cued_recall:             false,
  contrast_pair:           false,
  sentence_transformation: false,
  constrained_translation: false,
  typed_recall:            false,
  meaning_recall:          false,
  cloze:                   false,
  cloze_mcq:               false,
  speaking:                false,
  listening_mcq:           false,
  dictation:               false,
}
```

**Session-start lock** (in `Session.tsx` initialization, after queue is built):

```ts
const allReady = builtQueue.every(item => usesNewFeedback[item.exerciseType])
session.useNewFeedback = allReady
```

Behavior: if every exercise type in the built session queue has its manifest flag `true`, the whole session uses `<ExerciseFeedback>`. Otherwise it falls back to the legacy `ExerciseShell.tsx:316-440` feedback screen for the whole session. Guarantees: (a) zero mid-session UX inconsistency; (b) no React-internals peek (the earlier `_payload._result` approach doesn't work — `_result` is populated only after chunk load, so it'd always be `undefined` at session-start and the lock would evaluate to `false` forever); (c) trivial merge flow — `registryMeta.ts` is one file, one boolean per exercise per line; diffs are surgical; (d) clean cutover — delete `registryMeta.ts` + legacy path in one final PR.

**Chunk preload** (§7.2): on `answer_committed` event, re-invoke `import('./implementations/Xxx')` — Vite caches the module, so the second call is a no-op once resolved. No React internals touched.

### 7.6 `feedbackPropsFor()` — content mapper

`src/components/exercises/feedbackMapping.ts`. NOT a primitive (it's a domain adapter); lives alongside `registry.ts`.

**Pure function signature** (pinned — no hidden dependencies):

```ts
interface FeedbackMapInput {
  item: ExerciseItem
  response: string | null
  outcome: 'correct' | 'fuzzy' | 'wrong'
  userLanguage: 'en' | 'nl'
  audio?: { prompt?: AudioRef; answer?: AudioRef }  // resolved upstream by Session (which owns audioMap)
  acceptedVariants?: string[]
}

export function feedbackPropsFor(input: FeedbackMapInput): FeedbackProps {
  switch (input.item.exerciseType) {
    case 'recognition_mcq': return { ... }
    case 'cued_recall':     return { ... }
    // ... 10 more
  }
}
```

**One switch statement, 12 cases.** Audio resolution happens in the session layer (which owns `audioMap`) — not in the mapper. Mapper is pure over its args.

**Discriminator handling**:
- `cloze_mcq` vocab vs grammar: branches on `item.grammarPatternId != null`. If set → grammar-reveal layout. Else → vocab-pair.
- `constrained_translation` cloze-mode vs full-sentence: branches on `item.constrainedTranslationData.targetSentenceWithBlank != null`. Two sub-cases with different userAnswer + promptShown construction.
- `contrast_pair`: `promptShown.text` renders via `pair` variant's vertical-rule separator; both options carried in a single string formatted as `"option1│option2"` with the vertical rule rendered via CSS. Which option was picked comes from `userAnswer.text` (no need for a separate `alternates` prop).
- `speaking`: registry-refused (no mount). If somehow reached: feedback never renders (no `onAnswer` call without a commit path).

### 7.7 Event composition

Two sinks — wiring documented so every implementation doesn't reinvent it:

```
Exercise implementation
  useExerciseScoring({
    onAnswer: props.onAnswer,
    onEvent: props.onEvent,           // inner events from the reducer (exercise_shown, etc.)
  })

ExerciseShell (the thin dispatcher)
  <ExerciseRoute
    onAnswer={session.recordAnswer}
    onEvent={session.trackEvent}       // outer sink; routes to analyticsService.trackExerciseEvent()
  />

<ExerciseFeedback>
  onEvent={onEvent}                    // audio_replayed etc. route through the same outer sink
```

Pattern: thin wrapper receives `onAnswer` + `onEvent` from shell, pipes both into the scoring hook's config. Feedback primitive receives `onEvent` directly. Shell wires `onEvent` to the analytics service.

---

## 8. Feedback screen content spec

See §6.9 for layout/structure. §6.9 covers the primitive API; §7.6 covers the mapper. This section collects the content-level edge cases.

### 8.1 i18n keys (NL + EN)

All via `translations[userLanguage].session.feedback.*`:

| Key | NL | EN |
|---|---|---|
| outcomeCorrect | "Correct" | "Correct" |
| outcomeAlmost | "Bijna goed" | "Almost" |
| outcomeWrong | "Fout" | "Incorrect" |
| announceCorrect | "Correct" | "Correct" |
| announceWrong | "Fout. Het juiste antwoord is {x}." | "Incorrect. The answer is {x}." |
| announceFuzzy | "Bijna goed — het antwoord is {x}." | "Almost — the answer is {x}." |
| roleLabelHeard | "Je hoorde" | "You heard" |
| roleLabelShown | "Je zag" | "You saw" |
| roleLabelSaid | "Het woord was" | "The word was" |
| roleLabelTarget | "Juist antwoord" | "Correct answer" |
| roleLabelYourAnswer | "Jouw antwoord" | "Your answer" |
| roleLabelMeaning | "Betekent" | "Meaning" |
| roleLabelExplanation | "Uitleg" | "Explanation" |
| alsoAccepted | "Ook goed" | "Also accepted" |
| continueButton | "Doorgaan" | "Continue" |
| replayAudio | "Herhaal audio" | "Replay audio" |
| commitFailed | "Kon beoordeling niet opslaan — we gaan toch door." | "Couldn't save review — continuing anyway." |
| evenOverslaan | "Even overslaan" | "Let's skip this one" |
| weGaanDoor | "We gaan door met de volgende oefening." | "We're moving to the next exercise." |
| emptyAnswer | "(geen antwoord)" | "(no answer)" |
| next | "Volgende" | "Next" |

### 8.2 Missing-data handling

| Field missing | Behavior |
|---|---|
| `userAnswer` on outcome='correct' | Omit card (correct auto-advances anyway; only applies to fuzzy/wrong) |
| `userAnswer` on outcome='wrong' with empty response | Render card with "(geen antwoord)" placeholder at `--ex-fg-muted` |
| `meaning` | Omit line |
| `explanation` on vocab-pair | Omit line (not expected anyway) |
| `explanation` on grammar-reveal | **Silent omit** in UI. Missing grammar explanation is a **data-quality problem, not a UI problem**. Two detection mechanisms (see §12 Supabase Requirements): publish-time validation gate in `scripts/publish-approved-content.ts`, and runtime `content_gap` event emission that auto-inserts a `content_flags` row for admin review. Dev assertion stays. |
| `audio` | Omit replay button; label stays whatever the direction implies |
| `promptShown.text` / `correctAnswer.text` empty | Dev: throw invariant. Prod: render em-dash `—` placeholder; log via `logError` (no separate `exercise_data_corrupt` event — cut as YAGNI, no dashboard consumer). |

### 8.3 Service failure recovery

Detailed in §6.9. Key invariants:
- Feedback **still renders** from in-memory data even if `processReview` failed
- `exercise_commit_failed` event fires via `onEvent`
- Warning chip renders above outcome badge (not a subtle footnote — real incident rate justifies visibility)
- Continue still works — session doesn't stall
- FSRS state unchanged (no `review_events` row written) → next session re-surfaces the item
- Self-healing by design; no retry UI

### 8.4 Content length & shrink-to-fit

`word-break: break-word; overflow-wrap: anywhere` on all value cells.

For Indonesian compound words that exceed container width, shrink-to-fit: font-size drops one step (`--fs-lg` → `--fs-md`). Floor at `--fs-md`. Implementation: CSS-only via a combination of `container-type: inline-size` + `width: fit-content` + `@container` queries that drop the size class when content exceeds width thresholds. No JS `ResizeObserver`.

---

## 9. Design lab (`/admin/design-lab`)

Permanent admin-gated route. Two jobs: initial visual decision-making + ongoing visual QA.

### 9.1 Route + access

- Lazy-loaded via `React.lazy(() => import('./pages/admin/DesignLab'))`.
- `<AdminGuard>` gates on `authStore.status`: render full-page loader while `'initializing'`; redirect to `/` only when `status === 'ready' && !profile?.isAdmin`. Prevents redirect flicker during auth init.
- **Bundle isolation assertion** — Vitest can't natively inspect Rollup chunks. Concrete implementation: a post-build Node script (`scripts/check-bundle-isolation.ts`) runs after `bun run build` in CI. It reads `dist/.vite/manifest.json` (Vite's default build manifest) and asserts that (a) the main-entry's chunk dependency graph does NOT include any module under `src/pages/admin/designLab/`, `src/pages/admin/DesignLab.tsx`, `src/pages/admin/AdminGuard.tsx`, or `src/pages/admin/designLab/fixtures.ts`; (b) those modules exist only in a lazy-loaded chunk. Primitives ARE shared (used by real exercises + lab alike) — that's correct; the assertion is on lab-specific paths only. Shell out from a Vitest test for single-command CI: `test('design lab is not in main bundle', () => execSync('bun scripts/check-bundle-isolation.ts'))`.

### 9.2 Layout

Desktop: sidebar + content, anchor-linked sections. Mobile: sidebar collapses to `<Drawer>`. Persistent top bar: theme toggle, viewport-size selector (320/390/430/768/1024/full), reset-state button.

**Navigation groups** (7 top-level):
- **Prompt**: PromptCard, AudioButton, Instruction
- **Input**: Option, OptionGroup, TextInput, SubmitButton, Hint
- **Feedback**: Feedback, LanguagePill
- **Chrome**: Frame, FlagButton
- **Tokens** (meta)
- **Composition** (meta)
- **Viewport** (meta)

### 9.3 Per-primitive sections

Each section: heading + props API table + **2-axis state matrix** (rows = variant, cols = state) with sticky headers, empty cells for invalid combinations.

**Interactive inspector** (only for primitives with >6 meaningful combinations — Option, TextInput, PromptCard, Feedback). Per-primitive, strongly-typed (`useState<OptionProps>`), NOT a generic reflector — TypeScript would lose all guarantees. Mantine controls wired to named fields.

### 9.4 Token specimen

- **Type scale**: each `--fs-*` size shown with real Indonesian word + Dutch translation, forced `white-space: nowrap; overflow-x: auto` for x-height comparison. Separate "wrapping demo" block with 2-line Indonesian sentence per size for real wrap behavior.
- **Contrast ratios**: each token × each background it's legally used on. Red badge <4.5, amber 4.5–7, green ≥7. Rendered for both themes side-by-side (split-pane if viewport ≥1024px).
- **Spacing**: table (not bars) — same info, less surface.
- **Motion**: 3 controls per animation — tap (1×), loop (replay every 1.5s), 0.25× slow-mo. No frame scrubber.
- **Haptic triggers**: dropped entirely. Note "test on physical device" instead.

### 9.5 Composition examples (9)

1. MCQ — word / cued-recall (merged: same structure, different content)
2. Contrast pair (variant="pair")
3. Cloze MCQ
4. Cloze inline (different input model)
5. Typed recall
6. Transform
7. Audio MCQ (3 sub-states inline: before-play, playing, revealed)
8. Dictation
9. Feedback screens × 4 variants (vocab-pair correct, vocab-pair wrong, grammar-reveal wrong, audio→ID dictation wrong)

Sentence MCQ dropped (covered by Word MCQ + a longer prompt fixture).

Composition imports via the **registry** (pays the chunk cost) — lab doubles as a registry smoke check.

### 9.6 Fixtures

Factory functions in `src/pages/admin/designLab/fixtures.ts`:

```ts
export const makeLearningItem = (overrides?: Partial<LearningItem>): LearningItem => ({ ... defaults ..., ...overrides })
export const makeWordMcqFixture = (overrides?): ExerciseItem => ({ ... })
// ... etc
```

Each composition example is 3–5 lines of overrides.

### 9.7 Theme & viewport

- **Theme**: dark / light toggle. **Split view cut** — designer's call on complexity vs. ROI grounds (synced scroll across two panes, keyboard-nav scope, narrow-viewport degradation below 768px). Two browser tabs solve the same need with zero implementation cost.
- **Viewport**: fixed-width container (`max-width: {viewportPx}; margin: 0 auto`). Visible banner: "Simulates width. Safe-area, touch, vh, scrollbar require real device."
- URL schema: `?theme=dark|light&viewport=390&outcome=wrong` — bookmarkable. Resets cleared by reset button.
- Responsive behavior via `@container exercise` queries (matches primitives; see §5.5 R1) — fixed-width wrapper drives container queries correctly.

### 9.8 Discovery

- Sidebar link "Design Lab" under admin profile menu, gated on `profile?.isAdmin`
- `⌘⇧D` keyboard shortcut from anywhere in-app
- Direct URL `/admin/design-lab` (bookmarkable)
- No main-nav entry

### 9.9 Tests

One Vitest smoke test: route renders, `<AdminGuard>` redirects non-admin, no thrown errors. No Playwright (lab is visual; snapshot testing its output is the exact YAGNI we're cutting).

---

## 10. Migration plan

**Single batch-PR for the exercise migration.** User is the sole user during migration and won't exercise the app mid-migration, so per-PR rollout granularity doesn't buy anything. Git history preserves revertibility.

### 10.1 Ordered steps (separate PRs)

1. **Tokens + `@layer` declaration** (PR #1) — `src/main.tsx` adds new tokens; `src/styles/layers.css` adds `@layer mantine, exercises;`; imported first in `main.tsx` via JS import. Zero behavioral change. Shipping checkpoint.
2. **All 13 primitives + design-lab route** (PR #2) — implementations in `src/components/exercises/primitives/`, unit-tested in isolation, rendered in `/admin/design-lab`. Primitives don't ship to real exercises yet. Design-lab sidebar entry hidden until admin check passes. Shipping checkpoint.
3. **Infrastructure** (PR #3) — `useExerciseScoring`, registry (empty — falls through to legacy `ExerciseShell` switch for unmapped types), `<ExerciseErrorBoundary>`, `<ExerciseSkeleton>`, contexts, `triggerHaptic`. Registry is empty so no behavior change yet. Shipping checkpoint.
4. **Exercise migrations — three smaller PRs (PR #4a, #4b, #4c)**. 12-exercise monolith PR would balloon past reviewability (~2000 LOC). Each intermediate PR ships safely because PR #3's registry falls through to legacy `ExerciseShell` switch for unmigrated types.
   - **PR #4a — Tier 1 (4 exercises, simplest)**: Speaking (no-op), ContrastPair (simple MCQ), RecognitionMCQ, CuedRecall. Establishes the primitive+scoring wiring pattern on auto-commit MCQ.
   - **PR #4b — Tier 2 (4 exercises, typed + middle complexity)**: ClozeMcq, ListeningMCQ (audio prompt card), TypedRecall, MeaningRecall. Exercises audio prompt variant and the typed input state flow.
   - **PR #4c — Tier 3 (4 exercises, most complex configs)**: ConstrainedTranslation (cloze + full-sentence modes), SentenceTransformation (retry-with-hint config), Cloze (inline input), Dictation (gated on `hasPlayedOnce`). Exercises every reducer config variant.
   
   Pre-existing tests (`sessionFlow.test.tsx`, `exerciseShell.test.tsx`, `dictationExercise.test.tsx`, `cuedRecallExercise.test.tsx`, `speakingExercise.test.tsx`, `listeningMcqExercise.test.tsx`, `mcqWrongAnswer.test.tsx`) act as regression net — all must stay green through every migration PR. Each PR is a shipping checkpoint.
5. **`<ExerciseFeedback>` cutover** (PR #5) — flip all 12 entries in `registryMeta.ts` to `usesNewFeedback: true`; delete `ExerciseShell.tsx:316-440` legacy feedback path; verify session-start lock renders new feedback for all sessions. Shipping checkpoint.
6. **FlagButton mobile redesign + `flag_type` nullable** (PR #6) — new `<FlagButton>` in primitives; DB migration drops NOT NULL + CHECK constraint on `flag_type`. See §12. Shipping checkpoint.
7. **Cleanup** (PR #7) — delete `registryMeta.ts`, delete legacy `ExerciseShell.tsx` entirely (rewrite as ~40-line dispatcher using registry + `<ExerciseErrorBoundary>` + feedback gate), delete unused CSS modules. Shipping checkpoint.

### 10.2 Rollback strategy

Each PR is independently revertible via `git revert`. If a regression surfaces post-deploy:
- PR #1–3 (foundations): revert without impact.
- PR #4 (exercise migration): revert to re-enable legacy `ExerciseShell` switch — session still works.
- PR #5 (feedback cutover): revert to re-enable legacy feedback screen — one-line flag deletion.
- PR #6 (FlagButton): revert app code; DB migration stays (nullable column is backwards-compatible; old enum values still valid).

---

## 11. Test strategy

### 11.1 Unit tests

- **`useExerciseScoring`** (`src/lib/useExerciseScoring.test.ts`) — one describe block per config variant (tap-auto-commit, typed-auto-commit, retry-with-hint, gated, no-op). Each state transition tested. Mock timers for `correctDelayMs`. StrictMode idempotency verified. ~200 lines, 15 tests.
- **Registry** (`src/components/exercises/registry.test.ts`) — every `ExerciseType` has a registry entry; `resolveExerciseComponent('bogus')` throws; `exerciseSkeletonVariant` populated for every type.
- **`feedbackPropsFor`** (`src/__tests__/feedbackMapping.test.ts`) — table-driven, 12 exercise-type cases + 6 edge cases (missing meaning, missing audio, fuzzy typed, fuzzy MCQ, service-fail flag, empty text fallback). Pure function; no RTL needed.
- **`triggerHaptic`** (`src/components/exercises/primitives/haptics.test.ts`) — spies on `navigator.vibrate`; asserts pattern per event; no-op when `vibrate` absent.
- **Context-slot check** (`src/components/exercises/primitives/slot.test.tsx`) — rendering `<ExerciseSubmitButton>` outside Frame's footer slot triggers `console.error` in dev (asserted via spy); rendered inside the slot → no error.
- **`<ExerciseErrorBoundary>`** (`src/components/exercises/ExerciseErrorBoundary.test.tsx`) — throwing exercise renders fallback; `onAnswer({skipped: true, reviewRecorded: false})` is called on catch.
- **i18n completeness** (`src/__tests__/i18n.test.ts`) — asserts `translations.nl` and `translations.en` have identical key sets (recursive); asserts no duplicate keys within a single locale. Catches the silent-TypeScript-failure pattern from 2026-04-02 merge.
- **`usesNewFeedback` session-wide lock** (`src/__tests__/feedbackFlag.test.tsx`) — build a session with a mix of migrated and un-migrated exercise types; assert the whole session uses the legacy feedback screen. Flip all types to migrated; assert the whole session uses `<ExerciseFeedback>`. Guards against mid-session UX inconsistency.
- **FlagButton nullable `flag_type`** (`src/components/exercises/primitives/FlagButton.test.tsx`) — mock `contentFlagService.upsertFlag`; assert that saving a flag with only a comment (no chip) calls the service with `flag_type: null`. Guards the §12 DB migration behavior from regression.

### 11.2 Integration tests (RTL)

- **`<ExerciseFeedback>`** (`src/__tests__/ExerciseFeedback.test.tsx`) — renders 3 representative fixtures (vocab-pair correct auto-advance, grammar-reveal wrong, fuzzy diff-pair). Structural queries (no snapshots). Asserts aria-live announcement, focus-on-Continue delay, pointer-events gating.
- **Focus orchestration** (`src/__tests__/focusOrchestration.test.tsx`) — render Session, complete exercise 1, assert `document.activeElement` is exercise 2's `<h2>`.
- **Existing tests** — `sessionFlow.test.tsx`, `exerciseShell.test.tsx`, `dictationExercise.test.tsx`, `cuedRecallExercise.test.tsx`, `speakingExercise.test.tsx`, `listeningMcqExercise.test.tsx`, `mcqWrongAnswer.test.tsx` — regression net. All green through each migration commit.

### 11.3 Build + cascade tests

- **`@layer` ordering** (Playwright-env Vitest — jsdom doesn't evaluate `@layer`): one smoke test asserting a primitive class beats a Mantine class on a shared selector.
- **Layers file in main entry**: Vitest build-output check that `src/styles/layers.css` appears in the main entry chunk graph. Protects against reorder regressions.
- **Design lab bundle isolation**: Vitest build-output check that `src/pages/admin/designLab/**`, `DesignLab.tsx`, `AdminGuard.tsx`, `fixtures.ts` are absent from the main entry chunk graph.

### 11.4 Design lab smoke test

Single Vitest test: route renders, `<AdminGuard>` redirects non-admin, no console errors. No Playwright visual snapshots (YAGNI — visual QA is what the lab itself is for).

---

## 12. Supabase Requirements

Per CLAUDE.md convention.

### 12.1 Schema changes

**Single migration**: make `indonesian.content_flags.flag_type` nullable + drop the CHECK constraint that enumerates the 5 existing values.

Current schema (verified at `scripts/migration.sql:956-962`):
```sql
flag_type text NOT NULL CHECK (flag_type IN ('wrong_translation', 'bad_sentence', 'confusing', 'sunset', 'other')),
```

Needed:
```sql
-- Drop NOT NULL so null is a legal value (used when admin saves a flag without a category — which is now the default UI flow)
ALTER TABLE indonesian.content_flags
  ALTER COLUMN flag_type DROP NOT NULL;

-- Drop the CHECK constraint so future category values don't require schema changes
-- (Existing rows retain their enum values — the five values above stay legal, plus null, plus any string)
ALTER TABLE indonesian.content_flags
  DROP CONSTRAINT IF EXISTS content_flags_flag_type_check;

-- Reload PostgREST schema cache so app sees the change immediately
NOTIFY pgrst, 'reload schema';
```

Additive + backwards-compatible. Existing flags with their enum values remain valid.

Migration applied to `scripts/migrate.ts` (per 2026-03-31 lesson: edit `migrate.ts`, not `migration.sql` — running `make migrate` regenerates `migration.sql` from the template).

**Idempotency**: both statements are inherently idempotent in Postgres without wrapping:
- `ALTER ... DROP NOT NULL` is a no-op when the column is already nullable.
- `ALTER ... DROP CONSTRAINT IF EXISTS` is explicitly idempotent.

Safe to re-run after container recreation. No `DO $$` block needed.

**No new tables. No new columns.** Everything else is schema-unchanged.

### 12.2 RLS policies

**No changes.** Existing `content_flags_owner` policy (`scripts/migration.sql:976`) covers the new nullable case — the policy is row-scoped on `user_id = auth.uid()`, independent of `flag_type`.

### 12.3 Grants

**No changes.** Existing grants (`scripts/migration.sql:981`): `GRANT SELECT, INSERT, UPDATE, DELETE ON indonesian.content_flags TO authenticated;` — still correct. `service_role` has full access via schema-level grants.

### 12.4 homelab-configs changes

- **PostgREST schema exposure**: no change. `indonesian` schema already in `PGRST_DB_SCHEMAS`.
- **Kong CORS origins**: no change. `indonesian.duin.home` already in Kong config.
- **GoTrue auth config**: no change.
- **Storage buckets**: no change. No new buckets needed.

### 12.5 Migration application workflow

Per 2026-03-18 + 2026-04-21 homelab lessons (port 5432 not exposed; use MCP for dev iteration, `make migrate` for prod):

**Dev**: apply via OpenBrain MCP `execute_sql` for immediate verification:
```sql
ALTER TABLE indonesian.content_flags ALTER COLUMN flag_type DROP NOT NULL;
ALTER TABLE indonesian.content_flags DROP CONSTRAINT IF EXISTS content_flags_flag_type_check;
NOTIFY pgrst, 'reload schema';
```
Verify: `make check-supabase-deep` reports `flag_type` nullable.

**Prod**: add ALTER statements to the template literal in `scripts/migrate.ts`. Run `make migrate` (which SSHes to homelab, runs `docker exec supabase-db`, reloads PostgREST cache). Safe to re-run — the DO blocks are idempotent.

### 12.6 Health check additions

- **`scripts/check-supabase.ts` (anon key)**: no new checks — existing table-readable check covers the nullable case.
- **`scripts/check-supabase-deep.ts` (service key)**: add assertion that `indonesian.content_flags.flag_type` IS NULLABLE (post-migration state). One query against `information_schema.columns`. Protects against accidental rollback.

### 12.7 Content DQ check (§8.2 grammar-explanation gap)

Addressed in two places, both outside the Supabase requirements for this migration (documented here for traceability):

1. **`scripts/publish-approved-content.ts` — new quality gate** (implementation in migration PR #4 or separate content-pipeline PR): grammar patterns without an explanation fail the publish step. Routes to `linguist-structurer` agent per existing content-seeder agent routing.
2. **Runtime safety net in `feedbackPropsFor`**: if `layout === 'grammar-reveal'` AND `explanation` is empty:
   - Emit `content_gap` event via `onEvent`
   - Auto-insert a `content_flags` row: `flag_type: null, comment: 'Auto: missing explanation for grammar pattern'`, `user_id: <current admin>`. Idempotent via the existing unique constraint on `(user_id, grammar_pattern_id, exercise_type)`.
   - UI silent-omits (per §8.2)

---

## 13. Out of scope / future work

Explicitly deferred, NOT part of this design:

- (*Completed, not deferred*) **Mantine v9 upgrade**: landed as PR #17 (commit `ef7ebda`) before this design was written. The v8→v9 bump was sitting in `package.json` with an un-synced lockfile until this session's baseline check; tests pass under v9 (429/429) with no API changes to primitives this design uses. Reference throughout this doc is to Mantine v9.
- **`<ExerciseReveal>` "I don't know" primitive.** Cut — binary FSRS grading means "wrong" and "don't know" produce identical signals.
- **Pre-commit MCQ confirmation.** Cut — tap-to-commit preserved. Busuu/Lingvist pattern may be revisited later.
- **Word-level diff visualization** on fuzzy feedback. `userAnswer.diffSegments?` slot deferred — add when there's a concrete pedagogical signal that plain side-by-side is insufficient.
- **`hapticsEnabled` user-profile toggle.** Add when first user reports unwanted haptic feedback. Until then: haptics always on.
- **Design-lab automatic visual snapshot testing.** Lab is visual; snapshots are the YAGNI.
- **Admin flag mobile QOL — "quick categorize" chips.** User hardly used the 5 existing chips; ship comment-only, revisit if categorization need emerges.
- **ASR (speaking exercise activation).** Speaking is registry-refused today; ASR integration is a separate design.
- **Bulk migrate existing `review_events` with new event metadata schema.** Not required — new events coexist with old.

---

## 14. Performance budget

Targets measured on a mid-range mobile device (throttled 4G, iPhone 12 equivalent) via Lighthouse during CI:

- **Initial exercise TTI** (first exercise of a session, cold cache): ≤ 1.2s after session-queue build completes. Dominated by first lazy-chunk load; `<ExerciseSkeleton>` fills the Frame within 50ms.
- **Exercise-to-exercise transition**: ≤ 150ms (chunk preloaded on prior `answer_committed`). Skeleton never visible in steady state.
- **Feedback-mount TTI**: ≤ 100ms after user-answer commit. Feedback primitive is eagerly loaded (not lazy).
- **Main-entry bundle target**: ≤ 180 KB gzip for the JS entry chunk (excluding Mantine). CI build output includes a size-diff report against main; PRs adding >5 KB to the main entry require explicit review.
- **Exercise chunk size**: each exercise lazy chunk ≤ 12 KB gzip. Primitives + scoring hook are shared across all 12 and live in the main bundle (intentional — amortizes their size across all exercises after the first load).
- **Memory**: feedback screen + exercise together ≤ 5 MB heap. Scoring hook's timer cleanup on unmount is mandatory (§7.1).

Budget regressions surface as CI build-report alerts. No hard block — but requires an explicit waiver line in the PR description.

## 15. Accessibility audit checklist

WCAG 2.1 Level AA as the ship target. Each primitive covered:

| Primitive | Keyboard | Screen reader | Focus visible | Color contrast | Motion respected |
|---|---|---|---|---|---|
| Frame | Tab nav | `role="main"` | — | n/a | `prefers-reduced-motion` honored on child animations |
| Instruction | focus target via auto-focus + `tabIndex=-1` | `<h2>` | `:focus-visible` ring suppressed (only SR-announced) | AA on body surface | n/a |
| PromptCard | Tab through audio button | `role="group"` + aria-label | on audio button | AA for prompt text & meta | audio wave animation gated |
| Option | Tab + Space/Enter | `role="button"` + `aria-pressed` + glyph aria-label | `:focus-visible` `--ex-focus-ring` | AA via triplet tokens, both themes | scale/shake gated → opacity only |
| OptionGroup | Tab order natural | `role="group"` + `aria-labelledby` → Instruction's h2 id | — | n/a | mount stagger gated → 0ms |
| TextInput | natural text input + Enter submit | visually-hidden `<label>` + `aria-invalid` + `aria-describedby` | `:focus-visible` `--ex-focus-ring` | AA border + text color | border color 120ms transition only |
| SubmitButton | Tab + Space/Enter | native `<button>` + `aria-busy` + `aria-disabled` | `:focus-visible` | AA on `--accent-primary` | press scale gated |
| LanguagePill | — | `aria-hidden` (decorative) | — | AA on card bg | n/a |
| Feedback | Tab to Continue; region focusable via `tabIndex=0` for arrow-scroll | `role="region"` + badge `role="status" aria-live="assertive"` full-sentence announce | on Continue after 400ms | AA on all text + pills; AAA for primary accent | mount slide 8px gated → opacity only |
| AudioButton | Space/Enter | native `<button>` + state via `aria-live="polite"` | `:focus-visible` | AA icon on bg | playing wave gated |
| Hint | Space/Enter on trigger (if collapsed) | `role="note"` + `aria-expanded` + `aria-live="polite"` on reveal | `:focus-visible` | AA on muted fg + subtle bg | reveal gated → opacity only |
| FlagButton | Space/Enter + Tab through sheet contents | `role="dialog"` on Drawer/Popover + auto-focus textarea | `:focus-visible` | AA on all states | sheet slide gated |

**Pre-ship audit**: manual VoiceOver (iOS) + TalkBack (Android) + NVDA (Windows desktop) walkthrough of three representative flows — a vocab MCQ session, a typed exercise with a wrong answer, an admin flag creation. Logged findings block the cutover PR until resolved.

## 16. Privacy review

The new `onEvent` analytics stream carries exercise metadata — no PII beyond what today's `review_events` writes:

**Fields per event**: `event_type`, `exercise_type`, `learning_item_id` or `grammar_pattern_id`, `latency_ms`, `failure_count`, `hint_shown`, `outcome` (on commit events), `error_message` (on error events, sanitized — no stack traces, no user input). No raw user response text; no IP; no session cookie; no device fingerprint. `user_id` is the Supabase `auth.uid()` — already established in `review_events` and covered by RLS.

**Storage**: events either route to the existing `indonesian.review_events` table (for `answer_committed`) or to `console.log` during dev with a future `indonesian.exercise_events` table proposed separately when a concrete analytics consumer emerges. This design does NOT create new persistent storage; the event shape is the forward-compatible contract.

**Third-party sink**: none. No external analytics provider (no GA, no Segment, no Amplitude). Data stays in the self-hosted Supabase instance at `api.supabase.duin.home`.

**Right to erasure**: if a user requests deletion, the same cascade that removes their `review_events` covers any future `exercise_events` (same `user_id` FK to `auth.users`, same `ON DELETE CASCADE` policy).

**Consent**: today the app is single-user + family access; no explicit consent UI. When shipping to external consumers, a privacy notice will document the event stream — that's a separate deliverable tied to consumer launch, not this framework rewrite.

## 17. Document history

- **v1 (2026-04-23)**: initial draft through §6 written in design session; architect + UI-designer reviews over 3 rounds (2 blockers, 11 warnings, 8 YAGNI cuts caught).
- **v1.1 (2026-04-23)**: v1 + cross-check against openbrain design-system lessons. Added: StrictMode scoring guard (§7.1), i18n duplicate-key test (§11.1), FlagButton migration workflow (§12.5).
- **v1.2 (2026-04-23)**: architect end-to-end review caught 3 criticals + 7 warnings + YAGNI cut. Fixed: §7.5 React-internals issue replaced with `registryMeta.ts` sync manifest; §7.2 `ExerciseComponentProps.onAnswer` signature widened to `AnswerOutcome` union; §12.1 idempotent-migration claim corrected (bare ALTERs are sufficient); §9.1 bundle isolation mechanism specified (post-build Node script parsing `dist/.vite/manifest.json`); §10.1 PR #4 split into #4a/b/c; §7.1 StrictMode guard clarification added; §11.1 added `usesNewFeedback` lock test + FlagButton null-type test; §7.1 event list trimmed 12→8 with concrete downstream for each. Added §14 Performance budget, §15 A11y audit checklist, §16 Privacy review.
- **v1.2.1 (2026-04-23)**: v1.2 re-review. Architect confirmed all 3 v1.1-critical fixes are correctly resolved. One false-positive flagged (§12.7 `grammar_pattern_id` column) — grep-verified the column exists at `scripts/migration.sql:1146` with the matching unique constraint at 1175; architect had only read the initial CREATE TABLE and missed the later extension. One real propagation gap addressed: §7.3 now explicitly names `Session.tsx:344-359` `recordAnswer` handler as requiring the `AnswerOutcome` widening + documents that `useExerciseScoring.onAnswer` (hook) stays typed to `AnswerResult<TResponse>` — the boundary's skip path bypasses the hook.
- **v1.3 (2026-04-23)**: pre-commit baseline check surfaced a package.json/lockfile divergence — PR #17 (`ef7ebda`) had bumped Mantine to v9 in `package.json` but `bun install` hadn't been run since the merge. Synced: `bun install` pulled Mantine v9.1.0, TypeScript 6.0.3, ESLint 10.2.1. All 429 tests pass under v9 with zero regressions; Drawer `position="bottom"` API preserved; no primitive used by this design has a breaking API change v8→v9. Doc updated from "Mantine v8" → "Mantine v9.1" references; §13 no longer lists v9 upgrade as deferred (it landed); §9.7 split-theme-cut rationale cleaned of v8-specific wording (cut stands on designer's complexity/ROI grounds). Lint has 494 false-positive errors from stale `.claude/worktrees/agent-acc4bd92` with a sibling tsconfig — not a code issue; cleanup separate from this work. Typecheck: clean except one deprecation warning (`baseUrl` in `tsconfig.app.json`, TypeScript 6.0 flags this will be removed in 7.0 — non-blocking).

- **v1.4 (2026-04-23)**: post-implementation review captured three documented deviations from the spec during PRs #4a–#7:

  1. **`AnswerOutcome` signature** — §7.2 spec'd `ReviewResult | GrammarReviewResult | Skip`. Actual impl uses `ExerciseAnswerReport | Skip` where `ExerciseAnswerReport = {wasCorrect, isFuzzy, latencyMs, rawResponse}`. Thin wrappers report raw answer data; `ExerciseShell` owns the `processReview` translation. Rationale: `processReview` needs session context (userId, sessionId, learner states) that lives in the shell; threading it through every wrapper would add 5 props × 12 files with no architectural benefit. Documented in `registry.ts` JSDoc.

  2. **FlagButton submits `flag_type: 'other'`** instead of `null`. The new FlagButton drops the category-chip UI (§6.12) but the `flag_type` column is still `NOT NULL` until `scripts/migration.sql`'s ALTER is applied to prod. Writing `'other'` (an existing enum value) works both before and after the migration — safe to ship code and migration in any order. Documented inline in the primitive.

  3. **Legacy exercise components remain in the repo** (`src/components/exercises/*.tsx`). 4 test files + `ContentReview.tsx` (admin preview) still import them. The registry-path code no longer references them; they're load-bearing only for the preview + test surfaces. Deletion deferred to a separate follow-up PR that updates `ContentReview` to use the new primitives.

  4. **`onEvent` analytics wiring deferred**. `useExerciseScoring` emits events (`exercise_shown`, `answer_committed`, `exercise_commit_failed`, etc.) and thin wrappers forward an `onEvent` prop into the hook. But `ExerciseShell` never passes `onEvent` when mounting the lazy exercise, so events are currently discarded. The hook and the wrapper plumbing are in place; wiring to `analyticsService.trackExerciseEvent()` is a future PR once the analytics sink is defined. A `TODO` comment at the mount site marks this.

  Pre-push fixes applied after this review: (a) `<ExerciseErrorBoundary>.handleSkip` made idempotent via `skipReported` state flag so a manual Skip tap after `componentDidCatch` doesn't double-advance Session's `currentIndex`. (b) The four deviations above added to this doc (previously two were undocumented).
- **Approved 2026-04-23** by user after 8 rounds of dispatched reviews (3 per-section architect + 3 per-section designer + 1 holistic architect + 1 v1.2 re-review). Validated against Mantine v9.1. Ready for implementation-plan phase via `superpowers:writing-plans`.
