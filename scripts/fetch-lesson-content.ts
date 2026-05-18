// Fetches one lesson's complete content for the lesson-page-designer agent.
//
// Usage:
//   bun scripts/fetch-lesson-content.ts <order_index>
//   bun scripts/fetch-lesson-content.ts <order_index> --pretty
//
// Output: a single JSON blob to stdout containing:
//   - lesson metadata (title, level, primary_voice, lesson-level audio URL)
//   - all lesson_sections.content (richer than lesson_page_blocks — keep this)
//   - audio URLs injected on every item with a matching audio_clips entry,
//     keyed by the lesson's primary_voice
//   - the runtime-component contract (props the page must wire up)
//
// The agent is expected to interpret the raw `content` shapes directly — no
// pre-typed entities, no taxonomy. If a section.content has fields the agent
// doesn't recognise, it should still try to render them sensibly.

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/)
  if (m) process.env[m[1]] = m[2]
}

const url = process.env.VITE_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_KEY
if (!url || !key) throw new Error('VITE_SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in .env.local')

const supabase = createClient(url, key, { db: { schema: 'indonesian' } })

const orderIndexArg = process.argv[2]
if (!orderIndexArg) {
  console.error('Usage: bun scripts/fetch-lesson-content.ts <order_index> [--pretty]')
  process.exit(1)
}
const orderIndex = Number(orderIndexArg)
if (!Number.isInteger(orderIndex) || orderIndex < 1) {
  console.error(`Invalid order_index: ${orderIndexArg}`)
  process.exit(1)
}
const pretty = process.argv.includes('--pretty')

// ─── Lesson row ─────────────────────────────────────────────────────────────
const { data: lessonRow, error: lessonErr } = await supabase
  .from('lessons')
  .select('id, order_index, title, level, audio_path, primary_voice, duration_seconds, description')
  .eq('order_index', orderIndex)
  .maybeSingle()
if (lessonErr) throw lessonErr
if (!lessonRow) {
  console.error(`No lesson with order_index=${orderIndex}`)
  process.exit(1)
}

// ─── Lesson-level audio URL ─────────────────────────────────────────────────
const lessonAudioUrl: string | null = lessonRow.audio_path
  ? `${url}/storage/v1/object/public/indonesian-lessons/${lessonRow.audio_path}`
  : null

// ─── Sections (preserve raw content shape) ──────────────────────────────────
const { data: sectionRows, error: sectionsErr } = await supabase
  .from('lesson_sections')
  .select('id, order_index, content')
  .eq('lesson_id', lessonRow.id)
  .order('order_index')
if (sectionsErr) throw sectionsErr

// ─── Harvest every Indonesian text fragment that might have audio ──────────
// We don't predefine entity shapes; we walk every nested value and pull any
// `text` / `indonesian` / `base_text` string fields. The page-designer agent
// can then read `audioUrl` next to whichever field it's working with.
function harvestTexts(value: unknown, acc: Set<string>): void {
  if (value == null) return
  if (Array.isArray(value)) { for (const v of value) harvestTexts(v, acc); return }
  if (typeof value !== 'object') return
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (typeof v === 'string' && v.trim()) {
      if (k === 'text' || k === 'indonesian' || k === 'base_text' || k === 'baseText') acc.add(v)
    } else {
      harvestTexts(v, acc)
    }
  }
}

const texts = new Set<string>()
for (const section of sectionRows ?? []) harvestTexts(section.content, texts)

// ─── Resolve audio_clips for those texts at the lesson's primary voice ─────
// Matches src/lib/ttsNormalize.ts. The audio_clips RPC matches against
// normalized_text, so callers must pass already-normalised inputs.
function normaliseText(s: string): string {
  return s.toLowerCase().trim().replace(/\s+/g, ' ')
}

