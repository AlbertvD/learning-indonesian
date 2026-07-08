// lib/morphology/catalog — pure folding of the raw snapshot into the affix
// catalog grid + per-affix progress. Reuses the canonical mastery rungs
// (labelForCapability / weakestLabel) — the per-affix roll-up is a per-affix
// cap roll-up (weakest-wins per derivation), NOT funnelBucket, so it does not
// depend on the item-C analytics re-partition (grill decision 3).

import { AFFIX_CATALOG, type CapabilityType } from '@/lib/capabilities'
import {
  labelForCapability,
  weakestLabel,
  type CapabilityMasteryEvidence,
  type MasteryLabel,
} from '@/lib/analytics/mastery/masteryModel'
import {
  loadMorphologySnapshot,
  type MorphologyCapRow,
  type MorphologyReadClient,
  type MorphologySnapshot,
  type MorphologyStateRow,
} from './adapter'
import type { AffixCatalogTile, AffixProgress, AffixProgressClassTally } from './model'

type Language = 'nl' | 'en'

const EMPTY_FUNNEL = (): Record<MasteryLabel, number> => ({
  not_assessed: 0,
  introduced: 0,
  learning: 0,
  strengthening: 0,
  mastered: 0,
  at_risk: 0,
})

// The two capability-type classes review P1 splits the mastery display into —
// exhaustive for source_kind word_form_pair_src (ADR 0021 routing emits only
// these four types onto affixed pairs).
const RECOGNITION_CAP_TYPES: ReadonlySet<CapabilityType> = new Set([
  'recognise_meaning_from_text_cap',
  'recognise_word_form_link_cap',
])
const PRODUCTION_CAP_TYPES: ReadonlySet<CapabilityType> = new Set([
  'produce_derived_form_cap',
  'produce_form_from_context_cap',
])

/** Build a CapabilityMasteryEvidence row from a cap + its (optional) learner
 *  state, reusing the same fields toEvidence builds in masteryModel. Exported so
 *  family.ts marks derived forms + root-known with the identical predicate. */
export function buildEvidence(
  cap: MorphologyCapRow,
  snapshot: Pick<MorphologySnapshot, 'statesByCapId' | 'activatedLessonIds' | 'lessonOrderById'>,
): CapabilityMasteryEvidence {
  const state: MorphologyStateRow | undefined = snapshot.statesByCapId.get(cap.id)
  // Per ADR 0006 the only null-lesson caps are podcast; an affix/root cap with a
  // lessonId counts activated only when that lesson is activated.
  const lessonActivated = cap.lessonId == null || snapshot.activatedLessonIds.has(cap.lessonId)
  const lessonNumber = cap.lessonId == null ? null : snapshot.lessonOrderById.get(cap.lessonId) ?? null
  return {
    capabilityId: cap.id,
    canonicalKey: cap.canonicalKey,
    sourceKind: cap.sourceKind,
    sourceRef: cap.sourceRef,
    capabilityType: cap.capabilityType,
    modality: cap.modality,
    readinessStatus: cap.readinessStatus,
    publicationStatus: cap.publicationStatus,
    lessonActivated,
    lessonNumber,
    reviewCount: state?.reviewCount ?? 0,
    lapseCount: state?.lapseCount ?? 0,
    consecutiveFailureCount: state?.consecutiveFailureCount ?? 0,
    stability: state?.stability ?? null,
    lastReviewedAt: state?.lastReviewedAt ?? null,
  }
}

/** Tally one capability-type class: how many of the affix's caps of that class
 *  (content-fixed denominator) reached the `mastered` rung. Per-CAP, not
 *  per-derivation — a confix derivation's two caps (meaning + formation) land
 *  in different classes, so they are never weakest-wins-collapsed here. */
function classTally(
  caps: CapabilityMasteryEvidence[],
  types: ReadonlySet<CapabilityType>,
  now: Date,
): AffixProgressClassTally {
  const classCaps = caps.filter((cap) => types.has(cap.capabilityType))
  const masteredCount = classCaps.filter((cap) => labelForCapability(cap, now) === 'mastered').length
  return { masteredCount, totalCount: classCaps.length }
}

