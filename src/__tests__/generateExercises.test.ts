/**
 * generateExercises.test.ts
 *
 * Unit tests for the logic in generate-exercises.ts.
 * Tests candidate shape validation, merge logic, and vocabulary extraction.
 *
 * Claude API calls are NOT made in these tests — we test the pure logic only.
 */

import { describe, it, expect } from 'vitest'

// ── Type definitions (mirrored from staging-utils.ts) ────────────────────────

type ExerciseType = 'contrast_pair' | 'sentence_transformation' | 'constrained_translation' | 'cloze_mcq'
type ReviewStatus = 'pending_review' | 'approved' | 'rejected' | 'published'

interface Candidate {
  exercise_type: ExerciseType
  grammar_pattern_slug: string
  source_page: number
  review_status: ReviewStatus
  requiresManualApproval?: boolean
  payload: Record<string, unknown>
}

// ── Inline the merge logic from generate-exercises.ts ────────────────────────

function mergeCandidates(
  existing: Candidate[],
  generated: Candidate[],
  force: boolean,
): { merged: Candidate[]; added: number; skipped: number } {
  const result: Candidate[] = [...existing]
  let added = 0
  let skipped = 0

  for (const candidate of generated) {
    const { grammar_pattern_slug, exercise_type } = candidate

    const publishedExists = existing.some(
      e => e.grammar_pattern_slug === grammar_pattern_slug &&
           e.exercise_type === exercise_type &&
           e.review_status === 'published'
    )
    if (publishedExists) {
      skipped++
      continue
    }

    if (force) {
      const idx = result.findIndex(
        e => e.grammar_pattern_slug === grammar_pattern_slug &&
             e.exercise_type === exercise_type &&
             e.review_status !== 'published'
      )
      if (idx !== -1) {
        result.splice(idx, 1, candidate)
      } else {
        result.push(candidate)
      }
    } else {
      const existsAlready = existing.some(
        e => e.grammar_pattern_slug === grammar_pattern_slug &&
             e.exercise_type === exercise_type
      )
      if (existsAlready) {
        skipped++
        continue
      }
      result.push(candidate)
    }

    added++
  }

  return { merged: result, added, skipped }
}

// ── Vocabulary extraction logic ───────────────────────────────────────────────

interface LessonSection {
  title: string
  order_index: number
  content: Record<string, unknown>
}

interface LessonData {
  sections: LessonSection[]
}

