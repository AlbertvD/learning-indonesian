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
 *
 * CAUTION (Task 8): before relying on the spy, add a positive-control sibling
 * test that calls `fetchArtifacts` through the same import path and asserts the
 * spy WAS called — this confirms vi.spyOn on the namespace actually intercepts
 * the named-import call site in item.ts (not guaranteed if item.ts uses a direct
 * named import). Alternatively, assert against the observable effect instead of
 * the spy: verify no query to `capability_artifacts` was issued on the mock
 * client (check that `from('capability_artifacts')` was never called).
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

  it(
    'fetchForItemBlocks does not call fetchArtifacts (curated-distractor path is DB-direct)',
    async () => {
      // Positive control: confirm the spy WOULD fire if fetchArtifacts were called.
      // This verifies vi.spyOn correctly intercepts the named export. We call
      // fetchArtifacts directly and assert the spy registered it, then restore
      // before the actual gate assertion.
      const fetchArtifactsSpy = vi.spyOn(adapterModule, 'fetchArtifacts')
      const positiveClient = makeMockClient()
      await adapterModule.fetchArtifacts(positiveClient, ['cap-positive-control'])
      expect(fetchArtifactsSpy, 'positive control: spy must intercept a direct fetchArtifacts call').toHaveBeenCalledOnce()
      fetchArtifactsSpy.mockClear()

      // Gate assertion: fetchForItemBlocks must NOT call fetchArtifacts.
      // The curated-distractor tables are fetched via their own DB queries
      // (recognition_mcq_distractors + cued_recall_distractors), not via
      // the legacy capability_artifacts table.
      const client = makeMockClient()
      const result = new Map<string, BlockResolutionData>()

      const itemBlocks: ItemBucketEntry[] = [
        {
          block: {
            id: 'block-enforcement-test-1',
            kind: 'due_review',
            capabilityId: 'cap-enforcement-test-1',
            canonicalKeySnapshot: 'cap:v1:item:learning_items/test-item:text_recognition:id_to_l1:text:nl',
            renderPlan: {
              capabilityKey: 'cap:v1:item:learning_items/test-item:text_recognition:id_to_l1:text:nl',
              sourceRef: 'learning_items/test-item',
              exerciseType: 'recognition_mcq',
              capabilityType: 'text_recognition',
              skillType: 'recognition',
              requiredArtifacts: [],
            },
            reviewContext: {
              schedulerSnapshot: {} as never,
              currentStateVersion: 0,
              artifactVersionSnapshot: {},
              capabilityReadinessStatus: 'ready',
              capabilityPublicationStatus: 'published',
            },
          } as ItemBucketEntry['block'],
          itemKey: 'test-item',
        },
      ]

      await fetchForItemBlocks(client, itemBlocks, 'nl', result)

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
