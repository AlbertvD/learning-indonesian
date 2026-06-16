// Shared render contract between the capabilities deep module and the
// exercise builders. This file is the SOLE source of truth for:
//   (a) Which exercise types each capability type is ready for.
//   (b) Which builder the resolver dispatches to.
//   (c) What inputs each builder is guaranteed to receive.
//
// See docs/plans/2026-05-18-render-contracts.md and (post-PR-#65)
// docs/current-system/modules/capabilities.md.

import type {
  ExerciseType, LearningItem, ItemMeaning, ItemContext, ItemAnswerVariant,
  ContrastPairExercisesRow, SentenceTransformationExercisesRow,
  ConstrainedTranslationExercisesRow, ClozeMcqExercisesRow, SkillType,
} from '@/types/learning'
import type { ArtifactKind, CapabilityType, CapabilitySourceKind } from './capabilityTypes'
import { CAPABILITY_TYPES, deriveSkillTypeFromCapabilityType } from './capabilityTypes'
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
 * word_form_pair_src-sourced typed_recall reads root_derived_pair +
 * allomorph_rule. Enforced via a runtime exhaustiveness assertion at module
 * load time (see ASSERT_REQUIRED_ARTIFACTS_COMPLETE below).
 */
export interface RenderContract {
  /** Which capability types this exercise serves. */
  capabilityTypes: readonly CapabilityType[]
  /** Which source kinds the exercise can render from. `cloze` accepts
   *  ['vocabulary_src', 'dialogue_line_src'] post the 2026-05-21 lib/exercise-content fold
   *  (PR-B); `typed_recall` accepts ['vocabulary_src', 'word_form_pair_src'] post the
   *  affixed-form-pair PR (today); every other entry remains ['vocabulary_src'] until
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
    capabilityTypes: ['recognise_meaning_from_text_cap'],
    supportedSourceKinds: ['vocabulary_src'],
    requiredArtifacts: { vocabulary_src: [] },
  },
  cued_recall: {
    // cued_recall serves root_derived_* cap types but its
    // supportedSourceKinds stays ['vocabulary_src'] — word_form_pair_src extension
    // requires authored distractors, deferred to a follow-up plan (D3/D4
    // of the affixed-form-pair plan).
    capabilityTypes: ['recognise_form_from_meaning_cap', 'produce_form_from_meaning_cap', 'recognise_word_form_link_cap', 'produce_derived_form_cap'],
    supportedSourceKinds: ['vocabulary_src'],
    requiredArtifacts: { vocabulary_src: [] },
  },
  typed_recall: {
    capabilityTypes: ['produce_form_from_meaning_cap', 'recognise_word_form_link_cap', 'produce_derived_form_cap'],
    supportedSourceKinds: ['vocabulary_src', 'word_form_pair_src'],
    requiredArtifacts: {
      // Decision R (PR 1): item data from learning_items directly; no artifact bag needed.
      vocabulary_src: [],
      // PR 3 slice: word_form_pair_src renders from the typed `affixed_form_pairs`
      // table (byKind/affixedFormPair.ts). Structure is guaranteed by that
      // table's NOT NULL columns (root_text/derived_text/allomorph_rule) + the
      // pre-write validateAffixedFormPairs gate + HC17 — not by
      // capability_artifacts. Readiness needs no artifact bag, mirroring item +
      // dialogue_line (Decision R).
      word_form_pair_src: [],
    },
  },
  meaning_recall: {
    capabilityTypes: ['recall_meaning_from_text_cap'],
    supportedSourceKinds: ['vocabulary_src'],
    requiredArtifacts: { vocabulary_src: [] },
  },
  listening_mcq: {
    // Decision Q (PR 1): audio read via capability_audio_refs + audio_clips.
    // The artifact bag no longer holds the audio_clip reference for item caps.
    capabilityTypes: ['recognise_meaning_from_audio_cap', 'recognise_gist_from_audio_cap'],
    supportedSourceKinds: ['vocabulary_src'],
    requiredArtifacts: { vocabulary_src: [] },
  },
  dictation: {
    capabilityTypes: ['produce_form_from_audio_cap'],
    supportedSourceKinds: ['vocabulary_src'],
    requiredArtifacts: { vocabulary_src: [] },
  },
  cloze: {
    capabilityTypes: ['produce_form_from_context_cap'],
    supportedSourceKinds: ['vocabulary_src', 'dialogue_line_src'],
    requiredArtifacts: {
      // Decision R (PR 1): item cloze data from item_contexts directly.
      vocabulary_src: [],
      // PR 2 slice: dialogue_line renders from the typed `dialogue_clozes` table
      // (byKind/dialogueLine.ts). Structure is guaranteed by that table's NOT NULL
      // columns + the pre-write validateDialogueClozes gate + HC15 — not by
      // capability_artifacts. Readiness needs no artifact bag, mirroring item.
      dialogue_line_src: [],
    },
  },
  cloze_mcq: {
    // cap-v2 #161: cloze_mcq is now PATTERN-ONLY. Item cloze is typed-only — an
    // item produce_form_from_context_cap cap routes solely to the `cloze` builder (the typed
    // item_contexts carrier), never to an MCQ. The former item-sourced
    // produce_form_from_context_cap leg (runtime cascade pool from item_contexts.source_lesson_id)
    // is removed with the runner item-branch amputation. cloze_mcq serves only
    // recognise_grammar_pattern_cap (authored typed row from cloze_mcq_exercises — byKind/pattern.ts).
    capabilityTypes: ['recognise_grammar_pattern_cap'],
    supportedSourceKinds: ['grammar_pattern_src'],
    // grammar_pattern_src: [] — readiness is guaranteed by the cloze_mcq_exercises NOT NULL
    // columns + validateGrammarExercises + HC20, not capability_artifacts.
    requiredArtifacts: { grammar_pattern_src: [] },
  },
  contrast_pair: {
    // PR 4 (Decision G): contrast_grammar_pattern_cap routes here, rendering from the typed
    // contrast_pair_exercises table (byKind/pattern.ts). requiredArtifacts.pattern=[]
    // — structure guaranteed by NOT NULL columns + validateGrammarExercises + HC19.
    capabilityTypes: ['contrast_grammar_pattern_cap'],
    supportedSourceKinds: ['grammar_pattern_src'],
    requiredArtifacts: { grammar_pattern_src: [] },
  },
  sentence_transformation: {
    // PR 4 (Decision G): recognise_grammar_pattern_cap → sentence_transformation_exercises.
    capabilityTypes: ['recognise_grammar_pattern_cap'],
    supportedSourceKinds: ['grammar_pattern_src'],
    requiredArtifacts: { grammar_pattern_src: [] },
  },
  constrained_translation: {
    // PR 4 (Decision G): recognise_grammar_pattern_cap → constrained_translation_exercises.
    capabilityTypes: ['recognise_grammar_pattern_cap'],
    supportedSourceKinds: ['grammar_pattern_src'],
    requiredArtifacts: { grammar_pattern_src: [] },
  },
  speaking: {
    capabilityTypes: [],
    supportedSourceKinds: ['vocabulary_src'],
    requiredArtifacts: { vocabulary_src: [] },
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

// Capability identity guardrail (cap-v2 Slice 1 §2, guardrail 1). Every
// capability_type the catalog can emit must have BOTH (a) at least one
// RENDER_CONTRACTS entry that serves it — a render path, so it can never
// "schedule but render nothing" — and (b) a level (a non-throwing
// deriveSkillTypeFromCapabilityType branch). The IIFE below runs this against
// the real CAPABILITY_TYPES at module load so the app refuses to start if a
// new/renamed type lands without its render contract + level in the same
// commit. Exported (and parameterised) so the check is unit-testable without a
// real module re-import.
export function assertCapabilityTypesRenderable(
  capabilityTypes: readonly CapabilityType[],
  deriveSkillType: (capabilityType: CapabilityType) => SkillType,
): void {
  const served = new Set<CapabilityType>()
  for (const contract of Object.values(RENDER_CONTRACTS) as RenderContract[]) {
    for (const capabilityType of contract.capabilityTypes) served.add(capabilityType)
  }
  for (const capabilityType of capabilityTypes) {
    if (!served.has(capabilityType)) {
      throw new Error(
        `Capability identity guardrail: capability_type '${capabilityType}' has no render path ` +
        `— it is absent from every RENDER_CONTRACTS entry's capabilityTypes, so it would schedule ` +
        `but render nothing. Add it to a render contract in the same commit that introduces the type.`,
      )
    }
    // (b) level — deriveSkillType must produce a non-nullish SkillType for it.
    // A missing switch branch either throws (exhaustiveness) or returns nullish;
    // both surface here.
    if (deriveSkillType(capabilityType) == null) {
      throw new Error(
        `Capability identity guardrail: capability_type '${capabilityType}' has no level ` +
        `(deriveSkillTypeFromCapabilityType returned nullish). Add its level branch in the same commit.`,
      )
    }
  }
}

;(function assertCapabilityTypesRenderableAtLoad() {
  assertCapabilityTypesRenderable(CAPABILITY_TYPES, deriveSkillTypeFromCapabilityType)
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
  // union argument without complaining that 'grammar_pattern_src' isn't 'vocabulary_src'.
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
 * Per-block input for a `dialogue_line:produce_form_from_context_cap` capability. The
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
  /** The blanked word — the answer the learner types into `___`. Persisted in
   *  the typed `dialogue_clozes.answer_text`. */
  targetWord: string
  /** L1 (NL) translation of the full line (comprehension aid; F2 keeps the
   *  whole-line translation even when the carrier is a narrowed sentence).
   *  Persisted in `dialogue_clozes.translation_text`/`translation_nl`. */
  translation: string
  /** The cloze carrier with the `___` placeholder. Persisted in
   *  `dialogue_clozes.sentence_with_blank`. The builder uses this as the
   *  `sentence` it shows to the learner. */
  sourceText: string
}

