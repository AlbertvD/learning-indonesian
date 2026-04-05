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
  Tooltip,
} from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { IconChevronRight, IconFlame, IconTarget, IconCheck, IconAlertCircle, IconInfoCircle, IconAlertTriangle, IconSparkles } from '@tabler/icons-react'
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

function formatGoalValue(goal: WeeklyGoal): string {
  const fmt = (v: number) =>
    goal.goal_unit === 'percent' ? `${Math.round(v * 100)}%` : `${Math.round(v)}`
  return `${fmt(goal.current_value_numeric)} / ${fmt(goal.target_value_numeric)}`
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
  if (cfg?.recognition_accuracy != null && cfg?.recall_accuracy != null) {
    return T.dashboard.tooltipRecall
      .replace('{recognition}', Math.round(cfg.recognition_accuracy * 100).toString())
      .replace('{recall}', Math.round(cfg.recall_accuracy * 100).toString())
  }
  return T.dashboard.tooltipRecallBalanced
}

function getRingTooltip(goal: WeeklyGoal, T: any): string {
  switch (goal.goal_type) {
    case 'consistency': return T.dashboard.tooltipConsistency
    case 'recall_quality': return getRecallTooltip(goal, T)
    case 'review_health': return T.dashboard.tooltipBacklog
    case 'usable_vocabulary': return T.dashboard.tooltipVocab
      .replace('{current}', `${Math.round(goal.current_value_numeric)}`)
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
  const valueText = formatGoalValue(goal)
  const statusLabel = getStatusLabel(goal.status, T)

  return (
    <div className={classes.ringCard}>
      <div className={classes.ringWrapper}>
        <div className={classes.ringBg} />
        <div
          className={classes.ringFill}
          style={{ '--ring-color': ringColor, '--ring-deg': `${ringDeg}deg` } as React.CSSProperties}
        />
        <div className={classes.ringCenter}>{percent}%</div>
      </div>
      <div className={classes.ringLabel}>{label}</div>
      <div className={classes.ringValue}>{valueText}</div>
      <span className={getStatusPillClass(goal.status, classes)}>
        {statusLabel}
        {goal.is_provisional && (
          <Text span size="xs" c="dimmed" ml={4}>({T.dashboard.statusProvisional})</Text>
        )}
      </span>
      <Tooltip label={tooltipText} multiline w={220} withArrow>
        <span className={classes.ringInfoTrigger}>
          <IconInfoCircle size={12} />
          {T.dashboard.howDoesThisWork}
        </span>
      </Tooltip>
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
                <GoalRow key={goal.id} goal={goal} T={T} />
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
      {(['at_risk', 'off_track', 'missed'] as string[]).includes(goal.status) && GOAL_ACTION_CONFIG[goal.goal_type] && (
        <Button
          component={Link}
          to={`/session?mode=${GOAL_ACTION_CONFIG[goal.goal_type].mode}`}
          variant="light"
          color={goal.status === 'at_risk' ? 'orange' : 'red'}
          size="xs"
          mt={4}
          fullWidth
        >
          {GOAL_ACTION_CONFIG[goal.goal_type].title(T)}
        </Button>
      )}
    </Box>
  )
}
