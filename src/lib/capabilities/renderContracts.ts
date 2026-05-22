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
 *
 * `requiredArtifacts` is source-kind-keyed: each entry in
 * `supportedSourceKinds` must have a corresponding non-undefined entry under
 * `requiredArtifacts`. This shape lets the same exercise (e.g. typed_recall)
 * declare different artifact dependencies under different source kinds —
 * item-sourced typed_recall reads base_text + meaning:l1 + accepted_answers:id;
 * affixed_form_pair-sourced typed_recall reads root_derived_pair +
 * allomorph_rule. Enforced via a runtime exhaustiveness assertion at module
 * load time (see ASSERT_REQUIRED_ARTIFACTS_COMPLETE below).
 */
export interface RenderContract {
  /** Which capability types this exercise serves. */
  capabilityTypes: readonly CapabilityType[]
  /** Which source kinds the exercise can render from. `cloze` accepts
   *  ['item', 'dialogue_line'] post the 2026-05-21 lib/exercise-content fold
   *  (PR-B); `typed_recall` accepts ['item', 'affixed_form_pair'] post the
   *  affixed-form-pair PR (today); every other entry remains ['item'] until
   *  its source-kind fetcher lands in lib/exercise-content/byKind. */
  supportedSourceKinds: readonly CapabilitySourceKind[]
  /** Artifacts that must be present + approved for the exercise to render
   *  under each supported source kind. The key set must equal the set of
   *  source kinds named in `supportedSourceKinds` (asserted at module load). */
  requiredArtifacts: Partial<Record<CapabilitySourceKind, readonly ArtifactKind[]>>
}

export const RENDER_CONTRACTS = {
  recognition_mcq: {
    // Decision R (PR 1): item translations read from learning_items.translation_{nl,en}
    // directly. No capability_artifacts required for item caps. requiredArtifacts.item=[]
    // so validateCapability passes without artifact rows.
    capabilityTypes: ['text_recognition'],
    supportedSourceKinds: ['item'],
    requiredArtifacts: { item: [] },
  },
  cued_recall: {
    // cued_recall serves root_derived_* cap types but its
    // supportedSourceKinds stays ['item'] — affixed_form_pair extension
    // requires authored distractors, deferred to a follow-up plan (D3/D4
    // of the affixed-form-pair plan).
    capabilityTypes: ['l1_to_id_choice', 'form_recall', 'root_derived_recognition', 'root_derived_recall'],
    supportedSourceKinds: ['item'],
    requiredArtifacts: { item: [] },
  },
  typed_recall: {
    capabilityTypes: ['form_recall', 'root_derived_recognition', 'root_derived_recall'],
    supportedSourceKinds: ['item', 'affixed_form_pair'],
    requiredArtifacts: {
      // Decision R (PR 1): item data from learning_items directly; no artifact bag needed.
      item: [],
      affixed_form_pair: ['root_derived_pair', 'allomorph_rule'],
    },
  },
  meaning_recall: {
    capabilityTypes: ['meaning_recall'],
    supportedSourceKinds: ['item'],
    requiredArtifacts: { item: [] },
  },
  listening_mcq: {
    // Decision Q (PR 1): audio read via capability_audio_refs + audio_clips.
    // The artifact bag no longer holds the audio_clip reference for item caps.
    capabilityTypes: ['audio_recognition', 'podcast_gist'],
    supportedSourceKinds: ['item'],
    requiredArtifacts: { item: [] },
  },
  dictation: {
    capabilityTypes: ['dictation'],
    supportedSourceKinds: ['item'],
    requiredArtifacts: { item: [] },
  },
  cloze: {
    capabilityTypes: ['contextual_cloze'],
    supportedSourceKinds: ['item', 'dialogue_line'],
    requiredArtifacts: {
      // Decision R (PR 1): item cloze data from item_contexts directly.
      item: [],
      dialogue_line: ['cloze_context', 'cloze_answer', 'translation:l1'],
    },
  },
  cloze_mcq: {
    // dialogue_line is intentionally absent — cloze_mcq's distractor pool is
    // derived from item_contexts.source_lesson_id (see byKind/item.ts).
    // Adding dialogue_line here requires a lesson-anchored pool fetcher in
    // byKind/dialogueLine.ts that doesn't exist yet. Follow-up.
    capabilityTypes: ['contextual_cloze'],
    supportedSourceKinds: ['item'],
    requiredArtifacts: { item: [] },
  },
  contrast_pair: {
    // pattern_contrast is intentionally absent — see plan §"Pattern decision".
    capabilityTypes: [],
    supportedSourceKinds: ['item'],
    requiredArtifacts: { item: [] },
  },
  sentence_transformation: {
    capabilityTypes: [],
    supportedSourceKinds: ['item'],
    requiredArtifacts: { item: [] },
  },
  constrained_translation: {
    capabilityTypes: [],
    supportedSourceKinds: ['item'],
    requiredArtifacts: { item: [] },
  },
  speaking: {
    capabilityTypes: [],
    supportedSourceKinds: ['item'],
    requiredArtifacts: { item: [] },
  },
} as const satisfies Record<ExerciseType, RenderContract>

