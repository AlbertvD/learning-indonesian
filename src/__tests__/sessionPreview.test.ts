// src/__tests__/sessionPreview.test.ts
//
// The Home "Vandaag" panel's count summarizer (desktop program slice 3): the
// four categories must PARTITION the plan (sum equals total), with listening
// taking precedence over grammar, and the rest split by block kind.

import { describe, it, expect } from 'vitest'
import { summarizeSessionPlan, type SessionPreviewBlock } from '@/components/dashboard/sessionPreview'

function block(kind: SessionPreviewBlock['kind'], capabilityType: string): SessionPreviewBlock {
  return { kind, renderPlan: { capabilityType } }
}

describe('summarizeSessionPlan', () => {
  it('partitions blocks into reviews / new / grammar / listening summing to the total', () => {
    const counts = summarizeSessionPlan([
      block('due_review', 'recognise_meaning_cap'),
      block('due_review', 'produce_form_cap'),
      block('new_introduction', 'recognise_meaning_cap'),
      block('due_review', 'recognise_grammar_pattern_cap'),
      block('new_introduction', 'produce_grammar_pattern_cap'),
      block('due_review', 'recognise_meaning_from_audio_cap'),
      block('new_introduction', 'recognise_gist_from_audio_cap'),
    ])

    expect(counts.total).toBe(7)
    expect(counts.reviews).toBe(2)
    expect(counts.newItems).toBe(1)
    expect(counts.grammar).toBe(2)
    expect(counts.listening).toBe(2)
    expect(counts.reviews + counts.newItems + counts.grammar + counts.listening).toBe(counts.total)
  })

  it('counts an audio grammar capability as listening, not grammar (listening wins)', () => {
    // Hypothetical combined type — the precedence rule must be deterministic.
    const counts = summarizeSessionPlan([block('due_review', 'recognise_grammar_pattern_from_audio_cap')])
    expect(counts.listening).toBe(1)
    expect(counts.grammar).toBe(0)
  })

  it('estimates duration at ~13s per exercise with a 1-minute floor', () => {
    expect(summarizeSessionPlan([block('due_review', 'x_cap')]).estMinutes).toBe(1)
    // 16 × 13s = 208s ≈ 3 min (was 7 min at the old, unfounded 25s/item rate)
    const sixteen = Array.from({ length: 16 }, () => block('due_review', 'x_cap'))
    expect(summarizeSessionPlan(sixteen).estMinutes).toBe(3)
  })

  it('returns all zeros for an empty plan', () => {
    const counts = summarizeSessionPlan([])
    expect(counts).toEqual({ total: 0, reviews: 0, newItems: 0, grammar: 0, listening: 0, estMinutes: 0 })
  })
})
