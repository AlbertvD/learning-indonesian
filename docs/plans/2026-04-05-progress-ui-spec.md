# Progress Screen Redesign — UI Component Specification

**Screen title:** Geheugenoverzicht  
**Route:** `/progress`  
**Mockup:** `docs/mockups/progress-redesign.html`  
**Data architecture:** `docs/plans/2026-04-05-progress-redesign-architecture.md`

---

## Overview

The Progress screen is redesigned from a flat list of progress bars into six visually distinct, data-rich sections. Each section maps to a dedicated component. The page uses a single `useProgressData()` hook (two-wave fetch) and composes all sections beneath a page header.

### Page layout

```
Progress (src/pages/Progress.tsx)
├── PageHeader            — "Geheugenoverzicht" h1 + subtitle + "INDONESISCH · GEHEUGEN" badge
├── MemoryHealthHero      — Section 1
├── MasteryFunnel         — Section 2
├── VulnerableItemsList   — Section 3
├── ReviewForecastChart   — Section 4 (left column of a two-col row)
├── WeeklyGoalsList       — Section 4 (right column)
└── DetailedMetrics       — Section 5
```

All sections are wrapped in a `<Stack gap="xl">` inside `<Container size="md">`. Each section is individually animated in with a staggered `fade-up` entrance (CSS `animation: fade-up 0.5s ease both`, delay incrementing by 80 ms per section).

---

## Design Tokens (CSS variables)

All colors reference the app's CSS variables from `cssVariablesResolver` in `src/main.tsx`. New progress-specific aliases introduced in the component CSS module:

| Alias used in spec | Dark value | Light value |
|--------------------|-----------|-------------|
| `--accent-primary` | `#00E5FF` | `#0099B8` |
| `--accent-primary-subtle` | `rgba(0,229,255,0.09)` | `rgba(0,153,184,0.08)` |
| `--accent-primary-glow` | `rgba(0,229,255,0.16)` | `rgba(0,153,184,0.16)` |
| `--text-primary` | `#FFFFFF` | `#000000` |
| `--text-secondary` | `#8E8E93` | `#86868B` |
| `--text-tertiary` | `#55525C` | `#A2A2A7` |
| `--card-bg` | `rgba(255,255,255,0.10)` | `rgba(0,153,184,0.07)` |
| `--card-border` | `rgba(255,255,255,0.07)` | `#D1D1D9` |
| `--card-hover-border` | `#00E5FF` | `#0099B8` |
| `--success` | `#32D74B` | `#32D74B` |
| `--success-subtle` | `rgba(50,215,75,0.10)` | same |
| `--warning` | `#FF9500` | same |
| `--warning-subtle` | `rgba(255,149,0,0.10)` | same |
| `--danger` | `#FF453A` | same |
| `--danger-subtle` | `rgba(255,69,58,0.10)` | same |
| `--font-mono` | `'Courier New', monospace` | same |
| `--r-lg` | `12px` | same |

---

## Section 1: `MemoryHealthHero`

**File:** `src/components/progress/MemoryHealthHero.tsx`  
**CSS Module:** `src/components/progress/MemoryHealthHero.module.css`

### Props interface

```typescript
interface MemoryHealthHeroProps {
  /** Average stability in days for recognition skills (0–N, capped at 10 for display) */
  avgRecognitionDays: number
  /** Average stability in days for form_recall skills (0–N, capped at 10 for display) */
  avgRecallDays: number
}
```

### Derived values (computed inside the component)

```typescript
// Convert avg stability days to a 0–100% score: min(100, (days / 10) * 100)
const recognitionPct = Math.min(100, Math.round((avgRecognitionDays / 10) * 100))
const recallPct      = Math.min(100, Math.round((avgRecallDays      / 10) * 100))
const gap            = recognitionPct - recallPct   // may be negative
const showGapPill    = Math.abs(gap) >= 20           // only shown when gap is significant
```

### Visual description

**Container:** `<Box>` with `section-label` ("Geheugensterkte") above a two-column grid (`SimpleGrid cols={{ base: 1, sm: 2 }}`).

**Gauge cards (×2 — one for Herkenning, one for Oproepen):**

Each gauge card is a `<Paper>` with:
- `background: var(--card-bg)`, `border: 1px solid var(--card-border)`, `border-radius: var(--r-lg)`
- `padding: 24px 20px 20px`
- A scanline pseudo-element texture (repeating linear gradient, `rgba(255,255,255,0.012)`)
- Hover: `border-color: var(--card-hover-border)`, `box-shadow: 0 0 32px var(--accent-primary-glow)`

