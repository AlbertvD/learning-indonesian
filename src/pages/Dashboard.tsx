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
  Paper,
  Title,
  Tooltip,
} from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { IconChevronRight, IconFlame, IconTarget, IconAlertTriangle, IconSparkles, IconRefresh, IconKeyboard, IconClock, IconBook } from '@tabler/icons-react'
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
  // For percent-unit goals, show actual value on the full 0-100% arc so the
  // target marker sits at a meaningful position even when the goal is exceeded.
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

function getStatusPillClass(status: string, classes: Record<string, string>): string {
  switch (status) {
    case 'achieved': return `${classes.statusPill} ${classes.statusPillAchieved}`
    case 'on_track': return `${classes.statusPill} ${classes.statusPillOnTrack}`
    case 'at_risk':
    case 'off_track': return `${classes.statusPill} ${classes.statusPillAtRisk}`
    case 'missed': return `${classes.statusPill} ${classes.statusPillMissed}`
    default: return classes.statusPill
  }
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

export function GoalRingCard({ goal, T }: { goal: WeeklyGoal; T: any }) {
  const percent = goalToRingPercent(goal)
  const ringDeg = Math.round((percent / 100) * 360)
  const ringColor = RING_COLOR[goal.status] ?? 'var(--accent-primary)'
  const tooltipText = getRingTooltip(goal, T)
  const label = getRingLabel(goal, T)
  const statusLabel = getStatusLabel(goal.status, T)
  const centerDisplay = goal.goal_unit === 'percent'
    ? `${Math.round(goal.current_value_numeric * 100)}%`
    : `${percent}%`
  const targetMarkerDeg = goal.goal_unit === 'percent'
    ? Math.round(goal.target_value_numeric * 360)
    : null

  return (
    <div className={classes.ringCard}>
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
      <div className={classes.ringLabel}>{label}</div>
      <div className={classes.ringValue}>
        {goal.goal_unit === 'count' ? goalCountLabel(goal) : '\u00A0'}
      </div>
      <span className={getStatusPillClass(goal.status, classes)}>
        {statusLabel}
        {goal.is_provisional && (
          <Text span size="xs" c="dimmed" ml={4}>({T.dashboard.statusProvisional})</Text>
        )}
      </span>
    </div>
  )
}

const GOAL_ACTION_CONFIG: Record<string, {
  title: (T: any) => string
  focus: (T: any) => string
  mode: string
  variant: 'amber' | 'teal'
}> = {
  recall_quality: {
    title: (T) => T.dashboard.improveRecall,
    focus: (T) => T.dashboard.focusRecall,
    mode: 'recall_sprint',
    variant: 'amber',
  },
  usable_vocabulary: {
    title: (T) => T.dashboard.improveVocab,
    focus: (T) => T.dashboard.focusVocab,
    mode: 'push_to_productive',
    variant: 'teal',
  },
  review_health: {
    title: (T) => T.dashboard.improveBacklog,
    focus: (T) => T.dashboard.focusBacklog,
    mode: 'backlog_clear',
    variant: 'amber',
  },
  consistency: {
    title: (T) => T.dashboard.quickSession,
    focus: (T) => T.dashboard.focusConsistency,
    mode: 'quick',
    variant: 'amber',
  },
}

export function ActionCard({ goal, T }: { goal: WeeklyGoal; T: any }) {
  const config = GOAL_ACTION_CONFIG[goal.goal_type]
  if (!config) return null
  const reason = getActionReason(goal, T)
  const isAmber = config.variant === 'amber'
  const borderClass = isAmber ? classes.actionCardAmberBorder : classes.actionCardTealBorder
  const iconBgClass = isAmber ? classes.actionCardIconAmber : classes.actionCardIconTeal
  const iconColor = isAmber ? 'var(--warning)' : 'var(--accent-primary)'

  return (
    <Link
      to={`/session?mode=${config.mode}`}
      className={`${classes.actionCardBase} ${borderClass}`}
    >
      <div className={`${classes.actionCardIconBox} ${iconBgClass}`}>
        {isAmber
          ? <IconAlertTriangle size={20} color={iconColor} />
          : <IconSparkles size={20} color={iconColor} />
        }
      </div>
      <div className={classes.actionCardBody}>
        <div className={classes.actionCardTitle}>{config.title(T)}</div>
        <div className={classes.actionCardFocus}>{config.focus(T)}</div>
        {reason && <div className={classes.actionCardReason}>{reason}</div>}
      </div>
      <IconChevronRight size={18} className={classes.actionCardChevron} />
    </Link>
  )
}

function HeroCard({
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
    <div className={classes.heroCardV2}>
      <div className={classes.heroV2Title}>{T.dashboard.todaysPlan}</div>

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
    </div>
  )
}

function SecondaryCard({
  href,
  icon,
  title,
  subtitle,
}: {
  href: string
  icon: React.ReactNode
  title: string
  subtitle: string
}) {
  return (
    <Link to={href} className={classes.secondaryCard}>
      <div className={classes.cardLeft}>
        <div className={`${classes.cardIconBox} ${classes.cardIconAccent}`}>{icon}</div>
        <div>
          <div className={classes.cardTitle}>{title}</div>
          <div className={classes.cardSubtitle}>{subtitle}</div>
        </div>
      </div>
      <IconChevronRight size={16} style={{ color: 'var(--text-secondary)', opacity: 0.5 }} />
    </Link>
  )
}

function RescueCard({ count, T }: { count: number; T: any }) {
  if (count === 0) return null
  return (
    <Link to="/session?mode=backlog_clear" className={classes.rescueCard}>
      <span className={classes.lapseBadge}>{count} {T.dashboard.lapsesLabel}</span>
      <div className={classes.cardLeft}>
        <div className={`${classes.cardIconBox} ${classes.cardIconDanger}`}>
          <IconAlertTriangle size={18} color="var(--danger)" />
        </div>
        <div>
          <div className={`${classes.cardTitle} ${classes.cardTitleDanger}`}>
            {T.dashboard.rescueTitle.replace('{count}', `${count}`)}
          </div>
          <div className={classes.cardSubtitle}>
            {T.dashboard.rescueSubtitle.replace(/\{count\}/g, `${count}`)}
          </div>
        </div>
      </div>
    </Link>
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
        // Fetch goal progress and today's plan
        const progress = await goalService.getGoalProgress(user.id)
        setGoalProgress(progress)

        // Fetch lapsing items, lesson progress, and lessons in parallel
        const [lapsingResult, lessonProgress, lessons] = await Promise.all([
          learnerStateService.getLapsingItems(user.id),
          lessonService.getUserLessonProgress(user.id),
          lessonService.getLessonsBasic(),
        ])
        setLapsingCount(lapsingResult.count)

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
          const lessonEntry = lessonProgress.find((lp) => lp.lesson_id === target.id)
          const sectionIndex = lessonEntry?.sections_completed.length ?? 0
          setContinueUrl(`/lessons/${target.id}?section=${sectionIndex}`)
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

  if (goalProgress?.state === 'timezone_required') {
    return (
      <Container size="lg" className={classes.dashboard}>
        <Stack gap="lg">
          <Box>
            <div className={classes.pageTitle}>{T.dashboard.welcomeBack}, {name}</div>
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

  const atRiskGoals = weeklyGoals.filter(g =>
    ['at_risk', 'off_track', 'missed'].includes(g.status)
  )

  return (
    <Container size="lg" className={classes.dashboard}>
      <Stack gap="lg">
        {/* 1. Welcome bar */}
        <Group justify="space-between" align="flex-end">
          <div className={classes.pageTitle}>
            {T.dashboard.welcomeBack}, {name}
          </div>
          <Group gap="xs">
            <IconFlame size={18} color="orange" />
            <Text size="sm" fw={600}>{currentStreak} {T.dashboard.daysInARow}</Text>
          </Group>
        </Group>

        {/* 2. Weekly Scorecard — ring charts */}
        <div>
          <Text fw={600} mb="sm">{T.dashboard.thisWeek}</Text>
          <div className={classes.scorecardGrid}>
            {weeklyGoals.map(goal => (
              <GoalRingCard key={goal.id} goal={goal} T={T} />
            ))}
          </div>
        </div>

        {/* 3. Recommended Actions — only when goals are at risk */}
        {atRiskGoals.length > 0 && (
          <div>
            <Text fw={600} mb="sm">{T.dashboard.recommendedActions}</Text>
            <div className={classes.actionCardList}>
              {atRiskGoals.map(goal => (
                <ActionCard key={goal.id} goal={goal} T={T} />
              ))}
            </div>
          </div>
        )}

        {/* 4. Hero card — today's plan */}
        {todayPlan && (
          <HeroCard
            plan={todayPlan}
            weeklyGoals={weeklyGoals}
            onStart={() => navigate('/session')}
            T={T}
          />
        )}

        {/* 5. Secondary cards */}
        <SimpleGrid cols={2}>
          <SecondaryCard
            href={continueUrl}
            icon={<IconBook size={18} color="var(--accent-primary)" />}
            title={T.dashboard.continueLesson}
            subtitle={T.dashboard.nextLesson}
          />
          {lapsingCount > 0
            ? <RescueCard count={lapsingCount} T={T} />
            : (
              <Link to="/session?mode=backlog_clear" className={classes.secondaryCard}>
                <Group justify="space-between" h="100%">
                  <Box>
                    <Text size="sm" fw={500}>{T.dashboard.practiceWeak}</Text>
                    <Text size="xs" c="dimmed" mt="4">{T.dashboard.reviewWeakItems}</Text>
                  </Box>
                  <IconChevronRight size={16} />
                </Group>
              </Link>
            )
          }
        </SimpleGrid>
      </Stack>
    </Container>
  )
}
