import { describe, it, expect } from 'vitest'
import { reauthorTranslationSeparators } from '../reauthor-translation-separators'

interface ItemRow { id: string; base_text: string; item_type: string; translation_nl: string | null }

function buildMock(items: ItemRow[]) {
  const updates: Array<{ id: string; translation_nl: string }> = []
  function table(name: string) {
    let updatePayload: Record<string, unknown> | null = null
    const chain: any = {
      select: () => chain,
      in: () => chain,
      not: () => chain,
      update: (payload: Record<string, unknown>) => { updatePayload = payload; return chain },
      eq: (_c: string, id: unknown) => {
        if (updatePayload) {
          const row = items.find((i) => i.id === id)
          if (row) row.translation_nl = updatePayload.translation_nl as string
          updates.push({ id: id as string, translation_nl: updatePayload.translation_nl as string })
        }
        return Promise.resolve({ data: null, error: null })
      },
      range: (from: number, to: number) => {
        if (name !== 'learning_items') return Promise.resolve({ data: [], error: null })
        const rows = items
          .filter((i) => i.item_type === 'word' || i.item_type === 'phrase')
          .filter((i) => i.translation_nl != null)
          .map((i) => ({ id: i.id, base_text: i.base_text, item_type: i.item_type, translation_nl: i.translation_nl }))
        return Promise.resolve({ data: rows.slice(from, to + 1), error: null })
      },
    }
    return chain
  }
  return { client: { schema: () => ({ from: (t: string) => table(t) }) }, updates, items }
}

function items(): ItemRow[] {
  return [
    { id: 'i-ok', base_text: 'huis', item_type: 'word', translation_nl: 'huis / woning' },
    { id: 'i-comma', base_text: 'bapak', item_type: 'word', translation_nl: 'meneer, vader, u' },
    { id: 'i-semi', base_text: 'harganya murah', item_type: 'phrase', translation_nl: 'Het is goedkoop; de prijs is laag' },
    { id: 'i-exempt', base_text: 'baik-baik saja', item_type: 'phrase', translation_nl: 'Goed, dank u wel' },
    { id: 'i-sentence', base_text: 'long line', item_type: 'sentence', translation_nl: 'Ja, ik kom; tot straks' },
    { id: 'i-null', base_text: 'leeg', item_type: 'word', translation_nl: null },
  ]
}

describe('reauthorTranslationSeparators — Fix 2e live-DB tool', () => {
  it('re-authors only non-canonical word/phrase translation_nl to "/"', async () => {
    const mock = buildMock(items())
    const result = await reauthorTranslationSeparators(mock.client as never, { dryRun: false })
    expect(result.offenders.map((o) => o.id).sort()).toEqual(['i-comma', 'i-semi'])
    expect(mock.items.find((i) => i.id === 'i-comma')!.translation_nl).toBe('meneer / vader / u')
    expect(mock.items.find((i) => i.id === 'i-semi')!.translation_nl).toBe('Het is goedkoop / de prijs is laag')
  })

  it('skips the canonical, exempt, sentence, and null rows', async () => {
    const mock = buildMock(items())
    await reauthorTranslationSeparators(mock.client as never, { dryRun: false })
    expect(mock.items.find((i) => i.id === 'i-ok')!.translation_nl).toBe('huis / woning')
    expect(mock.items.find((i) => i.id === 'i-exempt')!.translation_nl).toBe('Goed, dank u wel')
    expect(mock.items.find((i) => i.id === 'i-sentence')!.translation_nl).toBe('Ja, ik kom; tot straks')
  })

  it('dry-run writes nothing', async () => {
    const mock = buildMock(items())
    const result = await reauthorTranslationSeparators(mock.client as never, { dryRun: true })
    expect(result.offenders).toHaveLength(2)
    expect(mock.updates).toHaveLength(0)
  })

  it('is idempotent — a second run is a no-op', async () => {
    const mock = buildMock(items())
    await reauthorTranslationSeparators(mock.client as never, { dryRun: false })
    const second = await reauthorTranslationSeparators(mock.client as never, { dryRun: false })
    expect(second.offenders).toHaveLength(0)
  })
})
