// src/components/progress/WeeklyGoalsList.tsx
import { Skeleton } from '@mantine/core'
import type { WeeklyGoal } from '@/types/learning'
import classes from './WeeklyGoalsList.module.css'

interface WeeklyGoalsListProps {
  goals: WeeklyGoal[] | null
  loading: boolean
}

const GOAL_LABELS: Record<string, string> = {
  consistency: 'Consistentie',
  recall_quality: 'Kwaliteit',
  usable_vocabulary: 'Groei',
  review_health: 'Reviewgezondheid',
}

const STATUS_CONFIG: Record<string, { label: string; cls: string }> = {
  achieved: { label: 'Behaald ✓', cls: classes.statusOk },
  on_track:  { label: 'On Track',  cls: classes.statusOk },
  at_risk:   { label: 'At Risk',   cls: classes.statusRisk },
  off_track: { label: 'Achter',    cls: classes.statusRisk },
  missed:    { label: 'Gemist',    cls: classes.statusRisk },
}

function formatValue(goal: WeeklyGoal): string {
  const { goal_type, goal_unit, current_value_numeric, target_value_numeric } = goal
  if (goal_type === 'consistency') return `${current_value_numeric} / ${target_value_numeric} dagen`
  if (goal_unit === 'percent') return `${Math.round(current_value_numeric * 100)}% nauwkeurigheid`
  return `${current_value_numeric} / ${target_value_numeric}`
}

export function WeeklyGoalsList({ goals, loading }: WeeklyGoalsListProps) {
  if (!loading && (goals === null || goals.length === 0)) return null

  return (
    <div className={classes.card}>
      <div className={classes.cardTitle}>Wekelijkse Doelen</div>

      {loading && (
        <div className={classes.list}>
          <Skeleton height={56} radius={8} />
          <Skeleton height={56} radius={8} />
          <Skeleton height={56} radius={8} />
        </div>
      )}

      {!loading && goals !== null && goals.length === 0 && (
        <p className={classes.empty}>Geen doelen deze week</p>
      )}

      {!loading && goals !== null && goals.length > 0 && (
        <div className={classes.list}>
          {goals.map((goal) => {
            const label = GOAL_LABELS[goal.goal_type] ?? goal.goal_type
            const status = STATUS_CONFIG[goal.status] ?? { label: goal.status.toUpperCase(), cls: classes.statusOk }
            const progressPct = Math.min(100, (goal.current_value_numeric / goal.target_value_numeric) * 100)
            const isRisk = goal.status === 'at_risk' || goal.status === 'off_track' || goal.status === 'missed'

            return (
              <div key={goal.id} className={classes.goalItem}>
                <div className={classes.goalRow}>
                  <span className={classes.goalName}>{label}</span>
                  <span className={`${classes.goalStatus} ${status.cls}`}>{status.label}</span>
                </div>
                <div className={classes.goalDetail}>{formatValue(goal)}</div>
                <div className={classes.goalTrack}>
                  <div
                    className={`${classes.goalFill} ${isRisk ? classes.goalFillRisk : classes.goalFillOk}`}
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
