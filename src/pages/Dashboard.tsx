// src/pages/Dashboard.tsx
//
// Home — "decide + glance" (CONTEXT.md → Learner Progress Axes). One focal
// action (start session), a small first-of-day greeting, two glanceable "this
// week" cards (practice time with a week-over-week trend cue, and rung movement),
// and "continue lesson" rebased on ACTIVATION (the queue trigger), not the old
// reading-progress heuristic. Richer comparison analytics live on voortgang.
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Stack, Text, Button } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import {
  IconBook,
  IconTrendingUp,
  IconTrendingDown,
  IconArrowUpRight,
} from '@tabler/icons-react'
import { PageContainer, PageBody, ListCard, LoadingState } from '@/components/page/primitives'
import { StreakBar } from '@/components/dashboard/StreakBar'
import { CommonWordsGoalCard } from '@/components/collections/CommonWordsGoalCard'
import { getLessonsBasic } from '@/lib/lessons'
import { listActivatedLessons } from '@/lib/lessons/activation'
import { engagement } from '@/lib/analytics/engagement'
import type { DailyActivity } from '@/lib/analytics/engagement'
import { getWeeklyMovement } from '@/lib/analytics/mastery/masteryModel'
import { useAuthStore } from '@/stores/authStore'
import { useT } from '@/hooks/useT'
import { logError } from '@/lib/logger'

function todayKey(): string {
  return new Date().toLocaleDateString('en-CA')
}

export function Dashboard() {
  const T = useT()
  const navigate = useNavigate()
  const user = useAuthStore((state) => state.user)
  const profile = useAuthStore((state) => state.profile)

  const [loading, setLoading] = useState(true)
  const [continueUrl, setContinueUrl] = useState('/lessons')
  const [continueLessonNo, setContinueLessonNo] = useState<number | null>(null)
  const [currentStreak, setCurrentStreak] = useState(0)
  const [dailyActivity, setDailyActivity] = useState<DailyActivity[]>([])
  const [minutesThisWeek, setMinutesThisWeek] = useState(0)
  const [minutesLastWeek, setMinutesLastWeek] = useState(0)
  const [advancedVocab, setAdvancedVocab] = useState(0)
  const [advancedGrammar, setAdvancedGrammar] = useState(0)

  // Welcome line only on the first Dashboard view of the day.
  const [showWelcome] = useState(() => {
    try {
      const seen = localStorage.getItem('welcome_seen_date')
      if (seen === todayKey()) return false
      localStorage.setItem('welcome_seen_date', todayKey())
      return true
    } catch {
      return true
    }
  })

  useEffect(() => {
    async function fetchData() {
      if (!user) return
      try {
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
        const [lessons, activated, pt, daily, movement] = await Promise.all([
          getLessonsBasic(),
          listActivatedLessons(user.id),
          engagement.practiceTime(user.id, tz),
          engagement.dailyActivity(user.id, tz, 5),
          getWeeklyMovement(user.id, tz),
        ])

        // "Continue lesson" follows ACTIVATION (the queue trigger) — the
        // learner's latest activated lesson — not the retired reading-progress
        // heuristic.
        const target = lessons
          .filter((l) => activated.has(l.id))
          .sort((a, b) => b.order_index - a.order_index)[0]
        if (target) {
          setContinueUrl(`/lesson/${target.id}`)
          setContinueLessonNo(target.order_index)
        }

        setCurrentStreak(pt.streakDays)
        setDailyActivity(daily)
        setMinutesThisWeek(pt.minutesThisWeek)
        setMinutesLastWeek(pt.minutesLastWeek)
        setAdvancedVocab(movement.advancedVocab)
        setAdvancedGrammar(movement.advancedGrammar)
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
      <PageContainer size="lg">
        <PageBody>
          <LoadingState />
        </PageBody>
      </PageContainer>
    )
  }

  const name = profile?.fullName?.split(' ')[0] ?? profile?.email ?? 'User'
  const weekDelta = minutesThisWeek - minutesLastWeek
  const TrendIcon = weekDelta > 0 ? IconTrendingUp : weekDelta < 0 ? IconTrendingDown : IconArrowUpRight
  const trendColor = weekDelta > 0 ? 'var(--success)' : weekDelta < 0 ? 'var(--danger)' : 'var(--text-secondary)'
  const deltaLabel =
    weekDelta === 0
      ? T.dashboard.sameAsLastWeek
      : `${weekDelta > 0 ? '+' : ''}${weekDelta} ${T.dashboard.minVsLastWeek}`
  const movementSubtitle =
    advancedVocab + advancedGrammar === 0
      ? T.dashboard.movementNone
      : `${advancedVocab} ${T.dashboard.movementWords} · ${advancedGrammar} ${T.dashboard.movementGrammar}`

  return (
    <PageContainer size="lg">
      <PageBody>
        {showWelcome && (
          <Text size="sm" c="dimmed" mb="sm">
            {T.dashboard.welcomeBack}, {name}
          </Text>
        )}

        <StreakBar streakDays={currentStreak} days={dailyActivity} />

        <Stack gap="md" mt="md">
          <ListCard
            to="/progress?tab=time"
            icon={<TrendIcon size={18} color={trendColor} />}
            title={`${minutesThisWeek} ${T.progress.minutesShort} ${T.dashboard.thisWeekLower}`}
            subtitle={deltaLabel}
          />

          <ListCard
            to="/progress?tab=funnel"
            icon={<IconArrowUpRight size={18} color="var(--accent-primary)" />}
            title={T.dashboard.movementTitle}
            subtitle={movementSubtitle}
          />

          {/* Headline frequency-band coverage — inert until a band is seeded. */}
          <CommonWordsGoalCard />

          <ListCard
            to={continueUrl}
            icon={<IconBook size={18} color="var(--accent-primary)" />}
            title={
              continueLessonNo != null
                ? `${T.dashboard.continueLesson} ${continueLessonNo}`
                : T.dashboard.continueLesson
            }
            subtitle={T.dashboard.nextLesson}
          />

          <Button onClick={() => navigate('/session')} size="lg" fullWidth>
            {T.dashboard.startTodaysSessionMinimal}
          </Button>
        </Stack>
      </PageBody>
    </PageContainer>
  )
}
