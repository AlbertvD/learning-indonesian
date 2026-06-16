import type {
  CapabilityModality,
  CapabilitySourceKind,
  CapabilityType,
} from '@/lib/capabilities'
import { patternSlugFromSourceRef } from '@/lib/capabilities'
import { listActivatedLessons } from '@/lib/lessons'
import { chunkedIn } from '@/lib/chunkedQuery'
import { isCapabilityMastered, isRecent } from './mastered'

export type MasteryLabel =
  | 'not_assessed'
  | 'introduced'
  | 'learning'
  | 'strengthening'
  | 'mastered'
  | 'at_risk'

export type MasteryConfidence = 'none' | 'low' | 'medium' | 'high'

export type MasteryDimension =
  | 'recognise_meaning_from_text_cap'
  | 'meaning_recall'
  | 'recognise_form_from_meaning_cap'
  | 'form_recall'
  | 'listening'
  | 'dictation'
  | 'recognise_grammar_pattern_cap'
  | 'pattern_use'
  | 'produce_form_from_context_cap'
  | 'morphology'
  | 'exposure'

export interface CapabilityMasteryEvidence {
  capabilityId: string
  canonicalKey: string
  sourceKind: CapabilitySourceKind
  sourceRef: string
  capabilityType: CapabilityType
  modality: CapabilityModality
  readinessStatus: string
  publicationStatus: string
  // After retirement #6: 'introduced' if the lesson is activated, else
  // 'not_assessed'. NULL lessonId (cross-lesson capability, e.g. podcast)
  // counts as activated for the purposes of this signal.
  lessonActivated: boolean
  // Introducing lesson's order_index (the "Les N" number), for per-lesson funnels.
  // null for cross-lesson caps (podcast) and where the lesson can't be resolved.
  lessonNumber: number | null
  reviewCount: number
  lapseCount: number
  consecutiveFailureCount: number
  stability?: number | null
  lastReviewedAt?: string | null
}

export interface MasteryDimensionSummary {
  dimension: MasteryDimension
  label: MasteryLabel
  confidence: MasteryConfidence
  capabilityCount: number
  reviewedCapabilityCount: number
  sampleSize: number
  recentReviewCount: number
  modalities: CapabilityModality[]
  sourceKinds: CapabilitySourceKind[]
}

export interface ContentUnitMastery {
  scope: 'content_unit'
  userId: string
  contentUnitId: string
  label: MasteryLabel
  confidence: MasteryConfidence
  assessedCapabilityCount: number
  totalCapabilityCount: number
  dimensions: MasteryDimensionSummary[]
}

export interface PatternMastery {
  scope: 'pattern'
  userId: string
  patternId: string
  label: MasteryLabel
  weakestDimension: MasteryDimension | null
  confidence: MasteryConfidence
  assessedCapabilityCount: number
  totalCapabilityCount: number
  dimensions: MasteryDimensionSummary[]
}

export interface MasteryOverview {
  scope: 'overview'
  userId: string
  generatedAt: string
  label: MasteryLabel
  confidence: MasteryConfidence
  assessedCapabilityCount: number
  totalCapabilityCount: number
  dimensions: MasteryDimensionSummary[]
}

interface SupabaseSchemaClient {
  schema(schema: 'indonesian'): {
    from(table: string): any
  }
}

interface CapabilityContentUnitRow {
  capability_id: string
  relationship_kind?: string
}

interface LearningCapabilityRow {
  id: string
  canonical_key: string
  source_kind: CapabilitySourceKind
  source_ref: string
  capability_type: CapabilityType
  modality: CapabilityModality
  readiness_status: string
  publication_status: string
  lesson_id: string | null
}

interface LearnerCapabilityStateRow {
  capability_id: string
  review_count: number | null
  lapse_count: number | null
  consecutive_failure_count: number | null
  stability: number | null
  last_reviewed_at: string | null
}

function uniq<T>(values: T[]): T[] {
  return [...new Set(values)]
}

function dimensionForCapability(type: CapabilityType): MasteryDimension {
  switch (type) {
    case 'recognise_meaning_from_text_cap':
      return 'recognise_meaning_from_text_cap'
    case 'recall_meaning_from_text_cap':
      return 'meaning_recall'
    case 'recognise_form_from_meaning_cap':
      return 'recognise_form_from_meaning_cap'
    case 'produce_form_from_meaning_cap':
      return 'form_recall'
    case 'recognise_meaning_from_audio_cap':
      return 'listening'
    case 'produce_form_from_audio_cap':
      return 'dictation'
    case 'recognise_grammar_pattern_cap':
      return 'recognise_grammar_pattern_cap'
    case 'contrast_grammar_pattern_cap':
      return 'pattern_use'
    case 'produce_form_from_context_cap':
      return 'produce_form_from_context_cap'
    case 'recognise_word_form_link_cap':
    case 'produce_derived_form_cap':
      return 'morphology'
    case 'recognise_gist_from_audio_cap':
      return 'exposure'
    default: {
      // Exhaustiveness guard: adding a new CapabilityType without a matching
      // dimension fails to compile here instead of silently bucketing it.
      const _exhaustive: never = type
      return _exhaustive
    }
  }
}

