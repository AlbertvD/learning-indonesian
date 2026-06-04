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
    capabilityType: 'text_recognition',
    sourceKind: 'item',
    requiredArtifacts: ['base_text', 'meaning:l1'],
    expected: { status: 'ready', allowedExercises: ['recognition_mcq'] },
  },
  {
    capabilityType: 'l1_to_id_choice',
    sourceKind: 'item',
    requiredArtifacts: ['meaning:l1', 'base_text'],
    expected: { status: 'ready', allowedExercises: ['cued_recall'] },
  },
  {
    capabilityType: 'meaning_recall',
    sourceKind: 'item',
    requiredArtifacts: ['meaning:l1', 'accepted_answers:l1'],
    expected: { status: 'ready', allowedExercises: ['meaning_recall'] },
  },
  {
    capabilityType: 'form_recall',
    sourceKind: 'item',
    requiredArtifacts: ['meaning:l1', 'base_text', 'accepted_answers:id'],
    // form_recall is served by BOTH cued_recall AND typed_recall — both pass.
    expected: { status: 'ready', allowedExercises: ['cued_recall', 'typed_recall'] },
  },
  {
    capabilityType: 'audio_recognition',
    sourceKind: 'item',
    requiredArtifacts: ['audio_clip', 'meaning:l1'],
    expected: { status: 'ready', allowedExercises: ['listening_mcq'] },
  },
  {
    capabilityType: 'dictation',
    sourceKind: 'item',
    requiredArtifacts: ['audio_clip', 'base_text', 'accepted_answers:id'],
    expected: { status: 'ready', allowedExercises: ['dictation'] },
  },
  // ─── Pattern source kind (PR 4 Decision G + R): routes to typed grammar
  //     exercise tables; no required artifacts (structure guaranteed by NOT
  //     NULL columns + validateGrammarExercises + HC19/HC20). ──
  {
    capabilityType: 'pattern_recognition',
    sourceKind: 'pattern',
    requiredArtifacts: [],
    expected: { status: 'ready', allowedExercises: ['cloze_mcq', 'sentence_transformation', 'constrained_translation'] },
  },
  {
    capabilityType: 'pattern_contrast',
    sourceKind: 'pattern',
    requiredArtifacts: [],
    expected: { status: 'ready', allowedExercises: ['contrast_pair'] },
  },
  {
    // Post 2026-05-21 lib/exercise-content fold PR-B: cloze accepts
    // dialogue_line. cloze_mcq stays item-only (lesson-pool distractor
    // follow-up), so allowedExercises is ['cloze'] only.
    capabilityType: 'contextual_cloze',
    sourceKind: 'dialogue_line',
    requiredArtifacts: ['cloze_context', 'cloze_answer', 'translation:l1'],
    expected: { status: 'ready', allowedExercises: ['cloze'] },
  },
  {
    // Post 2026-05-21 affixed-form-pair PR: typed_recall accepts
    // affixed_form_pair source kind with requiredArtifacts
    // {root_derived_pair, allomorph_rule}. cued_recall stays item-only
    // (distractor authoring deferred per D3/D4), so allowedExercises is
    // ['typed_recall'] only.
    capabilityType: 'root_derived_recognition',
    sourceKind: 'affixed_form_pair',
    requiredArtifacts: ['root_derived_pair', 'allomorph_rule'],
    expected: { status: 'ready', allowedExercises: ['typed_recall'] },
  },
  {
    capabilityType: 'root_derived_recall',
    sourceKind: 'affixed_form_pair',
    requiredArtifacts: ['root_derived_pair', 'allomorph_rule'],
    expected: { status: 'ready', allowedExercises: ['typed_recall'] },
  },
  // ─── Exposure-only (short-circuits before source-kind check) ─────────
  {
    capabilityType: 'podcast_gist',
    sourceKind: 'podcast_segment',
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
