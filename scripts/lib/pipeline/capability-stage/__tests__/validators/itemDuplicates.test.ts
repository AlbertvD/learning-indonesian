import { describe, it, expect, vi } from 'vitest'
import { validateItemDuplicates } from '../../validators/itemDuplicates'
import type { ItemDuplicatesInput } from '../../validators/itemDuplicates'

function makeSupabaseMock(rows: Array<{ normalized_text: string; lesson_id: string }>) {
  const query = {
    schema: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    not: vi.fn().mockResolvedValue({ data: rows, error: null }),
  }
  return query as any
}

function makeErrorMock(message: string) {
  const query = {
    schema: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    not: vi.fn().mockResolvedValue({ data: null, error: { message } }),
  }
  return query as any
}

describe('validateItemDuplicates (CS17)', () => {
  it('returns empty findings for an empty writtenNormalizedTexts list', async () => {
    const supabase = makeSupabaseMock([])
    const input: ItemDuplicatesInput = {
      lessonId: 'lesson-uuid-1',
      lessonNumber: 1,
      writtenNormalizedTexts: [],
    }
    const findings = await validateItemDuplicates(supabase, input)
    expect(findings).toEqual([])
  })

  it('returns empty findings when all items belong to this lesson', async () => {
    const supabase = makeSupabaseMock([
      { normalized_text: 'makan', lesson_id: 'lesson-uuid-1' },
      { normalized_text: 'minum', lesson_id: 'lesson-uuid-1' },
    ])
    const input: ItemDuplicatesInput = {
      lessonId: 'lesson-uuid-1',
      lessonNumber: 1,
      writtenNormalizedTexts: ['makan', 'minum'],
    }
    const findings = await validateItemDuplicates(supabase, input)
    expect(findings).toEqual([])
  })

  it('emits CS17 error when an item belongs to a different lesson', async () => {
    // 'makan' was first written by lesson-uuid-0 (a prior lesson)
    const supabase = makeSupabaseMock([
      { normalized_text: 'makan', lesson_id: 'lesson-uuid-0' },
    ])
    const input: ItemDuplicatesInput = {
      lessonId: 'lesson-uuid-1',
      lessonNumber: 2,
      writtenNormalizedTexts: ['makan'],
    }
    const findings = await validateItemDuplicates(supabase, input)
    expect(findings).toHaveLength(1)
    expect(findings[0].gate).toBe('CS17')
    expect(findings[0].severity).toBe('error')
    expect(findings[0].message).toContain('makan')
    expect(findings[0].message).toContain('lesson 2')
    expect(findings[0].message).toContain('different lesson')
  })

  it('includes context.itemSlug in duplicate findings', async () => {
    const supabase = makeSupabaseMock([
      { normalized_text: 'makan', lesson_id: 'lesson-uuid-0' },
    ])
    const input: ItemDuplicatesInput = {
      lessonId: 'lesson-uuid-1',
      lessonNumber: 2,
      writtenNormalizedTexts: ['makan'],
    }
    const findings = await validateItemDuplicates(supabase, input)
    expect(findings[0].context?.itemSlug).toBe('makan')
  })

  it('emits one finding per cross-lesson duplicate item', async () => {
    const supabase = makeSupabaseMock([
      { normalized_text: 'makan', lesson_id: 'lesson-uuid-0' },
      { normalized_text: 'rumah', lesson_id: 'lesson-uuid-0' },
      { normalized_text: 'cepat', lesson_id: 'lesson-uuid-1' }, // this lesson — ok
    ])
    const input: ItemDuplicatesInput = {
      lessonId: 'lesson-uuid-1',
      lessonNumber: 2,
      writtenNormalizedTexts: ['makan', 'rumah', 'cepat'],
    }
    const findings = await validateItemDuplicates(supabase, input)
    expect(findings).toHaveLength(2) // only makan and rumah are cross-lesson
    expect(findings.map(f => f.context?.itemSlug)).toContain('makan')
    expect(findings.map(f => f.context?.itemSlug)).toContain('rumah')
  })

  it('emits a CS17 warning (non-fatal) when the DB query fails', async () => {
    const supabase = makeErrorMock('connection refused')
    const input: ItemDuplicatesInput = {
      lessonId: 'lesson-uuid-1',
      lessonNumber: 1,
      writtenNormalizedTexts: ['makan'],
    }
    const findings = await validateItemDuplicates(supabase, input)
    expect(findings).toHaveLength(1)
    expect(findings[0].gate).toBe('CS17')
    expect(findings[0].severity).toBe('warning')
    expect(findings[0].message).toContain('connection refused')
    expect(findings[0].message).toContain('Cross-lesson duplicate detection skipped')
  })
})
