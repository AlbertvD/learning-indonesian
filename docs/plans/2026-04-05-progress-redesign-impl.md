# Progress Screen Redesign — Implementation Plan

**Date:** 2026-04-05  
**Architecture ref:** `docs/plans/2026-04-05-progress-redesign-architecture.md`  
**UI spec ref:** `docs/plans/2026-04-05-progress-ui-spec.md`  

---

## Overview

The Progress screen (`src/pages/Progress.tsx`) is rewritten from a flat list of Mantine progress bars into six visually distinct, data-rich sections backed by a dedicated `useProgressData` hook and `progressService` methods. No new DB migrations or views are required.

### Task groups and sequencing

```
Group A (sequential — infrastructure)
  A1  src/utils/progressUtils.ts           (new)
  A2  learnerStateService.ts               (add getDailyRollups)
  A3  src/services/progressService.ts      (add getAccuracyBySkillType + getLapsePrevention)
  A4  src/hooks/useProgressData.ts         (new)

Group B (parallel — all 6 components, depends on A4 types being stable)
  B1  MemoryHealthHero
  B2  MasteryFunnel
  B3  VulnerableItemsList
  B4  ReviewForecastChart
  B5  DetailedMetrics
  B6  WeeklyGoalsList

Group C (sequential — page assembly, depends on B complete)
  C1  src/pages/Progress.tsx               (rewrite)
  C2  src/pages/Progress.module.css        (rewrite)

Group D (final — polish, depends on C)
  D1  Loading skeletons for each section
  D2  Test suite: unit tests for utils, hook, service methods
```

---

## Critical naming constraints

These corrected names must be used everywhere. Using the wrong name will produce silent Supabase 0-row results.

| Wrong | Correct | Location |
|-------|---------|----------|
| `next_review_at` | `next_due_at` | `learner_skill_state` column |
| `review_logs` | `review_events` | table name |
| `'recall'` | `'form_recall'` | skill_type value |

---

## Group A — Infrastructure (sequential)

### A1 · Create `src/utils/progressUtils.ts`

**Files to touch:** `src/utils/progressUtils.ts` (new)

**Key implementation details:**

Export one pure function `computeReviewForecast`. It takes the already-fetched `LearnerSkillState[]` array (from Wave 1) and a `baseDate` defaulting to `new Date()`. It returns a 7-element array of `{ date: Date; count: number }`.

For each day `i` in 0..6:
- Construct `dayStart` = midnight of `baseDate + i days`
- Construct `dayEnd` = 23:59:59.999 of the same day
- Count `skillStates` where `s.next_due_at` is non-null and falls within `[dayStart, dayEnd]`

The function must use `next_due_at` (not `next_review_at`). It is entirely synchronous — no Supabase calls.

```ts
// Signature
export function computeReviewForecast(
  skillStates: LearnerSkillState[],
  baseDate: Date = new Date()
): { date: Date; count: number }[]
```

**Verification:** Unit test with a mock array of 3 skill states covering today, tomorrow, and day 5. Assert correct counts.

---

### A2 · Add `getDailyRollups` to `src/services/learnerStateService.ts`

**Files to touch:** `src/services/learnerStateService.ts` (modify)

**Key implementation details:**

The inline fetch in `Progress.tsx` lines 128–143 is extracted into a proper service method and replaced with a call to it. Add the following method to the `learnerStateService` object:

```ts
async getDailyRollups(userId: string, limit = 7): Promise<DailyGoalRollup[]> {
  const { data, error } = await supabase
    .schema('indonesian')
    .from('learner_daily_goal_rollups')
    .select('*')
    .eq('user_id', userId)
    .order('local_date', { ascending: false })
    .limit(limit)
  if (error) throw error
  return (data ?? []).reverse()   // oldest-first for chart rendering
}
```

Import `DailyGoalRollup` from `@/types/learning` at the top of the file.

**Verification:** No TypeScript errors on the new import. The old inline supabase dynamic import in Progress.tsx will be removed in task C1.

