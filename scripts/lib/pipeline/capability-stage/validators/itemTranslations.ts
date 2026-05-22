/**
 * CS4b — Decision R (PR 1) translation column validator.
 *
 * Asserts that every non-dialogue_chunk item has a non-empty translation_nl.
 * This is the PR 1 gate: after PR 1 ships, byKind/item.ts reads ONLY the
 * inline translation columns (not item_meanings rows). Any item that reaches
 * the DB with a null translation_nl will produce a broken exercise card.
 *
 * Severity: 'error' — fails the publish hard. A missing NL translation means
 * the exercise renderer receives a null primaryMeaning and cannot build the
 * MCQ prompt.
 *
 * Dialogue_chunk items are exempt: their translation_nl is propagated from
 * lesson_sections.content.lines[].translation at runtime (via
 * propagateDialogueTranslationsToLearningItems). If it's still null after
 * propagation, those items are deferred rather than published (see
 * projectVocab deferred path).
 *
 * translation_en is validated as a WARNING (not error): EN translations are
 * enriched by Claude haiku at publish time, so a missing EN is unusual but
 * does not break the current exercise surface (all exercises show NL).
 */

import type { ValidationFinding } from '../model'

export interface ItemForTranslationCheck {
  base_text: string
  item_type: string
  translation_nl?: string | null
  translation_en?: string | null
}

export function validateItemTranslations(
  items: ItemForTranslationCheck[],
): ValidationFinding[] {
  const findings: ValidationFinding[] = []

  for (const item of items) {
    const ctx = { itemSlug: item.base_text }

    // Dialogue chunks are exempt — see doc above.
    if (item.item_type === 'dialogue_chunk') continue

    if (!item.translation_nl || item.translation_nl.trim().length === 0) {
      findings.push({
        gate: 'CS4b',
        severity: 'error',
        message:
          `Item "${item.base_text}" (${item.item_type}) has no translation_nl. ` +
          `Decision R (PR 1) requires translation_nl to be non-empty for all ` +
          `non-dialogue_chunk items — the runtime reader no longer falls back ` +
          `to item_meanings rows.`,
        context: ctx,
      })
    }

    if (!item.translation_en || item.translation_en.trim().length === 0) {
      findings.push({
        gate: 'CS4b',
        severity: 'warning',
        message:
          `Item "${item.base_text}" (${item.item_type}) has no translation_en. ` +
          `EN translation is enriched by Claude haiku at publish time — ` +
          `this warning fires if enrichment was skipped or failed.`,
        context: ctx,
      })
    }
  }

  return findings
}
