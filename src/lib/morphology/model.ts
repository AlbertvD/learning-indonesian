// lib/morphology — view model for the Affix Trainer (the morphology Study-tab
// surface). These are the camelCase shapes the components render; the adapter
// maps the snake_case DB rows into the raw snapshot, and catalog/family/practice
// fold that snapshot + the learner's mastery into these views.
//
// This module is a LENS, not a scheduler: it does filtered reads + a scoped-session
// launch. It must NOT import lib/session-builder (target-architecture Rule 7 —
// session-builder consumes the trainer's affix scope by route, not the reverse).

import type { AffixType, CefrLevel } from '@/lib/capabilities'
import type { MasteryLabel } from '@/lib/analytics/mastery/masteryModel'

export type { AffixType, CefrLevel } from '@/lib/capabilities'
export type { MasteryLabel } from '@/lib/analytics/mastery/masteryModel'

/** The mini-funnel distribution + headline counts for one affix's derivations.
 *  A "derivation" is one source_ref (one affixed pair, weakest-wins across its
 *  caps). Reuses the canonical mastery rungs — nothing morphology-specific is
 *  invented (the per-affix tile is a per-affix roll-up; it never calls
 *  funnelBucket, so it does not depend on the item-C analytics re-partition). */
export interface AffixProgress {
  /** Weakest-wins rung across all the affix's derivations (the headline rung). */
  label: MasteryLabel
  /** Count of derivations at each rung — the tile's mini-funnel. */
  funnel: Record<MasteryLabel, number>
  /** Derivations rolled up to `mastered`. */
  masteredCount: number
  /** Derivations the learner has practised at least once (any review). */
  practisedCount: number
  /** Total derivations (affixed pairs) for the affix. */
  totalCount: number
}

/** One tile in the sequenced affix catalog grid. */
export interface AffixCatalogTile {
  affix: string
  affixType: AffixType
  gloss: string
  /** Research teaching-sequence rank — the grid sorts ascending by this. */
  rank: number
  cefrLevel: CefrLevel
  /** True once the affix's introducing lesson is activated (ADR 0006). The
   *  trainer REFLECTS the lesson-based introduction; it invents no unlock engine. */
  available: boolean
  /** Lowest introducing lesson number across the affix's derivations (null until
   *  content exists). */
  introLessonNumber: number | null
  progress: AffixProgress
}

/** One derived form in a word family, status-marked. */
export interface DerivedForm {
  derivedText: string
  /** The affix that built it (catalog label). */
  affix: string
  /** Rule-formed (productive) vs lexicalised "vocab, not rule-formed" (frozen).
   *  Driven by affixed_form_pairs.productive — research open-Q3. */
  productive: boolean
  /** Weakest-wins rung across this form's caps. */
  label: MasteryLabel
  /** Harvested example sentence containing the derived form (ADR 0019, nullable). */
  carrierText: string | null
  /** The derived form's meaning in the learner's language (Fix 3; language-resolved
   *  from derived_gloss_nl/_en, no cross-language fallback). Null when un-glossed. */
  derivedMeaning: string | null
}

/** A root and every derivation of it the learner can encounter (cross-affix). */
export interface WordFamily {
  rootText: string
  /** Root gloss in the learner's language, from the learning_items join (item B /
   *  itemSlug). Null when the root has no vocabulary row. */
  rootMeaning: string | null
  /** True when the root is a known vocabulary item (exists + mastered/strengthening).
   *  Unknown roots are shown but flagged — they gate the produce drills (the hard
   *  block, ADR 0018), which the session engine enforces; the trainer reflects it. */
  rootKnown: boolean
  /** Every derived form of the root, across affixes (the "one root → many words"
   *  multiplier), each status-marked. */
  forms: DerivedForm[]
}

/** A worked example for the rule card. */
export interface AffixExample {
  rootText: string
  derivedText: string
  carrierText: string | null
  /** The derived form's meaning in the learner's language (Fix 3; null = un-glossed). */
  derivedMeaning: string | null
}

/** The introducing lesson + its grammar rule for an affix. */
export interface AffixRuleSource {
  lessonNumber: number | null
  lessonId: string | null
  /** The grammar pattern that teaches the rule (slug + name + short explanation). */
  patternSlug: string | null
  patternName: string | null
  patternExplanation: string | null
}

/** The full affix-detail view: rule card + word-family explorer + practice launch. */
export interface AffixDetail {
  affix: string
  affixType: AffixType
  gloss: string
  rank: number
  cefrLevel: CefrLevel
  available: boolean
  /** All allomorph classes (e.g. me-/mem-/men-/meny-/meng-/menge-) from the catalog;
   *  empty for non-allomorphic affixes. */
  allomorphClasses: string[]
  /** Representative formation/allomorph rule prose (affixed_form_pairs.allomorph_rule),
   *  null until content exists. */
  ruleNote: string | null
  rule: AffixRuleSource
  examples: AffixExample[]
  families: WordFamily[]
  progress: AffixProgress
  /** The affix's ready+published cap source_refs — the scope handed to the
   *  scoped-session launch (mode=affix_practice). Empty → nothing to practise. */
  practiceSourceRefs: string[]
}

/** The resolved affix scope the Session page feeds buildSession (mirrors
 *  loadSelectedLessonScope's return). selectedSourceRefs only — an affix has no
 *  single lesson. */
export interface AffixScope {
  selectedSourceRefs: string[]
}
