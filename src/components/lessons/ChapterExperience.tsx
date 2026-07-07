// ChapterExperience — the shared chapter chrome for bespoke lesson pages.
//
// A bespoke page passes an ordered list of { id, title, node } chapters and
// this component owns ALL navigation behavior, so the 19 lesson pages carry
// zero navigation logic (program spec:
// docs/plans/2026-07-06-lesson-chapter-experience-program.md):
//
//   - current chapter ⇄ URL (`?h=<id>`) — back button and deep links work
//   - segmented, tappable progress header (visited ticks)
//   - next/prev controls; on change: scroll to top + move focus to the
//     chapter container (the pages' aria-labelledby sections must stay
//     reachable for screen readers)
//   - position memory in localStorage + a "Ga verder bij …" resume chip
//     (offer, never auto-jump)
//
// Mount strategy (decided in the spec, coupled to the parity guard): only the
// CURRENT chapter is mounted. The per-lesson content-parity test therefore
// iterates chapter nodes; see lesson-5's parity test. Swipe is deliberately
// absent in v1 — next/prev + tap-to-jump are the load-bearing navigation.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useT } from '@/hooks/useT'
import classes from './ChapterExperience.module.css'

export interface LessonChapter {
  /** Stable slug, unique within the lesson — becomes the `?h=` URL value. */
  id: string
  /** Short label shown in the progress header. */
  title: string
  /** One-line teaser shown in the opening chapter's overview (LessonChapterOverview). */
  description?: string
  node: ReactNode
}

// Chapter contents can navigate (e.g. the opening chapter's overview cards)
// without the page threading callbacks — the chrome provides its nav here.
interface ChapterNav {
  chapters: LessonChapter[]
  currentId: string
  goTo: (id: string) => void
}

const ChapterNavContext = createContext<ChapterNav | null>(null)

// Nullable by design: chapter nodes are also rendered OUTSIDE the experience
// (the content-parity tests mount them in isolation) — navigational chrome
// like LessonChapterOverview renders nothing there instead of throwing.
// eslint-disable-next-line react-refresh/only-export-components -- context-hook export beside its provider (the SessionAudioContext precedent)
export function useChapterNav(): ChapterNav | null {
  return useContext(ChapterNavContext)
}

interface StoredPosition {
  current: string
  visited: string[]
}

const CHAPTER_PARAM = 'h'

function storageKey(lessonId: string): string {
  return `lesson-chapter:${lessonId}`
}

