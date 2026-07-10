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
 *
 * Spreektaal (docs/plans/2026-07-09-spreektaal-lesson-woven-core.md §3.2, §8):
 * item row register='informal' requires a non-null register_counterpart that
 * either resolves (itemSlug()) to a known item in THIS lesson's own projected
 * rows, or is whitelisted as phrase-anchored (see SectionShapeOptions).
 */

import { itemSlug } from '@/lib/capabilities'
import type { ValidationFinding } from '../model'
import type { ProjectSectionsOutput } from '../projectSections'

function empty(value: unknown): boolean {
  return typeof value !== 'string' || value.trim().length === 0
}

export interface SectionShapeOptions {
  /**
   * Severity for EN-completeness findings (l2_translation / title_en /
   * rules_en / example.english). `error` in publish mode (post-enrichment),
   * `warning` in pre-flight mode (the EN enricher has not run). All other
   * (structural) findings stay `error` regardless. ADR 0013 §3.
   */
  enSeverity?: 'error' | 'warning'
  /**
   * Spreektaal §3.2/§8: itemSlug()'d formal-counterpart texts explicitly
   * whitelisted as phrase-anchored (register-pairs.ts anchor_lesson-override
   * rows, ~6 rows per §3.1) — these don't need to resolve to a standalone
   * item in this lesson. Defaults to empty (register-pairs.ts not authored
   * yet, or this lesson has no phrase-anchored rows).
   */
  phraseAnchoredWhitelist?: ReadonlySet<string>
}

export function validateSectionShape(
  projected: ProjectSectionsOutput,
  options: SectionShapeOptions = {},
): ValidationFinding[] {
  const findings: ValidationFinding[] = []
  const en = options.enSeverity ?? 'error'
  const phraseAnchoredWhitelist = options.phraseAnchoredWhitelist ?? new Set<string>()
  // Spreektaal §3.3: an informal item's formal twin is co-anchored to the SAME
  // lesson (the informal entry is appended to the formal twin's introducing
  // lesson), so a resolving register_counterpart is guaranteed to appear
  // among this lesson's OWN projected item rows — self-contained to the
  // lesson (ADR 0013 §4), no cross-lesson pool needed.
  const normalizedTextsInLesson = new Set(projected.itemRows.map((r) => itemSlug(r.indonesian_text)))

  for (const row of projected.itemRows) {
    const ctx = { sectionOrderIndex: row.sourceSectionOrderIndex, sourceRef: row.source_item_ref }
    if (empty(row.source_item_ref)) findings.push({ gate: 'GT9', severity: 'error', message: 'item row missing source_item_ref', context: ctx })
    if (empty(row.item_type)) findings.push({ gate: 'GT9', severity: 'error', message: `item row "${row.source_item_ref}" missing item_type`, context: ctx })
    if (empty(row.indonesian_text)) findings.push({ gate: 'GT9', severity: 'error', message: `item row "${row.source_item_ref}" missing indonesian_text`, context: ctx })
    if (empty(row.l1_translation)) findings.push({ gate: 'GT9', severity: 'error', message: `item row "${row.source_item_ref}" missing l1_translation (NL)`, context: ctx })
    if (empty(row.l2_translation)) findings.push({ gate: 'GT9', severity: en, message: `item row "${row.source_item_ref}" missing l2_translation (EN) — the lesson-stage EN enricher did not fill it`, context: ctx })

    // Spreektaal §3.2: register='informal' ⇒ register_counterpart non-null AND
    // it must resolve (via the canonical itemSlug() mint) to a known item in
    // this lesson, OR be explicitly whitelisted as phrase-anchored.
    if (row.register === 'informal') {
      if (empty(row.register_counterpart)) {
        findings.push({
          gate: 'GT9',
          severity: 'error',
          message: `item row "${row.source_item_ref}" has register='informal' but is missing register_counterpart`,
          context: ctx,
        })
      } else {
        const counterpartSlug = itemSlug(row.register_counterpart as string)
        const resolvesInLesson = normalizedTextsInLesson.has(counterpartSlug)
        const isWhitelisted = phraseAnchoredWhitelist.has(counterpartSlug)
        if (!resolvesInLesson && !isWhitelisted) {
          findings.push({
            gate: 'GT9',
            severity: 'error',
            message: `item row "${row.source_item_ref}" register_counterpart "${row.register_counterpart}" does not resolve to a known item in this lesson and is not whitelisted as phrase-anchored (register-pairs.ts)`,
            context: ctx,
          })
        }
      }
    }
  }

  for (const cat of projected.grammarCategories) {
    const ctx = { sectionOrderIndex: cat.sourceSectionOrderIndex }
    const label = `grammar category [${cat.sourceSectionOrderIndex}/${cat.display_order}] "${cat.title}"`
    if (empty(cat.title)) findings.push({ gate: 'GT9', severity: 'error', message: `${label} missing title`, context: ctx })
    if (empty(cat.title_en)) findings.push({ gate: 'GT9', severity: en, message: `${label} missing title_en (EN)`, context: ctx })
    if (cat.rules.length === 0) {
      findings.push({ gate: 'GT9', severity: 'error', message: `${label} has no rules (a projected grammar category must be rule-bearing)`, context: ctx })
    }
    if (cat.rules_en.length !== cat.rules.length) {
      findings.push({ gate: 'GT9', severity: 'error', message: `${label} rules_en length (${cat.rules_en.length}) != rules length (${cat.rules.length})`, context: ctx })
    }
    cat.rules_en.forEach((r, i) => {
      if (empty(r)) findings.push({ gate: 'GT9', severity: en, message: `${label} rules_en[${i}] missing (EN) — the lesson-stage EN enricher did not fill it`, context: ctx })
    })
    ;(cat.examples ?? []).forEach((ex, i) => {
      if (empty(ex.indonesian)) findings.push({ gate: 'GT9', severity: 'error', message: `${label} example[${i}] missing indonesian`, context: ctx })
      if (empty(ex.english)) findings.push({ gate: 'GT9', severity: en, message: `${label} example[${i}] missing english (EN)`, context: ctx })
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
