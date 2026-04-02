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
import { IconChevronRight, IconFlame, IconClock, IconTrendingUp } from '@tabler/icons-react'
import { lessonService } from '@/services/lessonService'
import { learnerStateService } from '@/services/learnerStateService'
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
  const [minutesToday, setMinutesToday] = useState(0)
  const [currentStreak, setCurrentStreak] = useState(0)

  useEffect(() => {
    async function fetchData() {
      if (!user) return
      try {
        // Fetch due skills count
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

        // Fetch learning sessions for today's minutes and streak
        const today = new Date()
        today.setHours(0, 0, 0, 0)
        const { data: todaySessions, error: sessionsError } = await supabase
          .schema('indonesian')
          .from('learning_sessions')
          .select('duration_seconds')
          .eq('user_id', user.id)
          .gte('created_at', today.toISOString())

        if (!sessionsError && todaySessions) {
          const totalSeconds = todaySessions.reduce((sum, s) => sum + (s.duration_seconds || 0), 0)
          setMinutesToday(Math.round(totalSeconds / 60))
        }

        // Calculate current streak (simplified: count consecutive days with sessions)
        const { data: recentSessions, error: streakError } = await supabase
          .schema('indonesian')
          .from('learning_sessions')
          .select('created_at')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(30)

        if (!streakError && recentSessions) {
          let streak = 0
          const currentDate = new Date()
          currentDate.setHours(0, 0, 0, 0)

          const sessionsByDay = new Set<string>()
          for (const session of recentSessions) {
            const sessionDate = new Date(session.created_at)
            sessionDate.setHours(0, 0, 0, 0)
            sessionsByDay.add(sessionDate.toDateString())
          }

          const dateIterator = new Date(currentDate)
          while (sessionsByDay.has(dateIterator.toDateString())) {
            streak++
            dateIterator.setDate(dateIterator.getDate() - 1)
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

  return (
    <Container size="md" className={classes.dashboard}>
      <Stack gap="lg">
        {/* Welcome */}
        <Box>
          <Text size="xl" fw={600}>
            {T.dashboard.welcomeBack}, {name}
          </Text>
        </Box>

        {/* Header strip with metrics */}
        <Group grow>
          <Card withBorder padding="md" className={classes.metricCard}>
            <Stack gap="xs">
              <Group justify="space-between">
                <Text size="sm" c="dimmed">{T.dashboard.itemsDue}</Text>
                <IconTrendingUp size={16} />
              </Group>
              <Text size="xl" fw={700}>{dueCount}</Text>
            </Stack>
          </Card>

          <Card withBorder padding="md" className={classes.metricCard}>
            <Stack gap="xs">
              <Group justify="space-between">
                <Text size="sm" c="dimmed">{T.dashboard.minutesToday}</Text>
                <IconClock size={16} />
              </Group>
              <Text size="xl" fw={700}>{minutesToday}</Text>
            </Stack>
          </Card>

          <Card withBorder padding="md" className={classes.metricCard}>
            <Stack gap="xs">
              <Group justify="space-between">
                <Text size="sm" c="dimmed">{T.dashboard.currentStreak}</Text>
                <IconFlame size={16} color="orange" />
              </Group>
              <Text size="xl" fw={700}>{currentStreak}</Text>
            </Stack>
          </Card>
        </Group>

        {/* Hero card: Start Today's Session */}
        <Card withBorder padding="lg" className={classes.heroCard}>
          <Stack gap="md">
            <Box>
              <Text size="lg" fw={600} mb="xs">
                {T.dashboard.startTodaysSession}
              </Text>
              <Text size="sm" c="dimmed">
                {dueCount} {dueCount === 1 ? 'review' : 'reviews'} due • Learn new items
              </Text>
            </Box>
            <Button
              onClick={() => navigate('/session')}
              fullWidth
              size="md"
              variant="filled"
            >
              {T.dashboard.startSession}
            </Button>
          </Stack>
        </Card>

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