function labelForCapability(evidence: CapabilityMasteryEvidence, now: Date): MasteryLabel {
  // Currently failing: distinguish a genuine LAPSE (learned, then forgotten) from a
  // word never learned yet. `lapseCount` is the only counter that survives a
  // failure (stability resets, consecutiveFailureCount is "right now"); FSRS bumps
  // it only when a *graduated* card is forgotten. So failing + lapsed = `at_risk`
  // (self-healing: a correct answer resets consecutiveFailureCount → not at_risk);
  // failing + never-lapsed = still `introduced` — you can't be "at risk of
  // forgetting" a word you never learned. (2026-06-12, see
  // docs/plans/2026-06-12-mastery-ladder-lapse-and-stubborn.md.)
  if (evidence.consecutiveFailureCount > 0) {
    return evidence.lapseCount > 0
      ? 'at_risk'
      : (evidence.lessonActivated ? 'introduced' : 'not_assessed')
  }
  if (evidence.reviewCount === 0) {
    return evidence.lessonActivated ? 'introduced' : 'not_assessed'
  }
  if (isCapabilityMastered(evidence, now)) return 'mastered'
  if (evidence.reviewCount >= 3 || (evidence.stability ?? 0) >= 5) return 'strengthening'
  return 'learning'
}

function confidenceForDimension(input: {
  sampleSize: number
  recentReviewCount: number
  modalities: CapabilityModality[]
  capabilityCount: number
}): MasteryConfidence {
  if (input.sampleSize === 0) return 'none'
  let score = 0
  if (input.sampleSize >= 2) score += 1
  if (input.sampleSize >= 5) score += 1
  if (input.recentReviewCount > 0) score += 1
  if (input.modalities.length > 1) score += 1
  // Slice 4b: the artifact-completeness factor (compatibleArtifactCount ===
  // capabilityCount) is gone — every ready cap renders from its typed table,
  // so this collapses to "the dimension has any capabilities". Inert: live
  // data had all caps artifact-complete, so this awarded the same +1.
  if (input.capabilityCount > 0) score += 1
  if (score >= 4) return 'high'
  if (score >= 2) return 'medium'
  return 'low'
}

function weakestLabel(labels: MasteryLabel[]): MasteryLabel {
  const rank: Record<MasteryLabel, number> = {
    not_assessed: 0,
    introduced: 1,
    learning: 2,
    at_risk: 2,
    strengthening: 3,
    mastered: 4,
  }
  if (labels.length === 0) return 'not_assessed'
  // A word with any genuinely-lapsed cap surfaces as at_risk regardless of its
  // other caps. Post-2026-06-12 this fires only on real lapses (lapseCount > 0);
  // a never-learned failing cap is labelled `introduced`, so it rolls up by rank
  // like any other rung rather than hijacking the word into at_risk.
  if (labels.includes('at_risk')) return 'at_risk'
  return labels.reduce((weakest, label) => rank[label] < rank[weakest] ? label : weakest, labels[0]!)
}

function aggregateConfidence(dimensions: MasteryDimensionSummary[]): MasteryConfidence {
  const rank: Record<MasteryConfidence, number> = { none: 0, low: 1, medium: 2, high: 3 }
  const assessed = dimensions.filter(dimension => dimension.confidence !== 'none')
  if (assessed.length === 0) return 'none'
  const min = assessed.reduce((current, dimension) => (
    rank[dimension.confidence] < rank[current] ? dimension.confidence : current
  ), assessed[0]!.confidence)
  return min
}

function missingDimensionSummary(dimension: MasteryDimension): MasteryDimensionSummary {
  return {
    dimension,
    label: 'not_assessed',
    confidence: 'none',
    capabilityCount: 0,
    reviewedCapabilityCount: 0,
    sampleSize: 0,
    recentReviewCount: 0,
    modalities: [],
    sourceKinds: [],
  }
}

function ensureDimensions(
  dimensions: MasteryDimensionSummary[],
  requiredDimensions: MasteryDimension[],
): MasteryDimensionSummary[] {
  const byDimension = new Map(dimensions.map(dimension => [dimension.dimension, dimension]))
  for (const dimension of requiredDimensions) {
    if (!byDimension.has(dimension)) {
      byDimension.set(dimension, missingDimensionSummary(dimension))
    }
  }
  return [...byDimension.values()].sort((a, b) => a.dimension.localeCompare(b.dimension))
}

export function deriveMasteryDimensions(
  evidence: CapabilityMasteryEvidence[],
  now: Date = new Date(),
): MasteryDimensionSummary[] {
  const byDimension = new Map<MasteryDimension, CapabilityMasteryEvidence[]>()
  for (const item of evidence) {
    const dimension = dimensionForCapability(item.capabilityType)
    byDimension.set(dimension, [...(byDimension.get(dimension) ?? []), item])
  }

  return [...byDimension.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dimension, items]) => {
      const labels = items.map(item => labelForCapability(item, now))
      const sampleSize = items.reduce((sum, item) => sum + item.reviewCount, 0)
      const recentReviewCount = items.filter(item => isRecent(item.lastReviewedAt, now)).length
      const modalities = uniq(items.map(item => item.modality)).sort()
      const sourceKinds = uniq(items.map(item => item.sourceKind)).sort()
      const reviewedCapabilityCount = items.filter(item => item.reviewCount > 0).length

      return {
        dimension,
        label: weakestLabel(labels),
        confidence: confidenceForDimension({
          sampleSize,
          recentReviewCount,
          modalities,
          capabilityCount: items.length,
        }),
        capabilityCount: items.length,
        reviewedCapabilityCount,
        sampleSize,
        recentReviewCount,
        modalities,
        sourceKinds,
      }
    })
}

