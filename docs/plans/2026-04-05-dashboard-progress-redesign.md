# Dashboard & Progress Redesign

## Problem

Both pages blur their purpose. The Dashboard shows a "Progress Snapshot" (items by stage) that belongs on Progress. The Progress page shows "This Week's Goals" that belongs on Dashboard. Neither page has a clear identity.

## Guiding Principle

- **Dashboard** answers: "What should I do TODAY, and how is THIS WEEK going?"
- **Progress** answers: "How has my learning grown OVER TIME?"

Weekly goals and today's plan live on Dashboard. Trend charts, vocabulary pipeline, memory strength, and milestones live on Progress. No data appears on both pages.

---

## Dashboard Redesign

### Purpose
Show the learner their weekly goal status at a glance, today's study plan, and quick actions to start learning.

### Layout (top to bottom)

```
+---------------------------------------------+
| Welcome bar: name + streak flame             |
+---------------------------------------------+
| WEEKLY SCORECARD (4 ring charts in a row)    |
+---------------------------------------------+
| TODAY'S SESSION PLAN (hero card)             |
+---------------------------------------------+
| 7-DAY CONSISTENCY STRIP                     |
+---------------------------------------------+
| QUICK ACTIONS (2-col grid)                  |
+---------------------------------------------+
```

---

### Section 1: Welcome Bar

**Current:** `Group` with welcome text + streak badge.
**Change:** No structural change. Keep as-is.

**Components:** `Group`, `Text`, `IconFlame`

---

### Section 2: Weekly Scorecard

**Current:** 4 stacked horizontal `Progress` bars with labels.
**Change:** Replace with 4 `RingProgress` charts in a responsive grid.

**Layout:** `SimpleGrid cols={{ base: 2, sm: 4 }}` -- 2x2 on mobile, 4 across on desktop.

Each goal card:
```
+------------------+
|    [RingProgress] |  -- 80px diameter
|       72%        |  -- percentage label centered inside ring
|   Study Days     |  -- goal label below
|    3 / 4         |  -- current / target below label
+------------------+
```

**Component:** `Paper` with `composes: card-default from global`.

**RingProgress specs:**
- `size={80}`, `thickness={6}`, `roundCaps`
- Single section per ring: `[{ value: percentage, color: statusColor }]`
- Center label: percentage as `Text fw={700} size="lg"`

**Color mapping (Mantine named colors, not hex):**
| Status | Ring color | Ring track |
|--------|-----------|------------|
| `achieved` | `green` | default gray |
| `on_track` | `blue` | default gray |
| `at_risk` | `orange` | default gray |
| `off_track` / `missed` | `red` | default gray |

**Value formatting:**
- `consistency`: `3 / 4` (days)
- `recall_quality`: `85%` (current * 100, rounded)
- `usable_vocabulary`: `12 / 8` (count)
- `review_health`: `5 / 20` (overdue count -- note: `at_most` direction, so lower is better; ring % = `max(0, 100 - (current/target)*100)` for this goal type)

**Provisional indicator:** If `is_provisional`, show a small `(?)` icon next to the label with a `Tooltip` explaining the goal is provisional.

**Empty state:** If no goals (timezone not set or no goal set generated), show the existing timezone prompt card.

---

### Section 3: Today's Session Plan (Hero Card)

**Current:** Stacked stats + "Start today's session" button in a gradient card.
**Change:** Restructure into a more scannable layout.

**Layout:**
```
+----------------------------------------------+
|  Today's Plan                         15 min |
|                                              |
|  [icon] 12 reviews   [icon] 3 new           |
|  [icon] 5 recall prompts                    |
|                                              |
|  [ ====== Start Session ============== ]     |
+----------------------------------------------+
```

**Component:** `Paper` with `classes.heroCard` (keep existing gradient background).

**Stats layout:** `SimpleGrid cols={{ base: 2, sm: 3 }}` for the 3 stat items. Estimated time is pulled to the top-right as a badge.

Each stat item:
- Tabler icon (`IconRefresh` for reviews, `IconSparkles` for new, `IconBrain` for recall) at `size={16}`, color `var(--accent-primary)`
- `Text size="sm"` with the count and label inline

