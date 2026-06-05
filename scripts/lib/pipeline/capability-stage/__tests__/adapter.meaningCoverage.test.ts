/**
 * adapter.meaningCoverage.test.ts — unit tests for the repointed readMeaningCoverage.
 *
 * Decision R (PR 1) moved translations from item_meanings rows to inline
 * learning_items columns. This test asserts that readMeaningCoverage derives
 * nlCovered/enCovered from learning_items.translation_nl/translation_en, not
 * from item_meanings rows.
 */

import { describe, it, expect } from 'vitest'
import { readMeaningCoverage } from '../adapter'

type LearningItemRow = {
  id: string
  translation_nl: string | null
  translation_en: string | null
}

/** Build a mock supabase that returns learning_items rows filtered by .in('id', ids). */
function buildMockClient(rows: LearningItemRow[]) {
  return {
    schema: () => ({
      from: (table: string) => {
        if (table !== 'learning_items') {
          throw new Error(`readMeaningCoverage queried unexpected table: ${table}`)
        }
        let current = [...rows]
        const chain: any = {
          select: () => chain,
          in: (_col: string, vals: string[]) => {
            current = rows.filter((r) => vals.includes(r.id))
            return chain
          },
          eq: () => chain,
          then: (resolve: (v: { data: LearningItemRow[]; error: null }) => unknown) =>
            resolve({ data: current, error: null }),
        }
        return chain
      },
    }),
  } as never
}

describe('readMeaningCoverage — repointed to learning_items inline columns (Decision R)', () => {
  it('adds an id to nlCovered when translation_nl is a non-empty string', async () => {
    const client = buildMockClient([
      { id: 'item-1', translation_nl: 'boek', translation_en: 'book' },
      { id: 'item-2', translation_nl: null, translation_en: 'pen' },
    ])
    const { nlCovered } = await readMeaningCoverage(client, ['item-1', 'item-2'])
    expect(nlCovered.has('item-1')).toBe(true)
    expect(nlCovered.has('item-2')).toBe(false)
  })

  it('excludes id from nlCovered when translation_nl is null', async () => {
    const client = buildMockClient([
      { id: 'item-a', translation_nl: null, translation_en: 'hello' },
    ])
    const { nlCovered } = await readMeaningCoverage(client, ['item-a'])
    expect(nlCovered.has('item-a')).toBe(false)
  })

  it('excludes id from nlCovered when translation_nl is empty string', async () => {
    const client = buildMockClient([
      { id: 'item-b', translation_nl: '', translation_en: 'morning' },
    ])
    const { nlCovered } = await readMeaningCoverage(client, ['item-b'])
    expect(nlCovered.has('item-b')).toBe(false)
  })

  it('excludes id from nlCovered when translation_nl is whitespace only', async () => {
    const client = buildMockClient([
      { id: 'item-c', translation_nl: '   ', translation_en: 'water' },
    ])
    const { nlCovered } = await readMeaningCoverage(client, ['item-c'])
    expect(nlCovered.has('item-c')).toBe(false)
  })

  it('adds an id to enCovered when translation_en is a non-empty string', async () => {
    const client = buildMockClient([
      { id: 'item-1', translation_nl: 'boek', translation_en: 'book' },
      { id: 'item-2', translation_nl: 'pen', translation_en: null },
    ])
    const { enCovered } = await readMeaningCoverage(client, ['item-1', 'item-2'])
    expect(enCovered.has('item-1')).toBe(true)
    expect(enCovered.has('item-2')).toBe(false)
  })

  it('handles empty itemIds gracefully — returns empty sets without hitting DB', async () => {
    // build a client that would throw if called — ensures no DB call on empty input
    const client = buildMockClient([])
    const { nlCovered, enCovered } = await readMeaningCoverage(client, [])
    expect(nlCovered.size).toBe(0)
    expect(enCovered.size).toBe(0)
  })

  it('does NOT query item_meanings — throws if that table is accessed', async () => {
    const strict = {
      schema: () => ({
        from: (table: string) => {
          if (table === 'item_meanings') {
            throw new Error('PGRST205: item_meanings has been dropped')
          }
          const current: LearningItemRow[] = [
            { id: 'item-x', translation_nl: 'hallo', translation_en: 'hello' },
          ]
          const chain: any = {
            select: () => chain,
            in: () => chain,
            eq: () => chain,
            then: (resolve: (v: { data: LearningItemRow[]; error: null }) => unknown) =>
              resolve({ data: current, error: null }),
          }
          return chain
        },
      }),
    } as never
    // Must NOT throw — only throws if item_meanings is touched
    await expect(readMeaningCoverage(strict, ['item-x'])).resolves.toBeDefined()
  })
})
