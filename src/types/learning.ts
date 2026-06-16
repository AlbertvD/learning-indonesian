// src/types/learning.ts

// === Content types ===

export type ItemType = 'word' | 'phrase' | 'sentence' | 'dialogue_chunk'
export type SourceType = 'lesson' | 'podcast' | 'flashcard' | 'manual'
export type ContextType = 'example_sentence' | 'dialogue' | 'cloze' | 'lesson_snippet' | 'vocabulary_list' | 'exercise_prompt'
export type VariantType = 'alternative_translation' | 'informal' | 'with_prefix' | 'without_prefix'

/**
 * Part of speech — 12-value UD-aligned taxonomy for distractor filtering
 * in MCQ exercises. Null for sentence/dialogue_chunk items (POS is word-level).
 * See docs/plans/2026-04-17-pos-aware-distractors-design.md.
 */
export type POS =
  | 'verb' | 'noun' | 'adjective' | 'adverb' | 'pronoun'
  | 'numeral' | 'classifier' | 'preposition' | 'conjunction'
  | 'particle' | 'question_word' | 'greeting'

export interface LearningItem {
  id: string
  item_type: ItemType
  base_text: string
  normalized_text: string
  language: string
  level: string
  source_type: SourceType
  source_vocabulary_id: string | null
  source_card_id: string | null
  notes: string | null
  is_active: boolean
  pos: POS | null
  /** Decision R: inline translation columns (replaces item_meanings JOIN). null until after first re-publish. */
  translation_nl: string | null
  translation_en: string | null
  usage_note: string | null
  created_at: string
  updated_at: string
}

export interface ItemMeaning {
  id: string
  learning_item_id: string
  translation_language: 'en' | 'nl'
  translation_text: string
  sense_label: string | null
  usage_note: string | null
  is_primary: boolean
}

export interface ItemContext {
  id: string
  learning_item_id: string
  context_type: ContextType
  source_text: string
  translation_text: string | null
  difficulty: string | null
  topic_tag: string | null
  is_anchor_context: boolean
  source_lesson_id: string | null
  source_section_id: string | null
}

export interface ItemAnswerVariant {
  id: string
  learning_item_id: string
  variant_text: string
  variant_type: VariantType
  language: string
  is_accepted: boolean
  notes: string | null
}

// === Learner state types ===

export type LearnerStage = 'new' | 'anchoring' | 'retrieving' | 'productive' | 'maintenance'
export type SkillType = 'recognition' | 'form_recall' | 'meaning_recall' | 'spoken_production'

export interface LearnerItemState {
  id: string
  user_id: string
  learning_item_id: string
  stage: LearnerStage
  introduced_at: string | null
  last_seen_at: string | null
  priority: number | null
  origin: string | null
  times_seen: number
  is_leech: boolean
  suspended: boolean
  gate_check_passed: boolean | null
  updated_at: string
}

export interface LearnerSkillState {
  id: string
  user_id: string
  learning_item_id: string
  skill_type: SkillType
  stability: number
  difficulty: number
  retrievability: number | null
  last_reviewed_at: string | null
  next_due_at: string | null
  success_count: number
  failure_count: number
  lapse_count: number
  consecutive_failures: number
  mean_latency_ms: number | null
  hint_rate: number | null
  updated_at: string
}

export interface ReviewEvent {
  id: string
  user_id: string
  learning_item_id: string | null      // null for grammar reviews
  grammar_pattern_id: string | null    // null for vocab reviews; set for grammar reviews
  skill_type: SkillType
  exercise_type: ExerciseType
  session_id: string
  was_correct: boolean
  latency_ms: number | null
  hint_used: boolean
  attempt_number: number
  raw_response: string | null
  normalized_response: string | null
  scheduler_snapshot: Record<string, unknown> | null
  created_at: string
}

// === Exercise types ===

export type ExerciseType =
  | 'recognition_mcq'
  | 'cued_recall'
  | 'typed_recall'
  | 'meaning_recall'
  | 'cloze'
  | 'cloze_mcq'
  | 'contrast_pair'
  | 'sentence_transformation'
  | 'constrained_translation'
  | 'speaking'
  | 'listening_mcq'
  | 'dictation'

export type FlagType = 'wrong_translation' | 'bad_sentence' | 'confusing' | 'sunset' | 'other'
export type FlagStatus = 'open' | 'resolved'

