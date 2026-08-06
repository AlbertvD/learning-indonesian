#!/usr/bin/env bun
// scripts/migrate-audio-to-cloud.ts
//
// Uploads recorded audio to Supabase Cloud, compressing on the way.
//
// WHY NOT grammar-podcast/publish.ts: that script also writes
// lessons.audio_path and re-bakes each lesson's content.json. Neither is needed
// here — audio_path already holds the right paths on cloud, and the baked URLs
// are host-agnostic (parseStoredAudioUrl discards the host, signedAudioUrl.ts:56).
// Running publish.ts 30 times would churn 30 committed content.json files for
// no behavioural change. This is a storage migration, nothing more.
//
// Uploads are INGRESS, which Supabase does not bill against the egress quota,
// so re-running is cheap. Everything is upserted, so it is idempotent.
//
// Usage:
//   bun scripts/migrate-audio-to-cloud.ts --dry-run
//   bun scripts/migrate-audio-to-cloud.ts --only=grammar
//   bun scripts/migrate-audio-to-cloud.ts

import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { compressAudioFile, describeCompression } from './lib/compress-audio'

for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  // Shell env WINS over the file — the opposite of grammar-podcast/publish.ts,
  // which force-overrides and therefore cannot be pointed at cloud at all.
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
}

const url = process.env.SUPABASE_URL ?? 'https://wodpkxsmildtgndnbraa.supabase.co'

// ⚠ .env.local holds BOTH keys: SUPABASE_SERVICE_KEY is the HOMELAB's and
// CLOUD_SUPABASE_SERVICE_KEY is this project's. Preferring the former against a
// cloud URL fails every single upload with "signature verification failed" —
// a JWT signed by a different instance. Observed 2026-08-02: 42/42 failed.
// Pick the key that matches the target rather than whichever exists.
const isCloud = url.includes('.supabase.co')
const key = isCloud
  ? (process.env.CLOUD_SUPABASE_SERVICE_KEY ?? process.env.SUPABASE_SERVICE_KEY)
  : (process.env.SUPABASE_SERVICE_KEY ?? process.env.CLOUD_SUPABASE_SERVICE_KEY)
if (!key) throw new Error('no service key: set CLOUD_SUPABASE_SERVICE_KEY (cloud) or SUPABASE_SERVICE_KEY (homelab)')

// Fail fast on a key/target mismatch rather than after compressing 1.4 GB.
// Cloud service keys are `sb_secret_…`; the self-hosted one is a raw JWT.
if (isCloud && !key.startsWith('sb_secret_') && !key.startsWith('eyJ')) {
  throw new Error('service key does not look valid for the cloud project')
}
const supabase = createClient(url, key)

const dryRun = process.argv.includes('--dry-run')
const onlyArg = process.argv.find(a => a.startsWith('--only='))?.split('=')[1]

interface Job { local: string; bucket: string; path: string; contentType: string }

function grammarNl(): Job[] {
  const dir = 'content/grammar-podcast'
  if (!existsSync(dir)) return []
  // Dutch only — the EN episodes exist on disk but are deliberately unpublished
  // (owner decision 2026-08-02, Dutch-only launch; the Profile language switch
  // was removed in 2e645619).
  return readdirSync(dir)
    .filter(f => /^lesson-\d+\.nl\.mp3$/.test(f))
    .map(f => {
      const n = f.match(/^lesson-(\d+)\./)![1]
      return { local: join(dir, f), bucket: 'indonesian-lessons', path: `grammar/lesson-${n}-nl.mp3`, contentType: 'audio/mpeg' }
    })
    .sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true }))
}

function storyPodcasts(): Job[] {
  const dir = 'content/podcasts'
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter(f => /\.(mp3|m4a)$/i.test(f))
    .map(f => ({
      local: join(dir, f),
      bucket: 'indonesian-podcasts',
      path: `podcasts/${f}`,
      contentType: f.toLowerCase().endsWith('.m4a') ? 'audio/mp4' : 'audio/mpeg',
    }))
}

const groups: Record<string, () => Job[]> = { grammar: grammarNl, podcasts: storyPodcasts }
const selected = onlyArg ? [onlyArg] : Object.keys(groups)
for (const g of selected) if (!groups[g]) throw new Error(`unknown --only=${g}; expected: ${Object.keys(groups).join('|')}`)

console.log(`Target: ${url}${dryRun ? '   [DRY RUN — nothing uploaded]' : ''}`)

let before = 0, after = 0, uploaded = 0, failed = 0
for (const g of selected) {
  const jobs = groups[g]()
  console.log(`\n${g} — ${jobs.length} files`)
  for (const job of jobs) {
    const r = await compressAudioFile(job.local)
    before += r.originalBytes; after += r.compressedBytes
    if (dryRun) { console.log(' ', describeCompression(job.path, r)); continue }
    const { error } = await supabase.storage
      .from(job.bucket)
      .upload(job.path, r.buffer, { contentType: job.contentType, upsert: true })
    if (error) { console.error(`  ✗ ${job.path}: ${error.message}`); failed++ }
    else { console.log(' ', describeCompression(job.path, r)); uploaded++ }
  }
}

const mb = (n: number) => (n / 1e6).toFixed(0)
console.log(`\n  source ${mb(before)} MB → uploaded ${mb(after)} MB (${Math.round((1 - after / before) * 100)}% smaller)`)
if (!dryRun) console.log(`  ${uploaded} uploaded, ${failed} failed`)
if (failed) process.exit(1)
