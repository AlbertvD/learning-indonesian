// Story-podcast translation — ID sentences → aligned NL/EN segments.
//
// `alignTranslations` is the pure, sentence-aligned zip with the alignment
// invariant (one ID sentence ↔ one NL ↔ one EN). The Gemini-backed
// `translateSegments` (added when wiring run.ts) translates the Indonesian
// sentence array to NL and EN preserving count, then calls this.

import { GoogleGenAI } from '@google/genai'
import type { TranscriptSegment } from '@/services/podcastService'

/**
 * Zip equal-length Indonesian / Dutch / English sentence arrays into ordered
 * `TranscriptSegment`s. Throws if the arrays differ in length — the alignment
 * invariant that keeps read-along trustworthy (ADR 0022).
 */
export function alignTranslations(ids: string[], nls: string[], ens: string[]): TranscriptSegment[] {
  if (ids.length !== nls.length || ids.length !== ens.length) {
    throw new Error(
      `cannot align translations: ${ids.length} ID, ${nls.length} NL, ${ens.length} EN sentences must match`,
    )
  }
  return ids.map((id, idx) => ({ idx, id, nl: nls[idx], en: ens[idx] }))
}

const TRANSLATE_SCHEMA = {
  type: 'object',
  properties: {
    dutch: { type: 'array', items: { type: 'string' } },
    english: { type: 'array', items: { type: 'string' } },
  },
  required: ['dutch', 'english'],
} as const

/**
 * Translate an ordered Indonesian sentence array to Dutch and English with one
 * Gemini call, preserving order and count (one translation per sentence), then
 * zip into aligned segments. Throws via `alignTranslations` if the model returns
 * a different count — the alignment invariant is the guard.
 */
export async function translateSegments(idSentences: string[], ai?: GoogleGenAI): Promise<TranscriptSegment[]> {
  const client = ai ?? new GoogleGenAI({ apiKey: requireKey() })
  const model = process.env.GEMINI_MODEL ?? 'gemini-2.5-flash'
  const prompt = [
    'Translate each Indonesian sentence below to Dutch and to English.',
    'Return one Dutch translation and one English translation per sentence, in the same order — the arrays must have exactly the same length as the input.',
    'Translate sentence-by-sentence; do not merge or split sentences.',
    '',
    ...idSentences.map((s, i) => `${i + 1}. ${s}`),
  ].join('\n')

  const response = await client.models.generateContent({
    model,
    contents: prompt,
    config: { responseMimeType: 'application/json', responseJsonSchema: TRANSLATE_SCHEMA },
  })
  const { dutch, english } = JSON.parse(response.text!) as { dutch: string[]; english: string[] }
  return alignTranslations(idSentences, dutch, english)
}

function requireKey(): string {
  const key = process.env.GEMINI_API_KEY
  if (!key) throw new Error('GEMINI_API_KEY must be set in .env.local')
  return key
}