export interface ContentFlag {
  id: string
  userId: string
  /** Uniform anchor — every flag points at the capability the exercise drills.
   *  Replaces the old learning_item_id / grammar_pattern_id anchors, which left
   *  dialogue-cloze and affixed-pair exercises (capability-only) unflaggable. */
  capabilityId: string
  exerciseType: ExerciseType
  exerciseVariantId: string | null
  flagType: FlagType
  comment: string | null
  status: FlagStatus
  createdAt: string
  updatedAt: string
}

export interface ReviewComment {
  id: string
  userId: string
  exerciseVariantId: string
  comment: string
  status: 'open' | 'resolved'
  createdAt: string
  updatedAt: string
}

export interface ReviewCommentWithContext extends ReviewComment {
  lessonTitle: string
  exerciseType: string
  promptSummary: string   // first 80 chars of the main prompt field, derived client-side
}

export interface ExerciseItem {
  learningItem: LearningItem | null   // null for grammar exercises
  /** Set for grammar-pattern exercises (contrast_pair, sentence_transformation,
   *  constrained_translation, cloze_mcq); null/absent for item-sourced ones.
   *  Carries the flag-tool anchor so admins can flag grammar content. */
  grammarPatternId?: string | null
  meanings: ItemMeaning[]
  contexts: ItemContext[]
  answerVariants: ItemAnswerVariant[]
  skillType: SkillType
  exerciseType: ExerciseType
  /** For MCQ exercises: distractor options */
  distractors?: string[]
  /** For cloze: the sentence with blank and the target word */
  clozeContext?: {
    sentence: string
    targetWord: string
    translation: string | null
    /** Set for dialogue_line-sourced clozes; the UI renders it as a speaker
     *  prefix (e.g. *Titin:* Aku tidak ___ tinggal di rumah terus.). null
     *  for item-sourced clozes; UI omits the prefix. */
    speaker?: string | null
  }
  /** For cloze_mcq: sentence with blank and 4 options to pick from */
  clozeMcqData?: {
    sentence: string
    translation: string | null
    options: string[]
    correctOptionId: string
    explanationText?: string
    /** Same role as clozeContext.speaker — set for dialogue_line-sourced clozes. */
    speaker?: string | null
  }
  /** For cued_recall: optional cue text and options */
  cuedRecallData?: {
    promptMeaningText: string
    cueText?: string
    options: string[]
    correctOptionId: string
    explanationText?: string
  }
  /** For typed_recall on word_form_pair_src source kind (morphology drills).
   *  Set by the byType typed_recall builder when input.affixedFormPair is
   *  populated; null for item-sourced typed_recall (existing path). The UI
   *  branches on this field's presence. */
  affixedFormPairData?: {
    /** Prompt the learner sees (e.g. "Form the meN- form of: baca"). */
    promptText: string
    /** The exact answer string the learner must type. */
    acceptedAnswer: string
    /** Pair direction. Drives prompt vs answer assignment. */
    direction: 'root_to_derived' | 'derived_to_root'
    /** Allomorph rule string, surfaced on the wrong-answer Doorgaan screen
     *  as the explanation (via feedbackMapping.ts grammar-reveal layout). */
    allomorphRule: string
    /** Raw root + derived strings, carried for the feedback layer + the
     *  audibleTexts TTS prefetch. */
    root: string
    derived: string
  }
  /** For contrast_pair: contrast options and metadata */
  contrastPairData?: {
    promptText: string
    targetMeaning: string
    options: [string, string]
    correctOptionId: string
    explanationText: string
  }
  /** For sentence_transformation: source and instruction */
  sentenceTransformationData?: {
    sourceSentence: string
    transformationInstruction: string
    acceptableAnswers: string[]
    hintText?: string
    explanationText: string
  }
  /** For constrained_translation: translation with constraints */
  constrainedTranslationData?: {
    sourceLanguageSentence: string
    requiredTargetPattern: string
    patternName: string
    acceptableAnswers: string[]
    disallowedShortcutForms?: string[]
    explanationText: string
    /** Cloze mode: Indonesian sentence with ___ where the target word goes */
    targetSentenceWithBlank?: string
    /** Cloze mode: just the target word(s) to accept (e.g. ['belum', 'tidak']) */
    blankAcceptableAnswers?: string[]
  }
  /** For speaking: prompt and scenario */
  speakingData?: {
    promptText: string
    targetPatternOrScenario?: string
    transcript?: string
    selfRating?: number
    confidenceScore?: number
  }
}

// === Content generation and exercise variants ===

export interface ItemContextGrammarPattern {
  id: string
  context_id: string
  grammar_pattern_id: string
  is_primary: boolean
  created_at: string
}