Inside each gauge card:
1. **Arc gauge** — SVG half-circle, 160×88 px viewport (full 160×160 circle clipped via `overflow:hidden` on a wrapper div). Radius `r=62`, `stroke-width=12`.
   - Track circle: `stroke: var(--card-border)`, `fill: none`
   - Fill arc: `stroke-dasharray: 194.779` (half-circumference of r=62). At 0% → `stroke-dashoffset: 194.779`. At 100% → offset `0`. Formula: `offset = 194.779 * (1 - pct/100)`
   - Entrance animation: CSS transition `stroke-dashoffset 1.2s cubic-bezier(0.4,0,0.2,1) 0.3s`
   - Herkenning fill: `stroke: var(--accent-primary)`, `filter: drop-shadow(0 0 6px var(--accent-primary-glow))`
   - Oproepen fill: `stroke: var(--warning)`, `filter: drop-shadow(0 0 6px rgba(255,149,0,0.5))`
   - Scale tick marks at 0%, 50%, 100% as `<line>` elements (`stroke: rgba(255,255,255,0.15)`) with `<text>` labels (font-size 8px, `var(--font-mono)`, `var(--text-tertiary)`)
2. **Numeric value** — absolute-positioned over the gauge bottom center, `font-family: var(--font-mono)`, `font-size: 28px`, `font-weight: 700`. Herkenning: `color: var(--accent-primary)` with glow text-shadow. Oproepen: `color: var(--warning)` with warning glow.
3. **Label** — uppercase monospace, `font-size: 13px`, `font-weight: 700`, `letter-spacing: 0.04em`: "HERKENNING" / "OPROEPEN"
4. **Sublabel pill** — small rounded badge below the label:
   - If `pct >= 60`: green pill ("Sterk"), `color: var(--success)`, `background: var(--success-subtle)`, `border: 1px solid rgba(50,215,75,0.2)`
   - If `pct >= 35`: warning pill ("Ontwikkelen"), `color: var(--warning)`, `background: var(--warning-subtle)`
   - If `pct < 35`: danger pill ("Zwak"), `color: var(--danger)`, `background: var(--danger-subtle)`
5. **Direction label** — below sublabel, `font-size: 11px`, `color: var(--text-tertiary)`, centered. Herkenning: "Indonesisch → NL/EN". Oproepen: "NL/EN → Indonesisch".

**Gap analysis row** (between gauges and insight box, centered):

- Label: `KLOOF ANALYSE`, `font-family: var(--font-mono)`, `font-size: 10px`, `color: var(--text-tertiary)`, `letter-spacing: 0.08em`
- Gap pill (only rendered when `showGapPill === true`):
  - `background: var(--warning-subtle)`, `border: 1px solid rgba(255,149,0,0.25)`, `border-radius: 20px`, `padding: 4px 10px`
  - Text: `{gap}% GAP`, `font-family: var(--font-mono)`, `font-weight: 700`, `font-size: 12px`, `color: var(--warning)`
  - **Tooltip** (Mantine `<Tooltip>` or CSS hover): 260 px wide, explains that recognition is stronger than recall, that this is normal in early learning phases, and that the algorithm compensates automatically.

**Insight box** (rendered below the gap row):

- `background: var(--card-bg)`, `border: 1px solid var(--card-border)`, `border-left: 3px solid var(--accent-primary)`, `border-radius: var(--r-lg)`, `padding: 14px 16px`
- Left icon: 💡 (16 px)
- Text (`font-size: 13px`, `color: var(--text-secondary)`, `line-height: 1.6`):
  - When `recallPct < recognitionPct - 15`: "Je herkenning is **sterk**, maar je oproepen loopt **achter**. Het algoritme geeft prioriteit aan **'Typed Recall'** oefeningen deze week om de kloof te overbruggen."
  - When `recognitionPct < 40` and `recallPct < 40`: "Beide vaardigheden zijn nog in ontwikkeling. Blijf consistent herhalen om het geheugenspoor te versterken."
  - When both `>= 60`: "Goed bezig! Zowel herkenning als oproepen zijn goed ontwikkeld. Blijf de routine volhouden."

### Interactive behavior

- Both gauge cards have hover state: `border-color: var(--card-hover-border)`, subtle glow
- Gap pill tooltip: visible on hover, Mantine `<Tooltip>` component with `multiline` and `w={260}`
- Arc fill animates on mount via CSS transition (triggered by setting the style after a `requestAnimationFrame` + small timeout, or via a CSS animation class added after mount)

### Loading state

Render two `<Skeleton height={200} radius="md" />` side by side, plus a `<Skeleton height={48} mt="md" />` for the insight box.

### Mobile behavior (≤600px)

`SimpleGrid` switches to `cols={1}` — gauges stack vertically. Insight box remains full width.

---

## Section 2: `MasteryFunnel`

**File:** `src/components/progress/MasteryFunnel.tsx`  
**CSS Module:** `src/components/progress/MasteryFunnel.module.css`

### Props interface

