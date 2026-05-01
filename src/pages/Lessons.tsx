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
        let preparedLessonIds: string[] = []
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
              return {
                lessonId: lesson.id,
                blocks: await lessonService.getLessonPageBlocks(lessonSourceRefForOverview(lesson)),
              }
            } catch (err) {
              logError({ page: 'lessons', action: `fetch-page-blocks:${lesson.id}`, error: err })
              if (!cancelled) setProgressRefreshFailed(true)
              return { lessonId: lesson.id, blocks: [] }
            }
          }))
          preparedLessonIds = pageBlockGroups
            .filter(group => group.blocks.length > 0)
            .map(group => group.lessonId)
          pageBlocks = pageBlockGroups.flatMap(group => group.blocks)
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
