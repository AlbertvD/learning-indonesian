import { isCatalogAffix } from '@/lib/capabilities/affixCatalog'
import { blankDerivedInCarrier } from '@/lib/capabilities'
import type { AffixedFormPairRowInput } from '../adapter'
import type { ValidationFinding } from '../model'

const AFFIX_TYPES = new Set(['prefix', 'suffix', 'confix', 'reduplication'])
const ALLOMORPHIC_AFFIXES = new Set(['meN-', 'peN-'])

/**
 * Layer-1 shared invariant helper (morphology phase-b, spec §6): the
 * application-tier payload checks, on ONE projected row. Used by the Layer-2
 * pre-write validator below; the Layer-3 HC (check-supabase-deep) asserts the
 * SAME invariant against the live DB. Pure — unit-tested directly.
 *
 * Returns one finding per violation (empty = valid). Caller supplies the context.
 */
export function affixedPayloadFindings(row: AffixedFormPairRowInput): ValidationFinding[] {
  const findings: ValidationFinding[] = []
  const ctx = { capabilityKey: row.capability_id }
  const where = `affixed_form_pairs row ${row.source_ref}`
  const push = (message: string) => findings.push({ gate: 'CS12', severity: 'error' as const, message, context: ctx })

  if (!row.grammar_pattern_id || !row.grammar_pattern_id.trim()) {
    push(`${where} has no grammar_pattern_id (NOT NULL — the affix rule must resolve)`)
  }
  if (!row.affix_type || !AFFIX_TYPES.has(row.affix_type)) {
    push(`${where} has invalid affix_type "${row.affix_type ?? '(null)'}" — expected prefix|suffix|confix|reduplication`)
  }
  if (row.productive == null) {
    push(`${where} has null productive (NOT NULL)`)
  }
  if (!row.affix || !isCatalogAffix(row.affix)) {
    push(`${where} has affix "${row.affix ?? '(null)'}" not in the affix catalog (lib/capabilities/affixCatalog.ts)`)
  } else {
    if (ALLOMORPHIC_AFFIXES.has(row.affix) && !(row.allomorph_class && row.allomorph_class.trim())) {
      push(`${where} affix "${row.affix}" requires an allomorph_class (nasalising affix)`)
    }
  }
  if (row.affix_type === 'confix' && !(row.circumfix_left?.trim() && row.circumfix_right?.trim())) {
    push(`${where} is a confix but is missing circumfix_left/circumfix_right`)
  }
  // Reduplication is not a circumfix — it must not carry circumfix pieces (ADR 0019).
  if (row.affix_type === 'reduplication' && (row.circumfix_left?.trim() || row.circumfix_right?.trim())) {
    push(`${where} is reduplication but carries circumfix_left/right (reduplication copies the root, it has no circumfix)`)
  }
  // ADR 0019 option B: a carrier must contain its derived form as a WHOLE WORD, so
  // the runtime blank lands exactly (the same matcher the harvest gate + render use).
  if (row.carrier_text && blankDerivedInCarrier(row.carrier_text, row.derived_text) === null) {
    push(`${where} carrier_text "${row.carrier_text}" does not contain derived_text "${row.derived_text}" as a whole word — it would mis-blank at render`)
  }
  // Fix 3 derived gloss: NULL-tolerant (un-glossed is valid during rollout), but a
  // gloss is authored bilingually as a unit — both-or-neither, never half. (True
  // source↔projection equality is the Layer-3 cross-join HC, not checkable here:
  // the projector copies the gloss from source, so a pre-write equality would be
  // tautological — exactly as carrier_text's parity is HC-only.)
  const hasNl = !!(row.derived_gloss_nl && row.derived_gloss_nl.trim())
  const hasEn = !!(row.derived_gloss_en && row.derived_gloss_en.trim())
  if (hasNl !== hasEn) {
    push(`${where} has a half-authored derived gloss (nl=${hasNl ? 'set' : 'null'}, en=${hasEn ? 'set' : 'null'}) — glosses are authored bilingually, both or neither`)
  }
  return findings
}

/**
 * CS12 (PR 3) — typed `affixed_form_pairs` shape gate.
 *
 * Runs against the projector output before the adapter writes. Ensures every
 * projected row satisfies the contract the typed-table reader
 * (`src/lib/exercise-content/byKind/affixedFormPair.ts`) depends on:
 *
 *   - `root_text` is non-empty
 *   - `derived_text` is non-empty
 *   - `allomorph_rule` is non-empty (the DB column is NOT NULL; the rule is
 *     always required for these pairs — staging carries it for every pair)
 *   - `source_ref` matches `lesson-N/morphology/<slug>`
 *   - one row per `capability_id` (the table has UNIQUE(capability_id))
 *
 * Fails CRITICAL (error) on any violation — the publish aborts before the
 * adapter writes. This is the §1.5 fail-loud cure for the silent-skip class.
 *
 * Note: the projector at `projectors/morphology.ts` already emits CS12 findings
 * for caps with no resolvable id / no source pair / empty fields BEFORE the row
 * reaches this list. This validator is the belt-and-braces gate: the adapter
 * writes only when every projected row is valid by shape.
 */
export function validateAffixedFormPairs(rows: AffixedFormPairRowInput[]): ValidationFinding[] {
  const findings: ValidationFinding[] = []

  const sourceRefRe = /^lesson-\d+\/morphology\/.+$/u
  const seenCapabilityIds = new Set<string>()

  for (const row of rows) {
    const ctx = { capabilityKey: row.capability_id }

    if (!sourceRefRe.test(row.source_ref)) {
      findings.push({
        gate: 'CS12',
        severity: 'error',
        message: `affixed_form_pairs row has malformed source_ref "${row.source_ref}" — expected lesson-N/morphology/<slug>`,
        context: ctx,
      })
      continue
    }

    if (!row.root_text.trim()) {
      findings.push({
        gate: 'CS12',
        severity: 'error',
        message: `affixed_form_pairs.root_text for ${row.source_ref} is empty`,
        context: ctx,
      })
      continue
    }

    if (!row.derived_text.trim()) {
      findings.push({
        gate: 'CS12',
        severity: 'error',
        message: `affixed_form_pairs.derived_text for ${row.source_ref} is empty`,
        context: ctx,
      })
      continue
    }

    if (!row.allomorph_rule.trim()) {
      findings.push({
        gate: 'CS12',
        severity: 'error',
        message: `affixed_form_pairs.allomorph_rule for ${row.source_ref} is empty (column is NOT NULL)`,
        context: ctx,
      })
      continue
    }

    if (seenCapabilityIds.has(row.capability_id)) {
      findings.push({
        gate: 'CS12',
        severity: 'error',
        message:
          `duplicate affixed_form_pairs row for capability_id ${row.capability_id} ` +
          `(source_ref="${row.source_ref}") — the table has UNIQUE(capability_id), the insert will fail`,
        context: ctx,
      })
      continue
    }
    seenCapabilityIds.add(row.capability_id)

    // Morphology phase-b application-tier payload invariants (Layer-1 helper).
    findings.push(...affixedPayloadFindings(row))
  }

  return findings
}
