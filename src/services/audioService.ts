import { supabase } from '@/lib/supabase'
import { normalizeTtsText } from '@/lib/ttsNormalize'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL

export type AudioMap = Map<string, Map<string, string>> // voice_id → normalized_text → storage_path

export async function fetchAudioMap(normalizedTexts: string[], voiceIds: string[]): Promise<AudioMap> {
  if (normalizedTexts.length === 0 || voiceIds.length === 0) return new Map()

  const { data, error } = await supabase
    .schema('indonesian')
    .rpc('get_audio_clips', { p_texts: normalizedTexts, p_voice_ids: voiceIds })

  if (error || !data) return new Map()

  const map: AudioMap = new Map()
  for (const clip of data as Array<{ normalized_text: string; voice_id: string; storage_path: string }>) {
    if (!map.has(clip.voice_id)) map.set(clip.voice_id, new Map())
    map.get(clip.voice_id)!.set(clip.normalized_text, clip.storage_path)
  }
  return map
}

export function resolveAudioUrl(audioMap: AudioMap, text: string, voiceId: string): string | undefined {
  const path = audioMap.get(voiceId)?.get(normalizeTtsText(text))
  return path ? `${SUPABASE_URL}/storage/v1/object/public/indonesian-tts/${path}` : undefined
}

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
