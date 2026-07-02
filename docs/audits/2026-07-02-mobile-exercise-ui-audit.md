# Mobile exercise-UI look-and-feel audit — 2026-07-02

**Scope:** MOBILE ONLY, iPhone 390×844 (deviceScaleFactor 2). Desktop is a separate future program.
**Method:** visual pass over fresh captures of all 12 live exercise types + dashboard baseline + design-lab, cross-referenced against `src/components/exercises/primitives/*`, `src/components/experience/*`, and the token layer in `src/main.tsx`.
**Owner complaint (verbatim):** "there are different font sizes used, some very small, some very large, which make sentences go to multiple lines on mobile. It looks pretty ugly in some cases. Ideally I want a beautiful design there which still aligns to the look and feel of the app."

**Verdict:** the complaint is accurate and has a single structural root cause. **Color is tokenized at the exercise-surface level (`--ex-fg`, `--ex-fg-muted`, `--ex-option-*`, `--ex-correct-*`), but TYPE is not.** Every text style reaches straight into the raw generic `--fs-*` scale ad-hoc per component, and that scale is fixed-px with no `clamp()`. So a long Indonesian sentence at fixed 24px cannot shrink and explodes to 3–4 lines on a 390px viewport. This is a systematization gap, not a redesign need.

---

## 1. The five worst offenders

| # | Screenshot | Problem (one line) |
|---|---|---|
| 1 | `produce_form_from_context.png` | Cloze sentence at fixed 24px + inline blank wraps to **3 lines** ("Narti: Dia minta [ ] rokok kretek, ikan asin dan krupuk udang!"); bold speaker label jumps size mid-line; NL gloss shrinks to 14px italic — four sizes stacked, reads cramped and ugly. |
| 2 | `contrast_grammar_pattern.png` | Prompt with nested quotes ("De zin betekent: '…' Welk woord past: '…'") at fixed 24px wraps to **4 lines**; no size relief for long text. |
| 3 | `produce_grammar_pattern.png` | Instruction and prompt conflated: dimmed 20px "Transformeer: Vervang…" wraps 3 lines, THEN a 24px white sentence — two large competing text blocks, unclear which to read first. |
| 4 | `recognise_word_form_link.png` | 20px instruction "Kies de juiste opbouw van het woord" wraps and **collides with the flag icon** top-right; instruction is simultaneously large (20px) AND low-contrast (muted gray) — a hierarchy contradiction. |
| 5 | `recognise_meaning_from_text.png` vs `recognise_meaning_from_audio.png` | Audio button is inconsistent between siblings (small, top-right corner in one; large, centered hero in the other) for the same conceptual role; prompt-word is cyan 30px while sentence prompts are white 24px — two unrelated "hero" treatments. |

---

## 2. Code inventory — every exercise text style → source

Base scale (`src/main.tsx:62-69`), fixed px, **no clamp anywhere**:
`--fs-xs 12 / --fs-sm 14 / --fs-md 16 / --fs-lg 18 / --fs-xl 20 / --fs-2xl 24 / --fs-3xl 30 / --fs-4xl 36`.

