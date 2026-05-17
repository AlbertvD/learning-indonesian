/**
 * Duplicate-item authoring lint (Decision 3b, PR-2).
 *
 * Refuses to publish if any learning_items.ts declares the same base_text
 * twice in one file (within-lesson) or if two different lessons declare the
 * same base_text (cross-lesson). Both are authoring bugs:
 *
 *   - Within-lesson: silently deduped today by canonical_key upsert at write
 *     time; the spec disallows the situation.
 *   - Cross-lesson: produced the NULL-lesson capability race described in
 *     docs/plans/2026-05-17-extend-decision-3-lesson-id.md §Why. Each lesson's
 *     publish run would overwrite the previous lesson's stamp; with Decision
 *     3b every capability is owned by exactly one introducing lesson, so an
 *     item declared by two lessons cannot agree on an owner.
 *
 * Authoring rule: an item is declared in one lesson's learning-items.ts; any
 * other lesson that wants to expose it references it via source_refs[] in its
 * lesson-page-blocks.ts (the M:N exposure bridge).
 *
 * Pure function — no I/O, no DB. Caller passes pre-loaded item arrays so the
 * rule is trivially unit-testable.
 */

import { itemSlug } from '../../../../../src/lib/capabilities/itemSlug'

export interface LessonItemsInput {
  lesson: number
  items: ReadonlyArray<{ base_text?: unknown }>
}

export interface DuplicateItemFinding {
  severity: 'CRITICAL'
  rule: 'duplicate-item-within-lesson' | 'duplicate-item-cross-lesson'
  lesson: number
  base_text: string
  detail: string
}

export function findDuplicateItems(
  lessons: ReadonlyArray<LessonItemsInput>,
): DuplicateItemFinding[] {
  const findings: DuplicateItemFinding[] = []

  // base_text → ordered list of lesson numbers it appears in (duplicates kept)
  const byBaseText = new Map<string, { display: string; lessons: number[] }>()
  for (const { lesson, items } of lessons) {
    for (const item of items) {
      const raw = typeof item?.base_text === 'string' ? item.base_text : ''
      if (!raw.trim()) continue
      const key = itemSlug(raw)
      let entry = byBaseText.get(key)
      if (!entry) {
        entry = { display: raw.trim(), lessons: [] }
        byBaseText.set(key, entry)
      }
      entry.lessons.push(lesson)
    }
  }

  for (const [, entry] of byBaseText) {
    const distinct = [...new Set(entry.lessons)].sort((a, b) => a - b)

    // Within-lesson: any lesson appears in the list more than once.
    for (const ln of distinct) {
      const count = entry.lessons.filter(x => x === ln).length
      if (count > 1) {
        findings.push({
          severity: 'CRITICAL',
          rule: 'duplicate-item-within-lesson',
          lesson: ln,
          base_text: entry.display,
          detail: `"${entry.display}" declared ${count} times in lesson-${ln}/learning-items.ts`,
        })
      }
    }

    // Cross-lesson: more than one distinct lesson declares it. Emit one
    // finding per affected lesson so a single-lesson lint run still surfaces
    // the issue. The lowest-order lesson is identified as the keeper in the
    // detail string.
    if (distinct.length > 1) {
      const owner = distinct[0]
      for (const ln of distinct) {
        findings.push({
          severity: 'CRITICAL',
          rule: 'duplicate-item-cross-lesson',
          lesson: ln,
          base_text: entry.display,
          detail: `"${entry.display}" declared in multiple lessons: ${distinct.join(', ')} — keep in lesson-${owner}, reference from others via lesson-page-blocks.ts source_refs[]`,
        })
      }
    }
  }

  return findings.sort((a, b) =>
    a.lesson - b.lesson ||
    a.rule.localeCompare(b.rule) ||
    a.base_text.localeCompare(b.base_text),
  )
}