function readPosition(lessonId: string): StoredPosition | null {
  try {
    const raw = window.localStorage.getItem(storageKey(lessonId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as StoredPosition
    if (typeof parsed?.current !== 'string' || !Array.isArray(parsed?.visited)) return null
    return parsed
  } catch {
    return null
  }
}

function writePosition(lessonId: string, position: StoredPosition): void {
  try {
    window.localStorage.setItem(storageKey(lessonId), JSON.stringify(position))
  } catch {
    // Storage full/blocked — position memory is a nicety, never an error.
  }
}

export function ChapterExperience({ lessonId, chapters, hero }: {
  lessonId: string
  chapters: LessonChapter[]
  /**
   * Optional full-bleed lesson hero, shown ABOVE the chapter nav on the
   * cover (first chapter) only — the nav sits under the hero and pins to
   * the top on scroll (position: sticky). Content chapters open with the
   * nav at the top as usual.
   */
  hero?: ReactNode
}) {
  const T = useT()
  const [searchParams, setSearchParams] = useSearchParams()
  const contentRef = useRef<HTMLDivElement | null>(null)
  const headerRef = useRef<HTMLElement | null>(null)
  // Skip the scroll/focus side effect on first render: landing on a lesson
  // (with or without a deep link) is a normal page load, not a chapter change.
  const hasNavigatedRef = useRef(false)

  const param = searchParams.get(CHAPTER_PARAM)
  const currentIndex = Math.max(0, chapters.findIndex(c => c.id === param))
  const current = chapters[currentIndex]

  // Resume offer: only when the learner lands WITHOUT an explicit chapter in
  // the URL and their stored position is somewhere past the first chapter.
  const resume = useMemo(() => {
    if (param) return null
    const stored = readPosition(lessonId)
    if (!stored) return null
    const idx = chapters.findIndex(c => c.id === stored.current)
    return idx > 0 ? chapters[idx] : null
    // eslint-disable-next-line react-hooks/exhaustive-deps -- read once per lesson landing
  }, [lessonId])

  const [visited, setVisited] = useState<Set<string>>(
    () => new Set(readPosition(lessonId)?.visited ?? []),
  )

  useEffect(() => {
    setVisited(prev => (prev.has(current.id) ? prev : new Set(prev).add(current.id)))
    writePosition(lessonId, {
      current: current.id,
      visited: [...new Set([...readPosition(lessonId)?.visited ?? [], current.id])],
    })
  }, [lessonId, current.id])

  useEffect(() => {
    // Keep the current segment visible in the (horizontally scrollable) strip
    // — on mobile a later chapter's pill would otherwise sit off-screen.
    const currentSegment = headerRef.current?.querySelector('[data-current="true"]')
    // Feature-guarded: jsdom (tests) doesn't implement scrollIntoView.
    currentSegment?.scrollIntoView?.({ block: 'nearest', inline: 'center' })
    if (!hasNavigatedRef.current) {
      hasNavigatedRef.current = true
      return
    }
    window.scrollTo({ top: 0 })
    // Move focus to the freshly-mounted chapter so screen readers announce it
    // and keyboard users continue from the top of the new content.
    contentRef.current?.focus({ preventScroll: true })
  }, [current.id])

  const goTo = useCallback((id: string) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      next.set(CHAPTER_PARAM, id)
      return next
    })
  }, [setSearchParams])

  const prev = currentIndex > 0 ? chapters[currentIndex - 1] : null
  const next = currentIndex < chapters.length - 1 ? chapters[currentIndex + 1] : null

  return (
    <div className={classes.experience}>
      {currentIndex === 0 && hero}
      <nav ref={headerRef} className={classes.header} aria-label={T.lessons.chapterNavLabel}>
        <ol className={classes.segments}>
          {chapters.map((chapter, i) => {
            const isCurrent = i === currentIndex
            const isVisited = visited.has(chapter.id)
            // Convention: the FIRST chapter is the lesson's cover — unnumbered
            // (a learner thinks of it as "the start", not "chapter 1"); the
            // content chapters number 1..n-1, matching the overview cards.
            const index = i === 0 ? '◆' : i
            return (
              <li key={chapter.id} className={classes.segmentItem}>
                <button
                  type="button"
                  className={classes.segment}
                  data-current={isCurrent}
                  data-visited={isVisited && !isCurrent}
                  aria-current={isCurrent ? 'step' : undefined}
                  onClick={() => goTo(chapter.id)}
                >
                  <span className={classes.segmentIndex} aria-hidden="true">
                    {isVisited && !isCurrent ? '✓' : index}
                  </span>
                  <span className={classes.segmentTitle}>{chapter.title}</span>
                </button>
              </li>
            )
          })}
        </ol>
        {currentIndex > 0 && (
          <p className={classes.progressLabel}>
            {T.lessons.chapterProgress(currentIndex, chapters.length - 1)}
          </p>
        )}
      </nav>

      {resume && (
        <div className={classes.resumeBand}>
          <button type="button" className={classes.resumeChip} onClick={() => goTo(resume.id)}>
            {T.lessons.chapterResume(resume.title)}
            <span aria-hidden="true"> →</span>
          </button>
        </div>
      )}

      {/* tabIndex -1: programmatic focus target on chapter change (a11y). */}
      <div ref={contentRef} tabIndex={-1} className={classes.content}>
        <ChapterNavContext.Provider value={{ chapters, currentId: current.id, goTo }}>
          {current.node}
        </ChapterNavContext.Provider>
      </div>

      <div className={classes.footerNav}>
        {prev ? (
          <button type="button" className={classes.navButton} onClick={() => goTo(prev.id)}>
            ← {T.lessons.chapterPrev} · {prev.title}
          </button>
        ) : <span />}
        {next && (
          <button type="button" className={classes.navButtonNext} onClick={() => goTo(next.id)}>
            {T.lessons.chapterNext} · {next.title} →
          </button>
        )}
      </div>
    </div>
  )
}
