/* eslint-disable react-refresh/only-export-components */
// Registry of bespoke lesson page elements, keyed by lesson UUID.
//
// This file exports a data map (lessonId → ready-rendered Suspense-wrapped
// element) rather than a component, so react-refresh's "only export
// components" rule is disabled file-wide. The map is read once at route
// resolution; HMR drift here is not load-bearing.
//
// When the runtime visits /lesson/:lessonId, LessonRouter looks the UUID up in
// this map and renders the matching bespoke page. There is no generic fallback
// reader — an unregistered UUID is a not-found case (every published lesson has
// a bespoke page).
//
// Lesson metadata (id / orderIndex / title / level / description) comes from
// the hand-maintained src/pages/lessons/meta.ts, NOT from importing every
// lesson's content.json here. Each lesson's content.json is imported exactly
// once, inside that lesson's own lazily-loaded Page.tsx — so it rides in that
// lesson's lazy chunk instead of bloating every route that reads this
// registry (Lessons list, LessonRouter, LocalPreview). See meta.ts's header
// comment for the full rationale (2026-07-11 prod-ready audit, HIGH bundle
// finding).
//
// To publish a new lesson's bespoke page:
//   1. Author the page at src/pages/lessons/lesson-<N>/Page.tsx + content.json
//   2. Append its meta to src/pages/lessons/meta.ts (in order_index order)
//   3. Add the lazy import + LESSON_COMPONENTS entry below, in the same order
//   4. The /lesson/<uuid> route automatically picks it up

import { lazy, Suspense } from 'react'
import type { ComponentType, ReactElement } from 'react'
import { Center, Loader } from '@mantine/core'

import { bespokeLessonMetas, type BespokeLessonMeta } from '@/pages/lessons/meta'

const Lesson1Bespoke = lazy(() => import('@/pages/lessons/lesson-1/Page'))
const Lesson2Bespoke = lazy(() => import('@/pages/lessons/lesson-2/Page'))
const Lesson3Bespoke = lazy(() => import('@/pages/lessons/lesson-3/Page'))
const Lesson4Bespoke = lazy(() => import('@/pages/lessons/lesson-4/Page'))
const Lesson5Bespoke = lazy(() => import('@/pages/lessons/lesson-5/Page'))
const Lesson6Bespoke = lazy(() => import('@/pages/lessons/lesson-6/Page'))
const Lesson7Bespoke = lazy(() => import('@/pages/lessons/lesson-7/Page'))
const Lesson8Bespoke = lazy(() => import('@/pages/lessons/lesson-8/Page'))
const Lesson9Bespoke = lazy(() => import('@/pages/lessons/lesson-9/Page'))
const Lesson10Bespoke = lazy(() => import('@/pages/lessons/lesson-10/Page'))
const Lesson11Bespoke = lazy(() => import('@/pages/lessons/lesson-11/Page'))
const Lesson12Bespoke = lazy(() => import('@/pages/lessons/lesson-12/Page'))
const Lesson13Bespoke = lazy(() => import('@/pages/lessons/lesson-13/Page'))
const Lesson14Bespoke = lazy(() => import('@/pages/lessons/lesson-14/Page'))
const Lesson15Bespoke = lazy(() => import('@/pages/lessons/lesson-15/Page'))
const Lesson16Bespoke = lazy(() => import('@/pages/lessons/lesson-16/Page'))
const Lesson17Bespoke = lazy(() => import('@/pages/lessons/lesson-17/Page'))
const Lesson18Bespoke = lazy(() => import('@/pages/lessons/lesson-18/Page'))
const Lesson19Bespoke = lazy(() => import('@/pages/lessons/lesson-19/Page'))
const Lesson20Bespoke = lazy(() => import('@/pages/lessons/lesson-20/Page'))
const Lesson21Bespoke = lazy(() => import('@/pages/lessons/lesson-21/Page'))
const Lesson22Bespoke = lazy(() => import('@/pages/lessons/lesson-22/Page'))
const Lesson23Bespoke = lazy(() => import('@/pages/lessons/lesson-23/Page'))
const Lesson24Bespoke = lazy(() => import('@/pages/lessons/lesson-24/Page'))
const Lesson25Bespoke = lazy(() => import('@/pages/lessons/lesson-25/Page'))
const Lesson26Bespoke = lazy(() => import('@/pages/lessons/lesson-26/Page'))
const Lesson27Bespoke = lazy(() => import('@/pages/lessons/lesson-27/Page'))
const Lesson28Bespoke = lazy(() => import('@/pages/lessons/lesson-28/Page'))
const Lesson29Bespoke = lazy(() => import('@/pages/lessons/lesson-29/Page'))
const Lesson30Bespoke = lazy(() => import('@/pages/lessons/lesson-30/Page'))

