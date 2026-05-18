// Shared render contract between the capabilities deep module and the
// exercise builders. This file is the SOLE source of truth for:
//   (a) Which exercise types each capability type is ready for.
//   (b) Which builder the resolver dispatches to.
//   (c) What inputs each builder is guaranteed to receive.
//
// See docs/plans/2026-05-18-render-contracts.md and (post-PR-#65)
// docs/current-system/modules/capabilities.md.

import type {
  ExerciseType, LearningItem, ItemMeaning, ItemContext, ItemAnswerVariant, ExerciseVariant,
} from '@/types/learning'
import type { ArtifactKind, CapabilityType, CapabilitySourceKind } from './capabilityTypes'
import type { CapabilityArtifact } from './artifactRegistry'
// ResolutionReasonCode lives in the leaf module (created alongside this file)
// to break what would otherwise be a circular dependency between this file
// and src/services/capabilityContentService.ts — the service will import
// projectBuilderInput from here in PR #65.
import type { ResolutionReasonCode } from '@/lib/exercises/resolutionReasons'
import type { SessionBlock } from '@/lib/session-builder'

// ─── Runtime contract ──────────────────────────────────────────────────────

/**
 * A render contract declares the agreement between a capability projection
 * and an exercise builder for one ExerciseType. validateCapability consults
 * this to decide readiness; the resolver consults it to dispatch; the
 * projector consults it to narrow the typed input handed to the builder.
 */
export interface RenderContract {
  /** Which capability types this exercise serves. */
  capabilityTypes: readonly CapabilityType[]
  /** Which source kinds the exercise can render from. Today every entry is
   *  ['item'] because capabilityContentService only handles item source
   *  kinds (see src/services/capabilityContentService.ts:240). Future fold
   *  work to extend the service expands this. */
  supportedSourceKinds: readonly CapabilitySourceKind[]
  /** Artifacts that must be present + approved for the exercise to render. */
  requiredArtifacts: readonly ArtifactKind[]
}

export const RENDER_CONTRACTS = {
  recognition_mcq: {
    capabilityTypes: ['text_recognition'],
    supportedSourceKinds: ['item'],
    requiredArtifacts: ['base_text', 'meaning:l1'],
  },
  cued_recall: {
    capabilityTypes: ['l1_to_id_choice', 'form_recall', 'root_derived_recognition', 'root_derived_recall'],
    supportedSourceKinds: ['item'],
    requiredArtifacts: ['base_text', 'meaning:l1'],
  },
  typed_recall: {
    capabilityTypes: ['form_recall', 'root_derived_recognition', 'root_derived_recall'],
    supportedSourceKinds: ['item'],
    requiredArtifacts: ['base_text', 'meaning:l1', 'accepted_answers:id'],
  },
  meaning_recall: {
    capabilityTypes: ['meaning_recall'],
    supportedSourceKinds: ['item'],
    requiredArtifacts: ['meaning:l1', 'accepted_answers:l1'],
  },
  listening_mcq: {
    capabilityTypes: ['audio_recognition', 'podcast_gist'],
    supportedSourceKinds: ['item'],
    requiredArtifacts: ['audio_clip', 'meaning:l1'],
  },
  dictation: {
    capabilityTypes: ['dictation'],
    supportedSourceKinds: ['item'],
    requiredArtifacts: ['audio_clip', 'base_text', 'accepted_answers:id'],
  },
  cloze: {
    capabilityTypes: ['contextual_cloze'],
    supportedSourceKinds: ['item'],
    requiredArtifacts: ['cloze_context', 'cloze_answer', 'translation:l1'],
  },
  cloze_mcq: {
    capabilityTypes: ['contextual_cloze'],
    supportedSourceKinds: ['item'],
    requiredArtifacts: ['cloze_context', 'cloze_answer', 'translation:l1'],
  },
  contrast_pair: {
    // pattern_contrast is intentionally absent — see plan §"Pattern decision".
    capabilityTypes: [],
    supportedSourceKinds: ['item'],
    requiredArtifacts: ['exercise_variant'],
  },
  sentence_transformation: {
    capabilityTypes: [],
    supportedSourceKinds: ['item'],
    requiredArtifacts: ['exercise_variant'],
  },
  constrained_translation: {
    capabilityTypes: [],
    supportedSourceKinds: ['item'],
    requiredArtifacts: ['exercise_variant'],
  },
  speaking: {
    capabilityTypes: [],
    supportedSourceKinds: ['item'],
    requiredArtifacts: ['base_text'],
  },
} as const satisfies Record<ExerciseType, RenderContract>

// ─── Inverted-lookup helpers (consumed by validateCapability + resolver) ───

export function exerciseTypesForCapability(capabilityType: CapabilityType): readonly ExerciseType[] {
  return (Object.entries(RENDER_CONTRACTS) as Array<[ExerciseType, RenderContract]>)
    .filter(([, c]) => c.capabilityTypes.includes(capabilityType))
    .map(([et]) => et)
}