**Estimated time badge:** `Text` in top-right corner, styled as:
- `font-size: var(--fs-xl)`, `font-weight: var(--fw-bold)`, color `var(--accent-primary)`
- Suffix "min" in `var(--fs-sm)`, `var(--text-secondary)`

**CTA button:** `Button fullWidth size="md" variant="filled"` -- keep as-is.

**Empty state (no plan):** Show a compact message: "No reviews due today. Take a break or start a new lesson." with a "Browse Lessons" link.

---

### Section 4: 7-Day Consistency Strip

**New section.** Replaces the need to mentally track which days you've studied.

**Layout:** A horizontal strip of 7 circles representing Mon-Tue-Wed-Thu-Fri-Sat-Sun of the current goal week.

```
  Ma   Di   Wo   Do   Vr   Za   Zo
  [*]  [*]  [*]  [ ]  [ ]  [ ]  [ ]
```

**Component:** `Paper` with `composes: card-default from global`. Inside: `Group justify="center" gap="md"`.

Each day:
- `Box` with a 32px circle
- **Studied day:** filled circle with `background: var(--success)`, checkmark icon inside (`IconCheck size={14}`, white)
- **Today (not yet studied):** ring outline with `border: 2px solid var(--accent-primary)`, pulsing glow via `box-shadow: 0 0 8px var(--accent-primary-glow)`
- **Today (studied):** filled `var(--success)` with checkmark
- **Future day:** ring outline with `border: 2px solid var(--border-light)`, no fill
- **Past day (missed):** ring outline with `border: 2px solid var(--border)`, `background: var(--danger-subtle)`

Day label: `Text size="xs" c="dimmed"` above each circle. Use 2-letter abbreviations from i18n.

**Data source:** `dailyRollups` from `learner_daily_goal_rollups`. Each rollup has `study_day_completed` boolean and `local_date`. Fill in gaps for days with no rollup row as "not studied."

**Responsive:** On mobile (base), reduce circle size to 28px and gap to "sm".

---

### Section 5: Quick Actions

**Current:** 2-column grid with "Continue Lesson" and "Practice Weak Words".
**Change:** Keep structure but improve visual hierarchy.

**Component:** `SimpleGrid cols={2}` with `Paper` elements using `composes: card-action from global`.

Each card:
- Left: icon in a 36px rounded square (`background: var(--accent-primary-subtle)`, `border-radius: var(--r-sm)`)
  - Continue Lesson: `IconBook size={18}`
  - Practice Weak: `IconTargetArrow size={18}`
- Center: title (`Text size="sm" fw={600}`) + subtitle (`Text size="xs" c="dimmed"`)
- Right: `IconChevronRight size={16} color="var(--text-tertiary)"`

**Responsive:** Stack to `cols={1}` on narrow mobile is not needed -- 2-col works at all widths given the short text.

---

### What to REMOVE from Dashboard

1. **"Progress Snapshot" card** (items by stage with progress bars) -- this is a journey metric, move to Progress page
2. The stage breakdown duplicates what Progress shows more completely

---

## Progress Redesign

### Purpose
Show the learner how their vocabulary and memory have grown over time, with trend data and milestone celebrations.

### Layout (top to bottom)

```
+---------------------------------------------+
| Page title: "My Journey" / "Mijn Reis"       |
+---------------------------------------------+
| MILESTONE BANNER (conditional)              |
+---------------------------------------------+
| VOCABULARY PIPELINE (horizontal funnel)     |
+---------------------------------------------+
| 7-DAY TREND CHARTS (2 side-by-side)        |
+---------------------------------------------+
| MEMORY STRENGTH (recognition vs recall)     |
+---------------------------------------------+
| LESSON COMPLETION ARC                       |
+---------------------------------------------+
```

---

### Section 1: Page Title

**Change:** Rename from "Voortgang" / "Progress" to "Mijn Reis" / "My Journey" to reinforce the long-term framing. The nav label stays "Voortgang" / "Progress" for clarity.

---

### Section 2: Milestone Banner (conditional)

**New section.** Shows a celebratory callout when the user crosses a milestone.

