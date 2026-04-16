import { createHash } from 'crypto'
import { normalizeTtsText } from './tts-normalize'

const VOICE_SHORT_NAMES: Record<string, string> = {
  'id-ID-Chirp3-HD-Achird': 'achird',
  'id-ID-Chirp3-HD-Algenib': 'algenib',
  'id-ID-Chirp3-HD-Orus': 'orus',
  'id-ID-Chirp3-HD-Despina': 'despina',
  'id-ID-Chirp3-HD-Sulafat': 'sulafat',
  'id-ID-Chirp3-HD-Gacrux': 'gacrux',
}

function slugify(text: string, maxWords: number = 4): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .trim()
    .split(/\s+/)
    .slice(0, maxWords)
    .join('-')
    .slice(0, 40)
}

export function buildStoragePath(text: string, voiceId: string): string {
  const normalized = normalizeTtsText(text)
  const voiceShort = VOICE_SHORT_NAMES[voiceId] || voiceId.split('-').pop()!.toLowerCase()
  const hash = createHash('sha256').update(normalized + voiceId).digest('hex').slice(0, 8)
  const slug = slugify(text)
  return `tts/${voiceShort}/${slug}-${hash}.mp3`
}