export function deriveContentUnitMastery(input: {
  userId: string
  contentUnitId: string
  evidence: CapabilityMasteryEvidence[]
  now?: Date
}): ContentUnitMastery {
  const dimensions = deriveMasteryDimensions(input.evidence, input.now)
  return {
    scope: 'content_unit',
    userId: input.userId,
    contentUnitId: input.contentUnitId,
    label: weakestLabel(dimensions.map(dimension => dimension.label)),
    confidence: aggregateConfidence(dimensions),
    assessedCapabilityCount: input.evidence.filter(item => item.reviewCount > 0).length,
    totalCapabilityCount: input.evidence.length,
    dimensions,
  }
}

export function derivePatternMastery(input: {
  userId: string
  patternId: string
  evidence: CapabilityMasteryEvidence[]
  now?: Date
}): PatternMastery {
  const dimensions = ensureDimensions(
    deriveMasteryDimensions(input.evidence, input.now),
    ['recognise_grammar_pattern_cap', 'pattern_use'],
  )
  const weakest = weakestLabel(dimensions.map(dimension => dimension.label))
  return {
    scope: 'pattern',
    userId: input.userId,
    patternId: input.patternId,
    label: weakest,
    weakestDimension: dimensions.find(dimension => dimension.label === weakest)?.dimension ?? null,
    confidence: aggregateConfidence(dimensions),
    assessedCapabilityCount: input.evidence.filter(item => item.reviewCount > 0).length,
    totalCapabilityCount: input.evidence.length,
    dimensions,
  }
}

export function deriveMasteryOverview(input: {
  userId: string
  evidence: CapabilityMasteryEvidence[]
  now?: Date
}): MasteryOverview {
  const now = input.now ?? new Date()
  const dimensions = deriveMasteryDimensions(input.evidence, now)
  return {
    scope: 'overview',
    userId: input.userId,
    generatedAt: now.toISOString(),
    label: weakestLabel(dimensions.map(dimension => dimension.label)),
    confidence: aggregateConfidence(dimensions),
    assessedCapabilityCount: input.evidence.filter(item => item.reviewCount > 0).length,
    totalCapabilityCount: input.evidence.length,
    dimensions,
  }
}

// ---- Mastery progression funnels (Learner Progress Axis 2, #208/#209) ----
//
// The ladder shown as a distribution: each learnable unit (a vocab word or a
// grammar topic — keyed by source_ref) is rolled up weakest-wins to one rung,
// then counted per rung. Split by content type so vocab and grammar (which grow
// at different rates) read separately. Derived client-side over the evidence
// getMasteryOverview already fetches (data-architect Q-C) — no RPC.

export type MasteryFunnel = Record<MasteryLabel, number>

export interface MasteryFunnels {
  vocabulary: MasteryFunnel
  grammar: MasteryFunnel
}

const GRAMMAR_SOURCE_KINDS = new Set(['grammar_pattern_src', 'word_form_pair_src'])

/**
 * The single source of truth for the vocab/grammar split shared by EVERY
 * mastery-progression surface: the funnel (`deriveMasteryFunnel`), the home
 * weekly-movement pulse (`deriveWeeklyMovement`), and the HC28 parity check.
 * `null` = a source kind outside the funnel (`dialogue_line`, `podcast`), which
 * is excluded from both the funnel and movement. The SQL side
 * (`get_weekly_movement`, `get_lessons_overview`) mirrors this same rule and is
 * held in lockstep by the parity tests + HC27/HC28 (ADR 0015). Change the split
 * here and every TS surface follows in one edit.
 */
export function funnelBucket(sourceKind: CapabilitySourceKind): 'vocab' | 'grammar' | null {
  if (sourceKind === 'vocabulary_src') return 'vocab'
  if (GRAMMAR_SOURCE_KINDS.has(sourceKind)) return 'grammar'
  return null
}

function emptyFunnel(): MasteryFunnel {
  return {
    not_assessed: 0,
    introduced: 0,
    learning: 0,
    strengthening: 0,
    mastered: 0,
    at_risk: 0,
  }
}

export function deriveMasteryFunnel(input: {
  evidence: CapabilityMasteryEvidence[]
  now?: Date
}): MasteryFunnels {
  const now = input.now ?? new Date()
  const vocab = new Map<string, CapabilityMasteryEvidence[]>()
  const grammar = new Map<string, CapabilityMasteryEvidence[]>()
  for (const e of input.evidence) {
    const b = funnelBucket(e.sourceKind)
    if (!b) continue
    const bucket = b === 'vocab' ? vocab : grammar
    bucket.set(e.sourceRef, [...(bucket.get(e.sourceRef) ?? []), e])
  }
  const tally = (units: Map<string, CapabilityMasteryEvidence[]>): MasteryFunnel => {
    const funnel = emptyFunnel()
    for (const caps of units.values()) {
      funnel[weakestLabel(caps.map(cap => labelForCapability(cap, now)))] += 1
    }
    return funnel
  }
  return { vocabulary: tally(vocab), grammar: tally(grammar) }
}

