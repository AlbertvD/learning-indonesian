// Phase 2 — orchestrator to-do list. Pure: the DB is the source of truth for
// "done" (a non-null audio path column), so the work list is simply derived from
// the lessons' current audio state. Order: ALL Dutch episodes first (by lesson),
// then ALL English — per the agreed NL-first sequencing.

export interface LessonAudioState {
  order_index: number
  audio_path: string | null // NL grammar podcast
  audio_path_en: string | null // EN grammar podcast
  is_hidden?: boolean
}

export interface Episode {
  lesson: number
  lang: 'nl' | 'en'
}

export function buildTodo(lessons: LessonAudioState[]): Episode[] {
  const sorted = lessons
    .filter((l) => !l.is_hidden) // hidden lessons (e.g. the Common Words container) get no podcast
    .slice()
    .sort((a, b) => a.order_index - b.order_index)
  const nl: Episode[] = sorted.filter((l) => !l.audio_path).map((l) => ({ lesson: l.order_index, lang: 'nl' }))
  const en: Episode[] = sorted.filter((l) => !l.audio_path_en).map((l) => ({ lesson: l.order_index, lang: 'en' }))
  return [...nl, ...en] // all NL first, then all EN
}
