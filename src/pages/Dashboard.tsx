// src/pages/Dashboard.tsx
//
// Home — a launchpad (foundation plan §7.2): lead with the focal action (start
// today's session) as a hero, then momentum (streak), then a read-only progress
// pulse (this-week practice time + rung movement) that taps through to Voortgang.
// It does NOT reference content surfaces — no lesson activation/continue and no
// word-list selection (those are Leren actions); richer analytics live on Voortgang.
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Text, Button } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { IconTrendingUp, IconTrendingDown, IconArrowUpRight } from '@tabler/icons-react'
import { PageContainer, PageBody, ListCard, LoadingState } from '@/components/page/primitives'
import { StreakBar } from '@/components/dashboard/StreakBar'
import { engagement } from '@/lib/analytics/engagement'
import type { DailyActivity } from '@/lib/analytics/engagement'
import { getWeeklyMovement } from '@/lib/analytics/mastery/masteryModel'
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
  const [currentStreak, setCurrentStreak] = useState(0)
  const [dailyActivity, setDailyActivity] = useState<DailyActivity[]>([])
  const [minutesThisWeek, setMinutesThisWeek] = useState(0)
  const [minutesLastWeek, setMinutesLastWeek] = useState(0)
  const [advancedVocab, setAdvancedVocab] = useState(0)
  const [advancedGrammar, setAdvancedGrammar] = useState(0)
  const [advancedMorphology, setAdvancedMorphology] = useState(0)

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
        const [pt, daily, movement] = await Promise.all([
          engagement.practiceTime(user.id, tz),
          engagement.dailyActivity(user.id, tz, 5),
          getWeeklyMovement(user.id, tz),
        ])
        setCurrentStreak(pt.streakDays)
        setDailyActivity(daily)
        setMinutesThisWeek(pt.minutesThisWeek)
        setMinutesLastWeek(pt.minutesLastWeek)
        setAdvancedVocab(movement.advancedVocab)
        setAdvancedGrammar(movement.advancedGrammar)
        setAdvancedMorphology(movement.advancedMorphology)
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
    advancedVocab + advancedGrammar + advancedMorphology === 0
      ? T.dashboard.movementNone
      : [
          `${advancedVocab} ${T.dashboard.movementWords}`,
          `${advancedGrammar} ${T.dashboard.movementGrammar}`,
          ...(advancedMorphology > 0 ? [`${advancedMorphology} ${T.dashboard.movementMorphology}`] : []),
        ].join(' · ')

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
          <div className={classes.heroTitle}>{T.dashboard.readyToPractice}</div>
          <Button onClick={() => navigate('/session')} size="lg" fullWidth>
            {T.dashboard.startTodaysSessionMinimal}
          </Button>
        </div>

        {/* Momentum */}
        <div className={classes.streakWrap}>
          <StreakBar streakDays={currentStreak} days={dailyActivity} />
        </div>

        {/* Read-only progress pulse — glances that tap through to Voortgang. */}
        <div className={classes.secondary}>
          <ListCard
            to="/progress?tab=time"
            icon={<TrendIcon size={18} color={trendColor} />}
            title={`${minutesThisWeek} ${T.progress.minutesShort} ${T.dashboard.thisWeekLower}`}
            subtitle={deltaLabel}
          />
          <ListCard
            to="/progress?tab=groei"
            icon={<IconArrowUpRight size={18} color="var(--accent-primary)" />}
            title={T.dashboard.movementTitle}
            subtitle={movementSubtitle}
          />
        </div>
      </PageBody>
    </PageContainer>
  )
}
