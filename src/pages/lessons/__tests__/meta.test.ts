// Parity guard for src/pages/lessons/meta.ts.
//
// meta.ts is a hand-maintained lightweight mirror of each lesson's
// content.json `meta` block (id / orderIndex / title / level / description).
// It exists so the Lessons list / LessonRouter / LocalPreview routes don't
// have to statically import all 30 content.json files (~1.5MB) just to read
// their meta (2026-07-11 prod-ready audit, HIGH bundle finding).
//
// The dynamic imports below run at TEST TIME ONLY — vitest resolves them
// directly, they are never referenced by application code, so they do not
// end up in the Vite production bundle. This test's only job is to fail the
// moment meta.ts drifts from the 30 source content.json files.

import { describe, expect, it } from 'vitest'
import { bespokeLessonMetas } from '../meta'

const LESSON_COUNT = 30

describe('bespokeLessonMetas parity with content.json', () => {
  it('has exactly one entry per lesson, in lesson-N order', () => {
    expect(bespokeLessonMetas).toHaveLength(LESSON_COUNT)
  })

  for (let n = 1; n <= LESSON_COUNT; n++) {
    it(`lesson-${n} meta matches content.json`, async () => {
      const { meta } = (await import(`../lesson-${n}/content.json`)) as {
        meta: {
          id: string
          order_index: number
          title: string
          level: string
          description: string | null
        }
      }

      const entry = bespokeLessonMetas[n - 1]
      expect(entry, `meta.ts is missing an entry at position ${n - 1} for lesson-${n}`).toBeDefined()
      expect(entry.id).toBe(meta.id)
      expect(entry.orderIndex).toBe(meta.order_index)
      expect(entry.title).toBe(meta.title)
      expect(entry.level).toBe(meta.level)
      expect(entry.description).toBe(meta.description ?? null)
    })
  }
})
