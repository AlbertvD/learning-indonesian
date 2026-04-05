# Dashboard Mockup Implementation

Date: 2026-04-05
Status: Draft
Depends On: `2026-04-05-dashboard-progress-redesign.md`, `2026-04-05-dashboard-ux-improvements.md`, `2026-04-05-targeted-sessions.md`

## Goal

Implement the finalized dashboard mockup (`docs/mockups/dashboard-redesign.html`) by bridging the gap between the current `Dashboard.tsx` and the mockup. This spec covers new data requirements, derived state, service changes, component structure, i18n, and testing.

---

## 1. New Data Requirements

### 1a. Lapse count for rescue card

The mockup shows a "Red N woorden" rescue card with a lapse badge (e.g. "4 lapses"). This requires fetching items with high lapse counts from `learner_skill_state`.

**Data needed:** Count of distinct `learning_item_id` values where `lapse_count >= 3` for the current user. Also need the total lapse count for the badge text.

**Source:** `learner_skill_state.lapse_count` (already exists in schema, type `LearnerSkillState` already has `lapse_count: number`).

**New service method:** `learnerStateService.getLapsingItems(userId: string)` -- returns items at risk of being forgotten.

```typescript
async getLapsingItems(userId: string): Promise<{ count: number; items: LearnerSkillState[] }> {
  const { data, error } = await supabase
    .schema('indonesian')
    .from('learner_skill_state')
    .select('*')
    .eq('user_id', userId)
    .gte('lapse_count', 3)
    .order('lapse_count', { ascending: false })

  if (error) throw error
  // Deduplicate by learning_item_id (a single item may have multiple skill rows)
  const seen = new Set<string>()
  const unique = data.filter(s => {
    if (seen.has(s.learning_item_id)) return false
    seen.add(s.learning_item_id)
    return true
  })
  return { count: unique.length, items: unique }
}
```

### 1b. Mix ratio segments for hero card

The mockup shows a coloured bar with 4 segments: Herhalingen (reviews), Nieuw (new), Vragen (recall prompts), Zwak (weak). These values must be derived from `TodayPlan`.

**Current `TodayPlan` fields:**
- `due_reviews_today_target` (reviews)
- `new_items_today_target` (new)
- `recall_interactions_today_target` (recall/vragen)

**Missing:** Weak item count in today's plan. This is the number of due items that have `lapse_count >= 3` or `consecutive_failures >= 2`.

**Approach:** Extend `TodayPlan` with an optional `weak_items_target` field. Compute it in `goalService.computeTodayPlan()` by counting due skills that are "weak" (high lapse count).

```typescript
// Add to TodayPlan interface in src/types/learning.ts
export interface TodayPlan {
  due_reviews_today_target: number
  new_items_today_target: number
  recall_interactions_today_target: number
  estimated_minutes_today: number
  weak_items_target: number           // NEW
  preferred_session_size: number       // NEW -- needed for "op basis van N items" subtext
  explanatory_text?: string
}
```

### 1c. Goal-specific tooltip text and reason text

The mockup shows per-ring tooltip text (e.g. "Algoritme telt dagen met minstens 1 sessie deze week") and per-action-card reason text (e.g. "Je Recall score is 40% -- onder doel van 80%").

**Tooltip text:** Static per goal type. Handled via i18n keys, no new data needed.

**Action card reason text:** Dynamic, requires inserting current values into a template string. The data is already in `WeeklyGoal.current_value_numeric` and `WeeklyGoal.target_value_numeric`. Compute reason text in the Dashboard component as a pure derivation.

### 1d. CTA subtitle text

The mockup CTA button has a subtitle: "Doel: +8% Herinnering . Achterstand -> 0". This requires:
- The recall quality gap: `recallGoal.target_value_numeric - recallGoal.current_value_numeric` (already available from `weeklyGoals`)
- The overdue count: `reviewHealthGoal.current_value_numeric` (already available)

No new data fetch needed -- pure derivation from existing `weeklyGoals` array.

### 1e. Recognition vs recall split (tooltip)

The Herinnering ring tooltip says "Je herkenning (meerkeuze) is 90%, maar je actieve recall (typen) is slechts 40%." This requires recognition accuracy and recall accuracy separately.

