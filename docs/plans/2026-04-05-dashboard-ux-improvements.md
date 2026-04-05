# Dashboard UX Improvements

Companion to `2026-04-05-dashboard-progress-redesign.md`. Evaluates 5 user suggestions and produces implementable specs for each accepted item.

---

## Suggestion 1: Hero Layout

**Verdict:** Accept with modifications

**Conflicts:**
- The redesign spec already plans to restructure the hero card stats into a `SimpleGrid cols={{ base: 2, sm: 3 }}` with icons. This suggestion aligns but goes further by inlining the streak and compacting stats into an icon row.
- Moving streak inline with the welcome text conflicts mildly with the redesign spec's "keep welcome bar as-is" stance, but improves scannability. Accept the change.
- "Combine 4 stats into a single icon row" aligns with the redesign spec's icon-per-stat approach. Accept.
- "Clock icon next to button text" is a small addition with no conflicts.

**Design spec:**

### 1a. Inline streak with welcome text

Replace the current `Group justify="space-between"` welcome bar with a single line:

```
Welkom terug, Albert  [flame] 3 dagen
```

**Implementation:**
```tsx
<Group gap="xs" align="baseline">
  <Text size="xl" fw={600}>{T.dashboard.welcomeBack}, {name}</Text>
  <Group gap={4}>
    <IconFlame size={16} color="var(--warning)" />
    <Text size="sm" fw={600} c="dimmed">{currentStreak}d</Text>
  </Group>
</Group>
```

Remove the separate right-aligned streak `Group`. The streak becomes a subtle inline suffix rather than a competing visual element.

### 1b. Compact stat row in hero card

Replace the 4 stacked `Stack gap={0}` stat columns with a horizontal icon row:

```
[IconRefresh] 12    [IconSparkles] 3    [IconBrain] 5    [IconClock] ~8 min
```

**Implementation:**
```tsx
<Group gap="xl" wrap="wrap">
  <Group gap={6}>
    <IconRefresh size={16} color="var(--accent-primary)" />
    <Text size="sm">{todayPlan.due_reviews_today_target} {T.dashboard.reviews}</Text>
  </Group>
  <Group gap={6}>
    <IconSparkles size={16} color="var(--accent-primary)" />
    <Text size="sm">{todayPlan.new_items_today_target} {T.dashboard.newLabel}</Text>
  </Group>
  <Group gap={6}>
    <IconBrain size={16} color="var(--accent-primary)" />
    <Text size="sm">{todayPlan.recall_interactions_today_target} {T.dashboard.recallLabel}</Text>
  </Group>
</Group>
```

### 1c. Clock icon in button text

```tsx
<Button onClick={() => navigate('/session')} fullWidth size="md" variant="filled"
  leftSection={<IconClock size={18} />}>
  {T.dashboard.startTodaysSession} -- ~{todayPlan.estimated_minutes_today} min
</Button>
```

This embeds the time estimate into the CTA itself, acting as a psychological hook ("only 8 minutes").

**Files:** `src/pages/Dashboard.tsx`
**Icons to add:** `IconRefresh`, `IconSparkles`, `IconBrain`, `IconClock` from `@tabler/icons-react`

---

## Suggestion 2: Streamline "Deze week" (Weekly Goals)

**Verdict:** Accept with modifications -- move targeted session buttons, do not remove them

**Conflicts:**
- The targeted session buttons (`Korte sessie`, `Vergroot woordenschat`, etc.) were recently built and are functional. The user suggestion says "remove action buttons from inside the progress bar area." These buttons appear only when a goal is `at_risk` or worse, so they serve a real purpose.
- The redesign spec replaces progress bars with `RingProgress` charts, which makes inline buttons impossible anyway. The buttons need a new home.
- Status pills conflict with ring chart colors from the redesign spec -- but only if both exist. Since rings replace bars, the status pill can live as a label beneath the ring instead.

**Design spec:**

### 2a. Status pills on ring chart labels

In the Weekly Scorecard (ring charts from the redesign spec), add a colored pill badge below each ring's `current / target` text:

