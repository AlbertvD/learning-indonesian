// src/services/podcastService.ts
import { supabase } from '@/lib/supabase'

/**
 * One sentence of a Story podcast, aligned across the three languages.
 * The canonical shape of `podcasts.transcript_segments` (see ADR 0022). The
 * denormalized `transcript_*` full-text columns are these segments' `id`/`nl`/`en`
 * joined — kept in sync so the current 3-tab reader works without segments.
 */
/**
 * One word of an episode's narration with its audio timing (seconds). Recovered
 * by Google STT word-offsets aligned to the authored script (ADR 0022 amendment
 * 2026-06-28) — the `word` keeps the *authored* spelling/case/punctuation, the
 * `start`/`end` come from the matched recognized word. Drives word-level
 * follow-along highlighting in the reader. Universal ASR / read-along shape.
 */
export interface TimedWord {
  word: string
  start: number
  end: number
}

export interface TranscriptSegment {
  idx: number
  id: string // Indonesian sentence
  nl: string // Dutch
  en: string // English
  /** Per-word timings for follow-along; absent on pre-feature / un-timed episodes. */
  words?: TimedWord[]
}

/**
 * CC attribution for an openly-licensed source episode (Wikibooks, StoryWeaver,
 * Let's Read…). Required to display by CC-BY / CC-BY-SA. NULL for LLM-original
 * episodes — see `podcasts.attribution`.
 */
export interface PodcastAttribution {
  source_title: string
  source_url: string
  author: string
  license: string // e.g. 'CC BY-SA 4.0'
  license_url: string
}

export interface Podcast {
  id: string
  title: string
  description: string | null
  audio_path: string
  transcript_indonesian: string | null
  transcript_english: string | null
  transcript_dutch: string | null
  transcript_segments: TranscriptSegment[] | null
  attribution: PodcastAttribution | null
  level: string | null
  duration_seconds: number | null
  created_at: string
}

export const podcastService = {
  async getPodcasts(): Promise<Podcast[]> {
    const { data, error } = await supabase
      .schema('indonesian')
      .from('podcasts')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) throw error
    return data as Podcast[]
  },

  async getPodcast(podcastId: string): Promise<Podcast> {
    const { data, error } = await supabase
      .schema('indonesian')
      .from('podcasts')
      .select('*')
      .eq('id', podcastId)
      .single()
    if (error) throw error
    return data as Podcast
  },

  getAudioUrl(audioPath: string): string {
    const { data } = supabase.storage
      .from('indonesian-podcasts')
      .getPublicUrl(audioPath)
    return data.publicUrl
  },
}
