#!/usr/bin/env bun
import { createClient } from '@supabase/supabase-js'
import { existsSync, readdirSync } from 'fs'
import { join } from 'path'
import { compressAudioFile, describeCompression } from './lib/compress-audio'

const serviceKey = process.env.SUPABASE_SERVICE_KEY
if (!serviceKey) {
  console.error('Error: SUPABASE_SERVICE_KEY is required. Run: make seed-lesson-audio SUPABASE_SERVICE_KEY=<key>')
  process.exit(1)
}

// The target instance was hardcoded to the homelab, which made this script
// unable to seed Supabase Cloud at all — the reason 26 of 30 lessons' audio
// never reached the cloud project. SUPABASE_URL now selects the target and
// still defaults to the homelab, so existing invocations are unchanged.
const supabaseUrl = process.env.SUPABASE_URL ?? 'https://api.supabase.duin.home'
const supabase = createClient(supabaseUrl, serviceKey)
const audioDir = 'content/lessons'

if (!existsSync(audioDir)) {
  console.error(`Audio directory not found: ${audioDir}`)
  process.exit(1)
}

const files = readdirSync(audioDir).filter(f => /\.(mp3|m4a|ogg|wav)$/i.test(f))

if (files.length === 0) {
  console.log('No audio files found in content/lessons/')
  process.exit(0)
}

const { data: existing } = await supabase.storage
  .from('indonesian-lessons')
  .list('lessons')

const existingNames = new Set((existing ?? []).map(f => f.name))

for (const filename of files) {
  if (existingNames.has(filename)) {
    console.log('Skipped (already exists):', filename)
    continue
  }

  const localPath = join(audioDir, filename)
  const storagePath = `lessons/${filename}`
  const ext = filename.split('.').pop()?.toLowerCase()
  const contentType = ext === 'm4a' ? 'audio/mp4' : 'audio/mpeg'

  // Recorded narration ships at ~256 kbps stereo, which both breaks the 50 MB
  // per-object cap and makes learners download ~50 MB per lesson over signed
  // (uncacheable) URLs. Re-encode to mono speech bitrate first.
  const compressed = await compressAudioFile(localPath)
  console.log(' ', describeCompression(filename, compressed))

  const { error } = await supabase.storage
    .from('indonesian-lessons')
    .upload(storagePath, compressed.buffer, { contentType })

  if (error) {
    console.error('Upload failed:', filename, error.message)
  } else {
    console.log('Uploaded:', storagePath)
  }
}

console.log('Done!')
