/**
 * verify/residualParity.ts — Task 5a.6 (Slice 5a).
 *
 * Pure comparator asserting the DB-native residual output (audio caps,
 * affixed caps, content_units identity) is set-equal to the staging-derived
 * output for equivalent fixture data, modulo TWO allowlisted deltas:
 *
 *   1. `sentence_dialogue_item_omitted` — sentence/dialogue_chunk learning_item
 *      content_units are present in staging but absent in the DB-native builder
 *      (excluded in 5b.10). Expected and classified as ALLOWED.
 *
 *   2. `grammar_rekey` — grammar content_unit slugs/source_refs diverge:
 *      the staging builder derives them from the curated `pattern.slug` field
 *      (`pattern-{stableSlug(slug)}`); the DB-native builder derives them from
 *      `PatternPlan.slug` which is the collision-disambiguated `l{N}-…` form.
 *      This is the intended Decision E re-key; old curated-slug units are swept
 *      in 5b.10. Expected and classified as ALLOWED.
 *
 * Everything else (lesson_section units, word/phrase learning_item units,
 * affixed_form_pair units, affixed caps, audio caps) MUST be byte-identical
 * on the six identity fields. Any other difference is an UNEXPECTED delta
 * — a real parity break that the runner must surface.
 *
 * Identity comparison contract:
 *   - content_units: the SIX identity fields only — `content_unit_key`,
 *     `source_ref`, `source_section_ref`, `unit_kind`, `unit_slug`,
 *     `display_order`. `payload_json` and `source_fingerprint` are excluded
 *     (intentionally `{}`/`''` on the DB-native side, Decision E).
 *   - capabilities: `canonicalKey`, `sourceRef`, `capabilityType`,
 *     `direction`, `modality`, `learnerLanguage`.
 *
 * Pure: no I/O, no fs import, no DB. Fixtures in → result out.
 */

import type { StagingContentUnit } from '../../../content-pipeline-output'
import type { CapabilityInput } from '../adapter'

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type ParityDeltaKind =
  | 'sentence_dialogue_item_omitted' // ALLOWED: sentence/dialogue learning_item unit absent in DB-native
  | 'grammar_rekey'                   // ALLOWED: grammar unit slug changed from curated-slug to l{N}-… form
  | 'unit_missing_in_db_native'       // UNEXPECTED: non-grammar, non-sentence/dialogue unit absent in DB-native
  | 'unit_missing_in_staging'         // UNEXPECTED: unit present in DB-native but not in staging
  | 'unit_field_mismatch'             // UNEXPECTED: identity field differs between staging and DB-native
  | 'cap_missing_in_db_native'        // UNEXPECTED: capability present in staging but absent in DB-native
  | 'cap_missing_in_staging'          // UNEXPECTED: capability present in DB-native but absent in staging

export interface ParityDelta {
  kind: ParityDeltaKind
  /** Human-readable description. */
  detail: string
  /** The relevant key (content_unit_key or canonicalKey). */
  key: string
}

export interface ResidualParityInput {
  staging: {
    contentUnits: StagingContentUnit[]
    affixedCaps: CapabilityInput[]
    audioCaps: CapabilityInput[]
  }
  dbNative: {
    contentUnits: StagingContentUnit[]
    affixedCaps: CapabilityInput[]
    audioCaps: CapabilityInput[]
  }
  /**
   * The source_refs of sentence/dialogue_chunk items in the fixture.
   *
   * The comparator cannot read item_type from a content_unit row; callers
   * MUST supply the set of staging source_refs that belong to sentence/
   * dialogue_chunk items so the comparator can classify their absence in
   * the DB-native side as ALLOWED rather than UNEXPECTED.
   */
  sentenceDialogueItemSourceRefs: Set<string>
}

