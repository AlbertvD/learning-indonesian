// Content generation and review staging types

export interface TextbookSource {
  id: string
  source_name: string
  source_type: 'paper_textbook'
  publisher: string | null
  edition: string | null
  language: string | null
  created_at: string
  updated_at: string
}

export interface TextbookPage {
  id: string
  textbook_source_id: string
  page_number: number
  raw_ocr_text: string
  ocr_confidence: number | null
  import_batch_id: string | null
  needs_manual_review: boolean
  created_at: string
  updated_at: string
}

export interface GrammarPattern {
  id: string
  slug: string
  name: string
  short_explanation: string
  complexity_score: number
  confusion_group: string | null
  introduced_by_source_id: string | null
  created_at: string
  updated_at: string
}

export type CandidateType = 'context' | 'exercise_variant' | 'grammar_pattern'
export type ReviewStatus = 'pending_review' | 'approved' | 'rejected' | 'published'

export interface GeneratedExerciseCandidate {
  id: string
  textbook_source_id: string
  textbook_page_id: string
  candidate_type: CandidateType
  exercise_type: string
  review_status: ReviewStatus
  prompt_version: string
  model_name: string
  generated_payload_json: Record<string, any>
  reviewer_notes: string | null
  approved_publication_target: string | null
  created_at: string
  updated_at: string
}

export interface ContentReviewItem {
  id: string
  textbook_source_id: string
  textbook_page_id: string
  candidate_type: CandidateType
  exercise_type: string
  review_status: ReviewStatus
  prompt_version: string
  model_name: string
  generated_payload_json: Record<string, any>
  reviewer_notes: string | null
  approved_publication_target: string | null
  created_at: string
  updated_at: string
}

// ExerciseVariant is defined in learning.ts (authoritative, matches DB schema)
export type { ExerciseVariant } from '@/types/learning'