**Milestones to detect:**
- 10 / 25 / 50 / 100 / 200 productive+maintenance items
- 7 / 14 / 30 / 60 day streak
- First lesson completed
- All lessons completed

**Layout:**
```
+----------------------------------------------+
|  [Trophy icon]  50 usable words!             |
|                 You've built a strong base.  |
+----------------------------------------------+
```

**Component:** `Paper` with a subtle gradient background:
- `background: linear-gradient(135deg, var(--success-subtle), transparent)`
- `border: 1px solid var(--success)`
- `border-radius: var(--r-md)`

**Icon:** `IconTrophy size={24}` in `color: var(--warning)` (gold tone).

**Text:** Title in `var(--fs-lg)`, `var(--fw-bold)`. Subtitle in `var(--fs-sm)`, `var(--text-secondary)`.

**Logic:** Show highest unacknowledged milestone. If none, hide the entire section. Milestone thresholds are checked client-side against `itemsByStage.productive + itemsByStage.maintenance` and streak count.

**Dismissal:** Not needed for v1. Just show the most relevant milestone; it naturally changes as the user progresses.

---

### Section 3: Vocabulary Pipeline

**Current:** 5 stacked horizontal progress bars (items by stage).
**Change:** Replace with a horizontal funnel visualization showing flow from left to right.

**Layout:**
```
+--------------------------------------------------------------+
|  Vocabulary Pipeline                          Total: 47      |
|                                                              |
|  [  Nieuw  ] --> [ Verankering ] --> [ Ophalen ] --> ...     |
|     12              8                  15                     |
|  =========    ============       ===============             |
|                                                              |
|  ... --> [ Productief ] --> [  Stabiel  ]                    |
|              7                  5                             |
|        ==========          ========                          |
+--------------------------------------------------------------+
```

**Implementation:** `SimpleGrid cols={{ base: 3, sm: 5 }}` with each stage as a vertical card-within-card.

Each stage block:
- `Paper` with `padding: "md"`, `text-align: center`
- Stage name: `Text size="xs" c="dimmed" tt="uppercase" fw={600}`
- Count: `Text size="xl" fw={700}` in the stage color
- Horizontal bar below: `Progress value={stagePercent} color={stageColor} size="sm"`
- Arrow connector between blocks: CSS `::after` pseudo-element on all but the last block, using `>` character or a thin line

**Stage colors (Mantine named):**
| Stage | Color |
|-------|-------|
| new | `gray` |
| anchoring | `yellow` |
| retrieving | `blue` |
| productive | `teal` |
| maintenance | `green` |

**Bar value:** Percentage of total items in this stage.

**Responsive:** On mobile (`base: 3` cols), wrap to 2 rows. First row: new, anchoring, retrieving. Second row: productive, maintenance (centered). Hide arrow connectors on mobile.

**Empty state:** If `totalItems === 0`, show: "Start your first lesson to begin building vocabulary." with a link to `/lessons`.

---

### Section 4: 7-Day Trend Charts

**Current:** Stacked rows of dates with progress bars for "Productive Gains" and "Backlog Trend" in separate cards.
**Change:** Replace with two proper bar charts side-by-side.

**Layout:** `SimpleGrid cols={{ base: 1, sm: 2 }}` -- stacked on mobile, side-by-side on desktop.

#### Chart A: Items Gained (left)

**Title:** "Woordenschatgroei" / "Vocabulary Growth"

**Chart type:** Vertical bar chart, 7 bars (one per day).

**Implementation:** Pure CSS/HTML bars inside a flex container (no chart library needed). Each bar is a `Box` with:
- Width: `calc(100% / 7 - 8px)`
- Height: proportional to value, max height 120px
- `background: var(--success)` (gained items are positive)
- `border-radius: var(--r-sm) var(--r-sm) 0 0` (rounded top)
- Hover: show exact count in a `Tooltip`

**X-axis labels:** 2-letter day abbreviations (`Ma`, `Di`, etc.) in `var(--fs-xs)`, `var(--text-tertiary)`.
**Y-axis:** Implicit (bar height). No explicit y-axis labels needed for this data range (0-10 typical).
**Zero-value days:** Show a 2px stub bar in `var(--border)` so the day is still visible.

**Bar value label:** `Text size="xs"` above each bar showing the count. Only show if count > 0.

