// Story-podcast Speech-to-Text word-offset client.
//
// Runs synthesised episode audio through Google STT to recover per-word timings
// for follow-along (ADR 0022 amendment). Uses `longrunningrecognize` (the sync
// `recognize` caps at ~60s; episodes run longer) with INLINE base64 audio —
// probed working at ~90s, so no GCS bucket is needed. Auth reuses the TTS
// service account's bearer token (`tts-client.getAccessToken`; cloud-platform
// scope covers STT). Returns words in audio order for `align.ts` to map onto the
// known script. Prereq: Speech-to-Text API enabled on the TTS Cloud project.

import { getAccessToken } from '../lib/tts-client'
import type { SttWord } from './align'

const STT_ENDPOINT = 'https://speech.googleapis.com/v1/speech:longrunningrecognize'
const OP_ENDPOINT = 'https://speech.googleapis.com/v1/operations'
const POLL_INTERVAL_MS = 3000
const MAX_POLLS = 120 // ~6 min ceiling

interface SttResponse {
  results?: Array<{
    alternatives?: Array<{
      transcript?: string
      words?: Array<{ word: string; startTime: string; endTime: string }>
    }>
  }>
}

/** Parse a Google STT duration string ("0.100s", "1s") to seconds. */
export function parseTimepointSeconds(value: string): number {
  return parseFloat(value.replace(/s$/, ''))
}

/** Flatten recognised words across all result blocks into timed words (audio order). */
export function extractSttWords(response: SttResponse): SttWord[] {
  return (response.results ?? []).flatMap((r) =>
    (r.alternatives?.[0]?.words ?? []).map((w) => ({
      word: w.word,
      start: parseTimepointSeconds(w.startTime),
      end: parseTimepointSeconds(w.endTime),
    })),
  )
}

/**
 * Transcribe an episode MP3 to word-level timings. Submits a long-running
 * recognize op with inline base64 audio, polls until done, and extracts the
 * timed words. Network-bound (validated by the live `--retime` run, not a unit
 * test); the pure parsing it delegates to IS unit-tested.
 */
export async function transcribeWordOffsets(mp3: Buffer): Promise<SttWord[]> {
  const token = await getAccessToken()
  const body = JSON.stringify({
    config: {
      encoding: 'MP3',
      sampleRateHertz: 24000,
      languageCode: 'id-ID',
      enableAutomaticPunctuation: true,
      enableWordTimeOffsets: true,
    },
    audio: { content: mp3.toString('base64') },
  })

  const start = await fetch(STT_ENDPOINT, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body,
  })
  if (!start.ok) throw new Error(`STT submit failed ${start.status}: ${(await start.text()).slice(0, 300)}`)
  const { name } = (await start.json()) as { name: string }

  for (let i = 0; i < MAX_POLLS; i++) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS))
    const op = await fetch(`${OP_ENDPOINT}/${name}`, { headers: { Authorization: `Bearer ${token}` } })
    if (!op.ok) throw new Error(`STT poll failed ${op.status}: ${(await op.text()).slice(0, 300)}`)
    const json = (await op.json()) as { done?: boolean; response?: SttResponse; error?: { message?: string } }
    if (json.error) throw new Error(`STT operation error: ${json.error.message ?? 'unknown'}`)
    if (json.done) return extractSttWords(json.response ?? {})
  }
  throw new Error(`STT operation ${name} did not complete within ${(MAX_POLLS * POLL_INTERVAL_MS) / 1000}s`)
}
