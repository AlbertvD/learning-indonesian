import { describe, it, expect, vi } from 'vitest'
import { validateItemDuplicates } from '../../validators/itemDuplicates'
import type { ItemDuplicatesInput } from '../../validators/itemDuplicates'

/**
 * Mock shape mirrors the actual DB query in validateItemDuplicates:
 *   .schema('indonesian').from('learning_capabilities')
 *   .select('source_ref, lesson_id')
 *   .eq('source_kind', 'vocabulary_src')
 *   .in('source_ref', sourceRefs)
 *   .not('lesson_id', 'is', null)
 *
 * source_ref = 'learning_items/<normalized_text>'
 */
function makeSupabaseMock(rows: Array<{ source_ref: string; lesson_id: string }>) {
  const query = {
    schema: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
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
    eq: vi.fn().mockReturnThis(),
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

  it('returns empty findings when all item caps belong to this lesson', async () => {
    const supabase = makeSupabaseMock([
      { source_ref: 'learning_items/makan', lesson_id: 'lesson-uuid-1' },
      { source_ref: 'learning_items/minum', lesson_id: 'lesson-uuid-1' },
    ])
    const input: ItemDuplicatesInput = {
      lessonId: 'lesson-uuid-1',
      lessonNumber: 1,
      writtenNormalizedTexts: ['makan', 'minum'],
    }
    const findings = await validateItemDuplicates(supabase, input)
    expect(findings).toEqual([])
  })

  it('emits a CS17 WARNING (not error) when a cap is owned by an earlier lesson (legitimate reuse)', async () => {
    // 'makan' capability is owned by lesson-uuid-0 (a prior lesson). Under
    // global item dedup this is legitimate reuse, not a publish-blocking error.
    const supabase = makeSupabaseMock([
      { source_ref: 'learning_items/makan', lesson_id: 'lesson-uuid-0' },
    ])
    const input: ItemDuplicatesInput = {
      lessonId: 'lesson-uuid-1',
      lessonNumber: 2,
      writtenNormalizedTexts: ['makan'],
    }
    const findings = await validateItemDuplicates(supabase, input)
    expect(findings).toHaveLength(1)
    expect(findings[0].gate).toBe('CS17')
    expect(findings[0].severity).toBe('warning') // informational, never blocks publish
    expect(findings[0].message).toContain('makan')
    expect(findings[0].message).toContain('lesson 2')
    expect(findings[0].message).toContain('owned by an earlier lesson')
  })

  it('includes context.itemSlug in duplicate findings', async () => {
    const supabase = makeSupabaseMock([
      { source_ref: 'learning_items/makan', lesson_id: 'lesson-uuid-0' },
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
      { source_ref: 'learning_items/makan', lesson_id: 'lesson-uuid-0' },
      { source_ref: 'learning_items/rumah', lesson_id: 'lesson-uuid-0' },
      { source_ref: 'learning_items/cepat', lesson_id: 'lesson-uuid-1' }, // this lesson — ok
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

  it('queries learning_capabilities (not learning_items) — verified via mock from() call', async () => {
    const supabase = makeSupabaseMock([])
    const input: ItemDuplicatesInput = {
      lessonId: 'lesson-uuid-1',
      lessonNumber: 1,
      writtenNormalizedTexts: ['makan'],
    }
    await validateItemDuplicates(supabase, input)
    // The from() call must target learning_capabilities, not learning_items
    expect(supabase.from).toHaveBeenCalledWith('learning_capabilities')
  })

  it('builds source_refs as learning_items/<normalized_text> for the IN query', async () => {
    const supabase = makeSupabaseMock([])
    const input: ItemDuplicatesInput = {
      lessonId: 'lesson-uuid-1',
      lessonNumber: 1,
      writtenNormalizedTexts: ['makan', 'minum'],
    }
    await validateItemDuplicates(supabase, input)
    // The .in() call should receive source_refs, not plain normalized_texts
    expect(supabase.in).toHaveBeenCalledWith('source_ref', [
      'learning_items/makan',
      'learning_items/minum',
    ])
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
