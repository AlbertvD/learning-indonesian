# Dashboard Redesign — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Rewrite `Dashboard.tsx` to match the finalized mockup at `docs/mockups/dashboard-redesign.html`, replacing flat progress bars with CSS ring charts, adding data-driven action cards, a mix-ratio bar in the hero card, and a conditional rescue card.

**Architecture:** All new UI is in `Dashboard.tsx` and `Dashboard.module.css` (ring cards, action cards, hero card, secondary/rescue cards). Service layer gets three additions: `getLapsingItems` on `learnerStateService`, `weak_items_target` + `preferred_session_size` in `TodayPlan`, and recognition/recall accuracy split stored in `goal_config_jsonb`. No schema changes needed — all required columns already exist.

**Tech Stack:** React 19 + TypeScript, Mantine v8 (`RingProgress`, `Tooltip`, `SimpleGrid`, `Paper`), CSS Modules with conic-gradient rings, Tabler Icons, Zustand 5 auth store, Vitest + @testing-library/react.

**Design references:**
- Mockup: `docs/mockups/dashboard-redesign.html`
- Technical spec: `docs/plans/2026-04-05-dashboard-mockup-implementation-design.md`
- Visual spec: produced by UI designer agent (ring CSS, colour mapping, component props — see spec doc)

**Test file:** `src/__tests__/dashboard-redesign.test.tsx` — **already written**. Each task below references which tests it makes pass.

---

## Task 1: Extend TodayPlan type

**Files:**
- Modify: `src/types/learning.ts:265-271`

**Step 1: Update the interface**

Replace the existing `TodayPlan` interface (lines 265–271):

```typescript
export interface TodayPlan {
  due_reviews_today_target: number
  new_items_today_target: number
  recall_interactions_today_target: number
  estimated_minutes_today: number
  weak_items_target: number       // items with lapse_count >= 3 in today's session
  preferred_session_size: number  // echoed back from profile, used for "op basis van N" subtext
  explanatory_text?: string
}
```

**Step 2: Run the type checker**

```bash
bun run build 2>&1 | grep "error TS" | head -20
```

Expected: errors only in `goalService.ts` (return type mismatch, fixed next task). No errors in other files.

**Step 3: Run tests**

```bash
bun run test 2>&1 | tail -10
```

Expected: 153 tests still passing (new test file fails are expected — they reference types not yet implemented).

**Step 4: Commit**

```bash
git add src/types/learning.ts
git commit -m "feat: extend TodayPlan with weak_items_target and preferred_session_size"
```

---

## Task 2: Update goalService — weak items + preferred size + recognition/recall split

**Files:**
- Modify: `src/services/goalService.ts`

### Step 1: Update `computeTodayPlan` select to include lapse_count and learning_item_id

Find the select in `computeTodayPlan` (currently line ~527):

```typescript
const { data: skills, error } = await supabase
  .schema('indonesian')
  .from('learner_skill_state')
  .select('next_due_at, skill_type, mean_latency_ms, lapse_count, learning_item_id')
  .eq('user_id', userId)
```

### Step 2: Compute `weak_items_target` and add to return

After the `recallTargetToday` computation, add:

```typescript
// Weak items: due skills with lapse_count >= 3, capped at 20% of due target
const weakDue = skills.filter(s =>
  new Date(s.next_due_at) <= now && (s.lapse_count ?? 0) >= 3
)
const weakUniqueItems = new Set(weakDue.map(s => s.learning_item_id))
const weakTarget = Math.min(weakUniqueItems.size, Math.ceil(dueTarget * 0.2))
```

Then update the return statement:

```typescript
return {
  due_reviews_today_target: dueTarget,
  new_items_today_target: newTarget,
  recall_interactions_today_target: recallTargetToday,
  estimated_minutes_today: estimatedMinutes,
  weak_items_target: weakTarget,
  preferred_session_size: preferredSize,
}
```

### Step 3: Add `getRecallAndRecognitionStats` method

Add after the existing `getRecallStats` method:

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
    recallAccuracy: recall.length > 0
      ? recall.filter(e => e.was_correct).length / recall.length
      : 0,
    recallSampleSize: recall.length,
    recognitionAccuracy: recognition.length > 0
      ? recognition.filter(e => e.was_correct).length / recognition.length
      : 0,
    recognitionSampleSize: recognition.length,
  }
},
```

### Step 4: Update `refreshGoalProgress` to store recognition/recall split in `recall_quality` goal

In `refreshGoalProgress`, replace the existing `else if (goal.goal_type === 'recall_quality')` block:

```typescript
else if (goal.goal_type === 'recall_quality') {
  const stats = await this.getRecallAndRecognitionStats(userId, goalSet)
  currentVal = stats.recallAccuracy
  sampleSize = stats.recallSampleSize
  isProvisional = sampleSize < 10
  if (isProvisional) provisionalReason = 'Low sample size'
  status = this.computeRecallStatus(currentVal, goal.target_value_numeric, sampleSize)
  // Store both values for the ring tooltip
  goalConfigJsonb = {
    recognition_accuracy: stats.recognitionAccuracy,
    recall_accuracy: stats.recallAccuracy,
    recognition_sample_size: stats.recognitionSampleSize,
  }
}
```

You also need to declare `goalConfigJsonb` at the top of the `for` loop and include it in the `.update()` call:

```typescript
let goalConfigJsonb: Record<string, unknown> | null = null
// ... (existing declarations for currentVal, sampleSize, etc.)
```

In the `.update()` call, add `goal_config_jsonb: goalConfigJsonb` only when it's non-null:

```typescript
const updatePayload: Record<string, unknown> = {
  current_value_numeric: currentVal,
  status,
  sample_size: sampleSize,
  is_provisional: isProvisional,
  provisional_reason: provisionalReason,
  updated_at: new Date().toISOString()
}
if (goalConfigJsonb !== null) updatePayload.goal_config_jsonb = goalConfigJsonb

const { data: updatedGoal, error } = await supabase
  .schema('indonesian')
  .from('learner_weekly_goals')
  .update(updatePayload)
  .eq('id', goal.id)
  .select()
  .single()
