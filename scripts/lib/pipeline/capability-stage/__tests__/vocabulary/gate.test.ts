/**
 * cap-v2 vocabulary rebuild — the vocab gate (item-layer pre/post-write checks).
 *
 * Thin composition over existing validators; the tests pin the load-bearing
 * behaviours: the publish-blocker ERRORs (CS19 comma-as-separator, CS4b null nl)
 * fire pre-write; POS validates POST-backfill (CS14); distractor coverage reads
 * the seeded count (CS15); audio coverage WARNs on a missing clip (CS23, §0.8/#165).
 */

import { describe, it, expect } from 'vitest'
import {
  runVocabGatePreWrite,
  validateAudioCoverage,
  runVocabGatePostWrite,
} from '../../vocabulary/gate'

describe('runVocabGatePreWrite', () => {
  it('errors (CS19) on a comma-as-OR translation_nl', () => {
    const findings = runVocabGatePreWrite([
      { base_text: 'maar echter', item_type: 'word', context_type: 'lesson_snippet', translation_nl: 'maar, echter' },
    ])
    expect(findings.some((f) => f.gate === 'CS19' && f.severity === 'error')).toBe(true)
  })

  it('errors (CS4b) on a null translation_nl', () => {
    const findings = runVocabGatePreWrite([
      { base_text: 'kosong', item_type: 'word', context_type: 'lesson_snippet', translation_nl: null },
    ])
    expect(findings.some((f) => f.gate === 'CS4b' && f.severity === 'error')).toBe(true)
  })

  it('passes a clean item with no errors', () => {
    const findings = runVocabGatePreWrite([
      { base_text: 'makan', item_type: 'word', context_type: 'lesson_snippet', translation_nl: 'eten' },
    ])
    expect(findings.filter((f) => f.severity === 'error')).toHaveLength(0)
  })
})

describe('validateAudioCoverage (CS23, §0.8)', () => {
  it('warns (not errors) when a word/phrase item has no audio clip', () => {
    const findings = validateAudioCoverage([
      { normalizedText: 'makan', itemType: 'word', hasAudioClip: false },
    ])
    expect(findings).toHaveLength(1)
    expect(findings[0].gate).toBe('CS23')
    expect(findings[0].severity).toBe('warning')
  })

  it('is silent when the clip exists', () => {
    expect(
      validateAudioCoverage([{ normalizedText: 'makan', itemType: 'word', hasAudioClip: true }]),
    ).toHaveLength(0)
  })
})

describe('runVocabGatePostWrite', () => {
  // Fake supabase: validateItemDuplicates resolves to no cross-lesson dupes.
  const fakeSupabase = {
    schema: () => ({
      from: () => ({
        select: () => ({
          eq: () => ({
            in: () => ({
              not: () => Promise.resolve({ data: [], error: null }),
            }),
          }),
        }),
      }),
    }),
  } as never

  it('composes POS (CS14 warn on null), coverage (CS15 warn below floor), and audio (CS23 warn)', async () => {
    const findings = await runVocabGatePostWrite(fakeSupabase, {
      posItems: [{ normalized_text: 'makan', item_type: 'word', pos: null }],
      coverage: [{ capabilityId: 'cap-1', capabilityType: 'text_recognition', distractorCount: 0 }],
      audio: [{ normalizedText: 'makan', itemType: 'word', hasAudioClip: false }],
      duplicates: { lessonId: 'L11', lessonNumber: 11, writtenNormalizedTexts: ['makan'] },
    })
    expect(findings.some((f) => f.gate === 'CS14')).toBe(true)
    expect(findings.some((f) => f.gate === 'CS15')).toBe(true)
    expect(findings.some((f) => f.gate === 'CS23')).toBe(true)
  })
})
