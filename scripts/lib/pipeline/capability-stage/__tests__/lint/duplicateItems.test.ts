import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import { pathToFileURL } from 'url'
import { findDuplicateItems, type LessonItemsInput } from '../../lint/duplicateItems'

describe('findDuplicateItems', () => {
  it('returns no findings for clean staging', () => {
    const lessons: LessonItemsInput[] = [
      { lesson: 1, items: [{ base_text: 'satu' }, { base_text: 'dua' }] },
      { lesson: 2, items: [{ base_text: 'tiga' }, { base_text: 'empat' }] },
    ]
    expect(findDuplicateItems(lessons)).toEqual([])
  })

  it('flags within-lesson duplicates as CRITICAL', () => {
    const lessons: LessonItemsInput[] = [
      { lesson: 4, items: [{ base_text: 'kamar mandi' }, { base_text: 'kamar mandi' }] },
    ]
    const findings = findDuplicateItems(lessons)
    expect(findings).toHaveLength(1)
    expect(findings[0]).toMatchObject({
      severity: 'CRITICAL',
      rule: 'duplicate-item-within-lesson',
      lesson: 4,
      base_text: 'kamar mandi',
    })
    expect(findings[0].detail).toContain('declared 2 times in lesson-4')
  })

  it('counts a 3x within-lesson duplicate accurately', () => {
    const lessons: LessonItemsInput[] = [
      { lesson: 9, items: [
        { base_text: 'kaki' }, { base_text: 'kaki' }, { base_text: 'kaki' },
      ] },
    ]
    const findings = findDuplicateItems(lessons)
    expect(findings).toHaveLength(1)
    expect(findings[0].detail).toContain('declared 3 times in lesson-9')
  })

  it('flags cross-lesson duplicates with one finding per affected lesson', () => {
    const lessons: LessonItemsInput[] = [
      { lesson: 2, items: [{ base_text: 'ada' }] },
      { lesson: 3, items: [{ base_text: 'ada' }] },
    ]
    const findings = findDuplicateItems(lessons)
    expect(findings).toHaveLength(2)
    expect(findings.map(f => f.lesson)).toEqual([2, 3])
    for (const f of findings) {
      expect(f.severity).toBe('CRITICAL')
      expect(f.rule).toBe('duplicate-item-cross-lesson')
      expect(f.base_text).toBe('ada')
      expect(f.detail).toContain('keep in lesson-2')
    }
  })

  it('names the lowest-order lesson as the keeper when 3+ lessons collide', () => {
    const lessons: LessonItemsInput[] = [
      { lesson: 6, items: [{ base_text: 'warna' }] },
      { lesson: 3, items: [{ base_text: 'warna' }] },
      { lesson: 7, items: [{ base_text: 'warna' }] },
    ]
    const findings = findDuplicateItems(lessons)
    expect(findings).toHaveLength(3)
    for (const f of findings) {
      expect(f.detail).toContain('declared in multiple lessons: 3, 6, 7')
      expect(f.detail).toContain('keep in lesson-3')
    }
  })

  it('emits both within- and cross-lesson findings when both apply', () => {
    const lessons: LessonItemsInput[] = [
      { lesson: 1, items: [{ base_text: 'sepuluh' }] },
      { lesson: 3, items: [{ base_text: 'sepuluh' }, { base_text: 'sepuluh' }] },
    ]
    const rules = findDuplicateItems(lessons).map(f => f.rule).sort()
    expect(rules).toContain('duplicate-item-within-lesson')
    expect(rules.filter(r => r === 'duplicate-item-cross-lesson')).toHaveLength(2)
  })

  it('normalises case + surrounding whitespace before comparing', () => {
    const lessons: LessonItemsInput[] = [
      { lesson: 1, items: [{ base_text: 'Saya' }, { base_text: '  saya' }] },
    ]
    const findings = findDuplicateItems(lessons)
    expect(findings).toHaveLength(1)
    expect(findings[0].rule).toBe('duplicate-item-within-lesson')
  })

  it('ignores items whose base_text is missing or empty (other validators catch those)', () => {
    const lessons: LessonItemsInput[] = [
      { lesson: 1, items: [{ base_text: '' }, { base_text: '   ' }, { base_text: undefined }] },
    ]
    expect(findDuplicateItems(lessons)).toEqual([])
  })

  // Real-world smoke test: load today's lesson-2 + lesson-3 staging and
  // confirm the rule surfaces 'ada' as a cross-lesson finding. This is the
  // canary that proves the rule will fire on the actual reconciliation gap
  // PR-2 reconciles. Skipped if the staging file path doesn't exist (e.g.
  // running from a worktree that hasn't been initialised).
  it('surfaces the live "ada" cross-lesson duplicate from lessons 2 + 3', async () => {
    const repoRoot = path.resolve(__dirname, '../../../../../..')
    const items2Path = path.join(repoRoot, 'scripts/data/staging/lesson-2/learning-items.ts')
    const items3Path = path.join(repoRoot, 'scripts/data/staging/lesson-3/learning-items.ts')
    if (!fs.existsSync(items2Path) || !fs.existsSync(items3Path)) return
    const items2 = (await import(pathToFileURL(items2Path).href)).learningItems as Array<{ base_text: string }>
    const items3 = (await import(pathToFileURL(items3Path).href)).learningItems as Array<{ base_text: string }>
    // Once PR-2's reconciliation lands, 'ada' will only exist in lesson 2.
    // Synthesize the pre-reconciliation state by injecting 'ada' into both
    // lesson lists so this canary keeps testing what it claims to test.
    const synth2 = items2.some(i => i.base_text === 'ada') ? items2 : [...items2, { base_text: 'ada' }]
    const synth3 = items3.some(i => i.base_text === 'ada') ? items3 : [...items3, { base_text: 'ada' }]
    const findings = findDuplicateItems([
      { lesson: 2, items: synth2 },
      { lesson: 3, items: synth3 },
    ])
    const adaCross = findings.filter(f => f.base_text === 'ada' && f.rule === 'duplicate-item-cross-lesson')
    expect(adaCross.map(f => f.lesson).sort()).toEqual([2, 3])
  })
})
