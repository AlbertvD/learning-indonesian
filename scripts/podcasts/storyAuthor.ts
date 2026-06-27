// Story-podcast author (Gemini).
//
// `buildAuthorPrompt` is pure and unit-tested; `authorStory` makes the Gemini
// call lazily (no client/env read at import time, so the prompt builder stays
// testable without a key). Returns a structured story: title, description, and
// the Indonesian sentence array (already segmented — alignment is then free).
//
// Slice 1 (#293): the vocab pool is accepted but may be empty — populating it
// from `learning_items` at level is slice 2 (#294).

import { GoogleGenAI } from '@google/genai'
import type { Level } from './pacing'

export interface AuthorInput {
  level: Level
  topic: string
  vocabPool: string[]
}

export interface StoryDraft {
  title: string
  description: string
  sentences: string[]
}

const LENGTH_BY_LEVEL: Record<Level, string> = {
  A1: '8–12 short, simple sentences',
  A2: '12–18 sentences',
  B1: '18–28 sentences',
  B2: '25–35 sentences',
}

export function buildAuthorPrompt(input: AuthorInput): string {
  const { level, topic, vocabPool } = input
  const poolLine = vocabPool.length
    ? `Lean on this Indonesian vocabulary the learner already studies (use these words where natural; you need not use all): ${vocabPool.join(', ')}.`
    : 'Use only common, high-frequency Indonesian vocabulary appropriate to the level.'

  return [
    `Write a warm, gentle Indonesian short story for a language learner at CEFR level ${level}.`,
    `Topic: ${topic}.`,
    `Length: ${LENGTH_BY_LEVEL[level]}.`,
    poolLine,
    `Comprehensibility is the priority: aim for at least 95% of the words to be ones a learner at ${level} already knows. Introduce at most a few new words, each understandable from context.`,
    `Tone: a warm storyteller speaking to the listener — natural, vivid, kind. This will be narrated as audio.`,
    `Return the story as a structured object: a short title (Indonesian), a one-sentence Dutch description, and the story as an ordered array of individual Indonesian sentences (one sentence per element, in reading order).`,
  ].join('\n')
}

export const AUTHOR_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    description: { type: 'string' },
    sentences: { type: 'array', items: { type: 'string' } },
  },
  required: ['title', 'description', 'sentences'],
} as const

export async function authorStory(input: AuthorInput, ai?: GoogleGenAI): Promise<StoryDraft> {
  const client = ai ?? new GoogleGenAI({ apiKey: requireKey() })
  const model = process.env.GEMINI_MODEL ?? 'gemini-2.5-flash'
  const response = await client.models.generateContent({
    model,
    contents: buildAuthorPrompt(input),
    config: { responseMimeType: 'application/json', responseJsonSchema: AUTHOR_SCHEMA },
  })
  const draft = JSON.parse(response.text!) as StoryDraft
  if (!draft.sentences?.length) throw new Error('author returned no sentences')
  return draft
}

function requireKey(): string {
  const key = process.env.GEMINI_API_KEY
  if (!key) throw new Error('GEMINI_API_KEY must be set in .env.local')
  return key
}
