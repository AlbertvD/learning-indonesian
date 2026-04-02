import { describe, it, expect } from 'vitest'
import type { LessonSection } from '@/services/lessonService'

function grammarFirst(sections: LessonSection[]): LessonSection[] {
  return [...sections].sort((a, b) => {
    const aIsGrammar = (a.content as { type?: string }).type === 'grammar' ? -1 : 0
    const bIsGrammar = (b.content as { type?: string }).type === 'grammar' ? -1 : 0
    return aIsGrammar - bIsGrammar
  })
}

const makeSection = (id: string, type: string, order_index: number): LessonSection => ({
  id,
  lesson_id: 'lesson-1',
  title: `Section ${id}`,
  content: { type },
  order_index,
})

describe('grammarFirst', () => {
  it('moves a grammar section from index 1 to index 0', () => {
    const sections = [
      makeSection('a', 'text', 0),
      makeSection('b', 'grammar', 1),
      makeSection('c', 'dialogue', 2),
    ]
    const result = grammarFirst(sections)
    expect((result[0].content as { type: string }).type).toBe('grammar')
  })

  it('leaves order unchanged when grammar is already first', () => {
    const sections = [
      makeSection('a', 'grammar', 0),
      makeSection('b', 'text', 1),
    ]
    const result = grammarFirst(sections)
    expect(result[0].id).toBe('a')
    expect(result[1].id).toBe('b')
  })

  it('leaves order unchanged when there is no grammar section', () => {
    const sections = [
      makeSection('a', 'text', 0),
      makeSection('b', 'dialogue', 1),
      makeSection('c', 'exercises', 2),
    ]
    const result = grammarFirst(sections)
    expect(result.map((s) => s.id)).toEqual(['a', 'b', 'c'])
  })

  it('does not mutate the original array', () => {
    const sections = [
      makeSection('a', 'text', 0),
      makeSection('b', 'grammar', 1),
    ]
    grammarFirst(sections)
    expect(sections[0].id).toBe('a')
  })
})