| Surface | Component | Source | Size | Weight | Color |
|---|---|---|---|---|---|
| Progress "Oefening 1 van 1" / "0/1 correct" | ExperiencePlayer.tsx:61-62 | Mantine `size="sm"` (not a token) | 14 | normal | dimmed |
| Instruction label | ExerciseInstruction.module.css:7 | `--fs-xl` | **20** | medium | `--ex-fg-muted` (gray) |
| Prompt — word | ExercisePromptCard.module.css:61 | `--fs-3xl` (36 @≥769px) | **30** | bold | accent (cyan) |
| Prompt — sentence | ExercisePromptCard.module.css:85 | `--fs-2xl` | **24** | medium | `--ex-fg` (white) |
| Prompt — transform | ExercisePromptCard.module.css:118 | `--fs-2xl` | 24 | medium | white |
| Prompt — pair | ExercisePromptCard.module.css:136 | `--fs-2xl` | 24 | semibold | white |
| Prompt meta (NL gloss) | ExercisePromptCard.module.css:37 | `--fs-sm` | 14 | normal italic | muted |
| Constraint chip | ExercisePromptCard.module.css:21 | `--fs-xs` | 12 | semibold | accent |
| Reveal transcript | ExercisePromptCard.module.css:44 | `--fs-2xl` | 24 | bold | accent |
| Option — word | ExerciseOption.module.css:35 | `--fs-xl` !important | 20 | — | white |
| Option — sentence | ExerciseOption.module.css:55 | `--fs-lg` !important | 18 | — | white |
| Text input | primitives/global.css:15 | `max(16px,--fs-xl)` | 20 | — | — |
| Submit button | ExerciseSubmitButton.module.css:11 | `--fs-lg` | 18 | — | — |
| Feedback title/body | ExerciseFeedback.module.css:112/45 | `--fs-xl` / `--fs-md` | 20/16 | — | — |
| Hint | ExerciseHint.module.css:10 | `--fs-sm` | 14 | — | — |
| Language pill | LanguagePill.module.css:4 | `--fs-xs` | 12 | — | — |

**Distinct sizes on a single screen** (`produce_form_from_context`): 14 (progress) · 20 (instruction) · 24 (prompt) · 14 (meta) · 18 (submit) = four steps, with the 24px prompt as the wrap culprit. **Across the surface:** 12→36, eight steps — literally "some very small, some very large."

---

## 3. Root cause

The card-color system proves the pattern the type layer is missing: color has a semantic exercise-token tier (`--ex-*`) mapped once in `main.tsx`, so every component speaks in roles ("option bg", "muted fg") not raw values. **Type never got that tier.** Consequences:

- **CRITICAL** — the sentence prompt is a hard `--fs-2xl` (24px) with no `clamp()`, so it cannot adapt to sentence length or viewport → 3–4 line explosions (offenders 1–3).
- **MAJOR** — instruction is `--fs-xl` (20px) muted: big *and* de-emphasized at once, competes with the prompt and collides with chrome (offender 4).
- **MAJOR** — two unrelated "hero" type treatments (word = 30px cyan, sentence = 24px white) with no shared token make the surface feel like different screens (offender 5).
- **MINOR** — progress header uses a Mantine `size` prop instead of a token; options split 20/18 by variant; eight raw sizes in play with no semantic names.

---

## 4. Proposal — a semantic `--ex-fs-*` type tier (systematization, not redesign)

