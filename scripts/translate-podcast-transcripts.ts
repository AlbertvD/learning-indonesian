// One-off content utility: fill podcasts[].transcript_english by translating the
// Dutch transcript to English via Claude. podcasts.ts is the seed source-of-truth
// (seed-podcasts.ts upserts the whole row on conflict by title), so the English
// must live here to survive a re-seed. Run: bun scripts/translate-podcast-transcripts.ts
//   then: bun scripts/seed-podcasts.ts  (push to DB)
import Anthropic from '@anthropic-ai/sdk'
import { readFileSync, writeFileSync } from 'node:fs'
import { podcasts } from './data/podcasts'

for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/)
  if (m) process.env[m[1]] = m[2]
}
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const prompt = (dutch: string) => `Translate this Dutch podcast transcript into natural, fluent English.

Context: a warm two-host audio discussion that explains Indonesian language and grammar for learners.

Rules:
- Translate the Dutch narration and discussion into English.
- Keep every Indonesian word, phrase, or example sentence EXACTLY as written — do NOT translate the Indonesian itself; it is the subject being discussed. Where the Dutch gives a Dutch meaning of an Indonesian word, translate that meaning to English.
- Preserve the paragraph structure and the conversational, encouraging tone.
- Output ONLY the English translation — no preamble, no notes, no quotation fences.

Transcript:
"""
${dutch}
"""`

let src = readFileSync('scripts/data/podcasts.ts', 'utf8')
const NEEDLE = '    transcript_english: null,'

for (const p of podcasts) {
  if (p.transcript_english !== null) { console.log(`· skip "${p.title}" (already has EN)`); continue }
  if (!p.transcript_dutch) { console.log(`· skip "${p.title}" (no Dutch source)`); continue }
  console.log(`► translating "${p.title}" (${p.transcript_dutch.length} Dutch chars)…`)
  const resp = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 16384,
    messages: [{ role: 'user', content: prompt(p.transcript_dutch) }],
  })
  const en = resp.content[0]?.type === 'text' ? resp.content[0].text.trim() : ''
  if (!en) { console.log('  ✗ empty translation — leaving null'); continue }
  const esc = en.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${')
  const idx = src.indexOf(NEEDLE)
  if (idx === -1) { console.log('  ✗ no transcript_english:null slot left'); continue }
  src = src.slice(0, idx) + '    transcript_english: `' + esc + '`,' + src.slice(idx + NEEDLE.length)
  console.log(`  ✓ ${en.length} English chars injected`)
}

writeFileSync('scripts/data/podcasts.ts', src)
console.log('✓ podcasts.ts updated — now run: bun scripts/seed-podcasts.ts')