```typescript
interface MasteryFunnelProps {
  itemsByStage: {
    new: number
    anchoring: number
    retrieving: number
    productive: number
    maintenance: number
  }
}
```

### Derived values (computed inside the component)

```typescript
// The bottleneck stage is the one with the highest count among anchoring, retrieving, productive
// (new items are pre-learning; maintenance is the goal state — neither is a "bottleneck")
const bottleneckStage = (['anchoring', 'retrieving', 'productive'] as const)
  .reduce((max, s) => itemsByStage[s] > itemsByStage[max] ? s : max, 'anchoring' as const)

// Next milestone description — used in the CTA pill
// If maintenance === 0 and productive === 0: "1 item naar Retrieving" is next step
// If maintenance === 0 but productive > 0: "Eerste 10 stabiele items"
// If maintenance > 0: "Scorebord Top 10" or another suitable label
const nextMilestoneLabel = ...  // see below

// Bottleneck count — used in warning text
const bottleneckCount = itemsByStage[bottleneckStage]
```

### Visual description

**Container:** `<Box>` with `section-label` ("Leerpijplijn") above a `<Paper>` card.

**Pipeline row** — horizontal flex container, no gap between stages (borders touch):

Five pipeline stages in order: `new` → `anchoring` → `retrieving` → `productive` → `maintenance`.

Each stage is a flex column segment with:
- `background: var(--card-bg)`, `border-top: 1px solid var(--card-border)`, `border-bottom: 1px solid var(--card-border)`
- First stage: `border-left: 1px solid var(--card-border)`, `border-radius: var(--r-lg) 0 0 var(--r-lg)`
- Last stage: `border-right: 1px solid var(--card-border)`, `border-radius: 0 var(--r-lg) var(--r-lg) 0`
- **Chevron arrow** between non-last stages: CSS pseudo-element `::after` with `clip-path: polygon(0 0, 60% 0, 100% 50%, 60% 100%, 0 100%, 40% 50%)`, background matches the stage card, z-index 2. Border chevron uses `::before` at z-index 1 with `background: var(--card-border)`.

Stage content:
1. **Stage name** — `font-family: var(--font-mono)`, `font-size: 10px`, `font-weight: 700`, `letter-spacing: 0.1em`, `text-transform: uppercase`, `color: var(--text-tertiary)`
2. **Count** — `font-family: var(--font-mono)`, `font-size: 26px`, `font-weight: 700`. Color:
   - Active stages (count > 0): `color: var(--accent-primary)`, `text-shadow: 0 0 10px var(--accent-primary-glow)`
   - Zero count: `color: var(--text-tertiary)`
3. **Unit label** — "items", `font-family: var(--font-mono)`, `font-size: 10px`, `color: var(--text-tertiary)`

**Bottleneck stage** — the stage identified as `bottleneckStage` (only applies when its count > threshold, e.g. > 10):
- `background: rgba(255,149,0,0.08)`, `border-color: rgba(255,149,0,0.3)` (all four border sides)
- Stage name: prefixed with "⚠ ", `color: var(--warning)`
- Count: `color: var(--warning)`, `text-shadow: 0 0 12px rgba(255,149,0,0.4)`
- Unit: `color: rgba(255,149,0,0.6)`
- CSS pulse animation: `box-shadow: inset 0 0 20px 0 rgba(255,149,0,0.08)` cycling at 3 s

**Maintenance stage milestone star:**
- Small `★` marker (14 px, `color: var(--text-tertiary)`, opacity 0.5) positioned absolute `top: 6px; right: 8px`
- On hover: `opacity: 1`, `color: var(--warning)`
- Tooltip (220 px wide, Mantine `<Tooltip>`): "Doel: Eerste 10 stabiele items. Items in Productive & Maintenance verhogen je rang op het scorebord."

**Bottom row** (inside the card, below the pipeline, `margin-top: 12px`):

1. **Warning banner** — only shown when `bottleneckCount > 0`:
   - `background: var(--warning-subtle)`, `border: 1px solid rgba(255,149,0,0.2)`, `border-radius: 8px`, `padding: 10px 14px`, `font-family: var(--font-mono)`, `font-size: 12px`, `color: var(--warning)`
   - Text: "⚠️ {bottleneckCount} items wachten op hun eerste 'Poortcheck' om naar de Retrieving-fase te gaan."
   - `flex: 1; min-width: 200px`

2. **Next milestone pill** (clickable `<Link>` to `/session?mode=gate_check`):
   - `font-family: var(--font-mono)`, `font-size: 10px`, `color: var(--accent-primary)`, `background: var(--accent-primary-subtle)`, `border: 1px solid rgba(0,229,255,0.2)`, `border-radius: 20px`, `padding: 4px 10px`, `white-space: nowrap`
   - Text: "→ Volgende mijlpaal: {nextMilestoneLabel}"
   - `title="Start een Poortcheck sessie"`
   - Hover: `background: rgba(0,229,255,0.18)`, `border-color: var(--accent-primary)`, `box-shadow: 0 0 10px var(--accent-primary-glow)`