```
    [RingProgress]
       72%
    Study Days
      3 / 4
   [Op schema]       <-- colored pill
```

**Pill component:**
```tsx
<Text
  size="xs"
  fw={600}
  className={classes.statusPill}
  data-status={goal.status}
>
  {statusLabels[goal.status]}
</Text>
```

**CSS module (`Dashboard.module.css`):**
```css
.statusPill {
  display: inline-block;
  padding: 2px 8px;
  border-radius: var(--r-xl);
  font-size: var(--fs-xs);
  font-weight: var(--fw-semibold);
  line-height: 1.4;
  margin-top: 4px;
}

.statusPill[data-status="achieved"] {
  background: var(--success-subtle);
  color: var(--success);
}

.statusPill[data-status="on_track"] {
  background: var(--accent-primary-subtle);
  color: var(--accent-primary);
}

.statusPill[data-status="at_risk"] {
  background: var(--warning-subtle);
  color: var(--warning);
}

.statusPill[data-status="off_track"],
.statusPill[data-status="missed"] {
  background: var(--danger-subtle);
  color: var(--danger);
}
```

**Status label i18n:**

| Key | NL | EN |
|-----|----|----|
| `dashboard.statusOnTrack` | `Op schema` | `On track` |
| `dashboard.statusAtRisk` | `Risico` | `At risk` |
| `dashboard.statusAchieved` | `Behaald` | `Achieved` |
| `dashboard.statusBehind` | `Achter` | `Behind` |

### 2b. Relocate targeted session buttons

Move the goal-specific action buttons out of the weekly scorecard and into a new "Aanbevolen acties" (Recommended Actions) section below the hero card, shown only when at least one goal is `at_risk` or worse.

```
+----------------------------------------------+
|  Aanbevolen acties                           |
|                                              |
|  [warning icon] Herinnering verbeteren       |
|  [warning icon] Achterstand wegwerken        |
+----------------------------------------------+
```

**Implementation:**
```tsx
{atRiskGoals.length > 0 && (
  <Paper className="card-default" p="md">
    <Text size="sm" fw={600} mb="sm">{T.dashboard.recommendedActions}</Text>
    <Stack gap="xs">
      {atRiskGoals.map(goal => (
        <Button
          key={goal.id}
          component={Link}
          to={`/session?mode=${goalActionConfig[goal.goal_type].mode}`}
          variant="light"
          color={goal.status === 'at_risk' ? 'orange' : 'red'}
          size="xs"
          fullWidth
          leftSection={<IconAlertTriangle size={14} />}
        >
          {goalActionConfig[goal.goal_type].label}
        </Button>
      ))}
    </Stack>
  </Paper>
)}
```

Compute `atRiskGoals`:
```tsx
const atRiskGoals = weeklyGoals.filter(g =>
  ['at_risk', 'off_track', 'missed'].includes(g.status) && goalActionConfig[g.goal_type]
)
```

**Files:** `src/pages/Dashboard.tsx`, `src/pages/Dashboard.module.css`, `src/lib/i18n.ts`
**Icons to add:** `IconAlertTriangle` from `@tabler/icons-react`

---

## Suggestion 3: Replace Progress List with a "Mastery Funnel"

**Verdict:** Defer to Progress page redesign

**Reasoning:**
- The redesign spec already removes the "Progress Snapshot" card from Dashboard entirely (Section "What to REMOVE from Dashboard", item 1). Stage breakdown data belongs on the Progress page.
- The redesign spec already specifies a "Vocabulary Pipeline" on the Progress page (Section 3) that is essentially this mastery funnel -- a `SimpleGrid cols={{ base: 3, sm: 5 }}` with stage blocks flowing left to right, warm-to-cool colors.
- Adding a funnel to the Dashboard contradicts the guiding principle: "Dashboard answers TODAY and THIS WEEK, Progress answers OVER TIME."

**What to do instead:**
- Implement the Vocabulary Pipeline on Progress exactly as specced in the redesign doc (Section 3).
- On Dashboard, replace the current progress snapshot with only a single-line summary if desired:

