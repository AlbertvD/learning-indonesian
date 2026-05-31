/**
 * generateItemDistractors.test.ts — Unit tests for the in-stage curated
 * distractor generator.
 *
 * Strategy: TDD the pure parts (buildPrompt, parseResponse) and the
 * injected-generator path without any real network calls.
 *
 * Tests:
 *   1. buildPrompt — includes items, pool, and all quality-rule text
 *   2. parseResponse — happy path, malformed input, missing arrays, wrong lengths
 *   3. generateItemDistractors (injected fn) — maps output correctly, no-op cases
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  buildPrompt,
  parseResponse,
  generateItemDistractors,
  type DistractorInputItem,
  type ItemDistractorSet,
} from '../generateItemDistractors'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ITEM_MURAH: DistractorInputItem = {
  source_item_ref: 'murah',
  item_type: 'word',
  indonesian_text: 'murah',
  l1_translation: 'goedkoop',
}

const ITEM_MAKAN: DistractorInputItem = {
  source_item_ref: 'makan',
  item_type: 'word',
  indonesian_text: 'makan',
  l1_translation: 'eten',
}

const POOL_ITEM_MAHAL: DistractorInputItem = {
  source_item_ref: 'mahal',
  item_type: 'word',
  indonesian_text: 'mahal',
  l1_translation: 'duur',
}

const POOL_ITEM_BELI: DistractorInputItem = {
  source_item_ref: 'beli',
  item_type: 'word',
  indonesian_text: 'beli',
  l1_translation: 'kopen',
}

const VALID_DISTRACTOR_SET: ItemDistractorSet = {
  source_item_ref: 'murah',
  recognition_distractors_nl: ['duur', 'gratis', 'betaalbaar'],
  cued_recall_distractors_id: ['mahal', 'murid', 'mudah'],
  cloze_distractors_id: ['mahal', 'besar', 'jauh'],
}

const CANNED_VALID_RESPONSE = JSON.stringify([
  {
    source_item_ref: 'murah',
    recognition_distractors_nl: ['duur', 'gratis', 'betaalbaar'],
    cued_recall_distractors_id: ['mahal', 'murid', 'mudah'],
    cloze_distractors_id: ['mahal', 'besar', 'jauh'],
  },
])

// ---------------------------------------------------------------------------
// 1. buildPrompt — pure function tests
// ---------------------------------------------------------------------------

describe('buildPrompt', () => {
  it('includes item source_item_ref, indonesian_text, and dutch_translation', () => {
    const prompt = buildPrompt([ITEM_MURAH], [POOL_ITEM_MAHAL])
    expect(prompt).toContain('murah')
    expect(prompt).toContain('goedkoop')
  })

  it('includes pool items in the prompt', () => {
    const prompt = buildPrompt([ITEM_MURAH], [POOL_ITEM_MAHAL, POOL_ITEM_BELI])
    expect(prompt).toContain('mahal')
    expect(prompt).toContain('duur')
    expect(prompt).toContain('beli')
    expect(prompt).toContain('kopen')
  })

  it('includes the rule text for recognition_distractors_nl', () => {
    const prompt = buildPrompt([ITEM_MURAH], [])
    expect(prompt).toContain('recognition_distractors_nl')
    expect(prompt).toContain('Same part of speech')
    expect(prompt).toContain('Semantic near-misses')
  })

  it('includes the rule text for cued_recall_distractors_id', () => {
    const prompt = buildPrompt([ITEM_MURAH], [])
    expect(prompt).toContain('cued_recall_distractors_id')
    expect(prompt).toContain('Phonetically or orthographically similar')
    expect(prompt).toContain('morphological variants')
  })

  it('includes the rule text for cloze_distractors_id', () => {
    const prompt = buildPrompt([ITEM_MURAH], [])
    expect(prompt).toContain('cloze_distractors_id')
    expect(prompt).toContain('Same semantic field')
  })

  it('instructs Claude to return exactly 3 elements per array', () => {
    const prompt = buildPrompt([ITEM_MURAH], [])
    expect(prompt).toContain('EXACTLY 3')
  })

  it('instructs Claude to only use pool words the learner has seen', () => {
    const prompt = buildPrompt([ITEM_MURAH], [])
    expect(prompt).toContain('ONLY use words from this pool')
  })

  it('includes the same-word-class rule (item_type)', () => {
    const prompt = buildPrompt([ITEM_MURAH], [])
    expect(prompt).toContain('item_type')
    expect(prompt).toContain('word-class')
  })

  it('instructs Claude to return no prose or markdown fences', () => {
    const prompt = buildPrompt([ITEM_MURAH], [])
    expect(prompt).toContain('No prose, no markdown fences')
  })

  it('handles multiple items in a single prompt', () => {
    const prompt = buildPrompt([ITEM_MURAH, ITEM_MAKAN], [POOL_ITEM_MAHAL])
    expect(prompt).toContain('murah')
    expect(prompt).toContain('makan')
  })

  it('handles empty pool gracefully', () => {
    const prompt = buildPrompt([ITEM_MURAH], [])
    // Should not throw and should still include the item
    expect(prompt).toContain('murah')
    expect(prompt).toContain('[]') // empty pool serialized
  })
})

// ---------------------------------------------------------------------------
// 2. parseResponse — pure function tests
// ---------------------------------------------------------------------------

describe('parseResponse', () => {
  it('parses valid JSON array with exactly-3 distractor arrays', () => {
    const result = parseResponse(CANNED_VALID_RESPONSE)
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual(VALID_DISTRACTOR_SET)
  })

  it('returns empty array for empty JSON array', () => {
    expect(parseResponse('[]')).toEqual([])
  })

  it('returns empty array for malformed JSON', () => {
    expect(parseResponse('not json at all')).toEqual([])
    expect(parseResponse('{broken')).toEqual([])
    expect(parseResponse('')).toEqual([])
  })

  it('returns empty array when top-level is not an array', () => {
    expect(parseResponse('{"key": "value"}')).toEqual([])
  })

  it('skips items with missing source_item_ref', () => {
    const raw = JSON.stringify([
      {
        recognition_distractors_nl: ['a', 'b', 'c'],
        cued_recall_distractors_id: ['x', 'y', 'z'],
        cloze_distractors_id: ['p', 'q', 'r'],
      },
    ])
    expect(parseResponse(raw)).toEqual([])
  })

  it('skips items where a distractor array has fewer than 3 elements', () => {
    const raw = JSON.stringify([
      {
        source_item_ref: 'murah',
        recognition_distractors_nl: ['duur', 'gratis'], // only 2
        cued_recall_distractors_id: ['mahal', 'murid', 'mudah'],
        cloze_distractors_id: ['mahal', 'besar', 'jauh'],
      },
    ])
    expect(parseResponse(raw)).toEqual([])
  })

  it('skips items where a distractor array has more than 3 elements', () => {
    const raw = JSON.stringify([
      {
        source_item_ref: 'murah',
        recognition_distractors_nl: ['duur', 'gratis', 'betaalbaar', 'extra'], // 4
        cued_recall_distractors_id: ['mahal', 'murid', 'mudah'],
        cloze_distractors_id: ['mahal', 'besar', 'jauh'],
      },
    ])
    expect(parseResponse(raw)).toEqual([])
  })

  it('skips items where a distractor element is not a string', () => {
    const raw = JSON.stringify([
      {
        source_item_ref: 'murah',
        recognition_distractors_nl: ['duur', 42, 'betaalbaar'], // non-string
        cued_recall_distractors_id: ['mahal', 'murid', 'mudah'],
        cloze_distractors_id: ['mahal', 'besar', 'jauh'],
      },
    ])
    expect(parseResponse(raw)).toEqual([])
  })

  it('skips null entries in the array', () => {
    const raw = JSON.stringify([null, VALID_DISTRACTOR_SET])
    const result = parseResponse(raw)
    expect(result).toHaveLength(1)
    expect(result[0].source_item_ref).toBe('murah')
  })

  it('strips markdown code fences before parsing', () => {
    const wrapped = '```json\n' + CANNED_VALID_RESPONSE + '\n```'
    const result = parseResponse(wrapped)
    expect(result).toHaveLength(1)
  })

  it('parses multiple valid items', () => {
    const raw = JSON.stringify([
      {
        source_item_ref: 'murah',
        recognition_distractors_nl: ['duur', 'gratis', 'betaalbaar'],
        cued_recall_distractors_id: ['mahal', 'murid', 'mudah'],
        cloze_distractors_id: ['mahal', 'besar', 'jauh'],
      },
      {
        source_item_ref: 'makan',
        recognition_distractors_nl: ['drinken', 'slapen', 'lopen'],
        cued_recall_distractors_id: ['minum', 'tidur', 'jalan'],
        cloze_distractors_id: ['minum', 'beli', 'pergi'],
      },
    ])
    const result = parseResponse(raw)
    expect(result).toHaveLength(2)
    expect(result[0].source_item_ref).toBe('murah')
    expect(result[1].source_item_ref).toBe('makan')
  })
})

// ---------------------------------------------------------------------------
// 3. generateItemDistractors — injected fn path + no-op cases
// ---------------------------------------------------------------------------

describe('generateItemDistractors', () => {
  beforeEach(() => {
    // Ensure ANTHROPIC_API_KEY is not set for these tests
    delete process.env.ANTHROPIC_API_KEY
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns empty result with zero counts when items array is empty', async () => {
    const result = await generateItemDistractors([], [])
    expect(result.generatedCount).toBe(0)
    expect(result.skippedCount).toBe(0)
    expect(result.distractorsBySourceItemRef.size).toBe(0)
  })

  it('returns empty result (no-op) when no generateFn and no API key', async () => {
    const result = await generateItemDistractors([ITEM_MURAH], [POOL_ITEM_MAHAL])
    expect(result.generatedCount).toBe(0)
    expect(result.distractorsBySourceItemRef.size).toBe(0)
  })

  it('uses injected generateFn when provided, bypassing API key check', async () => {
    const fakeFn = vi.fn().mockResolvedValue(CANNED_VALID_RESPONSE)
    const result = await generateItemDistractors([ITEM_MURAH], [POOL_ITEM_MAHAL], {
      generateFn: fakeFn,
    })
    expect(fakeFn).toHaveBeenCalledOnce()
    expect(result.generatedCount).toBe(1)
    expect(result.distractorsBySourceItemRef.has('murah')).toBe(true)
  })

  it('maps parsed distractor set to the correct output shape', async () => {
    const fakeFn = vi.fn().mockResolvedValue(CANNED_VALID_RESPONSE)
    const result = await generateItemDistractors([ITEM_MURAH], [POOL_ITEM_MAHAL], {
      generateFn: fakeFn,
    })
    const set = result.distractorsBySourceItemRef.get('murah')
    expect(set).toBeDefined()
    expect(set!.recognition_distractors_nl).toEqual(['duur', 'gratis', 'betaalbaar'])
    expect(set!.cued_recall_distractors_id).toEqual(['mahal', 'murid', 'mudah'])
    expect(set!.cloze_distractors_id).toEqual(['mahal', 'besar', 'jauh'])
  })

  it('drops a distractor equal to the answer (cued_recall) and pads from pool', async () => {
    // LLM returned 'murah' (the ID answer) as a cued_recall distractor — the
    // exact failure mode from the first live publish. Must be filtered + padded.
    const badResponse = JSON.stringify([{
      source_item_ref: 'murah',
      recognition_distractors_nl: ['duur', 'gratis', 'betaalbaar'],
      cued_recall_distractors_id: ['murah', 'murid', 'mudah'], // 'murah' == answer
      cloze_distractors_id: ['mahal', 'besar', 'jauh'],
    }])
    const fakeFn = vi.fn().mockResolvedValue(badResponse)
    const result = await generateItemDistractors([ITEM_MURAH], [POOL_ITEM_MAHAL, POOL_ITEM_BELI], { generateFn: fakeFn })
    const set = result.distractorsBySourceItemRef.get('murah')!
    expect(set.cued_recall_distractors_id).toHaveLength(3)
    expect(set.cued_recall_distractors_id.map((s) => s.toLowerCase())).not.toContain('murah')
    // padded from the same-class pool (mahal) after dropping the answer
    expect(set.cued_recall_distractors_id).toContain('mahal')
  })

  it('dedupes intra-array duplicates and pads from pool', async () => {
    const dupResponse = JSON.stringify([{
      source_item_ref: 'murah',
      recognition_distractors_nl: ['duur', 'duur', 'gratis'], // dup 'duur'
      cued_recall_distractors_id: ['mahal', 'murid', 'mudah'],
      cloze_distractors_id: ['mahal', 'besar', 'jauh'],
    }])
    const fakeFn = vi.fn().mockResolvedValue(dupResponse)
    const result = await generateItemDistractors([ITEM_MURAH], [POOL_ITEM_MAHAL, POOL_ITEM_BELI], { generateFn: fakeFn })
    const rec = result.distractorsBySourceItemRef.get('murah')!.recognition_distractors_nl
    expect(rec).toHaveLength(3)
    expect(new Set(rec.map((s) => s.toLowerCase())).size).toBe(3) // no dups
    expect(rec).toContain('kopen') // padded with a pool NL translation (beli→kopen)
  })

  it('never emits the answer in any array (recognition NL or ID arrays)', async () => {
    const badResponse = JSON.stringify([{
      source_item_ref: 'murah',
      recognition_distractors_nl: ['goedkoop', 'gratis', 'betaalbaar'], // 'goedkoop' == NL answer
      cued_recall_distractors_id: ['murah', 'mahal', 'beli'], // 'murah' == ID answer
      cloze_distractors_id: ['murah', 'mahal', 'beli'],
    }])
    const fakeFn = vi.fn().mockResolvedValue(badResponse)
    const result = await generateItemDistractors([ITEM_MURAH], [POOL_ITEM_MAHAL, POOL_ITEM_BELI], { generateFn: fakeFn })
    const set = result.distractorsBySourceItemRef.get('murah')!
    expect(set.recognition_distractors_nl.map((s) => s.toLowerCase())).not.toContain('goedkoop')
    expect(set.cued_recall_distractors_id.map((s) => s.toLowerCase())).not.toContain('murah')
    expect(set.cloze_distractors_id.map((s) => s.toLowerCase())).not.toContain('murah')
  })

  it('pool too small: emits fewer than 3 but never the answer', async () => {
    const badResponse = JSON.stringify([{
      source_item_ref: 'murah',
      recognition_distractors_nl: ['goedkoop', 'goedkoop', 'goedkoop'], // all == NL answer
      cued_recall_distractors_id: ['mahal', 'murid', 'mudah'],
      cloze_distractors_id: ['mahal', 'besar', 'jauh'],
    }])
    const fakeFn = vi.fn().mockResolvedValue(badResponse)
    const result = await generateItemDistractors([ITEM_MURAH], [], { generateFn: fakeFn }) // empty pool → can't pad
    const rec = result.distractorsBySourceItemRef.get('murah')!.recognition_distractors_nl
    expect(rec.length).toBeLessThan(3) // all dropped, nothing to pad with
    expect(rec.map((s) => s.toLowerCase())).not.toContain('goedkoop')
  })

  it('counts skipped items when Claude omits an item from the response', async () => {
    // Two items supplied, but response only contains one
    const fakeFn = vi.fn().mockResolvedValue(CANNED_VALID_RESPONSE)
    const result = await generateItemDistractors(
      [ITEM_MURAH, ITEM_MAKAN],
      [POOL_ITEM_MAHAL],
      { generateFn: fakeFn },
    )
    expect(result.generatedCount).toBe(1)
    expect(result.skippedCount).toBe(1)
  })

  it('accumulates results across multiple batches', async () => {
    // Build 25 items (BATCH_SIZE=20 → 2 batches)
    const items: DistractorInputItem[] = Array.from({ length: 25 }, (_, i) => ({
      source_item_ref: `item_${i}`,
      item_type: 'word' as const,
      indonesian_text: `kata_${i}`,
      l1_translation: `woord_${i}`,
    }))

    // Each call returns a response for the items in that batch
    let callCount = 0
    const fakeFn = vi.fn().mockImplementation(async () => {
      const batchStart = callCount * 20
      const batchEnd = Math.min(batchStart + 20, 25)
      callCount++
      const sets = items.slice(batchStart, batchEnd).map((item) => ({
        source_item_ref: item.source_item_ref,
        recognition_distractors_nl: ['a', 'b', 'c'],
        cued_recall_distractors_id: ['x', 'y', 'z'],
        cloze_distractors_id: ['p', 'q', 'r'],
      }))
      return JSON.stringify(sets)
    })

    const result = await generateItemDistractors(items, [], { generateFn: fakeFn })

    expect(fakeFn).toHaveBeenCalledTimes(2) // 2 batches
    expect(result.generatedCount).toBe(25)
    expect(result.skippedCount).toBe(0)
    expect(result.distractorsBySourceItemRef.size).toBe(25)
  })

  it('passes both items and pool to the generateFn prompt', async () => {
    let capturedPrompt = ''
    const fakeFn = vi.fn().mockImplementation(async (prompt: string) => {
      capturedPrompt = prompt
      return CANNED_VALID_RESPONSE
    })

    await generateItemDistractors([ITEM_MURAH], [POOL_ITEM_MAHAL], {
      generateFn: fakeFn,
    })

    // Prompt should contain both item and pool data
    expect(capturedPrompt).toContain('murah')
    expect(capturedPrompt).toContain('mahal')
  })

  it('handles malformed generateFn response gracefully (empty result)', async () => {
    const fakeFn = vi.fn().mockResolvedValue('not json')
    const result = await generateItemDistractors([ITEM_MURAH], [], {
      generateFn: fakeFn,
    })
    expect(result.generatedCount).toBe(0)
    expect(result.skippedCount).toBe(1) // item was sent but not returned
  })

  it('no-op returns empty Map (not undefined)', async () => {
    const result = await generateItemDistractors([ITEM_MURAH], [])
    expect(result.distractorsBySourceItemRef).toBeInstanceOf(Map)
    expect(result.distractorsBySourceItemRef.size).toBe(0)
  })
})
