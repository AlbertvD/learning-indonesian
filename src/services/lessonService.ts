// src/services/lessonService.ts
//
// Thin transport service for the lessons-bucket signed-URL helper. Everything
// else folded into src/lib/lessons/adapter.ts as part of the lib/lessons/ fold
// (docs/plans/2026-05-18-fold-lib-lessons.md).
//
// getSignedAudioUrl stays in services/ as long-form lesson audio bucket transport
// (per target arch §lib/lessons "Not part of this module").
// (getUserLessonProgress removed 2026-07-01 with the lesson_progress table — #150.)

import { supabase } from '@/lib/supabase'
import { logError } from '@/lib/logger'
import { SIGNED_URL_TTL_SECONDS } from '@/lib/signedAudioUrl'

// One lesson's grammar-podcast paths, for the Ontdek "Grammatica podcasts" hub.
// `audio_path` = the NL "Kamoe Bisa" episode, `audio_path_en` = the EN twin;
// either may be null (a lesson can have one language before the other). Both are
// bucket paths — turn them into playable URLs with getSignedAudioUrl(). The row is
// keyed by `order_index`; the hub labels it with a friendly grammar summary from
// GRAMMAR_TOPIC_SUMMARIES (src/lib/lessons/grammarTopicSummaries.ts).
export interface GrammarPodcastRow {
  order_index: number
  audio_path: string | null
  audio_path_en: string | null
}

export const lessonService = {
  // The `indonesian-lessons` bucket is private (entitlement-gating cutover,
  // docs/plans/2026-07-12-oauth-stripe-entitlement-design.md §4) — a raw
  // storage path is no longer playable on its own; every caller resolves
  // through this signed URL. Null on a signing failure (non-entitled user,
  // missing object) — callers already have an absent-audio state.
  async getSignedAudioUrl(audioPath: string): Promise<string | null> {
    const { data, error } = await supabase.storage
      .from('indonesian-lessons')
      .createSignedUrl(audioPath, SIGNED_URL_TTL_SECONDS)
    if (error) {
      logError({ page: 'lesson-service', action: 'getSignedAudioUrl', error })
      return null
    }
    return data.signedUrl
  },

  // Every visible lesson that has a grammar podcast in at least one language,
  // ordered by course position. Hidden system lessons (order_index >= 90, e.g.
  // the loanword/common-words sections) are excluded. The page picks the NL or
  // EN path per the learner's app language.
  async listGrammarPodcasts(): Promise<GrammarPodcastRow[]> {
    const { data, error } = await supabase
      .schema('indonesian')
      .from('lessons')
      .select('order_index, audio_path, audio_path_en')
      .lt('order_index', 90)
      .or('audio_path.not.is.null,audio_path_en.not.is.null')
      .order('order_index')
    if (error) throw error
    return data ?? []
  },
}