**Current state:** `goalService.getRecallStats()` already fetches `form_recall` accuracy. Recognition accuracy is not currently fetched.

**New service method (goalService):** `getRecognitionStats(userId, goalSet)` -- mirrors `getRecallStats` but for `skill_type = 'recognition'`.

Alternatively, extend `getRecallStats` to return both:

```typescript
async getRecallAndRecognitionStats(userId: string, goalSet: WeeklyGoalSet): Promise<{
  recallAccuracy: number
  recallSampleSize: number
  recognitionAccuracy: number
  recognitionSampleSize: number
}> {
  const { data, error } = await supabase
    .schema('indonesian')
    .from('review_events')
    .select('was_correct, skill_type')
    .eq('user_id', userId)
    .in('skill_type', ['form_recall', 'recognition'])
    .gte('created_at', goalSet.week_starts_at_utc)
    .lt('created_at', goalSet.week_ends_at_utc)

  if (error) throw error

  const recall = data.filter(e => e.skill_type === 'form_recall')
  const recognition = data.filter(e => e.skill_type === 'recognition')

  return {
    recallAccuracy: recall.length > 0 ? recall.filter(e => e.was_correct).length / recall.length : 0,
    recallSampleSize: recall.length,
    recognitionAccuracy: recognition.length > 0 ? recognition.filter(e => e.was_correct).length / recognition.length : 0,
    recognitionSampleSize: recognition.length,
  }
}
```

**Where to expose:** Add `recognition_accuracy` and `recall_accuracy` to the `recall_quality` goal's `goal_config_jsonb` field during `refreshGoalProgress`, so Dashboard can read them without an extra fetch.

---

## 2. New Props / Derived State

All computed in `Dashboard.tsx` (or a helper module) from existing + new data:

### 2a. Ring chart percentage per goal

```typescript
function goalToRingPercent(goal: WeeklyGoal): number {
  if (goal.goal_type === 'review_health') {
    // "at_most" direction: lower is better. Ring shows "health" not "overdue"
    // If current <= target, ring is 100%. If 2x target, ring is 0%.
    if (goal.target_value_numeric === 0) return goal.current_value_numeric === 0 ? 100 : 0
    return Math.max(0, Math.min(100, Math.round((1 - goal.current_value_numeric / (goal.target_value_numeric * 2)) * 100)))
  }
  // "at_least" direction: higher is better
  if (goal.target_value_numeric === 0) return 0
  return Math.min(100, Math.round((goal.current_value_numeric / goal.target_value_numeric) * 100))
}
```

### 2b. Ring color per goal status

```typescript
const ringColor: Record<GoalStatus, string> = {
  achieved: 'green',   // var(--success)
  on_track: 'blue',    // var(--blue)
  at_risk: 'orange',   // var(--warning)
  missed: 'red',       // var(--danger)
}
```

### 2c. Mix bar segments

```typescript
interface MixSegment {
  label: string   // i18n key
  value: number   // absolute count
  percent: number // percentage of total
  color: string   // hex or CSS variable
}

function computeMixSegments(plan: TodayPlan): MixSegment[] {
  const total = plan.due_reviews_today_target + plan.new_items_today_target
                + plan.recall_interactions_today_target + plan.weak_items_target
  if (total === 0) return []

  // Reviews = due minus weak (weak are a subset of due reviews)
  const reviewCount = Math.max(0, plan.due_reviews_today_target - plan.weak_items_target)

  return [
    { label: 'reviews',  value: reviewCount,                            percent: (reviewCount / total) * 100,                            color: '#1971c2' },
    { label: 'new',      value: plan.new_items_today_target,            percent: (plan.new_items_today_target / total) * 100,            color: '#2f9e44' },
    { label: 'recall',   value: plan.recall_interactions_today_target,  percent: (plan.recall_interactions_today_target / total) * 100,  color: '#9c36b5' },
    { label: 'weak',     value: plan.weak_items_target,                 percent: (plan.weak_items_target / total) * 100,                 color: '#e67700' },
  ].filter(s => s.value > 0)
}
```

### 2d. Action card reason text

