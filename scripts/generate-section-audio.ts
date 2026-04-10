#!/usr/bin/env bun
/**
 * generate-section-audio.ts — TTS pipeline stage
 *
 * Generates per-section audio for learner_spoken and natural_spoken tracks
 * at normal (1.0x) and slow (0.85x) speeds with SSML pauses, plus
 * subtitles.srt output.
 *
 * Audio output: content/lessons/sections/lesson-<N>/
 * Subtitles:    content/lessons/sections/lesson-<N>/<section-slug>.srt
 *
 * Usage:
 *   bun scripts/generate-section-audio.ts <lesson-number> [--dry-run] [--mock]
 *
 * Flags:
 *   --dry-run   Print what would be generated without calling TTS API
 *   --mock      Use mock TTS (generate silent placeholder files) for testing
 *
 * Environment:
 *   GOOGLE_TTS_API_KEY — Google Cloud Text-to-Speech API key (required unless --mock)
 *
 * The script reads lesson sections from staging files and generates:
 *   - <slug>_learner_normal.mp3    (1.0x speed, learner-friendly pauses)
 *   - <slug>_learner_slow.mp3      (0.85x speed, longer pauses)
 *   - <slug>_natural_normal.mp3    (1.0x speed, natural pacing)
 *   - <slug>_natural_slow.mp3      (0.85x speed, natural pacing)
 *   - <slug>.srt                   (subtitle file with timestamps)
 */

import { existsSync, mkdirSync, writeFileSync } from 'fs'
import { join, resolve } from 'path'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SectionText {
  slug: string
  title: string
  lines: SpeakableLine[]
}

interface SpeakableLine {
  text: string
  language: 'id' | 'nl'
  speaker?: string
}

interface AudioTrack {
  filename: string
  speed: number
  variant: 'learner' | 'natural'
  ssml: string
}

interface SrtEntry {
  index: number
  startMs: number
  endMs: number
  text: string
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SLOW_RATE = 0.85
const NORMAL_RATE = 1.0
const LEARNER_PAUSE_MS = 800
const NATURAL_PAUSE_MS = 300
const SENTENCE_DURATION_ESTIMATE_MS = 2500 // rough estimate per line for SRT

const GOOGLE_TTS_ENDPOINT = 'https://texttospeech.googleapis.com/v1/text:synthesize'
const VOICE_ID = 'id-ID-Standard-A' // Indonesian female voice
const VOICE_NL = 'nl-NL-Standard-A' // Dutch female voice (for translations if needed)

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

const args = process.argv.slice(2)
const lessonArg = args.find(a => !a.startsWith('--'))
const dryRun = args.includes('--dry-run')
const mockMode = args.includes('--mock')

if (!lessonArg) {
  console.error('Usage: bun scripts/generate-section-audio.ts <lesson-number> [--dry-run] [--mock]')
  process.exit(1)
}

const lessonNum = parseInt(lessonArg, 10)
if (isNaN(lessonNum) || lessonNum < 1) {
  console.error('Error: lesson number must be a positive integer')
  process.exit(1)
}

const apiKey = process.env.GOOGLE_TTS_API_KEY
if (!apiKey && !mockMode && !dryRun) {
  console.error('Error: GOOGLE_TTS_API_KEY is required (or use --mock / --dry-run)')
  process.exit(1)
}

// ---------------------------------------------------------------------------
// Path setup
// ---------------------------------------------------------------------------

const ROOT = resolve(import.meta.dir, '..')
const STAGING_DIR = join(ROOT, 'scripts', 'data', 'staging', `lesson-${lessonNum}`)
const OUTPUT_DIR = join(ROOT, 'content', 'lessons', 'sections', `lesson-${lessonNum}`)

if (!existsSync(STAGING_DIR)) {
  console.error(`Staging directory not found: ${STAGING_DIR}`)
  process.exit(1)
}

// ---------------------------------------------------------------------------
// Load lesson sections
// ---------------------------------------------------------------------------

async function loadSections(): Promise<SectionText[]> {
  const lessonPath = join(STAGING_DIR, 'lesson.ts')
  if (!existsSync(lessonPath)) {
    console.error(`lesson.ts not found in ${STAGING_DIR}`)
    process.exit(1)
  }

  const mod = await import(lessonPath)
  const lesson = mod.lesson

  if (!lesson?.sections || !Array.isArray(lesson.sections)) {
    console.error('lesson.ts must export a lesson object with a sections array')
    process.exit(1)
  }

  const results: SectionText[] = []

  for (const section of lesson.sections) {
    const slug = slugify(section.title || `section-${section.order_index}`)
    const lines = extractSpeakableLines(section)

    if (lines.length === 0) continue

    results.push({ slug, title: section.title || '', lines })
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
          lines.push({
            text: line.text,
            language: 'id',
            speaker: line.speaker,
          })
        }
      }
      break

