import { describe, expect, it } from 'vitest'

import {
  insertExerciseVariantGrammar,
  insertExerciseVariantVocab,
  upsertCapabilityArtifacts,
  type CapabilityArtifactInput,
} from '../adapter'

// Minimal Supabase mock that records upserts/inserts and returns the supplied
// id when the caller chains `.select('id').single()`. Mirrors the structure of
// the runner.test.ts mock so the two stay aligned.
function buildClient(idByTable: Record<string, string>) {
  return {
    schema: () => ({
      from: (table: string) => ({
        upsert: () => ({
          select: () => ({
            single: async () => ({ data: { id: idByTable[table] ?? null }, error: null }),
          }),
        }),
        insert: () => ({
          select: () => ({
            single: async () => ({ data: { id: idByTable[table] ?? null }, error: null }),
          }),
        }),
      }),
    }),
  } as never
}

describe('capability-stage adapter — writer return contracts (F6-1 wiring)', () => {
  it('upsertCapabilityArtifacts returns one id per artifact so CS8 can validate them', async () => {
    const client = buildClient({ capability_artifacts: 'artifact-uuid-1' })
    const input: CapabilityArtifactInput = {
      capability_id: 'cap-1',
      artifact_kind: 'meaning:l1',
      quality_status: 'approved',
      artifact_ref: 'ref',
      artifact_json: { value: 'eten' },
      artifact_fingerprint: 'fp-1',
    }
    const ids = await upsertCapabilityArtifacts(client, [input, input])
    expect(ids).toEqual(['artifact-uuid-1', 'artifact-uuid-1'])
  })

  it('insertExerciseVariantGrammar returns the inserted id for CS8 wiring', async () => {
    const client = buildClient({ exercise_variants: 'variant-uuid-1' })
    const result = await insertExerciseVariantGrammar(client, {
      lesson_id: 'lesson-1',
      exercise_type: 'sentence_transformation',
      grammar_pattern_id: 'gp-1',
      payload_json: { prompt: 'x' },
      answer_key_json: { answer: 'y' },
    })
    expect(result).toEqual({ ok: true, id: 'variant-uuid-1' })
  })

  it('insertExerciseVariantVocab returns the inserted id for CS8 wiring', async () => {
    const client = buildClient({ exercise_variants: 'variant-uuid-2' })
    const result = await insertExerciseVariantVocab(client, {
      context_id: 'ctx-1',
      exercise_type: 'cloze_mcq',
      grammar_pattern_id: null,
      payload_json: { stem: 'x' },
      answer_key_json: { answer: 'y' },
    })
    expect(result).toEqual({ ok: true, id: 'variant-uuid-2' })
  })
})
