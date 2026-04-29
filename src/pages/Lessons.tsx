// src/pages/Lessons.tsx
import { useEffect, useRef, useState } from 'react'
import { Container, Loader, Center } from '@mantine/core'
import { Link } from 'react-router-dom'
import { IconArrowRight, IconBook2, IconChevronRight, IconMap2 } from '@tabler/icons-react'
import {
  extractLessonGrammarTopics,
  lessonService,
} from '@/services/lessonService'
import { useAuthStore } from '@/stores/authStore'
import { useT } from '@/hooks/useT'
import { logError } from '@/lib/logger'
import {
  buildLessonOverviewModel,
  buildLessonOverviewSignals,
  type LessonOverviewExposure,
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
    const completedSections = row.sections_completed ?? []
    if (row.completed_at || completedSections.length > 0) {
      return [{
        lessonId: row.lesson_id,
        exposureKind: 'grammar' as const,
        started: true,
        meaningful: true,
      }]
    }

    return [{
      lessonId: row.lesson_id,
      exposureKind: 'lesson' as const,
      started: true,
      meaningful: false,
    }]
  })
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

        try {
          progressData = await lessonService.getUserLessonProgress(user.id)
        } catch (err) {
          logError({ page: 'lessons', action: 'fetch-progress', error: err })
          if (!cancelled) setProgressRefreshFailed(true)
        }

        const signals = buildLessonOverviewSignals({
          lessons: lessonsData,
          exposures: progressToExposures(progressData),
          capabilityCounts: [],
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