```tsx
<Text size="xs" c="dimmed">
  {itemsByStage.productive + itemsByStage.maintenance} {T.dashboard.usableWords} van {totalItems} {T.dashboard.totalLabel}
</Text>
```

This one-liner could sit beneath the Weekly Scorecard rings as context, without duplicating the full breakdown. Optional -- not required for v1.

**Files:** None for Dashboard. Progress page pipeline is already specced.

---

## Suggestion 4: Improve Secondary Actions

**Verdict:** Accept

**Conflicts:** None. The redesign spec's Quick Actions section (Section 5) already plans to add icon squares and improve visual hierarchy, but does not address urgency styling or showing the actual lesson title. These additions are compatible.

**Design spec:**

### 4a. Show actual next lesson title

Currently `getLessonsBasic()` returns only `id` and `order_index`. Change the Dashboard fetch to use `getLessons()` (which returns full `Lesson` objects including `title`) instead. This is a minimal change -- `getLessons()` already exists.

In `Dashboard.tsx`, replace:
```tsx
const [lessons] = await Promise.all([
  ...
  lessonService.getLessonsBasic(),
])
```
with:
```tsx
const [lessons] = await Promise.all([
  ...
  lessonService.getLessons(),
])
```

Add state for the continue lesson title:
```tsx
const [continueTitle, setContinueTitle] = useState<string | null>(null)
```

When computing the target lesson:
```tsx
if (target) {
  setContinueTitle(target.title.replace(/\s*\([^)]*\)/g, ''))
  // ... existing continueUrl logic
}
```

Display in the action card:
```tsx
<Text size="xs" c="dimmed" mt="4">
  {continueTitle ?? T.dashboard.nextLesson}
</Text>
```

Note: `stripBrackets` regex applied per design system convention.

### 4b. Urgency border on "Practice Weak Words" card

Add a CSS class that gives the weak-words card a subtle warning left border:

```css
/* Dashboard.module.css */
.weakWordsCard {
  composes: card-action from global;
  border-left: 3px solid var(--warning);
}
```

```tsx
<Link to="/session?weak=true" className={classes.weakWordsCard}>
  <Group justify="space-between" h="100%">
    <Group gap="sm">
      <Box className={classes.actionIcon} data-variant="warning">
        <IconAlertTriangle size={18} color="var(--warning)" />
      </Box>
      <Box>
        <Text size="sm" fw={500}>{T.dashboard.practiceWeak}</Text>
        <Text size="xs" c="dimmed" mt="4">{T.dashboard.reviewWeakItems}</Text>
      </Box>
    </Group>
    <IconChevronRight size={16} color="var(--text-tertiary)" />
  </Group>
</Link>
```

```css
/* Dashboard.module.css */
.actionIcon {
  width: 36px;
  height: 36px;
  border-radius: var(--r-sm);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.actionIcon[data-variant="continue"] {
  background: var(--accent-primary-subtle);
}

.actionIcon[data-variant="warning"] {
  background: var(--warning-subtle);
}
```

### 4c. Continue Lesson card (no urgency, clean style)

```css
/* Dashboard.module.css */
.continueCard {
  composes: card-action from global;
}
```

```tsx
<Link to={continueUrl} className={classes.continueCard}>
  <Group justify="space-between" h="100%">
    <Group gap="sm">
      <Box className={classes.actionIcon} data-variant="continue">
        <IconBook size={18} color="var(--accent-primary)" />
      </Box>
      <Box>
        <Text size="sm" fw={500}>{T.dashboard.continueLesson}</Text>
        <Text size="xs" c="dimmed" mt="4">
          {continueTitle ?? T.dashboard.nextLesson}
        </Text>
      </Box>
    </Group>
    <IconChevronRight size={16} color="var(--text-tertiary)" />
  </Group>
</Link>
```

**Files:** `src/pages/Dashboard.tsx`, `src/pages/Dashboard.module.css`
**Icons to add:** `IconBook`, `IconAlertTriangle` from `@tabler/icons-react`
**Service change:** Switch from `getLessonsBasic()` to `getLessons()` in Dashboard fetch

