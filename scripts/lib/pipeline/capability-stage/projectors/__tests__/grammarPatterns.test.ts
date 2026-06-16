/**
 * grammarPatterns.test.ts — unit tests for projectPatternsFromCategories
 * (Slice 2 Task 3, the pure pattern projector).
 *
 * Verifies the OQ2-5 model: one grammar category = one pattern, lesson-prefixed
 * slug (global uniqueness), the cap shape (recognise_grammar_pattern_cap + contrast_grammar_pattern_cap),
 * canonical-key formula, NOT-NULL derivations, collision handling, and purity.
 * NO grammar_pattern_examples (OQ2-4) — the projector never touches examples.
 */

import { describe, it, expect } from 'vitest'
import { projectPatternsFromCategories } from '../grammar'
import type { TypedGrammarCategory } from '../../loadFromDb'

function cat(overrides: Partial<TypedGrammarCategory> & { title: string; display_order: number }): TypedGrammarCategory {
  return {
    id: `cat-${overrides.display_order}`,
    section_id: 'section-grammar-1',
    lesson_id: 'lesson-uuid-6',
    title_en: null,
    rules: ['a rule'],
    rules_en: [],
    examples: [],
    ...overrides,
  }
}

const LESSON_ID = 'lesson-uuid-6'
const LESSON_N = 6

