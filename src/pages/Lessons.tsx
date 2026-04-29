// src/pages/Lessons.tsx
import { useEffect, useRef, useState } from 'react'
import { Container, Loader, Center } from '@mantine/core'
import { Link } from 'react-router-dom'
import { IconArrowRight, IconBook2, IconChevronRight, IconMap2 } from '@tabler/icons-react'
import {
  extractLessonGrammarTopics,
  lessonSourceRefForOverview,
  lessonSourceRefsByLesson,
  lessonService,
  type Lesson,
  type LessonCapabilityPracticeSummary,
  type LessonPageBlock,
  type LessonSourceProgressRow,
} from '@/services/lessonService'
import { useAuthStore } from '@/stores/authStore'
import { useT } from '@/hooks/useT'
import { logError } from '@/lib/logger'
import {
  buildLessonOverviewModel,
  buildLessonOverviewSignals,
  type LessonOverviewCapabilityCounts,
  type LessonOverviewExposure,
  type LessonOverviewExposureKind,
  type LessonOverviewModel,
} from '@/lib/lessons/lessonOverviewModel'
import type { LessonOverviewStatus } from '@/lib/lessons/lessonOverviewStatus'
import type { LessonProgress } from '@/types/progress'
import classes from './Lessons.module.css'

const emptyModel: LessonOverviewModel = {
  recommendedLessonId: null,
  recommendedRow: null,
  rows: [],
}

const LESSONS_OVERVIEW_SCROLL_KEY = 'lessons:overview-scroll-y'

function lessonTitle(title: string): string {
  return title.replace(/\s*\([^)]*\)/g, '').trim() || title
}

function readStoredOverviewScrollY(): number | null {
  const raw = sessionStorage.getItem(LESSONS_OVERVIEW_SCROLL_KEY)
  if (!raw) return null
  const value = Number(raw)
  return Number.isFinite(value) && value > 0 ? value : null
}

function rememberOverviewScrollPosition() {
  sessionStorage.setItem(LESSONS_OVERVIEW_SCROLL_KEY, String(window.scrollY || window.pageYOffset || 0))
}

function progressToExposures(progress: LessonProgress[]): LessonOverviewExposure[] {
  return progress.flatMap((row): LessonOverviewExposure[] => {
    return [{
      lessonId: row.lesson_id,
      exposureKind: 'lesson' as const,
      started: true,
      meaningful: false,
    }]
  })
}

const MEANINGFUL_GRAMMAR_SOURCE_EVENTS = new Set([
  'heard_once',
  'intro_completed',
  'pattern_noticing_seen',
  'guided_practice_completed',
  'lesson_completed',
])

const MEANINGFUL_DIALOGUE_SOURCE_EVENTS = new Set([
  'heard_once',
  'section_exposed',
  'guided_practice_completed',
  'lesson_completed',
])

function sourceRefsForBlock(block: LessonPageBlock): string[] {
  return block.source_refs?.length ? block.source_refs : [block.source_ref]
}

function lessonIdBySourceRef(sourceRefsByLesson: Map<string, string[]>): Map<string, string> {
  const result = new Map<string, string>()
  for (const [lessonId, sourceRefs] of sourceRefsByLesson) {
    for (const sourceRef of sourceRefs) {
      if (!result.has(sourceRef)) result.set(sourceRef, lessonId)
    }
  }
  return result
}

function blockByProgressKey(blocks: LessonPageBlock[]): Map<string, LessonPageBlock> {
  const result = new Map<string, LessonPageBlock>()
  for (const block of blocks) {
    result.set(`${block.source_ref}::${block.block_key}`, block)
    for (const sourceRef of sourceRefsForBlock(block)) {
      result.set(`${sourceRef}::${block.block_key}`, block)
    }
  }
  return result
}

function sourceProgressEvents(row: LessonSourceProgressRow): Set<string> {
  return new Set([
    row.current_state,
    ...(row.completed_event_types ?? []),
  ].filter(Boolean))
}

function sourceProgressExposureKind(
  row: LessonSourceProgressRow,
  block: LessonPageBlock | undefined,
  events: Set<string>,
): LessonOverviewExposureKind {
  const payloadType = typeof block?.payload_json?.type === 'string'
    ? block.payload_json.type.toLowerCase()
    : ''
  const sectionRef = row.source_section_ref.toLowerCase()

  if (events.has('opened') || sectionRef.includes('hero')) return 'lesson'
  if (payloadType === 'dialogue' || sectionRef.includes('dialogue')) return 'dialogue'
  if (payloadType === 'culture' || sectionRef.includes('culture')) return 'culture'
  if (payloadType === 'pronunciation' || sectionRef.includes('pronunciation')) return 'pronunciation'
  if (
    payloadType === 'grammar'
    || payloadType === 'reference_table'
    || block?.source_progress_event === 'pattern_noticing_seen'
    || sectionRef.includes('grammar')
    || sectionRef.includes('pattern')
  ) {
    return 'grammar'
  }

  return 'lesson'
}

