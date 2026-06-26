// Phase 2 — publish a passing episode into the app: upload the MP3 to the
// indonesian-lessons bucket, set the lesson's audio path column, and re-bake the
// lesson's content.json so the reader band plays it.
//
// Usage:
//   NODE_TLS_REJECT_UNAUTHORIZED=0 bun scripts/grammar-podcast/publish.ts <jobSpecPath> [--audio <mp3>]
//
// audio_path (NL) / audio_path_en (EN) hold the bucket-relative path; fetch-lesson-content.ts
// turns it into the public URL baked into content.json. NL needs no migration
// (existing column); EN needs lessons.audio_path_en (run `make migrate` first).

import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'

for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/)
  if (m) process.env[m[1]] = m[2]
}
const url = process.env.VITE_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_KEY
if (!url || !key) throw new Error('VITE_SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in .env.local')
const supabase = createClient(url, key, { db: { schema: 'indonesian' } })

interface JobSpec { lesson: number; lang: 'nl' | 'en' }
const jobPath = process.argv[2]
if (!jobPath || !existsSync(jobPath)) {
  console.error('Usage: bun scripts/grammar-podcast/publish.ts <jobSpecPath> [--audio <mp3>]')
  process.exit(1)
}
const job = JSON.parse(readFileSync(jobPath, 'utf8')) as JobSpec
const audioFlag = process.argv.indexOf('--audio')
const audioPath = audioFlag >= 0 ? process.argv[audioFlag + 1] : `content/grammar-podcast/lesson-${job.lesson}.${job.lang}.mp3`
if (!existsSync(audioPath)) throw new Error(`audio not found: ${audioPath}`)
const log = (m: string) => console.log(`[publish L${job.lesson} ${job.lang}] ${m}`)

// 1. upload to the indonesian-lessons bucket (deterministic path; overwrite on re-run)
const storagePath = `grammar/lesson-${job.lesson}-${job.lang}.mp3`
log(`uploading → indonesian-lessons/${storagePath}`)
const body = readFileSync(audioPath)
const { error: upErr } = await supabase.storage
  .from('indonesian-lessons')
  .upload(storagePath, body, { upsert: true, contentType: 'audio/mpeg' })
if (upErr) throw new Error(`upload failed: ${upErr.message}`)

// 2. set the lesson's audio path column (NL = audio_path, EN = audio_path_en)
const column = job.lang === 'nl' ? 'audio_path' : 'audio_path_en'
log(`setting lessons.${column}`)
const { error: updErr } = await supabase
  .from('lessons')
  .update({ [column]: storagePath })
  .eq('order_index', job.lesson)
if (updErr) throw new Error(`db update failed (is the migration applied for ${column}?): ${updErr.message}`)

// 3. re-bake the lesson's content.json so the reader band picks it up
const contentJsonPath = `src/pages/lessons/lesson-${job.lesson}/content.json`
if (existsSync(contentJsonPath)) {
  log(`re-baking ${contentJsonPath}`)
  const proc = Bun.spawn(['bun', 'scripts/fetch-lesson-content.ts', String(job.lesson), '--pretty'], {
    stdout: 'pipe',
    stderr: 'pipe',
    env: { ...process.env, NODE_TLS_REJECT_UNAUTHORIZED: '0' },
  })
  const [out, code] = await Promise.all([new Response(proc.stdout).text(), proc.exited])
  if (code !== 0) throw new Error(`content.json re-bake failed: ${await new Response(proc.stderr).text()}`)
  writeFileSync(contentJsonPath, out.endsWith('\n') ? out : out + '\n', 'utf8')
} else {
  log(`(no ${contentJsonPath} — skipping re-bake)`)
}

log(`✓ published`)
