// Dispatcher for the /lesson/:lessonId route.
//
// Looks up the lesson UUID in the bespoke-page registry. If a bespoke page
// is published for that lesson, renders it; otherwise falls back to the
// generic Lesson reader. The lookup is synchronous (no DB query) — each
// bespoke page's content.json statically embeds its lesson UUID, so the
// registry keys are resolved at build time.

import { useParams } from 'react-router-dom'
import { Lesson } from '@/pages/Lesson'
import { bespokeLessonElements } from '@/pages/lessons/registry'

export function LessonRouter() {
  const { lessonId } = useParams<{ lessonId: string }>()
  const bespoke = lessonId ? bespokeLessonElements[lessonId] : undefined
  return bespoke ?? <Lesson />
}
