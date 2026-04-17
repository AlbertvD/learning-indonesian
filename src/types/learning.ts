// src/types/learning.ts

// === Content types ===

export type ItemType = 'word' | 'phrase' | 'sentence' | 'dialogue_chunk'
export type SourceType = 'lesson' | 'podcast' | 'flashcard' | 'manual'
export type ContextType = 'example_sentence' | 'dialogue' | 'cloze' | 'lesson_snippet' | 'vocabulary_list' | 'exercise_prompt'
export type VariantType = 'alternative_translation' | 'informal' | 'with_prefix' | 'without_prefix'

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
  score: number | null
  latency_ms: number | null
  hint_used: boolean
  attempt_number: number
  raw_response: string | null
  normalized_response: string | null
  feedback_type: string | null
  scheduler_snapshot: Record<string, unknown> | null
  created_at: string
}

export interface LearnerGrammarState {
  id: string
  user_id: string
  grammar_pattern_id: string
  stage: LearnerStage
  stability: number | null
  difficulty: number | null
  due_at: string | null
  last_reviewed_at: string | null
  review_count: number
  lapse_count: number
  consecutive_failures: number
  updated_at: string
}

export interface GrammarPatternWithLesson {
  id: string
  slug: string
  name: string
  introduced_by_lesson_order: number
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
  }
  /** For cloze_mcq: sentence with blank and 4 options to pick from */
  clozeMcqData?: {
    sentence: string
    translation: string | null
    options: string[]
    correctOptionId: string
    explanationText?: string
  }
  /** For cued_recall: optional cue text and options */
  cuedRecallData?: {
    promptMeaningText: string
    cueText?: string
    options: string[]
    correctOptionId: string
    explanationText?: string
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

export type SessionQueueItem =
  | {
      source: 'vocab'
      exerciseItem: ExerciseItem
      learnerItemState: LearnerItemState | null
      learnerSkillState: LearnerSkillState | null
    }
  | {
      source: 'grammar'
      exerciseItem: ExerciseItem
      grammarState: LearnerGrammarState | null
      grammarPatternId: string
    }

// === Session types ===

export type SessionType = 'lesson' | 'learning' | 'podcast' | 'practice'

// === Leaderboard types ===

export type LeaderboardMetric = 'total_seconds_spent' | 'lessons_completed' | 'items_learned' | 'days_active'

export interface LeaderboardEntry {
  user_id: string
  display_name: string | null
  items_learned: number
  lessons_completed: number
  total_seconds_spent: number
  days_active: number
}

// === Goal system types ===

export type WeeklyGoalType = 'consistency' | 'recall_quality' | 'usable_vocabulary' | 'review_health'
export type GoalDirection = 'at_least' | 'at_most'
export type GoalUnit = 'count' | 'percent'
export type GoalStatus = 'on_track' | 'at_risk' | 'off_track' | 'achieved' | 'missed'

export interface WeeklyGoalSet {
  id: string
  user_id: string
  goal_timezone: string
  week_start_date_local: string
  week_end_date_local: string
  week_starts_at_utc: string
  week_ends_at_utc: string
  generation_strategy_version: string
  generated_at: string
  closing_overdue_count: number | null
  closed_at: string | null
  created_at: string
  updated_at: string
}

export interface WeeklyGoal {
  id: string
  goal_set_id: string
  goal_type: WeeklyGoalType
  goal_direction: GoalDirection
  goal_unit: GoalUnit
  target_value_numeric: number
  current_value_numeric: number
  status: GoalStatus
  is_provisional: boolean
  provisional_reason: string | null
  sample_size: number
  goal_config_jsonb: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface DailyGoalRollup {
  id: string
  user_id: string
  goal_timezone: string
  local_date: string
  study_day_completed: boolean
  recall_accuracy: number | null
  recall_sample_size: number
  usable_items_gained_today: number
  usable_items_total: number
  overdue_count: number
  created_at: string
  updated_at: string
}

export interface TodayPlan {
  due_reviews_today_target: number
  new_items_today_target: number
  recall_interactions_today_target: number
  estimated_minutes_today: number
  weak_items_target: number       // items with lapse_count >= 3 included in today's session
  preferred_session_size: number  // echoed from profile, used for "op basis van N" subtext
  explanatory_text?: string
}

export type GoalState = 'active' | 'timezone_required'

export interface WeeklyGoalResponse {
  state: GoalState
  weeklyGoalSet: WeeklyGoalSet | null
  weeklyGoals: WeeklyGoal[]
  todayPlan: TodayPlan | null
  requiredProfileAction?: 'set_timezone'
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
