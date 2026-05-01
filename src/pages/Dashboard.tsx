// src/pages/Dashboard.tsx
import { useEffect, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Stack,
  Text,
  Button,
  Group,
  SimpleGrid,
  Paper,
  Title,
  Tooltip,
} from '@mantine/core'
import { notifications } from '@mantine/notifications'
import {
  IconChevronRight, IconFlame, IconTarget, IconAlertTriangle, IconSparkles,
  IconRefresh, IconKeyboard, IconClock, IconBook,
} from '@tabler/icons-react'
import {
  PageContainer,
  PageBody,
  PageHeader,
  SectionHeading,
  StatCard,
  ListCard,
  ActionCard,
  HeroCard,
  StatusPill,
  LoadingState,
} from '@/components/page/primitives'
import { lessonService } from '@/services/lessonService'
import { learnerStateService } from '@/services/learnerStateService'
import { goalService } from '@/services/goalService'
import type { WeeklyGoalResponse, WeeklyGoal, TodayPlan } from '@/types/learning'
import { useAuthStore } from '@/stores/authStore'
import { useT } from '@/hooks/useT'
import { logError } from '@/lib/logger'
import { supabase } from '@/lib/supabase'
import classes from './Dashboard.module.css'

// ── Ring chart helpers ──

function goalToRingPercent(goal: WeeklyGoal): number {
  if (goal.goal_type === 'review_health') {
    if (goal.target_value_numeric === 0) return goal.current_value_numeric === 0 ? 100 : 0
    return Math.max(0, Math.min(100, Math.round(
      ((goal.target_value_numeric - goal.current_value_numeric) / goal.target_value_numeric) * 100
    )))
  }
  if (goal.goal_unit === 'percent') {
    return Math.round(goal.current_value_numeric * 100)
  }
  if (goal.target_value_numeric === 0) return 0
  return Math.min(100, Math.round((goal.current_value_numeric / goal.target_value_numeric) * 100))
}

const RING_COLOR: Record<string, string> = {
  achieved: 'var(--success)',
  on_track: 'var(--accent-primary)',
  at_risk:  'var(--warning)',
  off_track: 'var(--warning)',
  missed:   'var(--danger)',
}

function goalCountLabel(goal: WeeklyGoal): string {
  return `${Math.round(goal.current_value_numeric)} / ${Math.round(goal.target_value_numeric)}`
}

interface MixSegment { label: string; value: number; color: string }

// eslint-disable-next-line react-refresh/only-export-components
export function computeMixSegments(plan: TodayPlan, T: any): MixSegment[] {
  const reviewCount = Math.max(0, plan.due_reviews_today_target - plan.weak_items_target)
  const segments: MixSegment[] = [
    { label: T.dashboard.mixReviews, value: reviewCount,                           color: 'var(--accent-primary)' },
    { label: T.dashboard.mixNew,     value: plan.new_items_today_target,            color: 'var(--success)' },
    { label: T.dashboard.mixRecall,  value: plan.recall_interactions_today_target,  color: 'var(--mix-recall)' },
    { label: T.dashboard.mixWeak,    value: plan.weak_items_target,                 color: 'var(--warning)' },
  ]
  return segments.filter(s => s.value > 0)
}

function getActionReason(goal: WeeklyGoal, T: any): string {
  const fmt = (v: number) =>
    goal.goal_unit === 'percent' ? `${Math.round(v * 100)}%` : `${Math.round(v)}`
  switch (goal.goal_type) {
    case 'recall_quality':
      return T.dashboard.actionReasonRecall
        .replace('{current}', fmt(goal.current_value_numeric))
        .replace('{target}', fmt(goal.target_value_numeric))
    case 'usable_vocabulary':
      return T.dashboard.actionReasonVocab
        .replace('{current}', `${Math.round(goal.current_value_numeric)}`)
        .replace('{target}', `${Math.round(goal.target_value_numeric)}`)
    case 'review_health':
      return T.dashboard.actionReasonBacklog
        .replace('{current}', `${Math.round(goal.current_value_numeric)}`)
    case 'consistency':
      return T.dashboard.actionReasonConsistency
        .replace('{current}', `${Math.round(goal.current_value_numeric)}`)
        .replace('{target}', `${Math.round(goal.target_value_numeric)}`)
    default:
      return ''
  }
}