// The same vocab/grammar funnels, split per introducing lesson (order_index).
// A unit (word / pattern) lands in exactly one lesson bucket — its capabilities
// share one introducing lesson (ADR 0006) — so this is just deriveMasteryFunnel
// run over each lesson's slice. Caps with no lessonNumber (podcast) are skipped.
export function deriveMasteryFunnelByLesson(input: {
  evidence: CapabilityMasteryEvidence[]
  now?: Date
}): Map<number, MasteryFunnels> {
  const now = input.now ?? new Date()
  const byLesson = new Map<number, CapabilityMasteryEvidence[]>()
  for (const e of input.evidence) {
    if (e.lessonNumber == null) continue
    byLesson.set(e.lessonNumber, [...(byLesson.get(e.lessonNumber) ?? []), e])
  }
  const result = new Map<number, MasteryFunnels>()
  for (const [lessonNumber, caps] of byLesson) {
    result.set(lessonNumber, deriveMasteryFunnel({ evidence: caps, now }))
  }
  return result
}

// ── Stubborn ("moeilijk") words — an ACQUISITION-difficulty signal, distinct from
// at_risk (a RETENTION loss). A word never learned (`lapseCount === 0`) that the
// learner keeps failing (`consecutiveFailureCount >= STUBBORN_THRESHOLD`) needs a
// different *strategy* — mnemonic / add context / deconstruct — not more reps (the
// "labor in vain" finding; the bottleneck is encoding, not retrieval). Self-
// clearing: a correct answer resets consecutiveFailureCount → 0 → it leaves the
// list and becomes `learning`. It is NOT a MasteryLabel and NOT a funnel rung (the
// rung stays `introduced` — it hasn't progressed); it's a separate callout.
// Threshold 4 (a TS constant): Anki's leech default of 8 is a *retention* concept
// and deliberately generous; for acquisition the evidence says intervene earlier.
// (2026-06-12, docs/plans/2026-06-12-mastery-ladder-lapse-and-stubborn.md.)
export const STUBBORN_THRESHOLD = 4

export function isStubborn(evidence: CapabilityMasteryEvidence): boolean {
  return evidence.lapseCount === 0
    && evidence.reviewCount > 0
    && evidence.consecutiveFailureCount >= STUBBORN_THRESHOLD
}

export interface StubbornWord {
  sourceRef: string
  sourceKind: CapabilitySourceKind
  /** The specific skill (capability type) being repeatedly failed. */
  capabilityType: CapabilityType
  consecutiveFailures: number
}

// any-cap-stubborn → the word is "moeilijk"; one entry per stubborn capability so
// the callout can name the specific failing skill, hardest first.
export function deriveStubbornWords(input: { evidence: CapabilityMasteryEvidence[] }): StubbornWord[] {
  return input.evidence
    .filter(isStubborn)
    .map(e => ({
      sourceRef: e.sourceRef,
      sourceKind: e.sourceKind,
      capabilityType: e.capabilityType,
      consecutiveFailures: e.consecutiveFailureCount,
    }))
    .sort((a, b) => b.consecutiveFailures - a.consecutiveFailures)
}

// One of a grammar pattern's two skill dimensions (recognise the rule / apply it):
// its rolled-up rung plus how many times the learner has practised it.
export interface GrammarDimensionProgress {
  label: MasteryLabel
  reviewCount: number
}

export interface GrammarTopicLabel {
  slug: string
  /** Lesson that introduces the pattern, parsed from the `lesson-N/...` source_ref. */
  lessonNumber: number | null
  /** Weakest-wins across both dimensions — the one rung the lesson funnel tallies. */
  label: MasteryLabel
  /** Total reviews across the pattern's capabilities ("N× geoefend"). */
  reviewCount: number
  /** `recognise_grammar_pattern_cap` caps; null if the pattern has none. */
  recognise: GrammarDimensionProgress | null
  /** `contrast_grammar_pattern_cap` caps — distinguishing from a contrasting pattern (also a
   *  receptive facet per CONTEXT capability types); null if the pattern has none. */
  contrast: GrammarDimensionProgress | null
}

export interface GrammarTopic extends GrammarTopicLabel {
  name: string
  shortExplanation: string
}

