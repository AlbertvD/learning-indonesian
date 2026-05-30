import { describe, it, expect } from 'vitest'
import { validateItemDistractors } from '../../validators/itemDistractors'
import type { DistractorSetRow, ValidateItemDistractorsInput } from '../../validators/itemDistractors'

const POOL = new Set(['beli', 'jual', 'makan', 'minum', 'pergi', 'pulang', 'besar', 'kecil', 'cepat', 'lambat'])

function makeSet(overrides: Partial<DistractorSetRow> = {}): DistractorSetRow {
  return {
    capabilityKey: 'item:1:beli:word',
    answerText: 'beli',
    arrayName: 'recognition_distractors_nl',
    distractors: ['kopen', 'verkopen', 'betalen'],
    isIndonesian: false,
    ...overrides,
  }
}

function makeInput(sets: DistractorSetRow[], pool = POOL): ValidateItemDistractorsInput {
  return { sets, poolNormalizedTexts: pool }
}

describe('validateItemDistractors (CS16)', () => {
  it('passes an empty set list', () => {
    expect(validateItemDistractors(makeInput([]))).toEqual([])
  })

  it('passes a well-formed Dutch recognition set', () => {
    const findings = validateItemDistractors(makeInput([makeSet()]))
    expect(findings).toEqual([])
  })

  it('passes a well-formed Indonesian cued_recall set', () => {
    const sets: DistractorSetRow[] = [{
      capabilityKey: 'item:1:beli:word',
      answerText: 'beli',
      arrayName: 'cued_recall_distractors_id',
      distractors: ['jual', 'makan', 'minum'],
      isIndonesian: true,
    }]
    const findings = validateItemDistractors(makeInput(sets))
    expect(findings).toEqual([])
  })

  // Rule 1: array length must be exactly 3
  it('emits CS16 error when distractor array has wrong length (too few)', () => {
    const findings = validateItemDistractors(makeInput([makeSet({ distractors: ['kopen', 'verkopen'] })]))
    expect(findings).toHaveLength(1)
    expect(findings[0].gate).toBe('CS16')
    expect(findings[0].severity).toBe('error')
    expect(findings[0].message).toMatch(/expected exactly 3/)
  })

  it('emits CS16 error when distractor array has wrong length (too many)', () => {
    const findings = validateItemDistractors(makeInput([makeSet({ distractors: ['a', 'b', 'c', 'd'] })]))
    expect(findings).toHaveLength(1)
    expect(findings[0].severity).toBe('error')
  })

  // Rule 2: distractor must not equal the answer
  it('emits CS16 error when distractor equals the answer', () => {
    const findings = validateItemDistractors(makeInput([makeSet({ distractors: ['beli', 'verkopen', 'betalen'] })]))
    const errFindings = findings.filter(f => f.severity === 'error' && f.message.includes('equals the answer'))
    expect(errFindings).toHaveLength(1)
    expect(errFindings[0].gate).toBe('CS16')
  })

  // Rule 3: no intra-array duplicates
  it('emits CS16 warning when distractor array contains a duplicate', () => {
    const findings = validateItemDistractors(makeInput([makeSet({ distractors: ['kopen', 'kopen', 'betalen'] })]))
    const dupFindings = findings.filter(f => f.severity === 'warning' && f.message.includes('duplicate'))
    expect(dupFindings).toHaveLength(1)
    expect(dupFindings[0].gate).toBe('CS16')
  })

  it('treats duplicates case-insensitively', () => {
    const findings = validateItemDistractors(makeInput([makeSet({ distractors: ['Kopen', 'kopen', 'betalen'] })]))
    const dupFindings = findings.filter(f => f.message.includes('duplicate'))
    expect(dupFindings).toHaveLength(1)
  })

  // Rule 4: Indonesian distractors must be in pool
  it('emits CS16 warning when Indonesian distractor not in pool', () => {
    const sets: DistractorSetRow[] = [{
      capabilityKey: 'item:1:beli:word',
      answerText: 'beli',
      arrayName: 'cued_recall_distractors_id',
      distractors: ['jual', 'makan', 'nonexistentword'],
      isIndonesian: true,
    }]
    const findings = validateItemDistractors(makeInput(sets))
    const poolFindings = findings.filter(f => f.message.includes('not found in the learning_items pool'))
    expect(poolFindings).toHaveLength(1)
    expect(poolFindings[0].severity).toBe('warning')
    expect(poolFindings[0].gate).toBe('CS16')
  })

  it('does NOT check pool membership for Dutch (non-Indonesian) distractors', () => {
    // Dutch distractors are not in the Indonesian pool, but isIndonesian=false so no warning
    const findings = validateItemDistractors(makeInput([makeSet({ isIndonesian: false })]))
    const poolFindings = findings.filter(f => f.message.includes('not found in the learning_items pool'))
    expect(poolFindings).toHaveLength(0)
  })

  // Rule 5: no morphological variant of answer in cued_recall / cloze
  it('emits CS16 warning for morphological variant of answer in cued_recall array', () => {
    // 'membeli' shares root 'beli' with the answer 'beli'
    const sets: DistractorSetRow[] = [{
      capabilityKey: 'item:1:beli:word',
      answerText: 'beli',
      arrayName: 'cued_recall_distractors_id',
      distractors: ['membeli', 'jual', 'makan'],
      isIndonesian: true,
    }]
    const findings = validateItemDistractors(makeInput(sets))
    const morphFindings = findings.filter(f => f.message.includes('morphological variant'))
    expect(morphFindings).toHaveLength(1)
    expect(morphFindings[0].gate).toBe('CS16')
    expect(morphFindings[0].severity).toBe('warning')
    expect(morphFindings[0].message).toContain('membeli')
    expect(morphFindings[0].message).toContain('beli')
  })

  it('emits CS16 warning for morphological variant in cloze array', () => {
    // 'dibeli' shares root 'beli' with answer 'beli'
    const sets: DistractorSetRow[] = [{
      capabilityKey: 'item:1:beli:word',
      answerText: 'beli',
      arrayName: 'cloze_distractors_id',
      distractors: ['dibeli', 'jual', 'makan'],
      isIndonesian: true,
    }]
    const findings = validateItemDistractors(makeInput(sets, new Set(['beli', 'jual', 'makan', 'dibeli'])))
    const morphFindings = findings.filter(f => f.message.includes('morphological variant'))
    expect(morphFindings).toHaveLength(1)
  })

  it('does NOT flag morphological variants in Dutch recognition array', () => {
    // morphological variant rule only applies to Indonesian cued_recall/cloze
    const sets: DistractorSetRow[] = [{
      capabilityKey: 'item:1:beli:word',
      answerText: 'beli',
      arrayName: 'recognition_distractors_nl',
      distractors: ['kopen', 'verkopen', 'betalen'],
      isIndonesian: false,
    }]
    const findings = validateItemDistractors(makeInput(sets))
    const morphFindings = findings.filter(f => f.message.includes('morphological variant'))
    expect(morphFindings).toHaveLength(0)
  })

  it('includes context.capabilityKey in findings', () => {
    const findings = validateItemDistractors(makeInput([makeSet({ distractors: ['beli', 'kopen', 'betalen'] })]))
    expect(findings[0].context?.capabilityKey).toBe('item:1:beli:word')
  })

  it('continues checking other fields after detecting wrong-length array', () => {
    // Wrong-length: skips per-item checks (continues to next set)
    const sets: DistractorSetRow[] = [
      makeSet({ distractors: ['a', 'b'] }),
      makeSet({ distractors: ['c', 'c', 'd'] }), // duplicate in second set
    ]
    const findings = validateItemDistractors(makeInput(sets))
    const errFindings = findings.filter(f => f.severity === 'error' && f.message.includes('expected exactly 3'))
    expect(errFindings).toHaveLength(1) // only the first set triggers length error
    const dupFindings = findings.filter(f => f.message.includes('duplicate'))
    expect(dupFindings).toHaveLength(1) // second set's duplicate still found
  })
})
