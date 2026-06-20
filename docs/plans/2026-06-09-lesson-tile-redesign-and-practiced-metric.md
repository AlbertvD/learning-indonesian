---
status: shipped
implementation: PR #198 + #199
merged_at: 2026-06-10
reviewed_by: [architect, data-architect]
supersedes: []
related:
  - docs/plans/2026-06-09-lesson-status-two-sources-design.md   # the RPC + activation/mastered model this extends
  - docs/current-system/modules/lessons-overview.md             # the living module contract this redesign changes
  - docs/current-system/modules/analytics-mastery.md            # owns the mastered predicate the SQL mirrors
  - docs/current-system/cefr-level-rubric.md                    # the level labels surfaced on the tile
---

# Lesson overview redesign — `LessonCard`, the `% geoefend` metric, and the CEFR level badge

## Context & motivation

The Lessons catalog (`src/pages/Lessons.tsx`) renders each lesson as a
`MediaShowcaseCard`. Three problems, all spotted on the live tiles:

1. **The lesson number appears three times** — a big glyph on the banner
   (`Lessons.tsx:105`), the `LES N` eyebrow (`:302`), and again in the title
   (`"Les 10 - Kantor Pos"`; `lessonTitle()` only strips parentheticals).
2. **The CTA duplicates the status.** The bottom-right `Doorgaan` / `Open les`
   label restates the top-right `Actief` / `Niet gestart` pill — two encodings of
   the same state, on a card that is already a single `<Link>`.
3. **Only one progress signal.** The tile shows `% beheerst` (mastered) but
   nothing about how much of the lesson the learner has *started*.

This redesign also surfaces the **CEFR level** badge (A1/A2/B1; see
`cefr-level-rubric.md`) and adds a second, nested progress metric.

## The redesigned tile

```
┌────────────────────────────────────────┐
│ ░░░░░░░ banner image / gradient ░░░░░░░░│
│   10  Kantor Pos                        │  ← number + clean title, same face, no "Les"
├────────────────────────────────────────┤
│  Affixderivatie, Naamwoordvorming,      │  ← grammar topics, full width, 1–3 lines, no truncation
│  Telwoorden, Rangtelwoorden, Rekenen    │
│                                         │
│  Geoefend  ██████░░░░░  35%        A2   │  ← bar ↔ level badge (shared baseline)
│  Beheerst  ██░░░░░░░░░  10%      Actief  │  ← bar ↔ status pill  (shared baseline)
└────────────────────────────────────────┘
```

### Layout decisions (settled in the 2026-06-09 design discussion)

- **Number appears once**, in the banner; the **title rides next to it**, same
  type face/colour, with `Les N -` stripped → `Kantor Pos`. This removes the
  `LES N` eyebrow *and* the separate body title line — killing all three number
  duplicates in one move.
- **Title stays a real heading for a11y — pinned DOM structure.** Today the whole
  banner `<div>` is `aria-hidden="true"` (`Lessons.tsx:95`); the title is a body
  `<h3>` (`MediaShowcaseCard.tsx:124`). In the new card the banner art node keeps
  `aria-hidden="true"`, and the title `<h3>` is a **sibling, NOT nested inside the
  aria-hidden subtree**, positioned over the banner via CSS (absolute/grid
  overlay). The number is part of the decorative art (aria-hidden). The card root
  `<Link>` takes its accessible name from the `<h3>`. A scrim sits behind the
  title for contrast on hero-image lessons. **No truncation** — long titles wrap.
- **Grammar topics, full width, untruncated.** The enriched `grammar_topics`
  summary (short curated Dutch labels) shown *completely*, comma-joined, wrapping
  to 1–3 lines. No `+N more`, no ellipsis. The `Grammar:` prefix is already
  dropped (`adapter.ts:formatGrammarTopicTag`).
- **Two stacked, left-aligned, nested progress bars.** `Geoefend` (practiced) on
  top, `Beheerst` (mastered) below — left-aligned so the shorter `Beheerst` bar
  reads as a sub-portion of `Geoefend` (`mastered ⊆ practiced`).
- **Right-hand meta, baseline-aligned to the bars.** The **level badge** (A2)
  aligns to the `Geoefend` row; the **status pill** (Actief) aligns to the
  `Beheerst` row. Both right-aligned to a shared edge so they read as a column.
- **No CTA label.** The card stays a `<Link>`; the redundant `Doorgaan` / `Open
  les` text is removed.
- **Even grid.** Every tile takes the height of the tallest (the longest grammar
  row), via CSS `grid-auto-rows: 1fr` on the page-level `lessonGrid` + the card
  at `height: 100%`. The `<li className=lessonGridItem>` between grid and card
  must also stretch (`display:flex` / `height:100%`) so the card fills its cell.
  No JS measurement; short tiles carry trailing whitespace.

### Non-activated lessons

No progress to show → the two bars are **hidden** (not rendered as 0/0; mirrors
today's rule that `% mastered` is `null`, never `0/0`, when not activated —
`overview.ts:68`). The **level badge still shows**; the **status pill** reads
`Niet gestart` (prepared) or `Binnenkort` (not prepared). The grammar row still
shows.