**Next milestone label logic:**
- `maintenance === 0 && productive === 0 && retrieving === 0`: "1 item naar Retrieving"
- `maintenance === 0 && productive === 0 && retrieving > 0`: "1 item naar Productive"
- `maintenance === 0 && productive > 0`: "Eerste 10 stabiele items"
- `maintenance > 0 && maintenance < 10`: `${10 - maintenance} items naar top 10 stabiel`
- `maintenance >= 10`: "Scorebord Top 10 bereikt ✓"

### Interactive behavior

- Bottleneck stage: pulsing glow animation (CSS `@keyframes`)
- Milestone star: hover tooltip (Mantine `<Tooltip>`)
- Next milestone pill: React Router `<Link>` to `/session?mode=gate_check`, hover glow

### Loading state

`<Skeleton height={100} radius="md" />` for the pipeline row + `<Skeleton height={40} mt="sm" />` for the bottom row.

### Mobile behavior (≤600px)

Pipeline row switches to `flex-direction: column` (vertical stack). `::before` / `::after` chevron pseudo-elements hidden. First stage gets `border-radius: var(--r-lg) var(--r-lg) 0 0`, last stage `0 0 var(--r-lg) var(--r-lg)`.

---

## Section 3: `VulnerableItemsList`

**File:** `src/components/progress/VulnerableItemsList.tsx`  
**CSS Module:** `src/components/progress/VulnerableItemsList.module.css`

### Props interface

```typescript
interface VulnerableItem {
  /** Indonesian word */
  word: string
  /** Translation (Dutch or English) */
  meaning: string
  /** Number of memory lapses (regressions to Anchoring) */
  lapseCount: number
  /** Recall accuracy 0–100% (correct / total for form_recall skill type) */
  recallPct: number
}

interface VulnerableItemsListProps {
  /** Top 5 items, sorted descending by lapse_count then ascending by recallPct */
  items: VulnerableItem[]
}
```

### Data source

Items come from `progressService.getLapsePrevention()` extended to return per-item detail, or from the `skillStates` array filtered and sorted client-side. The top 5 are the items with the highest `lapse_count`; ties broken by lowest `recall_accuracy`.

### Visual description

**Container:** `<Box>` with `section-label` ("Meest Kwetsbare Woorden") above a `<Paper>` card (`padding: 16px 20px`).

**Intro text:** `font-size: 11px`, `color: var(--text-secondary)`, `margin-bottom: 12px`. Text: "De 5 woorden die de *Oproepen*-kloof het meest beïnvloeden op basis van herhaalde fouten."

**Item list** — vertical stack with 8 px gap. Each item is a grid row with columns: `90px 80px 80px 1fr 36px`.

Per row:
1. **Word** — `font-family: var(--font-mono)`, `font-size: 13px`, `font-weight: 600`, `color: var(--text-primary)`
2. **Meaning** — `font-size: 12px`, `color: var(--text-secondary)`
3. **Lapse column**:
   - If `lapseCount > 0`: lapse badge (`!` in a 14×14 circle, `background: var(--danger-subtle)`, `border: 1px solid rgba(255,69,58,0.3)`, `color: var(--danger)`, font-size 8px, font-weight 700) + text "{lapseCount} lapses", `font-family: var(--font-mono)`, `font-size: 10px`, `color: var(--text-tertiary)`
   - If `lapseCount === 0`: "0 lapses" in `color: var(--text-tertiary)`, `opacity: 0.4`
4. **Recall bar** — `height: 4px`, `background: var(--card-border)`, `border-radius: 2px`, overflow hidden. Inner fill `width: {recallPct}%`:
   - `recallPct < 35`: `background: var(--danger)`
   - `35 <= recallPct < 60`: `background: var(--warning)`
   - `recallPct >= 60`: `background: var(--accent-primary)`, `opacity: 0.6`
   - CSS transition `width 0.6s ease`
5. **Percentage** — `font-family: var(--font-mono)`, `font-size: 11px`, `font-weight: 600`, right-aligned. Color mirrors bar color threshold.

Each row: `background: rgba(255,255,255,0.03)`, `border: 1px solid var(--card-border)`, `border-radius: 8px`, `padding: 8px 10px`. Hover: `border-color: rgba(255,255,255,0.12)`.

### Interactive behavior

No click actions. Hover state on rows (border brightens).

### Empty state

If `items.length === 0`: centered text "Geen kwetsbare woorden — je geheugen is stabiel." in `color: var(--text-secondary)`.

### Loading state

Five `<Skeleton height={36} radius="sm" />` with 8 px gap.

### Mobile behavior (≤600px)

