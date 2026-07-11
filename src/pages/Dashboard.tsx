// src/pages/Dashboard.tsx
//
// Home — the launchpad (desktop program slice 3, foundation plan §7.2). A
// two-zone grid on desktop: left leads with the focal action — the deep-green
// "Vandaag" session-preview panel (or the "Aan de slag" first-run checklist
// for accounts that haven't finished the three first-run steps) — followed by
// a continue-reading shortcut and a study tip; right is momentum (streak) and
// the read-only pulses that tap through to Voortgang. Mobile stacks the same
// components in one column.
//
// The session preview calls buildSession as a PURE READ for plan counts only —
// no render contexts, no audio resolution, no DB writes (the learning_sessions
// row only materialises on a first answer). Exactly the Dashboard-preview use
// docs/target-architecture.md:344 blesses.
import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Button, UnstyledButton } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { IconTrendingUp, IconTrendingDown, IconArrowUpRight, IconBook, IconBulb, IconSeeding, IconPuzzle } from '@tabler/icons-react'
import { PageContainer, PageBody, ListCard, LoadingState } from '@/components/page/primitives'
import { StreakBar } from '@/components/dashboard/StreakBar'
import { TodayPanel } from '@/components/dashboard/TodayPanel'
import { FirstRunChecklist, type ChecklistSteps } from '@/components/dashboard/FirstRunChecklist'
import { summarizeSessionPlan, type SessionPreviewCounts } from '@/components/dashboard/sessionPreview'
import { engagement } from '@/lib/analytics/engagement'
import type { DailyActivity } from '@/lib/analytics/engagement'
import { getWeeklyMovement, getTroublesomeWords, type WeeklyMovement, type TroublesomeWord } from '@/lib/analytics/mastery/masteryModel'
import { fetchMnemonicsForRefs } from '@/lib/mnemonics'
import { TroublesomeWordsSheet } from '@/components/mnemonics/TroublesomeWordsSheet'
import { listActivatedLessons } from '@/lib/lessons/activation'
import { getLessonsBasic } from '@/lib/lessons/adapter'
import {
  FIRST_LESSON_OPENED_KEY,
  ONTDEK_VISITED_KEY,
  PRONUNCIATION_VISITED_KEY,
  readFirstRunFlag,
  setFirstRunFlag,
  hasCompletedSession,
} from '@/lib/firstRun'
import { useListening } from '@/contexts/ListeningContext'
import { useSpreektaal } from '@/contexts/SpreektaalContext'
import { useAuthStore } from '@/stores/authStore'
import { useT } from '@/hooks/useT'
import { logError } from '@/lib/logger'
import classes from './Dashboard.module.css'

// Time-of-day greeting — Indonesian in both UI languages (it's the brand
// moment, not translatable copy).
function greeting(hour: number): string {
  if (hour < 11) return 'Selamat pagi'
  if (hour < 15) return 'Selamat siang'
  if (hour < 18) return 'Selamat sore'
  return 'Selamat malam'
}

interface ContinueTarget {
  id: string
  orderIndex: number
  title: string
}

// The troublesome-words nudge's denominator: words the learner keeps missing
// AND hasn't hooked yet (one fetch of the full set, then filtered by the
// existing note map — mirrors MnemonicWordChips' own has-hook read). Fails
// silently to an empty list — a convenience nudge failing to load must not
// block the rest of Home (mirrors the fail-closed/fail-open reads below).
async function loadTroublesomeUnhooked(userId: string): Promise<TroublesomeWord[]> {
  try {
    const troublesome = await getTroublesomeWords(userId)
    if (troublesome.length === 0) return []
    const hooks = await fetchMnemonicsForRefs(userId, troublesome.map((w) => w.sourceRef))
    return troublesome.filter((w) => !hooks.has(w.sourceRef))
  } catch (err) {
    logError({ page: 'dashboard', action: 'troublesomeWords', error: err })
    return []
  }
}

