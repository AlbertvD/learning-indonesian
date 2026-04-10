#!/usr/bin/env bun
/**
 * asr-quality-gate.ts — ASR back-transcription quality gate
 *
 * Back-transcribes generated TTS audio using speech-to-text (id-ID),
 * computes similarity scores, flags meaning changes, and writes a
 * QA report. Blocks publishing if thresholds are not met.
 *
 * Usage:
 *   bun scripts/asr-quality-gate.ts <lesson-number> [--mock] [--threshold <0-1>]
 *
 * Flags:
 *   --mock             Use mock ASR (echo back original text with minor noise) for testing
 *   --threshold <val>  Minimum similarity score to pass (default: 0.80)
 *
 * Environment:
 *   GOOGLE_STT_API_KEY — Google Cloud Speech-to-Text API key (required unless --mock)
 *
 * Reads:
 *   content/lessons/sections/lesson-<N>/manifest.json   (from TTS pipeline)
 *   scripts/data/staging/lesson-<N>/lesson.ts           (original text)
 *
 * Writes:
 *   scripts/data/staging/lesson-<N>/qa_report.json
 *
 * Exit codes:
 *   0 — all sections pass quality gate
 *   1 — one or more sections fail (publish blocked)
 *   2 — configuration or input error
 */

import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join, resolve } from 'path'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface QaResult {
  sectionSlug: string
  originalText: string
  transcribedText: string
  similarityScore: number
  meaningChanged: boolean
  pass: boolean
  details?: string
}

interface QaReport {
  lesson: number
  generatedAt: string
  threshold: number
  overallPass: boolean
  totalSections: number
  passedSections: number
  failedSections: number
  results: QaResult[]
}

// Manifest type kept for documentation; read via JSON.parse at runtime
// interface Manifest {
//   lesson: number
//   generatedAt: string
//   mode: string
//   sections: Record<string, { files: string[]; lineCount: number }>
// }

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_THRESHOLD = 0.80
const GOOGLE_STT_ENDPOINT = 'https://speech.googleapis.com/v1/speech:recognize'

// Words that, if missing or added, constitute a meaning change in Indonesian
const MEANING_CRITICAL_WORDS = new Set([
  'tidak', 'bukan', 'belum', 'jangan',  // negation
  'sudah', 'akan', 'sedang',            // tense markers
  'sangat', 'sekali', 'paling',         // intensifiers
  'dan', 'atau', 'tetapi',             // conjunctions
  'di', 'ke', 'dari',                  // critical prepositions
  'saya', 'kamu', 'dia', 'kami', 'mereka', 'kita', // pronouns
])

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

const args = process.argv.slice(2)
const lessonArg = args.find(a => !a.startsWith('--'))
const mockMode = args.includes('--mock')

let threshold = DEFAULT_THRESHOLD
const thresholdIdx = args.indexOf('--threshold')
if (thresholdIdx !== -1 && args[thresholdIdx + 1]) {
  threshold = parseFloat(args[thresholdIdx + 1])
  if (isNaN(threshold) || threshold < 0 || threshold > 1) {
    console.error('Error: --threshold must be between 0 and 1')
    process.exit(2)
  }
}

if (!lessonArg) {
  console.error('Usage: bun scripts/asr-quality-gate.ts <lesson-number> [--mock] [--threshold <0-1>]')
  process.exit(2)
}

const lessonNum = parseInt(lessonArg, 10)
if (isNaN(lessonNum) || lessonNum < 1) {
  console.error('Error: lesson number must be a positive integer')
  process.exit(2)
}

const apiKey = process.env.GOOGLE_STT_API_KEY
if (!apiKey && !mockMode) {
  console.error('Error: GOOGLE_STT_API_KEY is required (or use --mock)')
  process.exit(2)
}

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const ROOT = resolve(import.meta.dir, '..')
const STAGING_DIR = join(ROOT, 'scripts', 'data', 'staging', `lesson-${lessonNum}`)
const AUDIO_DIR = join(ROOT, 'content', 'lessons', 'sections', `lesson-${lessonNum}`)
const MANIFEST_PATH = join(AUDIO_DIR, 'manifest.json')
const QA_REPORT_PATH = join(STAGING_DIR, 'qa_report.json')

// ---------------------------------------------------------------------------
// Text similarity (Levenshtein-based normalized)
// ---------------------------------------------------------------------------

export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[.,!?;:'"()\-\u2013\u2014]/g, '') // strip punctuation
    .replace(/\s+/g, ' ')
    .trim()
}

export function levenshteinDistance(a: string, b: string): number {
  const m = a.length
  const n = b.length

  if (m === 0) return n
  if (n === 0) return m

  // Use two rows instead of full matrix for memory efficiency
  let prev = new Array(n + 1)
  let curr = new Array(n + 1)

  for (let j = 0; j <= n; j++) prev[j] = j

  for (let i = 1; i <= m; i++) {
    curr[0] = i
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      curr[j] = Math.min(
        prev[j] + 1,      // deletion
        curr[j - 1] + 1,  // insertion
        prev[j - 1] + cost // substitution
      )
    }
    ;[prev, curr] = [curr, prev]
  }

  return prev[n]
}