Grid collapses to `1fr 1fr` (word + meaning only). Recall bar and percentage columns hidden (`display: none`).

---

## Section 4: `ReviewForecastChart`

**File:** `src/components/progress/ReviewForecastChart.tsx`  
**CSS Module:** `src/components/progress/ReviewForecastChart.module.css`

### Props interface

```typescript
interface ForecastDay {
  /** Date object for this forecast day */
  date: Date
  /** Number of skills due on this day */
  count: number
}

interface ReviewForecastChartProps {
  /** 7-element array from computeReviewForecast(), index 0 = today */
  forecast: ForecastDay[]
}
```

### Derived values

```typescript
const MAX_COUNT = 50  // y-axis ceiling; all bars scale against this
const DANGER_THRESHOLD = 40  // bars above this get danger styling
const spikeDay = forecast.find(d => d.count >= DANGER_THRESHOLD)  // first spike day if any
```

### Visual description

**Container:** `<Paper>` card with title "7-Daagse Voorspelling" (`font-size: 13px`, `font-weight: 600`, `color: var(--text-secondary)`, `letter-spacing: 0.02em`, `margin-bottom: 16px`).

**Bar chart area:**
- `height: 140px`, `padding-left: 32px`, `padding-bottom: 24px`, `position: relative`
- **Y-axis labels** — absolute left column (28 px wide): values 50, 40, 30, 20, 10, 0 from top to bottom, `font-family: var(--font-mono)`, `font-size: 9px`, `color: var(--text-tertiary)`
- **Gridlines** — 6 horizontal lines (absolute overlay), `height: 1px`, `background: var(--card-border)`
- **Bar columns** (7, one per day) — flex row, `align-items: flex-end`, `gap: 8px`:
  - Bar `height = (count / MAX_COUNT) * (chartHeight - 24)` px, minimum 4 px
  - Normal bar: `background: linear-gradient(180deg, var(--accent-primary) 0%, rgba(0,229,255,0.6) 100%)`, `box-shadow: 0 0 8px rgba(0,229,255,0.2)`, `border-radius: 4px 4px 0 0`
  - Danger bar (count ≥ `DANGER_THRESHOLD`): `background: linear-gradient(180deg, var(--danger) 0%, rgba(255,69,58,0.7) 100%)`, `box-shadow: 0 0 12px rgba(255,69,58,0.35)`. Danger badge `!` absolute-positioned `top: -18px`, small red pill (`font-family: var(--font-mono)`, `font-size: 10px`).
  - Hover: `filter: brightness(1.3)`, `transform: scaleY(1.02)` (transform-origin bottom)
  - **Bar value label** — absolute `top: -16px`, `font-family: var(--font-mono)`, `font-size: 9px`, `color: var(--text-tertiary)`, visible only on hover (opacity 0 → 1 transition)
  - **Entrance animation** — `@keyframes bar-grow { from { transform: scaleY(0) } to { transform: scaleY(1) } }`, `animation: bar-grow 0.7s cubic-bezier(0.4,0,0.2,1) both`, staggered: each bar delays by `0.1s + index * 0.05s`
  - **X-axis label** — absolute bottom, `font-family: var(--font-mono)`, `font-size: 9px`. Today label: `color: var(--accent-primary)`, `font-weight: 700`. Danger day label: `color: var(--danger)`, `font-weight: 700`. Others: `color: var(--text-tertiary)`. Today label text: "Vand." (short for "Vandaag"). Other labels: abbreviated Dutch day names (Ma, Di, Wo, Do, Vr, Za, Zo) based on `date.getDay()`.

**Danger day what-if tooltip** (Mantine `<Tooltip>` with `multiline`, `w={220}`):
- Applied to the spike bar's column only (when `count >= DANGER_THRESHOLD`)
- Content: "**Als je deze dag overslaat:**\nDeze {count} items schuiven door naar de volgende dag, waardoor je backlog stijgt naar **{count + forecast[index+1]?.count ?? count} items** — een dag achterstand die moeilijk in te halen is."

**Spike annotation** (below the chart, `margin-top: 8px`):
- Only shown when `spikeDay` exists
- `font-size: 11px`, `color: var(--text-tertiary)`, `font-family: var(--font-mono)`
- Text: "■ {dayName}: {spikeDay.count} kaarten vervallen — plan extra tijd in." (■ colored `var(--danger)`)

**Projected next-week section** (below a divider):
- Label: "Volgende week (als je consistent blijft)", `font-family: var(--font-mono)`, `font-size: 9px`, `color: var(--text-tertiary)`, `letter-spacing: 0.08em`, `text-transform: uppercase`
- Mini bars (`height: 28px` total area, 7 columns): each mini bar is a thin rectangle with `background: rgba(50,215,75,0.35)`, `border: 1px solid rgba(50,215,75,0.5)`, `border-radius: 2px 2px 0 0`. Heights proportional to projected counts (estimated as `forecast[i].count * 0.6` — applying a 40% reduction assumption if consistent). Label below each: abbreviated day name, `font-size: 8px`, `color: var(--text-tertiary)`.
- Below mini bars: `font-size: 10px`, `color: var(--success)`, `font-family: var(--font-mono)`: "✓ Max {maxProjected} kaarten/dag — geen spikes" (or omitted if projected max ≥ DANGER_THRESHOLD)