---

## Suggestion 5: Alignment with V2 Logic

**Verdict:** Accept item 1, Defer item 2

### 5a. Session plan reflects preferred session size -- ACCEPT

**Conflict:** None. The `todayPlan` is already computed using `profile.preferred_session_size` in `goalService.computeTodayPlan()`. The data is correct. The issue is purely a display concern: the hero card currently shows raw target numbers without context of how large the session is.

**Design spec:**

Add the user's preferred session size as context in the hero card. Display it as a subtitle under "Planning van vandaag":

```tsx
<Text size="xs" c="dimmed">
  {todayPlan.due_reviews_today_target + todayPlan.new_items_today_target} items --
  {T.dashboard.basedOnSessionSize.replace('{size}', String(profile?.preferredSessionSize ?? 15))}
</Text>
```

**i18n:**

| Key | NL | EN |
|-----|----|----|
| `dashboard.basedOnSessionSize` | `op basis van {size} items per sessie` | `based on {size} items per session` |

This makes it clear that "3 new items" is intentional when the session size is 15 (not a bug), and "12 new items" is expected when the session size is 50.

**Files:** `src/pages/Dashboard.tsx`, `src/lib/i18n.ts`

### 5b. Recognition vs Recall gap hint -- DEFER

**Reasoning:**
- The recognition/recall data (`skillStats.avgRecognition`, `skillStats.avgRecall`) is fetched via `learnerStateService.getSkillStatesBatch()` on the Progress page, not on Dashboard.
- The redesign spec explicitly moves memory strength to the Progress page (Section 5) and removes stage data from Dashboard.
- Adding a recall gap hint to Dashboard would re-introduce progress-page data, violating the "Dashboard = today/this week, Progress = over time" principle.
- The redesign spec already includes an insight text beneath the Memory Strength rings on Progress: "Your recall needs work. Try more typing exercises." This covers the suggestion.

**Alternative (optional, lightweight):** If a brief nudge is desired on Dashboard without fetching skill data, the `todayPlan` already biases toward recall when recall is weaker (via `recall_interactions_today_target`). A one-liner could note this:

```tsx
{todayPlan.recall_interactions_today_target > 0 && (
  <Text size="xs" c="dimmed" mt={4}>
    {T.dashboard.recallFocusHint}
  </Text>
)}
```

| Key | NL | EN |
|-----|----|----|
| `dashboard.recallFocusHint` | `Vandaag extra focus op actief herinneren` | `Extra focus on active recall today` |

This uses data already on the Dashboard (todayPlan) without an additional fetch. Optional for v1.

**Files:** `src/pages/Dashboard.tsx`, `src/lib/i18n.ts` (if optional hint is included)

---

## Implementation Order

1. **Suggestion 4** (Quick Actions) -- lowest risk, no layout conflicts, improves existing cards
2. **Suggestion 1** (Hero Layout) -- restructures hero card, aligns with redesign spec
3. **Suggestion 2** (Weekly Goals streamlining) -- depends on ring charts from redesign spec being built first
4. **Suggestion 5a** (Session size context) -- one-liner addition
5. **Suggestion 3** -- no Dashboard work; pipeline is part of Progress page redesign

---

## i18n Keys Summary

| Key | NL | EN |
|-----|----|----|
| `dashboard.statusOnTrack` | `Op schema` | `On track` |
| `dashboard.statusAtRisk` | `Risico` | `At risk` |
| `dashboard.statusAchieved` | `Behaald` | `Achieved` |
| `dashboard.statusBehind` | `Achter` | `Behind` |
| `dashboard.recommendedActions` | `Aanbevolen acties` | `Recommended actions` |
| `dashboard.basedOnSessionSize` | `op basis van {size} items per sessie` | `based on {size} items per session` |
| `dashboard.recallFocusHint` | `Vandaag extra focus op actief herinneren` | `Extra focus on active recall today` |
| `dashboard.newLabel` | `nieuw` | `new` |
| `dashboard.recallLabel` | `herinnering` | `recall` |
