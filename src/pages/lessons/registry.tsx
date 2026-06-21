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
// To publish a new lesson's bespoke page:
//   1. Author the page at src/pages/lessons/lesson-<N>/Page.tsx + content.json
//   2. Add the import + entry below, keyed by `<content>.meta.id` (the lesson UUID)
//   3. The /lesson/<uuid> route automatically picks it up

import { lazy, Suspense } from 'react'
import type { ReactElement } from 'react'
import { Center, Loader } from '@mantine/core'

import lesson1Content from '@/pages/lessons/lesson-1/content.json'
import lesson2Content from '@/pages/lessons/lesson-2/content.json'
import lesson3Content from '@/pages/lessons/lesson-3/content.json'
import lesson4Content from '@/pages/lessons/lesson-4/content.json'
import lesson5Content from '@/pages/lessons/lesson-5/content.json'
import lesson6Content from '@/pages/lessons/lesson-6/content.json'
import lesson7Content from '@/pages/lessons/lesson-7/content.json'
import lesson8Content from '@/pages/lessons/lesson-8/content.json'
import lesson9Content from '@/pages/lessons/lesson-9/content.json'
import lesson10Content from '@/pages/lessons/lesson-10/content.json'
import lesson11Content from '@/pages/lessons/lesson-11/content.json'
import lesson12Content from '@/pages/lessons/lesson-12/content.json'
import lesson13Content from '@/pages/lessons/lesson-13/content.json'
import lesson14Content from '@/pages/lessons/lesson-14/content.json'
import lesson15Content from '@/pages/lessons/lesson-15/content.json'
import lesson16Content from '@/pages/lessons/lesson-16/content.json'
import lesson17Content from '@/pages/lessons/lesson-17/content.json'
import lesson18Content from '@/pages/lessons/lesson-18/content.json'
import lesson19Content from '@/pages/lessons/lesson-19/content.json'
import lesson20Content from '@/pages/lessons/lesson-20/content.json'
import lesson21Content from '@/pages/lessons/lesson-21/content.json'
import lesson22Content from '@/pages/lessons/lesson-22/content.json'
import lesson23Content from '@/pages/lessons/lesson-23/content.json'
import lesson24Content from '@/pages/lessons/lesson-24/content.json'
import lesson25Content from '@/pages/lessons/lesson-25/content.json'
import lesson26Content from '@/pages/lessons/lesson-26/content.json'
import lesson27Content from '@/pages/lessons/lesson-27/content.json'
import lesson28Content from '@/pages/lessons/lesson-28/content.json'
import lesson29Content from '@/pages/lessons/lesson-29/content.json'
import lesson30Content from '@/pages/lessons/lesson-30/content.json'

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

const fallback = <Center h="60vh"><Loader size="lg" /></Center>