### L14 display title — decided: tile-scoped override

`L14` title is `"De islam in Indonesië / Werkwoordsvorm met ME- Vervolg"` —
long even after stripping `Les N -`. **Decision: a tile-scoped display-title
override, NOT a change to the canonical `lessons.title`.** The canonical title is
read by the reader header and other surfaces; truncation-avoidance for one tile
must not mutate it. The override lives in the overview view layer (a small
`orderIndex → shortTitle` map beside the bespoke-page registry, applied in
`Lessons.tsx`). Default behaviour (strip `Les N -`, then wrap) applies to every
other lesson. *(The exact short string for L14 is a content call — confirm with
the author; default fallback is the wrapped full title, so this does not block.)*

## The `% geoefend` (practiced) metric

**Definition.** A capability is **practiced** when `review_count ≥ 1` — reviewed
at least once in a session. **Nested** under mastered:
`mastered ⊆ practiced ⊆ introducible` (the SQL `mastered` predicate requires
`review_count ≥ 4`, which strictly implies `≥ 1`; NULL `review_count` is excluded
from both by `coalesce(...,0)`, so no edge case), hence
`% geoefend ≥ % beheerst` always.

- **`% geoefend` = practiced / introducible** (same denominator as mastered).
- **`% beheerst` = mastered / introducible** (unchanged; the strict predicate).

The practiced threshold is canonical, owned in **one** place:
`export const PRACTICED_MIN_REVIEWS = 1` in `overview.ts`. The SQL filter comment
references it by name; the parity test asserts the two agree (see Tests).

**Null / zero rules** (the `Geoefend` bar must follow the SAME rules as
`Beheerst`, so the two bars behave identically):
- `lessonPracticedPercent` returns `null` when `!isActivated || introducibleCount
  <= 0` → bar hidden (exactly `lessonMasteredPercent`, `overview.ts:63`).
- When **activated with `practicedCount === 0`**, it returns `0` (a visible 0%
  bar), NOT `null` — same as the mastered bar shows 0% for an activated lesson
  with nothing mastered.
- It carries the same **clamp** as `lessonMasteredPercent`
  (`Math.min(practicedCount, introducibleCount)`) so a transient count skew can't
  exceed 100%.

## Implementation

### Module placement — bespoke `LessonCard` (re-derived on verified facts)

The v1 premise ("`MediaShowcaseCard` is shared with Podcasts") was **false** and
is corrected here. Grep evidence (2026-06-09):

- `grep -rln MediaShowcaseCard src/**/*.tsx` → `MediaShowcaseCard.tsx`,
  `primitives/index.ts` (barrel), `MediaShowcaseCard.test.tsx`, `PageLab.tsx`
  (admin design-lab demo), `Lessons.tsx`. **`Lessons.tsx` is the only production
  consumer.**
- `Podcasts.tsx:69` uses **`ListCard`**, not `MediaShowcaseCard`.

So the real fork (CLAUDE.md) is *"extend a composing primitive > a new parallel
per-case branch; **but rebuild clean > inherit a mid-cutover accreted module**."*
The redesigned tile diverges hard from the primitive's shape: the title moves out
of the body into the banner, the eyebrow and CTA are removed, and a two-stacked-
bar + right-hand meta column (level badge, status, learning-progress) replaces
subtitle+tags+status+cta. Those are **lessons-domain** concepts (CEFR level,
mastered/practiced) that do **not** belong in a generic `page/primitives/`
showcase card. **Decision: a bespoke `src/components/lessons/LessonCard.tsx`
(+ CSS module)** — a clean lesson-domain view, not a generic-primitive overload.

**Fate of `MediaShowcaseCard`:** once `Lessons.tsx` migrates to `LessonCard`, it
has **zero production consumers** (only the `PageLab` demo + its test + the
barrel export remain). This redesign does **not** delete it — removing a generic,
tested primitive is a separate call — but it explicitly becomes production-unused;
flagged as a follow-up cleanup decision (remove it + its PageLab demo, or keep it
as an available primitive). Recorded here so the orphan is intentional, not drift.

### Module-spec obligations

- **`docs/current-system/modules/lessons-overview.md` MUST be updated in the same
  commit** (it is the living contract for this surface, `status: stable`). Changes:
  §1 "the **two** facts" → **three signals** (activation, % mastered, % practiced;
  the CEFR level badge is a fourth, orthogonal display fact); §2 add
  `lessonPracticedPercent` + `PRACTICED_MIN_REVIEWS`; §3 `LessonOverviewRow` gains
  `practicedCount` / `practicedPercent`; §4 note the extracted `LessonCard` tile
  view as the renderer; §6 downstream is `Lessons.tsx` → `LessonCard`.
- **No new `src/components/lessons/` component-module spec (deferred, with
  reason).** That folder is heterogeneous — reader-action components
  (`ActivationGate`, `PracticeActions`, `LessonAudioPlayer`) plus, now, the
  overview tile — not one coherent surface. `LessonCard` is documented under the
  `lessons-overview` spec (the surface it serves). A dedicated component-module
  spec is not warranted until that folder coheres into a single surface.

