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
  /** Which source kinds the exercise can render from. `cloze` accepts
   *  ['item', 'dialogue_line'] post the 2026-05-21 lib/exercise-content fold
   *  (PR-B); every other entry remains ['item'] until its source-kind fetcher
   *  lands in lib/exercise-content/adapter. (`cloze_mcq` needs a lesson-
   *  anchored distractor pool that hasn't been extended to dialogue_line —
   *  follow-up.) See docs/current-system/modules/exercise-content.md §3 for
   *  the bucketing dispatch shape. */
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
    supportedSourceKinds: ['item', 'dialogue_line'],
    requiredArtifacts: ['cloze_context', 'cloze_answer', 'translation:l1'],
  },
  cloze_mcq: {
    // dialogue_line is intentionally absent — cloze_mcq's distractor pool is
    // derived from item_contexts.source_lesson_id (see adapter.fetchForItem-
    // Blocks). Adding dialogue_line here requires a lesson-anchored pool
    // fetcher in adapter.fetchForDialogueLineBlocks that doesn't exist yet.
    // Follow-up. Today contextual_cloze with sourceKind=dialogue_line renders
    // through typed cloze only.
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
 * Per-block input for a `dialogue_line:contextual_cloze` capability. The
 * lib/exercise-content adapter assembles this from the three artifact rows
 * the publish pipeline writes (cloze_context + cloze_answer + translation:l1).
 *
 * See scripts/lib/pipeline/capability-stage/projectors/dialogueArtifacts.ts
 * for the writer; see docs/current-system/modules/exercise-content.md §3 for
 * the fetcher contract.
 */
export interface DialogueLineInput {
  /** Full line text from `lesson_sections.content.lines[idx].text`,
   *  unblanked. Persisted in `cloze_context.payload_json.line_text`. */
  text: string
  /** Speaker name if the dialogue carries one (e.g. "Titin"); null otherwise.
   *  Persisted in `cloze_context.payload_json.speaker`. */
  speaker: string | null
  /** The cap's source_ref of shape `lesson-N/section-M/line-K`. Carried for
   *  audit/debug; the builder does not parse it. */
  sourceRef: string
  /** The blanked word — the answer the learner types into `___`. Persisted
   *  in `cloze_answer.payload_json.value`. */
  targetWord: string
  /** L1 (NL) translation of the full line. Persisted in
   *  `translation:l1.payload_json.value`. */
  translation: string
  /** The cloze sentence with the `___` placeholder. Persisted in
   *  `cloze_context.payload_json.source_text`. The builder uses this as the
   *  `sentence` it shows to the learner. */
  sourceText: string
}

/**
 * The raw input the dispatcher (lib/exercise-content/resolver via the
 * adapter) constructs before projection. The projector narrows this to
 * BuilderInputFor<K> for a specific exercise type, or returns a fail.
 *
 * Both `learningItem` and `dialogueLine` are honestly nullable; cloze +
 * cloze_mcq accept either (exactly one is populated per the bucketing
 * invariant); every other exercise type requires `learningItem` to be
 * non-null and treats `dialogueLine` as irrelevant.
 */
export interface RawProjectorInput {
  block?: SessionBlock
  learningItem: LearningItem | null
  /** Set when the resolved block's sourceKind is `dialogue_line`. Mutually
   *  exclusive with `learningItem` (bucketing invariant). */
  dialogueLine: DialogueLineInput | null
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
 * cloze accepts two source kinds (`item` and `dialogue_line`); cloze_mcq is
 * item-only today (needs a lesson-anchored distractor pool that hasn't been
 * extended to dialogue_line yet — follow-up). For cloze the shape encodes
 * "exactly one of learningItem or dialogueLine is non-null" as nullable
 * fields; the projector enforces the invariant.
 *
 * cloze_mcq's `clozeContext` is additionally nullable: the authored path
 * uses variant.payload_json and ignores clozeContext, while the runtime
 * item-sourced path requires clozeContext. The projector enforces the
 * invariant: at least ONE of `variant (matching type)` OR `clozeContext`
 * is non-null.
 */
export interface ContractInputShapes {
  recognition_mcq: BuilderBase & { learningItem: LearningItem; primaryMeaning: ItemMeaning }
  cued_recall:     BuilderBase & { learningItem: LearningItem; primaryMeaning: ItemMeaning }
  typed_recall:    BuilderBase & { learningItem: LearningItem; primaryMeaning: ItemMeaning }
  meaning_recall:  BuilderBase & { learningItem: LearningItem; primaryMeaning: ItemMeaning }
  listening_mcq:   BuilderBase & { learningItem: LearningItem; primaryMeaning: ItemMeaning }
  dictation:       BuilderBase & { learningItem: LearningItem }
  cloze:           BuilderBase & { learningItem: LearningItem | null; clozeContext: ItemContext | null; dialogueLine: DialogueLineInput | null }
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
  // cloze accepts either learningItem (item-sourced) or dialogueLine
  // (dialogue_line-sourced). cloze_mcq is item-only today (the cloze_mcq
  // distractor pool is lesson-anchored via item_contexts.source_lesson_id;
  // extending it to dialogue_line requires a separate adapter fetcher).
  // Every other exercise type requires a learningItem.
  const acceptsDialogueLine = exerciseType === 'cloze'

  if (!raw.learningItem && !(acceptsDialogueLine && raw.dialogueLine)) {
    return {
      ok: false,
      reasonCode: 'item_not_found',
      message: `${exerciseType} requires a learningItem (or a dialogueLine for cloze/cloze_mcq)`,
    }
  }

  // Bucketing invariant: exactly one of learningItem / dialogueLine is set
  // for cloze/cloze_mcq. The adapter never populates both; defend in depth.
  if (acceptsDialogueLine && raw.learningItem && raw.dialogueLine) {
    return {
      ok: false,
      reasonCode: 'malformed_payload',
      message: `${exerciseType} received both a learningItem and a dialogueLine — bucketing invariant violated`,
      payloadSnapshot: { learningItemId: raw.learningItem.id, sourceRef: raw.dialogueLine.sourceRef },
    }
  }

  const learningItem = raw.learningItem  // may be null when dialogueLine path is active

  // Builders that need a user-language meaning. All five require learningItem
  // (none accept the dialogue_line path), so the existing logic is unchanged.
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
        message: `no ${raw.userLanguage} meaning for item ${learningItem!.id}`,
        payloadSnapshot: { learningItemId: learningItem!.id, userLanguage: raw.userLanguage },
      }
    }
  }

  // Builders that need a cloze-typed context (item-sourced path only — the
  // dialogue_line path carries source_text inside the DialogueLineInput).
  //   cloze: requires either dialogueLine OR a cloze-typed context.
  //   cloze_mcq: requires at least ONE of dialogueLine, a cloze-typed
  //              context, or a matching authored variant.
  let clozeContext: ItemContext | null = null
  if (exerciseType === 'cloze') {
    if (raw.dialogueLine) {
      // dialogue_line path — sentence comes from dialogueLine.sourceText; no
      // item_contexts row is required (or available).
    } else {
      clozeContext = raw.contexts.find(c => c.context_type === 'cloze') ?? null
      if (!clozeContext) {
        return {
          ok: false,
          reasonCode: 'malformed_cloze',
          message: `no cloze context for item ${learningItem!.id}`,
          payloadSnapshot: { learningItemId: learningItem!.id, contextCount: raw.contexts.length },
        }
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
        message: `no cloze context and no authored cloze_mcq variant for item ${learningItem!.id}`,
        payloadSnapshot: {
          learningItemId: learningItem!.id,
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
        message: `no active ${exerciseType} variant for item ${learningItem!.id}`,
        payloadSnapshot: { learningItemId: learningItem!.id },
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
  }

  // Per-exercise narrowing.
  switch (exerciseType) {
    case 'cloze':
      // learningItem + clozeContext + dialogueLine are all honestly nullable
      // here. The projector has proven that exactly one of learningItem (with
      // its clozeContext) OR dialogueLine is populated. The byType packager
      // branches on which is present.
      return { ok: true, input: { ...base, learningItem, clozeContext, dialogueLine: raw.dialogueLine } as BuilderInputFor<T> }
    case 'cloze_mcq':
      // clozeContext is honestly nullable here — the projector has already
      // proven that either it OR the variant is present.
      return { ok: true, input: { ...base, learningItem: learningItem!, clozeContext, variant: raw.variant } as BuilderInputFor<T> }
    case 'contrast_pair':
    case 'sentence_transformation':
    case 'constrained_translation':
      return { ok: true, input: { ...base, learningItem: learningItem!, variant: raw.variant! } as BuilderInputFor<T> }
    case 'speaking':
      return { ok: true, input: { ...base, learningItem: learningItem!, variant: raw.variant } as BuilderInputFor<T> }
    case 'recognition_mcq':
    case 'cued_recall':
    case 'typed_recall':
    case 'meaning_recall':
    case 'listening_mcq':
      return { ok: true, input: { ...base, learningItem: learningItem!, primaryMeaning: primaryMeaning! } as BuilderInputFor<T> }
    case 'dictation':
      return { ok: true, input: { ...base, learningItem: learningItem! } as BuilderInputFor<T> }
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