### Interactive behavior

- Bar hover: brightness + scale transform + count label appears
- Spike bar: Mantine Tooltip (what-if scenario) on hover

### Loading state

`<Skeleton height={180} radius="md" />` filling the chart area.

### Mobile behavior (≤600px)

Chart fills full width (single column layout — the two-col grid stacks to 1 col). No structural change to the chart itself.

---

## Section 4b: `WeeklyGoalsList`

**File:** `src/components/progress/WeeklyGoalsList.tsx`  
**CSS Module:** `src/components/progress/WeeklyGoalsList.module.css`

This component sits in the right column of the same two-column row as `ReviewForecastChart`.

### Props interface

```typescript
type GoalStatus = 'achieved' | 'on_track' | 'at_risk' | 'off_track' | 'missed'

interface GoalDisplay {
  id: string
  name: string           // Dutch display name: "Consistentie" | "Kwaliteit" | "Groei"
  status: GoalStatus
  detail: string         // e.g. "5 / 7 dagen" or "71% nauwkeurigheid"
  progress: number       // 0–100, fill percentage for the thin bar
}

interface WeeklyGoalsListProps {
  goals: GoalDisplay[]
}
```

### Visual description

**Container:** `<Paper>` card, title "Wekelijkse Doelen" (same card-title style as ReviewForecastChart).

**Goals list** — vertical stack, `gap: 10px`:

Per goal item (`background: rgba(255,255,255,0.03)`, `border: 1px solid var(--card-border)`, `border-radius: 10px`, `padding: 12px 14px`):
1. **Top row** (`justify-content: space-between`):
   - Goal name: `font-size: 12px`, `font-weight: 600`, `color: var(--text-primary)`
   - Status badge: `font-family: var(--font-mono)`, `font-size: 9px`, `font-weight: 700`, `letter-spacing: 0.1em`, `text-transform: uppercase`, `padding: 2px 7px`, `border-radius: 3px`
     - `achieved` / `on_track`: green — `color: var(--success)`, `background: var(--success-subtle)`, `border: 1px solid rgba(50,215,75,0.2)`; label "On Track" or "Behaald"
     - `at_risk` / `off_track` / `missed`: warning — `color: var(--warning)`, `background: var(--warning-subtle)`, `border: 1px solid rgba(255,149,0,0.2)`; label "At Risk" or "Gemist"
2. **Detail text** — `font-size: 11px`, `color: var(--text-secondary)`, `font-family: var(--font-mono)`
3. **Progress track** — `height: 3px`, `background: var(--card-border)`, `border-radius: 2px`, overflow hidden. Fill:
   - On-track: `background: var(--success)`, `box-shadow: 0 0 6px rgba(50,215,75,0.4)`
   - At-risk: `background: var(--warning)`, `box-shadow: 0 0 6px rgba(255,149,0,0.4)`
   - CSS transition `width 1s cubic-bezier(0.4,0,0.2,1) 0.5s` (delayed entrance)

Row hover: `border-color: rgba(255,255,255,0.15)`.

### Loading state

Three `<Skeleton height={72} radius="sm" />` with 10 px gap.

### Mobile behavior (≤600px)

Stacks below the forecast chart (single-column layout). No structural change.

---

## Section 5: `DetailedMetrics`

**File:** `src/components/progress/DetailedMetrics.tsx`  
**CSS Module:** `src/components/progress/DetailedMetrics.module.css`

### Props interface

```typescript
interface DetailedMetricsProps {
  /** Average stability across all skill states (days) */
  avgStability: number
  /** Recall accuracy 0–1 (e.g. 0.63 = 63%) */
  recallAccuracy: number
  /** Recognition accuracy 0–1 (e.g. 0.84 = 84%) */
  recognitionAccuracy: number
  /** Number of words rescued from lapse in the last 7 days */
  rescuedWords: number
  /** Names of rescued words (for list display), up to 3 shown */
  rescuedWordNames: string[]
  /**
   * Average answer latency improvement in seconds.
   * Positive = got faster (e.g. 1.4 = 1.4 s faster).
   * null = not enough data.
   */
  latencyImprovement: number | null
  /** Previous week average latency in seconds (for display: "4.1s → 2.7s") */
  previousLatency: number | null
  /** Current week average latency in seconds */
  currentLatency: number | null
}
```

### Visual description