// A pattern cap's source_ref is `lesson-N/pattern-<slug>`; the introducing lesson
// number drives the voortgang grouping. `null` if the envelope is absent.
function lessonNumberFromSourceRef(sourceRef: string): number | null {
  const match = sourceRef.match(/^lesson-(\d+)\//)
  return match ? Number(match[1]) : null
}

function dimensionProgress(
  caps: CapabilityMasteryEvidence[],
  now: Date,
): GrammarDimensionProgress | null {
  if (caps.length === 0) return null
  return {
    label: weakestLabel(caps.map((cap) => labelForCapability(cap, now))),
    reviewCount: caps.reduce((sum, cap) => sum + cap.reviewCount, 0),
  }
}

// Named grammar topics (source_kind 'pattern' only — affixed_form_pairs are not
// named grammar_patterns). Each pattern splits into its two (both receptive,
// per CONTEXT capability types) dimensions — `recognise` (recognise_grammar_pattern_cap)
// and `contrast` (contrast_grammar_pattern_cap) — plus a weakest-wins overall rung (what the
// lesson funnel tallies) and total reviews.
// Sorted by introducing lesson then slug (the learning order the UI groups on).
// Used by the voortgang grammar-topics drill-down (#209).
export function deriveGrammarTopics(input: {
  evidence: CapabilityMasteryEvidence[]
  now?: Date
}): GrammarTopicLabel[] {
  const now = input.now ?? new Date()
  const bySlug = new Map<string, CapabilityMasteryEvidence[]>()
  for (const e of input.evidence) {
    if (e.sourceKind !== 'grammar_pattern_src') continue
    bySlug.set(e.sourceRef, [...(bySlug.get(e.sourceRef) ?? []), e])
  }
  return [...bySlug.entries()]
    .map(([slug, caps]) => ({
      slug,
      lessonNumber: lessonNumberFromSourceRef(slug),
      label: weakestLabel(caps.map((cap) => labelForCapability(cap, now))),
      reviewCount: caps.reduce((sum, cap) => sum + cap.reviewCount, 0),
      recognise: dimensionProgress(caps.filter((c) => c.capabilityType === 'recognise_grammar_pattern_cap'), now),
      contrast: dimensionProgress(caps.filter((c) => c.capabilityType === 'contrast_grammar_pattern_cap'), now),
    }))
    .sort((a, b) => {
      const la = a.lessonNumber ?? Number.POSITIVE_INFINITY
      const lb = b.lessonNumber ?? Number.POSITIVE_INFINITY
      return la !== lb ? la - lb : a.slug.localeCompare(b.slug)
    })
}

// ---- Vocabulary skill profile (receptive / productive / aural, #211) ----
//
// The literature's receptive-vs-productive vocabulary distinction (Webb 2008;
// Laufer & Nation 1999): you recognise far more WORDS than you can produce, and
// the receptive/productive split is measured per word as a vocabulary *size* — a
// count of words that climbs — not as a ratio over capabilities. So this counts
// DISTINCT WORDS per mode (deduped by source_ref; a word has up to 3 recognise
// caps, 2 produce, 2 listen): `knownWords` = words solid in this mode (ANY of the
// word's mode-caps mastered/strengthening), `practisedWords` = words with any
// mode-cap in scheduling (the denominator). Reporting an absolute count (Anki
// mature cards, Nation's VST) avoids the old faults: a ratio over a growing pile
// can't climb, and "capabilities" labelled "words" invited a false funnel
// reconciliation. Grammar has its own funnel/topics and is excluded here.

export type SkillMode = 'recognise' | 'produce' | 'listen'

export interface SkillModeGap {
  mode: SkillMode
  /** Distinct words solid in this mode (ANY mode-cap mastered/strengthening). */
  knownWords: number
  /** Distinct words with any mode-cap in scheduling (the denominator). */
  practisedWords: number
  /** knownWords / practisedWords as a 0–100 percentage (a quality ratio, not the headline). */
  strongPct: number
  confidence: MasteryConfidence
}

// Item (vocabulary) capability types → skill mode. Grammar/morphology types are
// not item-sourced and never reach here.
const ITEM_TYPE_MODE: Partial<Record<CapabilityType, SkillMode>> = {
  recognise_meaning_from_text_cap: 'recognise',
  recall_meaning_from_text_cap: 'recognise',
  recognise_form_from_meaning_cap: 'recognise',
  produce_form_from_meaning_cap: 'produce',
  produce_form_from_context_cap: 'produce',
  recognise_meaning_from_audio_cap: 'listen',
  produce_form_from_audio_cap: 'listen',
}

// Already the receptive→productive→aural progression order; the card numbers the
// stages ①②③ from it (a learning sequence, not a ranking — listening trails
// because it is scheduled last, by design, not because the learner is weaker).
const SKILL_MODES: SkillMode[] = ['recognise', 'produce', 'listen']

export function deriveSkillModeGaps(input: {
  evidence: CapabilityMasteryEvidence[]
  now?: Date
}): SkillModeGap[] {
  const now = input.now ?? new Date()
  // Per mode, map each WORD (source_ref) → is it solid in this mode (any of its
  // caps in this mode mastered/strengthening). The map size is practisedWords.
  const byMode = new Map<SkillMode, Map<string, boolean>>(
    SKILL_MODES.map((m) => [m, new Map<string, boolean>()]),
  )
  for (const cap of input.evidence) {
    if (cap.sourceKind !== 'vocabulary_src') continue
    const mode = ITEM_TYPE_MODE[cap.capabilityType]
    if (!mode) continue
    const words = byMode.get(mode)!
    const label = labelForCapability(cap, now)
    const solid = label === 'mastered' || label === 'strengthening'
    words.set(cap.sourceRef, (words.get(cap.sourceRef) ?? false) || solid)
  }
  return SKILL_MODES.map((mode) => {
    const words = byMode.get(mode)!
    const practisedWords = words.size
    let knownWords = 0
    for (const isSolid of words.values()) if (isSolid) knownWords += 1
    return {
      mode,
      knownWords,
      practisedWords,
      strongPct: practisedWords === 0 ? 0 : Math.round((knownWords / practisedWords) * 100),
      // Confidence gates the surface: <5 WORDS in a mode = "not enough data yet".
      confidence: practisedWords === 0 ? 'none' : practisedWords < 5 ? 'low' : practisedWords < 20 ? 'medium' : 'high',
    }
  })
}

// ---- Weekly movement (the fast pulse on the slow axis, #210) ----
//
// Rung transitions recomputed from the FSRS state snapshots on each review event
// (ADR 0016 — no label_history table). A capability "advanced" if any review in
// the window moved it up the ladder; counts are distinct-capability so multiple
// reviews of one word in a week count once. The server-side get_weekly_movement
// RPC mirrors this in SQL; this pure function is the ADR-0015 parity reference.

export interface MovementState {
  reviewCount: number
  lapseCount: number
  consecutiveFailureCount: number
  stability: number | null
  lastReviewedAt: string | null
}

export interface WeeklyReviewEvent {
  // The learnable unit (word / grammar topic). Counts dedup on this — NOT on
  // capability_id — so movement stays in the same unit as the funnel (a word has
  // several capabilities; per-cap counts overstate and can exceed words in play).
  sourceRef: string
  // Buckets movement into the SAME two groups as the funnel: vocab ('item') vs
  // grammar ('pattern' + 'word_form_pair_src'). Other kinds (dialogue_line,
  // podcast) are excluded — they aren't in the funnel either.
  sourceKind: CapabilitySourceKind
  before: MovementState
  after: MovementState
}

export interface WeeklyMovement {
  /** Distinct vocabulary words (source_kind 'item') that advanced a rung. */
  advancedVocab: number
  /** Distinct grammar topics (pattern + word_form_pair_src) that advanced a rung. */
  advancedGrammar: number
  reachedMastered: number
  slipped: number
}

const LABEL_RANK: Record<MasteryLabel, number> = {
  not_assessed: 0,
  introduced: 1,
  learning: 2,
  at_risk: 2,
  strengthening: 3,
  mastered: 4,
}

// A review event's capability is, by definition, lesson-activated (it is being
// reviewed); the other evidence fields don't affect labelForCapability.
function labelFromState(state: MovementState, now: Date): MasteryLabel {
  return labelForCapability(
    {
      capabilityId: '',
      canonicalKey: '',
      sourceKind: 'vocabulary_src',
      sourceRef: '',
      capabilityType: 'recognise_meaning_from_text_cap',
      modality: 'text',
      readinessStatus: 'ready',
      publicationStatus: 'published',
      lessonActivated: true,
      lessonNumber: null,
      reviewCount: state.reviewCount,
      lapseCount: state.lapseCount,
      consecutiveFailureCount: state.consecutiveFailureCount,
      stability: state.stability,
      lastReviewedAt: state.lastReviewedAt,
    },
    now,
  )
}

export function deriveWeeklyMovement(input: {
  events: WeeklyReviewEvent[]
  now?: Date
}): WeeklyMovement {
  const now = input.now ?? new Date()
  const advancedVocab = new Set<string>()
  const advancedGrammar = new Set<string>()
  const reachedMastered = new Set<string>()
  const slipped = new Set<string>()
  for (const event of input.events) {
    // Same vocab/grammar split + scope as the funnel — shared via funnelBucket.
    const b = funnelBucket(event.sourceKind)
    if (!b) continue
    const bucket = b === 'vocab' ? advancedVocab : advancedGrammar
    const before = labelFromState(event.before, now)
    const after = labelFromState(event.after, now)
    if (LABEL_RANK[after] > LABEL_RANK[before]) bucket.add(event.sourceRef)
    if (after === 'mastered' && before !== 'mastered') reachedMastered.add(event.sourceRef)
    if (after === 'at_risk' && before !== 'at_risk') slipped.add(event.sourceRef)
  }
  return {
    advancedVocab: advancedVocab.size,
    advancedGrammar: advancedGrammar.size,
    reachedMastered: reachedMastered.size,
    slipped: slipped.size,
  }
}

function toEvidence(input: {
  capabilities: LearningCapabilityRow[]
  states: LearnerCapabilityStateRow[]
  activatedLessons: Set<string>
  lessonOrderById: Map<string, number>
}): CapabilityMasteryEvidence[] {
  const stateByCapabilityId = new Map(input.states.map(state => [state.capability_id, state]))

  return input.capabilities.map(capability => {
    const state = stateByCapabilityId.get(capability.id)
    // Per ADR 0006 (Decision 3b), the only capabilities with NULL lesson_id
    // are podcast source kinds (`podcast_segment_src`, `podcast_phrase_src`); they
    // are always treated as activated because they are not lesson-scoped.
    // Every other source kind has a non-null lesson_id enforced by the schema
    // CHECK constraint `learning_capabilities_lesson_id_required_for_lessons`
    // (scripts/migration.sql); those caps are gated on the activation set.
    const lessonActivated = capability.lesson_id == null
      || input.activatedLessons.has(capability.lesson_id)
    const lessonNumber = capability.lesson_id == null
      ? null
      : input.lessonOrderById.get(capability.lesson_id) ?? null
    return {
      capabilityId: capability.id,
      canonicalKey: capability.canonical_key,
      sourceKind: capability.source_kind,
      sourceRef: capability.source_ref,
      capabilityType: capability.capability_type,
      modality: capability.modality,
      readinessStatus: capability.readiness_status,
      publicationStatus: capability.publication_status,
      lessonActivated,
      lessonNumber,
      reviewCount: state?.review_count ?? 0,
      lapseCount: state?.lapse_count ?? 0,
      consecutiveFailureCount: state?.consecutive_failure_count ?? 0,
      stability: state?.stability ?? null,
      lastReviewedAt: state?.last_reviewed_at ?? null,
    }
  })
}

export function createMasteryModel(client: SupabaseSchemaClient) {
  const db = () => client.schema('indonesian')

  async function capabilityRowsByIds(ids: string[]): Promise<LearningCapabilityRow[]> {
    // Chunk the .in() — a learner can have thousands of capabilities, and an
    // un-chunked .in('id', [thousands]) blows the request-URL length limit
    // ("TypeError: Load failed" in the browser). Mirrors learnerStates below.
    return chunkedIn<LearningCapabilityRow>(
      'learning_capabilities',
      'id',
      ids,
      (b) => b
        .select('id, canonical_key, source_kind, source_ref, capability_type, modality, readiness_status, publication_status, lesson_id')
        .is('retired_at', null),
      client,
    )
  }

  async function learnerStates(userId: string, capabilityIds: string[]): Promise<LearnerCapabilityStateRow[]> {
    return chunkedIn<LearnerCapabilityStateRow>(
      'learner_capability_state',
      'capability_id',
      capabilityIds,
      (b) => b.select('capability_id, review_count, lapse_count, consecutive_failure_count, stability, last_reviewed_at').eq('user_id', userId),
      client,
    )
  }

  // lesson_id → order_index ("Les N"), so evidence can carry the introducing
  // lesson number for per-lesson funnels. One small unfiltered read.
  async function lessonOrderMap(): Promise<Map<string, number>> {
    const { data, error } = await db().from('lessons').select('id, order_index')
    if (error) throw error
    return new Map(((data ?? []) as Array<{ id: string; order_index: number }>).map(l => [l.id, l.order_index]))
  }

  async function evidenceForCapabilities(userId: string, capabilities: LearningCapabilityRow[]): Promise<CapabilityMasteryEvidence[]> {
    const capabilityIds = capabilities.map(capability => capability.id)
    const [states, activatedLessons, lessonOrderById] = await Promise.all([
      learnerStates(userId, capabilityIds),
      listActivatedLessons(userId, client),
      lessonOrderMap(),
    ])
    return toEvidence({ capabilities, states, activatedLessons, lessonOrderById })
  }

  // The learner's full evidence set — every capability with a state row, joined to
  // its capability + activation + lesson-number. Shared by the overview, funnel,
  // skill, grammar and stubborn readers (all previously duplicated this fetch).
  async function allLearnerEvidence(userId: string): Promise<CapabilityMasteryEvidence[]> {
    const { data: stateRows, error: stateError } = await db()
      .from('learner_capability_state')
      .select('capability_id, review_count, lapse_count, consecutive_failure_count, stability, last_reviewed_at')
      .eq('user_id', userId)
    if (stateError) throw stateError
    const states = (stateRows ?? []) as LearnerCapabilityStateRow[]
    const capabilities = await capabilityRowsByIds(uniq(states.map(state => state.capability_id)))
    const [activatedLessons, lessonOrderById] = await Promise.all([
      listActivatedLessons(userId, client),
      lessonOrderMap(),
    ])
    return toEvidence({ capabilities, states, activatedLessons, lessonOrderById })
  }

  return {
    async getContentUnitMastery(contentUnitId: string, userId: string): Promise<ContentUnitMastery> {
      const { data, error } = await db()
        .from('capability_content_units')
        .select('capability_id, relationship_kind')
        .eq('content_unit_id', contentUnitId)
      if (error) throw error
      const links = (data ?? []) as CapabilityContentUnitRow[]
      const capabilities = await capabilityRowsByIds(uniq(links.map(link => link.capability_id)))
      const evidence = await evidenceForCapabilities(userId, capabilities)
      return deriveContentUnitMastery({ userId, contentUnitId, evidence })
    },

    async getPatternMastery(patternId: string, userId: string): Promise<PatternMastery> {
      const { data, error } = await db()
        .from('learning_capabilities')
        .select('id, canonical_key, source_kind, source_ref, capability_type, modality, readiness_status, publication_status, lesson_id')
        .eq('source_kind', 'grammar_pattern_src')
        .eq('source_ref', patternId)
        .is('retired_at', null)
      if (error) throw error
      const capabilities = (data ?? []) as LearningCapabilityRow[]
      const evidence = await evidenceForCapabilities(userId, capabilities)
      return derivePatternMastery({ userId, patternId, evidence })
    },

    async getMasteryOverview(userId: string): Promise<MasteryOverview> {
      const evidence = await allLearnerEvidence(userId)
      return deriveMasteryOverview({ userId, evidence })
    },

    async getMasteryFunnel(userId: string): Promise<MasteryFunnels> {
      const evidence = await allLearnerEvidence(userId)
      return deriveMasteryFunnel({ evidence })
    },

    // Both the all-lessons funnels and the per-lesson breakdown in one fetch, for
    // the Woordenschat / Grammatica panels (landing = all, filter = per lesson).
    async getMasteryFunnels(userId: string): Promise<{ all: MasteryFunnels; byLesson: Map<number, MasteryFunnels> }> {
      const evidence = await allLearnerEvidence(userId)
      return {
        all: deriveMasteryFunnel({ evidence }),
        byLesson: deriveMasteryFunnelByLesson({ evidence }),
      }
    },

    async getSkillModeGaps(userId: string): Promise<SkillModeGap[]> {
      const evidence = await allLearnerEvidence(userId)
      return deriveSkillModeGaps({ evidence })
    },

    async getGrammarTopics(userId: string): Promise<GrammarTopic[]> {
      const evidence = await allLearnerEvidence(userId)
      const topics = deriveGrammarTopics({ evidence })
      if (topics.length === 0) return []
      // `topic.slug` is the capability source_ref (`lesson-N/pattern-<slug>`);
      // grammar_patterns is keyed by the bare `<slug>`. Strip the envelope before
      // the join — otherwise nothing matches and the row falls back to printing
      // the raw source_ref (the "lesson-N/pattern-…" noise). Shared helper so this
      // reader and the grammar exercise reader can't drift.
      const patternSlugByTopic = new Map(
        topics.map(topic => [topic.slug, patternSlugFromSourceRef(topic.slug)] as const),
      )
      const { data: patternRows, error: patternError } = await db()
        .from('grammar_patterns')
        .select('slug, name, short_explanation')
        .in('slug', [...new Set(patternSlugByTopic.values())])
      if (patternError) throw patternError
      const rows = (patternRows ?? []) as Array<{ slug: string; name: string; short_explanation: string }>
      const bySlug = new Map(rows.map(p => [p.slug, p] as const))
      return topics.map(topic => {
        const patternSlug = patternSlugByTopic.get(topic.slug)!
        const row = bySlug.get(patternSlug)
        return {
          ...topic,
          name: row?.name ?? patternSlug,
          shortExplanation: row?.short_explanation ?? '',
        }
      })
    },

    async getStubbornWords(userId: string): Promise<StubbornWord[]> {
      const evidence = await allLearnerEvidence(userId)
      return deriveStubbornWords({ evidence })
    },
  }
}

async function defaultModel() {
  const { supabase } = await import('@/lib/supabase')
  return createMasteryModel(supabase)
}

export async function getContentUnitMastery(contentUnitId: string, userId: string): Promise<ContentUnitMastery> {
  return (await defaultModel()).getContentUnitMastery(contentUnitId, userId)
}

export async function getPatternMastery(patternId: string, userId: string): Promise<PatternMastery> {
  return (await defaultModel()).getPatternMastery(patternId, userId)
}

export async function getMasteryFunnel(userId: string): Promise<MasteryFunnels> {
  return (await defaultModel()).getMasteryFunnel(userId)
}

export async function getMasteryFunnels(userId: string): Promise<{ all: MasteryFunnels; byLesson: Map<number, MasteryFunnels> }> {
  return (await defaultModel()).getMasteryFunnels(userId)
}

export async function getGrammarTopics(userId: string): Promise<GrammarTopic[]> {
  return (await defaultModel()).getGrammarTopics(userId)
}

export async function getSkillModeGaps(userId: string): Promise<SkillModeGap[]> {
  return (await defaultModel()).getSkillModeGaps(userId)
}

export async function getStubbornWords(userId: string): Promise<StubbornWord[]> {
  return (await defaultModel()).getStubbornWords(userId)
}

// Server-side aggregation (ADR 0015 — small result, bounded window): the SQL
// get_weekly_movement mirrors labelForCapability over the event JSON snapshots.
export async function getWeeklyMovement(userId: string, timezone: string): Promise<WeeklyMovement> {
  const { supabase } = await import('@/lib/supabase')
  const { data, error } = await supabase
    .schema('indonesian')
    .rpc('get_weekly_movement', { p_user_id: userId, p_timezone: timezone })
  if (error) throw error
  const row = (data ?? {}) as {
    advanced_vocab?: number; advanced_grammar?: number
    reached_mastered?: number; slipped?: number
  }
  return {
    advancedVocab: row.advanced_vocab ?? 0,
    advancedGrammar: row.advanced_grammar ?? 0,
    reachedMastered: row.reached_mastered ?? 0,
    slipped: row.slipped ?? 0,
  }
}

export async function getMasteryOverview(userId: string): Promise<MasteryOverview> {
  return (await defaultModel()).getMasteryOverview(userId)
}