export function requiredArtifactsFor(exerciseType: ExerciseType): readonly ArtifactKind[] {
  return RENDER_CONTRACTS[exerciseType].requiredArtifacts
}

export function supportsSourceKind(exerciseType: ExerciseType, sourceKind: CapabilitySourceKind): boolean {
  // Widen the literal-tuple type from `as const` so `.includes` accepts the
  // union argument without complaining that 'pattern' isn't 'item'.
  const supported = RENDER_CONTRACTS[exerciseType].supportedSourceKinds as readonly CapabilitySourceKind[]
  return supported.includes(sourceKind)
}

// ─── Compile-time builder input shapes ─────────────────────────────────────

/**
 * The raw input the dispatcher (capabilityContentService) constructs before
 * projection. The projector narrows this to BuilderInputFor<K> for a
 * specific exercise type, or returns a fail.
 *
 * Shape is intentionally identical to the legacy BuilderInput type so the
 * dispatch site remains a single object construction.
 */
export interface RawProjectorInput {
  block?: SessionBlock
  learningItem: LearningItem | null
  meanings: ItemMeaning[]
  contexts: ItemContext[]
  answerVariants: ItemAnswerVariant[]
  variant: ExerciseVariant | null
  artifactsByKind: Map<ArtifactKind, CapabilityArtifact>
  poolItems: LearningItem[]
  poolMeaningsByItem: Map<string, ItemMeaning[]>
  userLanguage: 'nl' | 'en'
}

/** Common-base fields every builder receives. */
interface BuilderBase {
  block?: SessionBlock
  meanings: ItemMeaning[]
  contexts: ItemContext[]
  answerVariants: ItemAnswerVariant[]
  artifactsByKind: Map<ArtifactKind, CapabilityArtifact>
  poolItems: LearningItem[]
  poolMeaningsByItem: Map<string, ItemMeaning[]>
  userLanguage: 'nl' | 'en'
}

/**
 * Per-exercise input shape. Adding an ExerciseType without a corresponding
 * entry here is a compile error (enforced by `satisfies` on the value
 * `_CONTRACT_SHAPES_EXHAUSTIVENESS_CHECK` below).
 *
 * cloze_mcq's `clozeContext` is honestly nullable: the authored path uses
 * variant.payload_json and ignores clozeContext, while the runtime path
 * requires clozeContext. The projector enforces the invariant: at least
 * ONE of `variant (matching type)` OR `clozeContext` is non-null.
 */
export interface ContractInputShapes {
  recognition_mcq: BuilderBase & { learningItem: LearningItem; primaryMeaning: ItemMeaning }
  cued_recall:     BuilderBase & { learningItem: LearningItem; primaryMeaning: ItemMeaning }
  typed_recall:    BuilderBase & { learningItem: LearningItem; primaryMeaning: ItemMeaning }
  meaning_recall:  BuilderBase & { learningItem: LearningItem; primaryMeaning: ItemMeaning }
  listening_mcq:   BuilderBase & { learningItem: LearningItem; primaryMeaning: ItemMeaning }
  dictation:       BuilderBase & { learningItem: LearningItem }
  cloze:           BuilderBase & { learningItem: LearningItem; clozeContext: ItemContext }
  cloze_mcq:       BuilderBase & { learningItem: LearningItem; clozeContext: ItemContext | null; variant: ExerciseVariant | null }
  contrast_pair:   BuilderBase & { learningItem: LearningItem; variant: ExerciseVariant }
  sentence_transformation: BuilderBase & { learningItem: LearningItem; variant: ExerciseVariant }
  constrained_translation: BuilderBase & { learningItem: LearningItem; variant: ExerciseVariant }
  speaking:        BuilderBase & { learningItem: LearningItem; variant: ExerciseVariant | null }
}

// Exhaustiveness check: this line fails compilation if a new ExerciseType is
// added without a corresponding ContractInputShapes entry.
const _CONTRACT_SHAPES_EXHAUSTIVENESS_CHECK = {} as ContractInputShapes satisfies Record<ExerciseType, unknown>
void _CONTRACT_SHAPES_EXHAUSTIVENESS_CHECK

export type BuilderInputFor<T extends ExerciseType> = ContractInputShapes[T]

// ─── Projector ─────────────────────────────────────────────────────────────

/** Discriminated-union result from projectBuilderInput. */
export type ProjectorResult<T extends ExerciseType> =
  | { ok: true; input: BuilderInputFor<T> }
  | { ok: false; reasonCode: ResolutionReasonCode; message: string; payloadSnapshot?: unknown }

/**
 * Validate a raw projector input against the contract for `exerciseType` and
 * return a narrowed BuilderInputFor<T>. Performs every runtime guard that
 * used to live in individual builders' bodies (`if (!input.learningItem)`,
 * `if (!primary)`, etc.). After this returns ok, the builder is statically
 * guaranteed that every field it needs is non-null.
 */
