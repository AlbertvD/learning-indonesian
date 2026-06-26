// Phase 2 — output quality gate: Gemini listens to a generated episode and grades
// it against the rubric (qualityRubric.ts). One multimodal call — no separate
// speech-to-text. Writes a verdict and exits non-zero on any failure so the
// orchestrator withholds publish.
//
// Usage:
//   bun scripts/grammar-podcast/quality-gate.ts <jobSpecPath> [--audio <mp3>]
//   e.g. bun scripts/grammar-podcast/quality-gate.ts content/grammar-briefings/lesson-1.nl.job.json
//
// Requires GEMINI_API_KEY in .env.local (free from aistudio.google.com).
// Model override: GEMINI_MODEL (default gemini-2.5-flash — audio-capable).

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { GoogleGenAI, createPartFromUri, createUserContent } from '@google/genai'
import { buildGradingPrompt, evaluate, RESPONSE_SCHEMA, type GateInput, type RubricVerdict } from './qualityRubric'

for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/)
  if (m) process.env[m[1]] = m[2]
}

const apiKey = process.env.GEMINI_API_KEY
if (!apiKey) throw new Error('GEMINI_API_KEY must be set in .env.local (free key from aistudio.google.com)')
const model = process.env.GEMINI_MODEL ?? 'gemini-2.5-flash'

interface JobSpec { lesson: number; lang: 'nl' | 'en'; level: string; topics: string[] }

const jobPath = process.argv[2]
if (!jobPath || !existsSync(jobPath)) {
  console.error('Usage: bun scripts/grammar-podcast/quality-gate.ts <jobSpecPath> [--audio <mp3>]')
  process.exit(1)
}
const job = JSON.parse(readFileSync(jobPath, 'utf8')) as JobSpec
const audioFlag = process.argv.indexOf('--audio')
const audioPath = audioFlag >= 0 ? process.argv[audioFlag + 1] : `content/grammar-podcast/lesson-${job.lesson}.${job.lang}.mp3`
if (!existsSync(audioPath)) throw new Error(`audio not found: ${audioPath}`)

const input: GateInput = { lesson: job.lesson, lang: job.lang, level: job.level, topics: job.topics }
const log = (m: string) => console.log(`[gate L${job.lesson} ${job.lang}] ${m}`)

const ai = new GoogleGenAI({ apiKey })

log(`uploading ${audioPath}`)
let file = await ai.files.upload({ file: audioPath, config: { mimeType: 'audio/mpeg' } })
// Wait for the Files API to finish processing the audio before referencing it.
while (file.state === 'PROCESSING') {
  await new Promise((r) => setTimeout(r, 2000))
  file = await ai.files.get({ name: file.name! })
}
if (file.state === 'FAILED') throw new Error('Gemini file processing failed')
log(`grading with ${model}`)

const response = await ai.models.generateContent({
  model,
  contents: createUserContent([createPartFromUri(file.uri!, file.mimeType!), buildGradingPrompt(input)]),
  config: { responseMimeType: 'application/json', responseJsonSchema: RESPONSE_SCHEMA },
})

await ai.files.delete({ name: file.name! }).catch(() => {})

const verdict = JSON.parse(response.text!) as RubricVerdict
const result = evaluate(input, verdict)

const outPath = `content/grammar-podcast/lesson-${job.lesson}.${job.lang}.verdict.json`
writeFileSync(outPath, JSON.stringify(result, null, 2) + '\n', 'utf8')

log(result.pass ? '✓ PASS' : `✗ FAIL: ${result.failures.join(', ')}`)
log(verdict.summary)
if (verdict.coverage.missingTopics.length) log(`missing topics: ${verdict.coverage.missingTopics.join(', ')}`)
console.log(`→ ${outPath}`)
process.exit(result.pass ? 0 : 1)