```typescript
function getActionReason(goal: WeeklyGoal, T: any): string {
  const fmt = (v: number, type: string) =>
    type === 'recall_quality' ? `${Math.round(v * 100)}%` : `${Math.round(v)}`

  switch (goal.goal_type) {
    case 'recall_quality':
      return T.dashboard.actionReasonRecall
        .replace('{current}', fmt(goal.current_value_numeric, goal.goal_type))
        .replace('{target}', fmt(goal.target_value_numeric, goal.goal_type))
    case 'usable_vocabulary':
      return T.dashboard.actionReasonVocab
        .replace('{current}', fmt(goal.current_value_numeric, goal.goal_type))
        .replace('{target}', fmt(goal.target_value_numeric, goal.goal_type))
    case 'review_health':
      return T.dashboard.actionReasonBacklog
        .replace('{current}', fmt(goal.current_value_numeric, goal.goal_type))
    case 'consistency':
      return T.dashboard.actionReasonConsistency
        .replace('{current}', fmt(goal.current_value_numeric, goal.goal_type))
        .replace('{target}', fmt(goal.target_value_numeric, goal.goal_type))
    default:
      return ''
  }
}
```

### 2e. CTA subtitle

```typescript
function getCtaSubtitle(weeklyGoals: WeeklyGoal[], T: any): string {
  const recall = weeklyGoals.find(g => g.goal_type === 'recall_quality')
  const health = weeklyGoals.find(g => g.goal_type === 'review_health')

  const parts: string[] = []
  if (recall && recall.status !== 'achieved') {
    const gap = Math.round((recall.target_value_numeric - recall.current_value_numeric) * 100)
    if (gap > 0) parts.push(`+${gap}% ${T.dashboard.recallQualityShort}`)
  }
  if (health && health.current_value_numeric > 0) {
    parts.push(`${T.dashboard.backlog} -> 0`)
  }
  return parts.length > 0 ? `${T.dashboard.goal}: ${parts.join(' . ')}` : ''
}
```

### 2f. Mix note text

```typescript
function getMixNote(plan: TodayPlan, T: any): string | null {
  if (plan.weak_items_target > 0 && plan.new_items_today_target < 3) {
    return T.dashboard.mixNoteBacklog  // "Nieuwe woorden gereduceerd -- achterstand wordt weggewerkt"
  }
  return null
}
```

### 2g. Lapsing items state

```typescript
const [lapsingCount, setLapsingCount] = useState(0)
```

Set from `learnerStateService.getLapsingItems(user.id)` during the `fetchData` effect.

---

## 3. Service Changes

### 3a. `learnerStateService.ts` -- new method

```typescript
async getLapsingItems(userId: string): Promise<{ count: number }> {
  // Items with lapse_count >= 3 across any skill
  const { data, error } = await supabase
    .schema('indonesian')
    .from('learner_skill_state')
    .select('learning_item_id')
    .eq('user_id', userId)
    .gte('lapse_count', 3)

  if (error) throw error
  const unique = new Set(data.map(d => d.learning_item_id))
  return { count: unique.size }
}
```

### 3b. `goalService.ts` -- extend `computeTodayPlan`

Add `weak_items_target` and `preferred_session_size` to the returned `TodayPlan`:

```typescript
// Inside computeTodayPlan, after computing dueTarget:
const weakDue = skills.filter(s =>
  new Date(s.next_due_at) <= now && s.lapse_count >= 3
)
const weakUniqueItems = new Set(weakDue.map(s => s.learning_item_id))
const weakTarget = Math.min(weakUniqueItems.size, Math.ceil(dueTarget * 0.2))

return {
  due_reviews_today_target: dueTarget,
  new_items_today_target: newTarget,
  recall_interactions_today_target: recallTargetToday,
  estimated_minutes_today: estimatedMinutes,
  weak_items_target: weakTarget,
  preferred_session_size: preferredSize,
}
```

Note: The `learner_skill_state` select in `computeTodayPlan` already fetches `skill_type` and `next_due_at`. Add `lapse_count` to the select:

```typescript
.select('next_due_at, skill_type, mean_latency_ms, lapse_count, learning_item_id')
```