/**
 * Per-block input for an `word_form_pair_src:root_derived_*` capability. The
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
   *  `derived_to_root` → recognition (recognise_word_form_link_cap). Decoded
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
 * Per-block input for a `pattern:pattern_*` capability (PR 4). The
 * lib/exercise-content adapter assembles this from one typed grammar-exercise
 * row (byKind/pattern.ts resolves cap → grammar_pattern_id → typed table,
 * collapsing the N rows per (pattern, exercise_type) to one). The discriminant
 * `exerciseType` lets the projector narrow `row` to the right typed shape.
 *
 * Replaces the retired `exercise_variants.payload_json` path: the 4 grammar
 * builders read `input.exercise.<column>` instead of `input.variant.payload_json.X`.
 */
export type PatternExerciseInput =
  | { exerciseType: 'contrast_pair'; row: ContrastPairExercisesRow }
  | { exerciseType: 'sentence_transformation'; row: SentenceTransformationExercisesRow }
  | { exerciseType: 'constrained_translation'; row: ConstrainedTranslationExercisesRow }
  | { exerciseType: 'cloze_mcq'; row: ClozeMcqExercisesRow }

/**
 * The raw input the dispatcher (lib/exercise-content/resolver via the
 * adapter) constructs before projection. The projector narrows this to
 * BuilderInputFor<K> for a specific exercise type, or returns a fail.
 *
 * `learningItem`, `dialogueLine`, `affixedFormPair`, and `patternExercise` are
 * all honestly nullable. The bucketing invariant: at most one is populated per
 * block. cloze accepts learningItem or dialogueLine; typed_recall accepts
 * learningItem or affixedFormPair; the 4 grammar exercises accept
 * patternExercise; cloze_mcq accepts learningItem (item) OR patternExercise
 * (pattern); every other exercise type requires `learningItem` non-null and
 * treats the other slots as irrelevant.
 */
