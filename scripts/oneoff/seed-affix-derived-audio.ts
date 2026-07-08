#!/usr/bin/env bun
/**
 * seed-affix-derived-audio.ts
 *
 * Task B1 of docs/plans/2026-07-08-affix-trainer-quick-wins.md — TTS seeding
 * for the Affix trainer's derived-form audio (review P4, content half).
 *
 * Seeds an `indonesian.audio_clips` row for every distinct `derived_text` in
 * `indonesian.affixed_form_pairs` that doesn't already resolve one. This is
 * the same voice-agnostic path `RuleCard`/`WordFamilyExplorer` read via
 * `resolveSessionAudioUrl(map, derivedText, null)` (src/services/audioService.ts
 * -> get_audio_clip_per_text RPC) — one voice is enough (model audio, not
 * perception training), so we don't attach `generated_for_lesson_id` (a
 * derived form isn't scoped to one lesson the way per-lesson audio is; the
 * RPC resolves purely on normalized_text).
 *
 * Idempotent: an existing clip for a derived_text (any voice) is skipped, so
 * re-running after new affixes are authored only fills the gap.
 *
 * Follows the TTS-client/audio_clips/bucket pattern of
 * scripts/generate-exercise-audio.ts and scripts/oneoff/pronunciation-podcast.ts.
 *
 * Usage:
 *   bun scripts/oneoff/seed-affix-derived-audio.ts --dry-run   # count only
 *   bun scripts/oneoff/seed-affix-derived-audio.ts             # live run
 *
 * Requires SUPABASE_SERVICE_KEY (.env.local) + the GCP TTS service account
 * key at ~/.config/gcloud/tts-indonesian.json (scripts/lib/tts-client.ts).
 */

import { createClient } from '@supabase/supabase-js'
import { normalizeTtsText } from '../lib/tts-normalize'
import { synthesizeSpeech } from '../lib/tts-client'
import { buildStoragePath } from '../lib/tts-storage'

// Homelab uses an internal Step-CA certificate that Node/Bun does not trust by default.
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

// Same fallback voice generate-exercise-audio.ts uses when a lesson has no
// primary_voice set — a single, reliable default is enough for model audio.
const DEFAULT_VOICE = 'id-ID-Chirp3-HD-Achird'

function createSupabaseClient() {
  const url = process.env.VITE_SUPABASE_URL || 'https://api.supabase.duin.home'
  const serviceKey = process.env.SUPABASE_SERVICE_KEY

  if (!serviceKey) {
    console.error('Error: SUPABASE_SERVICE_KEY environment variable not set')
    console.error('Add it to .env.local: SUPABASE_SERVICE_KEY=<your-key>')
    process.exit(1)
  }

  return createClient(url, serviceKey)
}

interface WordEntry {
  text: string
  normalizedText: string
}

async function collectDistinctDerivedWords(
  supabase: ReturnType<typeof createClient>,
): Promise<WordEntry[]> {
  const { data, error } = await supabase
    .schema('indonesian')
    .from('affixed_form_pairs')
    .select('derived_text')

  if (error) throw error

  const byNormalized = new Map<string, WordEntry>()
  for (const row of (data ?? []) as Array<{ derived_text: string }>) {
    const text = row.derived_text?.trim()
    if (!text) continue
    const normalizedText = normalizeTtsText(text)
    if (!byNormalized.has(normalizedText)) {
      byNormalized.set(normalizedText, { text, normalizedText })
    }
  }
  return [...byNormalized.values()]
}

async function findAlreadySeeded(
  supabase: ReturnType<typeof createClient>,
  words: WordEntry[],
): Promise<Set<string>> {
  const seeded = new Set<string>()
  if (words.length === 0) return seeded

  // get_audio_clip_per_text is the same voice-agnostic RPC the runtime uses
  // (fetchSessionAudioMap's voiceId:null path) — a clip under ANY voice
  // counts as "already seeded" for this idempotency check.
  const { data, error } = await supabase
    .schema('indonesian')
    .rpc('get_audio_clip_per_text', { p_texts: words.map((w) => w.normalizedText) })

  if (error) throw error
  for (const row of (data ?? []) as Array<{ normalized_text: string }>) {
    seeded.add(row.normalized_text)
  }
  return seeded
}

async function main() {
  const dryRun = process.argv.includes('--dry-run')
  const supabase = createSupabaseClient()

  console.log(`\n${dryRun ? '[DRY RUN] ' : ''}Seeding TTS audio for affix derived forms...`)

  const allWords = await collectDistinctDerivedWords(supabase)
  console.log(`   Distinct derived_text values: ${allWords.length}`)

  const alreadySeeded = await findAlreadySeeded(supabase, allWords)
  const toGenerate = allWords.filter((w) => !alreadySeeded.has(w.normalizedText))
  console.log(`   Already seeded: ${alreadySeeded.size}, to generate: ${toGenerate.length}`)

  if (dryRun) {
    console.log(`\n[DRY RUN] Would generate ${toGenerate.length} clip(s) with voice ${DEFAULT_VOICE}`)
    console.log('[DRY RUN] Sample (first 10):')
    for (const w of toGenerate.slice(0, 10)) console.log(`  "${w.text}"`)
    return
  }

  let generated = 0
  const failures: string[] = []

  for (const word of toGenerate) {
    try {
      // Rate limit: 100ms between calls
      if (generated > 0) await new Promise((res) => setTimeout(res, 100))

      const audioBuffer = await synthesizeSpeech(word.text, DEFAULT_VOICE)

      // Quality gate: flag suspiciously small clips
      if (audioBuffer.length < 1024) {
        console.warn(`\n   ⚠️  Tiny clip (${audioBuffer.length}B) for "${word.text}" — may be broken`)
      }

      const storagePath = buildStoragePath(word.text, DEFAULT_VOICE)

      const { error: uploadError } = await supabase.storage
        .from('indonesian-tts')
        .upload(storagePath, audioBuffer, {
          contentType: 'audio/mpeg',
          upsert: true,
        })
      if (uploadError) throw uploadError

      const { error: insertError } = await supabase
        .schema('indonesian')
        .from('audio_clips')
        .insert({
          text_content: word.text,
          normalized_text: word.normalizedText,
          voice_id: DEFAULT_VOICE,
          storage_path: storagePath,
          generated_for_lesson_id: null,
        })
      if (insertError) throw insertError

      generated++
      process.stdout.write(`\r   Generated: ${generated}/${toGenerate.length}`)
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : JSON.stringify(err)
      failures.push(`${word.text}: ${errMsg}`)
      console.error(`\n   Failed to generate clip for "${word.text}": ${errMsg}`)
    }
  }

  if (toGenerate.length > 0) console.log() // newline after progress

  console.log(`\n--- Summary ---`)
  console.log(`  Distinct derived_text:  ${allWords.length}`)
  console.log(`  Already seeded:         ${alreadySeeded.size}`)
  console.log(`  Generated:              ${generated}`)
  console.log(`  Failed:                 ${failures.length}`)

  if (failures.length > 0) {
    console.log(`\nFailures:`)
    for (const f of failures) console.log(`  - ${f}`)
    process.exit(1)
  }

  console.log(`\nDone.`)
}

main().catch((err) => {
  console.error('\nFatal error:', err)
  process.exit(1)
})
