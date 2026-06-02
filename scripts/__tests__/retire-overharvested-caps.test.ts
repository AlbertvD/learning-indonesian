import { describe, it, expect } from 'vitest'
import { retireOverharvestedCaps } from '../retire-overharvested-caps'

// ---------------------------------------------------------------------------
// Minimal in-memory Supabase mock for the two tables this script touches.
// ---------------------------------------------------------------------------
interface CapRow { id: string; source_kind: string; source_ref: string; retired_at: string | null }
interface ItemRow { normalized_text: string; item_type: string }

function buildMock(caps: CapRow[], items: ItemRow[]) {
  const updates: Array<{ ids: string[] }> = []

  function table(name: string) {
    let eqCol: string | undefined
    let eqVal: unknown
    let isRetiredNull = false
    let pendingUpdate: Record<string, unknown> | null = null
    const chain: any = {
      select: () => chain,
      eq: (c: string, v: unknown) => { eqCol = c; eqVal = v; return chain },
      is: (c: string, v: unknown) => { if (c === 'retired_at' && v === null) isRetiredNull = true; return chain },
      in: (_c: string, ids: unknown[]) => {
        // terminal for update().in(...)
        if (pendingUpdate) {
          const idSet = new Set(ids as string[])
          for (const cap of caps) if (idSet.has(cap.id)) cap.retired_at = pendingUpdate.retired_at as string
          updates.push({ ids: ids as string[] })
        }
        return Promise.resolve({ data: null, error: null })
      },
      update: (payload: Record<string, unknown>) => { pendingUpdate = payload; return chain },
      range: (from: number, to: number) => {
        let rows: Array<Record<string, unknown>> = []
        if (name === 'learning_capabilities') {
          rows = caps
            .filter((c) => (eqCol === 'source_kind' ? c.source_kind === eqVal : true))
            .filter((c) => (isRetiredNull ? c.retired_at === null : true))
            .map((c) => ({ id: c.id, source_kind: c.source_kind, source_ref: c.source_ref }))
        } else if (name === 'learning_items') {
          rows = items.map((i) => ({ normalized_text: i.normalized_text, item_type: i.item_type }))
        }
        return Promise.resolve({ data: rows.slice(from, to + 1), error: null })
      },
    }
    return chain
  }

  const client = { schema: () => ({ from: (t: string) => table(t) }) }
  return { client, updates, caps }
}

const ITEMS: ItemRow[] = [
  { normalized_text: 'buku', item_type: 'word' },
  { normalized_text: 'terima kasih kembali', item_type: 'phrase' },
  { normalized_text: 'ada yang dari negeri belanda', item_type: 'sentence' },
  { normalized_text: 'selamat pagi, apa kabar', item_type: 'dialogue_chunk' },
]

function caps(): CapRow[] {
  return [
    { id: 'c-word', source_kind: 'item', source_ref: 'learning_items/buku', retired_at: null },
    { id: 'c-phrase', source_kind: 'item', source_ref: 'learning_items/terima kasih kembali', retired_at: null },
    { id: 'c-sentence', source_kind: 'item', source_ref: 'learning_items/ada yang dari negeri belanda', retired_at: null },
    { id: 'c-dialchunk', source_kind: 'item', source_ref: 'learning_items/selamat pagi, apa kabar', retired_at: null },
    // dialogue_line cloze cap — NOT an item cap; must be excluded.
    { id: 'c-dialline', source_kind: 'dialogue_line', source_ref: 'lesson_dialogue_lines/l1-s2-3', retired_at: null },
  ]
}

describe('retireOverharvestedCaps — Fix 1b backfill', () => {
  it('retires only sentence/dialogue_chunk item caps', async () => {
    const { client, caps: state } = buildMock(caps(), ITEMS)
    const result = await retireOverharvestedCaps(client as never, { dryRun: false })
    expect(result.retiredIds.sort()).toEqual(['c-dialchunk', 'c-sentence'])
    expect(state.find((c) => c.id === 'c-sentence')!.retired_at).not.toBeNull()
    expect(state.find((c) => c.id === 'c-dialchunk')!.retired_at).not.toBeNull()
  })

  it('excludes word/phrase item caps and dialogue_line cloze caps', async () => {
    const { client, caps: state } = buildMock(caps(), ITEMS)
    await retireOverharvestedCaps(client as never, { dryRun: false })
    expect(state.find((c) => c.id === 'c-word')!.retired_at).toBeNull()
    expect(state.find((c) => c.id === 'c-phrase')!.retired_at).toBeNull()
    expect(state.find((c) => c.id === 'c-dialline')!.retired_at).toBeNull()
  })

  it('dry-run writes nothing', async () => {
    const { client, updates, caps: state } = buildMock(caps(), ITEMS)
    const result = await retireOverharvestedCaps(client as never, { dryRun: true })
    expect(result.retiredIds.sort()).toEqual(['c-dialchunk', 'c-sentence'])
    expect(updates).toHaveLength(0)
    expect(state.every((c) => c.retired_at === null)).toBe(true)
  })

  it('is idempotent — a second run after retire is a no-op', async () => {
    const mock = buildMock(caps(), ITEMS)
    await retireOverharvestedCaps(mock.client as never, { dryRun: false })
    const second = await retireOverharvestedCaps(mock.client as never, { dryRun: false })
    expect(second.retiredIds).toHaveLength(0)
  })
})