// Runtime exhaustiveness assertion: every entry in `supportedSourceKinds`
// must have a matching non-undefined entry in `requiredArtifacts`. Fires at
// module load if a future contract edit forgets a key (e.g. widens
// supportedSourceKinds without adding the per-kind artifact list).
//
// Per Open Question 4 of the affixed-form-pair plan: this replaces the
// (more invasive) type-level conditional-type enforcement; the runtime
// assertion catches the same misconfiguration class at process start.
;(function assertRequiredArtifactsComplete() {
  for (const [exerciseType, contract] of Object.entries(RENDER_CONTRACTS) as Array<[ExerciseType, RenderContract]>) {
    for (const sourceKind of contract.supportedSourceKinds) {
      if (contract.requiredArtifacts[sourceKind] == null) {
        throw new Error(
          `RENDER_CONTRACTS misconfiguration: exerciseType '${exerciseType}' lists '${sourceKind}' in supportedSourceKinds ` +
          `but has no entry under requiredArtifacts. Every supported source kind must declare its artifact list.`,
        )
      }
    }
  }
})()

// ─── Inverted-lookup helpers (consumed by validateCapability + resolver) ───

export function exerciseTypesForCapability(capabilityType: CapabilityType): readonly ExerciseType[] {
  return (Object.entries(RENDER_CONTRACTS) as Array<[ExerciseType, RenderContract]>)
    .filter(([, c]) => c.capabilityTypes.includes(capabilityType))
    .map(([et]) => et)
}

export function requiredArtifactsFor(
  exerciseType: ExerciseType,
  sourceKind: CapabilitySourceKind,
): readonly ArtifactKind[] {
  // Returns the artifact list for this exercise under this source kind, or
  // [] if the source kind is not supported by this exercise. Callers that
  // need to know whether the source kind is supported should consult
  // `supportsSourceKind` separately.
  //
  // Cast: the `as const` narrowing on RENDER_CONTRACTS makes each entry's
  // `requiredArtifacts` a heterogeneous union with only the keys it actually
  // carries. Widen here to the full Partial<Record<...>> shape declared by
  // the RenderContract interface for indexing.
  const required = RENDER_CONTRACTS[exerciseType].requiredArtifacts as Partial<Record<CapabilitySourceKind, readonly ArtifactKind[]>>
  return required[sourceKind] ?? []
}

