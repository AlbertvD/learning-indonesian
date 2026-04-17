import { describe, it, expect } from 'vitest'
import { getSemanticGroup } from '@/lib/semanticGroups'

describe('getSemanticGroup — new abstract groups', () => {
  it('classifies "love" (EN) as emotions', () => {
    expect(getSemanticGroup('love', 'en')).toBe('emotions')
  })
  it('classifies "liefde" (NL) as emotions', () => {
    expect(getSemanticGroup('liefde', 'nl')).toBe('emotions')
  })
  it('classifies "remember" (EN) as mental_states', () => {
    expect(getSemanticGroup('remember', 'en')).toBe('mental_states')
  })
  it('classifies "denken" (NL) as mental_states', () => {
    expect(getSemanticGroup('denken', 'nl')).toBe('mental_states')
  })
  it('classifies "idee" (NL) as abstract_concepts', () => {
    expect(getSemanticGroup('idee', 'nl')).toBe('abstract_concepts')
  })
  it('classifies "freedom" (EN) as abstract_concepts', () => {
    expect(getSemanticGroup('freedom', 'en')).toBe('abstract_concepts')
  })
})

describe('getSemanticGroup — pre-existing behavior preserved', () => {
  it('food keywords still match food', () => {
    expect(getSemanticGroup('rijst', 'nl')).toBe('food')
    expect(getSemanticGroup('rice', 'en')).toBe('food')
  })
  it('concrete nouns do not match abstract groups', () => {
    expect(getSemanticGroup('huis', 'nl')).toBe('places')
    // "rice" matches food before any abstract group — confirms append-only
    // ordering didn't shift existing classifications.
  })
})

describe('getSemanticGroup — known pre-existing bugs from .includes() collisions (regression guard)', () => {
  // These tests assert buggy current behavior so a future fix is intentional,
  // not accidental. See docs/plans/2026-04-17-pos-aware-distractors-design.md
  // §Disambiguation note. Fix would switch .includes() to word-boundary matching.

  it('"maandag" (NL) falsely matches greetings via "dag"', () => {
    expect(getSemanticGroup('maandag', 'nl')).toBe('greetings')
  })

  it('"think" (EN) falsely matches greetings via "hi" (earlier in order than adjectives_size/thin)', () => {
    expect(getSemanticGroup('think', 'en')).toBe('greetings')
  })

  it('"waarheid" (NL) falsely matches food via "ei"', () => {
    expect(getSemanticGroup('waarheid', 'nl')).toBe('food')
  })
})
