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
  learningItemId: string | null
  grammarPatternId: string | null
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
  /** For typed_recall on affixed_form_pair source kind (morphology drills).
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
