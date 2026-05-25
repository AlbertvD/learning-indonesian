/**
 * lesson-stage/validators/sectionShape.ts — GT9.
 *
 * Per-row required-field gate over the typed lesson-section capability-contract
 * rows projectSections.ts produces (PR 6). Fails CRITICAL (error) on any missing
 * required field so the future Capability Stage reader (#98/#99) never has to
 * defend against a malformed/empty row — the fail-loud contract (migration plan
 * §1.5), and the EN enforcement the DONE bar requires (l2_translation +
 * dialogue/grammar EN non-null).
 *
 * Required per row:
 *   - item row:    source_item_ref, item_type, indonesian_text, l1_translation, l2_translation
 *   - grammar cat: title, title_en, non-empty rules, rules_en (parallel, non-empty),
 *                  each example has indonesian + english
 *   - affixed pair: source_ref, affix, root_text, derived_text, allomorph_rule
 *
 * Dialogue NL/EN is enforced by validateDialogueLines (GT8) on the section
 * content; this validator covers the new typed projections only.
 */

import type { ValidationFinding } from '../model'
import type { ProjectSectionsOutput } from '../projectSections'

function empty(value: unknown): boolean {
  return typeof value !== 'string' || value.trim().length === 0
}

export function validateSectionShape(projected: ProjectSectionsOutput): ValidationFinding[] {
  const findings: ValidationFinding[] = []

  for (const row of projected.itemRows) {
    const ctx = { sectionOrderIndex: row.sourceSectionOrderIndex, sourceRef: row.source_item_ref }
    if (empty(row.source_item_ref)) findings.push({ gate: 'GT9', severity: 'error', message: 'item row missing source_item_ref', context: ctx })
    if (empty(row.item_type)) findings.push({ gate: 'GT9', severity: 'error', message: `item row "${row.source_item_ref}" missing item_type`, context: ctx })
    if (empty(row.indonesian_text)) findings.push({ gate: 'GT9', severity: 'error', message: `item row "${row.source_item_ref}" missing indonesian_text`, context: ctx })
    if (empty(row.l1_translation)) findings.push({ gate: 'GT9', severity: 'error', message: `item row "${row.source_item_ref}" missing l1_translation (NL)`, context: ctx })
    if (empty(row.l2_translation)) findings.push({ gate: 'GT9', severity: 'error', message: `item row "${row.source_item_ref}" missing l2_translation (EN) — the lesson-stage EN enricher did not fill it`, context: ctx })
  }

  for (const cat of projected.grammarCategories) {
    const ctx = { sectionOrderIndex: cat.sourceSectionOrderIndex }
    const label = `grammar category [${cat.sourceSectionOrderIndex}/${cat.display_order}] "${cat.title}"`
    if (empty(cat.title)) findings.push({ gate: 'GT9', severity: 'error', message: `${label} missing title`, context: ctx })
    if (empty(cat.title_en)) findings.push({ gate: 'GT9', severity: 'error', message: `${label} missing title_en (EN)`, context: ctx })
    if (cat.rules.length === 0) {
      findings.push({ gate: 'GT9', severity: 'error', message: `${label} has no rules (a projected grammar category must be rule-bearing)`, context: ctx })
    }
    if (cat.rules_en.length !== cat.rules.length) {
      findings.push({ gate: 'GT9', severity: 'error', message: `${label} rules_en length (${cat.rules_en.length}) != rules length (${cat.rules.length})`, context: ctx })
    }
    cat.rules_en.forEach((r, i) => {
      if (empty(r)) findings.push({ gate: 'GT9', severity: 'error', message: `${label} rules_en[${i}] missing (EN) — the lesson-stage EN enricher did not fill it`, context: ctx })
    })
    ;(cat.examples ?? []).forEach((ex, i) => {
      if (empty(ex.indonesian)) findings.push({ gate: 'GT9', severity: 'error', message: `${label} example[${i}] missing indonesian`, context: ctx })
      if (empty(ex.english)) findings.push({ gate: 'GT9', severity: 'error', message: `${label} example[${i}] missing english (EN)`, context: ctx })
    })
  }

  for (const pair of projected.affixedPairs) {
    const ctx = { sourceRef: pair.source_ref }
    if (empty(pair.source_ref)) findings.push({ gate: 'GT9', severity: 'error', message: 'affixed pair missing source_ref', context: ctx })
    if (empty(pair.affix)) findings.push({ gate: 'GT9', severity: 'error', message: `affixed pair "${pair.source_ref}" missing affix`, context: ctx })
    if (empty(pair.root_text)) findings.push({ gate: 'GT9', severity: 'error', message: `affixed pair "${pair.source_ref}" missing root_text`, context: ctx })
    if (empty(pair.derived_text)) findings.push({ gate: 'GT9', severity: 'error', message: `affixed pair "${pair.source_ref}" missing derived_text`, context: ctx })
    if (empty(pair.allomorph_rule)) findings.push({ gate: 'GT9', severity: 'error', message: `affixed pair "${pair.source_ref}" missing allomorph_rule`, context: ctx })
  }

  return findings
}
