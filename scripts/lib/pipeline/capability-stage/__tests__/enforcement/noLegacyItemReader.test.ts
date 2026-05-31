/**
 * Enforcement gate: the item resolution path must make NO call to `fetchArtifacts`
 * (the legacy `capability_artifacts` table reader).
 *
 * Background: `byKind/item.ts` sets `artifactsByKind: new Map()` and never calls
 * `fetchArtifacts` (verified at item.ts:240-254). The `capability_artifacts` table
 * holds legacy data; item-kind data was moved to typed tables in PR 1.
 *
 * The observable-effect approach (tracking `from('capability_artifacts')` on the
 * mock client) is the primary gate — it catches a real regression regardless of
 * how `fetchArtifacts` is invoked (named import, namespace call, or any other
 * binding). The spy-based secondary gate still runs to confirm the spy
 * infrastructure works, but the DB-query-tracking assertion is the authoritative
 * gate.
 *
 * Task 8 / #99: augmented with observable-effect assertion per CAUTION note.
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

/**
 * Tracking mock client: records every table name passed to `.from()` so tests can
 * assert which tables were (or were not) queried. This is the observable-effect
 * approach — it catches a real regression regardless of how `fetchArtifacts` is
 * bound at call sites (named import, namespace access, or any other form).
 */
function makeTrackingClient() {
  const queriedTables: string[] = []
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

  const client = {
    schema: () => ({
      from: (table: string) => {
        queriedTables.push(table)
        return buildChain()
      },
    }),
  } as never

  return { client, queriedTables }
}

function makeItemBlocks(blockId: string, capId: string): ItemBucketEntry[] {
  return [
    {
      block: {
        id: blockId,
        kind: 'due_review',
        capabilityId: capId,
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
}

describe('capability-stage item path: no legacy capability_artifacts reader', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it(
    'fetchForItemBlocks does not query capability_artifacts (observable-effect gate)',
    async () => {
      // Observable-effect gate: track every `.from(table)` call on the mock
      // client and assert `capability_artifacts` was never queried. This catches
      // a real regression regardless of how fetchArtifacts is invoked at the
      // call site (named import, namespace access, etc.).
      const { client, queriedTables } = makeTrackingClient()
      const result = new Map<string, BlockResolutionData>()

      await fetchForItemBlocks(client, makeItemBlocks('block-enforcement-test-1', 'cap-enforcement-test-1'), 'nl', result)

      expect(
        queriedTables,
        'capability_artifacts was queried during item block resolution — the item path must use the curated distractor tables directly, not capability_artifacts',
      ).not.toContain('capability_artifacts')

      // Positive control: confirm the detection fires if such a query were made.
      // We call fetchArtifacts directly with a fresh tracking client and assert
      // it DID record a capability_artifacts query.
      const { client: controlClient, queriedTables: controlTables } = makeTrackingClient()
      await adapterModule.fetchArtifacts(controlClient, ['cap-positive-control'])
      expect(
        controlTables,
        'positive control: a direct fetchArtifacts call must register a capability_artifacts query',
      ).toContain('capability_artifacts')
    },
  )

  // Spy-based secondary gate: confirms the spy infrastructure works in addition
  // to the observable-effect gate above. Both must agree: the item path does not
  // call fetchArtifacts.
  it(
    'fetchForItemBlocks does not call fetchArtifacts (spy-based secondary gate)',
    async () => {
      const fetchArtifactsSpy = vi.spyOn(adapterModule, 'fetchArtifacts')

      // Positive control: confirm the spy intercepts a direct call.
      const positiveClient = makeMockClient()
      await adapterModule.fetchArtifacts(positiveClient, ['cap-positive-control'])
      expect(fetchArtifactsSpy, 'positive control: spy must intercept a direct fetchArtifacts call').toHaveBeenCalledOnce()
      fetchArtifactsSpy.mockClear()

      // Gate assertion: fetchForItemBlocks must NOT call fetchArtifacts.
      const client = makeMockClient()
      const result = new Map<string, BlockResolutionData>()

      await fetchForItemBlocks(client, makeItemBlocks('block-enforcement-test-2', 'cap-enforcement-test-2'), 'nl', result)

      expect(
        fetchArtifactsSpy,
        'fetchArtifacts was called during item block resolution — the item path must use the curated distractor tables directly, not capability_artifacts',
      ).not.toHaveBeenCalled()
    },
  )

  // Active guard: verify the test infrastructure itself is wired correctly.
  it('fetchArtifacts is exported from the exercise-content adapter (spy target exists)', () => {
    expect(typeof adapterModule.fetchArtifacts).toBe('function')
  })
})