export interface ResidualParityResult {
  /** true iff no UNEXPECTED deltas. */
  parity: boolean
  allowedDeltas: ParityDelta[]
  unexpectedDeltas: ParityDelta[]
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** The six identity fields used for content_unit comparison. */
interface UnitIdentity {
  content_unit_key: string
  source_ref: string
  source_section_ref: string
  unit_kind: string
  unit_slug: string
  display_order: number
}

function unitIdentityKey(u: StagingContentUnit): string {
  return u.content_unit_key
}

function unitToIdentity(u: StagingContentUnit): UnitIdentity {
  return {
    content_unit_key: u.content_unit_key,
    source_ref: u.source_ref,
    source_section_ref: u.source_section_ref,
    unit_kind: u.unit_kind,
    unit_slug: u.unit_slug,
    display_order: u.display_order,
  }
}

function identitiesEqual(a: UnitIdentity, b: UnitIdentity): boolean {
  return (
    a.content_unit_key === b.content_unit_key &&
    a.source_ref === b.source_ref &&
    a.source_section_ref === b.source_section_ref &&
    a.unit_kind === b.unit_kind &&
    a.unit_slug === b.unit_slug &&
    a.display_order === b.display_order
  )
}

/** The six identity fields used for capability comparison. */
function capIdentityKey(c: CapabilityInput): string {
  return c.canonicalKey
}

function capIdentityStr(c: CapabilityInput): string {
  return [c.canonicalKey, c.sourceRef, c.capabilityType, c.direction, c.modality, c.learnerLanguage].join('|')
}

/**
 * True if the unit_slug matches the NEW pattern-path form `pattern-l{N}-…`.
 * The OLD curated-slug form is `pattern-{anything-not-l{N}}`.
 */
function isNewPatternSlug(unitSlug: string): boolean {
  return /^pattern-l\d+-/.test(unitSlug)
}

/**
 * True if the unit_slug matches the OLD curated-slug form:
 * `pattern-` prefix WITHOUT the `l{N}-` lesson-prefix.
 */
function isOldCuratedPatternSlug(unitSlug: string): boolean {
  return /^pattern-(?!l\d+-)/.test(unitSlug)
}

// ---------------------------------------------------------------------------
// Main comparator
// ---------------------------------------------------------------------------

/**
 * Compare staging vs DB-native residual outputs, classifying each delta as
 * ALLOWED or UNEXPECTED.
 *
 * Algorithm:
 *   CONTENT UNITS
 *   - Build maps: staging content_units by content_unit_key, DB-native by key.
 *   - Partitioned by unit_kind:
 *     - `learning_item` units:
 *       - Those whose source_ref is in `sentenceDialogueItemSourceRefs` and
 *         are ABSENT in DB-native → ALLOWED (sentence_dialogue_item_omitted).
 *       - Those NOT in the sentence/dialogue set and ABSENT in DB-native →
 *         UNEXPECTED (unit_missing_in_db_native).
 *       - Present in DB-native but absent in staging → UNEXPECTED.
 *       - Present in both but identity field mismatch → UNEXPECTED.
 *     - `grammar_pattern` units:
 *       - Staging and DB-native grammar units are matched pairwise by
 *         display_order (same source section, same position). Slug/source_ref
 *         divergence between old curated form and new l{N} form → ALLOWED
 *         (grammar_rekey). Any other field mismatch → UNEXPECTED.
 *       - Grammar unit in DB-native with OLD curated-slug form → UNEXPECTED
 *         (the N1 negative assertion — builder bug emitting both old and new).
 *     - `lesson_section` and `affixed_form_pair` units:
 *       - Byte-identical on the six fields; any difference → UNEXPECTED.
 *
 *   CAPABILITIES (affixed + audio)
 *   - Set-equal on the six cap identity fields (canonicalKey, sourceRef,
 *     capabilityType, direction, modality, learnerLanguage). Any difference
 *     → UNEXPECTED.
 */
export function compareResidualParity(input: ResidualParityInput): ResidualParityResult {
  const allowedDeltas: ParityDelta[] = []
  const unexpectedDeltas: ParityDelta[] = []

  // -------------------------------------------------------------------------
  // CONTENT UNITS
  // -------------------------------------------------------------------------
  const stagingByKey = new Map(input.staging.contentUnits.map((u) => [unitIdentityKey(u), u]))
  const dbByKey = new Map(input.dbNative.contentUnits.map((u) => [unitIdentityKey(u), u]))

  // Grammar units: match by display_order (same position = same category)
  const stagingGrammar = input.staging.contentUnits
    .filter((u) => u.unit_kind === 'grammar_pattern')
    .sort((a, b) => a.display_order - b.display_order)
  const dbGrammar = input.dbNative.contentUnits
    .filter((u) => u.unit_kind === 'grammar_pattern')
    .sort((a, b) => a.display_order - b.display_order)

  // N1: DB-native must contain NO old curated-slug grammar units
  for (const u of dbGrammar) {
    if (isOldCuratedPatternSlug(u.unit_slug)) {
      unexpectedDeltas.push({
        kind: 'unit_field_mismatch',
        detail: `DB-native grammar unit uses OLD curated-slug form "${u.unit_slug}" — builder bug (N1: both old and new emitted)`,
        key: u.content_unit_key,
      })
    }
  }

  // Match staging↔DB grammar units pairwise by display_order position
  const grammarCount = Math.max(stagingGrammar.length, dbGrammar.length)
  for (let i = 0; i < grammarCount; i++) {
    const s = stagingGrammar[i]
    const d = dbGrammar[i]
    if (!s && d) {
      unexpectedDeltas.push({
        kind: 'unit_missing_in_staging',
        detail: `DB-native grammar unit "${d.unit_slug}" has no staging counterpart at position ${i}`,
        key: d.content_unit_key,
      })
      continue
    }
    if (s && !d) {
      unexpectedDeltas.push({
        kind: 'unit_missing_in_db_native',
        detail: `Staging grammar unit "${s.unit_slug}" has no DB-native counterpart at position ${i}`,
        key: s.content_unit_key,
      })
      continue
    }
    // Both present — compare non-slug identity fields (source_section_ref, display_order, unit_kind must match)
    // Slug/source_ref divergence is ALLOWED if staging is old curated form and DB is new l{N} form
    const sameNonSlugFields =
      s!.source_section_ref === d!.source_section_ref &&
      s!.display_order === d!.display_order &&
      s!.unit_kind === d!.unit_kind

    if (!sameNonSlugFields) {
      unexpectedDeltas.push({
        kind: 'unit_field_mismatch',
        detail: `Grammar unit at position ${i}: non-slug identity fields differ — staging: ${JSON.stringify(unitToIdentity(s!))} vs DB: ${JSON.stringify(unitToIdentity(d!))}`,
        key: s!.content_unit_key,
      })
      continue
    }

    const slugDiffers = s!.unit_slug !== d!.unit_slug || s!.source_ref !== d!.source_ref
    if (slugDiffers) {
      // ALLOWED if staging is old curated form and DB is new l{N} form
      const stagingIsOldCurated = isOldCuratedPatternSlug(s!.unit_slug)
      const dbIsNewForm = isNewPatternSlug(d!.unit_slug)
      if (stagingIsOldCurated && dbIsNewForm) {
        allowedDeltas.push({
          kind: 'grammar_rekey',
          detail: `Grammar unit re-keyed from staging "${s!.unit_slug}" (curated-slug) to DB-native "${d!.unit_slug}" (l{N}-… form) — Decision E, expected delta`,
          key: s!.content_unit_key,
        })
      } else {
        unexpectedDeltas.push({
          kind: 'unit_field_mismatch',
          detail: `Grammar unit slug/source_ref differs but NOT an expected curated→l{N} re-key: staging "${s!.unit_slug}" vs DB "${d!.unit_slug}"`,
          key: s!.content_unit_key,
        })
      }
    }
    // If slugs match (same form on both sides) → no delta needed (identity match)
  }

  // Non-grammar units: lesson_section, learning_item, affixed_form_pair
  for (const stagingUnit of input.staging.contentUnits) {
    if (stagingUnit.unit_kind === 'grammar_pattern') continue // handled above

    const dbUnit = dbByKey.get(unitIdentityKey(stagingUnit))
    if (!dbUnit) {
      // Absent in DB-native
      if (
        stagingUnit.unit_kind === 'learning_item' &&
        input.sentenceDialogueItemSourceRefs.has(stagingUnit.source_ref)
      ) {
        allowedDeltas.push({
          kind: 'sentence_dialogue_item_omitted',
          detail: `Sentence/dialogue_chunk item unit omitted in DB-native (expected — deleted in 5b.10): source_ref="${stagingUnit.source_ref}"`,
          key: stagingUnit.content_unit_key,
        })
      } else {
        unexpectedDeltas.push({
          kind: 'unit_missing_in_db_native',
          detail: `${stagingUnit.unit_kind} unit "${stagingUnit.unit_slug}" (source_ref="${stagingUnit.source_ref}") present in staging but absent in DB-native`,
          key: stagingUnit.content_unit_key,
        })
      }
    } else {
      // Present in both — compare the six identity fields
      const sId = unitToIdentity(stagingUnit)
      const dId = unitToIdentity(dbUnit)
      if (!identitiesEqual(sId, dId)) {
        unexpectedDeltas.push({
          kind: 'unit_field_mismatch',
          detail: `${stagingUnit.unit_kind} unit identity field mismatch: staging=${JSON.stringify(sId)} vs db=${JSON.stringify(dId)}`,
          key: stagingUnit.content_unit_key,
        })
      }
    }
  }

  // DB-native non-grammar units with no staging counterpart
  for (const dbUnit of input.dbNative.contentUnits) {
    if (dbUnit.unit_kind === 'grammar_pattern') continue // handled above
    if (!stagingByKey.has(unitIdentityKey(dbUnit))) {
      unexpectedDeltas.push({
        kind: 'unit_missing_in_staging',
        detail: `${dbUnit.unit_kind} unit "${dbUnit.unit_slug}" present in DB-native but absent in staging`,
        key: dbUnit.content_unit_key,
      })
    }
  }

  // -------------------------------------------------------------------------
  // CAPABILITIES (affixed + audio)
  // -------------------------------------------------------------------------
  function compareCaps(
    stagingCaps: CapabilityInput[],
    dbNativeCaps: CapabilityInput[],
    label: string,
  ): void {
    const stagingCapMap = new Map(stagingCaps.map((c) => [capIdentityKey(c), c]))
    const dbNativeCapMap = new Map(dbNativeCaps.map((c) => [capIdentityKey(c), c]))

    for (const sc of stagingCaps) {
      const dc = dbNativeCapMap.get(capIdentityKey(sc))
      if (!dc) {
        unexpectedDeltas.push({
          kind: 'cap_missing_in_db_native',
          detail: `${label} capability "${sc.canonicalKey}" (sourceRef="${sc.sourceRef}") present in staging but absent in DB-native`,
          key: sc.canonicalKey,
        })
      } else {
        // Compare the six identity fields
        if (capIdentityStr(sc) !== capIdentityStr(dc)) {
          unexpectedDeltas.push({
            kind: 'unit_field_mismatch',
            detail: `${label} capability identity field mismatch: staging=${capIdentityStr(sc)} vs db=${capIdentityStr(dc)}`,
            key: sc.canonicalKey,
          })
        }
      }
    }

    for (const dc of dbNativeCaps) {
      if (!stagingCapMap.has(capIdentityKey(dc))) {
        unexpectedDeltas.push({
          kind: 'cap_missing_in_staging',
          detail: `${label} capability "${dc.canonicalKey}" present in DB-native but absent in staging`,
          key: dc.canonicalKey,
        })
      }
    }
  }

  compareCaps(input.staging.affixedCaps, input.dbNative.affixedCaps, 'affixed')
  compareCaps(input.staging.audioCaps, input.dbNative.audioCaps, 'audio')

  return {
    parity: unexpectedDeltas.length === 0,
    allowedDeltas,
    unexpectedDeltas,
  }
}
