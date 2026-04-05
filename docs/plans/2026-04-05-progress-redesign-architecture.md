# Progress Screen Redesign: Data Architecture

## Critical Naming Corrections

Two naming errors in the initial spec:

1. **Column is `next_due_at`**, not `next_review_at`. (`learner_skill_state`, migration line 164)
2. **Table is `review_events`**, not `review_logs`. Has `exercise_type`, `skill_type`, `was_correct`.
3. **Skill type is `form_recall`**, not `recall`. (Renamed in migration lines 733–734.)

## Data Availability Summary

| Section | Data Source | Status | Action Required |
|---------|-------------|--------|----------------|
| Memory Health Hero | `learner_skill_state` via `getSkillStatesBatch` | **Available** | None — reuse `skillStats` state |
| Mastery Funnel | `learner_item_state` via `getItemStates` | **Available** | None — reuse `itemsByStage` state |
| 7-Day Review Forecast | Derived from `skillStates` array (`next_due_at`) | **Available** (client-side) | Add `computeReviewForecast` util |
| Growth vs Debt Trend | `learner_daily_goal_rollups` (inline fetch in Progress.tsx) | **Available** (needs extraction) | Extract to `getDailyRollups` in service |
| Accuracy by Skill Type | `review_events.skill_type + was_correct` | **Needs new method** | Add `progressService.getAccuracyBySkillType` |
| Average Stability | `learner_skill_state.stability` | **Available** | Compute from existing `skillStates` |
| Lapse Prevention | `learner_skill_state.lapse_count + consecutive_failures` | **Needs new method** | Add `progressService.getLapsePrevention` |

**No new DB views or migrations needed.**

---

## Section-by-Section Data Design

### Section 1: Memory Health Hero

Already available. `Progress.tsx` already computes `avgRecognition` / `avgRecall` from `getSkillStatesBatch`, separating by `skill_type === 'recognition'` vs `skill_type === 'form_recall'`.

```ts
skillStats.avgRecognition  // avg stability (days) for recognition skills
skillStats.avgRecall       // avg stability (days) for form_recall skills
```

### Section 2: Mastery Funnel

Already available. `itemsByStage` from `getItemStates` gives counts per stage.

```ts
itemsByStage.new          // integer count
itemsByStage.anchoring    // integer count
itemsByStage.retrieving   // integer count
itemsByStage.productive   // integer count
itemsByStage.maintenance  // integer count
```

Stage values: `'new' | 'anchoring' | 'retrieving' | 'productive' | 'maintenance'` (CHECK constraint in migration line 141).

### Section 3: 7-Day Review Forecast

Derived client-side from already-fetched `skillStates`. No new Supabase query needed.

```ts
// src/utils/progressUtils.ts
export function computeReviewForecast(
  skillStates: LearnerSkillState[],
  baseDate: Date = new Date()
): { date: Date; count: number }[] {
  return Array.from({ length: 7 }, (_, i) => {
    const dayStart = new Date(baseDate)
    dayStart.setHours(0, 0, 0, 0)
    dayStart.setDate(dayStart.getDate() + i)
    const dayEnd = new Date(dayStart)
    dayEnd.setHours(23, 59, 59, 999)
    return {
      date: new Date(dayStart),
      count: skillStates.filter(s => {
        if (!s.next_due_at) return false
        const d = new Date(s.next_due_at)
        return d >= dayStart && d <= dayEnd
      }).length,
    }
  })
}
```

### Section 4: Growth vs Debt Trend

The inline fetch in `Progress.tsx` (lines 128–139) queries `learner_daily_goal_rollups`. Needs extraction to a proper service method.

**Rollup fields used:**
- `local_date: date`
- `usable_items_gained_today: integer` — items that moved to retrieving/productive/maintenance that day
- `overdue_count: integer` — skills with `next_due_at < NOW()` at snapshot time

```ts
// Extract to learnerStateService.ts:
async getDailyRollups(userId: string, limit = 7): Promise<DailyGoalRollup[]> {
  const { data, error } = await supabase
    .schema('indonesian')
    .from('learner_daily_goal_rollups')
    .select('*')
    .eq('user_id', userId)
    .order('local_date', { ascending: false })
    .limit(limit)
  if (error) throw error
  return (data ?? []).reverse()
}
```

`DailyGoalRollup` type already exists in `src/types/learning.ts` (lines 250–263).

### Section 5: Detailed Metrics