export interface RawProjectorInput {
  block?: SessionBlock
  learningItem: LearningItem | null
  /** Set when the resolved block's sourceKind is `dialogue_line`. Mutually
   *  exclusive with `learningItem` (bucketing invariant). */
  dialogueLine: DialogueLineInput | null
  /** Set when the resolved block's sourceKind is `word_form_pair_src`.
   *  Mutually exclusive with `learningItem` (bucketing invariant). */
  affixedFormPair: AffixedFormPairInput | null
  /** Set when the resolved block's sourceKind is `pattern` (PR 4). Mutually
   *  exclusive with `learningItem` (bucketing invariant). The typed grammar-
   *  exercise row, tagged by exercise_type. */
  patternExercise: PatternExerciseInput | null
  meanings: ItemMeaning[]
  contexts: ItemContext[]
  answerVariants: ItemAnswerVariant[]
  poolItems: LearningItem[]
  poolMeaningsByItem: Map<string, ItemMeaning[]>
  userLanguage: 'nl' | 'en'
  /** Curated NL wrong-option strings for recognition_mcq, keyed by capability_id.
   *  Populated by the item fetcher from `recognition_mcq_distractors` (Task 8 / #99).
   *  Absent (empty map) when no curated rows exist → builders fall back to pool. */
  curatedRecognitionDistractors: Map<string, string[]>
  /** Curated Indonesian wrong-option strings for cued_recall, keyed by capability_id.
   *  Populated by the item fetcher from `cued_recall_distractors` (Task 8 / #99).
   *  Absent (empty map) when no curated rows exist → builders fall back to pool. */
  curatedCuedRecallDistractors: Map<string, string[]>
}

