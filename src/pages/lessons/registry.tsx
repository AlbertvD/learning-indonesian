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

const Lesson1Bespoke = lazy(() => import('@/pages/lessons/lesson-1/Page'))
const Lesson2Bespoke = lazy(() => import('@/pages/lessons/lesson-2/Page'))
const Lesson3Bespoke = lazy(() => import('@/pages/lessons/lesson-3/Page'))
const Lesson4Bespoke = lazy(() => import('@/pages/lessons/lesson-4/Page'))
const Lesson5Bespoke = lazy(() => import('@/pages/lessons/lesson-5/Page'))
const Lesson6Bespoke = lazy(() => import('@/pages/lessons/lesson-6/Page'))
const Lesson7Bespoke = lazy(() => import('@/pages/lessons/lesson-7/Page'))
const Lesson8Bespoke = lazy(() => import('@/pages/lessons/lesson-8/Page'))
const Lesson9Bespoke = lazy(() => import('@/pages/lessons/lesson-9/Page'))

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