function isMeaningfulSourceExposure(kind: LessonOverviewExposureKind, events: Set<string>): boolean {
  if (kind === 'grammar') {
    return [...events].some(event => MEANINGFUL_GRAMMAR_SOURCE_EVENTS.has(event))
  }
  if (kind === 'dialogue') {
    return [...events].some(event => MEANINGFUL_DIALOGUE_SOURCE_EVENTS.has(event))
  }
  return false
}

function sourceProgressToExposures(input: {
  progressRows: LessonSourceProgressRow[]
  pageBlocks: LessonPageBlock[]
  sourceRefsByLesson: Map<string, string[]>
}): LessonOverviewExposure[] {
  const lessonIdForSourceRef = lessonIdBySourceRef(input.sourceRefsByLesson)
  const blockForProgress = blockByProgressKey(input.pageBlocks)

  return input.progressRows.flatMap((row): LessonOverviewExposure[] => {
    const lessonId = lessonIdForSourceRef.get(row.source_ref)
    if (!lessonId) return []

    const events = sourceProgressEvents(row)
    const block = blockForProgress.get(`${row.source_ref}::${row.source_section_ref}`)
    const exposureKind = sourceProgressExposureKind(row, block, events)
    return [{
      lessonId,
      exposureKind,
      started: events.size > 0,
      meaningful: isMeaningfulSourceExposure(exposureKind, events),
    }]
  })
}

function summaryToCapabilityCounts(
  lessonId: string,
  summary: LessonCapabilityPracticeSummary,
): LessonOverviewCapabilityCounts {
  const eligibleIntroducedItemCount = Math.max(0, summary.readyCapabilityCount)
  const practicedEligibleItemCount = Math.min(
    eligibleIntroducedItemCount,
    Math.max(0, summary.activePracticedCapabilityCount),
  )

  return {
    lessonId,
    readyItemCount: Math.max(0, eligibleIntroducedItemCount - practicedEligibleItemCount),
    practicedEligibleItemCount,
    eligibleIntroducedItemCount,
    hasAuthoredEligiblePracticeContent: eligibleIntroducedItemCount > 0,
  }
}

function uniqueValues(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))]
}

