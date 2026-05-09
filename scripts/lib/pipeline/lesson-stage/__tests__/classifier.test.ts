import { describe, it, expect } from 'vitest'
import { classifyBlockKind } from '../classifier'

describe('classifyBlockKind', () => {
  it('hero → lesson_hero', () => {
    expect(classifyBlockKind({ legacyKind: 'hero', payloadType: undefined, contentUnitSlugs: [] })).toBe('lesson_hero')
  })

  it('practice_bridge passes through', () => {
    expect(classifyBlockKind({ legacyKind: 'practice_bridge', payloadType: undefined, contentUnitSlugs: [] })).toBe('practice_bridge')
  })

  it('recap → lesson_recap', () => {
    expect(classifyBlockKind({ legacyKind: 'recap', payloadType: undefined, contentUnitSlugs: [] })).toBe('lesson_recap')
  })

  it('section + dialogue payload → dialogue_card', () => {
    expect(classifyBlockKind({ legacyKind: 'section', payloadType: 'dialogue', contentUnitSlugs: [] })).toBe('dialogue_card')
  })

  it('exposure + dialogue payload → dialogue_card', () => {
    expect(classifyBlockKind({ legacyKind: 'exposure', payloadType: 'dialogue', contentUnitSlugs: [] })).toBe('dialogue_card')
  })

  it.each(['vocabulary', 'numbers', 'expressions'] as const)(
    'section + %s payload → vocab_strip',
    (payloadType) => {
      expect(classifyBlockKind({ legacyKind: 'section', payloadType, contentUnitSlugs: [] })).toBe('vocab_strip')
    },
  )

  it.each(['vocabulary', 'numbers', 'expressions'] as const)(
    'exposure + %s payload → vocab_strip',
    (payloadType) => {
      expect(classifyBlockKind({ legacyKind: 'exposure', payloadType, contentUnitSlugs: [] })).toBe('vocab_strip')
    },
  )

  it('section + slug starting with "pattern-" → pattern_callout', () => {
    expect(
      classifyBlockKind({ legacyKind: 'section', payloadType: 'grammar', contentUnitSlugs: ['pattern-ada-existence'] }),
    ).toBe('pattern_callout')
  })

  it('exposure + slug starting with "pattern-" → pattern_callout', () => {
    expect(
      classifyBlockKind({ legacyKind: 'exposure', payloadType: undefined, contentUnitSlugs: ['pattern-x'] }),
    ).toBe('pattern_callout')
  })

  it('section + grammar payload + no pattern slug → reading_section', () => {
    expect(classifyBlockKind({ legacyKind: 'section', payloadType: 'grammar', contentUnitSlugs: [] })).toBe('reading_section')
  })

  it('section + text payload → reading_section', () => {
    expect(classifyBlockKind({ legacyKind: 'section', payloadType: 'text', contentUnitSlugs: [] })).toBe('reading_section')
  })

  it('section + culture payload → reading_section', () => {
    expect(classifyBlockKind({ legacyKind: 'section', payloadType: 'culture', contentUnitSlugs: [] })).toBe('reading_section')
  })

  it('exposure + reference_table payload → reading_section', () => {
    expect(classifyBlockKind({ legacyKind: 'exposure', payloadType: 'reference_table', contentUnitSlugs: [] })).toBe('reading_section')
  })

  it('precedence: hero beats payloadType=dialogue', () => {
    expect(classifyBlockKind({ legacyKind: 'hero', payloadType: 'dialogue', contentUnitSlugs: [] })).toBe('lesson_hero')
  })

  it('precedence: practice_bridge beats payloadType=vocabulary', () => {
    expect(classifyBlockKind({ legacyKind: 'practice_bridge', payloadType: 'vocabulary', contentUnitSlugs: [] })).toBe('practice_bridge')
  })

  it('precedence: dialogue beats pattern slug', () => {
    expect(classifyBlockKind({ legacyKind: 'section', payloadType: 'dialogue', contentUnitSlugs: ['pattern-x'] })).toBe('dialogue_card')
  })

  it('precedence: vocab_strip beats pattern slug', () => {
    expect(classifyBlockKind({ legacyKind: 'section', payloadType: 'vocabulary', contentUnitSlugs: ['pattern-x'] })).toBe('vocab_strip')
  })
})
