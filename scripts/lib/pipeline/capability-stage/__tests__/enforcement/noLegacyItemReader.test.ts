/**
 * Enforcement gate: the item resolution path must make NO call to `fetchArtifacts`
 * (the legacy `capability_artifacts` table reader).
 *
 * Background: `byKind/item.ts` sets `artifactsByKind: new Map()` and never calls
 * `fetchArtifacts` (architect finding, 2026-05-28; verified at item.ts:208-214).
 * The `capability_artifacts` table holds legacy data; item-kind data was moved to
 * typed tables in PR 1.
 *
 * This test is SKIPPED until Task 8 officially wires the curated-distractor reader
 * and confirms the no-artifact contract as an intentional, tested invariant —
 * not just an observation. Unskipping is a one-line change.
 *
 * TODO(Task 8, #99): unskip when curated reader lands. The full test body is
 * already written; the only change is removing `.skip` from the `it.skip`.
 *
 * How to unskip:
 *   1. Remove `.skip` from the `it.skip(...)` call below.
 *   2. Verify that `fetchArtifacts` is still not called (add the curated-table
 *      fetch to `fetchForItemBlocks` without routing through `fetchArtifacts`).
 *   3. Run: bun run test scripts/lib/pipeline/capability-stage/__tests__/enforcement/noLegacyItemReader.test.ts
 */

import { describe, it, expect, vi, afterEach } from 'vitest'
import * as adapterModule from '@/lib/exercise-content/adapter'
import { fetchForItemBlocks } from '@/lib/exercise-content/byKind/item'
import type { ItemBucketEntry } from '@/lib/exercise-content/adapter'
import type { BlockResolutionData } from '@/lib/exercise-content/adapter'

// Minimal mock Supabase client that returns empty results for all queries.
// The item fetcher does a wave-1 key lookup, then fans out — returning empty
// at wave 1 is enough to exercise the path without building a full fixture.
function makeMockClient() {
  const chainResult = { data: [], error: null }

  function buildChain(): Record<string, unknown> {
    const chain: Record<string, unknown> = {
      select: () => buildChain(),
      eq: () => buildChain(),
      in: () => buildChain(),
      order: () => buildChain(),
      single: async () => ({ data: null, error: null }),
      then: (resolve: (r: { data: unknown[]; error: null }) => void) => resolve(chainResult),
    }
    return chain
  }

  return {
    schema: () => ({
      from: () => buildChain(),
    }),
  } as never
}

describe('capability-stage item path: no legacy capability_artifacts reader', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it.skip(
    // TODO(Task 8, #99): unskip when curated reader lands.
    // The full assertion body is written; remove `.skip` to activate.
    'fetchForItemBlocks does not call fetchArtifacts (curated-distractor path is DB-direct)',
    async () => {
      // Spy on fetchArtifacts in the adapter module. If the item path calls it,
      // this assertion fails — guaranteeing the curated reader bypasses the
      // legacy capability_artifacts table.
      const fetchArtifactsSpy = vi.spyOn(adapterModule, 'fetchArtifacts')

      const client = makeMockClient()
      const result = new Map<string, BlockResolutionData>()

      // A minimal item-only bucket: one block with an itemKey. The mock client
      // returns empty at wave 1, so no further fanout happens — but the entry
      // point `fetchForItemBlocks` must be entered (verifying the call path).
      const itemBlocks: ItemBucketEntry[] = [
        {
          block: {
            id: 'block-enforcement-test-1',
            capabilityId: 'cap-enforcement-test-1',
            capabilityKey: 'cap:v1:item:learning_items/test-item:text_recognition:id_to_l1:text:nl',
            sourceKind: 'item',
            exerciseType: 'text_recognition',
            direction: 'id_to_l1',
            modality: 'text',
            learnerLanguage: 'nl',
            difficulty: null,
            lessonId: 'lesson-enforcement-test',
          } as ItemBucketEntry['block'],
          itemKey: 'test-item',
        },
      ]

      await fetchForItemBlocks(client, itemBlocks, 'nl', result)

      // Core assertion: the item path must not call fetchArtifacts at all.
      // A call here means the item path is still routing through the legacy
      // capability_artifacts table — which must be retired for the item kind.
      expect(
        fetchArtifactsSpy,
        'fetchArtifacts was called during item block resolution — the item path must use the curated distractor tables directly, not capability_artifacts',
      ).not.toHaveBeenCalled()
    },
  )

  // Active (non-skipped) guard: verify the test infrastructure itself is wired
  // correctly. If vi.spyOn can't find fetchArtifacts on the adapter module, the
  // skip-to-green transition in Task 8 will fail for the wrong reason.
  it('fetchArtifacts is exported from the exercise-content adapter (spy target exists)', () => {
    expect(typeof adapterModule.fetchArtifacts).toBe('function')
  })
})
