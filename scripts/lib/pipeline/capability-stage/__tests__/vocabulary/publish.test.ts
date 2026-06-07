/**
 * cap-v2 vocabulary rebuild — publishVocabulary orchestration control flow.
 *
 * The pure pieces (projector, cloze emitter, content-units, gate) are unit-tested
 * elsewhere; publishVocabulary is composition glue whose write correctness is
 * live-verified at the acceptance publish (plan Task 10), like store.ts / the
 * runner. These tests pin the load-bearing CONTROL FLOW: the pre-write gate
 * short-circuits BEFORE any DB write (a comma-separator item → validation_failed),
 * and dry-run stops before writes. The supabase client is a throwing stub, so any
 * adapter write on these paths fails the test.
 */

import { describe, it, expect } from 'vitest'
import { publishVocabulary } from '../../vocabulary/publish'
import type { LoadedLesson } from '../../loader'
import type { ItemDbResult, TypedItemRow } from '../../loadFromDb'

function itemRow(indonesian_text: string, l1_translation: string): TypedItemRow {
  return {
    id: `id-${indonesian_text}`,
    section_id: 'sec',
    lesson_id: 'L11',
    display_order: 0,
    source_item_ref: 'ref',
    item_type: 'word',
    indonesian_text,
    l1_translation,
    l2_translation: null,
    section_kind: 'vocabulary',
  }
}

const fakeLoadLesson = async (): Promise<LoadedLesson> =>
  ({
    lesson: { level: 'A1' },
    sections: [],
    audioClipsByNormalizedText: new Map(),
  }) as unknown as LoadedLesson

function fakeLoadFromDb(rows: TypedItemRow[]) {
  return async (): Promise<ItemDbResult> => ({
    items: rows,
    itemState: {
      existingItemsByNormalizedText: new Map(),
      existingItemCapsByCanonicalKey: new Map(),
    },
  })
}

// Any property access throws — proves no DB call happens on the short-circuit paths.
const throwingSupabase = new Proxy(
  {},
  {
    get() {
      throw new Error('DB accessed on a short-circuit path — gate/dry-run must stop before writes')
    },
  },
) as never

describe('publishVocabulary control flow', () => {
  it('returns validation_failed on a comma-as-OR translation_nl, before any write', async () => {
    const out = await publishVocabulary(
      { lessonId: 'L11', lessonNumber: 11 },
      {
        createSupabaseClient: () => throwingSupabase,
        loadLesson: fakeLoadLesson,
        loadFromDb: fakeLoadFromDb([itemRow('maar echter', 'maar, echter')]),
      },
    )
    expect(out.status).toBe('validation_failed')
    expect(out.findings.some((f) => f.gate === 'CS19' && f.severity === 'error')).toBe(true)
  })

  it('dry-run returns ok before any write', async () => {
    const out = await publishVocabulary(
      { lessonId: 'L11', lessonNumber: 11, dryRun: true },
      {
        createSupabaseClient: () => throwingSupabase,
        loadLesson: fakeLoadLesson,
        loadFromDb: fakeLoadFromDb([itemRow('makan', 'eten')]),
      },
    )
    expect(out.status).toBe('ok')
    expect(out.findings.filter((f) => f.severity === 'error')).toHaveLength(0)
  })
})
