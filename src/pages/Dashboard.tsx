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
  SimpleGrid,
  Progress,
  Paper,
  Title,
} from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { IconChevronRight, IconFlame, IconTarget, IconCheck, IconAlertCircle } from '@tabler/icons-react'
import type { SessionMode } from '@/lib/sessionEngine'
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
  const [itemsByStage, setItemsByStage] = useState({ new: 0, anchoring: 0, retrieving: 0, productive: 0, maintenance: 0 })
  const [continueUrl, setContinueUrl] = useState('/lessons')
  const [goalProgress, setGoalProgress] = useState<WeeklyGoalResponse | null>(null)
  const [currentStreak, setCurrentStreak] = useState(0)

  useEffect(() => {
    async function fetchData() {
      if (!user) return
      try {
        // Fetch goal progress and today's plan
        const progress = await goalService.getGoalProgress(user.id)
        setGoalProgress(progress)

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

        // Find the lesson to continue
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

        // --- Sophisticated Minutes Today (merged from retention-v2) ---
        const todayUTC = new Date()
        todayUTC.setUTCHours(0, 0, 0, 0)
        
        const { data: todaySessions, error: sessionsError } = await supabase
          .schema('indonesian')
          .from('learning_sessions')
          .select('started_at, ended_at, duration_seconds, id')
          .eq('user_id', user.id)
          .gte('started_at', todayUTC.toISOString())

        if (!sessionsError && todaySessions) {
          const intervals: [number, number][] = []
          for (const session of todaySessions) {
            const start = new Date(session.started_at).getTime()
            let end: number | null = null
            if (session.ended_at) {
              end = new Date(session.ended_at).getTime()
            } else {
              const { data: latestReview } = await supabase
                .schema('indonesian')
                .from('review_events')
                .select('created_at')
                .eq('session_id', session.id)
                .order('created_at', { ascending: false })
                .limit(1)
              end = (latestReview && latestReview.length > 0) ? new Date(latestReview[0].created_at).getTime() : start + 1000
            }
            if (end && end >= start) intervals.push([start, end])
          }
          if (intervals.length > 0) {
            intervals.sort((a, b) => a[0] - b[0])
            const merged: [number, number][] = [intervals[0]]
            for (let i = 1; i < intervals.length; i++) {
              const prev = merged[merged.length - 1]
              const current = intervals[i]
              if (current[0] <= prev[1]) prev[1] = Math.max(prev[1], current[1])
              else merged.push(current)
            }
            // Active study minutes calculation complete (now part of Goal System)
          }
        }

        // --- Sophisticated Streak (merged from retention-v2) ---
        const { data: recentReviews, error: streakError } = await supabase
          .schema('indonesian')
          .from('review_events')
          .select('created_at')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(1000)

        if (!streakError && recentReviews && recentReviews.length > 0) {
          let streak = 0
          const toUTCDateStr = (d: Date) => d.toISOString().split('T')[0]
          const reviewsByDay = new Set<string>()
          for (const review of recentReviews) reviewsByDay.add(toUTCDateStr(new Date(review.created_at)))
          const now = new Date()
          const checkDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
          while (reviewsByDay.has(toUTCDateStr(checkDate))) {
            streak++
            checkDate.setUTCDate(checkDate.getUTCDate() - 1)
          }
          setCurrentStreak(streak)
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
          <Paper className="card-default" p="xl">
            <Stack align="center" gap="md">
              <IconTarget size={48} color="var(--accent-primary)" />
              <Title order={3}>{T.dashboard.setTimezone}</Title>
              <Text c="dimmed" ta="center">
                {T.dashboard.setTimezoneDesc}
              </Text>
              <Button onClick={() => navigate('/profile')} size="md">
                {T.dashboard.goToProfile}
              </Button>
            </Stack>
          </Paper>
        </Stack>
      </Container>
    )
  }

  const todayPlan = goalProgress?.todayPlan
  const weeklyGoals = goalProgress?.weeklyGoals ?? []

  const goalActionConfig: Record<string, { label: string; mode: SessionMode }> = {
    recall_quality:    { label: T.dashboard.improveRecall,  mode: 'recall_sprint' },
    usable_vocabulary: { label: T.dashboard.improveVocab,   mode: 'push_to_productive' },
    review_health:     { label: T.dashboard.improveBacklog, mode: 'backlog_clear' },
    consistency:       { label: T.dashboard.quickSession,   mode: 'quick' },
  }

  return (
    <Container size="md" className={classes.dashboard}>
      <Stack gap="lg">
        {/* Welcome */}
        <Group justify="space-between" align="flex-end">
          <Box>
            <Text size="xl" fw={600}>
              {T.dashboard.welcomeBack}, {name}
            </Text>
          </Box>
          <Group gap="xs">
            <IconFlame size={18} color="orange" />
            <Text size="sm" fw={600}>{currentStreak} {T.dashboard.daysInARow}</Text>
          </Group>
        </Group>

        {/* Weekly Goals Module */}
        <Paper className="card-default">
          <Stack gap="md">
            <Group justify="space-between">
              <Text fw={600}>{T.dashboard.thisWeek}</Text>
              <Text size="xs" c="dimmed">{T.dashboard.mondayStart}</Text>
            </Group>
            
            <Stack gap="sm">
              {weeklyGoals.map(goal => (
                <GoalRow key={goal.id} goal={goal} T={T} goalActionConfig={goalActionConfig} />
              ))}
            </Stack>
          </Stack>
        </Paper>

        {/* Today's Adaptive Plan */}
        {todayPlan && (
          <Paper className={classes.heroCard} p="lg">
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
          </Paper>
        )}

        {/* Quick actions */}
        <SimpleGrid cols={2}>
          <Link to={continueUrl} className="card-action">
            <Group justify="space-between" h="100%">
              <Box>
                <Text size="sm" fw={500}>{T.dashboard.continueLesson}</Text>
                <Text size="xs" c="dimmed" mt="4">{T.dashboard.nextLesson}</Text>
              </Box>
              <IconChevronRight size={16} />
            </Group>
          </Link>

          <Link to="/session?weak=true" className="card-action">
            <Group justify="space-between" h="100%">
              <Box>
                <Text size="sm" fw={500}>{T.dashboard.practiceWeak}</Text>
                <Text size="xs" c="dimmed" mt="4">{T.dashboard.reviewWeakItems}</Text>
              </Box>
              <IconChevronRight size={16} />
            </Group>
          </Link>
        </SimpleGrid>

        {/* Progress snapshot */}
        <Paper className="card-metric">
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
        </Paper>
      </Stack>
    </Container>
  )
}

function GoalRow({ goal, T, goalActionConfig }: { goal: WeeklyGoal, T: any, goalActionConfig: Record<string, { label: string; mode: SessionMode }> }) {
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
            <IconCheck size={14} color="var(--status-success)" />
          ) : goal.status === 'at_risk' ? (
            <IconAlertCircle size={14} color="var(--warning)" />
          ) : (
            <IconTarget size={14} color="var(--accent-primary)" />
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
        value={Math.min(100, (goal.current_value_numeric / goal.target_value_numeric) * 100)}
        color={statusColors[goal.status]}
        size="sm"
      />
      {(['at_risk', 'off_track', 'missed'] as string[]).includes(goal.status) && goalActionConfig[goal.goal_type] && (
        <Button
          component={Link}
          to={`/session?mode=${goalActionConfig[goal.goal_type].mode}`}
          variant="light"
          color={goal.status === 'at_risk' ? 'orange' : 'red'}
          size="xs"
          mt={4}
          fullWidth
        >
          {goalActionConfig[goal.goal_type].label}
        </Button>
      )}
    </Box>
  )
}