export const bespokeLessonElements: Record<string, ReactElement> = {
  [lesson1Content.meta.id]: <Suspense fallback={fallback}><Lesson1Bespoke /></Suspense>,
  [lesson2Content.meta.id]: <Suspense fallback={fallback}><Lesson2Bespoke /></Suspense>,
  [lesson3Content.meta.id]: <Suspense fallback={fallback}><Lesson3Bespoke /></Suspense>,
  [lesson4Content.meta.id]: <Suspense fallback={fallback}><Lesson4Bespoke /></Suspense>,
  [lesson5Content.meta.id]: <Suspense fallback={fallback}><Lesson5Bespoke /></Suspense>,
  [lesson6Content.meta.id]: <Suspense fallback={fallback}><Lesson6Bespoke /></Suspense>,
  [lesson7Content.meta.id]: <Suspense fallback={fallback}><Lesson7Bespoke /></Suspense>,
  [lesson8Content.meta.id]: <Suspense fallback={fallback}><Lesson8Bespoke /></Suspense>,
  [lesson9Content.meta.id]: <Suspense fallback={fallback}><Lesson9Bespoke /></Suspense>,
  [lesson10Content.meta.id]: <Suspense fallback={fallback}><Lesson10Bespoke /></Suspense>,
  [lesson11Content.meta.id]: <Suspense fallback={fallback}><Lesson11Bespoke /></Suspense>,
  [lesson12Content.meta.id]: <Suspense fallback={fallback}><Lesson12Bespoke /></Suspense>,
  [lesson13Content.meta.id]: <Suspense fallback={fallback}><Lesson13Bespoke /></Suspense>,
  [lesson14Content.meta.id]: <Suspense fallback={fallback}><Lesson14Bespoke /></Suspense>,
  [lesson15Content.meta.id]: <Suspense fallback={fallback}><Lesson15Bespoke /></Suspense>,
  [lesson16Content.meta.id]: <Suspense fallback={fallback}><Lesson16Bespoke /></Suspense>,
  [lesson17Content.meta.id]: <Suspense fallback={fallback}><Lesson17Bespoke /></Suspense>,
  [lesson18Content.meta.id]: <Suspense fallback={fallback}><Lesson18Bespoke /></Suspense>,
  [lesson19Content.meta.id]: <Suspense fallback={fallback}><Lesson19Bespoke /></Suspense>,
  [lesson20Content.meta.id]: <Suspense fallback={fallback}><Lesson20Bespoke /></Suspense>,
  [lesson21Content.meta.id]: <Suspense fallback={fallback}><Lesson21Bespoke /></Suspense>,
  [lesson22Content.meta.id]: <Suspense fallback={fallback}><Lesson22Bespoke /></Suspense>,
  [lesson23Content.meta.id]: <Suspense fallback={fallback}><Lesson23Bespoke /></Suspense>,
  [lesson24Content.meta.id]: <Suspense fallback={fallback}><Lesson24Bespoke /></Suspense>,
  [lesson25Content.meta.id]: <Suspense fallback={fallback}><Lesson25Bespoke /></Suspense>,
  [lesson26Content.meta.id]: <Suspense fallback={fallback}><Lesson26Bespoke /></Suspense>,
  [lesson27Content.meta.id]: <Suspense fallback={fallback}><Lesson27Bespoke /></Suspense>,
  [lesson28Content.meta.id]: <Suspense fallback={fallback}><Lesson28Bespoke /></Suspense>,
  [lesson29Content.meta.id]: <Suspense fallback={fallback}><Lesson29Bespoke /></Suspense>,
  [lesson30Content.meta.id]: <Suspense fallback={fallback}><Lesson30Bespoke /></Suspense>,
}

// Ordered index of the bespoke lessons, derived from the same content.json
// metas. Used by the local content preview (/preview) to list and render the
// real bespoke pages without Supabase — bespoke pages read static content.json
// and their footer controls (ActivationGate / PracticeActions) no-op without
// an authenticated user.
export interface BespokeLessonPreview {
  id: string
  orderIndex: number
  title: string
  level: string
  description: string | null
}

export const bespokeLessonPreviews: BespokeLessonPreview[] = [
  lesson1Content.meta, lesson2Content.meta, lesson3Content.meta,
  lesson4Content.meta, lesson5Content.meta, lesson6Content.meta,
  lesson7Content.meta, lesson8Content.meta, lesson9Content.meta,
  lesson10Content.meta, lesson11Content.meta, lesson12Content.meta,
  lesson13Content.meta, lesson14Content.meta, lesson15Content.meta,
  lesson16Content.meta, lesson17Content.meta, lesson18Content.meta,
  lesson19Content.meta, lesson20Content.meta, lesson21Content.meta,
  lesson22Content.meta, lesson23Content.meta, lesson24Content.meta,
  lesson25Content.meta, lesson26Content.meta, lesson27Content.meta,
  lesson28Content.meta, lesson29Content.meta, lesson30Content.meta,
]
  .map(m => ({
    id: m.id,
    orderIndex: m.order_index,
    title: m.title,
    level: m.level,
    description: m.description ?? null,
  }))
  .sort((a, b) => a.orderIndex - b.orderIndex)

// UUIDs of lessons that have a bespoke page. A lesson is "prepared" (openable —
// its tile links to /lesson/:id) iff it is in this set; the Lessons overview
// derives preparedLessonIds from it. Replaces the retired lesson_page_blocks
// `has_page_blocks` RPC signal — "openable" is a client fact (bespoke page
// exists), not a DB one.
export const bespokeLessonIdSet: ReadonlySet<string> = new Set(
  Object.keys(bespokeLessonElements),
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