async function resolveAudioUrls(rawTexts: string[], voiceId: string | null): Promise<Map<string, string>> {
  const result = new Map<string, string>()
  if (rawTexts.length === 0) return result
  const normalisedTexts = [...new Set(rawTexts.map(normaliseText))]

  // Pass 1 — voice-paired lookup with the lesson's primary voice. Picks up
  // single-word vocab, expressions, etc.
  if (voiceId) {
    const { data, error } = await supabase
      .rpc('get_audio_clips', { p_texts: normalisedTexts, p_voice_ids: [voiceId] })
    if (error) throw error
    for (const clip of (data as Array<{ normalized_text: string; voice_id: string; storage_path: string }>) ?? []) {
      if (clip.voice_id === voiceId) {
        result.set(clip.normalized_text, `${url}/storage/v1/object/public/indonesian-tts/${clip.storage_path}`)
      }
    }
  }

  // Pass 2 — voice-agnostic fallback for anything still missing. Picks up
  // multi-voice content like dialogue lines recorded per speaker.
  const unmatched = normalisedTexts.filter(t => !result.has(t))
  if (unmatched.length > 0) {
    const { data, error } = await supabase
      .rpc('get_audio_clip_per_text', { p_texts: unmatched })
    if (error) throw error
    for (const clip of (data as Array<{ normalized_text: string; storage_path: string }>) ?? []) {
      result.set(clip.normalized_text, `${url}/storage/v1/object/public/indonesian-tts/${clip.storage_path}`)
    }
  }

  return result
}

const audioMap = await resolveAudioUrls([...texts], lessonRow.primary_voice)

// Build a normalised lookup so we can match `clip.normalized_text` to source strings.
const normalisedAudioMap = new Map<string, string>()
for (const [normText, url] of audioMap) normalisedAudioMap.set(normText, url)

function injectAudio<T>(value: T): T {
  if (value == null) return value
  if (Array.isArray(value)) return value.map(injectAudio) as unknown as T
  if (typeof value !== 'object') return value
  const obj = value as Record<string, unknown>
  const out: Record<string, unknown> = {}
  let candidate: string | null = null
  for (const [k, v] of Object.entries(obj)) {
    if ((k === 'text' || k === 'indonesian' || k === 'base_text' || k === 'baseText') && typeof v === 'string') {
      candidate = v
      out[k] = v
    } else if (v && typeof v === 'object') {
      out[k] = injectAudio(v)
    } else {
      out[k] = v
    }
  }
  if (candidate) {
    const found = normalisedAudioMap.get(normaliseText(candidate))
    if (found) out.audioUrl = found
  }
  return out as unknown as T
}

const enrichedSections = (sectionRows ?? []).map((s) => ({
  order_index: s.order_index,
  content: injectAudio(s.content),
}))

// ─── Runtime component contract ─────────────────────────────────────────────
const runtimeComponents = {
  ActivationGate: {
    import: "import { ActivationGate } from '@/components/lessons/ActivationGate'",
    usage: `<ActivationGate lessonId="${lessonRow.id}" />`,
    purpose: 'The user-controlled checkbox that adds this lesson\'s capabilities to spaced review.',
    placement: 'Anywhere on the page. Conventionally near the top so it\'s visible before scrolling.',
  },
  LessonAudioPlayer: lessonAudioUrl
    ? {
        import: "import { LessonAudioPlayer } from '@/components/lessons/LessonAudioPlayer'",
        usage: `<LessonAudioPlayer src=${JSON.stringify(lessonAudioUrl)} voice=${JSON.stringify(lessonRow.primary_voice ?? '')} />`,
        purpose: 'The lesson-level explanation/overview audio player.',
        placement: 'Anywhere on the page. Conventionally near the top or in a sidebar.',
      }
    : { note: 'No lesson-level audio published for this lesson yet.' },
  PracticeActions: {
    import: "import { PracticeActions } from '@/components/lessons/PracticeActions'",
    usage: `<PracticeActions lessonId="${lessonRow.id}" />`,
    purpose: 'Wired to runtime capability counts; renders "Practice this lesson · N ready" and "Review this lesson" CTAs.',
    placement: 'Anywhere on the page. Conventionally pinned to a sidebar or near the bottom as a conclusion CTA.',
  },
} as const

// ─── Output ─────────────────────────────────────────────────────────────────
const output = {
  meta: {
    id: lessonRow.id,
    order_index: lessonRow.order_index,
    title: lessonRow.title,
    level: lessonRow.level,
    description: lessonRow.description,
    primary_voice: lessonRow.primary_voice,
    duration_seconds: lessonRow.duration_seconds,
    lesson_audio_url: lessonAudioUrl,
  },
  sections: enrichedSections,
  runtime_components: runtimeComponents,
}

console.log(JSON.stringify(output, null, pretty ? 2 : 0))