/** Common-base fields every builder receives. */
interface BuilderBase {
  block?: SessionBlock
  meanings: ItemMeaning[]
  contexts: ItemContext[]
  answerVariants: ItemAnswerVariant[]
  poolItems: LearningItem[]
  poolMeaningsByItem: Map<string, ItemMeaning[]>
  userLanguage: 'nl' | 'en'
  /** Curated NL wrong-option strings for recognition_mcq, keyed by capability_id. */
  curatedRecognitionDistractors: Map<string, string[]>
  /** Curated Indonesian wrong-option strings for cued_recall, keyed by capability_id. */
  curatedCuedRecallDistractors: Map<string, string[]>
}

/**
 * Per-exercise input shape. Adding an ExerciseType without a corresponding
 * entry here is a compile error (enforced by `satisfies` on the value
 * `_CONTRACT_SHAPES_EXHAUSTIVENESS_CHECK` below).
 *
 * cloze accepts two source kinds (`item` and `dialogue_line`). cloze_mcq (PR 4)
 * accepts `item` (produce_form_from_context_cap) OR `pattern` (recognise_grammar_pattern_cap): the item
 * path needs a non-null learningItem + (clozeContext OR distractor pool); the
 * pattern path needs a non-null `exercise` (cloze_mcq_exercises row) and a null
 * learningItem. For cloze the shape encodes "exactly one of learningItem or
 * dialogueLine is non-null" as nullable fields; the projector enforces the
 * invariant.
 *
 * The 4 grammar exercises (contrast_pair / sentence_transformation /
 * constrained_translation / cloze_mcq-pattern) read `exercise.<column>` — the
 * typed grammar-exercise row replaces the retired exercise_variants.payload_json
 * (Decision M1: the typed row IS the contract). They carry no learningItem
 * (pattern caps are not item-rooted).
 */
export interface ContractInputShapes {
  recognition_mcq: BuilderBase & { learningItem: LearningItem; primaryMeaning: ItemMeaning }
  cued_recall:     BuilderBase & { learningItem: LearningItem; primaryMeaning: ItemMeaning }
  typed_recall:    BuilderBase & { learningItem: LearningItem | null; primaryMeaning: ItemMeaning | null; affixedFormPair: AffixedFormPairInput | null }
  meaning_recall:  BuilderBase & { learningItem: LearningItem; primaryMeaning: ItemMeaning }
  listening_mcq:   BuilderBase & { learningItem: LearningItem; primaryMeaning: ItemMeaning }
  dictation:       BuilderBase & { learningItem: LearningItem }
  cloze:           BuilderBase & { learningItem: LearningItem | null; clozeContext: ItemContext | null; dialogueLine: DialogueLineInput | null }
  cloze_mcq:       BuilderBase & { exercise: ClozeMcqExercisesRow }
  contrast_pair:   BuilderBase & { exercise: ContrastPairExercisesRow }
  sentence_transformation: BuilderBase & { exercise: SentenceTransformationExercisesRow }
  constrained_translation: BuilderBase & { exercise: ConstrainedTranslationExercisesRow }
  speaking:        BuilderBase & { learningItem: LearningItem }
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
  //   cloze        — accepts ['vocabulary_src', 'dialogue_line_src']
  //   typed_recall — accepts ['vocabulary_src', 'word_form_pair_src']
  //   cloze_mcq    — accepts ['vocabulary_src', 'grammar_pattern_src']  (PR 4)
  //   contrast_pair / sentence_transformation / constrained_translation — ['grammar_pattern_src'] (PR 4)
  //   every other  — ['vocabulary_src']
  const acceptsDialogueLine = supportsSourceKind(exerciseType, 'dialogue_line_src')
  const acceptsAffixedFormPair = supportsSourceKind(exerciseType, 'word_form_pair_src')
  const acceptsPattern = supportsSourceKind(exerciseType, 'grammar_pattern_src')

  // A pattern-source block carries its typed grammar-exercise row, tagged with
  // the exercise_type the resolver chose. The slot is only valid when it
  // matches this exerciseType (the resolver and reader agree on the type).
  const patternExercise =
    acceptsPattern && raw.patternExercise?.exerciseType === exerciseType
      ? raw.patternExercise
      : null