#### Average Stability
Compute from existing `skillStates` in the `useEffect`. No extra fetch.

#### Accuracy by Skill Type (new method needed)

```ts
// src/services/progressService.ts
async getAccuracyBySkillType(userId: string): Promise<{
  recognitionAccuracy: number
  recognitionSampleSize: number
  recallAccuracy: number
  recallSampleSize: number
}> {
  const { data, error } = await supabase
    .schema('indonesian')
    .from('review_events')
    .select('skill_type, was_correct')
    .eq('user_id', userId)
    .in('skill_type', ['recognition', 'form_recall'])
  if (error) throw error

  const rec = data.filter(e => e.skill_type === 'recognition')
  const recall = data.filter(e => e.skill_type === 'form_recall')

  return {
    recognitionAccuracy: rec.length > 0 ? rec.filter(e => e.was_correct).length / rec.length : 0,
    recognitionSampleSize: rec.length,
    recallAccuracy: recall.length > 0 ? recall.filter(e => e.was_correct).length / recall.length : 0,
    recallSampleSize: recall.length,
  }
}
```

#### Lapse Prevention (new method needed)

```ts
// src/services/progressService.ts
async getLapsePrevention(userId: string): Promise<{ atRisk: number; rescued: number }> {
  const { data, error } = await supabase
    .schema('indonesian')
    .from('learner_skill_state')
    .select('lapse_count, consecutive_failures, last_reviewed_at')
    .eq('user_id', userId)
    .gt('lapse_count', 0)
  if (error) throw error

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

  return {
    atRisk: data.filter(s => s.consecutive_failures > 0).length,
    rescued: data.filter(s =>
      s.lapse_count > 0 &&
      s.consecutive_failures === 0 &&
      s.last_reviewed_at &&
      new Date(s.last_reviewed_at) >= sevenDaysAgo
    ).length,
  }
}
```

---

## Component Tree

```
Progress (page, /src/pages/Progress.tsx)
├── useProgressData() hook  [new: /src/hooks/useProgressData.ts]
│   Wave 1 (parallel, required):
│   ├── learnerStateService.getItemStates(userId)
│   ├── learnerStateService.getSkillStatesBatch(userId)
│   ├── lessonService.getUserLessonProgress(userId)
│   └── lessonService.getLessonsBasic()
│   Wave 2 (parallel, non-blocking — section-level skeletons):
│   ├── learnerStateService.getDailyRollups(userId, 7)
│   ├── progressService.getAccuracyBySkillType(userId)
│   └── progressService.getLapsePrevention(userId)
│   Derived (synchronous from Wave 1):
│   └── computeReviewForecast(skillStates)
│
├── <MemoryHealthHero>      props: avgRecognitionDays, avgRecallDays
├── <MasteryFunnel>         props: itemsByStage
├── <ReviewForecastChart>   props: forecast: { date, count }[]
├── <TrendCharts>           props: rollups: DailyGoalRollup[]
├── <DetailedMetrics>       props: recognitionAccuracy, recallAccuracy, avgStability, lapsePrevention
└── <LessonCompletionArc>   props: completed, total
```

## New Files

| File | Purpose |
|------|---------|
| `src/hooks/useProgressData.ts` | Data orchestration hook (two-wave fetch) |
| `src/services/progressService.ts` | `getAccuracyBySkillType`, `getLapsePrevention` |
| `src/utils/progressUtils.ts` | `computeReviewForecast` pure function |
| `src/components/progress/MemoryHealthHero.tsx` | Section 1 |
| `src/components/progress/MasteryFunnel.tsx` | Section 2 |
| `src/components/progress/ReviewForecastChart.tsx` | Section 3 |
| `src/components/progress/TrendCharts.tsx` | Section 4 |
| `src/components/progress/DetailedMetrics.tsx` | Section 5 |

## Modified Files

| File | Change |
|------|--------|
| `src/services/learnerStateService.ts` | Add `getDailyRollups()` extracted from Progress.tsx inline code |
| `src/pages/Progress.tsx` | Replace body with hook + component composition |

## Constraints

- Use `next_due_at` (not `next_review_at`) for all due-date queries
- Use `review_events` (not `review_logs`) for accuracy queries
- Use `form_recall` (not `recall`) for skill type filtering
- `getSkillStatesBatch` over-fetches columns — add a projected variant for Progress to avoid unnecessary data transfer