---

### A3 · Add `getAccuracyBySkillType` and `getLapsePrevention` to `src/services/progressService.ts`

**Files to touch:** `src/services/progressService.ts` (modify)

**Key implementation details:**

The existing file only has `markLessonComplete`. Add two new methods:

**`getAccuracyBySkillType(userId: string)`** — queries `review_events` (not `review_logs`). Filters `skill_type IN ('recognition', 'form_recall')`. Computes accuracy as `correct / total` for each group. Returns:

```ts
{
  recognitionAccuracy: number   // 0–1 ratio
  recognitionSampleSize: number
  recallAccuracy: number        // 0–1 ratio
  recallSampleSize: number
}
```

If a group has 0 rows, its accuracy is `0` and sample size is `0`.

**`getLapsePrevention(userId: string)`** — queries `learner_skill_state` with `lapse_count > 0`. Classifies rows:
- `atRisk`: rows where `consecutive_failures > 0`
- `rescued`: rows where `lapse_count > 0` AND `consecutive_failures === 0` AND `last_reviewed_at >= 7 days ago`

```ts
{ atRisk: number; rescued: number }
```

**Verification:** TypeScript compiles. Manual test: user with no review history returns `{ recognitionAccuracy: 0, recognitionSampleSize: 0, recallAccuracy: 0, recallSampleSize: 0 }` and `{ atRisk: 0, rescued: 0 }`.

---

### A4 · Create `src/hooks/useProgressData.ts`

**Files to touch:** `src/hooks/useProgressData.ts` (new)

**Key implementation details:**

This hook replaces the monolithic `useEffect` in `Progress.tsx`. It orchestrates two fetch waves with independent loading states so the UI can show section-level skeletons rather than a full-page spinner.

**State shape exported by the hook:**

```ts
interface ProgressData {
  // Wave 1 — required, blocks primary render
  wave1Loading: boolean
  wave1Error: Error | null
  itemsByStage: { new: number; anchoring: number; retrieving: number; productive: number; maintenance: number }
  skillStats: { avgRecognition: number; avgRecall: number; avgStability: number }
  lessonsCompleted: { completed: number; total: number }
  skillStates: LearnerSkillState[]
  forecast: { date: Date; count: number }[]   // derived synchronously from skillStates

  // Wave 2 — non-blocking, section-level skeletons shown while loading
  wave2Loading: boolean
  wave2Error: Error | null
  dailyRollups: DailyGoalRollup[] | null
  accuracyBySkillType: {
    recognitionAccuracy: number
    recognitionSampleSize: number
    recallAccuracy: number
    recallSampleSize: number
  } | null
  lapsePrevention: { atRisk: number; rescued: number } | null
  weeklyGoals: WeeklyGoal[] | null
  vulnerableItems: { id: string; indonesianText: string; lapseCount: number; consecutiveFailures: number }[] | null
}
```

**Wave 1 — `Promise.all` (parallel, required):**
1. `learnerStateService.getItemStates(userId)` → compute `itemsByStage`
2. `learnerStateService.getSkillStatesBatch(userId)` → compute `skillStats` (avgRecognition, avgRecall, avgStability) + `forecast` via `computeReviewForecast`
3. `lessonService.getUserLessonProgress(userId)` + `lessonService.getLessonsBasic()` → `lessonsCompleted`

Set `wave1Loading = false` when all three resolve.

**Wave 2 — `Promise.allSettled` (parallel, non-blocking) — fires after Wave 1:**
1. `learnerStateService.getDailyRollups(userId, 7)` → `dailyRollups`
2. `progressService.getAccuracyBySkillType(userId)` → `accuracyBySkillType`
3. `progressService.getLapsePrevention(userId)` → `lapsePrevention`
4. `goalService.getGoalProgress(userId)` → `weeklyGoals` (skip if state is `'timezone_required'`)
5. `progressService.getVulnerableItems(userId)` → `vulnerableItems` (see note below)

Use `Promise.allSettled` so a single Wave 2 failure does not blank out all sections. Log each rejected promise with `logError`.

