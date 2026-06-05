/**
 * projectors/contentUnits.ts — DB-driven content_units builder (identity-only).
 *
 * Produces `StagingContentUnit`-shaped rows from DB-loaded inputs, replacing
 * `buildContentUnitsFromStaging` (`content-pipeline-output.ts:217`).
 *
 * IDENTITY CONSTRAINT (Slice 5a / INERTNESS):
 *   The six identity fields (content_unit_key, unit_slug, source_ref,
 *   source_section_ref, unit_kind, display_order) MUST be byte-identical to
 *   `buildContentUnitsFromStaging`'s output for equivalent word/phrase items,
 *   lesson sections, and affixed pairs. A later parity gate (5b) asserts
 *   set-equality against the staging builder.
 *
 * INTENTIONAL DIVERGENCES from staging builder:
 *   (a) Inputs come from DB shapes, not staging file shapes.
 *   (b) sentence / dialogue_chunk item_type rows are excluded — they are being
 *       dropped in 5b; their absence is the expected parity delta.
 *   (c) payload_json is always {} — Decision E retires this column (it is
 *       unread; the column drop is deferred to a later migration). The staging
 *       builder populated payload_json with title/baseText/etc.
 *   (d) Grammar units are keyed from PatternPlan output (NOT re-derived from
 *       category titles). The pattern path's collision tie-break and
 *       normalizeLessonSourceRef wrap are applied by projectPatternsFromCategories;
 *       this builder consumes the final .slug / .sourceRef verbatim so that
 *       content_unit.source_ref == capability.source_ref by construction.
 *       This is the Decision E amendment (2026-06-04, data-architect-validated):
 *       an intended re-key (curated-slug → pattern-path l{N}-… slug); the old
 *       curated-slug grammar units are swept in 5b.10.
 *
 * Key-formula parity with staging builder
 * (content-pipeline-output.ts:103-314):
 *   - contentUnitKey   = `{sourceRef}::{sourceSectionRef}::{unitSlug}`
 *   - section slug     = `section-{orderIndex}-{stableSlug(title || content.type)}`
 *   - item source_ref  = `learning_items/{itemSlug(indonesian_text)}`
 *   - item unit_slug   = `item-{stableSlug(indonesian_text)}`
 *   - item section_ref = `{lessonRef}/section-{dialogue|vocabulary}` (section_kind)
 *   - grammar slug     = `pattern-${plan.slug}` (plan from projectPatternsFromCategories)
 *   - grammar ref      = plan.sourceRef (== capability.source_ref, collision-disambiguated)
 *   - affixed slug     = `morphology-{stableSlug(lastSegment(source_ref))}` where
 *                        lastSegment = the part after `/morphology/`
 *
 * Exported: `buildContentUnitsFromDb`, `ContentUnitsDbInput`
 * No disk I/O — no fs import, no staging-file reads.
 */

import {
  stableSlug,
  sourceRefForLearningItem,
  contentUnitKey,
  sourceRefForLesson,
  type StagingContentUnit,
} from '../../../content-pipeline-output'

import type { LoadedLessonSection } from '../loader'
import type { TypedItemRow, TypedAffixedPair } from '../loadFromDb'
import type { PatternPlan } from './grammar'

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

// contentUnitKey + sourceRefForLesson are imported from content-pipeline-output.ts
// (one home for the key formula — byte-identity with the staging builder).

/**
 * Derive the slug segment for an affixed pair from its source_ref.
 *
 * The source_ref format is `lesson-{N}/morphology/{rawSegment}` where
 * rawSegment was written by `affixedFormPairSourceRef` (content-pipeline-output.ts:148)
 * as `stableSlug(\`${pair.root}-${pair.derived}\`)` or preserved from the
 * staging `pair.sourceRef`.
 *
 * The staging builder's slug formula was:
 *   `stableSlug(pair.id || \`${pair.root}-${pair.derived}\`)`
 *
 * For staging files, `pair.id` was the hand-authored key (e.g. "meN-baca-membaca"),
 * and `pair.sourceRef` stored the full `lesson-{N}/morphology/{id}` path.
 * `stableSlug("meN-baca-membaca") === stableSlug(lastSegment)` because both
 * lowercase+hyphenate the same characters — so extracting the last segment and
 * re-applying stableSlug reproduces the same slug.
 */
