#!/usr/bin/env bun
/**
 * check-vocab-coverage.ts
 *
 * Flags grammar exercise variants whose Indonesian payload contains words the
 * learner has never been exposed to. Authoring rule (per
 * .claude/agents/grammar-exercise-creator.md:65): every candidate must use
 * vocabulary from the lesson pool; unknown words are not acceptable.
 *
 * Known vocabulary = union of:
 *   - learning_items.normalized_text (every taught item)
 *   - item_contexts.source_text tokens (every Indonesian sentence the user has
 *     been exposed to in lesson content — captures dialogue characters and
 *     place names that are repeatedly seen)
 *   - lesson_sections.content tokens (full lesson display content)
 *   - a small static allowlist of common particles and well-known proper nouns
 *
 * Tokens are lowercased and stripped of common Indonesian morphological
 * suffixes (-nya, -lah, -kah, -ku, -mu, -kan, -i) and clitics so that an
 * unknown root is not masked by a known affix. Function words and tokens
 * shorter than 3 chars are ignored.
 *
 * Usage:
 *   bun scripts/check-vocab-coverage.ts                # scan all variants in DB
 *   bun scripts/check-vocab-coverage.ts --lesson 7     # only patterns from lesson 7
 *   bun scripts/check-vocab-coverage.ts --json         # machine-readable output
 *
 * Exits 0 when clean, 1 when any unknowns are found.
 */

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? 'https://api.supabase.duin.home'
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY
if (!SERVICE_KEY) {
  console.error('SUPABASE_SERVICE_KEY required')
  process.exit(1)
}

// Disable cert check for the homelab's internal CA.
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  db: { schema: 'indonesian' },
  auth: { persistSession: false },
})

// Indonesian function words, particles, pronouns, and other ultra-common
// grammar that's pedagogically transparent — never flagged regardless of
// whether they appear as standalone learning items.
const FUNCTION_WORDS = new Set([
  'itu','ini','di','ke','dari','yang','dan','atau','tapi','tetapi','dengan','untuk','pada','dalam','akan','sudah','belum','tidak','bukan','adalah','ada','saya','kamu','dia','kami','kita','mereka','anda','aku','ya','juga','saja','lagi','sangat','sekali','agar','supaya','karena','sebab','jika','kalau','maka','kemudian','lalu','setelah','sebelum','ketika','waktu','sambil','tanpa','tentang','seperti','sang','bahwa','bagi','oleh','sampai','hingga','baru','lebih','paling','suka','bisa','dapat','harus','mau','ingin','perlu','boleh','sedang','sini','sana','situ','kenapa','apa','siapa','mana','bagaimana','kapan','berapa','lah','kah','pun','nya','sebuah','seorang','para','semua','setiap','beberapa','banyak','sedikit',
])

// Indonesian affixes stripped before lookup so a known root combined with the
// affix being taught (namanya, ambillah, bisakah, terbaik, selebar, berjalan)
// doesn't register as unknown. Order matters for prefixes: longer ones first
// so meng- isn't trimmed to me-.
const SUFFIXES = ['nya','lah','kah','ku','mu','kan','i']
const PREFIXES = ['meng','meny','memp','memb','memf','menj','mens','menc','meng','mem','men','peng','peny','pemp','pemb','penj','pens','penc','pem','pen','ber','ter','per','ke','se','di','me','pe','ku','mu']

function stripAffixes(word: string): string {
  let w = word
  let changed = true
  while (changed) {
    changed = false
    for (const suf of SUFFIXES) {
      if (w.length > suf.length + 2 && w.endsWith(suf)) {
        w = w.slice(0, -suf.length)
        changed = true
        break
      }
    }
    for (const pre of PREFIXES) {
      if (w.length > pre.length + 2 && w.startsWith(pre)) {
        w = w.slice(pre.length)
        changed = true
        break
      }
    }
  }
  return w
}

// Tokenize a free-text string into normalized Indonesian word candidates.
// Hyphenated reduplications (anak-anak) split into their parts; the root form
// is what matters for coverage.
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z\s-]/g, ' ')
    .split(/[\s-]+/)
    .filter(Boolean)
}

async function loadKnownVocab(): Promise<Set<string>> {
  const known = new Set<string>()

  const { data: items, error: itemsErr } = await supabase
    .from('learning_items')
    .select('normalized_text')
  if (itemsErr) throw itemsErr
  for (const it of items ?? []) {
    for (const tok of tokenize(it.normalized_text)) {
      known.add(tok)
      known.add(stripAffixes(tok))
    }
  }

  const { data: contexts, error: ctxErr } = await supabase
    .from('item_contexts')
    .select('source_text')
  if (ctxErr) throw ctxErr
  for (const ctx of contexts ?? []) {
    for (const tok of tokenize(ctx.source_text)) {
      known.add(tok)
      known.add(stripAffixes(tok))
    }
  }

  // Lesson section display content can be deeply nested JSON — flatten and
  // tokenize any string we find. Cheap and catches dialogue lines / examples.
  const { data: sections, error: secErr } = await supabase
    .from('lesson_sections')
    .select('content')
  if (secErr) throw secErr
  for (const sec of sections ?? []) {
    walkStrings(sec.content, (s: string) => {
      for (const tok of tokenize(s)) {
        known.add(tok)
        known.add(stripAffixes(tok))
      }
    })
  }

  return known
}