**`getVulnerableItems` (add to progressService in this task):**

```ts
async getVulnerableItems(userId: string): Promise<
  { id: string; indonesianText: string; lapseCount: number; consecutiveFailures: number }[]
> {
  const { data, error } = await supabase
    .schema('indonesian')
    .from('learner_skill_state')
    .select('learning_item_id, lapse_count, consecutive_failures, learning_items!inner(base_text)')
    .eq('user_id', userId)
    .gt('lapse_count', 0)
    .order('lapse_count', { ascending: false })
    .limit(10)
  if (error) throw error
  return (data ?? []).map(row => ({
    id: row.learning_item_id,
    indonesianText: (row as any).learning_items.base_text,
    lapseCount: row.lapse_count,
    consecutiveFailures: row.consecutive_failures,
  }))
}
```

The join uses the `!inner` PostgREST syntax to inline the `learning_items.base_text` column (the Indonesian word text) via the foreign key `learner_skill_state.learning_item_id → learning_items.id`.

**Analytics side-effect:** Preserve the `analyticsService.trackGoalViewed` calls that fire when `weeklyGoals` arrives, currently in Progress.tsx lines 159–165. Move that `useEffect` into the hook (or keep it in the page — caller's choice, but the hook must re-export `weeklyGoals` so the effect can fire).

**Verification:** TypeScript compiles. With `wave1Loading = true` the page shows a full-page `<Loader>`. After Wave 1, primary sections render. Wave 2 sections show skeletons until resolved.

---

## Group B — Components (parallel, all depend on A4 types)

All components live under `src/components/progress/`. Each gets a `.tsx` file and a `.module.css` file. Design tokens come from `Progress.module.css` (to be written in C2) via CSS custom properties; components reference them as `var(--accent-primary)` etc. without duplicating token declarations.

---

### B1 · `MemoryHealthHero`

**Files:** `src/components/progress/MemoryHealthHero.tsx`, `MemoryHealthHero.module.css`

**Props:**
```ts
interface MemoryHealthHeroProps {
  avgRecognitionDays: number   // from skillStats.avgRecognition
  avgRecallDays: number        // from skillStats.avgRecall
}
```

**Key implementation details:**

Renders two gauge cards side-by-side in a `SimpleGrid cols={{ base: 1, sm: 2 }}`. Each card contains an SVG half-circle arc gauge (160×88 px viewport, `r=62`, `stroke-width=12`, half-circumference = `Math.PI * 62 ≈ 194.779`).

Convert stability days to percentage: `pct = Math.min(100, (days / 10) * 100)`.

Arc fill uses `stroke-dasharray: 194.779` and `stroke-dashoffset = 194.779 * (1 - pct / 100)`. Apply CSS transition `stroke-dashoffset 1.2s cubic-bezier(0.4,0,0.2,1) 0.3s` to animate on mount (set initial offset to 194.779 in a `useState`, then set to final value in `useEffect`).

When `|recognitionPct - recallPct| >= 20`, show a "gap pill" (`<Badge>`) below the grid with appropriate label (e.g., "Oproepen loopt achter" or "Oproepen is sterk").

Gauge colors: Herkenning = `var(--accent-primary)` (cyan), Oproepen = `#BF5AF2` (grape-purple).

**Verification:** Renders in Storybook (if present) or in the page with dummy props `avgRecognitionDays=7, avgRecallDays=2`. Animates on mount.

---

### B2 · `MasteryFunnel`

**Files:** `src/components/progress/MasteryFunnel.tsx`, `MasteryFunnel.module.css`

**Props:**
```ts
interface MasteryFunnelProps {
  itemsByStage: { new: number; anchoring: number; retrieving: number; productive: number; maintenance: number }
}
```

**Key implementation details:**

Renders a vertical funnel — five `<Box>` rows, each with a label, count badge, and a filled bar whose width is `(count / totalItems) * 100%` (or 0% if `totalItems === 0`). Order top-to-bottom: `maintenance` → `productive` → `retrieving` → `anchoring` → `new` (strongest memory at top).

Bar colors match the existing Progress.tsx palette: maintenance=green, productive=teal, retrieving=blue, anchoring=yellow, new=gray.

Include a `totalItems` summary line at the top: "N woorden in het systeem".

**Verification:** Renders correctly when all counts are 0. Proportions sum to 100%.

---

### B3 · `VulnerableItemsList`

**Files:** `src/components/progress/VulnerableItemsList.tsx`, `VulnerableItemsList.module.css`

**Props:**
```ts
interface VulnerableItemsListProps {
  items: { id: string; indonesianText: string; lapseCount: number; consecutiveFailures: number }[] | null
  loading: boolean
}
```

**Key implementation details:**

Shows up to 10 items from `progressService.getVulnerableItems` (fetched in Wave 2 of the hook). Query logic: `learner_skill_state` where `lapse_count > 0`, joined with `learning_items` for `base_text` (the Indonesian word), ordered by `lapse_count DESC`, limited to 10.

Each row: Indonesian word in bold mono font (`var(--font-mono)`), followed by `lapseCount` lapse count badge (color: `var(--danger)` if `> 2`, else `var(--warning)`), and a "consecutive failures" indicator if `consecutiveFailures > 0`.

When `loading`, show a `<Skeleton>` list (3 rows). When `items` is `null` (error) show a muted error note. When `items.length === 0` show "Geen kwetsbare woorden — goed gedaan!".

Section label: "Kwetsbare woorden".

**Verification:** Renders with mock data array. Skeleton shown when `loading=true`.

---

### B4 · `ReviewForecastChart`

**Files:** `src/components/progress/ReviewForecastChart.tsx`, `ReviewForecastChart.module.css`

**Props:**
```ts
interface ReviewForecastChartProps {
  forecast: { date: Date; count: number }[]   // 7 elements, day 0 = today
}
```

**Key implementation details:**

Data comes from `computeReviewForecast(skillStates)` — computed synchronously in the hook from Wave 1 data. No Wave 2 fetch needed.

Renders a simple bar chart as a `<SimpleGrid cols={7}>` of vertical bars. Each bar:
- Height proportional to `count / maxCount` (capped at `maxCount = Math.max(...forecast.map(f => f.count), 1)`)
- Bar background: today (i=0) = `var(--accent-primary)`, future days = `var(--accent-primary-subtle)` with `var(--accent-primary)` border
- Day label below each bar: "Ma", "Di", etc. using `date.toLocaleDateString('nl-NL', { weekday: 'short' })`
- Count label above each bar

When all counts are 0, show muted text "Geen reviews gepland" instead of an empty chart.

Section label: "Reviewprognose (7 dagen)".

**Verification:** Renders with a mock forecast of `[5, 3, 8, 2, 0, 1, 4]`. Today's bar is highlighted.

---

### B5 · `DetailedMetrics`

**Files:** `src/components/progress/DetailedMetrics.tsx`, `DetailedMetrics.module.css`

**Props:**
```ts
interface DetailedMetricsProps {
  avgStability: number                    // from skillStats.avgStability (Wave 1)
  accuracyBySkillType: {
    recognitionAccuracy: number
    recognitionSampleSize: number
    recallAccuracy: number
    recallSampleSize: number
  } | null                               // null while Wave 2 loading
  lapsePrevention: { atRisk: number; rescued: number } | null  // null while Wave 2 loading
  wave2Loading: boolean
}
```

**Key implementation details:**

Renders a `SimpleGrid cols={{ base: 1, sm: 3 }}` of metric tiles. Each tile has a large number, a unit label, and a caption.

Tile 1 — Gemiddelde stabiliteit: `avgStability.toFixed(1)` days (Wave 1, always available immediately).

Tile 2 — Herkenningsnauwkeurigheid: `(recognitionAccuracy * 100).toFixed(0)%` with `(N reviews)` subtext. Shows `<Skeleton>` while `wave2Loading && accuracyBySkillType === null`.

Tile 3 — Oproepnauwkeurigheid: same pattern for `recallAccuracy`.

Tile 4 — Risicosituaties: `lapsePrevention.atRisk` with warning color. Shows `<Skeleton>` while loading.

Tile 5 — Gered (7 dgn): `lapsePrevention.rescued` with success color. Shows `<Skeleton>` while loading.

**Verification:** Correct skeletons shown when Wave 2 is in-flight. Numbers display correctly when data arrives.

---

### B6 · `WeeklyGoalsList`

**Files:** `src/components/progress/WeeklyGoalsList.tsx`, `WeeklyGoalsList.module.css`

**Props:**
```ts
interface WeeklyGoalsListProps {
  goals: WeeklyGoal[] | null    // null while Wave 2 loading or timezone not set
  loading: boolean
}
```

**Key implementation details:**

This is a direct extraction of the "Weekly Goals Summary" paper from the current `Progress.tsx` (lines 219–261), with the following improvements:
- Replace the inline `statusColor` / `goalLabel` / `statusLabel` maps with helper functions to keep JSX clean
- Add `<Skeleton height={60} />` when `loading=true`
- When `goals === null && !loading`, render nothing (section is omitted)
- When `goals.length === 0`, render "Geen doelen deze week"

Goal label map (Dutch):
```ts
const GOAL_LABELS: Record<WeeklyGoalType, string> = {
  consistency: 'Studieconsistentie',
  recall_quality: 'Oproepkwaliteit',
  usable_vocabulary: 'Woordenschatgroei',
  review_health: 'Reviewachterstand',
}
```

Status color map: `achieved=green`, `on_track=blue`, `at_risk=yellow`, `off_track=red`, `missed=red`.

**Verification:** Renders existing goal data correctly. Layout matches the existing Progress.tsx output.

---

## Group C — Page assembly (sequential, after Group B)

### C1 · Rewrite `src/pages/Progress.tsx`

**Files:** `src/pages/Progress.tsx` (replace body)

**Key implementation details:**

Remove all local state, the `useEffect` data-fetching block, and the inline supabase import. Replace with a single `useProgressData()` call.

New component structure:

```tsx
export function Progress() {
  const data = useProgressData()

  if (data.wave1Loading) {
    return <Center h="50vh"><Loader size="xl" color="cyan" /></Center>
  }

  return (
    <Container size="md">
      <Stack gap="xl" my="xl">
        {/* Page header */}
        <Box>
          <Title order={2}>{T.progress.title}</Title>
          <Text c="dimmed" size="sm">Indonesisch · Geheugen</Text>
        </Box>

        {/* Section 1 */}
        <MemoryHealthHero
          avgRecognitionDays={data.skillStats.avgRecognition}
          avgRecallDays={data.skillStats.avgRecall}
        />

        {/* Section 2 */}
        <MasteryFunnel itemsByStage={data.itemsByStage} />

        {/* Section 3 */}
        <VulnerableItemsList items={data.vulnerableItems} loading={data.wave2Loading} />

        {/* Section 4 — two-column row */}
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="xl">
          <ReviewForecastChart forecast={data.forecast} />
          <WeeklyGoalsList goals={data.weeklyGoals} loading={data.wave2Loading} />
        </SimpleGrid>

        {/* Section 5 */}
        <DetailedMetrics
          avgStability={data.skillStats.avgStability}
          accuracyBySkillType={data.accuracyBySkillType}
          lapsePrevention={data.lapsePrevention}
          wave2Loading={data.wave2Loading}
        />
      </Stack>
    </Container>
  )
}
```

Keep the `analyticsService.trackGoalViewed` side-effect `useEffect` in this file (watching `data.weeklyGoals`).

Imports to add: all six new components, `useProgressData`.
Imports to remove: `learnerStateService`, `lessonService`, `goalService`, `analyticsService` (analytics stays), `logError`, `WeeklyGoal` type (moved to hook), `MantineProgress`, `RingProgress`, `SimpleGrid` (SimpleGrid stays for section 4 layout).

**Verification:** Page renders without TypeScript errors. Network tab shows Wave 1 queries fire together, Wave 2 queries fire together after Wave 1 resolves.

---

### C2 · Rewrite `src/pages/Progress.module.css`

**Files:** `src/pages/Progress.module.css` (replace)

**Key implementation details:**

Define all design token aliases as CSS custom properties scoped to `:root` (or a wrapper class if dark/light mode is handled via Mantine's `data-mantine-color-scheme` attribute).

```css
[data-mantine-color-scheme='dark'] .progressRoot {
  --accent-primary: #00E5FF;
  --accent-primary-subtle: rgba(0,229,255,0.09);
  --accent-primary-glow: rgba(0,229,255,0.16);
  --text-primary: #FFFFFF;
  --text-secondary: #8E8E93;
  --text-tertiary: #55525C;
  --card-bg: rgba(255,255,255,0.10);
  --card-border: rgba(255,255,255,0.07);
  --card-hover-border: #00E5FF;
  --success: #32D74B;
  --success-subtle: rgba(50,215,75,0.10);
  --warning: #FF9500;
  --warning-subtle: rgba(255,149,0,0.10);
  --danger: #FF453A;
  --danger-subtle: rgba(255,69,58,0.10);
  --font-mono: 'Courier New', monospace;
  --r-lg: 12px;
}

[data-mantine-color-scheme='light'] .progressRoot {
  --accent-primary: #0099B8;
  --accent-primary-subtle: rgba(0,153,184,0.08);
  --accent-primary-glow: rgba(0,153,184,0.16);
  --text-primary: #000000;
  --text-secondary: #86868B;
  --text-tertiary: #A2A2A7;
  --card-bg: rgba(0,153,184,0.07);
  --card-border: #D1D1D9;
  --card-hover-border: #0099B8;
  /* success / warning / danger same as dark */
}
```

Add the staggered fade-up entrance animation:

```css
@keyframes fade-up {
  from { opacity: 0; transform: translateY(12px); }
  to   { opacity: 1; transform: translateY(0); }
}

.section {
  animation: fade-up 0.5s ease both;
}
.section:nth-child(1) { animation-delay: 0ms; }
.section:nth-child(2) { animation-delay: 80ms; }
.section:nth-child(3) { animation-delay: 160ms; }
.section:nth-child(4) { animation-delay: 240ms; }
.section:nth-child(5) { animation-delay: 320ms; }
.section:nth-child(6) { animation-delay: 400ms; }
```

Apply `className={classes.section}` to each top-level section element in `Progress.tsx`, and `className={classes.progressRoot}` to the `<Container>`.

Retain the existing `.card` and `.ringWrap` class names for backward compatibility (they can be repurposed for the new card style).

**Verification:** Sections animate in sequentially on page load. Dark/light mode switching changes token values correctly.

---

## Group D — Polish (after Group C)

### D1 · Loading skeletons

**Files:** Each component file from Group B that has Wave 2 data (B3, B4-partial, B5, B6)

**Key implementation details:**

Each section that depends on Wave 2 data already accepts a `loading` prop. In this task, audit all six components and ensure:

1. Wave 2 sections show `<Skeleton>` with realistic height while `wave2Loading = true`
2. Section headers (label text) are always visible even during loading, so the layout does not shift dramatically
3. `<Skeleton animate>` is set to `true` (the default in Mantine) so the shimmer effect plays

No new files needed — these are additions within the existing component files.

**Verification:** Throttle network in DevTools to "Slow 3G". Wave 1 sections render fully while Wave 2 sections show animated skeletons. Skeletons disappear and are replaced by real data when Wave 2 resolves.

---

### D2 · Test suite

**Files:**
- `src/utils/progressUtils.test.ts` (new)
- `src/services/progressService.test.ts` (new or extend)
- `src/hooks/useProgressData.test.ts` (new)

**Key implementation details:**

**`progressUtils.test.ts`:**
- `computeReviewForecast` with empty array → all counts 0
- `computeReviewForecast` with skills due today (i=0), tomorrow (i=1), and 8 days out (not in range) → counts [1,1,0,0,0,0,0]
- `computeReviewForecast` with `next_due_at = null` → excluded from all days
- Uses `next_due_at` column name (not `next_review_at`)

**`progressService.test.ts`:**
- `getAccuracyBySkillType` — mock supabase returning `review_events` (not `review_logs`) with `form_recall` (not `recall`) skill type
- `getAccuracyBySkillType` with empty result → all zeros, no divide-by-zero
- `getLapsePrevention` — mock rows with various `lapse_count` / `consecutive_failures` combinations
- `getVulnerableItems` — mock join result, assert `indonesianText` mapped from `base_text`

**`useProgressData.test.ts`:**
- Wave 1 loading flag is true initially
- After Wave 1 resolves, `wave1Loading` becomes false and Wave 2 fires
- Wave 2 failure in one promise does not affect other Wave 2 results (use `Promise.allSettled`)
- `forecast` is populated synchronously from Wave 1 skill states (no extra fetch)

**Verification:** `npm test` (or equivalent) passes for all new test files with no TypeScript errors.

---

## New files summary

| File | Task | Notes |
|------|------|-------|
| `src/utils/progressUtils.ts` | A1 | Pure function, no Supabase |
| `src/hooks/useProgressData.ts` | A4 | Two-wave fetch orchestrator |
| `src/components/progress/MemoryHealthHero.tsx` | B1 | SVG arc gauge |
| `src/components/progress/MemoryHealthHero.module.css` | B1 | |
| `src/components/progress/MasteryFunnel.tsx` | B2 | Vertical funnel bars |
| `src/components/progress/MasteryFunnel.module.css` | B2 | |
| `src/components/progress/VulnerableItemsList.tsx` | B3 | Lapse-count list |
| `src/components/progress/VulnerableItemsList.module.css` | B3 | |
| `src/components/progress/ReviewForecastChart.tsx` | B4 | 7-day bar chart |
| `src/components/progress/ReviewForecastChart.module.css` | B4 | |
| `src/components/progress/DetailedMetrics.tsx` | B5 | 5-tile grid |
| `src/components/progress/DetailedMetrics.module.css` | B5 | |
| `src/components/progress/WeeklyGoalsList.tsx` | B6 | Extracted from Progress.tsx |
| `src/components/progress/WeeklyGoalsList.module.css` | B6 | |
| `src/utils/progressUtils.test.ts` | D2 | |
| `src/services/progressService.test.ts` | D2 | |
| `src/hooks/useProgressData.test.ts` | D2 | |

## Modified files summary

| File | Task | Change |
|------|------|--------|
| `src/services/learnerStateService.ts` | A2 | Add `getDailyRollups` |
| `src/services/progressService.ts` | A3, A4 | Add `getAccuracyBySkillType`, `getLapsePrevention`, `getVulnerableItems` |
| `src/pages/Progress.tsx` | C1 | Replace body with hook + component composition |
| `src/pages/Progress.module.css` | C2 | Replace with design token aliases + fade-up animation |

---

## Dependency diagram

```
A1 ──────────────────────────────────────────────────────► A4
A2 ──────────────────────────────────────────────────────► A4
A3 ──────────────────────────────────────────────────────► A4
                                                           │
                                                           ▼
                                          ┌────────────────────────────────┐
                                          │  B1  B2  B3  B4  B5  B6       │
                                          │  (parallel)                    │
                                          └────────────────────────────────┘
                                                           │
                                                           ▼
                                                      C1 ──► C2
                                                           │
                                                           ▼
                                                      D1 ──► D2
```

A1, A2, A3 can be developed in parallel with each other since they are independent. A4 depends on all three. Group B components can all be developed in parallel once the `ProgressData` interface from A4 is agreed upon (even before A4 is fully working, the interface can be frozen first).