Add one token block to `src/main.tsx` `cssVariablesResolver.variables` (theme-agnostic — type doesn't switch by theme), mirroring the existing `--ex-*` color tier. Colors, radii, spacing, and the accent-vs-white intent all stay exactly as they are. Only the two prompt tiers gain `clamp()` so long sentences shrink gracefully instead of wrapping.

### Proposed mobile type scale (6 steps)

| New token | Role | Value | Replaces |
|---|---|---|---|
| `--ex-fs-chrome` | progress, NL gloss/meta, hint, pills, captions | `13px` | fs-xs/sm sprawl (12/14) |
| `--ex-fs-instruction` | instruction label | `15px` | `--fs-xl` (20) — shrink + keep secondary |
| `--ex-fs-body` | options, text input, submit, feedback body | `17px` | `--fs-lg`/`--fs-xl` mix (18/20) |
| `--ex-fs-prompt-word` | single-word prompt (hero) | `clamp(24px, 7vw, 32px)` bold | `--fs-3xl` (30) |
| `--ex-fs-prompt-sentence` | sentence / transform / pair prompt | `clamp(19px, 5.2vw, 24px)` | `--fs-2xl` fixed (24) |
| `--ex-fs-reveal` | post-answer transcript / reveal | `= prompt-sentence` | `--fs-2xl` |

At 390px, `5.2vw ≈ 20.3px`, so a long sentence lands ~20px (≤2 lines) while a short sentence never exceeds 24px. The word prompt stays the visual hero via the higher clamp band.

### Per-surface repoint (each is a one-line CSS-module edit; no component logic changes)

`ExerciseInstruction .root` → `--ex-fs-instruction` · `ExercisePromptCard .word .prompt` → `--ex-fs-prompt-word` · `.sentence/.transform/.pair .prompt` → `--ex-fs-prompt-sentence` · `.reveal` → `--ex-fs-reveal` · `.meta` → `--ex-fs-chrome` · `ExerciseOption .word/.sentence` → `--ex-fs-body` · `ExerciseTextInput`/`global.exerciseInput` → `max(16px, --ex-fs-body)` (keep the iOS-zoom floor) · `ExerciseSubmitButton` → `--ex-fs-body` · `ExerciseHint`/`LanguagePill` → `--ex-fs-chrome` · progress header → `--ex-fs-chrome`.

### Before/after sketches (worst screens)

**`produce_form_from_context`** — *Before:* 24px bold sentence over 3 lines, 20px gray instruction above, 14px italic NL below = 4 sizes.
*After:* instruction 15px secondary on one line; prompt clamps to ~20px → 2 lines with the inline blank vertically centered; speaker label stays semibold at the *same* size (weight, not size, carries emphasis); NL gloss 13px directly under with the existing 8px gap. Three sizes, one clear hero.

**`contrast_grammar_pattern`** — *Before:* 24px prompt, 4 lines.
*After:* clamp lands ~19–20px → 2–3 lines; nested-quote target reads as one block instead of a wall.

**`produce_grammar_pattern`** — *Before:* dimmed 20px instruction (3 lines) + 24px white sentence, two competing blocks.
*After:* instruction 15px secondary (clear "chrome" tier) + sentence clamps down; the 15-vs-~20px gap makes reading order obvious at a glance.

### How to verify

Re-capture the identical set at 390×844, dsf 2: all 12 exercise types + `_design-lab.png`. Acceptance:
- No sentence/transform prompt exceeds **2 lines** for content ≤ ~40 chars; none exceeds 3 lines ever.
- Instruction never collides with the flag icon (add `padding-right` for the flag slot, or move the flag to a fixed chrome row — see §5).
- At most **4 distinct type sizes** visible per screen.
- Dark and light both checked (type tokens are theme-agnostic, so parity is automatic — confirm anyway).
- Design-lab Tokens strip still renders the full scale (it reads the raw `--fs-*`, which is unchanged).

---

## 5. Decisions for the owner (taste) vs agent-runnable

**Decisions for the owner (taste-level):**
1. Keep the intentional split *word prompt = cyan accent, sentence prompt = white*? (Recommend keep — it signals "translate this word" vs "complete this sentence".)
2. Word-prompt clamp ceiling of **32px** — acceptable, or hold the current 30px?
3. Should cloze/sentence prompts sit in a subtle `Paper` surface to separate them from pure black, or stay transparent as now? (Recommend stay transparent — matches the app's flat exercise canvas.)
4. Flag icon: move to a dedicated fixed top-right chrome slot (cleanest, prevents all future instruction collisions) vs just reserving instruction padding-right? (Recommend the fixed slot.)
5. Instruction shrink 20→15px — confirm you're happy the instruction becomes clearly secondary to the prompt.

**Agent-runnable once approved (no taste calls):**
- Add the `--ex-fs-*` block to `src/main.tsx` `cssVariablesResolver.variables`.
- Repoint the ~12 primitive CSS-module `font-size` declarations per §4 (all one-liners).
- Swap the progress-header Mantine `size="sm"` for `--ex-fs-chrome`.
- Add flag-slot spacing per the owner's choice in decision 4.
- Re-run the capture harness and diff against this baseline.

No schema, service, or state changes. No `<Card>`/token-in-CSS violations introduced (all new tokens land in `main.tsx`).
