/* eslint-disable react-refresh/only-export-components */
// Registry of bespoke lesson page elements, keyed by lesson UUID.
//
// This file exports a data map (lessonId → ready-rendered Suspense-wrapped
// element) rather than a component, so react-refresh's "only export
// components" rule is disabled file-wide. The map is read once at route
// resolution; HMR drift here is not load-bearing.
//
// When the runtime visits /lesson/:lessonId, LessonRouter checks this map
// first. If the lesson has a bespoke page, it renders that element;
// otherwise it falls back to the generic LessonReader.
//
// To publish a new lesson's bespoke page:
//   1. Author the page at src/pages/lessons/lesson-<N>/Page.tsx + content.json
//   2. Add the import + entry below, keyed by `<content>.meta.id` (the lesson UUID)
//   3. The /lesson/<uuid> route automatically picks it up

import { lazy, Suspense } from 'react'
import type { ReactElement } from 'react'
import { Center, Loader } from '@mantine/core'

import lesson1Content from '@/pages/lessons/lesson-1/content.json'

const Lesson1Bespoke = lazy(() => import('@/pages/lessons/lesson-1/Page'))

const fallback = <Center h="60vh"><Loader size="lg" /></Center>

export const bespokeLessonElements: Record<string, ReactElement> = {
  [lesson1Content.meta.id]: <Suspense fallback={fallback}><Lesson1Bespoke /></Suspense>,
}
