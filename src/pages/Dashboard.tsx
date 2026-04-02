// src/pages/Dashboard.tsx
import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Container,
  Center,
  Loader,
  Box,
  Stack,
  Text,
  Button,
  Group,
  Progress,
  Card,
} from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { IconChevronRight, IconFlame, IconClock, IconTrendingUp, IconTarget, IconCheck, IconAlertCircle } from '@tabler/icons-react'
import { lessonService } from '@/services/lessonService'
import { learnerStateService } from '@/services/learnerStateService'
import { goalService } from '@/services/goalService'
import type { WeeklyGoalResponse, WeeklyGoal } from '@/types/learning'
import { useAuthStore } from '@/stores/authStore'
import { useT } from '@/hooks/useT'
import { logError } from '@/lib/logger'
import { supabase } from '@/lib/supabase'
import classes from './Dashboard.module.css'

export function Dashboard() {
  const T = useT()
  const navigate = useNavigate()
  const user = useAuthStore((state) => state.user)
  const profile = useAuthStore((state) => state.profile)

  const [loading, setLoading] = useState(true)
  const [dueCount, setDueCount] = useState(0)
  const [itemsByStage, setItemsByStage] = useState({ new: 0, anchoring: 0, retrieving: 0, productive: 0, maintenance: 0 })
  const [continueUrl, setContinueUrl] = useState('/lessons')
  const [goalProgress, setGoalProgress] = useState<WeeklyGoalResponse | null>(null)

  useEffect(() => {
    async function fetchData() {
      if (!user) return
      try {
        // Fetch goal progress and today's plan
        const progress = await goalService.getGoalProgress(user.id)
        setGoalProgress(progress)

        // Fetch due skills count (also available in todayPlan, but we'll use it for the old metrics too)
        const dueSkills = await learnerStateService.getDueSkills(user.id)
        setDueCount(dueSkills.length)

        // Fetch item states for stage counts
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

        // Fetch lesson progress
        const [lessonProgress, lessons] = await Promise.all([
          lessonService.getUserLessonProgress(user.id),
          lessonService.getLessonsBasic(),
        ])

        // Find the lesson to continue: first in-progress, else first not started
        const inProgress = lessons.find((l) => {
          const p = lessonProgress.find((lp) => lp.lesson_id === l.id)
          return p && p.completed_at == null && p.sections_completed.length > 0
        })
        const notStarted = lessons.find((l) =>
          !lessonProgress.find((lp) => lp.lesson_id === l.id)
        )
        const target = inProgress ?? notStarted
        if (target) {
          const progress = lessonProgress.find((lp) => lp.lesson_id === target.id)
          const sectionIndex = progress?.sections_completed.length ?? 0
          setContinueUrl(`/lessons/${target.id}?section=${sectionIndex}`)
        }
      } catch (err) {
        logError({ page: 'dashboard', action: 'fetchData', error: err })
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

  if (loading) {
    return (
      <Center h="50vh">
        <Loader size="xl" color="cyan" />
      </Center>
    )
  }

  const name = profile?.fullName?.split(' ')[0] ?? profile?.email ?? 'User'
  const totalItems = Object.values(itemsByStage).reduce((a, b) => a + b, 0)

  if (goalProgress?.state === 'timezone_required') {
    return (
      <Container size="md" className={classes.dashboard}>
        <Stack gap="lg">
          <Box>
            <Text size="xl" fw={600}>{T.dashboard.welcomeBack}, {name}</Text>
          </Box>
          <Card withBorder padding="xl" radius="md">
            <Stack align="center" gap="md">
              <IconTarget size={48} color="var(--mantine-color-blue-filled)" />
              <Title order={3}>{T.dashboard.setTimezone}</Title>
              <Text c="dimmed" ta="center">
                {T.dashboard.setTimezoneDesc}
              </Text>
              <Button onClick={() => navigate('/profile')} size="md">
                {T.dashboard.goToProfile}
              </Button>
            </Stack>
          </Card>
        </Stack>
      </Container>
    )
  }

  const todayPlan = goalProgress?.todayPlan
  const weeklyGoals = goalProgress?.weeklyGoals ?? []

  return (
    <Container size="md" className={classes.dashboard}>
      <Stack gap="lg">
        {/* Welcome */}
        <Box>
          <Text size="xl" fw={600}>
            {T.dashboard.welcomeBack}, {name}
          </Text>
        </Box>

        {/* Weekly Goals Module */}
        <Card withBorder padding="lg" radius="md">
          <Stack gap="md">
            <Group justify="space-between">
              <Text fw={600}>{T.dashboard.thisWeek}</Text>
              <Text size="xs" c="dimmed">{T.dashboard.mondayStart}</Text>
            </Group>
            
            <Stack gap="sm">
              {weeklyGoals.map(goal => (
                <GoalRow key={goal.id} goal={goal} T={T} />
              ))}
            </Stack>
          </Stack>
        </Card>

        {/* Today's Adaptive Plan */}
        {todayPlan && (
          <Card withBorder padding="lg" className={classes.heroCard}>
            <Stack gap="md">
              <Box>
                <Text size="lg" fw={600} mb="xs">
                  {T.dashboard.todaysPlan}
                </Text>
                <Group gap="xl">
                  <Stack gap={0}>
                    <Text size="xs" c="dimmed" tt="uppercase">{T.dashboard.reviews}</Text>
                    <Text fw={700}>{todayPlan.due_reviews_today_target}</Text>
                  </Stack>
                  <Stack gap={0}>
                    <Text size="xs" c="dimmed" tt="uppercase">{T.dashboard.newItems}</Text>
                    <Text fw={700}>{todayPlan.new_items_today_target}</Text>
                  </Stack>
                  <Stack gap={0}>
                    <Text size="xs" c="dimmed" tt="uppercase">{T.dashboard.recallPrompts}</Text>
                    <Text fw={700}>{todayPlan.recall_interactions_today_target}</Text>
                  </Stack>
                  <Stack gap={0}>
                    <Text size="xs" c="dimmed" tt="uppercase">{T.dashboard.estTime}</Text>
                    <Text fw={700}>{todayPlan.estimated_minutes_today} {T.dashboard.min}</Text>
                  </Stack>
                </Group>
              </Box>
              <Button
                onClick={() => navigate('/session')}
                fullWidth
                size="md"
                variant="filled"
              >
                {T.dashboard.startTodaysSession}
              </Button>
            </Stack>
          </Card>
        )}

        {/* Quick actions */}
        <Group grow>
          <Link to={continueUrl} className={classes.actionCard}>
            <Group justify="space-between">
              <Box>
                <Text size="sm" fw={500}>{T.dashboard.continueLesson}</Text>
                <Text size="xs" c="dimmed" mt="4">{T.dashboard.nextLesson}</Text>
              </Box>
              <IconChevronRight size={16} />
            </Group>
          </Link>

          <Link to="/session?weak=true" className={classes.actionCard}>
            <Group justify="space-between">
              <Box>
                <Text size="sm" fw={500}>{T.dashboard.practiceWeak}</Text>
                <Text size="xs" c="dimmed" mt="4">{T.dashboard.reviewWeakItems}</Text>
              </Box>
              <IconChevronRight size={16} />
            </Group>
          </Link>
        </Group>

        {/* Progress snapshot */}
        <Card withBorder padding="lg">
          <Stack gap="md">
            <Text size="sm" fw={600}>{T.dashboard.progressSnapshot}</Text>

            {/* Stage breakdown */}
            <Stack gap="sm">
              {[
                { stage: 'maintenance', label: T.dashboard.stable, count: itemsByStage.maintenance, color: 'green' },
                { stage: 'productive', label: T.dashboard.productive, count: itemsByStage.productive, color: 'blue' },
                { stage: 'retrieving', label: T.dashboard.learning, count: itemsByStage.retrieving + itemsByStage.anchoring, color: 'yellow' },
                { stage: 'new', label: T.dashboard.new, count: itemsByStage.new, color: 'gray' },
              ].map((item) => (
                <Box key={item.stage}>
                  <Group justify="space-between" mb="4">
                    <Text size="sm">{item.label}</Text>
                    <Text size="sm" fw={500}>{item.count}</Text>
                  </Group>
                  <Progress
                    value={totalItems > 0 ? (item.count / totalItems) * 100 : 0}
                    color={item.color}
                    size="sm"
                  />
                </Box>
              ))}
              <Text size="xs" c="dimmed" mt="md">
                {T.dashboard.totalItems}: {totalItems}
              </Text>
            </Stack>
          </Stack>
        </Card>
      </Stack>
    </Container>
  )
}

function GoalRow({ goal, T }: { goal: WeeklyGoal, T: any }) {
  const titles: Record<string, string> = {
    consistency: T.dashboard.studyDays,
    recall_quality: T.dashboard.recallQuality,
    usable_vocabulary: T.dashboard.usableWords,
    review_health: T.dashboard.reviewHealth
  }

  const statusColors: Record<string, string> = {
    achieved: 'green',
    on_track: 'blue',
    at_risk: 'orange',
    missed: 'red'
  }

  const formatValue = (val: number, type: string) => {
    if (type === 'recall_quality') return `${Math.round(val * 100)}%`
    return Math.round(val)
  }

  return (
    <Box>
      <Group justify="space-between" mb={4}>
        <Group gap="xs">
          {goal.status === 'achieved' ? (
            <IconCheck size={14} color="var(--mantine-color-green-filled)" />
          ) : goal.status === 'at_risk' ? (
            <IconAlertCircle size={14} color="var(--mantine-color-orange-filled)" />
          ) : (
            <IconTarget size={14} color="var(--mantine-color-blue-filled)" />
          )}
          <Text size="sm" fw={500}>{titles[goal.goal_type]}</Text>
          {goal.is_provisional && (
            <Text size="xs" c="dimmed">({T.dashboard.provisional})</Text>
          )}
        </Group>
        <Text size="sm">
          {formatValue(goal.current_value_numeric, goal.goal_type)} / {formatValue(goal.target_value_numeric, goal.goal_type)}
        </Text>
      </Group>
      <Progress 
        value={(goal.current_value_numeric / goal.target_value_numeric) * 100} 
        color={statusColors[goal.status]} 
        size="sm" 
      />
    </Box>
  )
}
