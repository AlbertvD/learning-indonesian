import { readFileSync } from 'fs'
import { createSign } from 'crypto'
import { resolve } from 'path'

const TTS_ENDPOINT = 'https://texttospeech.googleapis.com/v1/text:synthesize'
const KEY_PATH = resolve(process.env.HOME || '~', '.config/gcloud/tts-indonesian.json')

interface ServiceAccountKey {
  client_email: string
  private_key: string
  project_id: string
}

let cachedToken: { token: string; expiresAt: number } | null = null

function loadKey(): ServiceAccountKey {
  return JSON.parse(readFileSync(KEY_PATH, 'utf8'))
}

/**
 * OAuth bearer token for the TTS service account (cloud-platform scope, so it
 * also authorises Speech-to-Text). Exported so the STT word-offset client
 * (`scripts/podcasts/stt.ts`) shares one auth path. Cached until ~expiry.
 */
export async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60_000) {
    return cachedToken.token
  }

  const key = loadKey()
  const now = Math.floor(Date.now() / 1000)
  const header = { alg: 'RS256', typ: 'JWT' }
  const payload = {
    iss: key.client_email,
    scope: 'https://www.googleapis.com/auth/cloud-platform',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }

  function base64url(obj: unknown) {
    return Buffer.from(JSON.stringify(obj)).toString('base64url')
  }

  const signInput = base64url(header) + '.' + base64url(payload)
  const sign = createSign('RSA-SHA256')
  sign.update(signInput)
  const signature = sign.sign(key.private_key, 'base64url')
  const jwt = signInput + '.' + signature

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  })

  const data = (await res.json()) as { access_token?: string; expires_in?: number }
  if (!data.access_token) throw new Error('Failed to get access token')

  cachedToken = { token: data.access_token, expiresAt: Date.now() + (data.expires_in || 3600) * 1000 }
  return cachedToken.token
}

// Chirp3-HD produces broken audio for very short words (≤2 chars like "ke", "di").
// Fall back to Wavenet for these — same gender, reliable for short utterances.
const CHIRP3_TO_WAVENET_FALLBACK: Record<string, string> = {
  'id-ID-Chirp3-HD-Despina': 'id-ID-Wavenet-A',   // female
  'id-ID-Chirp3-HD-Sulafat': 'id-ID-Wavenet-D',   // female
  'id-ID-Chirp3-HD-Gacrux': 'id-ID-Wavenet-A',    // female
  'id-ID-Chirp3-HD-Kore': 'id-ID-Wavenet-D',      // female (4th female voice, added 2026-07-06)
  'id-ID-Chirp3-HD-Achird': 'id-ID-Wavenet-B',    // male
  'id-ID-Chirp3-HD-Algenib': 'id-ID-Wavenet-C',   // male
  'id-ID-Chirp3-HD-Orus': 'id-ID-Wavenet-B',      // male
}

// Short words Chirp3-HD MISPRONOUNCES even though they are >2 chars — intelligible
// but wrong, a distinct failure from the ≤2-char "broken audio" case. Seeded from
// the "dua" admin flag; extend as more surface (audio mispronunciations DO get
// flagged, unlike silent grading bugs). Compared lowercase-trimmed.
const CHIRP3_MISPRONOUNCED_WORDS = new Set<string>(['dua'])

/**
 * Pick the voice to actually synthesise with. Falls back from Chirp3-HD to the
 * reliable Wavenet voice where Chirp3-HD fails on a short utterance: ≤2-char
 * words (broken audio) OR a known-mispronounced short word ("dua"). Pure +
 * exported so the fallback policy is unit-tested without a network call.
 */
export function effectiveVoiceFor(text: string, voiceId: string): string {
  const normalized = text.trim().toLowerCase()
  const needsFallback = normalized.length <= 2 || CHIRP3_MISPRONOUNCED_WORDS.has(normalized)
  return needsFallback && voiceId in CHIRP3_TO_WAVENET_FALLBACK
    ? CHIRP3_TO_WAVENET_FALLBACK[voiceId]
    : voiceId
}

export async function synthesizeSpeech(text: string, voiceId: string, languageCode = 'id-ID'): Promise<Buffer> {
  const effectiveVoice = effectiveVoiceFor(text, voiceId)
  return synthesizeInput({ text }, effectiveVoice, languageCode)
}

/**
 * Synthesise an SSML document (Story-podcast narration). Unlike `synthesizeSpeech`
 * this sends `input: { ssml }`, the only field Google Cloud TTS honours for
 * `<prosody rate>` / `<break>` pacing. The per-word `effectiveVoiceFor` short-word
 * fallback is intentionally NOT applied: a multi-sentence SSML block uses one voice
 * for the whole document and narrates full sentences (not isolated ≤2-char words),
 * so that Chirp3-HD failure mode does not arise here.
 */
export async function synthesizeSsml(ssml: string, voiceId: string, languageCode = 'id-ID'): Promise<Buffer> {
  return synthesizeInput({ ssml }, voiceId, languageCode)
}

async function synthesizeInput(
  input: { text: string } | { ssml: string },
  voiceName: string,
  languageCode = 'id-ID',
): Promise<Buffer> {
  const token = await getAccessToken()

  const res = await fetch(TTS_ENDPOINT, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      input,
      voice: { languageCode, name: voiceName },
      audioConfig: { audioEncoding: 'MP3', sampleRateHertz: 24000 },
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`TTS API error ${res.status}: ${body}`)
  }

  const json = (await res.json()) as { audioContent: string }
  return Buffer.from(json.audioContent, 'base64')
}