export function similarityScore(original: string, transcribed: string): number {
  const normOrig = normalizeText(original)
  const normTrans = normalizeText(transcribed)

  if (normOrig === normTrans) return 1.0
  if (normOrig.length === 0 && normTrans.length === 0) return 1.0
  if (normOrig.length === 0 || normTrans.length === 0) return 0.0

  const distance = levenshteinDistance(normOrig, normTrans)
  const maxLen = Math.max(normOrig.length, normTrans.length)

  return Math.max(0, 1 - distance / maxLen)
}

// ---------------------------------------------------------------------------
// Meaning change detection
// ---------------------------------------------------------------------------

export function detectMeaningChange(original: string, transcribed: string): { changed: boolean; details: string } {
  const origWords = new Set(normalizeText(original).split(' '))
  const transWords = new Set(normalizeText(transcribed).split(' '))

  const missingCritical: string[] = []
  const addedCritical: string[] = []

  for (const word of MEANING_CRITICAL_WORDS) {
    const inOrig = origWords.has(word)
    const inTrans = transWords.has(word)

    if (inOrig && !inTrans) {
      missingCritical.push(word)
    } else if (!inOrig && inTrans) {
      addedCritical.push(word)
    }
  }

  if (missingCritical.length === 0 && addedCritical.length === 0) {
    return { changed: false, details: '' }
  }

  const parts: string[] = []
  if (missingCritical.length > 0) {
    parts.push(`missing: [${missingCritical.join(', ')}]`)
  }
  if (addedCritical.length > 0) {
    parts.push(`added: [${addedCritical.join(', ')}]`)
  }

  return { changed: true, details: `Meaning-critical words ${parts.join('; ')}` }
}

// ---------------------------------------------------------------------------
// ASR (Speech-to-Text)
// ---------------------------------------------------------------------------

async function transcribeAudio(audioPath: string): Promise<string> {
  if (mockMode) {
    return mockTranscribe()
  }

  const audioBytes = readFileSync(audioPath)
  const audioContent = audioBytes.toString('base64')

  const response = await fetch(`${GOOGLE_STT_ENDPOINT}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      config: {
        encoding: 'MP3',
        sampleRateHertz: 24000,
        languageCode: 'id-ID',
        enableAutomaticPunctuation: true,
      },
      audio: { content: audioContent },
    }),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Google STT API error ${response.status}: ${text}`)
  }

  const json = (await response.json()) as {
    results?: Array<{ alternatives?: Array<{ transcript?: string }> }>
  }

  if (!json.results || json.results.length === 0) {
    return ''
  }

  return json.results
    .map(r => r.alternatives?.[0]?.transcript ?? '')
    .join(' ')
    .trim()
}

/**
 * Mock ASR: reads the original text from the manifest/lesson and returns
 * it with minor perturbations to simulate real ASR behavior.
 */
function mockTranscribe(): string {
  // In mock mode we use the original text from the section being tested,
  // injected via the closure in evaluateSection. The mock just returns
  // the text with minor noise.
  return _mockOriginalText
}

let _mockOriginalText = ''

// ---------------------------------------------------------------------------
// Section evaluation
// ---------------------------------------------------------------------------

async function evaluateSection(
  slug: string,
  lines: Array<{ text: string; speaker?: string }>,
): Promise<QaResult> {
  const originalText = lines.map(l => l.text).join(' ')

  // Use the learner_normal track for ASR evaluation (clearest audio)
  const audioFile = join(AUDIO_DIR, `${slug}_learner_normal.mp3`)

  if (!existsSync(audioFile)) {
    return {
      sectionSlug: slug,
      originalText,
      transcribedText: '',
      similarityScore: 0,
      meaningChanged: true,
      pass: false,
      details: `Audio file not found: ${slug}_learner_normal.mp3`,
    }
  }

  // In mock mode, simulate ASR by returning original text with minor noise
  if (mockMode) {
    _mockOriginalText = addMockNoise(originalText)
  }

  let transcribedText: string
  try {
    transcribedText = await transcribeAudio(audioFile)
  } catch (err) {
    return {
      sectionSlug: slug,
      originalText,
      transcribedText: '',
      similarityScore: 0,
      meaningChanged: true,
      pass: false,
      details: `ASR failed: ${err instanceof Error ? err.message : String(err)}`,
    }
  }

  const score = similarityScore(originalText, transcribedText)
  const meaning = detectMeaningChange(originalText, transcribedText)
  const pass = score >= threshold && !meaning.changed

  return {
    sectionSlug: slug,
    originalText,
    transcribedText,
    similarityScore: Math.round(score * 1000) / 1000,
    meaningChanged: meaning.changed,
    pass,
    details: meaning.details || undefined,
  }
}

/**
 * Add minor noise to text to simulate imperfect ASR.
 * Drops a random punctuation mark and occasionally swaps a character.
 */