**Container:** `<Box>` with `section-label` ("Details") above a `SimpleGrid cols={{ base: 1, sm: 2, md: 4 }}`.

Four stat cards — each `<Paper>` with `background: var(--card-bg)`, `border: 1px solid var(--card-border)`, `border-radius: var(--r-lg)`, `padding: 18px 16px`, hover border glow and a top-edge shimmer line (gradient `transparent → var(--accent-primary-subtle) → transparent`, opacity 0 → 1 on hover).

**Card 1 — Gem. Stabiliteit**
- Label: "GEM. STABILITEIT" (monospace, 10 px, uppercase, `var(--text-tertiary)`)
- Value: `{avgStability.toFixed(1)}` — `font-family: var(--font-mono)`, `font-size: 26px`, `font-weight: 700`, `color: var(--accent-primary)`, `text-shadow: 0 0 10px var(--accent-primary-glow)`
- **Mini forgetting curve SVG** — `viewBox="0 0 80 36"`, inline next to the value:
  - Dashed 90% threshold line at y=7.2 (`stroke: rgba(255,255,255,0.1)`, `stroke-dasharray: 2,2`), labeled "90%"
  - Exponential decay path `d="M0,2 C12,4 22,8 30,13 C40,19 50,24 62,28 C68,30 74,31.5 80,34"`, `stroke: rgba(0,229,255,0.5)`, `stroke-width: 1.5`
  - Vertical marker line at x position corresponding to `avgStability` days (x = `(avgStability / 10) * 80`), `stroke: rgba(0,229,255,0.35)`, `stroke-dasharray: 1.5,1.5`
  - Dot at intersection: `r=2`, `fill: var(--accent-primary)`
- Sub-text: "dagen — na {value} dagen daalt de ophaalbaarheid naar <90% zonder herhaling", `font-size: 11px`, `color: var(--text-secondary)`

**Card 2 — Zwakke Woorden Gered**
- Label: "ZWAKKE WOORDEN GERED"
- Value: `{rescuedWords}` — `color: var(--success)`, `text-shadow: 0 0 10px rgba(50,215,75,0.4)`
- **Rescue star badges** — rendered inline next to the number. One `★` per rescued word (up to 3 shown). Each star: `font-size: 14px`, `color: var(--warning)`, `opacity: 0.85`, animated with `@keyframes badge-pop { from { transform: scale(0) } to { transform: scale(1) } }`, staggered delays (0s, 0.08s, 0.16s). `title` attribute = word name.
- Sub-text: "woorden gered van terugval naar Anchoring"
- Word list row: `↑ {rescuedWordNames.slice(0, 3).join(' · ')}`, `font-size: 10px`, `color: var(--success)`, `font-family: var(--font-mono)`, `opacity: 0.8`
- Bottom accent line: `height: 2px`, `background: linear-gradient(90deg, var(--success) 0%, transparent 100%)`, `opacity: 0.4`

**Card 3 — Nauwkeurigheid**
- Label: "NAUWKEURIGHEID"
- **Accuracy split** — two side-by-side items with a 1 px vertical divider:
  - Left (MCQ / recognition): `{Math.round(recognitionAccuracy * 100)}%`, `font-family: var(--font-mono)`, `font-size: 20px`, `font-weight: 700`. Color: `var(--success)` if ≥ 80%, `var(--warning)` if ≥ 60%, `var(--danger)` if < 60%. Sub-label: "MCQ", `font-size: 9px`, `color: var(--text-tertiary)`, uppercase, monospace.
  - Right (Recall / form_recall): same format. Sub-label: "RECALL".
- Bottom bar: `height: 3px`, `background: var(--card-border)`, fill `width: {recognitionAccuracy * 100}%`, gradient `var(--success) → var(--warning)`, `border-radius: 2px`

**Card 4 — Tijd Bespaard**
- Label: "TIJD BESPAARD"
- Value row: `{latencyImprovement !== null ? latencyImprovement.toFixed(1) : '—'}`, `font-size: 26px`, `color: var(--success)`, with unit "s/antwoord" in `font-family: var(--font-mono)`, `font-size: 13px`, `color: var(--text-secondary)` next to it (aligned to baseline)
- Sub-text: "sneller dan vorige week ({previousLatency}s → {currentLatency}s gem.)", `font-size: 11px`, `color: var(--text-secondary)`. Omitted if `latencyImprovement === null`.
- Secondary line: "≈ {minutesSaved} min bespaard per dag", `font-size: 11px`, `color: var(--success)`, `font-family: var(--font-mono)` (where `minutesSaved = Math.round(latencyImprovement * reviewsPerDay / 60)`, fallback estimate 3 min/dag). Omitted if `latencyImprovement === null`.
- Progress bar (from → to):
  - Left label: `{previousLatency}s`, monospace, 9 px, `var(--text-tertiary)`
  - Bar: `height: 3px`, gradient `var(--warning) → var(--success)`, fill at `(1 - currentLatency/previousLatency) * 100%`
  - Right label: `{currentLatency}s`, monospace, 9 px, `var(--success)`

