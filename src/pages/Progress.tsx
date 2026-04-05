// src/pages/Progress.tsx
import { useEffect, useState } from 'react'
import {
  Container,
  Title,
  Text,
  Stack,
  Paper,
  Group,
  Center,
  Loader,
  Progress as MantineProgress,
  Box,
  RingProgress,
  SimpleGrid,
} from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { useAuthStore } from '@/stores/authStore'
import { learnerStateService } from '@/services/learnerStateService'
import { lessonService } from '@/services/lessonService'
import { goalService } from '@/services/goalService'
import { analyticsService } from '@/services/analyticsService'
import { useT } from '@/hooks/useT'
import { logError } from '@/lib/logger'
import type { WeeklyGoal } from '@/types/learning'
import classes from './Progress.module.css'

export function Progress() {
  const T = useT()
  const user = useAuthStore((state) => state.user)

  const [loading, setLoading] = useState(true)
  const [itemsByStage, setItemsByStage] = useState({ new: 0, anchoring: 0, retrieving: 0, productive: 0, maintenance: 0 })
  const [skillStats, setSkillStats] = useState({ avgRecognition: 0, avgRecall: 0 })
  const [lessonsCompleted, setLessonsCompleted] = useState({ completed: 0, total: 0 })
  const [dueStats, setDueStats] = useState({ today: 0, thisWeek: 0 })
  const [weeklyGoals, setWeeklyGoals] = useState<WeeklyGoal[] | null>(null)
  const [dailyRollups, setDailyRollups] = useState<any[] | null>(null)

  useEffect(() => {
    async function fetchData() {
      if (!user) return
      try {
        // Fetch item states by stage
        const itemStates = await learnerStateService.getItemStates(user.id)
        const stageCounts = {
          new: 0,
          anchoring: 0,
          retrieving: 0,
          productive: 0,
          maintenance: 0,
        }
        for (const state of itemStates) {
          stageCounts[state.stage]++
        }
        setItemsByStage(stageCounts)

        // Fetch skill states for strength comparison
        if (itemStates.length > 0) {
          const skillStates = await learnerStateService.getSkillStatesBatch(user.id)

          // Separate by skill type and calculate average stability
          const recognitionStabilities: number[] = []
          const recallStabilities: number[] = []
          for (const skill of skillStates) {
            if (skill.skill_type === 'recognition') {
              recognitionStabilities.push(skill.stability)
            } else if (skill.skill_type === 'form_recall') {
              recallStabilities.push(skill.stability)
            }
          }

          const avgRecognition = recognitionStabilities.length > 0
            ? Math.round(recognitionStabilities.reduce((a, b) => a + b, 0) / recognitionStabilities.length * 100) / 100
            : 0
          const avgRecall = recallStabilities.length > 0
            ? Math.round(recallStabilities.reduce((a, b) => a + b, 0) / recallStabilities.length * 100) / 100
            : 0

          setSkillStats({ avgRecognition, avgRecall })

          // Calculate due stats
          const now = new Date()
          const today = new Date(now)
          today.setHours(0, 0, 0, 0)
          const endOfToday = new Date(today)
          endOfToday.setHours(23, 59, 59, 999)

          const weekFromNow = new Date(now)
          weekFromNow.setDate(weekFromNow.getDate() + 7)

          let dueToday = 0
          let dueThisWeek = 0
          for (const skill of skillStates) {
            if (skill.next_due_at) {
              const dueDate = new Date(skill.next_due_at)
              if (dueDate <= endOfToday) {
                dueToday++
              } else if (dueDate <= weekFromNow) {
                dueThisWeek++
              }
            }
          }
          setDueStats({ today: dueToday, thisWeek: dueThisWeek + dueToday })
        }

        // Fetch lesson completion progress
        const [lessonProgress, lessons] = await Promise.all([
          lessonService.getUserLessonProgress(user.id),
          lessonService.getLessonsBasic(),
        ])

        const completed = lessonProgress.filter((lp: any) => lp.completed_at != null)
        setLessonsCompleted({ completed: completed.length, total: lessons.length })

        // Fetch weekly goal data
        try {
          const goalProgress = await goalService.getGoalProgress(user.id)
          if (goalProgress.state !== 'timezone_required' && goalProgress.weeklyGoals) {
            setWeeklyGoals(goalProgress.weeklyGoals)
          }
        } catch (err) {
          console.error('Failed to fetch weekly goals:', err)
        }

        // Fetch daily rollup data for trends (last 7 days)
        try {
          const { data: rollups } = await (async () => {
            const supabase = (await import('@/lib/supabase')).supabase
            return supabase
              .schema('indonesian')
              .from('learner_daily_goal_rollups')
              .select('*')
              .eq('user_id', user.id)
              .order('local_date', { ascending: false })
              .limit(7)
          })()
          if (rollups) {
            setDailyRollups(rollups.reverse()) // Reverse to show oldest first
          }
        } catch (err) {
          console.error('Failed to fetch daily rollups:', err)
        }
      } catch (err) {
        logError({ page: 'progress', action: 'fetchData', error: err })
        notifications.show({
          color: 'red',
          title: T.common.error,
          message: T.common.somethingWentWrong,
        })
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [user, T.common.error, T.common.somethingWentWrong])

  // Track goal views when goals are available
  useEffect(() => {
    if (user && weeklyGoals && weeklyGoals.length > 0) {
      weeklyGoals.forEach(goal => {
        analyticsService.trackGoalViewed(user.id, goal.id, goal.goal_type)
      })
    }
  }, [user, weeklyGoals])

  if (loading) {
    return (
      <Center h="50vh">
        <Loader size="xl" color="cyan" />
      </Center>
    )
  }

  const totalItems = Object.values(itemsByStage).reduce((a, b) => a + b, 0)
  const recognitionStrengthPercent = Math.min(100, Math.round((skillStats.avgRecognition / 10) * 100))
  const recallStrengthPercent = Math.min(100, Math.round((skillStats.avgRecall / 10) * 100))
  const lessonProgressPercent = lessonsCompleted.total > 0 ? Math.round((lessonsCompleted.completed / lessonsCompleted.total) * 100) : 0

  return (
    <Container size="md">
      <Stack gap="xl" my="xl">
        <Title order={2}>{T.progress.title}</Title>

        {/* Items by stage */}
        <Paper p="xl" radius="md" className={classes.card}>
          <Stack gap="md">
            <Box>
              <Title order={4} mb="md">{T.progress.itemsByStage}</Title>
              <Text size="sm" c="dimmed" mb="xl">{T.progress.totalItems}: {totalItems}</Text>
            </Box>

            <Stack gap="sm">
              {[
                { stage: 'maintenance', label: T.progress.stable, count: itemsByStage.maintenance, color: 'green' },
                { stage: 'productive', label: T.progress.productive, count: itemsByStage.productive, color: 'teal' },
                { stage: 'retrieving', label: T.progress.learning, count: itemsByStage.retrieving, color: 'blue' },
                { stage: 'anchoring', label: T.progress.anchoring, count: itemsByStage.anchoring, color: 'yellow' },
                { stage: 'new', label: T.progress.new, count: itemsByStage.new, color: 'gray' },
              ].map((item) => (
                <Box key={item.stage}>
                  <Group justify="space-between" mb="4">
                    <Text size="sm">{item.label}</Text>
                    <Text size="sm" fw={500}>{item.count}</Text>
                  </Group>
                  <MantineProgress
                    value={totalItems > 0 ? (item.count / totalItems) * 100 : 0}
                    color={item.color}
                    size="md"
                    radius="md"
                  />
                </Box>
              ))}
            </Stack>
          </Stack>
        </Paper>

        {/* Weekly Goals Summary */}
        {weeklyGoals && weeklyGoals.length > 0 && (
          <Paper p="xl" radius="md" className={classes.card}>
            <Stack gap="md">
              <Title order={4}>{T.progress.thisWeeksGoals}</Title>
              <Stack gap="sm">
                {weeklyGoals.map((goal) => {
                  const statusColor = goal.status === 'achieved' ? 'green' : goal.status === 'on_track' ? 'blue' : goal.status === 'at_risk' ? 'yellow' : 'red'
                  const goalLabel = {
                    consistency: T.progress.studyConsistency,
                    recall_quality: T.progress.recallQualityGoal,
                    usable_vocabulary: T.progress.vocabularyGrowth,
                    review_health: T.progress.reviewBacklog,
                  }[goal.goal_type] || goal.goal_type
                  const statusLabel = {
                    achieved: T.progress.achieved,
                    on_track: T.progress.onTrack,
                    at_risk: T.progress.atRisk,
                    off_track: T.progress.offTrack,
                    missed: T.progress.missed,
                  }[goal.status] || goal.status.toUpperCase()

                  return (
                    <Box key={goal.id}>
                      <Group justify="space-between" mb="4">
                        <Text size="sm">{goalLabel}</Text>
                        <Text size="xs" c={statusColor} fw={600}>{statusLabel.toUpperCase()}</Text>
                      </Group>
                      <MantineProgress
                        value={Math.min(100, (goal.current_value_numeric / goal.target_value_numeric) * 100)}
                        color={statusColor}
                        size="sm"
                        radius="md"
                      />
                      <Text size="xs" c="dimmed" mt="4">
                        {goal.current_value_numeric} / {goal.target_value_numeric}
                      </Text>
                    </Box>
                  )
                })}
              </Stack>
            </Stack>
          </Paper>
        )}

        {/* Daily Rollup Trends */}
        {dailyRollups && dailyRollups.length > 0 && (
          <>
            <Paper p="xl" radius="md" className={classes.card}>
              <Stack gap="md">
                <Title order={4}>{T.progress.productiveGainsTrend}</Title>
                <Stack gap="sm">
                  {dailyRollups.map((rollup, idx) => (
                    <Box key={idx}>
                      <Group justify="space-between" mb="4">
                        <Text size="sm">{new Date(rollup.local_date).toLocaleDateString()}</Text>
                        <Text size="sm" fw={500}>{rollup.usable_items_gained_today ?? 0} items</Text>
                      </Group>
                      <MantineProgress
                        value={Math.min(100, ((rollup.usable_items_gained_today ?? 0) / 5) * 100)}
                        color="teal"
                        size="sm"
                        radius="md"
                      />
                    </Box>
                  ))}
                </Stack>
              </Stack>
            </Paper>

            <Paper p="xl" radius="md" className={classes.card}>
              <Stack gap="md">
                <Title order={4}>{T.progress.backlogTrend}</Title>
                <Stack gap="sm">
                  {dailyRollups.map((rollup, idx) => (
                    <Box key={idx}>
                      <Group justify="space-between" mb="4">
                        <Text size="sm">{new Date(rollup.local_date).toLocaleDateString()}</Text>
                        <Text size="sm" fw={500}>{rollup.overdue_count ?? 0} {T.progress.overdueItems}</Text>
                      </Group>
                      <MantineProgress
                        value={Math.min(100, ((rollup.overdue_count ?? 0) / 30) * 100)}
                        color={rollup.overdue_count === 0 ? 'green' : rollup.overdue_count < 20 ? 'yellow' : 'red'}
                        size="sm"
                        radius="md"
                      />
                    </Box>
                  ))}
                </Stack>
              </Stack>
            </Paper>
          </>
        )}

        {/* Memory strength */}
        <Paper p="xl" radius="md" className={classes.card} style={{ overflow: 'visible' }}>
          <Stack gap="md">
            <Title order={4}>{T.progress.memoryStrength}</Title>
            <SimpleGrid cols={{ base: 2, sm: 2 }} spacing="lg">
              <Box ta="center" className={classes.ringWrap}>
                <RingProgress
                  sections={[{ value: recognitionStrengthPercent, color: 'blue' }]}
                  label={(
                    <div>
                      <Text fw={700} ta="center">{recognitionStrengthPercent}%</Text>
                      <Text size="xs" c="dimmed" ta="center">{T.progress.recognition}</Text>
                    </div>
                  )}
                />
              </Box>
              <Box ta="center" className={classes.ringWrap}>
                <RingProgress
                  sections={[{ value: recallStrengthPercent, color: 'grape' }]}
                  label={(
                    <div>
                      <Text fw={700} ta="center">{recallStrengthPercent}%</Text>
                      <Text size="xs" c="dimmed" ta="center">{T.progress.recall}</Text>
                    </div>
                  )}
                />
              </Box>
            </SimpleGrid>
          </Stack>
        </Paper>

        {/* Lesson completion */}
        <Paper p="xl" radius="md" className={classes.card}>
          <Stack gap="md">
            <Box>
              <Title order={4} mb="md">{T.progress.lessonCompletion}</Title>
              <Group justify="space-between" mb="md">
                <Text size="sm">
                  {lessonsCompleted.completed} / {lessonsCompleted.total} {T.progress.lessonsCompleted}
                </Text>
                <Text size="sm" fw={500}>{lessonProgressPercent}%</Text>
              </Group>
            </Box>
            <MantineProgress
              value={lessonProgressPercent}
              color="indigo"
              size="lg"
              radius="md"
            />
          </Stack>
        </Paper>

        {/* Due dates */}
        <Paper p="xl" radius="md" className={classes.card}>
          <Stack gap="md">
            <Title order={4}>{T.progress.dueItems}</Title>
            <SimpleGrid cols={{ base: 2, sm: 2 }} spacing="lg">
              <Box style={{ textAlign: 'center' }}>
                <Text size="xl" fw={700} mb="4">
                  {dueStats.today}
                </Text>
                <Text size="sm" c="dimmed">{T.progress.dueToday}</Text>
              </Box>
              <Box style={{ textAlign: 'center' }}>
                <Text size="xl" fw={700} mb="4">
                  {dueStats.thisWeek}
                </Text>
                <Text size="sm" c="dimmed">{T.progress.dueThisWeek}</Text>
              </Box>
            </SimpleGrid>
          </Stack>
        </Paper>
      </Stack>
    </Container>
  )
}