// RETIRE IN PR 7 (final cleanup). The `exercise_variants` table is still
// dual-written by the capability-stage runner (projectors/grammarExerciseRows.ts)
// alongside the 4 typed exercise tables, so this type is referenced by writer
// code until that table is dropped. The admin READER switched off it in PR 4a —
// see ExerciseReviewRow below. No live reader of this type remains in src/ except
// coverageService.ts (a row count, also PR 7).
export interface ExerciseVariant {
  id: string
  exercise_type: string
  learning_item_id: string | null    // null for grammar exercises
  context_id: string | null          // null for grammar exercises
  grammar_pattern_id: string | null
  payload_json: Record<string, any>
  answer_key_json: Record<string, any>
  source_candidate_id: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

// ─── Typed grammar-exercise rows (PR 4 — pattern source_kind) ────────────────
// One row per authored grammar exercise, keyed by grammar_pattern_id (NOT
// capability_id — the pattern cap links via source_ref → grammar_patterns.slug
// → grammar_pattern_id). These replace exercise_variants.payload_json's
// per-exercise_type JSON shapes with typed columns (target plan Decision B).
// Mirrors scripts/migration.sql:2483-2600. `source_candidate_id` is a naked
// uuid (no FK; generated_exercise_candidates retires in PR 7) — currently
// unpopulated (audit m4). The runtime reader (byKind/pattern.ts) collapses the
// N rows per (pattern, exercise_type) to one, mirroring the legacy
// variantByItemAndType single-pick.

export interface ContrastPairExercisesRow {
  id: string
  grammar_pattern_id: string
  lesson_id: string
  prompt_text: string
  target_meaning: string
  /** shape: [{id: string, text: string}, ...] — see audit I2 (differs from
   *  cloze_mcq_exercises.options, which is string[]). */
  options: Array<{ id: string; text: string }>
  correct_option_id: string
  explanation_text: string
  is_active: boolean
  source_candidate_id: string | null
  created_at: string
  updated_at: string
}

export interface SentenceTransformationExercisesRow {
  id: string
  grammar_pattern_id: string
  lesson_id: string
  source_sentence: string
  transformation_instruction: string
  hint_text: string | null
  acceptable_answers: string[]
  explanation_text: string
  is_active: boolean
  source_candidate_id: string | null
  created_at: string
  updated_at: string
}

export interface ConstrainedTranslationExercisesRow {
  id: string
  grammar_pattern_id: string
  lesson_id: string
  source_language_sentence: string
  required_target_pattern: string
  disallowed_shortcut_forms: string[]
  acceptable_answers: string[]
  explanation_text: string
  is_active: boolean
  source_candidate_id: string | null
  created_at: string
  updated_at: string
}

export interface ClozeMcqExercisesRow {
  id: string
  grammar_pattern_id: string
  lesson_id: string
  sentence: string
  translation: string
  /** shape: string[] — see audit I2 (differs from contrast_pair_exercises.options). */
  options: string[]
  correct_option_id: string
  explanation_text: string
  is_active: boolean
  source_candidate_id: string | null
  created_at: string
  updated_at: string
}

// ─── Admin review shape (PR 4a — pattern source_kind admin path) ─────────────
// Discriminated union over `exercise_type`, one branch per typed grammar-exercise
// table. The admin review flow (exerciseReviewService → ContentReview →
// VariantPreview / ExerciseSummaryCard) reads these typed rows directly instead
// of probing the retired `exercise_variants.payload_json`.
//
// `id` IS the shared exercise uuid: PR 4's dual-write reuses one uuid across the
// typed table AND exercise_variants (verified 141/189/240/146 id-matched against
// the live DB, 2026-05-25), so exercise_review_comments.exercise_variant_id keying
// is unchanged — comments saved against a typed row still satisfy the FK to
// exercise_variants.id, which survives until PR 7.
//
// These 4 are the only exercise_types that exist as authored rows (vocab
// exercises are generated at runtime, never persisted — verified 0 vocab rows in
// exercise_variants). The admin browser is therefore grammar-only.
export type ExerciseReviewRow =
  | ({ exercise_type: 'contrast_pair' } & ContrastPairExercisesRow)
  | ({ exercise_type: 'sentence_transformation' } & SentenceTransformationExercisesRow)
  | ({ exercise_type: 'constrained_translation' } & ConstrainedTranslationExercisesRow)
  | ({ exercise_type: 'cloze_mcq' } & ClozeMcqExercisesRow)

export interface ExerciseTypeAvailability {
  exercise_type: string
  session_enabled: boolean
  authoring_enabled: boolean
  requires_approved_content: boolean
  rollout_phase: string
  notes: string | null
  created_at: string
  updated_at: string
}