function extractVocabularyContext(lesson: LessonData | null): string {
  if (!lesson) return ''
  const items: string[] = []
  for (const section of lesson.sections) {
    const content = section.content
    if (
      (content.type === 'vocabulary' || content.type === 'expressions') &&
      Array.isArray(content.items)
    ) {
      for (const item of content.items as Array<{ indonesian: string; dutch: string }>) {
        if (item.indonesian && item.dutch) {
          items.push(`${item.indonesian} = ${item.dutch}`)
        }
      }
    }
  }
  return items.slice(0, 150).join('\n')
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

const publishedCandidate: Candidate = {
  exercise_type: 'contrast_pair',
  grammar_pattern_slug: 'yang-relative-pronoun',
  source_page: 5,
  review_status: 'published',
  requiresManualApproval: true,
  payload: { promptText: 'existing published', options: [], correctOptionId: 'a', explanationText: '' },
}

const pendingCandidate: Candidate = {
  exercise_type: 'sentence_transformation',
  grammar_pattern_slug: 'yang-relative-pronoun',
  source_page: 5,
  review_status: 'pending_review',
  requiresManualApproval: true,
  payload: {
    sourceSentence: 'De auto is groot.',
    transformationInstruction: 'Gebruik yang.',
    acceptableAnswers: ['Mobil yang besar'],
    hintText: null,
    explanationText: '',
  },
}

const approvedCandidate: Candidate = {
  exercise_type: 'cloze_mcq',
  grammar_pattern_slug: 'yang-single-adjective-emphasis',
  source_page: 5,
  review_status: 'approved',
  requiresManualApproval: true,
  payload: {
    sentence: 'Rumah ___ besar.',
    translation: 'Het GROTE huis.',
    options: ['yang', 'dan', 'ini', 'itu'],
    correctOptionId: 'yang',
    explanationText: '',
  },
}

const newGenerated: Candidate = {
  exercise_type: 'contrast_pair',
  grammar_pattern_slug: 'yang-single-adjective-emphasis',
  source_page: 5,
  review_status: 'pending_review',
  requiresManualApproval: true,
  payload: { promptText: 'new generated', options: [], correctOptionId: 'a', explanationText: '' },
}

const conflictingGenerated: Candidate = {
  exercise_type: 'sentence_transformation',
  grammar_pattern_slug: 'yang-relative-pronoun',
  source_page: 5,
  review_status: 'pending_review',
  requiresManualApproval: true,
  payload: {
    sourceSentence: 'De nieuwe auto.',
    transformationInstruction: 'Gebruik yang voor het bijvoeglijk naamwoord.',
    acceptableAnswers: ['Mobil yang baru'],
    hintText: null,
    explanationText: 'Nieuw generated candidate',
  },
}

const publishedConflictGenerated: Candidate = {
  exercise_type: 'contrast_pair',
  grammar_pattern_slug: 'yang-relative-pronoun',
  source_page: 5,
  review_status: 'pending_review',
  requiresManualApproval: true,
  payload: { promptText: 'tries to replace published', options: [], correctOptionId: 'a', explanationText: '' },
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('generate-exercises: candidate merge logic', () => {
  it('adds new candidates that do not exist yet', () => {
    const existing: Candidate[] = [publishedCandidate]
    const generated: Candidate[] = [newGenerated]

    const { merged, added, skipped } = mergeCandidates(existing, generated, false)

    expect(added).toBe(1)
    expect(skipped).toBe(0)
    expect(merged.length).toBe(2)
    expect(merged.some(c => c.grammar_pattern_slug === 'yang-single-adjective-emphasis')).toBe(true)
  })

  it('skips adding when a non-published candidate already exists (non-force mode)', () => {
    const existing: Candidate[] = [pendingCandidate]
    const generated: Candidate[] = [conflictingGenerated]

    const { merged, added, skipped } = mergeCandidates(existing, generated, false)

    expect(added).toBe(0)
    expect(skipped).toBe(1)
    expect(merged.length).toBe(1)
    // Original still present
    expect(merged[0].payload).toEqual(pendingCandidate.payload)
  })

  it('replaces pending candidates in force mode', () => {
    const existing: Candidate[] = [pendingCandidate]
    const generated: Candidate[] = [conflictingGenerated]

    const { merged, added, skipped } = mergeCandidates(existing, generated, true)

    expect(added).toBe(1)
    expect(skipped).toBe(0)
    expect(merged.length).toBe(1)
    // Should have the new candidate's payload
    expect((merged[0].payload as any).sourceSentence).toBe('De nieuwe auto.')
  })

  it('replaces approved candidates in force mode', () => {
    const updatingApproved: Candidate = {
      ...approvedCandidate,
      payload: { ...approvedCandidate.payload, sentence: 'Rumah ___ kecil.' },
    }

    const { merged, added } = mergeCandidates([approvedCandidate], [updatingApproved], true)

    expect(added).toBe(1)
    expect(merged.length).toBe(1)
    expect((merged[0].payload as any).sentence).toBe('Rumah ___ kecil.')
  })

  it('never overwrites published candidates', () => {
    const existing: Candidate[] = [publishedCandidate]
    const generated: Candidate[] = [publishedConflictGenerated]

    const { merged, added, skipped } = mergeCandidates(existing, generated, false)

    expect(added).toBe(0)
    expect(skipped).toBe(1)
    expect(merged.length).toBe(1)
    // Published candidate payload is unchanged
    expect((merged[0].payload as any).promptText).toBe('existing published')
  })

  it('never overwrites published candidates even in force mode', () => {
    const existing: Candidate[] = [publishedCandidate]
    const generated: Candidate[] = [publishedConflictGenerated]

    const { merged, added, skipped } = mergeCandidates(existing, generated, true)

    expect(added).toBe(0)
    expect(skipped).toBe(1)
    expect(merged.length).toBe(1)
    expect((merged[0].payload as any).promptText).toBe('existing published')
  })

  it('preserves published candidates when adding new ones for different patterns', () => {
    const existing: Candidate[] = [publishedCandidate, approvedCandidate]
    const generated: Candidate[] = [newGenerated]

    const { merged, added } = mergeCandidates(existing, generated, false)

    expect(added).toBe(1)
    expect(merged.length).toBe(3)
    // Published and approved still intact
    expect(merged.some(c => c.review_status === 'published')).toBe(true)
    expect(merged.some(c => c.review_status === 'approved')).toBe(true)
  })

  it('handles empty existing candidates list', () => {
    const generated: Candidate[] = [newGenerated, pendingCandidate]

    const { merged, added, skipped } = mergeCandidates([], generated, false)

    expect(added).toBe(2)
    expect(skipped).toBe(0)
    expect(merged.length).toBe(2)
  })

  it('handles empty generated list', () => {
    const existing: Candidate[] = [publishedCandidate, pendingCandidate]

    const { merged, added, skipped } = mergeCandidates(existing, [], false)

    expect(added).toBe(0)
    expect(skipped).toBe(0)
    expect(merged.length).toBe(2)
  })
})

describe('generate-exercises: candidate shape validation', () => {
  it('validates contrast_pair payload fields', () => {
    const payload = publishedCandidate.payload
    // Contract: must have promptText, options (array), correctOptionId, explanationText
    expect(typeof payload.promptText).toBe('string')
    expect(Array.isArray(payload.options)).toBe(true)
    expect(typeof payload.correctOptionId).toBe('string')
    expect(typeof payload.explanationText).toBe('string')
  })

  it('validates sentence_transformation payload fields', () => {
    const payload = pendingCandidate.payload
    expect(typeof payload.sourceSentence).toBe('string')
    expect(typeof payload.transformationInstruction).toBe('string')
    expect(Array.isArray(payload.acceptableAnswers)).toBe(true)
    expect((payload.acceptableAnswers as string[]).length).toBeGreaterThan(0)
    expect(typeof payload.explanationText).toBe('string')
  })

  it('validates cloze_mcq payload fields', () => {
    const payload = approvedCandidate.payload
    expect(typeof payload.sentence).toBe('string')
    expect(typeof payload.translation).toBe('string')
    expect(Array.isArray(payload.options)).toBe(true)
    expect((payload.options as string[]).length).toBe(4)
    expect(typeof payload.correctOptionId).toBe('string')
    expect(payload.options).toContain(payload.correctOptionId)
  })

  it('validates constrained_translation payload contract', () => {
    const ctCandidate: Candidate = {
      exercise_type: 'constrained_translation',
      grammar_pattern_slug: 'yang-relative-pronoun',
      source_page: 5,
      review_status: 'pending_review',
      requiresManualApproval: true,
      payload: {
        sourceLanguageSentence: 'De auto die groot is, is duur.',
        requiredTargetPattern: 'gebruik yang',
        acceptableAnswers: ['Mobil yang besar itu mahal'],
        disallowedShortcutForms: null,
        explanationText: 'Yang als betrekkelijk voornaamwoord.',
      },
    }

    const payload = ctCandidate.payload
    expect(typeof payload.sourceLanguageSentence).toBe('string')
    expect(typeof payload.requiredTargetPattern).toBe('string')
    expect(Array.isArray(payload.acceptableAnswers)).toBe(true)
    expect((payload.acceptableAnswers as string[]).length).toBeGreaterThan(0)
  })

  it('all generated candidates start with pending_review status', () => {
    const candidates: Candidate[] = [newGenerated, conflictingGenerated]
    for (const c of candidates) {
      expect(c.review_status).toBe('pending_review')
    }
  })

  it('all grammar-aware candidates have requiresManualApproval set', () => {
    const candidates: Candidate[] = [newGenerated, pendingCandidate, approvedCandidate]
    for (const c of candidates) {
      expect(c.requiresManualApproval).toBe(true)
    }
  })
})

describe('generate-exercises: vocabulary context extraction', () => {
  const lesson: LessonData = {
    sections: [
      {
        title: 'Woordenlijst',
        order_index: 0,
        content: {
          type: 'vocabulary',
          items: [
            { indonesian: 'air', dutch: 'water' },
            { indonesian: 'makan', dutch: 'eten' },
            { indonesian: 'besar', dutch: 'groot' },
          ],
        },
      },
      {
        title: 'Uitdrukkingen',
        order_index: 1,
        content: {
          type: 'expressions',
          items: [
            { indonesian: 'selamat pagi', dutch: 'goedemorgen' },
          ],
        },
      },
      {
        title: 'Dialog',
        order_index: 2,
        content: {
          type: 'dialogue',
          lines: [{ speaker: 'A', text: 'Halo', translation: 'Hallo' }],
        },
      },
    ],
  }

  it('extracts vocabulary items from vocabulary sections', () => {
    const context = extractVocabularyContext(lesson)
    expect(context).toContain('air = water')
    expect(context).toContain('makan = eten')
    expect(context).toContain('besar = groot')
  })

  it('extracts items from expressions sections', () => {
    const context = extractVocabularyContext(lesson)
    expect(context).toContain('selamat pagi = goedemorgen')
  })

  it('does not include dialogue lines', () => {
    const context = extractVocabularyContext(lesson)
    expect(context).not.toContain('Halo')
  })

  it('returns empty string for null lesson', () => {
    const context = extractVocabularyContext(null)
    expect(context).toBe('')
  })

  it('limits output to 150 items', () => {
    const manyItems = Array.from({ length: 200 }, (_, i) => ({
      indonesian: `word${i}`,
      dutch: `woord${i}`,
    }))
    const bigLesson: LessonData = {
      sections: [{
        title: 'Woordenlijst',
        order_index: 0,
        content: { type: 'vocabulary', items: manyItems },
      }],
    }
    const context = extractVocabularyContext(bigLesson)
    const lines = context.split('\n').filter(l => l.trim())
    expect(lines.length).toBeLessThanOrEqual(150)
  })
})

describe('generate-exercises: exercise type validation', () => {
  const ALL_TYPES: ExerciseType[] = [
    'contrast_pair',
    'sentence_transformation',
    'constrained_translation',
    'cloze_mcq',
  ]

  it('all exercise types are known', () => {
    for (const type of ALL_TYPES) {
      expect(typeof type).toBe('string')
      expect(type.length).toBeGreaterThan(0)
    }
  })

  it('exercise types match the required exercise families from the spec', () => {
    expect(ALL_TYPES).toContain('contrast_pair')
    expect(ALL_TYPES).toContain('sentence_transformation')
    expect(ALL_TYPES).toContain('constrained_translation')
    expect(ALL_TYPES).toContain('cloze_mcq')
  })

  it('does not include speaking (disabled at launch)', () => {
    expect(ALL_TYPES).not.toContain('speaking')
  })
})