  if (
    !raw.learningItem
    && !(acceptsDialogueLine && raw.dialogueLine)
    && !(acceptsAffixedFormPair && raw.affixedFormPair)
    && !patternExercise
  ) {
    return {
      ok: false,
      reasonCode: 'item_not_found',
      message: `${exerciseType} requires a learningItem (or a dialogueLine for cloze, an affixedFormPair for typed_recall, or a patternExercise for grammar exercises)`,
    }
  }

  // Bucketing invariant: at most one of learningItem / dialogueLine /
  // affixedFormPair / patternExercise is set. The adapter never populates more
  // than one; defend in depth.
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
  if (patternExercise && raw.learningItem) {
    return {
      ok: false,
      reasonCode: 'malformed_payload',
      message: `${exerciseType} received both a learningItem and a patternExercise — bucketing invariant violated`,
      payloadSnapshot: { learningItemId: raw.learningItem.id, patternExerciseId: patternExercise.row.id },
    }
  }

  const learningItem = raw.learningItem  // may be null when dialogueLine / affixedFormPair / patternExercise path is active

  // Builders that need a user-language meaning. For typed_recall the
  // word_form_pair_src path skips this lookup — the prompt comes from the
  // pair's root/derived, not from a translation. Item path for typed_recall
  // still needs a meaning. recognition_mcq / cued_recall / meaning_recall /
  // listening_mcq all stay item-only and always need primaryMeaning.
  const needsPrimaryMeaning: ReadonlySet<ExerciseType> = new Set([
    'recognition_mcq', 'cued_recall', 'typed_recall', 'meaning_recall', 'listening_mcq',
  ])
  let primaryMeaning: ItemMeaning | undefined
  if (needsPrimaryMeaning.has(exerciseType)) {
    if (exerciseType === 'typed_recall' && raw.affixedFormPair) {
      // word_form_pair_src path — no learningItem, no meanings. Skip lookup.
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
  // dialogue_line path carries source_text inside the DialogueLineInput, and
  // the pattern path carries everything inside the typed cloze_mcq row).
  //   cloze: requires either dialogueLine OR a cloze-typed context.
  //   cloze_mcq: requires a cloze-typed context (item path) OR a patternExercise
  //              (pattern path).
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
  // cap-v2 #161: cloze_mcq is pattern-only — the former item path (cloze context
  // → runtime cascade) is removed (item cloze is typed-only, via the `cloze`
  // builder). It now requires a typed cloze_mcq_exercises row like the other
  // grammar exercises (handled by needsPatternExercise below).

  // The pure-grammar exercises render exclusively from a typed pattern row
  // (PR 4 + cap-v2 #161 cloze_mcq). The reader (byKind/pattern.ts) already fails
  // loud when the typed table has no row for a ready pattern cap; this is the
  // projector-side belt-and-braces guard (e.g. resolver picked an exercise_type
  // with no row for this pattern).
  const needsPatternExercise: ReadonlySet<ExerciseType> = new Set([
    'contrast_pair', 'sentence_transformation', 'constrained_translation', 'cloze_mcq',
  ])
  if (needsPatternExercise.has(exerciseType) && !patternExercise) {
    return {
      ok: false,
      reasonCode: 'pattern_typed_row_missing',
      message: `no ${exerciseType} pattern row for this capability`,
      payloadSnapshot: { hasPatternExercise: raw.patternExercise != null, gotExerciseType: raw.patternExercise?.exerciseType ?? null },
    }
  }

  const base = {
    block: raw.block,
    meanings: raw.meanings,
    contexts: raw.contexts,
    answerVariants: raw.answerVariants,
    poolItems: raw.poolItems,
    poolMeaningsByItem: raw.poolMeaningsByItem,
    userLanguage: raw.userLanguage,
    curatedRecognitionDistractors: raw.curatedRecognitionDistractors,
    curatedCuedRecallDistractors: raw.curatedCuedRecallDistractors,
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
    case 'contrast_pair':
    case 'sentence_transformation':
    case 'constrained_translation':
      // Pattern-only (PR 4 + cap-v2 #161 cloze_mcq): the typed grammar-exercise
      // row IS the contract. patternExercise is non-null + type-matched by the
      // needsPatternExercise guard above.
      return { ok: true, input: { ...base, exercise: patternExercise!.row } as BuilderInputFor<T> }
    case 'speaking':
      return { ok: true, input: { ...base, learningItem: learningItem! } as BuilderInputFor<T> }
    case 'typed_recall':
      // typed_recall accepts item OR word_form_pair_src. The projector has
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