function addMockNoise(text: string): string {
  // Remove one random comma/period for slight imperfection
  let result = text.replace(/([.,])/, '')
  // Swap two adjacent chars somewhere in the middle (if long enough)
  if (result.length > 10) {
    const pos = Math.floor(result.length * 0.4)
    const arr = result.split('')
    if (arr[pos] !== ' ' && arr[pos + 1] !== ' ') {
      ;[arr[pos], arr[pos + 1]] = [arr[pos + 1], arr[pos]]
    }
    result = arr.join('')
  }
  return result
}

// ---------------------------------------------------------------------------
// Load sections from lesson.ts (same as TTS pipeline)
// ---------------------------------------------------------------------------

interface SpeakableLine {
  text: string
  language: 'id' | 'nl'
  speaker?: string
}

async function loadSectionsForQa(): Promise<Array<{ slug: string; lines: SpeakableLine[] }>> {
  const lessonPath = join(STAGING_DIR, 'lesson.ts')
  const mod = await import(lessonPath)
  const lesson = mod.lesson

  const results: Array<{ slug: string; lines: SpeakableLine[] }> = []

  for (const section of lesson.sections) {
    const slug = slugify(section.title || `section-${section.order_index}`)
    const lines = extractSpeakableLines(section)
    if (lines.length === 0) continue
    results.push({ slug, lines })
  }

  return results
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}

function extractSpeakableLines(section: any): SpeakableLine[] {
  const content = section.content
  if (!content) return []

  const lines: SpeakableLine[] = []

  switch (content.type) {
    case 'dialogue':
      if (content.lines) {
        for (const line of content.lines) {
          lines.push({ text: line.text, language: 'id', speaker: line.speaker })
        }
      }
      break
    case 'text':
      if (content.sentences) {
        for (const s of content.sentences) {
          const text = typeof s === 'string' ? s : s.indonesian
          if (text) lines.push({ text, language: 'id' })
        }
      }
      if (content.examples) {
        for (const ex of content.examples) {
          const text = typeof ex === 'string' ? ex : ex.indonesian
          if (text) lines.push({ text, language: 'id' })
        }
      }
      break
    case 'vocabulary':
    case 'numbers':
      if (content.items) {
        for (const item of content.items) {
          const text = item.indonesian || item.base_text || item.text
          if (text) lines.push({ text, language: 'id' })
        }
      }
      break
    case 'grammar':
      if (content.categories) {
        for (const cat of content.categories) {
          if (cat.rules) {
            for (const rule of cat.rules) {
              if (rule.example) lines.push({ text: rule.example, language: 'id' })
            }
          }
        }
      }
      break
    case 'pronunciation':
      if (content.letters) {
        for (const letter of content.letters) {
          if (letter.examples) {
            for (const ex of letter.examples) {
              const text = typeof ex === 'string' ? ex : ex.indonesian || ex.text
              if (text) lines.push({ text, language: 'id' })
            }
          }
        }
      }
      break
  }

  return lines
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log(`\n=== ASR Quality Gate — Lesson ${lessonNum} ===`)
  console.log(`Threshold: ${threshold}`)
  if (mockMode) console.log('(MOCK MODE — using simulated ASR)\n')

  // Check manifest exists
  if (!existsSync(MANIFEST_PATH)) {
    console.error(`Manifest not found: ${MANIFEST_PATH}`)
    console.error('Run generate-section-audio.ts first.')
    process.exit(2)
  }

  const sections = await loadSectionsForQa()

  if (sections.length === 0) {
    console.log('No speakable sections to evaluate.')
    return
  }

  console.log(`Evaluating ${sections.length} section(s)...\n`)

  const results: QaResult[] = []

  for (const section of sections) {
    const result = await evaluateSection(section.slug, section.lines)
    results.push(result)

    const status = result.pass ? 'PASS' : 'FAIL'
    const meaningFlag = result.meaningChanged ? ' [MEANING CHANGED]' : ''
    console.log(`  ${status}  ${result.sectionSlug}  score=${result.similarityScore}${meaningFlag}`)
    if (result.details) {
      console.log(`         ${result.details}`)
    }
  }

  const passedCount = results.filter(r => r.pass).length
  const failedCount = results.filter(r => !r.pass).length
  const overallPass = failedCount === 0

  const report: QaReport = {
    lesson: lessonNum,
    generatedAt: new Date().toISOString(),
    threshold,
    overallPass,
    totalSections: results.length,
    passedSections: passedCount,
    failedSections: failedCount,
    results,
  }

  writeFileSync(QA_REPORT_PATH, JSON.stringify(report, null, 2))
  console.log(`\nQA report written: ${QA_REPORT_PATH}`)

  console.log(`\n${'='.repeat(50)}`)
  console.log(`Result: ${overallPass ? 'ALL PASS' : 'BLOCKED — publish not allowed'}`)
  console.log(`  Passed: ${passedCount}/${results.length}`)
  console.log(`  Failed: ${failedCount}/${results.length}`)
  console.log(`${'='.repeat(50)}\n`)

  if (!overallPass) {
    process.exit(1)
  }
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(2)
})