/** Roll up a set of caps to one AffixProgress: group by source_ref (one
 *  derivation), weakest-wins per derivation, then tally the rungs. */
export function rollUpProgress(
  caps: CapabilityMasteryEvidence[],
  now: Date,
): AffixProgress {
  const byDerivation = new Map<string, CapabilityMasteryEvidence[]>()
  for (const cap of caps) {
    byDerivation.set(cap.sourceRef, [...(byDerivation.get(cap.sourceRef) ?? []), cap])
  }
  const funnel = EMPTY_FUNNEL()
  let masteredCount = 0
  let practisedCount = 0
  const derivationLabels: MasteryLabel[] = []
  for (const derivationCaps of byDerivation.values()) {
    const label = weakestLabel(derivationCaps.map((c) => labelForCapability(c, now)))
    funnel[label] += 1
    derivationLabels.push(label)
    if (label === 'mastered') masteredCount += 1
    if (derivationCaps.some((c) => c.reviewCount > 0)) practisedCount += 1
  }
  return {
    label: weakestLabel(derivationLabels),
    funnel,
    masteredCount,
    practisedCount,
    totalCount: byDerivation.size,
    recognition: classTally(caps, RECOGNITION_CAP_TYPES, now),
    production: classTally(caps, PRODUCTION_CAP_TYPES, now),
  }
}

/** The caps that back a given affix's pairs (null-affix rows excluded). */
export function capsForAffix(snapshot: MorphologySnapshot, affix: string): MorphologyCapRow[] {
  const caps: MorphologyCapRow[] = []
  for (const pair of snapshot.pairs) {
    if (pair.affix !== affix) continue
    const cap = snapshot.pairCapsById.get(pair.capabilityId)
    if (cap) caps.push(cap)
  }
  return caps
}

/** Whether an affix is available to study: any of its caps' introducing lessons
 *  is activated (the trainer reflects ADR 0006, it invents no unlock engine). */
function affixAvailable(caps: MorphologyCapRow[], activated: ReadonlySet<string>): boolean {
  return caps.some((c) => c.lessonId != null && activated.has(c.lessonId))
}

function introLessonNumber(
  caps: MorphologyCapRow[],
  lessonOrderById: Map<string, number>,
): number | null {
  let min: number | null = null
  for (const cap of caps) {
    if (cap.lessonId == null) continue
    const order = lessonOrderById.get(cap.lessonId)
    if (order == null) continue
    min = min == null ? order : Math.min(min, order)
  }
  return min
}

/**
 * The sequenced affix catalog grid — every catalog affix as a tile, sorted by
 * the research teaching rank. Affixes with no content yet still appear (progress
 * all-zero, unavailable) so the grid shows the full curriculum.
 */
export function buildAffixCatalog(
  snapshot: MorphologySnapshot,
  language: Language,
  now: Date = new Date(),
): AffixCatalogTile[] {
  return [...AFFIX_CATALOG]
    .sort((a, b) => a.rank - b.rank)
    .map((entry) => {
      const caps = capsForAffix(snapshot, entry.affix)
      const evidence = caps.map((cap) => buildEvidence(cap, snapshot))
      return {
        affix: entry.affix,
        affixType: entry.affixType,
        gloss: language === 'nl' ? entry.glossNl : entry.glossEn,
        rank: entry.rank,
        cefrLevel: entry.cefrLevel,
        available: affixAvailable(caps, snapshot.activatedLessonIds),
        introLessonNumber: introLessonNumber(caps, snapshot.lessonOrderById),
        progress: rollUpProgress(evidence, now),
      }
    })
}

/** Impure entry point: load the snapshot + fold the catalog grid. */
export async function getAffixCatalog(
  userId: string,
  language: Language,
  client?: MorphologyReadClient,
): Promise<AffixCatalogTile[]> {
  const snapshot = await loadMorphologySnapshot(userId, client)
  return buildAffixCatalog(snapshot, language)
}
