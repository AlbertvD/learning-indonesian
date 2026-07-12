import { supabase } from '@/lib/supabase'
import { logError } from '@/lib/logger'
import { normalizeTtsText } from '@/lib/ttsNormalize'
import { SIGNED_URL_TTL_SECONDS } from '@/lib/signedAudioUrl'

/**
 * Map keyed by `${normalizedText}|${voiceId ?? '__default__'}` → a SIGNED,
 * ready-to-play URL (the `indonesian-tts` bucket is private per the
 * entitlement-gating cutover). Voice-paired entries use the actual voice id;
 * voice-agnostic entries use the '__default__' sentinel. Lookups must use the
 * same key shape.
 */
export type SessionAudioMap = Map<string, string>

const DEFAULT_VOICE_KEY = '__default__'

function makeKey(normalizedText: string, voiceId: string | null): string {
  return `${normalizedText}|${voiceId ?? DEFAULT_VOICE_KEY}`
}

interface AudioRequest {
  text: string
  voiceId: string | null
}

export async function fetchSessionAudioMap(items: AudioRequest[]): Promise<SessionAudioMap> {
  const map: SessionAudioMap = new Map()
  if (items.length === 0) return map

  // Split: voice-paired requests use get_audio_clips (exact pair lookup),
  // voice-agnostic requests use get_audio_clip_per_text (earliest-lesson preference).
  const voicePaired: Array<{ text: string; voiceId: string }> = []
  const voiceAgnostic: AudioRequest[] = []
  for (const item of items) {
    if (item.voiceId !== null) {
      voicePaired.push({ text: item.text, voiceId: item.voiceId })
    } else {
      voiceAgnostic.push(item)
    }
  }

  // Storage paths staged for signing, keyed the same way the final map is —
  // one batch sign call at the end resolves every entry in one round trip.
  const pathsByKey = new Map<string, string>()

  if (voicePaired.length > 0) {
    const normalizedTexts = [...new Set(voicePaired.map((i) => normalizeTtsText(i.text)))]
    const voiceIds = [...new Set(voicePaired.map((i) => i.voiceId))]
    const requestedKeys = new Set(
      voicePaired.map((i) => makeKey(normalizeTtsText(i.text), i.voiceId)),
    )

    const { data, error } = await supabase
      .schema('indonesian')
      .rpc('get_audio_clips', { p_texts: normalizedTexts, p_voice_ids: voiceIds })

    if (error) {
      logError({ page: 'audio-service', action: 'get_audio_clips', error })
    } else if (data) {
      for (const clip of data as Array<{
        normalized_text: string
        voice_id: string
        storage_path: string
      }>) {
        const key = makeKey(clip.normalized_text, clip.voice_id)
        // Cross-product RPC may return pairs we didn't ask for; filter to requested only.
        if (requestedKeys.has(key)) {
          pathsByKey.set(key, clip.storage_path)
        }
      }
    }
  }

  if (voiceAgnostic.length > 0) {
    const normalizedTexts = [...new Set(voiceAgnostic.map((i) => normalizeTtsText(i.text)))]

    const { data, error } = await supabase
      .schema('indonesian')
      .rpc('get_audio_clip_per_text', { p_texts: normalizedTexts })

    if (error) {
      logError({ page: 'audio-service', action: 'get_audio_clip_per_text', error })
    } else if (data) {
      for (const clip of data as Array<{ normalized_text: string; storage_path: string }>) {
        pathsByKey.set(makeKey(clip.normalized_text, null), clip.storage_path)
      }
    }
  }

  if (pathsByKey.size === 0) return map

  // One batch sign call for every path collected above — the `indonesian-tts`
  // bucket is private, so a raw storage_path is not playable on its own.
  const paths = [...new Set(pathsByKey.values())]
  const { data: signed, error: signError } = await supabase.storage
    .from('indonesian-tts')
    .createSignedUrls(paths, SIGNED_URL_TTL_SECONDS)

  if (signError) {
    // Wholesale batch failure — mirror the RPC error handling above: log and
    // return whatever the map already has (nothing, in this branch).
    logError({ page: 'audio-service', action: 'createSignedUrls', error: signError })
    return map
  }

  const signedUrlByPath = new Map<string, string>()
  for (const entry of signed ?? []) {
    // Per-path signing errors (non-entitled user on a paid clip, missing
    // object) are expected, not logged — that path simply doesn't go in the
    // map, and resolveSessionAudioUrl already returns undefined for a miss.
    if (entry.path && entry.signedUrl) {
      signedUrlByPath.set(entry.path, entry.signedUrl)
    }
  }

  for (const [key, path] of pathsByKey) {
    const url = signedUrlByPath.get(path)
    if (url) map.set(key, url)
  }

  return map
}

export function resolveSessionAudioUrl(
  map: SessionAudioMap,
  text: string,
  voiceId: string | null,
): string | undefined {
  return map.get(makeKey(normalizeTtsText(text), voiceId))
}
