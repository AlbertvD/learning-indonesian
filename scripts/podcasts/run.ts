#!/usr/bin/env bun
// Story-podcast pipeline — single-episode orchestrator (slice 1, #293).
//
// Thin composition: author (Gemini) → translate (Gemini) → narrate (Chirp3-HD)
// → assemble → seed (bucket + podcasts row). `--dry-run` prints the plan and
// makes NO API calls or writes. The resumable batch driver is slice 4 (#296).
//
// Usage:
//   bun scripts/podcasts/run.ts --level A2 --topic "buying breakfast at a warung" [--dry-run]
//
// Requires (non-dry-run): GEMINI_API_KEY, ~/.config/gcloud/tts-indonesian.json,
// SUPABASE_SERVICE_KEY — all in .env.local / the gcloud config.

import { readFileSync, existsSync } from 'node:fs'
import { assembleEpisode } from './assemble'
import { authorStory, adaptStory, type StoryDraft } from './storyAuthor'
import { translateSegments } from './translate'
import { synthesizeEpisode, DEFAULT_STORY_VOICE } from './narrator'
import { persistSeedRecord, seedEpisode } from './seed'
import type { Level } from './pacing'
import type { PodcastAttribution } from '@/services/podcastService'

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
    console.log(`  would: ${step} → translate ID→NL/EN → narrate (Chirp3-HD SSML) → assemble → seed (bucket + podcasts row)`)
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

  const wordCount = segments.reduce((n, s) => n + s.id.split(/\s+/).length, 0)
  const record = assembleEpisode({
    title: draft.title,
    description: draft.description,
    level,
    segments,
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
