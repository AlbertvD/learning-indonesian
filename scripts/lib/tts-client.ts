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

async function getAccessToken(): Promise<string> {
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

export async function synthesizeSpeech(text: string, voiceId: string): Promise<Buffer> {
  const token = await getAccessToken()

  const res = await fetch(TTS_ENDPOINT, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      input: { text },
      voice: { languageCode: 'id-ID', name: voiceId },
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
