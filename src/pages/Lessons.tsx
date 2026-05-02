// src/pages/Lessons.tsx
import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  IconBuildingStore,
  IconWorld,
  IconPlane,
  IconBed,
  IconNotebook,
  IconBuilding,
  IconUmbrella,
  IconShirt,
  IconStethoscope,
  IconBook2,
} from '@tabler/icons-react'
import {
  PageContainer,
  PageBody,
  PageHeader,
  SectionHeading,
  MediaShowcaseCard,
  StatusPill,
  LoadingState,
} from '@/components/page/primitives'
import {
  extractLessonGrammarTopics,
  lessonService,
  type Lesson,
} from '@/services/lessonService'
import { useAuthStore } from '@/stores/authStore'
import { useT } from '@/hooks/useT'
import { logError } from '@/lib/logger'
import {
  buildLessonOverviewModel,
  buildLessonOverviewSignals,
  type LessonOverviewCapabilityCounts,
  type LessonOverviewExposure,
  type LessonOverviewModel,
} from '@/lib/lessons/lessonOverviewModel'
import type { LessonOverviewStatus } from '@/lib/lessons/lessonOverviewStatus'
import classes from './Lessons.module.css'

const emptyModel: LessonOverviewModel = {
  recommendedLessonId: null,
  recommendedRow: null,
  rows: [],
}

// Per-location palette + glyph. Keyed by lesson order_index 1-9. Mirrors the
// course's themed locations: Pasar (market), Indonesia, Bandar Udara
// (airport), Hotel, Belajar (study), Jakarta, Libur Sekolah (school holiday),
// Batik, Puskesmas (clinic). Token-driven would be cleaner long-term, but
// keeping the palette page-local for now lets us iterate on it without
// touching the design system. If a second page wants the same palette
// (Podcasts themed by topic?), we'll hoist it to design tokens.
const LESSON_PALETTES: Record<number, { gradient: string; glyph: ReactNode }> = {
  1: { gradient: 'linear-gradient(135deg, #f59e0b 0%, #ef4444 100%)', glyph: <IconBuildingStore size={64} /> },
  2: { gradient: 'linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)', glyph: <IconWorld size={64} /> },
  3: { gradient: 'linear-gradient(135deg, #06b6d4 0%, #2563eb 100%)', glyph: <IconPlane size={64} /> },
  4: { gradient: 'linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)', glyph: <IconBed size={64} /> },
  5: { gradient: 'linear-gradient(135deg, #10b981 0%, #047857 100%)', glyph: <IconNotebook size={64} /> },
  6: { gradient: 'linear-gradient(135deg, #14b8a6 0%, #0e7490 100%)', glyph: <IconBuilding size={64} /> },
  7: { gradient: 'linear-gradient(135deg, #fb7185 0%, #e11d48 100%)', glyph: <IconUmbrella size={64} /> },
  8: { gradient: 'linear-gradient(135deg, #ec4899 0%, #a21caf 100%)', glyph: <IconShirt size={64} /> },
  9: { gradient: 'linear-gradient(135deg, #06b6d4 0%, #0e7490 100%)', glyph: <IconStethoscope size={64} /> },
}

const LESSON_PALETTE_FALLBACK = {
  gradient: 'linear-gradient(135deg, #71717a 0%, #3f3f46 100%)',
  glyph: <IconBook2 size={64} />,
}

function paletteFor(orderIndex: number, featured = false) {
  const palette = LESSON_PALETTES[orderIndex] ?? LESSON_PALETTE_FALLBACK
  const glyphSize = featured ? 96 : 64
  // Re-render the glyph at the requested size so the featured banner reads
  // bigger without us having to define a separate large-glyph slot.
  const baseGlyph = palette.glyph as React.ReactElement<{ size?: number }>
  const glyph = baseGlyph
    ? <baseGlyph.type {...baseGlyph.props} size={glyphSize} />
    : LESSON_PALETTE_FALLBACK.glyph
  return { gradient: palette.gradient, glyph }
}

function LessonBanner({ orderIndex, featured }: { orderIndex: number; featured?: boolean }) {
  const { gradient, glyph } = paletteFor(orderIndex, featured)
  return (
    <div
      className={classes.banner}
      style={{ background: gradient }}
      aria-hidden="true"
    >
      <span className={classes.bannerGlyph}>{glyph}</span>
      <span className={classes.bannerNumber}>{orderIndex}</span>
    </div>
  )
}

