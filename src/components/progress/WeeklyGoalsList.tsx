import { Badge, Group, Paper, Progress, Skeleton, Stack, Text, Title } from '@mantine/core'
import type { WeeklyGoal } from '@/types/learning'

interface WeeklyGoalsListProps {
  goals: WeeklyGoal[] | null
  loading: boolean
}

const GOAL_LABELS: Record<string, string> = {
  consistency: 'Studieconsistentie',
  recall_quality: 'Oproepkwaliteit',
  usable_vocabulary: 'Woordenschatgroei',
  review_health: 'Reviewgezondheid',
}

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  achieved: { label: 'Behaald ✓', color: 'green' },
  on_track: { label: 'Op schema', color: 'blue' },
  at_risk: { label: 'At Risk', color: 'orange' },
  off_track: { label: 'Achter', color: 'red' },
  missed: { label: 'Gemist', color: 'red' },
}

function formatValue(goal: WeeklyGoal): string {
  const { goal_unit, goal_type, current_value_numeric, target_value_numeric } = goal
  if (goal_type === 'consistency') {
    return `${current_value_numeric} / ${target_value_numeric} dagen`
  }
  if (goal_unit === 'percent') {
    return `${Math.round(current_value_numeric * 100)}%`
  }
  return `${current_value_numeric} / ${target_value_numeric}`
}

export function WeeklyGoalsList({ goals, loading }: WeeklyGoalsListProps) {
  if (!loading && goals === null) {
    return null
  }

  return (
    <div>
      <Title order={4} mb="md">
        Wekelijkse Doelen
      </Title>

      {loading && (
        <Stack gap="sm">
          <Skeleton height={60} mb="sm" />
          <Skeleton height={60} mb="sm" />
          <Skeleton height={60} mb="sm" />
        </Stack>
      )}

      {!loading && goals !== null && goals.length === 0 && (
        <Text c="dimmed">Geen doelen deze week</Text>
      )}

      {!loading && goals !== null && goals.length > 0 && (
        <Stack gap="xs">
          {goals.map((goal) => {
            const label = GOAL_LABELS[goal.goal_type] ?? goal.goal_type
            const statusConfig = STATUS_CONFIG[goal.status] ?? { label: goal.status.toUpperCase(), color: 'gray' }
            const progressPct = Math.min(100, (goal.current_value_numeric / goal.target_value_numeric) * 100)
            const valueText = formatValue(goal)

            return (
              <Paper key={goal.id} withBorder p="sm" mb="xs">
                <Group justify="space-between">
                  <Text size="sm" fw={500}>
                    {label}
                  </Text>
                  <Badge color={statusConfig.color} size="sm" variant="light">
                    {statusConfig.label}
                  </Badge>
                </Group>
                <Progress value={progressPct} color={statusConfig.color} size="sm" mt="xs" />
                <Text size="xs" c="dimmed" mt={4}>
                  {valueText}
                </Text>
              </Paper>
            )
          })}
        </Stack>
      )}
    </div>
  )
}