### Interactive behavior

All four cards have hover states (border glow, shimmer top line). No click actions.

### Loading state

Four `<Skeleton height={120} radius="md" />` in the same grid layout.

### Mobile behavior (≤600px)

`SimpleGrid` collapses to `cols={1}` — all four cards stack vertically.

---

## Page-level structure

### `Progress` page (modified)

**File:** `src/pages/Progress.tsx`

```typescript
export function Progress() {
  const { data, loading, error } = useProgressData()

  if (loading) return <ProgressSkeleton />
  // Error notification handled inside useProgressData

  return (
    <Container size="md">
      <Stack gap="xl" my="xl">
        <ProgressHeader />
        <MemoryHealthHero
          avgRecognitionDays={data.skillStats.avgRecognition}
          avgRecallDays={data.skillStats.avgRecall}
        />
        <MasteryFunnel itemsByStage={data.itemsByStage} />
        <VulnerableItemsList items={data.vulnerableItems} />
        <SimpleGrid cols={{ base: 1, sm: '60fr 40fr' }} /* two-col */ spacing="md">
          <ReviewForecastChart forecast={data.forecast} />
          <WeeklyGoalsList goals={data.weeklyGoals} />
        </SimpleGrid>
        <DetailedMetrics
          avgStability={data.avgStability}
          recognitionAccuracy={data.recognitionAccuracy}
          recallAccuracy={data.recallAccuracy}
          rescuedWords={data.lapsePrevention.rescued}
          rescuedWordNames={data.rescuedWordNames}
          latencyImprovement={data.latencyImprovement}
          previousLatency={data.previousLatency}
          currentLatency={data.currentLatency}
        />
      </Stack>
    </Container>
  )
}
```

### `ProgressHeader` component (inline or separate small component)

- Badge: "INDONESISCH · GEHEUGEN" — `font-family: var(--font-mono)`, `font-size: 10px`, `letter-spacing: 0.12em`, `color: var(--accent-primary)`, `background: var(--accent-primary-subtle)`, `border: 1px solid rgba(0,229,255,0.2)`, `border-radius: 4px`, `padding: 3px 8px`, `text-transform: uppercase`
- H1: "Geheugenoverzicht", `font-size: 28px`, `font-weight: 600`, `letter-spacing: -0.01em`
- Subtitle: "Jouw leervoortgang en geheugengezondheid", `font-size: 14px`, `color: var(--text-secondary)`
- Left accent bar: `width: 3px`, `height: 42px`, `background: var(--accent-primary)`, `box-shadow: 0 0 12px var(--accent-primary-glow)`, `border-radius: 0 2px 2px 0`, positioned absolute left of header

### Section labels

All section labels use the same pattern:
- `font-family: var(--font-mono)`, `font-size: 10px`, `font-weight: 700`, `letter-spacing: 0.14em`, `text-transform: uppercase`, `color: var(--text-tertiary)`
- Trailing horizontal rule: flex `::after` pseudo-element with `height: 1px`, `background: var(--card-border)`, `flex: 1`
- `margin-bottom: 12px`

---

## Acceptance Criteria Summary

| # | Section | Key criterion |
|---|---------|--------------|
| 1 | Loading | Skeleton shown while Wave 1 data loads; section skeletons for Wave 2 |
| 2 | MemoryHealthHero | Recognition % and Recall % arc gauges render with correct values |
| 3 | MemoryHealthHero | Gap pill visible and labeled "{gap}% GAP" when gap ≥ 20 |
| 4 | MemoryHealthHero | Insight box text mentions "Typed Recall" when recall < recognition − 15 pts |
| 5 | MasteryFunnel | All 5 stage counts render correctly |
| 6 | MasteryFunnel | Bottleneck stage (highest count in anchoring/retrieving/productive) gets warning styling |
| 7 | MasteryFunnel | Milestone pill renders and links to `/session?mode=gate_check` |
| 8 | VulnerableItemsList | Top 5 items shown; items with lapse_count > 0 show "!" badge |
| 9 | ReviewForecastChart | 7 bars render; spike bar (count ≥ 40) gets danger styling |
| 10 | ReviewForecastChart | Projected section renders below the chart |
| 11 | WeeklyGoalsList | On-track goals show green badge; at-risk goals show orange badge |
| 12 | DetailedMetrics | Stability value + forgetting curve SVG render |
| 13 | DetailedMetrics | Rescue star count equals `rescuedWords` prop |
| 14 | DetailedMetrics | "≈ X min bespaard" secondary text visible when `latencyImprovement !== null` |
| 15 | Error state | Error notification shown on fetch failure |