export function Dashboard() {
  const T = useT()
  const navigate = useNavigate()
  const user = useAuthStore((state) => state.user)
  const profile = useAuthStore((state) => state.profile)
  const { listeningEnabled } = useListening()
  const { spreektaalEnabled } = useSpreektaal()
  // Effects key on the stable id, not the user object — the auth store swaps
  // the object reference on TOKEN_REFRESHED (hourly), which must not refetch
  // Home or reset checklist state.
  const userId = user?.id

  const [loading, setLoading] = useState(true)
  const [currentStreak, setCurrentStreak] = useState(0)
  const [dailyActivity, setDailyActivity] = useState<DailyActivity[]>([])
  const [minutesThisWeek, setMinutesThisWeek] = useState(0)
  const [minutesLastWeek, setMinutesLastWeek] = useState(0)
  const [movement, setMovement] = useState<WeeklyMovement | null>(null)
  const [checklist, setChecklist] = useState<ChecklistSteps | null>(null)
  const [continueTarget, setContinueTarget] = useState<ContinueTarget | null>(null)
  const [preview, setPreview] = useState<SessionPreviewCounts | null>(null)
  const [backlog, setBacklog] = useState(0)
  const [previewFailed, setPreviewFailed] = useState(false)
  const [troublesomeUnhooked, setTroublesomeUnhooked] = useState<TroublesomeWord[]>([])
  const [troublesomeSheetOpened, setTroublesomeSheetOpened] = useState(false)
  // Render-stable clock for the greeting / date line / tip-of-day (the purity
  // rule bans new Date() in render; a mid-visit hour change is not worth
  // re-rendering for).
  const [now] = useState(() => new Date())

  useEffect(() => {
    async function fetchData() {
      if (!userId) return
      try {
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
        const [pt, daily, weeklyMovement, sessionDone, activated, lessons, troublesomeUnhookedResult] = await Promise.all([
          engagement.practiceTime(userId, tz),
          engagement.dailyActivity(userId, tz, 7),
          getWeeklyMovement(userId, tz),
          hasCompletedSession(userId).catch(() => true), // fail closed: don't nag established users
          listActivatedLessons(userId).catch(() => new Set<string>()),
          getLessonsBasic().catch(() => []),
          loadTroublesomeUnhooked(userId),
        ])
        setCurrentStreak(pt.streakDays)
        setDailyActivity(daily)
        setMinutesThisWeek(pt.minutesThisWeek)
        setMinutesLastWeek(pt.minutesLastWeek)
        setMovement(weeklyMovement)
        setTroublesomeUnhooked(troublesomeUnhookedResult)
        setChecklist({
          lessonOpened: readFirstRunFlag(FIRST_LESSON_OPENED_KEY),
          sessionDone,
          uitspraakVisited: readFirstRunFlag(PRONUNCIATION_VISITED_KEY),
          ontdekVisited: readFirstRunFlag(ONTDEK_VISITED_KEY),
        })
        const activatedLessons = lessons
          .filter(lesson => activated.has(lesson.id))
          .sort((a, b) => b.order_index - a.order_index)
        const current = activatedLessons[0]
        setContinueTarget(current ? { id: current.id, orderIndex: current.order_index, title: current.title ?? '' } : null)
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
  }, [userId, T.common.error, T.common.somethingWentWrong])

  // Visibility is gated on the ACCOUNT-level signal only (first completed
  // session, fail-closed above) — never on the per-device flags. Steps ① and ③
  // are localStorage ticks, so an established learner on a fresh device would
  // otherwise see the card again with the session hero gone and no way to
  // dismiss it (live report 2026-07-04: mobile had no session entry at all —
  // desktop hides the defect behind the rail CTA). The device flags still
  // drive the step ticks inside the card for genuinely-first-week accounts.
  const showChecklist = checklist != null && !checklist.sessionDone

  // Session preview — only when the Vandaag panel is actually shown, as a pure
  // read (counts only; no contexts/audio). Measured in dev so the plan's
  // "measure, don't guess" fallback decision stays revisitable.
  useEffect(() => {
    if (!userId || loading || showChecklist || preview !== null || previewFailed) return
    let cancelled = false
    async function loadPreview() {
      try {
        // Dynamic import: the session-builder is a heavy module the Session
        // page already lazy-loads; a static import here would drag it into the
        // eager entry chunk (slice-1 bundle rule).
        const { buildSession, sessionBuilderAdapter } = await import('@/lib/session-builder')
        const t0 = performance.now()
        const plan = await buildSession({
          enabled: true,
          sessionId: crypto.randomUUID(),
          userId: userId!,
          mode: 'standard',
          now: new Date(),
          limit: profile?.preferredSessionSize ?? 20,
          preferredSessionSize: profile?.preferredSessionSize ?? 20,
          listeningEnabled,
          spreektaalEnabled,
          adapter: sessionBuilderAdapter,
        })
        if (import.meta.env.DEV) {
          console.debug(`[home] session preview built in ${Math.round(performance.now() - t0)}ms`)
        }
        if (!cancelled) {
          setPreview(summarizeSessionPlan(plan.blocks))
          setBacklog(plan.backlogDueCount)
        }
      } catch (err) {
        logError({ page: 'dashboard', action: 'sessionPreview', error: err })
        if (!cancelled) setPreviewFailed(true)
      }
    }
    loadPreview()
    return () => { cancelled = true }
  }, [userId, loading, showChecklist, preview, previewFailed, profile?.preferredSessionSize, listeningEnabled, spreektaalEnabled])

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
  const locale = (profile?.language ?? 'nl') === 'nl' ? 'nl-NL' : 'en-US'
  const dateLine = now.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' })

  const weekDelta = minutesThisWeek - minutesLastWeek
  const TrendIcon = weekDelta > 0 ? IconTrendingUp : weekDelta < 0 ? IconTrendingDown : IconArrowUpRight
  const trendColor = weekDelta > 0 ? 'var(--success)' : weekDelta < 0 ? 'var(--danger)' : 'var(--text-secondary)'
  const deltaLabel =
    weekDelta === 0
      ? T.dashboard.sameAsLastWeek
      : `${weekDelta > 0 ? '+' : ''}${weekDelta} ${T.dashboard.minVsLastWeek}`

  const dayOfYear = Math.floor(
    (now.getTime() - new Date(now.getFullYear(), 0, 0).getTime()) / 86_400_000,
  )
  const studyTip = T.dashboard.studyTips[dayOfYear % T.dashboard.studyTips.length]

  // Review-backlog insight: when the session is 100% overdue reviews (no new
  // material got in) AND the backlog is larger than a whole session, new
  // introductions are budget-starved (openSlots = max(0, size − dueCount) = 0).
  // Surface a consistency nudge rather than leaving the frozen frontier unexplained.
  const sessionSize = profile?.preferredSessionSize ?? 20
  const showBacklogInsight = preview !== null && preview.newItems === 0 && backlog > sessionSize

  return (
    <PageContainer size="lg">
      <PageBody>
        <header className={classes.greet}>
          <h1>{greeting(now.getHours())}, {name}</h1>
          <p>
            {dateLine}
            {preview !== null && preview.total > 0 && <> · {T.dashboard.greetSessionReady}</>}
          </p>
        </header>

        <div className={classes.grid}>
          <div className={classes.mainCol}>
            {showChecklist ? (
              <FirstRunChecklist
                steps={checklist!}
                onSkipUitspraak={() => {
                  setFirstRunFlag(PRONUNCIATION_VISITED_KEY)
                  setChecklist(c => (c ? { ...c, uitspraakVisited: true } : c))
                }}
                onSkipOntdek={() => {
                  setFirstRunFlag(ONTDEK_VISITED_KEY)
                  setChecklist(c => (c ? { ...c, ontdekVisited: true } : c))
                }}
              />
            ) : preview !== null ? (
              <TodayPanel counts={preview} onStart={() => navigate('/session')} />
            ) : (
              // Preview unavailable (still loading or failed): the plain focal
              // action so Home never blocks on the preview read.
              <div className={classes.fallbackHero}>
                <div className={classes.fallbackTitle}>{T.dashboard.readyToPractice}</div>
                <Button onClick={() => navigate('/session')} size="lg" fullWidth>
                  {T.dashboard.startTodaysSessionMinimal}
                </Button>
              </div>
            )}

            {showBacklogInsight && (
              <ListCard
                tone="sage"
                icon={<IconSeeding size={18} />}
                title={T.dashboard.backlogInsightTitle}
                subtitle={T.dashboard.backlogInsightBody.replace('{n}', String(backlog))}
                trailing={<></>}
              />
            )}

            {continueTarget && (
              <ListCard
                to={`/lesson/${continueTarget.id}`}
                icon={<IconBook size={18} />}
                title={`${T.dashboard.continueLesson} ${continueTarget.orderIndex}${continueTarget.title ? ` · ${continueTarget.title}` : ''}`}
                subtitle={T.dashboard.continueLessonSub}
              />
            )}

            {troublesomeUnhooked.length > 0 && (
              <UnstyledButton onClick={() => setTroublesomeSheetOpened(true)} display="block" w="100%">
                <ListCard
                  icon={<IconPuzzle size={18} />}
                  title={T.dashboard.troublesomeWordsTitle.replace('{n}', String(troublesomeUnhooked.length))}
                  subtitle={T.dashboard.troublesomeWordsSubtitle}
                />
              </UnstyledButton>
            )}

            <ListCard
              icon={<IconBulb size={18} />}
              title={T.dashboard.studyTipTitle}
              subtitle={studyTip}
              trailing={<></>}
            />
          </div>

          <div className={classes.sideCol}>
            <StreakBar streakDays={currentStreak} days={dailyActivity} />

            <ListCard
              to="/progress?tab=time"
              icon={<TrendIcon size={18} color={trendColor} />}
              title={`${minutesThisWeek} ${T.progress.minutesShort} ${T.dashboard.thisWeekLower}`}
              subtitle={deltaLabel}
            />

            <div className={classes.pulseCard}>
              <h3 className={classes.pulseTitle}>{T.dashboard.vocabPulseTitle}</h3>
              <div className={classes.pulseRow}>
                <span>{T.dashboard.vocabPulseUp}</span>
                <b>+{movement?.advancedVocab ?? 0}</b>
              </div>
              <div className={classes.pulseRow}>
                <span>{T.dashboard.vocabPulseMastered}</span>
                <b>{movement?.reachedMastered ?? 0}</b>
              </div>
              <div className={classes.pulseRow}>
                <span>{T.dashboard.vocabPulseSlipped}</span>
                <b>{movement?.slipped ?? 0}</b>
              </div>
              <Link className={classes.pulseLink} to="/progress?tab=woorden">
                {T.dashboard.toProgress} →
              </Link>
            </div>
          </div>
        </div>

        {troublesomeSheetOpened && (
          <TroublesomeWordsSheet
            userId={userId!}
            entries={troublesomeUnhooked}
            onClose={() => setTroublesomeSheetOpened(false)}
          />
        )}
      </PageBody>
    </PageContainer>
  )
}
