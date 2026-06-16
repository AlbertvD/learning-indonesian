// Matrix-driven regression suite for validateCapability against
// RENDER_CONTRACTS. One row per CapabilityType + source-kind combination
// that actually appears in production (per capabilityCatalog.ts and
// scripts/lib/pipeline/capability-stage/projectors/vocab.ts), with the
// expected post-PR-#65 readiness.
//
// This file is the regression target for the source-kind decision in
// docs/plans/2026-05-18-render-contracts.md.

import { describe, expect, it } from 'vitest'
import type { ProjectedCapability, CapabilityType, CapabilitySourceKind, ArtifactKind } from '@/lib/capabilities/capabilityTypes'
import { validateCapability } from '@/lib/capabilities/capabilityContracts'

// Slice 4b: readiness is decided purely by cap_type × source_kind routing
// (RENDER_CONTRACTS), not the retired capability_artifacts bag. `requiredArtifacts`
// on the rows below documents the historical (now-inert) per-cap artifact list.
interface MatrixRow {
  capabilityType: CapabilityType
  sourceKind: CapabilitySourceKind
  requiredArtifacts: readonly ArtifactKind[]
  expected:
    | { status: 'ready'; allowedExercises: readonly string[] }
    | { status: 'blocked'; reasonMatch: RegExp }
    | { status: 'exposure_only' }
}

const matrix: MatrixRow[] = [
  // ─── Item source kinds (current happy path) ──────────────────────────
  {
    capabilityType: 'recognise_meaning_from_text_cap',
    sourceKind: 'vocabulary_src',
    requiredArtifacts: ['base_text', 'meaning:l1'],
    expected: { status: 'ready', allowedExercises: ['choose_meaning_ex'] },
  },
  {
    capabilityType: 'recognise_form_from_meaning_cap',
    sourceKind: 'vocabulary_src',
    requiredArtifacts: ['meaning:l1', 'base_text'],
    expected: { status: 'ready', allowedExercises: ['choose_form_ex'] },
  },
  {
    capabilityType: 'recall_meaning_from_text_cap',
    sourceKind: 'vocabulary_src',
    requiredArtifacts: ['meaning:l1', 'accepted_answers:l1'],
    expected: { status: 'ready', allowedExercises: ['type_meaning_ex'] },
  },
  {
    capabilityType: 'produce_form_from_meaning_cap',
    sourceKind: 'vocabulary_src',
    requiredArtifacts: ['meaning:l1', 'base_text', 'accepted_answers:id'],
    // form_recall is served by BOTH choose_form_ex AND type_form_ex — both pass.
    expected: { status: 'ready', allowedExercises: ['choose_form_ex', 'type_form_ex'] },
  },
  {
    capabilityType: 'recognise_meaning_from_audio_cap',
    sourceKind: 'vocabulary_src',
    requiredArtifacts: ['audio_clip', 'meaning:l1'],
    expected: { status: 'ready', allowedExercises: ['choose_meaning_from_audio_ex'] },
  },
  {
    capabilityType: 'produce_form_from_audio_cap',
    sourceKind: 'vocabulary_src',
    requiredArtifacts: ['audio_clip', 'base_text', 'accepted_answers:id'],
    expected: { status: 'ready', allowedExercises: ['type_form_from_audio_ex'] },
  },
  // ─── Pattern source kind (PR 4 Decision G + R): routes to typed grammar
  //     exercise tables; no required artifacts (structure guaranteed by NOT
  //     NULL columns + validateGrammarExercises + HC19/HC20). ──
  {
    capabilityType: 'recognise_grammar_pattern_cap',
    sourceKind: 'grammar_pattern_src',
    requiredArtifacts: [],
    expected: { status: 'ready', allowedExercises: ['choose_missing_word_ex', 'transform_sentence_ex', 'translate_sentence_ex'] },
  },
  {
    capabilityType: 'contrast_grammar_pattern_cap',
    sourceKind: 'grammar_pattern_src',
    requiredArtifacts: [],
    expected: { status: 'ready', allowedExercises: ['choose_correct_form_ex'] },
  },
  {
    // Post 2026-05-21 lib/exercise-content fold PR-B: cloze accepts
    // dialogue_line. choose_missing_word_ex stays item-only (lesson-pool distractor
    // follow-up), so allowedExercises is ['type_missing_word_ex'] only.
    capabilityType: 'produce_form_from_context_cap',
    sourceKind: 'dialogue_line_src',
    requiredArtifacts: ['cloze_context', 'cloze_answer', 'translation:l1'],
    expected: { status: 'ready', allowedExercises: ['type_missing_word_ex'] },
  },
  {
    // Post 2026-05-21 affixed-form-pair PR: type_form_ex accepts
    // word_form_pair_src source kind with requiredArtifacts
    // {root_derived_pair, allomorph_rule}. choose_form_ex stays item-only
    // (distractor authoring deferred per D3/D4), so allowedExercises is
    // ['type_form_ex'] only.
    capabilityType: 'recognise_word_form_link_cap',
    sourceKind: 'word_form_pair_src',
    requiredArtifacts: ['root_derived_pair', 'allomorph_rule'],
    expected: { status: 'ready', allowedExercises: ['type_form_ex'] },
  },
  {
    capabilityType: 'produce_derived_form_cap',
    sourceKind: 'word_form_pair_src',
    requiredArtifacts: ['root_derived_pair', 'allomorph_rule'],
    expected: { status: 'ready', allowedExercises: ['type_form_ex'] },
  },
  // ─── Exposure-only (short-circuits before source-kind check) ─────────
  {
    capabilityType: 'recognise_gist_from_audio_cap',
    sourceKind: 'podcast_segment_src',
    requiredArtifacts: ['audio_segment', 'transcript_segment'],
    expected: { status: 'exposure_only' },
  },
]

function fakeCapability(row: MatrixRow): ProjectedCapability {
  return {
    canonicalKey: `cap:v3:${row.sourceKind}:fake/${row.capabilityType}:${row.capabilityType}:none:text:none`,
    sourceKind: row.sourceKind,
    sourceRef: `fake/${row.capabilityType}`,
    capabilityType: row.capabilityType,
    skillType: 'recognition',
    direction: 'none',
    modality: 'text',
    learnerLanguage: 'none',
    requiredArtifacts: [...row.requiredArtifacts],
    prerequisiteKeys: [],
    projectionVersion: 'capability-v3',
  }
}

describe('validateCapability matrix (post-PR #65 expected readiness)', () => {
  for (const row of matrix) {
    it(`returns expected readiness for ${row.capabilityType} (sourceKind=${row.sourceKind})`, () => {
      const capability = fakeCapability(row)
      const result = validateCapability({ capability })

      if (row.expected.status === 'ready') {
        expect(result.status).toBe('ready')
        if (result.status === 'ready') {
          expect(result.allowedExercises).toEqual(
            expect.arrayContaining([...row.expected.allowedExercises]),
          )
          expect(result.allowedExercises.length).toBe(row.expected.allowedExercises.length)
        }
      } else if (row.expected.status === 'blocked') {
        expect(result.status).toBe('blocked')
        if (result.status === 'blocked') {
          expect(result.reason).toMatch(row.expected.reasonMatch)
        }
      } else if (row.expected.status === 'exposure_only') {
        expect(result.status).toBe('exposure_only')
      }
    })
  }
})