    case 'text':
      // Extract Indonesian sentences from examples/sentences
      if (content.sentences) {
        for (const s of content.sentences) {
          if (typeof s === 'string') {
            lines.push({ text: s, language: 'id' })
          } else if (s.indonesian) {
            lines.push({ text: s.indonesian, language: 'id' })
          }
        }
      }
      if (content.examples) {
        for (const ex of content.examples) {
          if (typeof ex === 'string') {
            lines.push({ text: ex, language: 'id' })
          } else if (ex.indonesian) {
            lines.push({ text: ex.indonesian, language: 'id' })
          }
        }
      }
      break

    case 'vocabulary':
    case 'numbers':
      // Each item's Indonesian text
      if (content.items) {
        for (const item of content.items) {
          const text = item.indonesian || item.base_text || item.text
          if (text) {
            lines.push({ text, language: 'id' })
          }
        }
      }
      break

    case 'grammar':
      // Extract examples from grammar categories
      if (content.categories) {
        for (const cat of content.categories) {
          if (cat.rules) {
            for (const rule of cat.rules) {
              if (rule.example) {
                lines.push({ text: rule.example, language: 'id' })
              }
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
// SSML generation
// ---------------------------------------------------------------------------

function buildSSML(lines: SpeakableLine[], variant: 'learner' | 'natural', speed: number): string {
  const pauseMs = variant === 'learner' ? LEARNER_PAUSE_MS : NATURAL_PAUSE_MS
  const rate = `${Math.round(speed * 100)}%`

  const parts: string[] = ['<speak>']
  parts.push(`<prosody rate="${rate}">`)

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const escapedText = escapeXml(line.text)

    if (line.speaker) {
      // For dialogue, add a small pause before each speaker turn
      if (i > 0) parts.push(`<break time="${pauseMs}ms"/>`)
      parts.push(`<p>${escapedText}</p>`)
    } else {
      if (i > 0) parts.push(`<break time="${pauseMs}ms"/>`)
      parts.push(`<s>${escapedText}</s>`)
    }
  }

  parts.push('</prosody>')
  parts.push('</speak>')

  return parts.join('\n')
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

// ---------------------------------------------------------------------------
// SRT generation
// ---------------------------------------------------------------------------

function generateSrt(lines: SpeakableLine[], speed: number): string {
  const entries: SrtEntry[] = []
  let currentMs = 0
  const adjustedDuration = Math.round(SENTENCE_DURATION_ESTIMATE_MS / speed)

  for (let i = 0; i < lines.length; i++) {
    const startMs = currentMs
    const endMs = startMs + adjustedDuration

    entries.push({
      index: i + 1,
      startMs,
      endMs,
      text: lines[i].speaker ? `[${lines[i].speaker}] ${lines[i].text}` : lines[i].text,
    })

    currentMs = endMs + 200 // small gap between entries
  }

  return entries.map(e => {
    return `${e.index}\n${formatSrtTime(e.startMs)} --> ${formatSrtTime(e.endMs)}\n${e.text}\n`
  }).join('\n')
}

function formatSrtTime(ms: number): string {
  const hours = Math.floor(ms / 3600000)
  const minutes = Math.floor((ms % 3600000) / 60000)
  const seconds = Math.floor((ms % 60000) / 1000)
  const millis = ms % 1000
  return `${pad(hours, 2)}:${pad(minutes, 2)}:${pad(seconds, 2)},${pad(millis, 3)}`
}

function pad(n: number, width: number): string {
  return n.toString().padStart(width, '0')
}

// ---------------------------------------------------------------------------
// TTS API call (Google Cloud Text-to-Speech)
// ---------------------------------------------------------------------------

async function synthesizeSpeech(ssml: string, languageCode: string = 'id-ID'): Promise<Buffer> {
  if (mockMode) {
    return generateSilentMp3()
  }

  const voiceName = languageCode === 'id-ID' ? VOICE_ID : VOICE_NL

  const response = await fetch(`${GOOGLE_TTS_ENDPOINT}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      input: { ssml },
      voice: {
        languageCode,
        name: voiceName,
        ssmlGender: 'FEMALE',
      },
      audioConfig: {
        audioEncoding: 'MP3',
        sampleRateHertz: 24000,
      },
    }),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Google TTS API error ${response.status}: ${text}`)
  }

  const json = (await response.json()) as { audioContent: string }
  return Buffer.from(json.audioContent, 'base64')
}

/**
 * Generate a minimal valid MP3 file (~1 second of silence) for mock mode.
 * This is a tiny MPEG audio frame that most players will accept.
 */
function generateSilentMp3(): Buffer {
  // Minimal MP3 frame header (MPEG1, Layer 3, 128kbps, 44100Hz, stereo)
  // followed by zero-padded frame data
  const frameHeader = Buffer.from([0xFF, 0xFB, 0x90, 0x00])
  const frameData = Buffer.alloc(413) // rest of a 417-byte frame at 128kbps
  const frame = Buffer.concat([frameHeader, frameData])
  // Repeat a few frames to make ~1 second
  const frames: Buffer[] = []
  for (let i = 0; i < 38; i++) frames.push(frame)
  return Buffer.concat(frames)
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log(`\n=== TTS Pipeline — Lesson ${lessonNum} ===`)
  if (dryRun) console.log('(DRY RUN — no files will be written)\n')
  if (mockMode) console.log('(MOCK MODE — generating silent placeholder audio)\n')

  const sections = await loadSections()

  if (sections.length === 0) {
    console.log('No speakable sections found in lesson.')
    return
  }

  console.log(`Found ${sections.length} section(s) with speakable content:\n`)
  for (const s of sections) {
    console.log(`  - ${s.slug} (${s.lines.length} lines)`)
  }

  if (!dryRun) {
    mkdirSync(OUTPUT_DIR, { recursive: true })
  }

  const manifest: Record<string, { files: string[]; lineCount: number }> = {}

  for (const section of sections) {
    console.log(`\nProcessing: ${section.slug} ...`)

    const tracks: AudioTrack[] = [
      { filename: `${section.slug}_learner_normal.mp3`, speed: NORMAL_RATE, variant: 'learner', ssml: '' },
      { filename: `${section.slug}_learner_slow.mp3`, speed: SLOW_RATE, variant: 'learner', ssml: '' },
      { filename: `${section.slug}_natural_normal.mp3`, speed: NORMAL_RATE, variant: 'natural', ssml: '' },
      { filename: `${section.slug}_natural_slow.mp3`, speed: SLOW_RATE, variant: 'natural', ssml: '' },
    ]

    for (const track of tracks) {
      track.ssml = buildSSML(section.lines, track.variant, track.speed)
    }

    if (dryRun) {
      console.log(`  Would generate: ${tracks.map(t => t.filename).join(', ')}`)
      console.log(`  Would generate: ${section.slug}.srt`)
      console.log(`  SSML sample (learner_normal):`)
      console.log(`    ${tracks[0].ssml.split('\n').slice(0, 5).join('\n    ')}...`)
      manifest[section.slug] = { files: [...tracks.map(t => t.filename), `${section.slug}.srt`], lineCount: section.lines.length }
      continue
    }

    const generatedFiles: string[] = []

    for (const track of tracks) {
      try {
        const audio = await synthesizeSpeech(track.ssml)
        const outPath = join(OUTPUT_DIR, track.filename)
        writeFileSync(outPath, audio)
        console.log(`  Generated: ${track.filename} (${audio.length} bytes)`)
        generatedFiles.push(track.filename)
      } catch (err) {
        console.error(`  Error generating ${track.filename}:`, err instanceof Error ? err.message : err)
      }
    }

    // Generate SRT (use normal speed timing)
    const srt = generateSrt(section.lines, NORMAL_RATE)
    const srtPath = join(OUTPUT_DIR, `${section.slug}.srt`)
    writeFileSync(srtPath, srt)
    console.log(`  Generated: ${section.slug}.srt`)
    generatedFiles.push(`${section.slug}.srt`)

    manifest[section.slug] = { files: generatedFiles, lineCount: section.lines.length }
  }

  // Write manifest
  if (!dryRun) {
    const manifestPath = join(OUTPUT_DIR, 'manifest.json')
    writeFileSync(manifestPath, JSON.stringify({
      lesson: lessonNum,
      generatedAt: new Date().toISOString(),
      mode: mockMode ? 'mock' : 'live',
      sections: manifest,
    }, null, 2))
    console.log(`\nManifest: ${manifestPath}`)
  }

  console.log(`\nDone! ${Object.keys(manifest).length} section(s) processed.`)
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
