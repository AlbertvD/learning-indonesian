// Story-podcast seeding — write the generated episode into the app.
//
// Reuses the existing podcast upload+upsert path (seed-podcasts.ts): MP3 → the
// `indonesian-podcasts` bucket, metadata + transcripts (incl. transcript_segments)
// → the `podcasts` row (onConflict title). The episode record is also persisted
// to a git-tracked generated-seed JSON so content re-publishes homelab→cloud per
// the north-star (the bucket holds the binary; git holds the re-seedable record).

import { createClient } from '@supabase/supabase-js'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { PodcastData } from '../data/podcasts'

const SUPABASE_URL = 'https://api.supabase.duin.home'
const GENERATED_SEED_DIR = resolve('scripts/data/generated-podcasts')
const LOCAL_AUDIO_DIR = resolve('content/podcasts')

/** Persist the episode record to the git-tracked generated-seed (re-publishable). */
export function persistSeedRecord(record: PodcastData): string {
  mkdirSync(GENERATED_SEED_DIR, { recursive: true })
  const base = record.audio_filename.replace(/\.[^.]+$/, '')
  const path = resolve(GENERATED_SEED_DIR, `${base}.json`)
  writeFileSync(path, JSON.stringify(record, null, 2) + '\n', 'utf8')
  return path
}

/** Upload the MP3 to the bucket and upsert the podcasts row. Requires SUPABASE_SERVICE_KEY. */
export async function seedEpisode(record: PodcastData, mp3: Buffer): Promise<void> {
  const serviceKey = process.env.SUPABASE_SERVICE_KEY
  if (!serviceKey) throw new Error('SUPABASE_SERVICE_KEY is required to seed')
  const supabase = createClient(SUPABASE_URL, serviceKey)

  // Keep a local copy alongside the existing hand-produced episodes.
  mkdirSync(LOCAL_AUDIO_DIR, { recursive: true })
  writeFileSync(resolve(LOCAL_AUDIO_DIR, record.audio_filename), mp3)

  const storagePath = `podcasts/${record.audio_filename}`
  const { error: uploadError } = await supabase.storage
    .from('indonesian-podcasts')
    .upload(storagePath, mp3, { contentType: 'audio/mpeg', upsert: true })
  if (uploadError) throw new Error(`audio upload failed: ${uploadError.message}`)

  const { error: metaError } = await supabase
    .schema('indonesian')
    .from('texts')
    .upsert(
      {
        title: record.title,
        description: record.description,
        audio_path: storagePath,
        transcript_indonesian: record.transcript_indonesian,
        transcript_dutch: record.transcript_dutch,
        transcript_english: record.transcript_english,
        transcript_segments: record.transcript_segments ?? null,
        attribution: record.attribution ?? null,
        level: record.level,
        duration_seconds: record.duration_seconds,
      },
      { onConflict: 'title' },
    )
  if (metaError) throw new Error(`podcast upsert failed: ${metaError.message}`)
}
