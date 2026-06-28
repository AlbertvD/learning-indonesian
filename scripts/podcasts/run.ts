#!/usr/bin/env bun
// Story-podcast pipeline — single-episode orchestrator. See the `story-podcast`
// skill (.claude/skills/story-podcast/SKILL.md) for the full operator workflow.
//
// Thin composition: author/adapt (Gemini) → translate (Gemini) → narrate
// (Chirp3-HD) → align (STT word-offsets → script) → assemble → seed (bucket +
// podcasts row). `--dry-run` prints the plan and makes NO API calls or writes.
//
// Modes:
//   invent  --level A2 --topic "buying breakfast at a warung"
//   adapt   --level A2 --source <file.txt> --attribution <file.json> [--source-level "..."]
//   re-time --retime <record.json>     (STT existing audio → timings; no Gemini/TTS)
//   resume  --resume <record.json>      (re-seed existing record + MP3; no STT)
//
// Requires (non-dry-run): GEMINI_API_KEY, ~/.config/gcloud/tts-indonesian.json
// (Speech-to-Text API enabled on its project), SUPABASE_SERVICE_KEY. Prefix direct
// runs with NODE_TLS_REJECT_UNAUTHORIZED=0 for the homelab seed upload.

import { readFileSync, existsSync } from 'node:fs'
import { assembleEpisode, retimeRecord } from './assemble'
import { alignWordTimings, assertValidTimings } from './align'
import { transcribeWordOffsets } from './stt'
import { authorStory, adaptStory, type StoryDraft } from './storyAuthor'
import { translateSegments } from './translate'
import { synthesizeEpisode, DEFAULT_STORY_VOICE } from './narrator'
import { persistSeedRecord, seedEpisode } from './seed'
import type { Level } from './pacing'
import type { PodcastData } from '../data/podcasts'
import type { PodcastAttribution } from '@/services/podcastService'

/** Count words timed across a record's segments (for log output). */
function countTimedWords(record: PodcastData): number {
  return (record.transcript_segments ?? []).reduce((n, s) => n + (s.words?.length ?? 0), 0)
}

const ATTR_FIELDS: (keyof PodcastAttribution)[] = ['source_title', 'source_url', 'author', 'license', 'license_url']

/** Pre-write guard (data-architect): a sourced episode MUST carry complete CC attribution. */
function loadAttribution(path: string): PodcastAttribution {
  const attr = JSON.parse(readFileSync(path, 'utf8')) as Partial<PodcastAttribution>
  const missing = ATTR_FIELDS.filter((f) => !attr[f])
  if (missing.length) throw new Error(`attribution file missing required field(s): ${missing.join(', ')}`)
  return attr as PodcastAttribution
}

const LEVELS: Level[] = ['A1', 'A2', 'B1', 'B2']

function loadEnv() {
  if (!existsSync('.env.local')) return
  for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.*)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
  }
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\s-]/g, '').trim().split(/\s+/).slice(0, 5).join('-')
}

// Rough duration estimate from word count + per-sentence pauses (display only;
// the live slice can refine with a real probe).
function estimateDurationSeconds(wordCount: number, sentenceCount: number, speed: number): number {
  return Math.round(wordCount / (2.3 * speed) + sentenceCount * 0.6)
}