```

### Step 5: Run tests

```bash
bun run test 2>&1 | tail -10
```

Expected: 153 tests passing.

### Step 6: Commit

```bash
git add src/services/goalService.ts
git commit -m "feat: add weak_items_target, preferred_session_size, and recognition/recall split to goal service"
```

---

## Task 3: Add `getLapsingItems` to learnerStateService

**Files:**
- Modify: `src/services/learnerStateService.ts`

### Step 1: Add the method

Find the end of the `learnerStateService` object and add:

```typescript
async getLapsingItems(userId: string): Promise<{ count: number }> {
  const { data, error } = await supabase
    .schema('indonesian')
    .from('learner_skill_state')
    .select('learning_item_id')
    .eq('user_id', userId)
    .gte('lapse_count', 3)

  if (error) throw error
  const unique = new Set(data.map(d => d.learning_item_id))
  return { count: unique.size }
},
```

### Step 2: Run tests

```bash
bun run test 2>&1 | tail -10
```

Expected: 153 tests passing.

### Step 3: Commit

```bash
git add src/services/learnerStateService.ts
git commit -m "feat: add getLapsingItems to learnerStateService"
```

---

## Task 4: Add new i18n translation keys

**Files:**
- Modify: `src/lib/i18n.ts`

### Step 1: Add all new keys to both `nl` and `en` dashboard sections

Find the `dashboard:` section in the i18n file and add the following keys to **both** language objects. Add them after the existing keys.

**Dutch (nl):**
```typescript
// Ring card labels
consistencyLabel: 'Consistentie',
recallQualityLabel: 'Herinnering',
reviewHealthLabel: 'Achterstand',
vocabGrowthLabel: 'Woordenschat',
// Status pills
statusAchieved: 'Behaald',
statusOnTrack: 'Op schema',
statusAtRisk: 'Risico',
statusMissed: 'Gemist',
statusProvisional: 'Voorlopig',
// Ring tooltips
howDoesThisWork: 'Hoe werkt dit?',
tooltipConsistency: 'Algoritme telt dagen met minstens 1 sessie deze week',
tooltipRecall: 'Je herkenning (meerkeuze) is {recognition}%, maar je actieve recall (typen) is slechts {recall}%. De sessie van vandaag richt zich op recall om dit gat te dichten.',
tooltipRecallBalanced: 'Gemiddelde nauwkeurigheid van herinnerings-oefeningen deze week',
tooltipBacklog: 'Aantal items dat langer dan gepland wacht op herhaling',
tooltipVocab: "Items die de 'Verankering' fase voorbij zijn (Ophalen, Productief of Stabiel). Je hebt {current} van de {target} woorden op dit niveau.",
// Recommended actions section
recommendedActions: 'Aanbevolen acties',
actionReasonRecall: 'Je Recall score is {current} — onder doel van {target}',
actionReasonVocab: '{current} van {target} woorden behaald — bijna op doel!',
actionReasonBacklog: '{current} items wachten op herhaling',
actionReasonConsistency: '{current} van {target} dagen gestudeerd',
focusRecall: 'Focus op Herinnering',
focusVocab: 'Nieuwe woorden toevoegen',
focusBacklog: 'Achterstand wegwerken',
focusConsistency: 'Snel oefenen',
// Hero card
basedOnSessionSize: 'op basis van {size} items per sessie',
sessionComposition: 'Sessie samenstelling',
mixReviews: 'Herhalingen',
mixNew: 'Nieuw',
mixRecall: 'Vragen',
mixWeak: 'Zwak',
mixNoteBacklog: 'Nieuwe woorden gereduceerd — achterstand wordt weggewerkt',
goalLabel: 'Doel',
recallQualityShort: 'Herinnering',
postSessionNote: 'Na de sessie worden je doelenringen bijgewerkt',
reviewsLabel: 'herhalingen',
newLabel: 'nieuw',
recallLabel: 'herinneringsvragen',
// Rescue card
rescueTitle: 'Red {count} woorden',
rescueSubtitle: 'Voor je ze vergeet — {count} woorden dreigen terug te vallen',
lapsesLabel: 'lapses',
```

**English (en):** (same keys, translated)
```typescript
consistencyLabel: 'Consistency',
recallQualityLabel: 'Recall',
reviewHealthLabel: 'Backlog',
vocabGrowthLabel: 'Vocabulary',
statusAchieved: 'Achieved',
statusOnTrack: 'On track',
statusAtRisk: 'At risk',
statusMissed: 'Missed',
statusProvisional: 'Provisional',
howDoesThisWork: 'How does this work?',
tooltipConsistency: 'Counts days with at least 1 session this week',
tooltipRecall: 'Your recognition (multiple choice) is {recognition}%, but your active recall (typing) is only {recall}%. Today\'s session focuses on recall to close this gap.',
tooltipRecallBalanced: 'Average accuracy of recall exercises this week',
tooltipBacklog: 'Number of items waiting longer than scheduled for review',
tooltipVocab: "Items past the 'Anchoring' stage (Retrieving, Productive, or Stable). You have {current} of {target} words at this level.",
recommendedActions: 'Recommended actions',
actionReasonRecall: 'Your recall score is {current} — below target of {target}',
actionReasonVocab: '{current} of {target} words achieved — almost there!',
actionReasonBacklog: '{current} items waiting for review',
actionReasonConsistency: '{current} of {target} days studied',
focusRecall: 'Focus on Recall',
focusVocab: 'Add new words',
focusBacklog: 'Clear backlog',
focusConsistency: 'Quick practice',
basedOnSessionSize: 'based on {size} items per session',
sessionComposition: 'Session composition',
mixReviews: 'Reviews',
mixNew: 'New',
mixRecall: 'Prompts',
mixWeak: 'Weak',
mixNoteBacklog: 'New words reduced — clearing backlog',
goalLabel: 'Goal',
recallQualityShort: 'Recall',
postSessionNote: 'After the session your goal rings will be updated',
reviewsLabel: 'reviews',
newLabel: 'new',
recallLabel: 'recall prompts',
rescueTitle: 'Rescue {count} words',
rescueSubtitle: 'Before you forget — {count} words at risk of falling back',
lapsesLabel: 'lapses',
```

### Step 2: Run type checker

```bash
bun run build 2>&1 | grep "error TS" | head -20
```

Expected: no type errors in i18n.ts.

### Step 3: Commit

```bash
git add src/lib/i18n.ts
git commit -m "feat: add i18n keys for dashboard redesign (ring cards, action cards, hero, rescue)"
```

---

## Task 5: Add CSS design token for mix recall colour

**Files:**
- Modify: `src/main.tsx` (or wherever `cssVariablesResolver` tokens are defined — check `src/styles/cssVariablesResolver.ts`)

### Step 1: Find where design tokens are defined

```bash
grep -n "mix-recall\|warning-subtle\|danger-subtle" src/styles/cssVariablesResolver.ts | head -5
```

### Step 2: Add the purple token

In `cssVariablesResolver.ts`, in the `variables` (theme-agnostic) section, add:

```typescript
'--mix-recall': '#9c36b5',
```

This is the purple used for the "Vragen" (recall prompts) segment in the mix ratio bar. It stays the same in both light and dark mode.

### Step 3: Commit

```bash
git add src/styles/cssVariablesResolver.ts
git commit -m "feat: add --mix-recall design token for session composition bar"
```

---

## Task 6: Add ring chart CSS to Dashboard.module.css

**Files:**
- Modify: `src/pages/Dashboard.module.css`

### Step 1: Add ring card classes

At the **end** of `Dashboard.module.css`, append the following (keep all existing classes unchanged — the old ones will be deleted in Task 10 after the render tree is rewired):

```css
/* ─── Ring Scorecard ─── */

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