export function Lessons() {
  const T = useT()
  const [model, setModel] = useState<LessonOverviewModel>(emptyModel)
  const [loading, setLoading] = useState(true)
  const [progressRefreshFailed, setProgressRefreshFailed] = useState(false)
  const [loadFailed, setLoadFailed] = useState(false)
  const didRestoreScrollRef = useRef(false)
  const user = useAuthStore((state) => state.user)

  useEffect(() => {
    let cancelled = false

    async function fetchData() {
      if (!user) {
        setLoading(false)
        return
      }

      setLoading(true)
      setLoadFailed(false)
      setProgressRefreshFailed(false)

      try {
        const lessonsData = await lessonService.getLessons()
        let progressData: LessonProgress[] = []
        let pageBlocks: LessonPageBlock[] = []
        let sourceProgressData: LessonSourceProgressRow[] = []
        let capabilityCounts: LessonOverviewCapabilityCounts[] = []

        try {
          progressData = await lessonService.getUserLessonProgress(user.id)
        } catch (err) {
          logError({ page: 'lessons', action: 'fetch-progress', error: err })
          if (!cancelled) setProgressRefreshFailed(true)
        }

        try {
          const pageBlockGroups = await Promise.all(lessonsData.map(async (lesson: Lesson) => {
            try {
              return await lessonService.getLessonPageBlocks(lessonSourceRefForOverview(lesson))
            } catch (err) {
              logError({ page: 'lessons', action: `fetch-page-blocks:${lesson.id}`, error: err })
              if (!cancelled) setProgressRefreshFailed(true)
              return []
            }
          }))
          pageBlocks = pageBlockGroups.flat()
        } catch (err) {
          logError({ page: 'lessons', action: 'fetch-page-blocks', error: err })
          if (!cancelled) setProgressRefreshFailed(true)
        }

        const sourceRefsByLesson = lessonSourceRefsByLesson(lessonsData, pageBlocks)
        const allSourceRefs = uniqueValues([...sourceRefsByLesson.values()].flat())

        try {
          sourceProgressData = await lessonService.getLessonSourceProgress(user.id, allSourceRefs)
        } catch (err) {
          logError({ page: 'lessons', action: 'fetch-source-progress', error: err })
          if (!cancelled) setProgressRefreshFailed(true)
        }

        try {
          capabilityCounts = await Promise.all(
            [...sourceRefsByLesson.entries()].map(async ([lessonId, sourceRefs]) => (
              summaryToCapabilityCounts(
                lessonId,
                await lessonService.getLessonCapabilityPracticeSummary(user.id, sourceRefs),
              )
            )),
          )
        } catch (err) {
          logError({ page: 'lessons', action: 'fetch-capability-summary', error: err })
          if (!cancelled) setProgressRefreshFailed(true)
        }

        const signals = buildLessonOverviewSignals({
          lessons: lessonsData,
          exposures: [
            ...progressToExposures(progressData),
            ...sourceProgressToExposures({
              progressRows: sourceProgressData,
              pageBlocks,
              sourceRefsByLesson,
            }),
          ],
          capabilityCounts,
        })
        const nextModel = buildLessonOverviewModel({
          lessons: lessonsData,
          signals,
          grammarTopics: extractLessonGrammarTopics(lessonsData),
        })

        if (!cancelled) setModel(nextModel)
      } catch (err) {
        logError({ page: 'lessons', action: 'fetchData', error: err })
        if (!cancelled) {
          setLoadFailed(true)
          setModel(emptyModel)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetchData()

    return () => {
      cancelled = true
    }
  }, [user])

  useEffect(() => {
    if (loading || didRestoreScrollRef.current) return
    didRestoreScrollRef.current = true
    const storedScrollY = readStoredOverviewScrollY()
    if (storedScrollY != null) window.scrollTo(0, storedScrollY)
  }, [loading])

  useEffect(() => () => {
    rememberOverviewScrollPosition()
  }, [])

  if (loading) {
    return (
      <Center h="50vh">
        <Loader size="xl" color="violet" />
      </Center>
    )
  }

  const statusLabels: Record<LessonOverviewStatus, string> = {
    not_started: T.lessons.statusNotStarted,
    in_progress: T.lessons.statusInProgress,
    ready_to_practice: T.lessons.statusReadyToPractice,
    in_practice: T.lessons.statusInPractice,
    practiced: T.lessons.statusPracticed,
    later: T.lessons.statusLater,
  }

  const actionLabel = (action: 'Open lesson' | 'Continue') =>
    action === 'Continue' ? T.lessons.actionContinue : T.lessons.actionOpenLesson

  const recommendedRow = model.recommendedRow
  const isNewLearnerStart = recommendedRow?.orderIndex === 1 && recommendedRow.status === 'not_started'

  return (
    <Container size="lg" className={classes.lessons}>
      <div className={classes.header}>
        <div className={classes.displaySm}>{T.nav.lessons}</div>
      </div>

      {loadFailed && (
        <div className={classes.notice} role="status">
          {T.common.somethingWentWrong}
        </div>
      )}

      {progressRefreshFailed && (
        <div className={classes.notice} role="status">
          {T.lessons.progressRefreshFailed}
        </div>
      )}

      {recommendedRow && (
        <section className={classes.recommendedSection} aria-labelledby="recommended-lesson-heading">
          <div className={classes.recommendedLabel}>
            <IconMap2 size={17} />
            <span>{T.lessons.recommendedLesson}</span>
          </div>
          <Link to={recommendedRow.href} className={classes.recommendedCard} onClick={rememberOverviewScrollPosition}>
            <div className={classes.recommendedText}>
              <h2 id="recommended-lesson-heading" className={classes.recommendedTitle}>
                {isNewLearnerStart ? T.lessons.startWithLesson1 : lessonTitle(recommendedRow.title)}
              </h2>
              <p className={classes.recommendedCopy}>
                {isNewLearnerStart ? T.lessons.startWithLesson1Copy : T.lessons.recommendedLessonCopy}
              </p>
            </div>
            <span className={classes.recommendedAction}>
              {actionLabel(recommendedRow.actionLabel)}
              <IconArrowRight size={16} />
            </span>
          </Link>
        </section>
      )}

      <ol className={classes.lessonList} aria-label={T.lessons.title}>
        {model.rows.map((row) => (
          <li
            key={row.lessonId}
            className={classes.lessonRow}
            data-testid={`lesson-overview-row-${row.lessonId}`}
          >
            <Link to={row.href} className={classes.lessonCard} onClick={rememberOverviewScrollPosition}>
              <span className={classes.lessonNumber}>{row.orderIndex}</span>
              <span className={classes.lessonIcon}>
                <IconBook2 size={18} />
              </span>
              <span className={classes.lessonInfo}>
                <span className={classes.lessonTitle}>{lessonTitle(row.title)}</span>
                {row.grammarTopicTag && (
                  <span className={classes.lessonTag}>{row.grammarTopicTag}</span>
                )}
              </span>
              <span className={classes.lessonStatus} data-status={row.status}>
                {statusLabels[row.status]}
              </span>
              <span className={classes.lessonAction}>
                {actionLabel(row.actionLabel)}
                <IconChevronRight size={15} />
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </Container>
  )
}
