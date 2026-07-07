// src/services/lessonService.ts
//
// Thin transport service for the lessons-bucket public URL helper. Everything
// else folded into src/lib/lessons/adapter.ts as part of the lib/lessons/ fold
// (docs/plans/2026-05-18-fold-lib-lessons.md).
//
// getAudioUrl stays in services/ as long-form lesson audio bucket transport (per
// target arch §lib/lessons "Not part of this module").
// (getUserLessonProgress removed 2026-07-01 with the lesson_progress table — #150.)

import { supabase } from '@/lib/supabase'

// One lesson's grammar-podcast paths, for the Ontdek "Grammatica podcasts" hub.
// `audio_path` = the NL "Kamoe Bisa" episode, `audio_path_en` = the EN twin;
// either may be null (a lesson can have one language before the other). Both are
// bucket paths — turn them into playable URLs with getAudioUrl().
//
// `topics` are the lesson's grammar-pattern names (the reader's Grammatica
// headings) — these episodes are grammar-only, so the hub labels each row by
// its grammar topics rather than the lesson's story/chapter title.
export interface GrammarPodcastRow {
  order_index: number
  topics: string[]
  audio_path: string | null
  audio_path_en: string | null
}

export const lessonService = {
  getAudioUrl(audioPath: string): string {
    const { data } = supabase.storage
      .from('indonesian-lessons')
      .getPublicUrl(audioPath)
    return data.publicUrl
  },

  // Every visible lesson that has a grammar podcast in at least one language,
  // ordered by course position, each tagged with its grammar topics. Hidden
  // system lessons (order_index >= 90, e.g. the loanword/common-words sections)
  // are excluded. The page picks the NL or EN path per the learner's app
  // language. Topics come from grammar_patterns (a small table, ~180 rows) and
  // are joined to lessons client-side.
  async listGrammarPodcasts(): Promise<GrammarPodcastRow[]> {
    const [lessonsRes, patternsRes] = await Promise.all([
      supabase
        .schema('indonesian')
        .from('lessons')
        .select('id, order_index, audio_path, audio_path_en')
        .lt('order_index', 90)
        .or('audio_path.not.is.null,audio_path_en.not.is.null')
        .order('order_index'),
      supabase
        .schema('indonesian')
        .from('grammar_patterns')
        .select('name, introduced_by_lesson_id')
        .not('introduced_by_lesson_id', 'is', null),
    ])
    if (lessonsRes.error) throw lessonsRes.error
    if (patternsRes.error) throw patternsRes.error

    const topicsByLesson = new Map<string, string[]>()
    for (const p of patternsRes.data ?? []) {
      const list = topicsByLesson.get(p.introduced_by_lesson_id) ?? []
      list.push(p.name)
      topicsByLesson.set(p.introduced_by_lesson_id, list)
    }

    return (lessonsRes.data ?? []).map((l) => ({
      order_index: l.order_index,
      audio_path: l.audio_path,
      audio_path_en: l.audio_path_en,
      topics: (topicsByLesson.get(l.id) ?? []).sort((a, b) => a.localeCompare(b, 'nl')),
    }))
  },
}