### 3c. `goalService.ts` -- store recognition/recall split

In `refreshGoalProgress`, when processing the `recall_quality` goal, call the new `getRecallAndRecognitionStats` and store both values in `goal_config_jsonb`:

```typescript
else if (goal.goal_type === 'recall_quality') {
  const stats = await this.getRecallAndRecognitionStats(userId, goalSet)
  currentVal = stats.recallAccuracy
  sampleSize = stats.recallSampleSize
  // Store for tooltip display
  goalConfigJsonb = {
    recognition_accuracy: stats.recognitionAccuracy,
    recall_accuracy: stats.recallAccuracy,
    recognition_sample_size: stats.recognitionSampleSize,
  }
  // ... rest of provisional/status logic
}
```

Update the `.update()` call to include `goal_config_jsonb: goalConfigJsonb`.

### 3d. `types/learning.ts` -- extend `TodayPlan`

Add two fields:

```typescript
export interface TodayPlan {
  due_reviews_today_target: number
  new_items_today_target: number
  recall_interactions_today_target: number
  estimated_minutes_today: number
  weak_items_target: number
  preferred_session_size: number
  explanatory_text?: string
}
```

---

## 4. Component Structure

### 4a. `RingCard` sub-component

**File:** Inline in `Dashboard.tsx` or extracted to `src/components/dashboard/RingCard.tsx` if it exceeds 50 lines.

```typescript
interface RingCardProps {
  percent: number           // 0-100
  color: string             // Mantine color name: 'green' | 'blue' | 'orange' | 'red'
  label: string             // e.g. "Consistentie"
  value: string             // e.g. "1 / 4" or "72% / 80%"
  status: GoalStatus
  statusLabel: string       // i18n'd status text
  tooltipText: string       // "Hoe werkt dit?" tooltip content
  isProvisional?: boolean
}
```

Uses Mantine `RingProgress` (size=80, thickness=6, roundCaps) with a `Text` center label showing `percent%`. Below the ring: label, value, status pill. An info icon with `Tooltip` in the bottom-right corner.

### 4b. `ActionCard` sub-component

```typescript
interface ActionCardProps {
  icon: React.ReactNode
  title: string             // e.g. "Korte sessie"
  focus: string             // e.g. "Focus op Herinnering"
  reason: string            // e.g. "Je Recall score is 40% -- onder doel van 80%"
  href: string              // e.g. "/session?mode=recall_sprint"
  variant: 'amber' | 'teal' // determines border-left color and icon background
}
```

Renders as a `Link` with left-colored border, icon box, body text, and chevron.

### 4c. `HeroCard` sub-component

```typescript
interface HeroCardProps {
  plan: TodayPlan
  mixSegments: MixSegment[]
  mixNote: string | null
  ctaSubtitle: string
  onStart: () => void
  T: any
}
```

Renders:
1. Title "Planning van vandaag"
2. Stat row with icons (reviews, new, recall prompts)
3. Subtext "op basis van N items per sessie"
4. Mix ratio bar + legend
5. CTA button with two lines
6. Post-session note

### 4d. `RescueCard` sub-component

```typescript
interface RescueCardProps {
  lapseCount: number
  T: any
}
```

Renders only when `lapseCount > 0`. Red left-border card with lapse badge, warning icon, title "Red N woorden", and subtitle.

### 4e. `SecondaryCard` sub-component

```typescript
interface SecondaryCardProps {
  icon: React.ReactNode
  title: string
  subtitle: string
  href: string
  variant?: 'default' | 'rescue'
  badge?: React.ReactNode
}
```

Shared between "Continue Lesson" and "Rescue" cards.

### Overall Dashboard structure

```
Dashboard
  WelcomeBar (inline -- name + streak)
  Section "Deze week"
    SimpleGrid cols={{ base: 2, sm: 4 }}
      RingCard x4
  Section "Aanbevolen acties" (conditional: only if atRiskGoals.length > 0)
    ActionCard x N
  Section hero
    HeroCard
  Section secondary
    SimpleGrid cols={2}
      SecondaryCard (Continue Lesson)
      RescueCard (conditional: only if lapseCount > 0) | SecondaryCard (Practice Weak -- fallback)
```

