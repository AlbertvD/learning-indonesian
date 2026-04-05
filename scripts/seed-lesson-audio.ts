#!/usr/bin/env bun
import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync, readdirSync } from 'fs'
import { join } from 'path'

const serviceKey = process.env.SUPABASE_SERVICE_KEY
if (!serviceKey) {
  console.error('Error: SUPABASE_SERVICE_KEY is required. Run: make seed-lesson-audio SUPABASE_SERVICE_KEY=<key>')
  process.exit(1)
}

const supabase = createClient('https://api.supabase.duin.home', serviceKey)
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

  const buffer = readFileSync(localPath)
  const { error } = await supabase.storage
    .from('indonesian-lessons')
    .upload(storagePath, buffer, { contentType })

  if (error) {
    console.error('Upload failed:', filename, error.message)
  } else {
    console.log('Uploaded:', storagePath)
  }
}

console.log('Done!')
