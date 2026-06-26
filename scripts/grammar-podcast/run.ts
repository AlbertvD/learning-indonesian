// Phase 2 — the orchestrator. Resumable, daily-capped loop that drives the whole
// grammar-podcast pipeline across all lessons: for each (lesson, language) episode
// still missing audio, it builds the briefing, generates via NotebookLM, runs the
// Gemini quality gate, and publishes on pass (flags on fail). NL-first.
//
// The DB is the to-do list: "done" = the lesson's audio path column is non-null,
// so a restart resumes exactly where it left off — no side-state.
//
// Usage:
//   NODE_TLS_REJECT_UNAUTHORIZED=0 bun scripts/grammar-podcast/run.ts [options]
//     --max-per-day N      episodes to generate before stopping the day (default 4; raise on a paid tier)
//     --loop               sleep to the next day and continue until all episodes exist
//     --sleep-seconds S    sleep between days in --loop mode (default 86400)
//     --auto-regenerate    on a gate failure, regenerate the episode once before flagging
//
// notebooklm login + GEMINI_API_KEY required (see generate.ts / quality-gate.ts).

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { buildTodo, type LessonAudioState } from './todo'

for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/)
  if (m) process.env[m[1]] = m[2]
}
const url = process.env.VITE_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_KEY
if (!url || !key) throw new Error('VITE_SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in .env.local')
const supabase = createClient(url, key, { db: { schema: 'indonesian' } })

const argv = process.argv.slice(2)
const flag = (name: string) => argv.includes(name)
const opt = (name: string, def: number) => {
  const i = argv.indexOf(name)
  return i >= 0 ? Number(argv[i + 1]) : def
}
const maxPerDay = opt('--max-per-day', 4)
const loop = flag('--loop')
const sleepSeconds = opt('--sleep-seconds', 86400)
const autoRegenerate = flag('--auto-regenerate')

const jobFor = (lesson: number, lang: string) => `content/grammar-briefings/lesson-${lesson}.${lang}.job.json`

async function sh(cmd: string[]): Promise<boolean> {
  const proc = Bun.spawn(cmd, { stdout: 'inherit', stderr: 'inherit', env: { ...process.env, NODE_TLS_REJECT_UNAUTHORIZED: '0' } })
  return (await proc.exited) === 0
}

async function fetchTodo() {
  const { data, error } = await supabase
    .from('lessons')
    .select('order_index, audio_path, audio_path_en, is_hidden')
    .order('order_index')
  if (error) throw error
  return buildTodo((data ?? []) as LessonAudioState[])
}

// Process one episode: build → generate → gate → publish/flag.
// Returns 'published' | 'flagged' | 'stop' (generate failed — likely the daily cap).
async function processEpisode(lesson: number, lang: string): Promise<'published' | 'flagged' | 'stop'> {
  const job = jobFor(lesson, lang)
  await sh(['bun', 'scripts/grammar-podcast/build-briefings.ts', String(lesson)])

  if (!(await sh(['bun', 'scripts/grammar-podcast/generate.ts', job]))) {
    console.log(`[run] L${lesson} ${lang}: generate failed — stopping (daily cap or transient).`)
    return 'stop'
  }

  let passed = await sh(['bun', 'scripts/grammar-podcast/quality-gate.ts', job])
  if (!passed && autoRegenerate) {
    console.log(`[run] L${lesson} ${lang}: gate failed — regenerating once.`)
    if (!(await sh(['bun', 'scripts/grammar-podcast/generate.ts', job]))) return 'stop'
    passed = await sh(['bun', 'scripts/grammar-podcast/quality-gate.ts', job])
  }
  if (!passed) {
    console.log(`[run] L${lesson} ${lang}: gate failed — FLAGGED, not published (path stays null).`)
    return 'flagged'
  }

  if (!(await sh(['bun', 'scripts/grammar-podcast/publish.ts', job]))) {
    console.log(`[run] L${lesson} ${lang}: publish FAILED (see error above) — path stays null, left for a later round.`)
    return 'flagged'
  }
  return 'published'
}

let published = 0
let flagged = 0
for (;;) {
  const todo = await fetchTodo()
  if (todo.length === 0) {
    console.log('[run] ✓ all episodes exist — nothing to do.')
    break
  }
  console.log(`[run] ${todo.length} episode(s) remaining; generating up to ${maxPerDay} this round.`)

  let stopped = false
  for (const ep of todo.slice(0, maxPerDay)) {
    const outcome = await processEpisode(ep.lesson, ep.lang)
    if (outcome === 'stop') { stopped = true; break }
    if (outcome === 'published') published++
    else flagged++
  }

  const remaining = await fetchTodo()
  console.log(`[run] round done — published=${published} flagged=${flagged} remaining=${remaining.length}`)
  if (remaining.length === 0) break
  if (!loop) {
    console.log(`[run] (re-run, or pass --loop to continue automatically. ${stopped ? 'Stopped on a generate failure — likely the daily cap.' : ''})`)
    break
  }
  console.log(`[run] sleeping ${sleepSeconds}s until the next round…`)
  await new Promise((r) => setTimeout(r, sleepSeconds * 1000))
}

console.log(`[run] done. published=${published} flagged=${flagged}`)