**Removed sections:**
- "Progress snapshot" (items by stage) -- moved to Progress page per redesign spec

---

## 5. CSS Changes

### 5a. New CSS classes in `Dashboard.module.css`

```css
/* Ring card grid */
.scorecardGrid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
}

@media (max-width: 600px) {
  .scorecardGrid {
    grid-template-columns: repeat(2, 1fr);
  }
}

.ringCard {
  background: var(--card-bg);
  border: 1px solid var(--card-border);
  border-radius: var(--r-md);
  padding: 16px 12px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  position: relative;
}

/* Status pill */
.statusPill { ... }  /* already specced in dashboard-ux-improvements.md */

/* Action cards */
.actionCardAmber {
  border-left: 3px solid var(--warning);
}

.actionCardTeal {
  border-left: 3px solid var(--accent-primary);
}

/* Mix bar */
.mixBar {
  display: flex;
  width: 100%;
  height: 8px;
  border-radius: 4px;
  overflow: hidden;
}

.mixBarSegment {
  height: 100%;
  transition: width 0.3s ease;
}

/* Rescue card */
.rescueCard {
  border-left: 3px solid var(--danger);
  background: var(--danger-subtle);
}

.lapseBadge {
  position: absolute;
  top: 10px;
  right: 12px;
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: var(--r-xl);
  background: var(--danger-subtle);
  color: var(--danger);
  font-size: var(--fs-xs);
  font-weight: 600;
}

/* Hero card -- update gradient to match mockup */
.heroCard {
  background: linear-gradient(135deg, #0c8599 0%, #1a2a3a 60%, var(--surface, var(--card-bg)) 100%) !important;
  border: 1px solid rgba(21,170,191,0.25) !important;
}

/* Hero CTA two-line button */
.heroCta {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.heroCtaSub {
  font-size: 0.75rem;
  opacity: 0.75;
  font-weight: 500;
}
```

### 5b. Light theme overrides

All new card styles need light-theme variants following the existing pattern in `Dashboard.module.css`.

---

## 6. i18n Requirements

### New keys to add to `src/lib/i18n.ts`

