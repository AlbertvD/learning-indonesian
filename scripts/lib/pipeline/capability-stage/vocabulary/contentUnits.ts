/**
 * vocabulary/contentUnits.ts — the item slice of content_units (DB-native).
 *
 * The vocab module owns learning_item content units. This builder is lifted
 * verbatim from the shared `buildContentUnitsFromDb` item loop
 * (projectors/contentUnits.ts:151-175) as part of the cap-v2 rebuild: the runner
 * loses item-unit emission, the vocab module gains it. The item units carry a
 * disjoint `content_unit_key` set AND a disjoint `display_order` range (1000+)
 * from the runner's section (0–N) / grammar (2000+) / affixed (3000+) units, so
 * the two builders write the one `content_units` table idempotently with zero
 * collision and a globally-consistent ordering (CONTEXT.md "separation stops at
 * the shared capability table").
 *
 * No disk I/O — the key formula lives in content-pipeline-output.ts (one home,
 * byte-identical to the shared builder).
 */

import {
  stableSlug,
  sourceRefForLearningItem,
  contentUnitKey,
  sourceRefForLesson,
  type StagingContentUnit,
} from '../../../content-pipeline-output'

import type { TypedItemRow } from '../loadFromDb'

/**
 * Build the `learning_item` content units for one lesson's typed item rows.
 *
 * Output is sorted by display_order then unit_slug, matching the shared builder's
 * final sort for the item subset.
 */
export function buildItemContentUnits(
  itemRows: TypedItemRow[],
  lessonNumber: number,
): StagingContentUnit[] {
  const lessonSourceRef = sourceRefForLesson(lessonNumber)
  const units: StagingContentUnit[] = []

  let itemIndex = 0
  for (const row of itemRows) {
    if (row.item_type !== 'word' && row.item_type !== 'phrase') continue

    const slug = stableSlug(row.indonesian_text)
    const isDialogue = row.section_kind === 'dialogue'
    const sourceSectionRef = `${lessonSourceRef}/section-${isDialogue ? 'dialogue' : 'vocabulary'}`

    units.push({
      content_unit_key: contentUnitKey({
        sourceRef: sourceRefForLearningItem(row.indonesian_text),
        sourceSectionRef,
        unitSlug: `item-${slug}`,
      }),
      source_ref: sourceRefForLearningItem(row.indonesian_text),
      source_section_ref: sourceSectionRef,
      unit_kind: 'learning_item',
      unit_slug: `item-${slug}`,
      display_order: 1000 + itemIndex,
      payload_json: {},
      source_fingerprint: '',
    })
    itemIndex++
  }

  return units.sort(
    (a, b) => a.display_order - b.display_order || a.unit_slug.localeCompare(b.unit_slug),
  )
}
