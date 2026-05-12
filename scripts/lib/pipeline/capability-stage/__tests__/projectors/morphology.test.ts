import { describe, it, expect } from 'vitest'
import { MORPHOLOGY_PATTERN_SLUGS, lessonIntroducesMorphology } from '../../projectors/morphology'

describe('lessonIntroducesMorphology — Decision 3 gate', () => {
  it('returns false when no morphology slug is present (lessons 1–8 today)', () => {
    expect(lessonIntroducesMorphology(['intensifier-position', 'verb-ordering-abc'])).toBe(false)
  })

  it('returns false for an empty list', () => {
    expect(lessonIntroducesMorphology([])).toBe(false)
  })

  it('returns true when a morphology slug is present (e.g. men-active in lesson 9)', () => {
    expect(lessonIntroducesMorphology(['men-active', 'intensifier-position'])).toBe(true)
  })

  it('MORPHOLOGY_PATTERN_SLUGS includes the canonical lesson 9 slug', () => {
    expect(MORPHOLOGY_PATTERN_SLUGS.has('men-active')).toBe(true)
  })
})