// eslint-disable-next-line react-refresh/only-export-components
export function getCtaSubtitle(weeklyGoals: WeeklyGoal[], T: any): string {
  const recall = weeklyGoals.find(g => g.goal_type === 'recall_quality')
  const health = weeklyGoals.find(g => g.goal_type === 'review_health')
  const parts: string[] = []
  if (recall && recall.status !== 'achieved') {
    const gap = Math.round((recall.target_value_numeric - recall.current_value_numeric) * 100)
    if (gap > 0) parts.push(`+${gap}% ${T.dashboard.recallQualityShort}`)
  }
  if (health && health.current_value_numeric > 0) {
    parts.push(`${T.dashboard.reviewHealthLabel} → 0`)
  }
  return parts.length > 0 ? `${T.dashboard.goalLabel}: ${parts.join(' · ')}` : ''
}

function getRecallTooltip(goal: WeeklyGoal, T: any): string {
  const cfg = goal.goal_config_jsonb as Record<string, number> | null
  const hasGap = cfg?.recognition_accuracy != null && cfg?.recall_accuracy != null
    && (cfg.recognition_accuracy - cfg.recall_accuracy) > 0.10
  if (hasGap) {
    return T.dashboard.tooltipRecall
      .replace('{recognition}', Math.round(cfg!.recognition_accuracy * 100).toString())
      .replace('{recall}', Math.round(cfg!.recall_accuracy * 100).toString())
  }
  return T.dashboard.tooltipRecallBalanced
}

function getRingTooltip(goal: WeeklyGoal, T: any): string {
  switch (goal.goal_type) {
    case 'consistency': return T.dashboard.tooltipConsistency
      .replace('{target}', `${Math.round(goal.target_value_numeric)}`)
    case 'recall_quality': return getRecallTooltip(goal, T)
    case 'review_health': return T.dashboard.tooltipBacklog
      .replace('{target}', `${Math.round(goal.target_value_numeric)}`)
    case 'usable_vocabulary': return T.dashboard.tooltipVocab
      .replace('{target}', `${Math.round(goal.target_value_numeric)}`)
    default: return ''
  }
}

function getRingLabel(goal: WeeklyGoal, T: any): string {
  switch (goal.goal_type) {
    case 'consistency': return T.dashboard.consistencyLabel
    case 'recall_quality': return T.dashboard.recallQualityLabel
    case 'review_health': return T.dashboard.reviewHealthLabel
    case 'usable_vocabulary': return T.dashboard.vocabGrowthLabel
    default: return goal.goal_type
  }
}

const STATUS_PILL_TONE: Record<string, 'success' | 'accent' | 'warning' | 'danger'> = {
  achieved: 'success',
  on_track: 'accent',
  at_risk: 'warning',
  off_track: 'warning',
  missed: 'danger',
}

function getStatusLabel(status: string, T: any): string {
  switch (status) {
    case 'achieved': return T.dashboard.statusAchieved
    case 'on_track': return T.dashboard.statusOnTrack
    case 'at_risk':
    case 'off_track': return T.dashboard.statusAtRisk
    case 'missed': return T.dashboard.statusMissed
    default: return status
  }
}

function GoalRing({ goal, T }: { goal: WeeklyGoal; T: any }): ReactNode {
  const percent = goalToRingPercent(goal)
  const ringDeg = Math.round((percent / 100) * 360)
  const ringColor = RING_COLOR[goal.status] ?? 'var(--accent-primary)'
  const tooltipText = getRingTooltip(goal, T)
  const centerDisplay = goal.goal_unit === 'percent'
    ? `${Math.round(goal.current_value_numeric * 100)}%`
    : `${percent}%`
  const targetMarkerDeg = goal.goal_unit === 'percent'
    ? Math.round(goal.target_value_numeric * 360)
    : null

  return (
    <div className={classes.ringWrapper}>
      <div className={classes.ringBg} />
      <div
        className={classes.ringFill}
        style={{ '--ring-color': ringColor, '--ring-deg': `${ringDeg}deg` } as React.CSSProperties}
      />
      {targetMarkerDeg !== null && (
        <div
          className={classes.ringTargetMarker}
          style={{ '--target-deg': `${targetMarkerDeg}deg` } as React.CSSProperties}
        />
      )}
      <Tooltip label={tooltipText} multiline w={260} withArrow>
        <div className={classes.ringCenter} style={{ cursor: 'help' }}>{centerDisplay}</div>
      </Tooltip>
    </div>
  )
}

