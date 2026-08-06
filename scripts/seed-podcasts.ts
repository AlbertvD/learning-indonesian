#!/usr/bin/env bun
import { createClient } from '@supabase/supabase-js'
import { existsSync } from 'fs'
import { podcasts } from './data/podcasts'
import { compressAudioFile, describeCompression } from './lib/compress-audio'

const serviceKey = process.env.SUPABASE_SERVICE_KEY
if (!serviceKey) {
  console.error('Error: SUPABASE_SERVICE_KEY is required.')
  process.exit(1)
}

// Was hardcoded to the homelab, so this could not seed Supabase Cloud.
// SUPABASE_URL selects the target; the default keeps existing calls working.
const supabase = createClient(process.env.SUPABASE_URL ?? 'https://api.supabase.duin.home', serviceKey)
const audioDir = 'content/podcasts'

for (const podcast of podcasts) {
  if (!podcast.audio_filename) {
    console.warn('Read-only record (no audio_filename) — seed via scripts/podcasts/run.ts --resume, skipping:', podcast.title)
    continue
  }
  const localPath = `${audioDir}/${podcast.audio_filename}`
  const storagePath = `podcasts/${podcast.audio_filename}`

  if (existsSync(localPath)) {
    const ext = podcast.audio_filename.split('.').pop()?.toLowerCase()
    const contentType = ext === 'm4a' ? 'audio/mp4' : 'audio/mpeg'
    // Episodes ship at ~256 kbps stereo (26-30 MB each). Buckets are private,
    // so every play is a signed fetch that cannot be edge-cached — download
    // size is felt on every listen, not just the first.
    const compressed = await compressAudioFile(localPath)
    console.log(' ', describeCompression(podcast.audio_filename, compressed))
    const { error: uploadError } = await supabase.storage
      .from('indonesian-podcasts')
      .upload(storagePath, compressed.buffer, { contentType, upsert: true })
    if (uploadError) {
      console.error('Upload failed:', podcast.audio_filename, uploadError.message)
    } else {
      console.log('Uploaded:', storagePath)
    }
  } else {
    console.warn('Audio file not found, skipping upload:', localPath)
  }

  const { error: metaError } = await supabase
    .schema('indonesian')
    .from('texts')
    .upsert(
      {
        title: podcast.title,
        description: podcast.description,
        audio_path: storagePath,
        transcript_dutch: podcast.transcript_dutch,
        transcript_indonesian: podcast.transcript_indonesian,
        transcript_english: podcast.transcript_english,
        level: podcast.level,
        duration_seconds: podcast.duration_seconds,
        transcript_segments: podcast.transcript_segments ?? null,
        attribution: podcast.attribution ?? null,
      },
      { onConflict: 'title' },
    )
  if (metaError) {
    console.error('Metadata failed:', podcast.title, metaError.message)
  } else {
    console.log('Upserted metadata:', podcast.title)
  }
}

console.log('Done!')
