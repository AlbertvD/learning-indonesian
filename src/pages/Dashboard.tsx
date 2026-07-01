// src/pages/Dashboard.tsx
//
// Home — a launchpad (foundation plan §7.2): lead with the focal action (start
// today's session) as a hero, then momentum (streak), a continue-shortcut, and a
// single read-only progress pulse (band-coverage goal → taps through to Voortgang).
// It does NOT browse or activate, and richer analytics (practice time, rung
// movement) live on Voortgang, not here.
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Text, Button } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { IconBook } from '@tabler/icons-react'
import { PageContainer, PageBody, ListCard, LoadingState } from '@/components/page/primitives'
import { StreakBar } from '@/components/dashboard/StreakBar'
import { CommonWordsGoalCard } from '@/components/collections/CommonWordsGoalCard'
import { getLessonsBasic } from '@/lib/lessons'
import { listActivatedLessons } from '@/lib/lessons/activation'
import { engagement } from '@/lib/analytics/engagement'
import type { DailyActivity } from '@/lib/analytics/engagement'
import { useAuthStore } from '@/stores/authStore'
import { useT } from '@/hooks/useT'
import { logError } from '@/lib/logger'
import classes from './Dashboard.module.css'

function todayKey(): string {
  return new Date().toLocaleDateString('en-CA')
}

export function Dashboard() {
  const T = useT()
  const navigate = useNavigate()
  const user = useAuthStore((state) => state.user)
  const profile = useAuthStore((state) => state.profile)

  const [loading, setLoading] = useState(true)
  const [continueUrl, setContinueUrl] = useState('/leren')
  const [continueLessonNo, setContinueLessonNo] = useState<number | null>(null)
  const [currentStreak, setCurrentStreak] = useState(0)
  const [dailyActivity, setDailyActivity] = useState<DailyActivity[]>([])

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
        const [lessons, activated, pt, daily] = await Promise.all([
          getLessonsBasic(),
          listActivatedLessons(user.id),
          engagement.practiceTime(user.id, tz),
          engagement.dailyActivity(user.id, tz, 5),
        ])

        // "Continue lesson" follows ACTIVATION (the queue trigger) — the
        // learner's latest activated lesson.
        const target = lessons
          .filter((l) => activated.has(l.id))
          .sort((a, b) => b.order_index - a.order_index)[0]
        if (target) {
          setContinueUrl(`/lesson/${target.id}`)
          setContinueLessonNo(target.order_index)
        }

        setCurrentStreak(pt.streakDays)
        setDailyActivity(daily)
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

  return (
    <PageContainer size="lg">
      <PageBody>
        {showWelcome && (
          <Text size="sm" c="dimmed" mb="sm">
            {T.dashboard.welcomeBack}, {name}
          </Text>
        )}

        {/* Focal action — lead with it (§7.2), don't bury it below stats. */}
        <div className={classes.hero}>
          <div>
            <div className={classes.heroTitle}>{T.dashboard.readyToPractice}</div>
            <div className={classes.heroSub}>{T.dashboard.nextLesson}</div>
          </div>
          <Button onClick={() => navigate('/session')} size="lg" fullWidth>
            {T.dashboard.startTodaysSessionMinimal}
          </Button>
        </div>

        {/* Momentum */}
        <div className={classes.streakWrap}>
          <StreakBar streakDays={currentStreak} days={dailyActivity} />
        </div>

        {/* Continue-shortcut + a single read-only progress pulse. */}
        <div className={classes.secondary}>
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

          {/* Headline frequency-band coverage — the one glance; taps to Voortgang. */}
          <CommonWordsGoalCard />
        </div>
      </PageBody>
    </PageContainer>
  )
}
