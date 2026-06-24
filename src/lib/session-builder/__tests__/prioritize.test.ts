import { describe, expect, it } from 'vitest'

import { prioritizeCandidates, type PlannerCapability } from '@/lib/session-builder/pedagogy'
import type { CapabilityType } from '@/lib/capabilities/capabilityTypes'

// One vocabulary word's six rungs — all same lesson, same family, same source_ref.
const cap = (capabilityType: CapabilityType): PlannerCapability => ({
  id: capabilityType,
  canonicalKey: `cap:v1:vocabulary_src:learning_items/makan:${capabilityType}:id_to_l1:text:nl`,
  sourceKind: 'vocabulary_src',
  sourceRef: 'learning_items/makan',
  capabilityType,
  skillType: 'recognise_mode',
  readinessStatus: 'ready',
  publicationStatus: 'published',
  prerequisiteKeys: [],
  lessonId: 'L1',
  lessonOrder: 1,
})

describe('prioritizeCandidates — receptive before productive within a word', () => {
  it('orders a word\'s rungs by pedagogical phase, so listening (P1) precedes the produce caps (P4)', () => {
    // Regression (2026-06-24): the within-word tiebreak was the raw canonical_key,
    // which is alphabetical by capability_type — putting `recognise_meaning_from_audio`
    // (listening, Phase 1) 5th of 6, BEHIND `produce_form_from_audio` (Phase 4),
    // because "p" < "r". Sibling-burying (1 cap/word/day, keeps the top-ranked) then
    // starved listening to 1/288 introduced while dictation reached 215/290. Phase
    // must dominate the within-word order so the receptive rungs come first.
    const ordered = prioritizeCandidates([
      cap('produce_form_from_audio_cap'),       // P4 — alphabetically first (the bug)
      cap('produce_form_from_meaning_cap'),     // P4
      cap('recall_meaning_from_text_cap'),      // P2
      cap('recognise_form_from_meaning_cap'),   // P3
      cap('recognise_meaning_from_audio_cap'),  // P1 — listening, was starved
      cap('recognise_meaning_from_text_cap'),   // P1
    ]).map((c) => c.capabilityType)

    const idx = (t: CapabilityType) => ordered.indexOf(t)

    // listening (P1) must precede dictation (P4)
    expect(idx('recognise_meaning_from_audio_cap')).toBeLessThan(idx('produce_form_from_audio_cap'))

    // every receptive (Phase 1/2) rung precedes every productive (Phase 3/4) rung
    const lastReceptive = Math.max(
      idx('recognise_meaning_from_text_cap'),
      idx('recognise_meaning_from_audio_cap'),
      idx('recall_meaning_from_text_cap'),
    )
    const firstProductive = Math.min(
      idx('recognise_form_from_meaning_cap'),
      idx('produce_form_from_meaning_cap'),
      idx('produce_form_from_audio_cap'),
    )
    expect(lastReceptive).toBeLessThan(firstProductive)
  })
})
