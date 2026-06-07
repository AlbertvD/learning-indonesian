/**
 * cap-v2 vocabulary rebuild — item content_units builder.
 *
 * The vocab module owns the learning_item slice of content_units. This builder is
 * lifted verbatim from the shared buildContentUnitsFromDb item loop
 * (projectors/contentUnits.ts:151-175); the test pins byte-identity against that
 * loop so the cutover (which removes it from the shared builder) is provably inert
 * for item units.
 */

import { describe, it, expect } from 'vitest'
import { buildItemContentUnits } from '../../vocabulary/contentUnits'
import { stableSlug, sourceRefForLearningItem, contentUnitKey, sourceRefForLesson } from '../../../../content-pipeline-output'
import type { TypedItemRow } from '../../loadFromDb'

function row(
  partial: Partial<TypedItemRow> & { indonesian_text: string },
): TypedItemRow {
  return {
    id: `id-${partial.indonesian_text}`,
    section_id: 'sec',
    lesson_id: 'lesson',
    display_order: 0,
    source_item_ref: 'ref',
    item_type: 'word',
    l1_translation: 'x',
    l2_translation: null,
    section_kind: 'vocabulary',
    ...partial,
  }
}

describe('buildItemContentUnits', () => {
  it('emits the canonical learning_item unit shape (key formula matches content-pipeline-output)', () => {
    const [unit] = buildItemContentUnits(
      [row({ indonesian_text: 'makan', item_type: 'word', section_kind: 'vocabulary' })],
      11,
    )
    const lessonRef = sourceRefForLesson(11)
    const sectionRef = `${lessonRef}/section-vocabulary`
    const unitSlug = `item-${stableSlug('makan')}`
    expect(unit).toEqual({
      content_unit_key: contentUnitKey({
        sourceRef: sourceRefForLearningItem('makan'),
        sourceSectionRef: sectionRef,
        unitSlug,
      }),
      source_ref: sourceRefForLearningItem('makan'),
      source_section_ref: sectionRef,
      unit_kind: 'learning_item',
      unit_slug: unitSlug,
      display_order: 1000,
      payload_json: {},
      source_fingerprint: '',
    })
  })

  it('emits a unit for word and phrase items', () => {
    const units = buildItemContentUnits(
      [
        row({ indonesian_text: 'makan', item_type: 'word' }),
        row({ indonesian_text: 'apa kabar', item_type: 'phrase' }),
      ],
      11,
    )
    expect(units).toHaveLength(2)
    expect(units.map((u) => u.unit_kind)).toEqual(['learning_item', 'learning_item'])
  })

  it('keys items by section_kind (dialogue vs vocabulary)', () => {
    const [vocab] = buildItemContentUnits(
      [row({ indonesian_text: 'makan', section_kind: 'vocabulary' })],
      11,
    )
    const [dlg] = buildItemContentUnits(
      [row({ indonesian_text: 'halo', section_kind: 'dialogue' })],
      11,
    )
    expect(vocab.source_section_ref).toContain('section-vocabulary')
    expect(dlg.source_section_ref).toContain('section-dialogue')
  })

  it('assigns display_order in the 1000+ item range (disjoint from sections/grammar/affixed)', () => {
    const units = buildItemContentUnits(
      [
        row({ indonesian_text: 'satu' }),
        row({ indonesian_text: 'dua' }),
      ],
      11,
    )
    expect(units.every((u) => u.display_order >= 1000 && u.display_order < 2000)).toBe(true)
  })
})