.ringWrapper {
  position: relative;
  width: 80px;
  height: 80px;
}

.ringBg {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  background: conic-gradient(var(--card-border) 0deg, var(--card-border) 360deg);
  -webkit-mask: radial-gradient(farthest-side, transparent calc(100% - 6px), #000 calc(100% - 6px));
  mask: radial-gradient(farthest-side, transparent calc(100% - 6px), #000 calc(100% - 6px));
}

.ringFill {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  background: conic-gradient(var(--ring-color) 0deg, var(--ring-color) var(--ring-deg), transparent var(--ring-deg));
  -webkit-mask: radial-gradient(farthest-side, transparent calc(100% - 6px), #000 calc(100% - 6px));
  mask: radial-gradient(farthest-side, transparent calc(100% - 6px), #000 calc(100% - 6px));
}

.ringCenter {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: var(--fs-lg);
  font-weight: 700;
  color: var(--text-primary);
}

.ringLabel {
  font-size: var(--fs-xs);
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.3px;
  text-align: center;
}

.ringValue {
  font-size: var(--fs-sm);
  color: var(--text-secondary);
  text-align: center;
}

.statusPill {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 20px;
  font-size: var(--fs-xs);
  font-weight: 600;
  line-height: 1.4;
}

.statusPillAchieved { background: var(--success-subtle); color: var(--success); }
.statusPillOnTrack  { background: var(--accent-primary-subtle); color: var(--accent-primary); }
.statusPillAtRisk   { background: var(--warning-subtle); color: var(--warning); }
.statusPillMissed   { background: var(--danger-subtle); color: var(--danger); }

.ringInfoTrigger {
  position: absolute;
  bottom: 6px;
  right: 8px;
  font-size: var(--fs-xs);
  color: var(--text-secondary);
  opacity: 0.5;
  cursor: help;
  display: flex;
  align-items: center;
  gap: 2px;
  transition: opacity 0.15s ease;
}

.ringInfoTrigger:hover { opacity: 1; }

/* ─── Action Cards ─── */

.actionCardList {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.actionCardBase {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 16px;
  background: var(--card-bg);
  border: 1px solid var(--card-border);
  border-radius: var(--r-md);
  cursor: pointer;
  transition: all 0.2s ease;
  text-decoration: none;
  color: inherit;
}

.actionCardBase:hover {
  background: var(--card-hover-bg);
  transform: translateY(-1px);
}

.actionCardAmberBorder { border-left: 3px solid var(--warning); }
.actionCardAmberBorder:hover { border-left: 3px solid var(--warning); }

.actionCardTealBorder { border-left: 3px solid var(--accent-primary); }
.actionCardTealBorder:hover { border-left: 3px solid var(--accent-primary); }

.actionCardRedBorder { border-left: 3px solid var(--danger); }
.actionCardRedBorder:hover { border-left: 3px solid var(--danger); }

.actionCardIconBox {
  width: 40px;
  height: 40px;
  border-radius: var(--r-sm);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.actionCardIconAmber { background: var(--warning-subtle); }
.actionCardIconTeal  { background: var(--accent-primary-subtle); }
.actionCardIconRed   { background: var(--danger-subtle); }

.actionCardBody { flex: 1; min-width: 0; }

.actionCardTitle {
  font-size: var(--fs-md);
  font-weight: 700;
  color: var(--text-primary);
  margin-bottom: 2px;
}

.actionCardFocus {
  font-size: var(--fs-sm);
  font-weight: 600;
  color: var(--text-secondary);
}

.actionCardReason {
  font-size: var(--fs-xs);
  color: var(--text-secondary);
  opacity: 0.7;
  margin-top: 2px;
}

.actionCardChevron {
  color: var(--text-secondary);
  opacity: 0.4;
  flex-shrink: 0;
}

/* ─── Hero Card (gradient) ─── */

.heroCardV2 {
  background: linear-gradient(135deg, #0c8599 0%, #1a2a3a 60%, var(--card-bg) 100%);
  border: 1px solid rgba(21, 170, 191, 0.25);
  border-radius: var(--r-lg);
  padding: 28px 24px;
}

:global(html[data-mantine-color-scheme="light"]) .heroCardV2 {
  background: linear-gradient(135deg, var(--accent-primary-subtle) 0%, var(--card-bg) 60%, var(--bg-main) 100%);
  border: 1px solid var(--card-border);
}

.heroV2Title {
  font-size: var(--fs-xl);
  font-weight: 700;
  color: #fff;
  margin-bottom: 18px;
}

:global(html[data-mantine-color-scheme="light"]) .heroV2Title {
  color: var(--text-primary);
}

.heroV2Stats {
  display: flex;
  gap: 24px;
  flex-wrap: wrap;
  margin-bottom: 6px;
}

.heroV2Stat {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: var(--fs-md);
  color: rgba(255, 255, 255, 0.85);
}

:global(html[data-mantine-color-scheme="light"]) .heroV2Stat {
  color: var(--text-primary);
}

.heroV2Subtext {
  font-size: var(--fs-xs);
  color: rgba(255, 255, 255, 0.45);
  margin-bottom: 16px;
}

:global(html[data-mantine-color-scheme="light"]) .heroV2Subtext {
  color: var(--text-secondary);
}

.mixRatioSection { margin-bottom: 20px; }

.mixRatioLabel {
  font-size: var(--fs-xs);
  font-weight: 600;
  color: rgba(255, 255, 255, 0.6);
  text-transform: uppercase;
  letter-spacing: 0.3px;
  margin-bottom: 8px;
}

:global(html[data-mantine-color-scheme="light"]) .mixRatioLabel {
  color: var(--text-secondary);
}

.mixBar {
  display: flex;
  width: 100%;
  height: 8px;
  border-radius: 4px;
  overflow: hidden;
  margin-bottom: 8px;
}

.mixBarSegment {
  height: 100%;
  transition: width 0.3s ease;
}

.mixLegend {
  display: flex;
  gap: 14px;
  flex-wrap: wrap;
  margin-bottom: 6px;
}

.mixLegendItem {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: var(--fs-xs);
  color: rgba(255, 255, 255, 0.6);
}

:global(html[data-mantine-color-scheme="light"]) .mixLegendItem {
  color: var(--text-secondary);
}

.mixLegendDot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.mixNote {
  font-size: var(--fs-xs);
  font-style: italic;
  color: rgba(255, 255, 255, 0.35);
}

:global(html[data-mantine-color-scheme="light"]) .mixNote {
  color: var(--text-secondary);
  opacity: 0.7;
}

.heroCta {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  width: 100%;
  padding: 14px 0 12px;
  background: var(--accent-primary);
  color: #fff;
  border: none;
  border-radius: var(--r-md);
  cursor: pointer;
  transition: filter 0.15s ease;
}

.heroCta:hover { filter: brightness(0.9); }

.heroCtaMain {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: var(--fs-lg);
  font-weight: 700;
}

.heroCtaSub {
  font-size: var(--fs-xs);
  opacity: 0.75;
  font-weight: 500;
}

.heroPostNote {
  text-align: center;
  margin-top: 10px;
  font-size: var(--fs-xs);
  color: rgba(255, 255, 255, 0.35);
  font-style: italic;
}

:global(html[data-mantine-color-scheme="light"]) .heroPostNote {
  color: var(--text-secondary);
  opacity: 0.6;
}

/* ─── Secondary + Rescue Cards ─── */

.secondaryCard {
  background: var(--card-bg);
  border: 1px solid var(--card-border);
  border-radius: var(--r-md);
  padding: 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  cursor: pointer;
  transition: all 0.2s ease;
  text-decoration: none;
  color: inherit;
}

.secondaryCard:hover {
  border-color: var(--accent-primary);
  background: var(--card-hover-bg);
  transform: translateY(-2px);
}

.rescueCard {
  background: var(--danger-subtle);
  border: 1px solid var(--card-border);
  border-left: 3px solid var(--danger);
  border-radius: var(--r-md);
  padding: 16px;
  display: flex;
  align-items: center;
  position: relative;
  cursor: pointer;
  transition: all 0.2s ease;
  text-decoration: none;
  color: inherit;
}

.rescueCard:hover {
  border-color: var(--danger);
  border-left: 3px solid var(--danger);
  background: color-mix(in srgb, var(--danger) 12%, transparent);
  transform: translateY(-2px);
}

.lapseBadge {
  position: absolute;
  top: 10px;
  right: 12px;
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 20px;
  background: var(--danger-subtle);
  color: var(--danger);
  font-size: var(--fs-xs);
  font-weight: 600;
}

.cardLeft {
  display: flex;
  align-items: center;
  gap: 12px;
}

.cardIconBox {
  width: 36px;
  height: 36px;
  border-radius: var(--r-sm);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.cardIconAccent  { background: var(--accent-primary-subtle); }
.cardIconDanger  { background: var(--danger-subtle); }

.cardTitle {
  font-size: var(--fs-sm);
  font-weight: 600;
  color: var(--text-primary);
}

.cardTitleDanger { color: var(--danger); }

.cardSubtitle {
  font-size: var(--fs-xs);
  color: var(--text-secondary);
  margin-top: 2px;
}
```

### Step 2: Commit

```bash
git add src/pages/Dashboard.module.css
git commit -m "feat: add ring chart, action card, hero, and rescue card CSS classes to Dashboard.module.css"
```

---

## Task 7: Implement GoalRingCard sub-component

**Files:**
- Modify: `src/pages/Dashboard.tsx` (add sub-component inline, before the main `Dashboard` function)

### Step 1: Add pure helpers at the top of Dashboard.tsx (after imports)

Add these helper functions above the `Dashboard` component:

```typescript
// ── Ring chart helpers ──

type GoalStatus = 'achieved' | 'on_track' | 'at_risk' | 'missed' | 'off_track'

function goalToRingPercent(goal: WeeklyGoal): number {
  if (goal.goal_type === 'review_health') {
    // at_most direction: fewer overdue = better. Show health as inverse.
    if (goal.target_value_numeric === 0) return goal.current_value_numeric === 0 ? 100 : 0
    // Use (target - current) / target * 100, clamped 0-100
    return Math.max(0, Math.min(100, Math.round(
      ((goal.target_value_numeric - goal.current_value_numeric) / goal.target_value_numeric) * 100
    )))
  }
  if (goal.target_value_numeric === 0) return 0
  return Math.min(100, Math.round((goal.current_value_numeric / goal.target_value_numeric) * 100))
}

const RING_COLOR: Record<string, string> = {
  achieved: 'var(--success)',
  on_track: 'var(--accent-primary)',
  at_risk:  'var(--warning)',
  off_track: 'var(--warning)',
  missed:   'var(--danger)',
}

function formatGoalValue(goal: WeeklyGoal): string {
  const fmt = (v: number) =>
    goal.goal_unit === 'percent' ? `${Math.round(v * 100)}%` : `${Math.round(v)}`
  return `${fmt(goal.current_value_numeric)} / ${fmt(goal.target_value_numeric)}`
}

interface MixSegment { label: string; value: number; color: string }

function computeMixSegments(plan: TodayPlan, T: any): MixSegment[] {
  const reviewCount = Math.max(0, plan.due_reviews_today_target - plan.weak_items_target)
  const segments: MixSegment[] = [
    { label: T.dashboard.mixReviews, value: reviewCount,                           color: 'var(--accent-primary)' },
    { label: T.dashboard.mixNew,     value: plan.new_items_today_target,            color: 'var(--success)' },
    { label: T.dashboard.mixRecall,  value: plan.recall_interactions_today_target,  color: 'var(--mix-recall)' },
    { label: T.dashboard.mixWeak,    value: plan.weak_items_target,                 color: 'var(--warning)' },
  ]
  return segments.filter(s => s.value > 0)
}

function getActionReason(goal: WeeklyGoal, T: any): string {
  const fmt = (v: number) =>
    goal.goal_unit === 'percent' ? `${Math.round(v * 100)}%` : `${Math.round(v)}`
  switch (goal.goal_type) {
    case 'recall_quality':
      return T.dashboard.actionReasonRecall
        .replace('{current}', fmt(goal.current_value_numeric))
        .replace('{target}', fmt(goal.target_value_numeric))
    case 'usable_vocabulary':
      return T.dashboard.actionReasonVocab
        .replace('{current}', `${Math.round(goal.current_value_numeric)}`)
        .replace('{target}', `${Math.round(goal.target_value_numeric)}`)
    case 'review_health':
      return T.dashboard.actionReasonBacklog
        .replace('{current}', `${Math.round(goal.current_value_numeric)}`)
    case 'consistency':
      return T.dashboard.actionReasonConsistency
        .replace('{current}', `${Math.round(goal.current_value_numeric)}`)
        .replace('{target}', `${Math.round(goal.target_value_numeric)}`)
    default:
      return ''
  }
}

function getCtaSubtitle(weeklyGoals: WeeklyGoal[], T: any): string {
  const recall = weeklyGoals.find(g => g.goal_type === 'recall_quality')
  const health = weeklyGoals.find(g => g.goal_type === 'review_health')
  const parts: string[] = []
  if (recall && recall.status !== 'achieved') {
    const gap = Math.round((recall.target_value_numeric - recall.current_value_numeric) * 100)
    if (gap > 0) parts.push(`+${gap}% ${T.dashboard.recallQualityShort}`)
  }
  if (health && health.current_value_numeric > 0) {
    parts.push(`${T.dashboard.reviewHealthLabel} → 0`)
  }
  return parts.length > 0 ? `${T.dashboard.goalLabel}: ${parts.join(' · ')}` : ''
}

function getRecallTooltip(goal: WeeklyGoal, T: any): string {
  const cfg = goal.goal_config_jsonb as Record<string, number> | null
  if (cfg?.recognition_accuracy != null && cfg?.recall_accuracy != null) {
    return T.dashboard.tooltipRecall
      .replace('{recognition}', Math.round(cfg.recognition_accuracy * 100).toString())
      .replace('{recall}', Math.round(cfg.recall_accuracy * 100).toString())
  }
  return T.dashboard.tooltipRecallBalanced
}

function getRingTooltip(goal: WeeklyGoal, T: any): string {
  switch (goal.goal_type) {
    case 'consistency': return T.dashboard.tooltipConsistency
    case 'recall_quality': return getRecallTooltip(goal, T)
    case 'review_health': return T.dashboard.tooltipBacklog
    case 'usable_vocabulary': return T.dashboard.tooltipVocab
      .replace('{current}', `${Math.round(goal.current_value_numeric)}`)
      .replace('{target}', `${Math.round(goal.target_value_numeric)}`)
    default: return ''
  }
}

function getRingLabel(goal: WeeklyGoal, T: any): string {
  switch (goal.goal_type) {
    case 'consistency': return T.dashboard.consistencyLabel
    case 'recall_quality': return T.dashboard.recallQualityLabel
    case 'review_health': return T.dashboard.reviewHealthLabel
    case 'usable_vocabulary': return T.dashboard.vocabGrowthLabel
    default: return goal.goal_type
  }
}

function getStatusPillClass(status: string, classes: Record<string, string>): string {
  switch (status) {
    case 'achieved': return `${classes.statusPill} ${classes.statusPillAchieved}`
    case 'on_track': return `${classes.statusPill} ${classes.statusPillOnTrack}`
    case 'at_risk':
    case 'off_track': return `${classes.statusPill} ${classes.statusPillAtRisk}`
    case 'missed': return `${classes.statusPill} ${classes.statusPillMissed}`
    default: return classes.statusPill
  }
}

function getStatusLabel(status: string, T: any): string {
  switch (status) {
    case 'achieved': return T.dashboard.statusAchieved
    case 'on_track': return T.dashboard.statusOnTrack
    case 'at_risk':
    case 'off_track': return T.dashboard.statusAtRisk
    case 'missed': return T.dashboard.statusMissed
    default: return status
  }
}
```

### Step 2: Add GoalRingCard sub-component

After the helpers, add:

```typescript
function GoalRingCard({ goal, T }: { goal: WeeklyGoal; T: any }) {
  const percent = goalToRingPercent(goal)
  const ringDeg = Math.round((percent / 100) * 360)
  const ringColor = RING_COLOR[goal.status] ?? 'var(--accent-primary)'
  const tooltipText = getRingTooltip(goal, T)
  const label = getRingLabel(goal, T)
  const valueText = formatGoalValue(goal)
  const statusLabel = getStatusLabel(goal.status, T)

  return (
    <div className={classes.ringCard}>
      <div className={classes.ringWrapper}>
        <div className={classes.ringBg} />
        <div
          className={classes.ringFill}
          style={{ '--ring-color': ringColor, '--ring-deg': `${ringDeg}deg` } as React.CSSProperties}
        />
        <div className={classes.ringCenter}>{percent}%</div>
      </div>
      <div className={classes.ringLabel}>{label}</div>
      <div className={classes.ringValue}>{valueText}</div>
      <span className={getStatusPillClass(goal.status, classes)}>
        {statusLabel}
        {goal.is_provisional && (
          <Text span size="xs" c="dimmed" ml={4}>({T.dashboard.statusProvisional})</Text>
        )}
      </span>
      <Tooltip label={tooltipText} multiline w={220} withArrow>
        <span className={classes.ringInfoTrigger}>
          <IconInfoCircle size={12} />
          {T.dashboard.howDoesThisWork}
        </span>
      </Tooltip>
    </div>
  )
}
```

Update imports at the top of `Dashboard.tsx` to add `Tooltip`, `IconInfoCircle`:

```typescript
import { Tooltip } from '@mantine/core'
import { IconInfoCircle } from '@tabler/icons-react'
```

Import the CSS module (it's already imported as `classes`).

### Step 3: Run tests — ring chart tests should pass

```bash
bun run test src/__tests__/dashboard-redesign.test.tsx 2>&1 | grep -E "PASS|FAIL|✓|✗" | head -30
```

These tests from `dashboard-redesign.test.tsx` should now pass once the Dashboard render tree is wired (Task 10). For now, verify the TypeScript compiles:

```bash
bun run build 2>&1 | grep "error TS" | head -10
```

### Step 4: Commit

```bash
git add src/pages/Dashboard.tsx
git commit -m "feat: add GoalRingCard sub-component with CSS ring chart and helpers"
```

---

## Task 8: Implement ActionCard sub-component

**Files:**
- Modify: `src/pages/Dashboard.tsx`

### Step 1: Add ActionCard component

Add after `GoalRingCard`:

```typescript
const GOAL_ACTION_CONFIG: Record<string, {
  title: (T: any) => string
  focus: (T: any) => string
  mode: string
  variant: 'amber' | 'teal'
}> = {
  recall_quality: {
    title: (T) => T.dashboard.improveRecall,
    focus: (T) => T.dashboard.focusRecall,
    mode: 'recall_sprint',
    variant: 'amber',
  },
  usable_vocabulary: {
    title: (T) => T.dashboard.improveVocab,
    focus: (T) => T.dashboard.focusVocab,
    mode: 'push_to_productive',
    variant: 'teal',
  },
  review_health: {
    title: (T) => T.dashboard.improveBacklog,
    focus: (T) => T.dashboard.focusBacklog,
    mode: 'backlog_clear',
    variant: 'amber',
  },
  consistency: {
    title: (T) => T.dashboard.quickSession,
    focus: (T) => T.dashboard.focusConsistency,
    mode: 'quick',
    variant: 'amber',
  },
}

function ActionCard({ goal, T }: { goal: WeeklyGoal; T: any }) {
  const config = GOAL_ACTION_CONFIG[goal.goal_type]
  if (!config) return null
  const reason = getActionReason(goal, T)
  const isAmber = config.variant === 'amber'
  const borderClass = isAmber ? classes.actionCardAmberBorder : classes.actionCardTealBorder
  const iconBgClass = isAmber ? classes.actionCardIconAmber : classes.actionCardIconTeal
  const iconColor = isAmber ? 'var(--warning)' : 'var(--accent-primary)'

  return (
    <Link
      to={`/session?mode=${config.mode}`}
      className={`${classes.actionCardBase} ${borderClass}`}
    >
      <div className={`${classes.actionCardIconBox} ${iconBgClass}`}>
        {isAmber
          ? <IconAlertTriangle size={20} color={iconColor} />
          : <IconSparkles size={20} color={iconColor} />
        }
      </div>
      <div className={classes.actionCardBody}>
        <div className={classes.actionCardTitle}>{config.title(T)}</div>
        <div className={classes.actionCardFocus}>{config.focus(T)}</div>
        {reason && <div className={classes.actionCardReason}>{reason}</div>}
      </div>
      <IconChevronRight size={18} className={classes.actionCardChevron} />
    </Link>
  )
}
```

Update imports to add `IconAlertTriangle`, `IconSparkles`:

```typescript
import { IconAlertTriangle, IconSparkles, /* existing icons */ } from '@tabler/icons-react'
```

### Step 2: Compile check

```bash
bun run build 2>&1 | grep "error TS" | head -10
```

### Step 3: Commit

```bash
git add src/pages/Dashboard.tsx
git commit -m "feat: add ActionCard sub-component for at-risk goal actions"
```

---

## Task 9: Implement HeroCard, SecondaryCard, and RescueCard sub-components

**Files:**
- Modify: `src/pages/Dashboard.tsx`

### Step 1: Add HeroCard

```typescript
function HeroCard({
  plan,
  weeklyGoals,
  onStart,
  T,
}: {
  plan: TodayPlan
  weeklyGoals: WeeklyGoal[]
  onStart: () => void
  T: any
}) {
  const mixSegments = computeMixSegments(plan, T)
  const total = mixSegments.reduce((s, seg) => s + seg.value, 0)
  const ctaSubtitle = getCtaSubtitle(weeklyGoals, T)
  const showMixNote = plan.weak_items_target > 0 && plan.new_items_today_target < 3

  return (
    <div className={classes.heroCardV2}>
      <div className={classes.heroV2Title}>{T.dashboard.todaysPlan}</div>

      <div className={classes.heroV2Stats}>
        <span className={classes.heroV2Stat}>
          <IconRefresh size={16} /> {plan.due_reviews_today_target} {T.dashboard.reviewsLabel}
        </span>
        <span className={classes.heroV2Stat}>
          <IconSparkles size={16} /> {plan.new_items_today_target} {T.dashboard.newLabel}
        </span>
        <span className={classes.heroV2Stat}>
          <IconKeyboard size={16} /> {plan.recall_interactions_today_target} {T.dashboard.recallLabel}
        </span>
      </div>

      <div className={classes.heroV2Subtext}>
        {T.dashboard.basedOnSessionSize.replace('{size}', `${plan.preferred_session_size}`)}
      </div>

      {mixSegments.length > 0 && (
        <div className={classes.mixRatioSection}>
          <div className={classes.mixRatioLabel}>{T.dashboard.sessionComposition}</div>
          <div className={classes.mixBar}>
            {mixSegments.map((seg) => (
              <div
                key={seg.label}
                className={classes.mixBarSegment}
                style={{ width: `${(seg.value / total) * 100}%`, background: seg.color }}
              />
            ))}
          </div>
          <div className={classes.mixLegend}>
            {mixSegments.map((seg) => (
              <span key={seg.label} className={classes.mixLegendItem}>
                <span className={classes.mixLegendDot} style={{ background: seg.color }} />
                {seg.label}
              </span>
            ))}
          </div>
          {showMixNote && (
            <div className={classes.mixNote}>{T.dashboard.mixNoteBacklog}</div>
          )}
        </div>
      )}

      <button className={classes.heroCta} onClick={onStart}>
        <span className={classes.heroCtaMain}>
          <IconClock size={18} />
          {T.dashboard.startTodaysSession} — ~{plan.estimated_minutes_today} min
        </span>
        {ctaSubtitle && (
          <span className={classes.heroCtaSub}>{ctaSubtitle}</span>
        )}
      </button>

      <div className={classes.heroPostNote}>{T.dashboard.postSessionNote}</div>
    </div>
  )
}
```

Add icon imports: `IconRefresh`, `IconKeyboard`, `IconClock` from `@tabler/icons-react`.

### Step 2: Add SecondaryCard and RescueCard

```typescript
function SecondaryCard({
  href,
  icon,
  title,
  subtitle,
}: {
  href: string
  icon: React.ReactNode
  title: string
  subtitle: string
}) {
  return (
    <Link to={href} className={classes.secondaryCard}>
      <div className={classes.cardLeft}>
        <div className={`${classes.cardIconBox} ${classes.cardIconAccent}`}>{icon}</div>
        <div>
          <div className={classes.cardTitle}>{title}</div>
          <div className={classes.cardSubtitle}>{subtitle}</div>
        </div>
      </div>
      <IconChevronRight size={16} style={{ color: 'var(--text-secondary)', opacity: 0.5 }} />
    </Link>
  )
}

function RescueCard({ count, T }: { count: number; T: any }) {
  if (count === 0) return null
  return (
    <Link to="/session?weak=true" className={classes.rescueCard}>
      <span className={classes.lapseBadge}>{count} {T.dashboard.lapsesLabel}</span>
      <div className={classes.cardLeft}>
        <div className={`${classes.cardIconBox} ${classes.cardIconDanger}`}>
          <IconAlertTriangle size={18} color="var(--danger)" />
        </div>
        <div>
          <div className={`${classes.cardTitle} ${classes.cardTitleDanger}`}>
            {T.dashboard.rescueTitle.replace('{count}', `${count}`)}
          </div>
          <div className={classes.cardSubtitle}>
            {T.dashboard.rescueSubtitle.replace(/\{count\}/g, `${count}`)}
          </div>
        </div>
      </div>
    </Link>
  )
}
```

### Step 3: Compile check

```bash
bun run build 2>&1 | grep "error TS" | head -10
```

### Step 4: Commit

```bash
git add src/pages/Dashboard.tsx
git commit -m "feat: add HeroCard, SecondaryCard, and RescueCard sub-components"
```

---

## Task 10: Rewire Dashboard.tsx render tree

**Files:**
- Modify: `src/pages/Dashboard.tsx`

This task replaces the existing `Dashboard` component body with the new render tree.

### Step 1: Update fetchData to include getLapsingItems

In the `fetchData` effect, add a call to `getLapsingItems` alongside the existing fetches:

```typescript
const [lapsingResult] = await Promise.all([
  learnerStateService.getLapsingItems(user.id),
])
setLapsingCount(lapsingResult.count)
```

Add `const [lapsingCount, setLapsingCount] = useState(0)` to the state declarations.

### Step 2: Replace the return JSX

Replace everything from `return (` down to the end of the non-timezone-required render. Keep the loading spinner and timezone-required screen exactly as they are. Replace the main render:

```typescript
const atRiskGoals = weeklyGoals.filter(g =>
  ['at_risk', 'off_track', 'missed'].includes(g.status)
)

return (
  <Container size="md" className={classes.dashboard}>
    <Stack gap="lg">
      {/* 1. Welcome bar */}
      <Group justify="space-between" align="flex-end">
        <Text size="xl" fw={600}>
          {T.dashboard.welcomeBack}, {name}
        </Text>
        <Group gap="xs">
          <IconFlame size={18} color="orange" />
          <Text size="sm" fw={600}>{currentStreak} {T.dashboard.daysInARow}</Text>
        </Group>
      </Group>

      {/* 2. Weekly Scorecard — ring charts */}
      <div>
        <Text fw={600} mb="sm">{T.dashboard.thisWeek}</Text>
        <div className={classes.scorecardGrid}>
          {weeklyGoals.map(goal => (
            <GoalRingCard key={goal.id} goal={goal} T={T} />
          ))}
        </div>
      </div>

      {/* 3. Recommended Actions — only when goals are at risk */}
      {atRiskGoals.length > 0 && (
        <div>
          <Text fw={600} mb="sm">{T.dashboard.recommendedActions}</Text>
          <div className={classes.actionCardList}>
            {atRiskGoals.map(goal => (
              <ActionCard key={goal.id} goal={goal} T={T} />
            ))}
          </div>
        </div>
      )}

      {/* 4. Hero card — today's plan */}
      {todayPlan && (
        <HeroCard
          plan={todayPlan}
          weeklyGoals={weeklyGoals}
          onStart={() => navigate('/session')}
          T={T}
        />
      )}

      {/* 5. Secondary cards */}
      <SimpleGrid cols={2}>
        <SecondaryCard
          href={continueUrl}
          icon={<IconBook size={18} color="var(--accent-primary)" />}
          title={T.dashboard.continueLesson}
          subtitle={T.dashboard.nextLesson}
        />
        {lapsingCount > 0
          ? <RescueCard count={lapsingCount} T={T} />
          : (
            <Link to="/session?weak=true" className={classes.secondaryCard}>
              <Group justify="space-between" h="100%">
                <Box>
                  <Text size="sm" fw={500}>{T.dashboard.practiceWeak}</Text>
                  <Text size="xs" c="dimmed" mt="4">{T.dashboard.reviewWeakItems}</Text>
                </Box>
                <IconChevronRight size={16} />
              </Group>
            </Link>
          )
        }
      </SimpleGrid>
    </Stack>
  </Container>
)
```

Add `IconBook` to imports from `@tabler/icons-react`. Remove now-unused imports: `Progress`, `Paper`, `Title` (check if still used). Remove the old `GoalRow` function.

### Step 3: Run the full test suite

```bash
bun run test 2>&1 | tail -15
```

Expected: all 153 existing tests pass. The new `dashboard-redesign.test.tsx` tests will fail until mocks are wired — that's Task 11.

### Step 4: Commit

```bash
git add src/pages/Dashboard.tsx
git commit -m "feat: rewire Dashboard render tree to use ring charts, action cards, hero card, and rescue card"
```

---

## Task 11: Fix dashboard-redesign test setup and get tests green

**Files:**
- Modify: `src/__tests__/dashboard-redesign.test.tsx`

The test file was pre-written by the architect agent. Some mock wiring may need adjustment. Fix any failures.

### Step 1: Run just the new test file and read all failures

```bash
bun run test src/__tests__/dashboard-redesign.test.tsx 2>&1
```

### Step 2: Fix auth store mock

The test file uses `require('@/stores/authStore')`. If the Zustand store doesn't expose `setState` for testing, replace with:

```typescript
vi.mock('@/stores/authStore', () => ({
  useAuthStore: vi.fn((selector) =>
    selector({
      user: { id: 'user-1', email: 'test@duin.home' },
      profile: { fullName: 'Albert', email: 'test@duin.home', preferredSessionSize: 15 },
    })
  ),
}))
```

### Step 3: Fix the supabase mock to cover all direct calls Dashboard makes

Dashboard.tsx makes direct Supabase calls for: streak (review_events), today's sessions (learning_sessions), and streak calculation. The mock must handle all `.schema(...).from(...).select(...).eq(...).gte(...).order(...).limit(...)` chains.

Check what the existing supabase mock in other test files looks like:

```bash
grep -n "schema\|mockReturnValue" src/__tests__/reviewHandler.test.ts | head -20
```

Apply the same pattern.

### Step 4: Run the full suite to confirm no regressions

```bash
bun run test 2>&1 | tail -15
```

Expected: all `dashboard-redesign.test.tsx` tests pass (or near-pass), 153 existing tests still passing.

### Step 5: Commit

```bash
git add src/__tests__/dashboard-redesign.test.tsx
git commit -m "test: wire dashboard-redesign tests with correct mocks"
```

---

## Task 12: Clean up old Dashboard CSS classes

**Files:**
- Modify: `src/pages/Dashboard.module.css`

### Step 1: Remove unused classes

After the render tree is confirmed working, remove the old classes that are no longer referenced:

Classes to remove: `.statGrid`, `.statCard`, `.statCardPurple`, `.statCardOrange`, `.statCardTeal`, `.statLabel`, `.statValue`, `.statSub`, `.continueSection`, `.continueCard`, `.continueIcon`, `.continueTitle`, `.continueSub`, `.continueProg`, `.progressBarWrap`, `.progressBarFill`, `.actionsSection`, `.actions`, `.btn`, `.btnPrimary`, `.btnOutline`, `.btnGhost`, and all their `:global(html[data-mantine-color-scheme="light"])` overrides.

Also remove the old `.heroCard` and `.actionCard` classes (replaced by `.heroCardV2`, `.actionCardBase`).

Keep: `.dashboard`, `.welcome`, `.display`, `.badges`, `.badge`, `.badgePurple`, `.badgeOrange`, `.bodySm`, `.sectionLabel`, `.metricCard`, and their light overrides (check if any are still referenced first).

### Step 2: Verify no build errors

```bash
bun run build 2>&1 | grep "error\|warning" | head -20
```

### Step 3: Final test run

```bash
bun run test 2>&1 | tail -10
```

### Step 4: Commit

```bash
git add src/pages/Dashboard.module.css
git commit -m "chore: remove old Dashboard CSS classes replaced by redesign"
```

---

## Task 13: Visual smoke test in Playwright

### Step 1: Ensure dev server is running

```bash
bun run dev &
sleep 3
```

### Step 2: Log in and navigate to dashboard via Playwright MCP

Use the Playwright MCP browser tools to:
1. Navigate to `http://localhost:5173`
2. Log in as `testuser@duin.home` / `TestUser123!`
3. Navigate to dashboard
4. Take a full-page screenshot
5. Verify: ring cards visible, no old progress bars, hero card visible with mix bar

### Step 3: Check for console errors

Use `browser_console_messages` to verify no JS errors during render.

---

## Execution Handoff

Plan complete and saved to `docs/plans/2026-04-05-dashboard-redesign-implementation.md`.

**Two execution options:**

**1. Subagent-Driven (this session)** — I dispatch a fresh subagent per task, spec + code quality review between each. Fast iteration, no context switching.

**2. Parallel Session (separate)** — Open a new Claude Code session in this directory, start with the executing-plans skill, and implement task by task.

**Which approach?**
