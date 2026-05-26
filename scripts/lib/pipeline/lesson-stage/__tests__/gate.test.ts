import { describe, it, expect } from 'vitest'
import { runLessonGate } from '../gate'
import type { ProjectSectionsOutput } from '../projectSections'

/**
 * Consolidated Lesson Gate (slice 2 / ADR 0013 §3). One pre-write validator
 * entry point parameterised by run-mode. The mode flag is the ONLY difference
 * between the two run-points:
 *   - publish   (in-stage, post-enrichment): EN-completeness is CRITICAL.
 *   - pre-flight (standalone, raw lesson):   EN-completeness is a warning.
 * All structural / deterministic checks stay CRITICAL in both modes.
 */

function emptyProjected(): ProjectSectionsOutput {
  return { sectionMeta: [], itemRows: [], grammarCategories: [], grammarTopics: [], affixedPairs: [] }
}

/** A structurally-complete item row missing only its English (l2). */
function itemRowMissingEn(): ProjectSectionsOutput['itemRows'][number] {
  return {
    sourceSectionOrderIndex: 0,
    display_order: 0,
    source_item_ref: 'lesson-1/section-0/item-0',
    item_type: 'word',
    indonesian_text: 'halo',
    l1_translation: 'hallo',
    l2_translation: null, // EN not yet enriched
  }
}

const NO_LESSON = { primary_voice: undefined, dialogue_voices: undefined }

describe('runLessonGate — EN-completeness mode flag', () => {
  it('publish mode: a missing l2_translation (EN) is a CRITICAL error', () => {
    const findings = runLessonGate({
      lesson: NO_LESSON,
      sections: [],
      projected: { ...emptyProjected(), itemRows: [itemRowMissingEn()] },
      mode: 'publish',
    })
    const en = findings.filter((f) => /\(EN\)/.test(f.message))
    expect(en.length).toBe(1)
    expect(en[0].severity).toBe('error')
    expect(en[0].gate).toBe('GT9')
  })

  it('pre-flight mode: the same missing EN is relaxed to a warning', () => {
    const findings = runLessonGate({
      lesson: NO_LESSON,
      sections: [],
      projected: { ...emptyProjected(), itemRows: [itemRowMissingEn()] },
      mode: 'pre-flight',
    })
    const en = findings.filter((f) => /\(EN\)/.test(f.message))
    expect(en.length).toBe(1)
    expect(en[0].severity).toBe('warning')
    // No error-severity finding — a not-yet-enriched lesson is not blocked on EN.
    expect(findings.some((f) => f.severity === 'error')).toBe(false)
  })

  it('a structural (non-EN) omission stays CRITICAL in BOTH modes', () => {
    const structurallyBroken: ProjectSectionsOutput = {
      ...emptyProjected(),
      itemRows: [{ ...itemRowMissingEn(), indonesian_text: '', l2_translation: 'hi' }],
    }
    for (const mode of ['pre-flight', 'publish'] as const) {
      const findings = runLessonGate({ lesson: NO_LESSON, sections: [], projected: structurallyBroken, mode })
      const structural = findings.filter((f) => /indonesian_text/.test(f.message))
      expect(structural.length).toBe(1)
      expect(structural[0].severity).toBe('error')
    }
  })
})

describe('runLessonGate — dialogue NL translation flexes with mode (GT8)', () => {
  // A fresh lesson straight from cataloging has dialogue lines [{speaker,text}]
  // with NO `translation` — the NL enricher (skipped in dry-run) fills it. So
  // dialogue NL is an async-enriched column and must relax in pre-flight, just
  // like EN; only `text` (authored at catalog time) stays CRITICAL.
  const dialogueMissingNl = [
    { title: 'Dialoog', order_index: 0, content: { type: 'dialogue', lines: [{ text: 'Halo', speaker: 'Andi' }] } },
  ]

  it('publish mode: a dialogue line missing NL translation is a CRITICAL error', () => {
    const findings = runLessonGate({
      lesson: NO_LESSON, sections: dialogueMissingNl, projected: emptyProjected(), mode: 'publish',
    })
    const gt8 = findings.filter((f) => f.gate === 'GT8')
    expect(gt8.length).toBe(1)
    expect(gt8[0].severity).toBe('error')
  })

  it('pre-flight mode: the same missing NL is relaxed to a warning (fresh-lesson-safe)', () => {
    const findings = runLessonGate({
      lesson: NO_LESSON, sections: dialogueMissingNl, projected: emptyProjected(), mode: 'pre-flight',
    })
    const gt8 = findings.filter((f) => f.gate === 'GT8')
    expect(gt8.length).toBe(1)
    expect(gt8[0].severity).toBe('warning')
    // A fresh lesson is not blocked at pre-flight on an un-enriched translation.
    expect(findings.some((f) => f.severity === 'error')).toBe(false)
  })

  it('a dialogue line missing `text` stays CRITICAL in BOTH modes (text is authored, not enriched)', () => {
    const missingText = [
      { title: 'Dialoog', order_index: 0, content: { type: 'dialogue', lines: [{ speaker: 'Andi', translation: 'x' }] } },
    ]
    for (const mode of ['pre-flight', 'publish'] as const) {
      const findings = runLessonGate({ lesson: NO_LESSON, sections: missingText, projected: emptyProjected(), mode })
      expect(findings.some((f) => f.gate === 'GT8' && f.severity === 'error' && /text/.test(f.message))).toBe(true)
    }
  })
})

describe('runLessonGate — aggregates every pre-write validator', () => {
  it('surfaces a GT5 section-type error and a GT9 EN finding together', () => {
    const sections = [{ id: 's0', order_index: 0, content: { type: 'not_a_real_type' } }]
    const findings = runLessonGate({
      lesson: NO_LESSON,
      sections,
      projected: { ...emptyProjected(), itemRows: [itemRowMissingEn()] },
      mode: 'pre-flight',
    })
    expect(findings.some((f) => f.gate === 'GT5' && f.severity === 'error')).toBe(true)
    // GT9 EN is a warning in pre-flight; GT5 (structural) is still an error.
    expect(findings.some((f) => f.gate === 'GT9' && f.severity === 'warning')).toBe(true)
  })

  it('surfaces a GT10 display-content error (folded from lint-staging) through the gate', () => {
    const findings = runLessonGate({
      lesson: NO_LESSON,
      sections: [{ title: 'G', order_index: 0, content: { type: 'grammar', body: 'prose', grammar_topics: ['x'] } }],
      projected: emptyProjected(),
      mode: 'publish',
    })
    expect(findings.some((f) => f.gate === 'GT10' && f.severity === 'error')).toBe(true)
  })

  it('a fully-clean lesson produces no findings in either mode', () => {
    const cleanItem = { ...itemRowMissingEn(), l2_translation: 'hello' }
    for (const mode of ['pre-flight', 'publish'] as const) {
      const findings = runLessonGate({
        lesson: NO_LESSON,
        sections: [],
        projected: { ...emptyProjected(), itemRows: [cleanItem] },
        mode,
      })
      expect(findings).toEqual([])
    }
  })
})
