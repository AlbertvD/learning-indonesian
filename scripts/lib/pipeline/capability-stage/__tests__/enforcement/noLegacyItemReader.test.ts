/**
 * Enforcement gate: the item resolution path must make NO query to the
 * `capability_artifacts` table.
 *
 * Slice 4b dropped `capability_artifacts` and its `fetchArtifacts` reader
 * entirely; the item path renders from the typed distractor/translation tables.
 * This observable-effect gate remains as a cheap regression guard against anyone
 * re-introducing a `from('capability_artifacts')` query in the item fetcher.
 * (The former spy-based gate + positive control targeted `fetchArtifacts`, which
 * no longer exists.)
 */

import { describe, it, expect } from 'vitest'
import { fetchForItemBlocks } from '@/lib/exercise-content/byKind/item'
import type { ItemBucketEntry } from '@/lib/exercise-content/adapter'
import type { BlockResolutionData } from '@/lib/exercise-content/adapter'

/**
 * Tracking mock client: records every table name passed to `.from()` so the test
 * can assert which tables were (or were not) queried.
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
        canonicalKeySnapshot: 'cap:v1:vocabulary_src:learning_items/test-item:recognise_meaning_from_text_cap:id_to_l1:text:nl',
        renderPlan: {
          capabilityKey: 'cap:v1:vocabulary_src:learning_items/test-item:recognise_meaning_from_text_cap:id_to_l1:text:nl',
          sourceRef: 'learning_items/test-item',
          exerciseType: 'recognition_mcq',
          capabilityType: 'recognise_meaning_from_text_cap',
          skillType: 'recognition',
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
  it('fetchForItemBlocks never queries the capability_artifacts table (observable-effect gate)', async () => {
    const { client, queriedTables } = makeTrackingClient()
    const result = new Map<string, BlockResolutionData>()

    await fetchForItemBlocks(client, makeItemBlocks('block-enforcement-test-1', 'cap-enforcement-test-1'), 'nl', result)

    expect(
      queriedTables,
      'capability_artifacts was queried during item block resolution — the table is dropped (Slice 4b); the item path must use the typed distractor/translation tables',
    ).not.toContain('capability_artifacts')
  })
})