function GoalStatCard({ goal, T }: { goal: WeeklyGoal; T: any }) {
  const statusLabel = getStatusLabel(goal.status, T)
  const tone = STATUS_PILL_TONE[goal.status] ?? 'accent'
  return (
    <StatCard
      ring={<GoalRing goal={goal} T={T} />}
      label={getRingLabel(goal, T)}
      value={goal.goal_unit === 'count' ? goalCountLabel(goal) : ' '}
      trailing={
        <StatusPill tone={tone}>
          {statusLabel}
          {goal.is_provisional && (
            <Text span size="xs" c="dimmed" ml={4}>({T.dashboard.statusProvisional})</Text>
          )}
        </StatusPill>
      }
    />
  )
}

const GOAL_ACTION_CONFIG: Record<string, {
  title: (T: any) => string
  focus: (T: any) => string
  mode: string
  tone: 'warning' | 'accent'
}> = {
  recall_quality: {
    title: (T) => T.dashboard.improveRecall,
    focus: (T) => T.dashboard.focusRecall,
    mode: 'standard',
    tone: 'warning',
  },
  usable_vocabulary: {
    title: (T) => T.dashboard.improveVocab,
    focus: (T) => T.dashboard.focusVocab,
    mode: 'standard',
    tone: 'accent',
  },
  review_health: {
    title: (T) => T.dashboard.improveBacklog,
    focus: (T) => T.dashboard.focusBacklog,
    mode: 'backlog_clear',
    tone: 'warning',
  },
  consistency: {
    title: (T) => T.dashboard.quickSession,
    focus: (T) => T.dashboard.focusConsistency,
    mode: 'quick',
    tone: 'warning',
  },
}

function GoalActionCard({ goal, T }: { goal: WeeklyGoal; T: any }) {
  const config = GOAL_ACTION_CONFIG[goal.goal_type]
  if (!config) return null
  const reason = getActionReason(goal, T)
  return (
    <ActionCard
      tone={config.tone}
      icon={config.tone === 'warning'
        ? <IconAlertTriangle size={20} />
        : <IconSparkles size={20} />
      }
      title={config.title(T)}
      focus={config.focus(T)}
      reason={reason || undefined}
      to={`/session?mode=${config.mode}`}
    />
  )
}

function TodaysPlanHero({
  plan,
  weeklyGoals,
  onStart,
  T,
}: {
  plan: TodayPlan
  weeklyGoals: WeeklyGoal[]
  onStart: () => void
  T: any
}) {
  const mixSegments = computeMixSegments(plan, T)
  const total = mixSegments.reduce((s, seg) => s + seg.value, 0)
  const ctaSubtitle = getCtaSubtitle(weeklyGoals, T)
  const showMixNote = plan.weak_items_target > 0 && plan.new_items_today_target < 3

  return (
    <HeroCard title={T.dashboard.todaysPlan}>
      <div className={classes.heroV2Stats}>
        <span className={classes.heroV2Stat}>
          <IconRefresh size={16} /> {plan.due_reviews_today_target} {T.dashboard.reviewsLabel}
        </span>
        <span className={classes.heroV2Stat}>
          <IconSparkles size={16} /> {plan.new_items_today_target} {T.dashboard.newLabel}
        </span>
        <span className={classes.heroV2Stat}>
          <IconKeyboard size={16} /> {plan.recall_interactions_today_target} {T.dashboard.recallLabel}
        </span>
      </div>

      <div className={classes.heroV2Subtext}>
        {T.dashboard.basedOnSessionSize.replace('{size}', `${plan.preferred_session_size}`)}
      </div>

      {mixSegments.length > 0 && (
        <div className={classes.mixRatioSection}>
          <div className={classes.mixRatioLabel}>{T.dashboard.sessionComposition}</div>
          <div className={classes.mixBar}>
            {mixSegments.map((seg) => (
              <div
                key={seg.label}
                className={classes.mixBarSegment}
                style={{ width: `${(seg.value / total) * 100}%`, background: seg.color }}
              />
            ))}
          </div>
          <div className={classes.mixLegend}>
            {mixSegments.map((seg) => (
              <span key={seg.label} className={classes.mixLegendItem}>
                <span className={classes.mixLegendDot} style={{ background: seg.color }} />
                {seg.label}
              </span>
            ))}
          </div>
          {showMixNote && (
            <div className={classes.mixNote}>{T.dashboard.mixNoteBacklog}</div>
          )}
        </div>
      )}

      <button className={classes.heroCta} onClick={onStart}>
        <span className={classes.heroCtaMain}>
          <IconClock size={18} />
          {T.dashboard.startTodaysSession} — ~{plan.estimated_minutes_today} min
        </span>
        {ctaSubtitle && (
          <span className={classes.heroCtaSub}>{ctaSubtitle}</span>
        )}
      </button>

      <div className={classes.heroPostNote}>{T.dashboard.postSessionNote}</div>
    </HeroCard>
  )
}

