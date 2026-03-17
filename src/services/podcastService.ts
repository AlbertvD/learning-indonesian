// src/services/podcastService.ts
import { supabase } from '@/lib/supabase'

export interface Podcast {
  id: string
  title: string
  description: string | null
  audio_path: string
  transcript_indonesian: string | null
  transcript_english: string | null
  transcript_dutch: string | null
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
