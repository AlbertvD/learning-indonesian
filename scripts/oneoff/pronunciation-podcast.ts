// ONE-OFF producer for the two L1 pronunciation podcasts (ADR 0025, issue #315).
// NOT a reusable pipeline (staff-engineer review): a throwaway that synthesises the
// authored scripts and seeds them once. Do not promote to scripts/podcasts/.
//
// Flow: for each episode, synthesise every line with its own voice/language
// (host lines in nl-NL/en-US; `id` example words via synthesizeSpeech so the
// Chirp3-HD short-word→Wavenet fallback protects them), concatenate the per-line
// MP3s into one episode, upload both to the `indonesian-podcasts` bucket, and
// upsert ONE `texts` row with twin audio (audio_path=NL, audio_path_en=EN).
//
// Run AFTER `make migrate` (needs texts.audio_path_en). Requires the gcloud TTS
// service account (~/.config/gcloud/tts-indonesian.json) + SUPABASE_SERVICE_KEY.
// Usage: NODE_TLS_REJECT_UNAUTHORIZED=0 bun scripts/oneoff/pronunciation-podcast.ts [--dry-run]

import { createClient } from '@supabase/supabase-js'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { synthesizeSpeech } from '../lib/tts-client'
import { EPISODES, type PodcastEpisode, type PodcastLine } from './pronunciation-podcast-scripts'

const SUPABASE_URL = 'https://api.supabase.duin.home'
const LOCAL_AUDIO_DIR = resolve('content/podcasts')
const NL_PATH = 'podcasts/pronunciation-nl.mp3'
const EN_PATH = 'podcasts/pronunciation-en.mp3'

// One logical podcast, two L1 faces — a single texts row, so a single (bilingual) title.
const ROW_TITLE = 'Uitspraak · Pronunciation'
const ROW_DESCRIPTION =
  'De Indonesische klanken die je het vaakst verkeerd doet — luister en spreek mee. / ' +
  'The Indonesian sounds you most often get wrong — listen and say them along.'

const langCodeOf = (l: PodcastLine['lang']): string => (l === 'nl' ? 'nl-NL' : l === 'en' ? 'en-US' : 'id-ID')

function voiceFor(line: PodcastLine, ep: PodcastEpisode): { voice: string; lang: string } {
  if (line.lang === 'id') return { voice: ep.exampleVoice, lang: 'id-ID' }
  return { voice: line.speaker === 'A' ? ep.voiceA : ep.voiceB, lang: langCodeOf(line.lang) }
}

// Naive MP3 concatenation (Buffer.concat) — adequate for a throwaway: all segments
// are MP3 @ 24kHz mono from the same engine, which browsers play back fine. Hand-
// check the result per ADR 0025.
async function synthEpisode(ep: PodcastEpisode): Promise<Buffer> {
  const buffers: Buffer[] = []
  for (const line of ep.lines) {
    const { voice, lang } = voiceFor(line, ep)
    buffers.push(await synthesizeSpeech(line.text, voice, lang))
  }
  return Buffer.concat(buffers)
}

const linesInLang = (ep: PodcastEpisode, lang: 'nl' | 'en'): string =>
  ep.lines.filter((l) => l.lang === lang).map((l) => l.text).join('\n')

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run')
  const nl = EPISODES.find((e) => e.l1 === 'nl')
  const en = EPISODES.find((e) => e.l1 === 'en')
  if (!nl || !en) throw new Error('expected both NL and EN episodes in EPISODES')

  console.log(`Synthesising NL episode (${nl.lines.length} lines)…`)
  const nlMp3 = await synthEpisode(nl)
  console.log(`Synthesising EN episode (${en.lines.length} lines)…`)
  const enMp3 = await synthEpisode(en)

  mkdirSync(LOCAL_AUDIO_DIR, { recursive: true })
  writeFileSync(resolve(LOCAL_AUDIO_DIR, 'pronunciation-nl.mp3'), nlMp3)
  writeFileSync(resolve(LOCAL_AUDIO_DIR, 'pronunciation-en.mp3'), enMp3)
  console.log(`NL ${(nlMp3.length / 1024).toFixed(0)} KiB, EN ${(enMp3.length / 1024).toFixed(0)} KiB → ${LOCAL_AUDIO_DIR}`)

  if (dryRun) {
    console.log('dry-run: skipping bucket upload + texts upsert')
    return
  }

  const serviceKey = process.env.SUPABASE_SERVICE_KEY
  if (!serviceKey) throw new Error('SUPABASE_SERVICE_KEY is required to seed')
  const supabase = createClient(SUPABASE_URL, serviceKey)

  for (const [path, mp3] of [[NL_PATH, nlMp3], [EN_PATH, enMp3]] as const) {
    const { error } = await supabase.storage
      .from('indonesian-podcasts')
      .upload(path, mp3, { contentType: 'audio/mpeg', upsert: true })
    if (error) throw new Error(`upload ${path} failed: ${error.message}`)
    console.log(`uploaded ${path}`)
  }

  const exampleWords = [
    ...new Set(EPISODES.flatMap((e) => e.lines.filter((l) => l.lang === 'id').map((l) => l.text))),
  ].join(' · ')

  const { error } = await supabase
    .schema('indonesian')
    .from('texts')
    .upsert(
      {
        title: ROW_TITLE,
        description: ROW_DESCRIPTION,
        audio_path: NL_PATH,
        audio_path_en: EN_PATH,
        transcript_indonesian: exampleWords,
        transcript_dutch: linesInLang(nl, 'nl'),
        transcript_english: linesInLang(en, 'en'),
        transcript_segments: null,
        attribution: null,
        level: null,
        duration_seconds: null,
      },
      { onConflict: 'title' },
    )
  if (error) throw new Error(`texts upsert failed: ${error.message}`)
  console.log(`seeded texts row: "${ROW_TITLE}" (audio_path=${NL_PATH}, audio_path_en=${EN_PATH})`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
