import { describe, it, expect } from 'vitest'
import { validateDisplayContentShape } from '../../validators/displayContent'

/**
 * GT10 (slice 3 / ADR 0013 §1 + §6) — display-content blob structure, folded
 * out of the monolithic lint-staging gate, plus generic per-type shape for the
 * display-only sections GT5 leaves permissive (culture, reference_table).
 *
 * Folded from lint-staging's checkLessonStructure:
 *   - grammar-section-unstructured (CRITICAL)
 *   - grammar-category-empty       (WARNING)
 *   - translation-drill-no-answer  (WARNING)
 * (exercises-section-unstructured is already enforced by GT5's exercises
 *  sub-shape — `sections[]` required — so it is not duplicated here.)
 */

describe('validateDisplayContentShape — folded grammar checks', () => {
  it('flags a legacy grammar section (body:string, no categories[]) as CRITICAL', () => {
    const findings = validateDisplayContentShape([
      { title: 'Grammatica', content: { type: 'grammar', body: 'lots of prose', grammar_topics: ['x'] } },
    ])
    expect(findings.length).toBe(1)
    expect(findings[0].gate).toBe('GT10')
    expect(findings[0].severity).toBe('error')
    expect(findings[0].message).toMatch(/body:string/)
  })

  it('flags an empty grammar category (no rules/examples/table) as a warning', () => {
    const findings = validateDisplayContentShape([
      {
        title: 'Grammatica',
        content: {
          type: 'grammar',
          grammar_topics: ['x'],
          categories: [
            { title: 'Good', rules: ['a rule'] },
            { title: 'Empty' },
          ],
        },
      },
    ])
    expect(findings.length).toBe(1)
    expect(findings[0].gate).toBe('GT10')
    expect(findings[0].severity).toBe('warning')
    expect(findings[0].message).toMatch(/no rules, examples, or table/)
  })

  it('passes a structured grammar section (categories with rules)', () => {
    const findings = validateDisplayContentShape([
      {
        title: 'Grammatica',
        content: { type: 'grammar', grammar_topics: ['x'], categories: [{ title: 'C', rules: ['r'] }] },
      },
    ])
    expect(findings).toEqual([])
  })
})

describe('validateDisplayContentShape — folded exercises drill-answer check', () => {
  it('flags a translation drill item missing its answer as a warning', () => {
    const findings = validateDisplayContentShape([
      {
        title: 'Oefeningen',
        content: {
          type: 'exercises',
          sections: [
            { type: 'translation', title: 'Vertaal', items: [{ prompt: 'huis' }, { prompt: 'kat', answer: 'kucing' }] },
          ],
        },
      },
    ])
    expect(findings.length).toBe(1)
    expect(findings[0].gate).toBe('GT10')
    expect(findings[0].severity).toBe('warning')
    expect(findings[0].message).toMatch(/missing answer/)
  })

  it('passes exercises whose drill items all have answers', () => {
    const findings = validateDisplayContentShape([
      {
        title: 'Oefeningen',
        content: {
          type: 'exercises',
          sections: [{ type: 'grammar_drill', items: [{ prompt: 'x', answer: 'y' }] }],
        },
      },
    ])
    expect(findings).toEqual([])
  })
})

describe('validateDisplayContentShape — generic display-only shape (CRITICAL)', () => {
  it('flags a reference_table that is an empty shell (only type + grammar_topics)', () => {
    const findings = validateDisplayContentShape([
      { title: 'Tabel', content: { type: 'reference_table', grammar_topics: ['x'] } },
    ])
    expect(findings.length).toBe(1)
    expect(findings[0].gate).toBe('GT10')
    expect(findings[0].severity).toBe('error')
  })

  it('passes a reference_table that carries content (columns)', () => {
    const findings = validateDisplayContentShape([
      { title: 'Tabel', content: { type: 'reference_table', grammar_topics: ['x'], columns: [{}] } },
    ])
    expect(findings).toEqual([])
  })

  it('flags an empty culture section but passes one with paragraphs', () => {
    const empty = validateDisplayContentShape([{ title: 'Cultuur', content: { type: 'culture' } }])
    expect(empty.length).toBe(1)
    expect(empty[0].severity).toBe('error')

    const full = validateDisplayContentShape([
      { title: 'Cultuur', content: { type: 'culture', paragraphs: ['Borobudur is...'] } },
    ])
    expect(full).toEqual([])
  })

  it('does not throw on a malformed exercises blob (sections / items not arrays)', () => {
    // GT5 emits the shape error; GT10 must return cleanly, not crash the gate.
    expect(() =>
      validateDisplayContentShape([
        { title: 'Oef', content: { type: 'exercises', sections: 'oops not an array' } },
        { title: 'Oef2', content: { type: 'exercises', sections: [{ type: 'translation', items: 'nope' }] } },
      ]),
    ).not.toThrow()
  })

  it('ignores section types it does not own (e.g. vocabulary)', () => {
    const findings = validateDisplayContentShape([
      { title: 'Woorden', content: { type: 'vocabulary', items: [{ indonesian: 'halo' }] } },
    ])
    expect(findings).toEqual([])
  })
})
