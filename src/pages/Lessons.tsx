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
  IconMailbox,
  IconBook2,
  IconBook,
  IconAbc,
  IconVolume,
  IconListCheck,
  IconChevronDown,
} from '@tabler/icons-react'
import { useSearchParams } from 'react-router-dom'
import { useMediaQuery } from '@mantine/hooks'
import {
  PageContainer,
  PageBody,
  PageHeader,
  LoadingState,
  ListCard,
} from '@/components/page/primitives'
import { SimpleGrid } from '@mantine/core'
import { LessonCard } from '@/components/lessons/LessonCard'
import { LerenNav } from '@/components/lessons/LerenNav'
import { Woordenlijsten } from '@/components/collections/Woordenlijsten'
import { useAuthStore } from '@/stores/authStore'
import { useT } from '@/hooks/useT'
import { logError } from '@/lib/logger'
import {
  buildLessonOverviewModel,
  extractLessonGrammarTopics,
  getLessonsOverview,
  type Lesson,
  type LessonOverviewCapabilityCounts,
  type LessonOverviewModel,
  type LessonOverviewRow,
} from '@/lib/lessons'
import { groupRowsByLevel, defaultOpenLevel } from '@/lib/lessons/levelGrouping'
import { bespokeLessonIdSet, bespokeLessonHeroByOrderIndex } from '@/pages/lessons/registry'
import classes from './Lessons.module.css'

const emptyModel: LessonOverviewModel = {
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
  10: { gradient: 'linear-gradient(135deg, #0c4a6e 0%, #00c7be 100%)', glyph: <IconMailbox size={64} /> },
}

const LESSON_PALETTE_FALLBACK = {
  gradient: 'linear-gradient(135deg, #71717a 0%, #3f3f46 100%)',
  glyph: <IconBook2 size={64} />,
}

// The overview tile shows the same hero photo as the top of the lesson's
// bespoke page. The hero path is derived once, in the lesson registry
// (bespokeLessonHeroByOrderIndex), from the set of published bespoke lessons —
// so a newly-published lesson's hero appears here automatically. The gradient +
// glyph below remain the fallback for any lesson without a bespoke page (hence
// no hero).

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
  const hero = bespokeLessonHeroByOrderIndex.get(orderIndex)
  return (
    <div
      className={classes.banner}
      style={{ background: gradient }}
      aria-hidden="true"
    >
      {hero ? (
        <>
          <img src={hero} alt="" className={classes.bannerImage} loading="lazy" />
          <span className={classes.bannerScrim} />
        </>
      ) : (
        <span className={classes.bannerGlyph}>{glyph}</span>
      )}
    </div>
  )
}

// The lesson tile surfaces two single-sourced facts: activation (the pill) and
// % mastered (the subtitle). Tone tracks activation + mastery: a fully-mastered
// activated lesson reads success, an in-progress activated lesson reads accent,
// everything else neutral.
function activationTone(row: LessonOverviewRow): 'success' | 'accent' | 'neutral' {
  if (!row.isPrepared || !row.isActivated) return 'neutral'
  return row.masteredPercent === 100 ? 'success' : 'accent'
}

const LESSONS_OVERVIEW_SCROLL_KEY = 'lessons:overview-scroll-y'

// Per-tile short titles for lessons whose canonical title is too long to sit
// over the banner. This is a TILE-SCOPED display override — it does NOT mutate
// lessons.title (the reader header and other surfaces still use the full one).
// Keyed by order_index.
const SHORT_TITLE_BY_ORDER: Record<number, string> = {
  14: 'De islam in Indonesië',
}

// Display title for a tile: strip the "Les N -" prefix and any "(parenthetical)"
// from the canonical title. The card shows the topic only — the number is shown
// separately in the banner.
function lessonTitle(title: string): string {
  return title
    .replace(/^\s*les\s*\d*\s*[-—–]\s*/i, '')
    .replace(/\s*\([^)]*\)/g, '')
    .trim() || title
}

