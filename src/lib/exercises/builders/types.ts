// Shared types for capabilityContentService builders.
// See docs/plans/2026-05-02-capability-content-service-spec.md §6.1.

import type {
  ExerciseItem,
  LearningItem,
  ItemMeaning,
  ItemContext,
  ItemAnswerVariant,
  ExerciseVariant,
} from '@/types/learning'
import type { SessionBlock } from '@/lib/session/sessionPlan'
import type { ArtifactKind } from '@/lib/capabilities/capabilityTypes'
import type { CapabilityArtifact } from '@/lib/capabilities/artifactRegistry'
import type { ResolutionReasonCode } from '@/services/capabilityContentService'

export interface BuilderInput {
  block: SessionBlock
  /** null only for grammar/pattern-anchored exercises (out of PR-2 scope). */
  learningItem: LearningItem | null
  /** All meanings for the item, both languages. The builder picks per
   *  userLanguage with fallback. */
  meanings: ItemMeaning[]
  /** All contexts for the item; per-type filtering done in the builder. */
  contexts: ItemContext[]
  /** Acceptable answer variants — used by typed_recall fuzzy matching. */
  answerVariants: ItemAnswerVariant[]
  /** Active variant row for this (item, exerciseType) — null if none. */
  variant: ExerciseVariant | null
  /** Approved capability artifacts indexed by ArtifactKind for cheap lookup. */
  artifactsByKind: Map<ArtifactKind, CapabilityArtifact>
  /** All learning items eligible to participate as distractor candidates
   *  (same-lesson, structurally similar). Each cascade-driven builder turns
   *  these into DistractorCandidate[] with the right `option` flavor. */
  poolItems: LearningItem[]
  /** Meanings for every entry in poolItems, indexed by item id. */
  poolMeaningsByItem: Map<string, ItemMeaning[]>
  userLanguage: 'nl' | 'en'
}

export type BuilderResult =
  | {
      kind: 'ok'
      exerciseItem: ExerciseItem
      audibleTexts: string[]   // populated via audibleTextFieldsOf
    }
  | {
      kind: 'fail'
      reasonCode: ResolutionReasonCode
      message: string
      payloadSnapshot?: unknown
    }