| Key | NL | EN |
|-----|----|----|
| `dashboard.consistency` | `Consistentie` | `Consistency` |
| `dashboard.recallQualityShort` | `Herinnering` | `Recall` |
| `dashboard.vocabGrowth` | `Woordenschat` | `Vocabulary` |
| `dashboard.backlog` | `Achterstand` | `Backlog` |
| `dashboard.statusOnTrack` | `Op schema` | `On track` |
| `dashboard.statusAtRisk` | `Risico` | `At risk` |
| `dashboard.statusAchieved` | `Behaald` | `Achieved` |
| `dashboard.statusBehind` | `Achter` | `Behind` |
| `dashboard.recommendedActions` | `Aanbevolen acties` | `Recommended actions` |
| `dashboard.basedOnSessionSize` | `op basis van {size} items per sessie` | `based on {size} items per session` |
| `dashboard.sessionComposition` | `Sessie samenstelling` | `Session composition` |
| `dashboard.mixReviews` | `Herhalingen` | `Reviews` |
| `dashboard.mixNew` | `Nieuw` | `New` |
| `dashboard.mixRecall` | `Vragen` | `Prompts` |
| `dashboard.mixWeak` | `Zwak` | `Weak` |
| `dashboard.mixNoteBacklog` | `Nieuwe woorden gereduceerd -- achterstand wordt weggewerkt` | `New words reduced -- clearing backlog` |
| `dashboard.goal` | `Doel` | `Goal` |
| `dashboard.rescueTitle` | `Red {count} woorden` | `Rescue {count} words` |
| `dashboard.rescueSubtitle` | `Voor je ze vergeet -- {count} woorden dreigen terug te vallen` | `Before you forget -- {count} words at risk of falling back` |
| `dashboard.lapses` | `lapses` | `lapses` |
| `dashboard.actionReasonRecall` | `Je Recall score is {current} -- onder doel van {target}` | `Your recall score is {current} -- below target of {target}` |
| `dashboard.actionReasonVocab` | `{current} van {target} woorden behaald -- bijna op doel!` | `{current} of {target} words achieved -- almost there!` |
| `dashboard.actionReasonBacklog` | `{current} items wachten op herhaling` | `{current} items waiting for review` |
| `dashboard.actionReasonConsistency` | `{current} van {target} dagen gestudeerd` | `{current} of {target} days studied` |
| `dashboard.focusRecall` | `Focus op Herinnering` | `Focus on Recall` |
| `dashboard.focusVocab` | `Nieuwe woorden toevoegen` | `Add new words` |
| `dashboard.focusBacklog` | `Achterstand wegwerken` | `Clear backlog` |
| `dashboard.focusConsistency` | `Snel oefenen` | `Quick practice` |
| `dashboard.tooltipConsistency` | `Algoritme telt dagen met minstens 1 sessie deze week` | `Counts days with at least 1 session this week` |
| `dashboard.tooltipRecall` | `Je herkenning (meerkeuze) is {recognition}%, maar je actieve recall (typen) is slechts {recall}%. De sessie van vandaag richt zich op recall om dit gat te dichten.` | `Your recognition (multiple choice) is {recognition}%, but your active recall (typing) is only {recall}%. Today's session focuses on recall to close this gap.` |
| `dashboard.tooltipRecallBalanced` | `Gemiddelde nauwkeurigheid van herinnerings-oefeningen deze week` | `Average accuracy of recall exercises this week` |
| `dashboard.tooltipBacklog` | `Aantal items dat langer dan gepland wacht op herhaling` | `Number of items waiting longer than scheduled for review` |
| `dashboard.tooltipVocab` | `Items die de Verankering fase voorbij zijn (Ophalen, Productief of Stabiel). Je hebt {current} van de {target} woorden op dit niveau.` | `Items past the Anchoring stage (Retrieving, Productive, or Stable). You have {current} of {target} words at this level.` |
| `dashboard.howDoesThisWork` | `Hoe werkt dit?` | `How does this work?` |
| `dashboard.postSessionNote` | `Na de sessie worden je doelenringen bijgewerkt` | `After the session your goal rings will be updated` |
| `dashboard.newLabel` | `nieuw` | `new` |
| `dashboard.recallLabel` | `herinneringsvragen` | `recall prompts` |

---

## 7. Verification Requirements

### Critical behaviours to test

1. **Ring renders correct percentage for each goal type** including the inverted logic for `review_health` (at_most direction)
2. **Ring color matches goal status** (green=achieved, blue=on_track, orange=at_risk, red=missed)
3. **Rescue card appears only when lapseCount > 0** and is hidden otherwise
4. **Action cards appear only when at least one goal has status `at_risk` or `missed`** and the section title "Aanbevolen acties" is hidden when all goals are healthy
5. **Action card reason text contains interpolated values** (e.g. "40%" and "80%" for recall)
6. **Mix bar segments sum to 100%** and are proportional to plan values
7. **CTA subtitle shows recall gap and backlog info** only when relevant
8. **Hero card shows "op basis van N items per sessie"** using actual preferred session size
9. **Tooltip for recall ring shows recognition vs recall split** when data is available
10. **"Progress Snapshot" section is removed** -- no stage breakdown bars on Dashboard

### Edge cases

- All goals achieved: no action cards shown, all rings green, CTA subtitle is empty
- Zero lapse items: rescue card hidden, "Practice Weak" secondary card shown as fallback
- Provisional goal: shows `(?)` indicator on ring label
- No TodayPlan (null): shows "no reviews due" empty state instead of hero card
- All mix segments zero: mix bar hidden entirely
- Single at-risk goal: only one action card shown

---

## Supabase Requirements

### Schema changes

N/A -- no new tables or columns needed. `learner_skill_state.lapse_count` already exists. `learner_weekly_goals.goal_config_jsonb` already exists as a JSONB column.

### homelab-configs changes

- [ ] PostgREST: N/A -- no new schema exposure needed
- [ ] Kong: N/A -- no new CORS origins
- [ ] Storage: N/A -- no new buckets

### Health check additions

N/A -- no new tables or RPC functions to verify.
