import { describe, it, expect } from 'vitest'
import { buildAuthorPrompt } from '../storyAuthor'

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