async function main() {
  loadEnv()

  // Resume: re-seed an already-generated episode from its persisted record + local
  // MP3, without re-calling Gemini/TTS (used after a transient seed/upload failure).
  const resumePath = arg('resume')
  if (resumePath) {
    const record = JSON.parse(readFileSync(resumePath, 'utf8')) as PodcastData
    const mp3 = readFileSync(`content/podcasts/${record.audio_filename}`)
    console.log(`[story-podcast] resume "${record.title}" → seed (${mp3.length} bytes)`)
    await seedEpisode(record, mp3)
    console.log(`  ✓ seeded "${record.title}"`)
    return
  }

  // Re-time: recover word-level timings for an already-generated episode by
  // running STT over its EXISTING bucket/local audio, then re-seed. No re-author,
  // no re-translate, no re-synthesis (zero Gemini/TTS) — the audio is unchanged;
  // only the per-word timings (transcript_segments[].words) are added. (ADR 0022
  // amendment — follow-along.) Used to back-fill the live episodes with timings.
  const retimePath = arg('retime')
  if (retimePath) {
    const record = JSON.parse(readFileSync(retimePath, 'utf8')) as PodcastData
    const mp3 = readFileSync(`content/podcasts/${record.audio_filename}`)
    console.log(`[story-podcast] retime "${record.title}" → STT word offsets (${mp3.length} bytes)`)
    const sttWords = await transcribeWordOffsets(mp3)
    const timed = retimeRecord(record, sttWords)
    const seedPath = persistSeedRecord(timed)
    console.log(`  ${countTimedWords(timed)} words timed; record → ${seedPath}`)
    await seedEpisode(timed, mp3)
    console.log(`  ✓ re-timed + re-seeded "${timed.title}"`)
    return
  }

  const level = (arg('level') ?? 'A2') as Level
  const topic = arg('topic') ?? 'a small everyday moment in Indonesia'
  const sourcePath = arg('source')
  const dryRun = process.argv.includes('--dry-run')
  const voice = arg('voice') ?? process.env.PODCAST_VOICE ?? DEFAULT_STORY_VOICE

  if (!LEVELS.includes(level)) {
    console.error(`--level must be one of ${LEVELS.join(', ')}`)
    process.exit(1)
  }

  // Adapt mode (sourced, openly-licensed story) vs invent mode (LLM-original).
  // A sourced episode REQUIRES a CC attribution file (--attribution).
  const adapt = sourcePath !== undefined
  let attribution: PodcastAttribution | null = null
  if (adapt) {
    const attrPath = arg('attribution')
    if (!attrPath) throw new Error('--source requires --attribution <file.json> (CC credit is mandatory)')
    attribution = loadAttribution(attrPath)
  }

  console.log(`[story-podcast] level=${level} ${adapt ? `source="${sourcePath}"` : `topic="${topic}"`} voice=${voice}${dryRun ? ' (dry-run)' : ''}`)

  if (dryRun) {
    const step = adapt ? `adapt source (Gemini, → ${level}, credit ${attribution!.license})` : 'author (Gemini)'
    console.log(`  would: ${step} → translate ID→NL/EN → narrate (Chirp3-HD SSML) → STT word-timings (align to script) → assemble → seed (bucket + podcasts row)`)
    console.log('  no API calls or writes made.')
    return
  }

  let draft: StoryDraft
  if (adapt) {
    console.log('  adapting source…')
    draft = await adaptStory({ sourceText: readFileSync(sourcePath!, 'utf8'), targetLevel: level, sourceLevel: arg('source-level') })
  } else {
    console.log('  authoring…')
    draft = await authorStory({ level, topic, vocabPool: [] }) // vocab pool: slice 2 (#294)
  }
  console.log(`  "${draft.title}" — ${draft.sentences.length} sentences`)

  console.log('  translating…')
  const segments = await translateSegments(draft.sentences)

  console.log('  narrating…')
  const mp3 = await synthesizeEpisode(segments, level, voice)

  // Recover per-word timings for follow-along: STT the synthesised audio and
  // align the recognised words onto the known script (ADR 0022 amendment).
  console.log('  transcribing for word timings…')
  const sttWords = await transcribeWordOffsets(mp3)
  const timedSegments = alignWordTimings(segments, sttWords)
  assertValidTimings(timedSegments)
  console.log(`  ${sttWords.length} words recognised → timings aligned to script`)

  const wordCount = segments.reduce((n, s) => n + s.id.split(/\s+/).length, 0)
  const record = assembleEpisode({
    title: draft.title,
    description: draft.description,
    level,
    segments: timedSegments,
    audio_filename: `story-${level.toLowerCase()}-${slugify(draft.title)}.mp3`,
    duration_seconds: estimateDurationSeconds(wordCount, segments.length, level === 'A1' ? 0.85 : 1),
    attribution,
  })

  const seedPath = persistSeedRecord(record)
  console.log(`  seeding… (record → ${seedPath})`)
  await seedEpisode(record, mp3)
  console.log(`  ✓ seeded "${record.title}" (${record.duration_seconds}s, ${mp3.length} bytes)`)
}

main().catch((err) => {
  console.error('[story-podcast] failed:', err instanceof Error ? err.message : err)
  process.exit(1)
})
