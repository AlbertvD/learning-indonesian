#!/usr/bin/env bun
/**
 * seed-pronunciation-audio.ts
 *
 * Task U-D of docs/plans/2026-07-08-uitspraak-quick-wins.md — TTS seeding for
 * the Uitspraak trainer's pitfall catalog (review UP1, content half + UP4's
 * new words). Seeds every example + minimal-pair word in
 * `src/lib/pronunciation/pitfallCatalog.ts` that doesn't already have an
 * `indonesian.audio_clips` row. Covers the 5 previously-known-missing words
 * (kari, makam, ngeri, ngantuk, nganga) AND UP4's 16 new catalog example words
 * in one idempotent run — already-covered lesson vocabulary is skipped by the
 * RPC check.
 *
 * This is the same voice-agnostic path PitfallCard/MinimalPairPlayer read via
 * `resolveSessionAudioUrl(map, word, null)` (src/services/audioService.ts ->
 * get_audio_clip_per_text RPC) — one voice is enough (model audio, not
 * perception training), so we don't attach `generated_for_lesson_id` (these
 * words aren't scoped to one lesson).
 *
 * Idempotent: an existing clip for a normalized word (any voice) is skipped,
 * so re-running after the catalog grows only fills the gap.
 *
 * Adapted near-verbatim from scripts/oneoff/seed-affix-derived-audio.ts (same
 * TTS client, same audio_clips + indonesian-tts bucket write path, same
 * --dry-run flag, same idempotency via get_audio_clip_per_text, same
 * DEFAULT_VOICE). The only structural difference: the input word set comes
 * from `allExampleWords()` (no DB read needed to build it), and the words are
 * already TTS-normalized plain lowercase strings, so the same string serves
 * as both `text_content` and `normalized_text`.
 *
 * Usage:
 *   bun scripts/oneoff/seed-pronunciation-audio.ts --dry-run   # count only
 *   bun scripts/oneoff/seed-pronunciation-audio.ts             # live run
 *
 * Requires SUPABASE_SERVICE_KEY (.env.local) + the GCP TTS service account
 * key at ~/.config/gcloud/tts-indonesian.json (scripts/lib/tts-client.ts).
 */

import { createClient } from '@supabase/supabase-js'
import { synthesizeSpeech } from '../lib/tts-client'
import { buildStoragePath } from '../lib/tts-storage'
import { allExampleWords } from '@/lib/pronunciation/pitfallCatalog'

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

/** allExampleWords() already returns TTS-normalized plain lowercase words, so
 *  the same string serves as both the display text and the lookup key. */
function collectCatalogWords(): WordEntry[] {
  return allExampleWords().map((w) => ({ text: w, normalizedText: w }))
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

  console.log(`\n${dryRun ? '[DRY RUN] ' : ''}Seeding TTS audio for the Uitspraak pitfall catalog...`)

  const allWords = collectCatalogWords()
  console.log(`   Distinct catalog words: ${allWords.length}`)

  const alreadySeeded = await findAlreadySeeded(supabase, allWords)
  const toGenerate = allWords.filter((w) => !alreadySeeded.has(w.normalizedText))
  console.log(`   Already seeded: ${alreadySeeded.size}, to generate: ${toGenerate.length}`)

  if (dryRun) {
    console.log(`\n[DRY RUN] Would generate ${toGenerate.length} clip(s) with voice ${DEFAULT_VOICE}`)
    console.log('[DRY RUN] Words:')
    for (const w of toGenerate) console.log(`  "${w.text}"`)
    return
  }

  let generated = 0
  const generatedWords: string[] = []
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
      generatedWords.push(word.text)
      process.stdout.write(`\r   Generated: ${generated}/${toGenerate.length}`)
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : JSON.stringify(err)
      failures.push(`${word.text}: ${errMsg}`)
      console.error(`\n   Failed to generate clip for "${word.text}": ${errMsg}`)
    }
  }

  if (toGenerate.length > 0) console.log() // newline after progress

  console.log(`\n--- Summary ---`)
  console.log(`  Distinct catalog words: ${allWords.length}`)
  console.log(`  Already seeded:         ${alreadySeeded.size}`)
  console.log(`  Generated:              ${generated}`)
  console.log(`  Failed:                 ${failures.length}`)

  // List every generated word (the set is small) for the human spot-listen —
  // Chirp3-HD short-word caveat (ADR 0025).
  if (generatedWords.length > 0) {
    console.log(`\nGenerated words (spot-listen these):`)
    for (const w of generatedWords) console.log(`  - ${w}`)
  }

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
