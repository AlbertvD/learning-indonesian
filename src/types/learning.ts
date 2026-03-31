// src/types/learning.ts

// === Content types ===

export type ItemType = 'word' | 'phrase' | 'sentence' | 'dialogue_chunk'
export type SourceType = 'lesson' | 'podcast' | 'flashcard' | 'manual'
export type ContextType = 'example_sentence' | 'dialogue' | 'cloze' | 'lesson_snippet'
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
export type SkillType = 'recognition' | 'recall'

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
  learning_item_id: string
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

// === Exercise types ===

export type ExerciseType = 'recognition_mcq' | 'typed_recall' | 'cloze'

export interface ExerciseItem {
  learningItem: LearningItem
  meanings: ItemMeaning[]
  contexts: ItemContext[]
  answerVariants: ItemAnswerVariant[]
  skillType: SkillType
  exerciseType: ExerciseType
  /** For MCQ: distractor options */
  distractors?: string[]
  /** For cloze: the sentence with blank and the target word */
  clozeContext?: {
    sentence: string
    targetWord: string
    translation: string | null
  }
}

export interface SessionQueueItem {
  exerciseItem: ExerciseItem
  learnerItemState: LearnerItemState | null
  learnerSkillState: LearnerSkillState | null
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