### Frontend wiring

- New `src/components/lessons/LessonCard.tsx` (+ `.module.css`). It receives a
  **display-ready** row and renders the tile; it owns no business rules.
- **Title cleaning stays a page concern**, not the card's: `Lessons.tsx` maps each
  row → cleaned display title before passing to `LessonCard`. Extend the
  page-local `lessonTitle()` (`Lessons.tsx:121`) to also strip a leading
  `Les N -` / `Les N —` prefix (plus the existing parenthetical strip), and apply
  the L14 short-title override there. `LessonCard` receives the final string.
- `formatGrammarTopicTag` (`adapter.ts:174`) drops the `.slice(0, 2)` + `+N more`
  cap — join **all** deduped labels (`Grammar:` prefix already gone).
- `overview.ts`: `LessonOverviewCapabilityCounts` gains `practicedCount`;
  `LessonOverviewRow` gains `practicedPercent`; add `lessonPracticedPercent()`
  (clone of `lessonMasteredPercent` incl. the clamp + null rule) and
  `PRACTICED_MIN_REVIEWS`.

### Data — `get_lessons_overview` RPC (current data model; additive only)

Add one filter to the existing `capability_counts` CTE (`migration.sql:2000`) and
one returned column — **no new table, column, join, or schema change**.
`review_count` is already selected in the `lesson_capabilities` CTE
(`migration.sql:1992`).

```sql
-- practiced numerator: any review at all, over the SAME introducible filter as
-- the denominator and the mastered numerator. TS canonical: PRACTICED_MIN_REVIEWS
-- in src/lib/lessons/overview.ts (kept in lockstep by the parity test).
count(*) filter (
  where readiness_status = 'ready' and publication_status = 'published'
    and coalesce(review_count, 0) >= 1
)::int as practiced_count
```

Return `practiced_capability_count int` alongside `mastered_capability_count`.
Replace the whole `drop function if exists ... create or replace function` block
in **`scripts/migration.sql`** (the canonical applied file — never
`scripts/migrations/*.sql`); the `drop + create` idiom is required because
`RETURNS TABLE` shape changes. Run `make migrate-idempotent-check` before merge.

### Tests

- **TS↔SQL parity** (`scripts/__tests__/lessons-overview-mastery-parity.test.ts`):
  extend to cover `practiced_count`. It must anchor the TS side to
  `overview.ts` (`PRACTICED_MIN_REVIEWS` / `lessonPracticedPercent`) — **NOT**
  `masteryModel.ts:270` (that `reviewedCapabilityCount` is an unrelated
  per-dimension breakdown field, never surfaced through this RPC; anchoring there
  would string-scrape a coincidentally-matching literal and let the two drift).
  Mirror the existing mastered-parity anchor pattern (which reads `mastered.ts`).
- `overview.test.ts`: `practicedPercent` derivation — the not-activated `null`
  case, the activated-`0`-shows-0% case, the clamp, and the `practiced ≥ mastered`
  invariant.
- `adapter.test.ts`: `formatGrammarTopicTag` now joins all labels (update the
  `+N more` expectation to the full join).
- `Lessons.test.tsx`: two bars, level badge, status, single number, no `Doorgaan`;
  not-activated row hides bars but shows level + status.
- `LessonCard` render test (a11y): the title is the card's accessible name —
  `getByRole('heading', { name })` resolves and the card link is labelled by it.

## Supabase Requirements

### Schema changes
- **No table/column changes.** One function change: `get_lessons_overview` gains a
  `practiced_capability_count` output column + one `count(*) filter` in its CTE.
  Lands in `scripts/migration.sql`. Run `make migrate-idempotent-check` before merge.
- **RLS / grants:** unchanged. `security invoker`, already `grant execute ... to
  authenticated`. No new tables → no new policies.

### homelab-configs changes
- [ ] PostgREST schema exposure — N/A (no new schema; `indonesian` already exposed).
- [ ] Kong CORS — N/A.
- [ ] GoTrue — N/A.
- [ ] Storage — N/A.

### Health check additions
- `check-supabase.ts` (functional, anon) — N/A; the RPC is already on the Lessons path.
- `check-supabase-deep.ts` (structural, service) — N/A; no new table/policy. The
  function-shape correctness is covered by the TS↔SQL parity test instead.

## Out of scope / sequencing notes

- **CEFR level labels** (staging `level` edits L8–12→A2, L13–14→B1; rubric doc;
  glossary) are **already done**; reaching the live DB happens via the normal
  per-lesson Stage A re-publish (or a one-off `lessons.level` update). The level
  *badge* reads `lessons.level`, so it is correct as soon as either lands.
- This redesign is a **frontend + RPC** change deployed via app build + `make
  migrate`. It is **not** a per-lesson content republish.

## Review gate

Changes a **reader contract** (`get_lessons_overview`) + its TS↔SQL parity
surface and a **module spec**, so per CLAUDE.md it needs **both `architect`
(module placement) and `data-architect` (RPC count + parity lockstep)** sign-off
in `reviewed_by:` before `status: approved`.