function walkStrings(value: unknown, visit: (s: string) => void): void {
  if (typeof value === 'string') visit(value)
  else if (Array.isArray(value)) value.forEach(v => walkStrings(v, visit))
  else if (value && typeof value === 'object') {
    for (const v of Object.values(value as Record<string, unknown>)) walkStrings(v, visit)
  }
}

// The Indonesian-bearing fields of each grammar exercise payload. Other fields
// (sourceLanguageSentence, explanationText, transformationInstruction,
// promptText, targetMeaning) are Dutch and intentionally skipped.
function extractIndonesianText(payload: Record<string, unknown>, exerciseType: string): string[] {
  const out: string[] = []
  switch (exerciseType) {
    case 'constrained_translation':
      for (const a of (payload.acceptableAnswers as string[] | undefined) ?? []) out.push(a)
      break
    case 'sentence_transformation':
      if (typeof payload.sourceSentence === 'string') out.push(payload.sourceSentence)
      for (const a of (payload.acceptableAnswers as string[] | undefined) ?? []) out.push(a)
      break
    case 'contrast_pair':
      for (const opt of (payload.options as Array<{ text: string }> | undefined) ?? []) {
        if (typeof opt?.text === 'string') out.push(opt.text)
      }
      break
    case 'cloze_mcq':
      if (typeof payload.sentence === 'string') out.push(payload.sentence)
      for (const opt of (payload.options as string[] | undefined) ?? []) {
        if (typeof opt === 'string') out.push(opt)
      }
      break
  }
  return out
}

interface Finding {
  variant_id: string
  exercise_type: string
  pattern_slug: string | null
  lesson_order: number | null
  unknown_words: string[]
  sample_text: string
}

async function main() {
  const args = process.argv.slice(2)
  const jsonOut = args.includes('--json')
  const lessonIdx = args.indexOf('--lesson')
  const lessonFilter = lessonIdx >= 0 ? parseInt(args[lessonIdx + 1], 10) : null

  if (!jsonOut) console.log('Loading known vocabulary from DB…')
  const known = await loadKnownVocab()
  if (!jsonOut) console.log(`Known vocabulary: ${known.size} unique tokens`)

  const { data: variants, error } = await supabase
    .from('exercise_variants')
    .select('id, exercise_type, payload_json, grammar_pattern_id, grammar_patterns!inner(slug, introduced_by_lesson_id, lessons:introduced_by_lesson_id(order_index))')
    .not('grammar_pattern_id', 'is', null)
  if (error) throw error

  const findings: Finding[] = []
  for (const v of variants ?? []) {
    const gp = (v as Record<string, unknown>).grammar_patterns as { slug?: string; lessons?: { order_index?: number } } | null
    const lessonOrder = gp?.lessons?.order_index ?? null
    if (lessonFilter !== null && lessonOrder !== lessonFilter) continue

    const indoTexts = extractIndonesianText(v.payload_json as Record<string, unknown>, v.exercise_type)
    if (indoTexts.length === 0) continue

    const unknown = new Set<string>()
    for (const text of indoTexts) {
      for (const raw of tokenize(text)) {
        if (raw.length < 3) continue
        if (FUNCTION_WORDS.has(raw)) continue
        const stripped = stripAffixes(raw)
        if (known.has(raw) || known.has(stripped)) continue
        if (FUNCTION_WORDS.has(stripped)) continue
        unknown.add(raw)
      }
    }

    if (unknown.size > 0) {
      findings.push({
        variant_id: v.id,
        exercise_type: v.exercise_type,
        pattern_slug: gp?.slug ?? null,
        lesson_order: lessonOrder,
        unknown_words: [...unknown].sort(),
        sample_text: indoTexts[0].slice(0, 100),
      })
    }
  }

  if (jsonOut) {
    console.log(JSON.stringify({ count: findings.length, findings }, null, 2))
  } else {
    if (findings.length === 0) {
      console.log('\nClean: every grammar exercise uses only known vocabulary.')
    } else {
      console.log(`\nFound ${findings.length} variant(s) with unknown vocabulary:\n`)
      for (const f of findings) {
        console.log(`Lesson ${f.lesson_order ?? '?'} · ${f.pattern_slug ?? '?'} · ${f.exercise_type}`)
        console.log(`  variant_id: ${f.variant_id}`)
        console.log(`  unknown:    ${f.unknown_words.join(', ')}`)
        console.log(`  sample:     "${f.sample_text}"`)
        console.log()
      }
    }
  }

  process.exit(findings.length > 0 ? 1 : 0)
}

main().catch(err => {
  console.error(err)
  process.exit(2)
})