export function projectBuilderInput<T extends ExerciseType>(
  exerciseType: T,
  raw: RawProjectorInput,
): ProjectorResult<T> {
  // Every builder requires a learningItem (matrix verified 2026-05-18 against
  // every file under src/lib/exercises/builders/).
  if (!raw.learningItem) {
    return {
      ok: false,
      reasonCode: 'item_not_found',
      message: `${exerciseType} requires a learningItem`,
    }
  }

  const learningItem = raw.learningItem

  // Builders that need a user-language meaning.
  const needsPrimaryMeaning: ReadonlySet<ExerciseType> = new Set([
    'recognition_mcq', 'cued_recall', 'typed_recall', 'meaning_recall', 'listening_mcq',
  ])
  let primaryMeaning: ItemMeaning | undefined
  if (needsPrimaryMeaning.has(exerciseType)) {
    primaryMeaning = raw.meanings.find(m => m.translation_language === raw.userLanguage && m.is_primary)
      ?? raw.meanings.find(m => m.translation_language === raw.userLanguage)
    if (!primaryMeaning) {
      return {
        ok: false,
        reasonCode: 'no_meaning_in_lang',
        message: `no ${raw.userLanguage} meaning for item ${learningItem.id}`,
        payloadSnapshot: { learningItemId: learningItem.id, userLanguage: raw.userLanguage },
      }
    }
  }

  // Builders that need a cloze-typed context.
  //   cloze: hard-required (no fallback path).
  //   cloze_mcq: at least ONE of clozeContext OR a matching authored variant
  //              is required; the field stays nullable in the typed shape
  //              and the builder branches on which path is active.
  let clozeContext: ItemContext | null = null
  if (exerciseType === 'cloze') {
    clozeContext = raw.contexts.find(c => c.context_type === 'cloze') ?? null
    if (!clozeContext) {
      return {
        ok: false,
        reasonCode: 'malformed_cloze',
        message: `no cloze context for item ${learningItem.id}`,
        payloadSnapshot: { learningItemId: learningItem.id, contextCount: raw.contexts.length },
      }
    }
  }
  if (exerciseType === 'cloze_mcq') {
    clozeContext = raw.contexts.find(c => c.context_type === 'cloze') ?? null
    const hasAuthoredVariant = raw.variant != null && raw.variant.exercise_type === 'cloze_mcq'
    if (!clozeContext && !hasAuthoredVariant) {
      return {
        ok: false,
        reasonCode: 'malformed_cloze',
        message: `no cloze context and no authored cloze_mcq variant for item ${learningItem.id}`,
        payloadSnapshot: {
          learningItemId: learningItem.id,
          contextCount: raw.contexts.length,
          hasVariant: raw.variant != null,
        },
      }
    }
  }

  // Builders that require an exact-match active variant.
  const needsActiveVariant: ReadonlySet<ExerciseType> = new Set([
    'contrast_pair', 'sentence_transformation', 'constrained_translation',
  ])
  if (needsActiveVariant.has(exerciseType)) {
    if (!raw.variant || raw.variant.exercise_type !== exerciseType) {
      return {
        ok: false,
        reasonCode: 'no_active_variant',
        message: `no active ${exerciseType} variant for item ${learningItem.id}`,
        payloadSnapshot: { learningItemId: learningItem.id },
      }
    }
  }

  const base = {
    block: raw.block,
    meanings: raw.meanings,
    contexts: raw.contexts,
    answerVariants: raw.answerVariants,
    artifactsByKind: raw.artifactsByKind,
    poolItems: raw.poolItems,
    poolMeaningsByItem: raw.poolMeaningsByItem,
    userLanguage: raw.userLanguage,
    learningItem,
  }

  // Per-exercise narrowing.
  switch (exerciseType) {
    case 'cloze':
      return { ok: true, input: { ...base, clozeContext: clozeContext! } as BuilderInputFor<T> }
    case 'cloze_mcq':
      // clozeContext is honestly nullable here — the projector has already
      // proven that either it OR the variant is present.
      return { ok: true, input: { ...base, clozeContext, variant: raw.variant } as BuilderInputFor<T> }
    case 'contrast_pair':
    case 'sentence_transformation':
    case 'constrained_translation':
      return { ok: true, input: { ...base, variant: raw.variant! } as BuilderInputFor<T> }
    case 'speaking':
      return { ok: true, input: { ...base, variant: raw.variant } as BuilderInputFor<T> }
    case 'recognition_mcq':
    case 'cued_recall':
    case 'typed_recall':
    case 'meaning_recall':
    case 'listening_mcq':
      return { ok: true, input: { ...base, primaryMeaning: primaryMeaning! } as BuilderInputFor<T> }
    case 'dictation':
      return { ok: true, input: base as BuilderInputFor<T> }
    default: {
      // Exhaustiveness check
      const _exhaustive: never = exerciseType
      return {
        ok: false,
        reasonCode: 'unsupported_exercise_type',
        message: `no projector branch for exerciseType '${String(_exhaustive)}'`,
      }
    }
  }
}
