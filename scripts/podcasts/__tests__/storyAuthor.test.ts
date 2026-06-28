import { describe, it, expect } from 'vitest'
import { buildAuthorPrompt, buildAdaptPrompt, LENGTH_BY_LEVEL } from '../storyAuthor'

describe('buildAuthorPrompt', () => {
  const prompt = buildAuthorPrompt({
    level: 'A2',
    topic: 'buying breakfast at a Yogyakarta warung',
    vocabPool: ['pasar', 'beli', 'makan', 'pagi', 'enak'],
  })

  it('states the target CEFR level', () => {
    expect(prompt).toContain('A2')
  })

  it('states the topic', () => {
    expect(prompt).toContain('buying breakfast at a Yogyakarta warung')
  })

  it('passes the vocab pool to lean on', () => {
    expect(prompt).toContain('pasar')
    expect(prompt).toContain('enak')
  })

  it('instructs the ~95% known-word coverage target', () => {
    expect(prompt).toContain('95%')
  })

  it('asks for a warm storyteller register', () => {
    expect(prompt.toLowerCase()).toContain('warm')
  })
})

describe('buildAdaptPrompt', () => {
  const prompt = buildAdaptPrompt({
    sourceText: 'Sebuah cerita panjang yang harus diringkas.',
    targetLevel: 'B2',
    sourceLevel: 'StoryWeaver Level 4',
  })

  it('caps the length so a long source is condensed (fits the narrator byte limit)', () => {
    // A long source must be retold within the level's sentence budget, not at
    // full length — otherwise the narration SSML overflows the 5000-byte cap.
    expect(prompt).toContain(LENGTH_BY_LEVEL.B2)
  })

  it('carries the target level and the source level hint', () => {
    expect(prompt).toContain('B2')
    expect(prompt).toContain('StoryWeaver Level 4')
  })
})