// Positional correspondence with bespokeLessonMetas: index i here is lesson
// (i + 1)'s lazy component, matching meta.ts's order_index-ordered entries.
const LESSON_COMPONENTS: ComponentType[] = [
  Lesson1Bespoke, Lesson2Bespoke, Lesson3Bespoke, Lesson4Bespoke, Lesson5Bespoke,
  Lesson6Bespoke, Lesson7Bespoke, Lesson8Bespoke, Lesson9Bespoke, Lesson10Bespoke,
  Lesson11Bespoke, Lesson12Bespoke, Lesson13Bespoke, Lesson14Bespoke, Lesson15Bespoke,
  Lesson16Bespoke, Lesson17Bespoke, Lesson18Bespoke, Lesson19Bespoke, Lesson20Bespoke,
  Lesson21Bespoke, Lesson22Bespoke, Lesson23Bespoke, Lesson24Bespoke, Lesson25Bespoke,
  Lesson26Bespoke, Lesson27Bespoke, Lesson28Bespoke, Lesson29Bespoke, Lesson30Bespoke,
]

const fallback = <Center h="60vh"><Loader size="lg" /></Center>

export const bespokeLessonElements: Record<string, ReactElement> = Object.fromEntries(
  bespokeLessonMetas.map((meta, i) => {
    const LessonComponent = LESSON_COMPONENTS[i]
    return [meta.id, <Suspense fallback={fallback}><LessonComponent /></Suspense>]
  }),
)

// Ordered index of the bespoke lessons, derived from meta.ts. Used by the
// local content preview (/preview) to list and render the real bespoke pages
// without Supabase — bespoke pages read their own content.json and their
// footer controls (ActivationGate / PracticeActions) no-op without an
// authenticated user.
export type BespokeLessonPreview = BespokeLessonMeta

export const bespokeLessonPreviews: BespokeLessonPreview[] =
  [...bespokeLessonMetas].sort((a, b) => a.orderIndex - b.orderIndex)

// UUIDs of lessons that have a bespoke page. A lesson is "prepared" (openable —
// its tile links to /lesson/:id) iff it is in this set; the Lessons overview
// derives preparedLessonIds from it. Replaces the retired lesson_page_blocks
// `has_page_blocks` RPC signal — "openable" is a client fact (bespoke page
// exists), not a DB one.
export const bespokeLessonIdSet: ReadonlySet<string> = new Set(
  bespokeLessonMetas.map((m) => m.id),
)

// Hero image path for each bespoke lesson, keyed by order_index — the SAME
// asset the bespoke page shows at its top (its Page.module.css references
// `/lesson-<orderIndex>-hero.<ext>`). The Lessons overview reads this so a tile
// shows its lesson's hero photo, and a newly-published lesson's hero appears on
// the overview automatically with no per-lesson edit. Convention is `.webp`;
// the two legacy heroes (lessons 2 & 3) shipped as `.jpg`.
const HERO_EXT_OVERRIDES: Record<number, string> = { 2: 'jpg', 3: 'jpg' }

export const bespokeLessonHeroByOrderIndex: ReadonlyMap<number, string> = new Map(
  bespokeLessonPreviews.map((p) => [
    p.orderIndex,
    `/lesson-${p.orderIndex}-hero.${HERO_EXT_OVERRIDES[p.orderIndex] ?? 'webp'}`,
  ]),
)