describe('projectPatternsFromCategories', () => {
  it('emits one pattern per category, each with 3 capabilities (ADR 0017)', () => {
    const out = projectPatternsFromCategories({
      categories: [
        cat({ title: 'Bukan — ontkenning', display_order: 1 }),
        cat({ title: 'Jangan — verbod', display_order: 2 }),
      ],
      lessonNumber: LESSON_N,
      lessonId: LESSON_ID,
    })
    expect(out.patternPlans).toHaveLength(2)
    for (const plan of out.patternPlans) {
      expect(plan.capabilities).toHaveLength(3)
      expect(plan.capabilities.map((c) => c.capabilityType).sort()).toEqual([
        'contrast_grammar_pattern_cap',
        'produce_grammar_pattern_cap',
        'recognise_grammar_pattern_cap',
      ])
    }
  })

  it('ADR 0017: the produce cap is gated after contrast, with a distinct canonical key', () => {
    const out = projectPatternsFromCategories({
      categories: [cat({ title: 'Belum sudah', display_order: 1 })],
      lessonNumber: LESSON_N,
      lessonId: LESSON_ID,
    })
    const caps = out.patternPlans[0].capabilities
    const rec = caps.find((c) => c.capabilityType === 'recognise_grammar_pattern_cap')!
    const con = caps.find((c) => c.capabilityType === 'contrast_grammar_pattern_cap')!
    const prod = caps.find((c) => c.capabilityType === 'produce_grammar_pattern_cap')!
    expect(prod.prerequisiteKeys).toEqual([con.canonicalKey])
    expect(new Set([rec.canonicalKey, con.canonicalKey, prod.canonicalKey]).size).toBe(3)
  })

  it('derives a lesson-prefixed slug from stableSlug(title)', () => {
    const out = projectPatternsFromCategories({
      categories: [cat({ title: 'Bukan — ontkenning van zelfstandige naamwoorden', display_order: 1 })],
      lessonNumber: LESSON_N,
      lessonId: LESSON_ID,
    })
    expect(out.patternPlans[0].slug).toBe('l6-bukan-ontkenning-van-zelfstandige-naamwoorden')
  })

  it('builds the canonical_key + source_ref in the expected format', () => {
    const out = projectPatternsFromCategories({
      categories: [cat({ title: 'Jangan verbod', display_order: 1 })],
      lessonNumber: LESSON_N,
      lessonId: LESSON_ID,
    })
    const plan = out.patternPlans[0]
    expect(plan.sourceRef).toBe('lesson-6/pattern-l6-jangan-verbod')
    const rec = plan.capabilities.find((c) => c.capabilityType === 'recognise_grammar_pattern_cap')!
    const con = plan.capabilities.find((c) => c.capabilityType === 'contrast_grammar_pattern_cap')!
    expect(rec.canonicalKey).toBe('cap:v1:grammar_pattern_src:lesson-6/pattern-l6-jangan-verbod:recognise_grammar_pattern_cap:none:text:none')
    expect(con.canonicalKey).toBe('cap:v1:grammar_pattern_src:lesson-6/pattern-l6-jangan-verbod:contrast_grammar_pattern_cap:none:text:none')
  })

  it('the contrast cap has the recognition cap as its prerequisite', () => {
    const out = projectPatternsFromCategories({
      categories: [cat({ title: 'Belum sudah', display_order: 1 })],
      lessonNumber: LESSON_N,
      lessonId: LESSON_ID,
    })
    const plan = out.patternPlans[0]
    const rec = plan.capabilities.find((c) => c.capabilityType === 'recognise_grammar_pattern_cap')!
    const con = plan.capabilities.find((c) => c.capabilityType === 'contrast_grammar_pattern_cap')!
    expect(rec.prerequisiteKeys).toEqual([])
    expect(con.prerequisiteKeys).toEqual([rec.canonicalKey])
  })

  it('all caps are pattern-kind, text/none/none, with no required artifacts', () => {
    const out = projectPatternsFromCategories({
      categories: [cat({ title: 'Kah suffix', display_order: 1 })],
      lessonNumber: LESSON_N,
      lessonId: LESSON_ID,
    })
    for (const c of out.patternPlans[0].capabilities) {
      expect(c.sourceKind).toBe('grammar_pattern_src')
      expect(c.direction).toBe('none')
      expect(c.modality).toBe('text')
      expect(c.learnerLanguage).toBe('none')
      expect(c.requiredArtifacts).toEqual([])
      expect(c.lessonId).toBe(LESSON_ID)
    }
  })

  it('derives grammar_patterns NOT-NULL columns: name=title, short_explanation=rules, complexity=1', () => {
    const out = projectPatternsFromCategories({
      categories: [cat({ title: 'Imperatief -lah', display_order: 1, rules: ['rule one', 'rule two'] })],
      lessonNumber: LESSON_N,
      lessonId: LESSON_ID,
    })
    const gp = out.patternPlans[0].grammarPatternInput
    expect(gp.pattern_name).toBe('Imperatief -lah')
    expect(gp.description).toBe('rule one\nrule two')
    expect(gp.complexity_score).toBe(1)
    expect(gp.confusion_group).toBeNull()
    expect(gp.introduced_by_lesson_id).toBe(LESSON_ID)
    expect(gp.slug).toBe('l6-imperatief-lah')
  })

  it('falls back to title for short_explanation when rules are empty (NOT NULL safety)', () => {
    const out = projectPatternsFromCategories({
      categories: [cat({ title: 'Dagdelen', display_order: 1, rules: [] })],
      lessonNumber: LESSON_N,
      lessonId: LESSON_ID,
    })
    expect(out.patternPlans[0].grammarPatternInput.description).toBe('Dagdelen')
  })

  it('does not read examples (a rules-only category still produces a full pattern)', () => {
    const out = projectPatternsFromCategories({
      categories: [cat({ title: 'Kloktijd', display_order: 1, rules: ['r1', 'r2'], examples: [] })],
      lessonNumber: LESSON_N,
      lessonId: LESSON_ID,
    })
    expect(out.patternPlans).toHaveLength(1)
    expect(out.patternPlans[0].capabilities).toHaveLength(3)
  })

  it('disambiguates two categories that slugify identically using display_order', () => {
    const out = projectPatternsFromCategories({
      categories: [
        cat({ title: 'Bukan', display_order: 1 }),
        cat({ title: 'bukan!', display_order: 4 }), // slugifies to the same base "l6-bukan"
      ],
      lessonNumber: LESSON_N,
      lessonId: LESSON_ID,
    })
    const slugs = out.patternPlans.map((p) => p.slug).sort()
    expect(slugs).toEqual(['l6-bukan-1', 'l6-bukan-4'])
  })

  it('lesson-prefix yields distinct slugs for the same title across lessons', () => {
    const c = { title: 'Negation', display_order: 1 }
    const l5 = projectPatternsFromCategories({ categories: [cat(c)], lessonNumber: 5, lessonId: 'l5' })
    const l6 = projectPatternsFromCategories({ categories: [cat(c)], lessonNumber: 6, lessonId: 'l6' })
    expect(l5.patternPlans[0].slug).toBe('l5-negation')
    expect(l6.patternPlans[0].slug).toBe('l6-negation')
    expect(l5.patternPlans[0].slug).not.toBe(l6.patternPlans[0].slug)
  })

  it('throws when a category title slugifies to empty', () => {
    expect(() =>
      projectPatternsFromCategories({
        categories: [cat({ title: '!!! ---', display_order: 1 })],
        lessonNumber: LESSON_N,
        lessonId: LESSON_ID,
      }),
    ).toThrow(/slugifies to empty/)
  })

  it('throws on an unresolvable duplicate (same base slug AND same display_order)', () => {
    expect(() =>
      projectPatternsFromCategories({
        categories: [
          cat({ title: 'Bukan', display_order: 2, section_id: 'sec-a' }),
          cat({ title: 'Bukan', display_order: 2, section_id: 'sec-b' }), // same slug AND same display_order
        ],
        lessonNumber: LESSON_N,
        lessonId: LESSON_ID,
      }),
    ).toThrow(/duplicate pattern slug/)
  })

  it('is deterministic — same input yields identical output', () => {
    const args = {
      categories: [cat({ title: 'Tidak', display_order: 1 }), cat({ title: 'Jangan', display_order: 2 })],
      lessonNumber: LESSON_N,
      lessonId: LESSON_ID,
    }
    expect(JSON.stringify(projectPatternsFromCategories(args))).toBe(
      JSON.stringify(projectPatternsFromCategories(args)),
    )
  })

  it('returns no plans for an empty category list', () => {
    const out = projectPatternsFromCategories({ categories: [], lessonNumber: LESSON_N, lessonId: LESSON_ID })
    expect(out.patternPlans).toEqual([])
  })
})