#### Chart B: Overdue Trend (right)

**Title:** "Achterstand" / "Backlog"

**Chart type:** Same vertical bar chart structure.

**Bar colors:**
- 0 overdue: `var(--success)` (2px stub)
- 1-10 overdue: `var(--warning)`
- 11+ overdue: `var(--danger)`

**Data source:** `dailyRollups[].overdue_count`

**Empty state (no rollups):** Show placeholder text: "Study for a few days to see trends appear."

---

### Section 5: Memory Strength

**Current:** Two `RingProgress` charts side-by-side for recognition vs recall.
**Change:** Keep the dual ring concept but improve the presentation.

**Layout:**
```
+----------------------------------------------+
|  Memory Strength                              |
|                                              |
|  [=== Recognition ring ===]   [=== Recall ring ===]  |
|         72%                        45%        |
|      Recognition                  Recall      |
|                                              |
|  "Your recall is weaker than recognition.    |
|   Focus on typing exercises to strengthen    |
|   active recall."                            |
+----------------------------------------------+
```

**Component:** `Paper` with `composes: card-default from global`. `SimpleGrid cols={2}` for the rings.

**RingProgress specs:**
- `size={100}`, `thickness={8}`, `roundCaps`
- Recognition: `color="blue"`
- Recall: `color="grape"`
- Center label: percentage in `Text fw={700} size="lg"`

**Insight text below rings:** A computed sentence comparing the two values.
- If recall < recognition by 20+ points: "Your recall needs work. Try more typing exercises."
- If roughly equal (+/- 10): "Recognition and recall are well balanced."
- If recognition < recall (rare): "Try more listening exercises to strengthen recognition."

Display in `Text size="sm" c="dimmed" ta="center"`.

**Value calculation:** `Math.min(100, Math.round((avgStability / 10) * 100))` -- keep existing formula.

---

### Section 6: Lesson Completion Arc

**Current:** Simple progress bar with "X / Y lessons completed".
**Change:** Replace with a more visual stepped progress indicator.

**Layout:**
```
+----------------------------------------------+
|  Course Progress                              |
|                                              |
|  [1]----[2]----[3]----[4]----[5]             |
|   *      *      *      o      o              |
|                                              |
|  3 of 5 lessons completed (60%)              |
+----------------------------------------------+
```

**Implementation:** A horizontal stepper using `Group justify="space-between"` with connecting lines.

Each lesson step:
- **Completed:** Filled circle (24px), `background: var(--success)`, `IconCheck size={12}` inside, white
- **In progress:** Ring with `border: 2px solid var(--accent-primary)`, pulsing glow
- **Not started:** Ring with `border: 2px solid var(--border-light)`

Connecting lines between circles: `Box` with `height: 2px`, `flex: 1`, colored:
- `var(--success)` between two completed lessons
- `var(--border-light)` otherwise

Below the stepper: `Text size="sm"` with "3 of 5 lessons completed" and a small `Progress` bar for overall percentage.

**Responsive:** Works at all widths since lesson count is small (5-10). If lesson count exceeds 10 in future, switch to a compact progress bar.

---

### What to REMOVE from Progress

1. **"This Week's Goals" card** -- weekly goals are Dashboard-only now
2. **"Due Items" card** (due today / due this week) -- this is a "today" metric, shown implicitly via Dashboard's Today Plan
3. **Duplicate stage breakdown** -- replaced by the pipeline visualization (same data, better presentation)

---

## Responsive Summary

| Section | Desktop | Mobile |
|---------|---------|--------|
| Dashboard: Weekly Scorecard | 4 rings in a row | 2x2 grid |
| Dashboard: Today's Plan stats | 3 columns | 2 columns |
| Dashboard: Consistency Strip | 7 circles, 32px | 7 circles, 28px |
| Dashboard: Quick Actions | 2 columns | 2 columns |
| Progress: Vocabulary Pipeline | 5 columns | 3 + 2 rows |
| Progress: Trend Charts | 2 side-by-side | Stacked |
| Progress: Memory Rings | 2 side-by-side | 2 side-by-side |
| Progress: Lesson Arc | Horizontal stepper | Horizontal stepper |

