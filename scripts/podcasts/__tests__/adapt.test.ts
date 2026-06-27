import { describe, it, expect } from 'vitest'
import { buildAdaptPrompt } from '../storyAuthor'

const source = 'Pada suatu hari, seekor kura-kura dan seekor monyet hidup di hutan. Monyet sangat rakus.'

describe('buildAdaptPrompt', () => {
  const prompt = buildAdaptPrompt({ sourceText: source, targetLevel: 'A2', sourceLevel: 'B1' })

  it('includes the source story text', () => {
    expect(prompt).toContain('kura-kura')
    expect(prompt).toContain('rakus')
  })

  it('states the target CEFR level', () => {
    expect(prompt).toContain('A2')
  })

  it('instructs grading/adaptation rather than invention', () => {
    expect(prompt.toLowerCase()).toMatch(/adapt|retell|simplif/)
  })

  it('keeps the ~95% coverage target and an easier-for-listening instruction', () => {
    expect(prompt).toContain('95%')
    expect(prompt.toLowerCase()).toContain('listen')
  })

  it('asks to preserve the plot and cultural/proper names', () => {
    expect(prompt.toLowerCase()).toMatch(/name|plot|keep|preserve/)
  })
})
