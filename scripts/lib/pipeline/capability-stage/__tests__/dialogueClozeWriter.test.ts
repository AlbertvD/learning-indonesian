/**
 * dialogueClozeWriter.test.ts — Slice 3 Task 5: replaceDialogueClozes persists
 * the R3 bilingual translation legs (data-arch m-1).
 *
 * Captures the insert payload via a mock Supabase client to assert
 * translation_nl / translation_en are written (DB→DB path) and default to null
 * when omitted (legacy staging path stays valid).
 */

import { describe, it, expect } from 'vitest'
import { replaceDialogueClozes, type DialogueClozeInput } from '../adapter'

function buildWriterMock(captured: { rows?: Array<Record<string, unknown>> }) {
  return {
    schema: () => ({
      from: (table: string) => {
        if (table === 'lesson_dialogue_lines') {
          return {
            select: () => ({
              in: () => ({
                then: (resolve: (v: { data: unknown[]; error: null }) => unknown) =>
                  resolve({
                    data: [{ id: 'line-uuid-1', source_line_ref: 'lesson-5/section-3/line-0' }],
                    error: null,
                  }),
              }),
            }),
          }
        }
        // dialogue_clozes
        return {
          delete: () => ({
            in: () => ({
              then: (resolve: (v: { error: null }) => unknown) => resolve({ error: null }),
            }),
          }),
          insert: (rows: Array<Record<string, unknown>>) => {
            captured.rows = rows
            return { then: (resolve: (v: { error: null }) => unknown) => resolve({ error: null }) }
          },
        }
      },
    }),
  }
}

const baseInput: DialogueClozeInput = {
  capability_id: 'cap-1',
  source_line_ref: 'lesson-5/section-3/line-0',
  sentence_with_blank: 'Saya jatuh dari ___.',
  answer_text: 'pohon',
  translation_text: 'Ik val uit de boom.',
}

describe('replaceDialogueClozes — R3 translation persistence', () => {
  it('persists translation_nl and translation_en when supplied (DB→DB path)', async () => {
    const captured: { rows?: Array<Record<string, unknown>> } = {}
    const n = await replaceDialogueClozes(buildWriterMock(captured) as never, [
      { ...baseInput, translation_nl: 'Ik val uit de boom.', translation_en: 'I fall from the tree.' },
    ])
    expect(n).toBe(1)
    expect(captured.rows).toHaveLength(1)
    expect(captured.rows![0]).toMatchObject({
      translation_text: 'Ik val uit de boom.',
      translation_nl: 'Ik val uit de boom.',
      translation_en: 'I fall from the tree.',
    })
  })

  it('defaults translation_nl/en to null when omitted (legacy staging path)', async () => {
    const captured: { rows?: Array<Record<string, unknown>> } = {}
    await replaceDialogueClozes(buildWriterMock(captured) as never, [baseInput])
    expect(captured.rows![0].translation_nl).toBeNull()
    expect(captured.rows![0].translation_en).toBeNull()
  })
})
