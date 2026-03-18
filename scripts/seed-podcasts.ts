#!/usr/bin/env bun
import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'fs'
import { podcasts } from './data/podcasts'

const serviceKey = process.env.SUPABASE_SERVICE_KEY
if (!serviceKey) {
  console.error('Error: SUPABASE_SERVICE_KEY is required.')
  process.exit(1)
}

const supabase = createClient('https://api.supabase.duin.home', serviceKey)
const audioDir = 'content/podcasts'

for (const podcast of podcasts) {
  const localPath = `${audioDir}/${podcast.audio_filename}`
  const storagePath = `podcasts/${podcast.audio_filename}`

  if (existsSync(localPath)) {
    const buffer = readFileSync(localPath)
    const ext = podcast.audio_filename.split('.').pop()?.toLowerCase()
    const contentType = ext === 'm4a' ? 'audio/mp4' : 'audio/mpeg'
    const { error: uploadError } = await supabase.storage
      .from('indonesian-podcasts')
      .upload(storagePath, buffer, { contentType, upsert: true })
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
    .from('podcasts')
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