export function Dashboard() {
  const T = useT()
  const navigate = useNavigate()
  const user = useAuthStore((state) => state.user)
  const profile = useAuthStore((state) => state.profile)

  const [loading, setLoading] = useState(true)
  const [continueUrl, setContinueUrl] = useState('/lessons')
  const [goalProgress, setGoalProgress] = useState<WeeklyGoalResponse | null>(null)
  const [currentStreak, setCurrentStreak] = useState(0)
  const [lapsingCount, setLapsingCount] = useState(0)

  useEffect(() => {
    async function fetchData() {
      if (!user) return
      try {
        const progress = await goalService.getGoalProgress(user.id)
        setGoalProgress(progress)

        const [lapsingResult, lessonProgress, lessons] = await Promise.all([
          learnerStateService.getLapsingItems(user.id),
          lessonService.getUserLessonProgress(user.id),
          lessonService.getLessonsBasic(),
        ])
        setLapsingCount(lapsingResult.count)

        const inProgress = lessons.find((l) => {
          const p = lessonProgress.find((lp) => lp.lesson_id === l.id)
          return p && p.completed_at == null && p.sections_completed.length > 0
        })
        const notStarted = lessons.find((l) =>
          !lessonProgress.find((lp) => lp.lesson_id === l.id)
        )
        const target = inProgress ?? notStarted
        if (target) {
          const lessonEntry = lessonProgress.find((lp) => lp.lesson_id === target.id)
          const sectionIndex = lessonEntry?.sections_completed.length ?? 0
          setContinueUrl(`/lessons/${target.id}?section=${sectionIndex}`)
        }

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
      <PageContainer size="lg">
        <PageBody>
          <LoadingState />
        </PageBody>
      </PageContainer>
    )
  }

  const name = profile?.fullName?.split(' ')[0] ?? profile?.email ?? 'User'

  if (goalProgress?.state === 'timezone_required') {
    return (
      <PageContainer size="lg">
        <PageBody>
          <PageHeader title={`${T.dashboard.welcomeBack}, ${name}`} />
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
        </PageBody>
      </PageContainer>
    )
  }

  const todayPlan = goalProgress?.todayPlan
  const weeklyGoals = goalProgress?.weeklyGoals ?? []
  const atRiskGoals = weeklyGoals.filter(g =>
    ['at_risk', 'off_track', 'missed'].includes(g.status)
  )

  return (
    <PageContainer size="lg">
      <PageBody>
        <PageHeader
          title={`${T.dashboard.welcomeBack}, ${name}`}
          action={(
            <Group gap="xs">
              <IconFlame size={18} color="orange" />
              <Text size="sm" fw={600}>{currentStreak} {T.dashboard.daysInARow}</Text>
            </Group>
          )}
        />

        <SectionHeading>{T.dashboard.thisWeek}</SectionHeading>
        <div className={classes.scorecardGrid}>
          {weeklyGoals.map(goal => (
            <GoalStatCard key={goal.id} goal={goal} T={T} />
          ))}
        </div>

        {atRiskGoals.length > 0 && (
          <>
            <SectionHeading>{T.dashboard.recommendedActions}</SectionHeading>
            <Stack gap={10}>
              {atRiskGoals.map(goal => (
                <GoalActionCard key={goal.id} goal={goal} T={T} />
              ))}
            </Stack>
          </>
        )}

        {todayPlan && (
          <TodaysPlanHero
            plan={todayPlan}
            weeklyGoals={weeklyGoals}
            onStart={() => navigate('/session')}
            T={T}
          />
        )}

        <SimpleGrid cols={2}>
          <ListCard
            to={continueUrl}
            icon={<IconBook size={18} color="var(--accent-primary)" />}
            title={T.dashboard.continueLesson}
            subtitle={T.dashboard.nextLesson}
          />
          {lapsingCount > 0
            ? (
              <ActionCard
                tone="danger"
                icon={<IconAlertTriangle size={18} />}
                title={T.dashboard.rescueTitle.replace('{count}', `${lapsingCount}`)}
                focus={`${lapsingCount} ${T.dashboard.lapsesLabel}`}
                reason={T.dashboard.rescueSubtitle}
                to="/session?mode=backlog_clear"
              />
            )
            : (
              <ListCard
                to="/session?mode=backlog_clear"
                icon={<IconChevronRight size={18} />}
                title={T.dashboard.practiceWeak}
                subtitle={T.dashboard.reviewWeakItems}
              />
            )
          }
        </SimpleGrid>
      </PageBody>
    </PageContainer>
  )
}
