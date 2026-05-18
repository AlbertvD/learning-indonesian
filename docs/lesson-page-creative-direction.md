# Lesson Page Creative Direction

**Status:** Living guide
**Audience:** The `lesson-page-designer` agent and any human reviewing its output.
**Reference implementation:** `src/pages/lessons/lesson-1/` — every pattern below is realised there. When in doubt, open that page and look at how it solved the problem.

---

## 1. Purpose

A lesson page is the place where a learner *encounters* a lesson's content — words, grammar, dialogue, culture — before they ever practise it. It is a reading experience, not an exercise. Its job is to make the content feel inviting, give it air, and earn the learner's attention long enough that they're ready to activate the lesson and start practising.

The lesson page is **not**:
- A flashcard surface (that's the session player)
- A progress dashboard (that's the dashboard)
- A list of items to memorise (that's the wrong framing)

It **is**:
- An invitation to engage with a small body of new language
- A guided first reading, with audio you can play inline
- A place where the lesson's character (a market dialogue, a grammar pattern, a cultural note) is brought to life through layout, typography, and rhythm

The practice surface is owned by the existing session engine — the page only needs to display the source content cleanly and provide `<PracticeActions>` as the entry point. **Capability tracking, FSRS scheduling, exercise rendering are out of scope for the page.** The page's job ends at "user has read the material and tapped Practice."

---

## 2. Audience and tone

Adult learners of Indonesian who speak Dutch. They appreciate being treated like adults — no patronising encouragements, no gamification confetti. They want something that feels like reading a thoughtful piece of editorial writing about a topic they're interested in.

When in doubt, err on the side of *intelligent and warm* rather than *playful or cheerful*.

**Voice in prose:**
- Direct, never wordy. Short sentences work.
- Warm but not familiar. Address the reader as `je`, with respect.
- Concrete over abstract. "The verb doesn't conjugate" beats "Indonesian morphology is comparatively simple."
- A touch of editorial confidence; the page should feel curated.

**Avoid:**
- Cheerleading ("You've got this!")
- Generic learning-platform copy ("In this lesson, you will learn…")
- Filler transitions ("Now that we've seen X, let's look at Y…")
- Apologising for the source material's complexity

**Language inside the page:**
- Chrome and explanatory prose: Dutch.
- Indonesian text: primary; the Dutch translation is typographically de-emphasised (italic, secondary colour, smaller or beneath).
- Phonetic guides: distinct typeface (monospace, accent colour, italic).

---

## 3. Layout — single column at fixed width

The page is **one full-bleed gradient hero band, then everything else aligned at 920 px max-width, centered.** No sidebars. No multi-column shells. The reader scrolls top-to-bottom.

Three layout elements share the same 920 px width and centering:

1. **`.ledeInner`** — the editorial lede paragraph that follows the hero
2. **`.audioInner`** — the lesson-level audio band
3. **`.shell`** — the main content stack containing all sections

Keeping these three in lockstep makes the reading column read as a coherent unit. The hero is the only full-bleed element; everything below is contained.

**On mobile** (< 720 px): all paddings tighten, font sizes shrink via clamp, multi-column section layouts collapse to single-column.

---

## 4. Visual identity

All values are CSS variables from `src/main.tsx`'s `cssVariablesResolver`. Use `var(--token)`, never hardcode.

### Typography

- **Font family** — `var(--font-sans)` = Plus Jakarta Sans. Used for everything.
- **Eyebrows are dominant, sub-headings are secondary** (this is the inverted-hierarchy choice we landed on):
  - `.sectionEyebrow` → `--fs-md` (16 px), `--fw-bold`, uppercase, `letter-spacing: 0.18em`, in the section's accent colour, with a short coloured rule before it
  - `.sectionTitle` → `clamp(17px, 1.5vw, 20px)`, `--fw-medium`, italic, white (`--text-primary`)
- **Body content reads at 16 px or larger.** The translations, grammar rules, dialogue lines — all the stuff a learner *reads* — sit at `--fs-md` (16 px) minimum. Use `--fs-sm` (14 px) only for chrome (kicker labels, captions, secondary notes).
- **Hero title** — `clamp(40px, 5.5vw, 60px)`, `--fw-black`, line-height 1. Don't go bigger; it dwarfs everything else.
- **Hero Indonesian/Dutch pair** — Indonesian as the display title, Dutch as italic subtitle in `--fs-lg` (18 px) at 65% white opacity.

### Colour — section moods

Cyan (`--accent-primary`) is the brand colour, but **each section earns its own accent**, used in the eyebrow and small decorative elements (rules, hover states). Lesson 1 settled on:

| Section | Accent token | Colour |
|---|---|---|
| Pronunciation showcase | `--ring-target` | amber |
| Simple sentences | `--accent-primary` | cyan |
| Grammar | `--mix-recall` (eyebrow) + per-tile cyan / purple / teal | purple eyebrow, mixed sub-tiles |
| Dialogue | `--teal` (eyebrow) + per-speaker teal / amber | teal-warm scene |
| Vocabulary | `--success` | green |
| Expressions | `--warning` | amber |
| Numbers | `--mix-recall` (eyebrow) + 7-colour rotating cell palette | purple eyebrow, multi |
| Alphabet | `--accent-primary` (eyebrow) + 6-colour rotating letter palette | cyan eyebrow, multi |
| Closing CTA | `--accent-primary` (cyan-tinted frame on the activation card) | cyan |

The takeaway: pick a different accent per section to give the scroll visual rhythm. Don't put everything in cyan.

### Spacing and rhythm

- **Between sections:** `gap: 80px` on `.shell` (desktop), `56px` on mobile. Sections should breathe.
- **Inside a section:** `--ex-card-pad` (20 px) as a default; more for showcase moments.
- **Radius:** `--r-lg` (12 px) for cards, `--r-xl` (24 px) for hero/showcase bands.

### Motion

- `var(--transition-base)` (0.2 s) for hover. Don't animate anything else.
- Honour `prefers-reduced-motion`. No auto-playing carousels, no auto-playing audio.

---

## 5. Hero band

The hero is **full-bleed**, with a **gradient + themed image blended together**:

```css
.heroBand {
  background-color: #0c8599;
  background-image:
    linear-gradient(135deg,
      rgba(12, 133, 153, 0.72) 0%,
      rgba(26, 42, 58, 0.82) 55%,
      rgba(252, 196, 25, 0.28) 100%),
    url('/lesson-<N>-hero.webp');
  background-size: cover;
  background-position: center;
}
```

**Image asset.** Drop a themed image at `public/lesson-<N>-hero.webp` (or .jpg). Sized around 1600 × 800 px, ~200 KB max as webp. The gradient overlay ensures text contrast on the left while the image's texture shows on the right. If the file is missing, the gradient renders alone — graceful fallback.

**Hero content** (`.heroInner`):
- Two pill badges side by side: `[level]` (amber tint) + `[Les N]` (cyan tint)
- Display title in Indonesian (`--fw-black`, white) over translation in italic Dutch
- A 2–3 sentence editorial setup paragraph hand-written for the lesson — not the DB's `description` verbatim. Use the lesson's specific characters or setting ("Ibu wil naar de markt. Ze wil bananen kopen…") to set the scene.

**No meta column.** Don't show "9 secties / 32 oefeningen klaar" sidebars in the hero. The hero is the lead, not a dashboard.

---

## 6. Editorial lede

A pull-quote band sits directly below the hero, at 920 px width, max 760 ch. Uses `.ledeQuote` (`clamp(17px, 1.8vw, 21px)`, `--fw-medium`, line-height 1.55) with an inline `<em>` highlight in the accent colour for one key phrase.

A trailing `.ledeMeta` line with a short coloured rule provides orientation ("Les 1 · Beginner · Bahasa Indonesia") in `--fs-sm` secondary text.

The lede is hand-written per lesson — it's where the page declares its editorial voice.

---

## 7. Audio band

The lesson-level audio sits in its own narrow band **between the lede and the main content** — never in a sidebar. Just the native `<audio controls>` element wrapped in a small `<Paper>` frame, no header text, no voice attribution. Stretches the full content width.

If `meta.lesson_audio_url` is null for this lesson, omit the band entirely.

---

## 8. Section content — interpret shape, not type

The fetcher gives the agent `lesson_sections.content` blobs with varying shapes (`grammar`, `dialogue`, `text` containing examples + spelling, `vocabulary`, `expressions`, `numbers`, `pronunciation`, `reference_table`, `exercises`). **Read the shape of the blob, not the type tag.** A `type: "text"` section with `examples[]` and `spelling[]` arrays is a pronunciation showcase, not generic prose. A `type: "text"` section with paragraphs of cultural commentary is a culture spread (even though `culture` is never emitted as the tag — see `feedback_no_typed_contracts_on_creative_work`).

Below are the patterns lesson 1 settled on. Treat them as starting points, adapted to whatever's actually in the content.

### Pronunciation showcase — `type: "text"` with `examples[] + spelling[]`

Used for lesson 1 section 0. Amber accent. Two visual blocks:

1. **Greetings grid** — three columns (Indonesian large bold left, italic mono phonetic centre in amber, Dutch translation right small). Dashed rule between rows in amber. Each row has an inline play button next to the Indonesian word.
2. **Spelling rules** — a grid of small amber-tinted chips, each chip a triple: `c = tj` in mono bold amber, the example "cukup (tjoekoep)" beneath, the Dutch meaning underneath. Wrapped under an "Anders dan in het Nederlands" sub-heading with horizontal rules either side.

### Simple sentences — `type: "text"` with `sentences[]`

Cyan accent. Vertical list with a **2 px cyan-glow left border** as the column's spine. Each row is a 2-column grid: Indonesian (semibold, larger type) on the left, Dutch translation (italic, secondary) on the right. Compact row gap. Inline play button next to the Indonesian text.

### Grammar — `type: "grammar"` with `intro + categories[]`

Purple eyebrow, full-section title in italic, **no intro lede** (the DB intro tends to dangle awkwardly — skip it or rewrite). Then the categories render as **three full-width horizontal bands stacked**, each with its own accent stripe on the left:

- Tile 1: cyan stripe
- Tile 2: purple stripe (`--mix-recall`)
- Tile 3: teal stripe

Inside each band:
- **Header** — small mono accent number ("01") + bold title ("Werkwoord")
- **Body** — 2-column grid (`1.1fr 1fr`) with a 48 px gap:
  - Left: rules as a bulleted list with accent-coloured `→` glyphs
  - Right: examples (`indonesian` + `dutch` translation pairs) separated by a dashed vertical rule

This is the single most-iterated section. The breakthrough was: stop treating the three sub-patterns as one section's repeated cards — treat each as its own horizontal "spread" with two columns of content.

### Dialogue — `type: "dialogue"` with `setup + lines[]`

Teal eyebrow, dialogue scene rendered inside a `--r-xl` band with a soft tinted background (teal + amber radial mix). The `setup` text reads as an italic stage direction in `--fs-md` secondary text — **no frame, no background, no left border**. Then the lines:

- Each line is a 2-column grid: speaker label (100 px wide, uppercase, letterspaced, accent-coloured) + dialogue body (Indonesian primary at `--fs-lg`, Dutch translation italic secondary, inline play button after the Indonesian text).
- **Speaker-coloured labels, no line border stripes.** "Ibu" in teal, "Penjual" in amber (via `data-speaker-tone`). The colour distinction lives entirely in the speaker label; the lines stay as plain rectangular cards on a `rgba(255,255,255,0.04)` background.

### Vocabulary — `type: "vocabulary"` with `items[]`

Green-tinted (`tone="lush"`) chip grid. Each chip is a single horizontal row: `[play] [indonesian bold] · [dutch secondary]`. Three columns at desktop, single column on mobile.

### Expressions — `type: "expressions"` with `items[]`

Amber-tinted (`tone="warm"`) chip grid. **Same data shape as vocabulary, different layout** — the expressions are short phrases, so they read better stacked: `[play] [indonesian bold]` on the top row, `[dutch translation]` indented underneath on a wrapped row. No bullet separator. Achieved via `flex-wrap: wrap` + `flex-basis: 100%` on the Dutch element.

The lesson here is that two `type` tags can have identical data and still warrant different layouts based on what they *mean* pedagogically.

### Numbers — `type: "numbers"` with `items[]`

Purple eyebrow. Tight grid (`minmax(120px, 1fr)`) of square-ish blocks, each block centered: Indonesian numeral (`--fs-xl`, `--fw-black`) over Dutch label (`--fs-sm`, uppercase, secondary). **Each block cycles through 7 palette tints** via `:nth-child(7n+1..7)` — cyan, teal, amber, orange, green, purple, repeat. Playful, but not chaotic.

### Alphabet pronunciation — `type: "pronunciation"` with `letters[]`

Cyan eyebrow. Grid of cards (`minmax(200px, 1fr)`), each card: big mono letter glyph (`--fs-2xl`, accent-coloured) + italic rule ("als in kam") + a row of small pill chips for example words. **Each card cycles through 6 letter colours** (cyan, green, amber, purple, teal, orange) — gives the alphabet section a children's-book-meets-design-system feel without losing brand identity.

### Reference table — `type: "reference_table"`

Rare (lesson 5 only). When the data is tabular, render a table. Don't try to be clever. Use the `intro`, `columns`, `examples`, `sections`, `footnotes`, `tableTitle` keys as they appear.

### Exercises — `type: "exercises"`

Skip it. The exercise prompts are the practice surface's content (the session engine renders them); the reader doesn't preview them.

### Culture text — encoded as `type: "text"` but contains a CULTUUR prologue

Not present in lesson 1; appears in lessons 4, 8, 9. When `paragraphs[0]` starts with "CULTUUR" or the content reads as cultural commentary rather than language drill, design it editorially — drop cap, evocative typography, optional image, longer line measure. The DB tag is `text` but the content is the signal.

---

## 9. Required runtime components

Three must appear on every lesson page. Their **placement is the designer's call**; their **presence is non-negotiable**. They handle all runtime wiring.

| Component | Purpose | Props | Conventional placement |
|---|---|---|---|
| `<LessonAudioPlayer src={url} />` | Native audio control for the lesson-level recording | `src: string` | Audio band, between lede and main content |
| `<ActivationGate lessonId />` | "Activeer deze les …" checkbox; writes `learner_lesson_activation` via RPC | `lessonId: string` | Closing band, inside a cyan-tinted frame, above PracticeActions |
| `<PracticeActions lessonId />` | "Practice this lesson · N ready" + "Review this lesson" CTAs, wired to capability counts | `lessonId: string` | Closing band, beneath the activation gate |

If `meta.lesson_audio_url` is null, omit `<LessonAudioPlayer>`. The other two always appear.

The closing band groups Title → Lede → ActivationGate → PracticeActions as one editorial unit:

```
              Klaar om te oefenen?

  Activeer de les en de woorden, zinnen en patronen
   verschijnen automatisch in je oefensessies.

  ┌─────────────────────────────────────────────┐
  │ ☑ Activeer deze les en voeg de woorden en   │  <-- cyan-tinted frame
  │   patronen toe aan je oefeningen.           │      max-width 660px
  └─────────────────────────────────────────────┘

  ┌─────────────────────────────────────────────┐
  │ ▶ Practice this lesson · 141 ready          │  <-- primary CTA
  └─────────────────────────────────────────────┘
  ┌─────────────────────────────────────────────┐
  │ ↻ Review this lesson                        │  <-- secondary CTA (when applicable)
  └─────────────────────────────────────────────┘
```

---

## 10. Reordering and content-skipping discretion

The agent has license to:

- **Reorder sections** when pedagogical flow benefits. Lesson 1's DB order puts simple sentences before grammar; the page puts grammar first (its rules unlock the sentences). Reorder freely.
- **Skip content** that doesn't fit the design (e.g., the grammar section's DB intro that ends "namelijk:" with nothing to follow). Skipping is a deliberate authoring decision.
- **Rewrite section titles** away from literal type tags. "UITDRUKKINGEN / Korte vragen en antwoorden" reads better than "EXPRESSIONS / Items list". The eyebrow becomes a real editorial label.
- **Rewrite the hero description** as a scene-setting line rather than echoing `meta.description` verbatim. The hero is the lead.

The agent should **not**:

- Skip a content section that genuinely has unique teaching value (vocabulary, grammar, dialogue all need to render even if the agent doesn't love the source data).
- Invent content not in the data. Hand-written editorial prose belongs only in the hero description and the lede — and even there, it must reflect what the lesson actually teaches.

---

## 11. Anti-patterns

- **Card-stacking everything**. If every section is `kicker + title + bordered Paper`, the page reads as a CMS. Each section needs a layout that fits its content.
- **Cyan everywhere**. Reserve cyan for moments of intentionality (activation, primary CTA, one editorial accent). The other sections get their own colours.
- **Pre-defining TypeScript interfaces** for `content` shapes. Read the JSON directly. (See `feedback_no_typed_contracts_on_creative_work` in memory.)
- **`<Card>` from Mantine.** Use `<Paper>`, plain semantic HTML, or the global card classes (`card-base`, `card-action`).
- **Hardcoded colour or font size.** Always `var(--token)`. Pre-commit rejects hardcoded hex in components.
- **Auto-playing audio.** Listening is a deliberate user choice.
- **Filler copy** ("In this lesson we'll cover…"). If a heading isn't enough, fix the heading.
- **Lossy summaries of structured data.** If `grammar.categories[0].examples` has 8 examples, render all 8 — don't truncate to 3 unless the layout genuinely demands it.
- **A hero metadata sidebar**. We tried this; it duplicates the practice count and adds noise.
- **The "Stem: …" attribution on the audio player**. Just the audio control.
- **A left border stripe per dialogue line**. Use coloured speaker labels instead.

---

## 12. CSS token cheat-sheet

```css
/* Type */
--font-sans, --fs-xs … --fs-4xl, --fw-normal … --fw-black

/* Colour (dark mode shown — light mode swaps automatically) */
--bg-main, --bg-surface, --bg-hover
--text-primary, --text-secondary, --text-tertiary
--accent-primary (cyan), --accent-primary-dim, --accent-primary-glow, --accent-primary-subtle, --accent-primary-border
--success (green), --warning (amber/orange), --danger (red)
--ring-target (yellow/amber) — used for pronunciation accents
--mix-recall (purple) — used for grammar eyebrow + cells
--teal — used for dialogue + grammar tile sub-accent
--card-bg, --card-border, --card-hover-bg, --card-hover-border
--hero-gradient, --hero-border, --hero-text (+ -dim / -muted / -subtle)

/* Spacing */
--page-pad-x, --page-pad-y-top, --page-pad-y-bottom
--ex-card-pad, --ex-zone-gap

/* Shape & motion */
--r-sm (6), --r-md (10), --r-lg (12), --r-xl (24)
--transition-base, --ease-smooth
```

Global utility classes (via `composes:` from `:global`):
- `card-base`, `card-default`, `card-action` (hover lift), `card-compact`

---

## 13. A page is done when

- It reads top to bottom without monotony — every section visually distinct from its neighbours.
- The hero has a themed image at `public/lesson-<N>-hero.{webp,jpg}` blended under the gradient.
- All three required runtime components are present in their conventional placements.
- Audio plays where it should (inline next to text content; lesson band between lede and main); doesn't where it shouldn't (no auto-play).
- The lesson's content character (its dialogue, its grammar pattern, its setting) is **visible in the layout** — not just listed.
- Hardcoded values: none. All theme tokens.
- Build clean (`bun run build` → no TS errors).
- Lint clean (`bun run lint` → no errors from new code; pre-existing warnings okay).
- A reader could describe the page in one sentence — "the lesson 1 page set at the market with the spice-bowl hero" — not "the lesson page with eight sections."
