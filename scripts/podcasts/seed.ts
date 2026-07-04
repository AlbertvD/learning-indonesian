// Story-podcast seeding — write the generated episode into the app.
//
// Reuses the existing podcast upload+upsert path (seed-podcasts.ts): MP3 → the
// `indonesian-podcasts` bucket, metadata + transcripts (incl. transcript_segments)
// → the `texts` row (onConflict title). The episode record is also persisted
// to a git-tracked generated-seed JSON so content re-publishes homelab→cloud per
// the north-star (the bucket holds the binary; git holds the re-seedable record).
//
// A READ-ONLY text (the Read face only, ADR 0023) seeds via `seedText`: same
// row upsert with `audio_path = NULL`, no bucket write, no local MP3 copy. The
// server-side Listen filter (`textService.listPodcasts` → `audio_path not null`)
// keeps it off the Podcasts page; Lezen lists every text.

import { createClient } from '@supabase/supabase-js'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { PodcastData } from '../data/podcasts'

const SUPABASE_URL = 'https://api.supabase.duin.home'
const GENERATED_SEED_DIR = resolve('scripts/data/generated-podcasts')
const LOCAL_AUDIO_DIR = resolve('content/podcasts')

/** Filename-safe slug from a title (shared by run.ts and the record basename). */
export function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\s-]/g, '').trim().split(/\s+/).slice(0, 5).join('-')
}

/** Persist the episode record to the git-tracked generated-seed (re-publishable). */
export function persistSeedRecord(record: PodcastData): string {
  mkdirSync(GENERATED_SEED_DIR, { recursive: true })
  const base = record.audio_filename
    ? record.audio_filename.replace(/\.[^.]+$/, '')
    : `text-${record.level.toLowerCase()}-${slugify(record.title)}`
  const path = resolve(GENERATED_SEED_DIR, `${base}.json`)
  writeFileSync(path, JSON.stringify(record, null, 2) + '\n', 'utf8')
  return path
}

/** Upsert the record's `texts` row (onConflict title). `audioPath` NULL = read-only. */
async function upsertTextRow(record: PodcastData, audioPath: string | null): Promise<void> {
  const serviceKey = process.env.SUPABASE_SERVICE_KEY
  if (!serviceKey) throw new Error('SUPABASE_SERVICE_KEY is required to seed')
  const supabase = createClient(SUPABASE_URL, serviceKey)
  const { error } = await supabase
    .schema('indonesian')
    .from('texts')
    .upsert(
      {
        title: record.title,
        description: record.description,
        audio_path: audioPath,
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
  if (error) throw new Error(`texts upsert failed: ${error.message}`)
}

/** Upload the MP3 to the bucket and upsert the texts row. Requires SUPABASE_SERVICE_KEY. */
export async function seedEpisode(record: PodcastData, mp3: Buffer): Promise<void> {
  if (!record.audio_filename) {
    throw new Error('record has no audio_filename — a read-only text seeds via seedText')
  }
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

  await upsertTextRow(record, storagePath)
}

/** Upsert an audio-less `texts` row (the Read face only). No bucket write. */
export async function seedText(record: PodcastData): Promise<void> {
  await upsertTextRow(record, null)
}