function slugFromAffixedSourceRef(sourceRef: string): string {
  const morphologyMarker = '/morphology/'
  const idx = sourceRef.indexOf(morphologyMarker)
  if (idx === -1) {
    // Fallback: stableSlug the entire source_ref
    return stableSlug(sourceRef)
  }
  return stableSlug(sourceRef.slice(idx + morphologyMarker.length))
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface ContentUnitsDbInput {
  lessonNumber: number
  /** From loadStageAOutputsFromDb — loader.ts LoadedLessonSection[] */
  sections: LoadedLessonSection[]
  /** From loadFromDb — TypedItemRow[]; word/phrase only will be emitted */
  itemRows: TypedItemRow[]
  /**
   * From projectPatternsFromCategories — PatternPlan[].
   *
   * Grammar units consume the plan's final .slug and .sourceRef verbatim so
   * content_unit.source_ref == capability.source_ref by construction, including
   * the collision tie-break (-{display_order} suffix) and normalizeLessonSourceRef
   * wrap that projectPatternsFromCategories applies. Do NOT pass raw
   * TypedGrammarCategory[] here — that would re-derive the slug naively and
   * diverge on any collision.
   */
  patternPlans: PatternPlan[]
  /** From loadAffixedFromDb — TypedAffixedPair[] */
  affixedPairs: TypedAffixedPair[]
}

/**
 * Build `StagingContentUnit`-shaped rows from DB-loaded lesson data.
 *
 * Output is sorted by display_order ascending (then unit_slug for stability),
 * matching `buildContentUnitsFromStaging`'s final sort.
 */
export function buildContentUnitsFromDb(
  input: ContentUnitsDbInput,
): StagingContentUnit[] {
  const { lessonNumber, sections, itemRows, patternPlans, affixedPairs } = input
  const lessonSourceRef = sourceRefForLesson(lessonNumber)
  const units: StagingContentUnit[] = []

  // --- Lesson sections ---
  for (const section of sections) {
    const sectionRef = `${lessonSourceRef}/section-${section.order_index}`
    const contentType = (section.content['type'] as string | undefined) ?? ''
    const unitSlug = `section-${section.order_index}-${stableSlug(section.title || contentType)}`
    units.push({
      content_unit_key: contentUnitKey({
        sourceRef: lessonSourceRef,
        sourceSectionRef: sectionRef,
        unitSlug,
      }),
      source_ref: lessonSourceRef,
      source_section_ref: sectionRef,
      unit_kind: 'lesson_section',
      unit_slug: unitSlug,
      display_order: section.order_index,
      payload_json: {},
      source_fingerprint: '',
    })
  }

  // --- Word / phrase learning items (sentence + dialogue_chunk excluded) ---
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

  // --- Grammar patterns (Decision E amendment: consume PatternPlan, not re-derived slug) ---
  //
  // plan.slug is collision-disambiguated (e.g. 'l3-ontkenning-0' when two
  // categories share stableSlug(title)) and plan.sourceRef is
  // normalizeLessonSourceRef-wrapped — both match the capability's source_ref
  // exactly. Using stableSlug(category.title) directly would diverge on any
  // collision, producing a unit whose source_ref does NOT match the capability.
  patternPlans.forEach((plan, index) => {
    const unitSlug = `pattern-${plan.slug}`
    units.push({
      content_unit_key: contentUnitKey({
        sourceRef: plan.sourceRef,
        sourceSectionRef: `${lessonSourceRef}/section-grammar`,
        unitSlug,
      }),
      source_ref: plan.sourceRef,
      source_section_ref: `${lessonSourceRef}/section-grammar`,
      unit_kind: 'grammar_pattern',
      unit_slug: unitSlug,
      display_order: 2000 + index,
      payload_json: {},
      source_fingerprint: '',
    })
  })

  // --- Affixed pairs ---
  affixedPairs.forEach((pair, index) => {
    const slug = slugFromAffixedSourceRef(pair.source_ref)
    units.push({
      content_unit_key: contentUnitKey({
        sourceRef: pair.source_ref,
        sourceSectionRef: `${lessonSourceRef}/section-morphology`,
        unitSlug: `morphology-${slug}`,
      }),
      source_ref: pair.source_ref,
      source_section_ref: `${lessonSourceRef}/section-morphology`,
      unit_kind: 'affixed_form_pair',
      unit_slug: `morphology-${slug}`,
      display_order: 3000 + index,
      payload_json: {},
      source_fingerprint: '',
    })
  })

  return units.sort(
    (a, b) => a.display_order - b.display_order || a.unit_slug.localeCompare(b.unit_slug),
  )
}