export function supportsSourceKind(exerciseType: ExerciseType, sourceKind: CapabilitySourceKind): boolean {
  // Widen the literal-tuple type from `as const` so `.includes` accepts the
  // union argument without complaining that 'pattern' isn't 'item'.
  // Defensive null-check: an exerciseType not in the contract table (e.g. a
  // synthetic future type passed by tests via `as never`) returns false
  // rather than throwing — the dispatcher will then surface the failure as
  // unsupported_exercise_type via the projector's exhaustiveness branch.
  const contract = RENDER_CONTRACTS[exerciseType]
  if (!contract) return false
  const supported = contract.supportedSourceKinds as readonly CapabilitySourceKind[]
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
 * Per-block input for an `affixed_form_pair:root_derived_*` capability. The
 * lib/exercise-content adapter assembles this from the two artifact rows the
 * publish pipeline writes (root_derived_pair + allomorph_rule), plus the
 * cap's `direction` field decoded from the canonical-key tail.
 *
 * See scripts/lib/content-pipeline-output.ts:430-441 for the artifact
 * writers; see src/lib/exercise-content/byKind/affixedFormPair.ts for the
 * fetcher contract.
 */
export interface AffixedFormPairInput {
  /** The root word from `root_derived_pair.payload_json.root`
   *  (e.g. "baca"). */
  root: string
  /** The derived/affixed form from `root_derived_pair.payload_json.derived`
   *  (e.g. "membaca"). */
  derived: string
  /** The cap row's `direction`. `root_to_derived` → recall (form_recall);
   *  `derived_to_root` → recognition (root_derived_recognition). Decoded
   *  from the canonical-key tail by the adapter. */
  direction: 'root_to_derived' | 'derived_to_root'
  /** The allomorph rule from `allomorph_rule.payload_json.rule`
   *  (e.g. "meN- becomes mem- before roots beginning with b: baca -> membaca."). */
  allomorphRule: string
  /** The cap's source_ref of shape `lesson-N/morphology/<slug>`. Carried for
   *  audit/debug; the builder does not parse it. */
  sourceRef: string
}

/**
 * The raw input the dispatcher (lib/exercise-content/resolver via the
 * adapter) constructs before projection. The projector narrows this to
 * BuilderInputFor<K> for a specific exercise type, or returns a fail.
 *
 * `learningItem`, `dialogueLine`, and `affixedFormPair` are all honestly
 * nullable. The bucketing invariant: at most one is populated per block.
 * cloze accepts learningItem or dialogueLine; typed_recall accepts
 * learningItem or affixedFormPair; every other exercise type requires
 * `learningItem` non-null and treats the other slots as irrelevant.
 */
export interface RawProjectorInput {
  block?: SessionBlock
  learningItem: LearningItem | null
  /** Set when the resolved block's sourceKind is `dialogue_line`. Mutually
   *  exclusive with `learningItem` (bucketing invariant). */
  dialogueLine: DialogueLineInput | null
  /** Set when the resolved block's sourceKind is `affixed_form_pair`.
   *  Mutually exclusive with `learningItem` (bucketing invariant). */
  affixedFormPair: AffixedFormPairInput | null
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
  typed_recall:    BuilderBase & { learningItem: LearningItem | null; primaryMeaning: ItemMeaning | null; affixedFormPair: AffixedFormPairInput | null }
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
  // Source-kind acceptance is keyed off RENDER_CONTRACTS[et].supportedSourceKinds.
  //   cloze        — accepts ['item', 'dialogue_line']
  //   typed_recall — accepts ['item', 'affixed_form_pair']
  //   every other  — ['item']
  const acceptsDialogueLine = supportsSourceKind(exerciseType, 'dialogue_line')
  const acceptsAffixedFormPair = supportsSourceKind(exerciseType, 'affixed_form_pair')

  if (
    !raw.learningItem
    && !(acceptsDialogueLine && raw.dialogueLine)
    && !(acceptsAffixedFormPair && raw.affixedFormPair)
  ) {
    return {
      ok: false,
      reasonCode: 'item_not_found',
      message: `${exerciseType} requires a learningItem (or a dialogueLine for cloze, or an affixedFormPair for typed_recall)`,
    }
  }

  // Bucketing invariant: at most one of learningItem / dialogueLine /
  // affixedFormPair is set. The adapter never populates more than one;
  // defend in depth.
  if (acceptsDialogueLine && raw.learningItem && raw.dialogueLine) {
    return {
      ok: false,
      reasonCode: 'malformed_payload',
      message: `${exerciseType} received both a learningItem and a dialogueLine — bucketing invariant violated`,
      payloadSnapshot: { learningItemId: raw.learningItem.id, sourceRef: raw.dialogueLine.sourceRef },
    }
  }
  if (acceptsAffixedFormPair && raw.learningItem && raw.affixedFormPair) {
    return {
      ok: false,
      reasonCode: 'malformed_payload',
      message: `${exerciseType} received both a learningItem and an affixedFormPair — bucketing invariant violated`,
      payloadSnapshot: { learningItemId: raw.learningItem.id, sourceRef: raw.affixedFormPair.sourceRef },
    }
  }

  const learningItem = raw.learningItem  // may be null when dialogueLine or affixedFormPair path is active

  // Builders that need a user-language meaning. For typed_recall the
  // affixed_form_pair path skips this lookup — the prompt comes from the
  // pair's root/derived, not from a translation. Item path for typed_recall
  // still needs a meaning. recognition_mcq / cued_recall / meaning_recall /
  // listening_mcq all stay item-only and always need primaryMeaning.
  const needsPrimaryMeaning: ReadonlySet<ExerciseType> = new Set([
    'recognition_mcq', 'cued_recall', 'typed_recall', 'meaning_recall', 'listening_mcq',
  ])
  let primaryMeaning: ItemMeaning | undefined
  if (needsPrimaryMeaning.has(exerciseType)) {
    if (exerciseType === 'typed_recall' && raw.affixedFormPair) {
      // affixed_form_pair path — no learningItem, no meanings. Skip lookup.
    } else {
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
    case 'typed_recall':
      // typed_recall accepts item OR affixed_form_pair. The projector has
      // proven that exactly one is populated. The byType packager branches
      // on which.
      return { ok: true, input: {
        ...base,
        learningItem,
        primaryMeaning: primaryMeaning ?? null,
        affixedFormPair: raw.affixedFormPair,
      } as BuilderInputFor<T> }
    case 'recognition_mcq':
    case 'cued_recall':
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
