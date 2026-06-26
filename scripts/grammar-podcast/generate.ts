// Phase 2 — generate one grammar-podcast episode by driving the notebooklm-py CLI
// (installed in .venv). Reads a job spec (from build-briefings.ts), creates a
// NotebookLM notebook, uploads the briefing, generates the audio overview in the
// episode's language with the branded prompt, and downloads the MP3.
//
// Usage:
//   bun scripts/grammar-podcast/generate.ts <jobSpecPath> [--out <dir>]
//   e.g. bun scripts/grammar-podcast/generate.ts content/grammar-briefings/lesson-1.nl.job.json
//
// No NotebookLM API exists; the CLI is the stable interface. `notebooklm login`
// must have been run once (auth is cached). Generation is slow (minutes) and
// daily-capped — the CLI's --retry handles rate-limit backoff; a hard cap surfaces
// as a non-zero exit which the orchestrator treats as "stop for today".

import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'

const NLM = '.venv/bin/notebooklm'

// Map our episode language to NotebookLM's language codes (see `notebooklm
// language list`): English = 'en', Dutch = 'nl_NL'.
const NLM_LANG: Record<'nl' | 'en', string> = { nl: 'nl_NL', en: 'en' }

interface JobSpec {
  lesson: number
  lang: 'nl' | 'en'
  level: string
  notebookTitle: string
  instructionPrompt: string
  briefingPath: string
  topics: string[]
}

async function runNlm(args: string[]): Promise<{ stdout: string; stderr: string; code: number }> {
  const proc = Bun.spawn([NLM, ...args], { stdout: 'pipe', stderr: 'pipe' })
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ])
  return { stdout, stderr, code }
}

// Many commands print a JSON object with --json; pull the notebook id out of it
// regardless of the exact key name the version uses.
function parseNotebookId(stdout: string): string | null {
  try {
    const obj = JSON.parse(stdout.trim())
    return obj.id ?? obj.notebook_id ?? obj.notebookId ?? obj.notebook?.id ?? null
  } catch {
    return null
  }
}

const jobPath = process.argv[2]
if (!jobPath || !existsSync(jobPath)) {
  console.error('Usage: bun scripts/grammar-podcast/generate.ts <jobSpecPath> [--out <dir>]')
  process.exit(1)
}
const outFlag = process.argv.indexOf('--out')
const outDir = outFlag >= 0 ? process.argv[outFlag + 1] : 'content/grammar-podcast'
mkdirSync(outDir, { recursive: true })

const job = JSON.parse(readFileSync(jobPath, 'utf8')) as JobSpec
if (!existsSync(job.briefingPath)) throw new Error(`briefing not found: ${job.briefingPath}`)
const log = (m: string) => console.log(`[L${job.lesson} ${job.lang}] ${m}`)

if (!existsSync(NLM)) throw new Error(`${NLM} not found — set up the venv (uv) + 'notebooklm login' first`)

// 1. create notebook
log(`creating notebook "${job.notebookTitle}"`)
const created = await runNlm(['create', job.notebookTitle, '--json'])
if (created.code !== 0) throw new Error(`create failed: ${created.stderr || created.stdout}`)
const nbId = parseNotebookId(created.stdout)
if (!nbId) throw new Error(`could not parse notebook id from: ${created.stdout}`)
log(`notebook ${nbId}`)

// 2. add briefing as a source + wait for processing
log(`adding source ${job.briefingPath}`)
const added = await runNlm(['source', 'add', job.briefingPath, '-n', nbId, '--type', 'file', '--json'])
if (added.code !== 0) throw new Error(`source add failed: ${added.stderr || added.stdout}`)
// `source wait` takes the SOURCE_ID (not -n). Parse it from the add output and
// wait for processing; skip gracefully if the id shape is unexpected.
let sourceId: string | null = null
try {
  const o = JSON.parse(added.stdout.trim())
  sourceId = o.id ?? o.source_id ?? o.sourceId ?? o.source?.id ?? null
} catch { /* non-JSON output — skip wait */ }
if (sourceId) {
  const waited = await runNlm(['source', 'wait', sourceId, '-n', nbId])
  if (waited.code !== 0) log(`source wait warning: ${waited.stderr.trim()}`)
}

// 3. generate the audio overview (branded prompt via file; per-episode language; long+deep-dive)
const promptFile = `${outDir}/lesson-${job.lesson}.${job.lang}.prompt.txt`
writeFileSync(promptFile, job.instructionPrompt, 'utf8')
log(`generating audio (language=${job.lang}, deep-dive, long) — this takes minutes`)
const gen = await runNlm([
  'generate', 'audio',
  '--prompt-file', promptFile,
  '-n', nbId,
  '--language', NLM_LANG[job.lang],
  '--format', 'deep-dive',
  '--length', 'long',
  '--wait', '--timeout', '1800', '--retry', '2',
  '--json',
])
if (gen.code !== 0) throw new Error(`generate audio failed (possible daily cap): ${gen.stderr || gen.stdout}`)
log(`audio generated`)

// 4. download the MP3
const audioPath = `${outDir}/lesson-${job.lesson}.${job.lang}.mp3`
log(`downloading → ${audioPath}`)
const dl = await runNlm(['download', 'audio', audioPath, '-n', nbId])
if (dl.code !== 0) throw new Error(`download failed: ${dl.stderr || dl.stdout}`)

const result = { lesson: job.lesson, lang: job.lang, notebookId: nbId, audioPath, generatedOk: true }
writeFileSync(`${outDir}/lesson-${job.lesson}.${job.lang}.result.json`, JSON.stringify(result, null, 2) + '\n', 'utf8')
log(`✓ done → ${audioPath}`)