---

## Data Flow Changes

### Dashboard fetches:
- `goalService.getGoalProgress(userId)` -- weekly goals + today plan (existing)
- `learner_daily_goal_rollups` -- last 7 days, for consistency strip (move from Progress)
- `review_events` -- for streak calculation (existing)
- `lessonService` -- for continue URL (existing)
- **Remove:** `learnerStateService.getItemStates` (no longer needed on Dashboard)

### Progress fetches:
- `learnerStateService.getItemStates(userId)` -- for pipeline (existing)
- `learnerStateService.getSkillStatesBatch(userId)` -- for memory strength (existing)
- `lessonService` -- for lesson completion arc (existing)
- `learner_daily_goal_rollups` -- last 7 days, for trend charts (existing)
- **Remove:** `goalService.getGoalProgress` (no longer needed on Progress)
- **Remove:** due date calculations from skill states (was for the "Due Items" card)

---

## i18n Keys to Add

### Dashboard
```
dashboard.consistency        -- "Consistency" / "Consistentie"
dashboard.recallQualityShort -- "Recall" / "Herinnering"
dashboard.vocabGrowth        -- "Vocabulary" / "Woordenschat"
dashboard.backlog            -- "Backlog" / "Achterstand"
dashboard.noReviewsDue       -- "No reviews due today..." / "Geen herhalingen vandaag..."
dashboard.browseLessons      -- "Browse Lessons" / "Lessen bekijken"
dashboard.mon ... dashboard.sun -- 2-letter day abbreviations
```

### Progress
```
progress.myJourney            -- "My Journey" / "Mijn Reis"
progress.vocabularyPipeline   -- "Vocabulary Pipeline" / "Woordenschatpijplijn"
progress.courseProgress        -- "Course Progress" / "Cursusvoortgang"
progress.vocabGrowthChart     -- "Vocabulary Growth" / "Woordenschatgroei"
progress.backlogChart         -- "Backlog" / "Achterstand"
progress.insightRecallWeak    -- "Your recall needs work..." 
progress.insightBalanced      -- "Recognition and recall are well balanced."
progress.insightRecogWeak     -- "Try more listening exercises..."
progress.startFirstLesson     -- "Start your first lesson..." 
progress.studyForTrends       -- "Study for a few days to see trends..."
progress.milestone50Words     -- "50 usable words!"
progress.milestoneBase        -- "You've built a strong base."
progress.xOfYLessons          -- "{completed} of {total} lessons completed"
```

---

## Mantine Component Summary

| Element | Component |
|---------|-----------|
| Goal rings (Dashboard) | `RingProgress` size={80} thickness={6} |
| Memory rings (Progress) | `RingProgress` size={100} thickness={8} |
| Consistency circles | Custom `Box` with border-radius 50% |
| Trend bar charts | Custom CSS flex bars (no library) |
| Pipeline stage cards | `Paper` + `Progress` bar |
| Lesson stepper | Custom `Group` + `Box` circles + connecting lines |
| Hero card | `Paper` with gradient CSS class |
| Action cards | `Paper` with `composes: card-action from global` |
| Stat cards | `Paper` with `composes: card-default from global` |
| Tooltips | `Tooltip` on ring charts and bar chart hover |
| Milestone banner | `Paper` with conditional gradient border |

---

## Implementation Order

1. **Dashboard: Weekly Scorecard** -- replace progress bars with ring charts
2. **Dashboard: Consistency Strip** -- new component, needs dailyRollups fetch
3. **Dashboard: Remove Progress Snapshot** -- delete the stage breakdown card
4. **Dashboard: Refine Today's Plan** -- restructure stats layout
5. **Progress: Remove Weekly Goals + Due Items cards** -- clean separation
6. **Progress: Vocabulary Pipeline** -- replace stacked bars with funnel grid
7. **Progress: Trend bar charts** -- replace date-row progress bars with CSS bar charts
8. **Progress: Memory Strength insight text** -- add computed recommendation
9. **Progress: Lesson Completion Arc** -- replace progress bar with stepper
10. **Progress: Milestone Banner** -- add conditional celebration component
11. **i18n** -- add all new translation keys in both NL and EN