function displayTitle(orderIndex: number, title: string): string {
  return SHORT_TITLE_BY_ORDER[orderIndex] ?? lessonTitle(title)
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
  const isMobile = useMediaQuery('(max-width: 768px)') ?? false
  // The selected surface is addressable via ?v= so the desktop switcher (LerenNav)
  // and the mobile hub both drive it by navigation: no ?v = Lessen (desktop) /
  // the hub (mobile); ?v=woorden = Woordenlijsten. Affix/Uitspraak are their own
  // routes. `activeSurface` mirrors LerenNav's derivation.
  const [searchParams] = useSearchParams()
  const surface = searchParams.get('v') === 'woorden' ? 'woordenlijsten' : 'lessen'
  const [openLevel, setOpenLevel] = useState<string | null>(null)
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
        const overviewRows = await getLessonsOverview(user.id)

        // The signals shape that buildLessonOverviewModel expects.
        // We can construct it directly from the SQL rows — every field comes
        // from one column. earlierLessonsSatisfied is computed client-side
        // because it requires walking lessons in order.
        const lessonsData: Lesson[] = overviewRows.map(row => ({
          id: row.lesson_id,
          module_id: '',
          level: row.level ?? '',
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

        const counts: LessonOverviewCapabilityCounts[] = []
        const preparedLessonIds: string[] = []

        for (const row of overviewRows) {
          // Two single-sourced facts per lesson: activation (pure
          // learner_lesson_activation EXISTS) and the introducible/mastered
          // counts that yield % mastered. See
          // docs/plans/2026-06-09-lesson-status-two-sources-design.md.
          counts.push({
            lessonId: row.lesson_id,
            isActivated: row.is_activated,
            masteredCount: Math.max(0, row.mastered_capability_count),
            practicedCount: Math.max(0, row.practiced_capability_count),
            introducibleCount: Math.max(0, row.ready_capability_count),
          })

          // "Prepared" = the lesson has a bespoke page (its tile links to
          // /lesson/:id and the reader can render it). This is a client fact —
          // registry membership — not a DB one; it replaces the retired
          // lesson_page_blocks `has_page_blocks` RPC signal.
          if (bespokeLessonIdSet.has(row.lesson_id)) {
            preparedLessonIds.push(row.lesson_id)
          }
        }

        const nextModel = buildLessonOverviewModel({
          lessons: lessonsData,
          counts,
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

  // Open the learner's current CEFR level by default once the model loads; keep
  // their choice thereafter (single-open accordion).
  useEffect(() => {
    setOpenLevel((prev) => prev ?? defaultOpenLevel(groupRowsByLevel(model.rows)))
  }, [model])

  if (loading) {
    return (
      <PageContainer size="lg">
        <PageBody>
          <LoadingState />
        </PageBody>
      </PageContainer>
    )
  }

  const activationLabel = (row: LessonOverviewRow): string => {
    if (!row.isPrepared) return T.lessons.statusComingLater
    return row.isActivated ? T.lessons.statusActive : T.lessons.statusNotStarted
  }

  const renderCard = (row: LessonOverviewRow) => {
    const isAvailable = Boolean(row.href)
    return (
      <li
        key={row.lessonId}
        className={classes.lessonGridItem}
        data-testid={`lesson-overview-row-${row.lessonId}`}
        onClick={isAvailable ? rememberOverviewScrollPosition : undefined}
      >
        <LessonCard
          banner={<LessonBanner orderIndex={row.orderIndex} />}
          orderIndex={row.orderIndex}
          title={displayTitle(row.orderIndex, row.title)}
          level={row.level}
          grammarTopics={row.grammarTopicTag}
          practiced={{ label: T.lessons.practiced, percent: row.practicedPercent }}
          mastered={{ label: T.lessons.mastered, percent: row.masteredPercent }}
          status={{ tone: activationTone(row), label: activationLabel(row) }}
          to={row.href ?? undefined}
          disabled={!isAvailable}
        />
      </li>
    )
  }

  const groups = groupRowsByLevel(model.rows)

  const notices = (
    <>
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
    </>
  )

  // Lessons grouped into collapsible CEFR sections (§7.3) so 30 lessons aren't a
  // long scroll; the current level opens by default.
  const lessenGroups = groups.map((group) => {
    const open = openLevel === group.level
    return (
      <section key={group.level} className={classes.levelSection}>
        <button
          type="button"
          className={classes.levelHeader}
          aria-expanded={open}
          onClick={() => setOpenLevel(open ? null : group.level)}
        >
          <span className={classes.levelName}>{group.level}</span>
          <span className={classes.levelMeta}>
            {group.rows.length} {T.leren.lessenTab.toLowerCase()} · {group.masteredPercent}% {T.lessons.mastered.toLowerCase()}
          </span>
          <IconChevronDown
            size={18}
            className={`${classes.levelChevron} ${open ? classes.levelChevronOpen : ''}`}
          />
        </button>
        {open && (
          <ol className={classes.lessonGrid} aria-label={group.level}>
            {group.rows.map(renderCard)}
          </ol>
        )}
      </section>
    )
  })

  const surfaceContent = (which: 'lessen' | 'woordenlijsten') =>
    which === 'lessen' ? <>{notices}{lessenGroups}</> : <Woordenlijsten />

  // Mobile, no surface selected: the four surfaces are a hub of descriptive
  // cards that divide the viewport height. Each opens its surface full-width
  // (Lessen/Woordenlijsten via ?v= on this page; Affix/Uitspraak their routes),
  // which then shows a back link — the shape the trainers already use.
  const noSurfaceSelected = !searchParams.get('v')
  if (isMobile && noSurfaceSelected) {
    // Mobile only: the four Leren surfaces as one shared card (ListCard
    // `feature` + a per-surface tone from the brand ramp), stacked as the /leren
    // landing. On desktop the switcher row (LerenNav) is always shown and /leren
    // lands straight on Lessen — so there's no "pick a card, then a menu appears"
    // detour on a screen with room for the persistent row.
    return (
      <PageContainer size="lg">
        <PageBody>
          <PageHeader title={T.nav.leren} subtitle={T.leren.subtitle} />
          <SimpleGrid cols={{ base: 1 }} spacing="sm" mt="md">
            <ListCard
              feature
              tone="accent"
              to="/leren?v=lessen"
              icon={<IconBook size={25} />}
              title={T.leren.lessenTab}
              subtitle={T.leren.lessenDesc}
            />
            <ListCard
              feature
              tone="gold"
              to="/leren?v=woorden"
              icon={<IconListCheck size={25} />}
              title={T.collections.title}
              subtitle={T.leren.woordenlijstenDesc}
            />
            <ListCard
              feature
              tone="teal"
              to="/morphology"
              icon={<IconAbc size={25} />}
              title={T.leren.affixTitle}
              subtitle={T.leren.affixDesc}
            />
            <ListCard
              feature
              tone="sage"
              to="/pronunciation"
              icon={<IconVolume size={25} />}
              title={T.leren.pronunciationTitle}
              subtitle={T.leren.pronunciationDesc}
            />
          </SimpleGrid>
        </PageBody>
      </PageContainer>
    )
  }

  if (isMobile) {
    return (
      <PageContainer size="lg">
        <PageBody>
          <LerenNav />
          <PageHeader title={surface === 'lessen' ? T.leren.lessenTab : T.collections.title} />
          {surfaceContent(surface)}
        </PageBody>
      </PageContainer>
    )
  }

  // Desktop: the four icons persist at the top for every surface (LerenNav is
  // rendered here and on the Affix/Uitspraak trainer pages), with the selected
  // surface's content underneath. Lessen/Woordenlijsten swap via ?v=.
  return (
    <PageContainer size="lg">
      <PageBody>
        <PageHeader title={T.nav.leren} />
        <LerenNav />
        {surfaceContent(surface)}
      </PageBody>
    </PageContainer>
  )
}
