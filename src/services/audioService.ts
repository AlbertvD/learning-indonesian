import { supabase } from '@/lib/supabase'
import { normalizeTtsText } from '@/lib/ttsNormalize'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL

export type SessionAudioMap = Map<string, string> // normalized_text → storage_path

export async function fetchSessionAudioMap(texts: string[]): Promise<SessionAudioMap> {
  if (texts.length === 0) return new Map()

  const normalized = [...new Set(texts.map(normalizeTtsText))]

  const { data, error } = await supabase
    .schema('indonesian')
    .rpc('get_audio_clip_per_text', { p_texts: normalized })

  if (error || !data) return new Map()

  const map: SessionAudioMap = new Map()
  for (const clip of data as Array<{ normalized_text: string; storage_path: string }>) {
    map.set(clip.normalized_text, clip.storage_path)
  }
  return map
}

export function resolveSessionAudioUrl(map: SessionAudioMap, text: string): string | undefined {
  const path = map.get(normalizeTtsText(text))
  return path ? `${SUPABASE_URL}/storage/v1/object/public/indonesian-tts/${path}` : undefined
}
