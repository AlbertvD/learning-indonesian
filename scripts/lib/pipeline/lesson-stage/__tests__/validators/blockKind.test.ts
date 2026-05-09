import { describe, it, expect } from 'vitest'
import { validateBlockKind } from '../../validators/blockKind'

describe('validateBlockKind (GT2)', () => {
  it.each([
    'lesson_hero',
    'reading_section',
    'vocab_strip',
    'dialogue_card',
    'pattern_callout',
    'practice_bridge',
    'lesson_recap',
  ])('accepts canonical block_kind=%s', (kind) => {
    expect(validateBlockKind([{ block_key: 'b1', block_kind: kind }])).toEqual([])
  })

  it.each(['hero', 'section', 'exposure', 'recap'])('rejects legacy block_kind=%s', (kind) => {
    const findings = validateBlockKind([{ block_key: 'b1', block_kind: kind }])
    expect(findings).toHaveLength(1)
    expect(findings[0].gate).toBe('GT2')
    expect(findings[0].severity).toBe('error')
    expect(findings[0].context?.blockKey).toBe('b1')
  })

  it('rejects missing block_kind', () => {
    const findings = validateBlockKind([{ block_key: 'b1', block_kind: undefined as unknown as string }])
    expect(findings).toHaveLength(1)
    expect(findings[0].gate).toBe('GT2')
  })

  it('rejects empty string', () => {
    const findings = validateBlockKind([{ block_key: 'b1', block_kind: '' }])
    expect(findings).toHaveLength(1)
    expect(findings[0].gate).toBe('GT2')
  })

  it('reports each offender separately', () => {
    const findings = validateBlockKind([
      { block_key: 'b1', block_kind: 'hero' },
      { block_key: 'b2', block_kind: 'lesson_hero' },
      { block_key: 'b3', block_kind: 'something_else' },
    ])
    expect(findings).toHaveLength(2)
    expect(findings.map((f) => f.context?.blockKey)).toEqual(['b1', 'b3'])
  })
})