const STATUS_TONE: Record<string, 'success' | 'warning' | 'accent' | 'neutral'> = {
  not_started: 'neutral',
  in_progress: 'accent',
  ready_to_practice: 'accent',
  in_practice: 'accent',
  practiced: 'success',
  later: 'neutral',
  coming_later: 'neutral',
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
        // Single round trip: indonesian.get_lessons_overview(user_id) returns
        // one row per lesson with all the per-user signals + lesson basic info
        // + lesson_sections needed for grammar topic extraction. Replaces the
        // previous fanout of ~20 round trips.
        const overviewRows = await lessonService.getLessonsOverview(user.id)

        // The signals shape that buildLessonOverviewModel expects.
        // We can construct it directly from the SQL rows — every field comes
        // from one column. earlierLessonsSatisfied is computed client-side
        // because it requires walking lessons in order.
        const lessonsData: Lesson[] = overviewRows.map(row => ({
          id: row.lesson_id,
          module_id: '',
          level: '',
          title: row.title,
          description: row.description,
          order_index: row.order_index,
          created_at: '',
          audio_path: row.audio_path,
          duration_seconds: row.duration_seconds,
          transcript_dutch: null,
          transcript_indonesian: null,
          transcript_english: null,
          primary_voice: row.primary_voice,
          dialogue_voices: null,
          lesson_sections: row.lesson_sections,
        }))

        const exposures: LessonOverviewExposure[] = []
        const capabilityCounts: LessonOverviewCapabilityCounts[] = []
        const preparedLessonIds: string[] = []

        for (const row of overviewRows) {
          if (row.has_started_lesson) {
            exposures.push({
              lessonId: row.lesson_id,
              exposureKind: 'lesson',
              started: true,
              meaningful: false,
            })
          }
          if (row.has_meaningful_exposure) {
            // The classification (grammar vs dialogue) is collapsed server-side
            // into a single boolean. Use 'grammar' as the canonical kind for
            // synthesizing the exposure — buildLessonOverviewSignals only
            // checks for any meaningful kind in {grammar, dialogue}.
            exposures.push({
              lessonId: row.lesson_id,
              exposureKind: 'grammar',
              started: true,
              meaningful: true,
            })
          }

          const eligibleIntroducedItemCount = Math.max(0, row.ready_capability_count)
          const practicedEligibleItemCount = Math.min(
            eligibleIntroducedItemCount,
            Math.max(0, row.practiced_eligible_capability_count),
          )
          capabilityCounts.push({
            lessonId: row.lesson_id,
            readyItemCount: Math.max(0, eligibleIntroducedItemCount - practicedEligibleItemCount),
            practicedEligibleItemCount,
            eligibleIntroducedItemCount,
            hasAuthoredEligiblePracticeContent: eligibleIntroducedItemCount > 0,
          })

          // "Prepared" = lesson_page_blocks has rows for this lesson (the
          // lesson reader can render content). Same semantic as the previous
          // page-blocks-fanout fetch; the new SQL function returns the bool
          // pre-aggregated.
          if (row.has_page_blocks) {
            preparedLessonIds.push(row.lesson_id)
          }
        }

        const signals = buildLessonOverviewSignals({
          lessons: lessonsData,
          exposures,
          capabilityCounts,
        })
        const nextModel = buildLessonOverviewModel({
          lessons: lessonsData,
          signals,
          grammarTopics: extractLessonGrammarTopics(lessonsData),
          preparedLessonIds,
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
      <PageContainer size="lg">
        <PageBody>
          <LoadingState />
        </PageBody>
      </PageContainer>
    )
  }

  const statusLabels: Record<LessonOverviewStatus, string> = {
    not_started: T.lessons.statusNotStarted,
    in_progress: T.lessons.statusInProgress,
    ready_to_practice: T.lessons.statusReadyToPractice,
    in_practice: T.lessons.statusInPractice,
    practiced: T.lessons.statusPracticed,
    later: T.lessons.statusLater,
    coming_later: T.lessons.statusComingLater,
  }

  const actionLabel = (action: LessonOverviewModel['rows'][number]['actionLabel']) => {
    if (action === 'Continue') return T.lessons.actionContinue
    if (action === 'Not available yet') return T.lessons.actionNotAvailableYet
    return T.lessons.actionOpenLesson
  }

  const recommendedRow = model.recommendedRow
  const recommendedHref = recommendedRow?.href
  const isNewLearnerStart = recommendedRow?.orderIndex === 1 && recommendedRow.status === 'not_started'

  // Show the recommended lesson as the hero AND keep it in the ordered list
  // below — matches the original behaviour and what the existing tests
  // assert (every lesson must appear in the labelled list).
  const gridRows = model.rows

  return (
    <PageContainer size="lg">
      <PageBody>
        <PageHeader title={T.nav.lessons} />

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

        {recommendedRow && recommendedHref && (
          <section aria-labelledby="recommended-lesson-heading">
            <MediaShowcaseCard
              featured
              banner={<LessonBanner orderIndex={recommendedRow.orderIndex} featured />}
              eyebrow={T.lessons.recommendedLesson}
              title={isNewLearnerStart ? T.lessons.startWithLesson1 : lessonTitle(recommendedRow.title)}
              subtitle={isNewLearnerStart ? T.lessons.startWithLesson1Copy : T.lessons.recommendedLessonCopy}
              cta={actionLabel(recommendedRow.actionLabel)}
              to={recommendedHref}
              status={
                <StatusPill tone={STATUS_TONE[recommendedRow.status] ?? 'neutral'}>
                  {statusLabels[recommendedRow.status]}
                </StatusPill>
              }
            />
          </section>
        )}

        <SectionHeading>{T.lessons.title}</SectionHeading>

        <ol className={classes.lessonGrid} aria-label={T.lessons.title}>
          {gridRows.map((row) => {
            const tone = STATUS_TONE[row.status] ?? 'neutral'
            const isAvailable = Boolean(row.href)
            return (
              <li
                key={row.lessonId}
                className={classes.lessonGridItem}
                data-testid={`lesson-overview-row-${row.lessonId}`}
                onClick={isAvailable ? rememberOverviewScrollPosition : undefined}
              >
                <MediaShowcaseCard
                  banner={<LessonBanner orderIndex={row.orderIndex} />}
                  eyebrow={`LES ${row.orderIndex}`}
                  title={lessonTitle(row.title)}
                  tags={row.grammarTopicTag ? (
                    <span className={classes.grammarTag}>{row.grammarTopicTag}</span>
                  ) : undefined}
                  status={<StatusPill tone={tone}>{statusLabels[row.status]}</StatusPill>}
                  cta={actionLabel(row.actionLabel)}
                  to={row.href ?? undefined}
                  disabled={!isAvailable}
                />
              </li>
            )
          })}
        </ol>
      </PageBody>
    </PageContainer>
  )
}
