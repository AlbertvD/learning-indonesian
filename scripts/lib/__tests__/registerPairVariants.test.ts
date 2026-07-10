import { describe, it, expect } from 'vitest'
import {
  mapRegisterPairsToCandidates,
  registerPairSlugVariants,
  type RegisterPairEntry,
} from '../registerPairVariants'

describe('registerPairSlugVariants', () => {
  it('returns the bare slug plus the two question-mark/exclamation-mark suffix variants', () => {
    expect(registerPairSlugVariants('bagaimana')).toEqual(['bagaimana', 'bagaimana?', 'bagaimana!'])
  })

  it('applies itemSlug normalization (lowercase + trim) before deriving variants', () => {
    expect(registerPairSlugVariants('  Bagaimana ')).toEqual(['bagaimana', 'bagaimana?', 'bagaimana!'])
  })
})

describe('mapRegisterPairsToCandidates', () => {
  it('resolves a formal word stored in the DB with question-mark punctuation (bagaimana -> bagaimana?)', () => {
    const pairs: RegisterPairEntry[] = [{ formal: 'bagaimana', informal: 'gimana' }]
    const formalItemIdBySlug = new Map([['bagaimana?', 'item-bagaimana']])
    const { candidates, unresolved } = mapRegisterPairsToCandidates(pairs, formalItemIdBySlug)
    expect(candidates).toEqual([
      { learningItemId: 'item-bagaimana', language: 'id', variantText: 'gimana', variantType: 'informal' },
    ])
    expect(unresolved).toEqual([])
  })

  it('maps a resolved pair to a formal-item, language=id, variant_type=informal candidate', () => {
    const pairs: RegisterPairEntry[] = [{ formal: 'tidak', informal: 'nggak' }]
    const formalItemIdBySlug = new Map([['tidak', 'item-tidak']])
    const { candidates, unresolved } = mapRegisterPairsToCandidates(pairs, formalItemIdBySlug)
    expect(candidates).toEqual([
      { learningItemId: 'item-tidak', language: 'id', variantText: 'nggak', variantType: 'informal' },
    ])
    expect(unresolved).toEqual([])
  })

  it('never produces a row on the informal item (only the formal item id appears)', () => {
    const pairs: RegisterPairEntry[] = [{ formal: 'sudah', informal: 'udah' }]
    const formalItemIdBySlug = new Map([['sudah', 'item-sudah'], ['udah', 'item-udah']])
    const { candidates } = mapRegisterPairsToCandidates(pairs, formalItemIdBySlug)
    expect(candidates).toHaveLength(1)
    expect(candidates[0].learningItemId).toBe('item-sudah')
    expect(candidates[0].variantText).toBe('udah')
  })

  it('resolves the formal slug via itemSlug (case + whitespace insensitive)', () => {
    const pairs: RegisterPairEntry[] = [{ formal: '  Tidak ', informal: 'nggak' }]
    const formalItemIdBySlug = new Map([['tidak', 'item-tidak']])
    const { candidates, unresolved } = mapRegisterPairsToCandidates(pairs, formalItemIdBySlug)
    expect(candidates).toEqual([
      { learningItemId: 'item-tidak', language: 'id', variantText: 'nggak', variantType: 'informal' },
    ])
    expect(unresolved).toEqual([])
  })

  it('reports a pair whose formal twin is not live as unresolved, never fabricates an id', () => {
    const pairs: RegisterPairEntry[] = [{ formal: 'ghost-word', informal: 'ghost-informal' }]
    const formalItemIdBySlug = new Map<string, string>()
    const { candidates, unresolved } = mapRegisterPairsToCandidates(pairs, formalItemIdBySlug)
    expect(candidates).toEqual([])
    expect(unresolved).toEqual([{ formal: 'ghost-word', informal: 'ghost-informal' }])
  })

  it('processes a mix of resolved and unresolved pairs independently', () => {
    const pairs: RegisterPairEntry[] = [
      { formal: 'tidak', informal: 'nggak' },
      { formal: 'unresolvable', informal: 'nope' },
      { formal: 'habis', informal: 'abis' },
    ]
    const formalItemIdBySlug = new Map([['tidak', 'item-tidak'], ['habis', 'item-habis']])
    const { candidates, unresolved } = mapRegisterPairsToCandidates(pairs, formalItemIdBySlug)
    expect(candidates).toEqual([
      { learningItemId: 'item-tidak', language: 'id', variantText: 'nggak', variantType: 'informal' },
      { learningItemId: 'item-habis', language: 'id', variantText: 'abis', variantType: 'informal' },
    ])
    expect(unresolved).toEqual([{ formal: 'unresolvable', informal: 'nope' }])
  })

  it('returns empty candidates and unresolved for an empty pairs array', () => {
    const { candidates, unresolved } = mapRegisterPairsToCandidates([], new Map())
    expect(candidates).toEqual([])
    expect(unresolved).toEqual([])
  })
})
