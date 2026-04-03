import { describe, it, expect } from 'vitest'
import type {
  TextbookSource,
  TextbookPage,
  GrammarPattern,
  GeneratedExerciseCandidate,
} from '@/types/contentGeneration'
import type {
  ItemContextGrammarPattern,
  ExerciseVariant,
  ExerciseTypeAvailability,
} from '@/types/learning'

describe('Content generation types', () => {
  it('compiles TextbookSource type', () => {
    const source: TextbookSource = {
      id: '1',
      source_name: 'Test Textbook',
      source_type: 'paper_textbook',
      publisher: 'Test Publisher',
      edition: '1st',
      language: 'id',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    expect(source.source_name).toBe('Test Textbook')
  })

  it('compiles TextbookPage type', () => {
    const page: TextbookPage = {
      id: '1',
      textbook_source_id: '1',
      page_number: 5,
      raw_ocr_text: 'Sample OCR text',
      ocr_confidence: 0.95,
      import_batch_id: 'batch-1',
      needs_manual_review: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    expect(page.page_number).toBe(5)
  })

  it('compiles GrammarPattern type', () => {
    const pattern: GrammarPattern = {
      id: '1',
      slug: 'present-tense',
      name: 'Present Tense',
      short_explanation: 'Describes current actions',
      complexity_score: 3,
      confusion_group: 'tense-forms',
      introduced_by_source_id: 'source-1',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    expect(pattern.complexity_score).toBe(3)
  })

  it('compiles GeneratedExerciseCandidate type', () => {
    const candidate: GeneratedExerciseCandidate = {
      id: '1',
      textbook_source_id: '1',
      textbook_page_id: '1',
      candidate_type: 'exercise_variant',
      exercise_type: 'contrast_pair',
      review_status: 'pending_review',
      prompt_version: '1.0',
      model_name: 'claude-3-sonnet',
      generated_payload_json: { promptText: 'Choose the correct form' },
      reviewer_notes: null,
      approved_publication_target: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    expect(candidate.review_status).toBe('pending_review')
  })

  it('compiles ItemContextGrammarPattern type', () => {
    const link: ItemContextGrammarPattern = {
      id: '1',
      context_id: 'ctx-1',
      grammar_pattern_id: 'pattern-1',
      is_primary: true,
      created_at: new Date().toISOString(),
    }
    expect(link.is_primary).toBe(true)
  })

  it('compiles ExerciseVariant type', () => {
    const variant: ExerciseVariant = {
      id: '1',
      exercise_type: 'contrast_pair',
      learning_item_id: 'item-1',
      context_id: 'ctx-1',
      grammar_pattern_id: 'pattern-1',
      payload_json: { promptText: 'Choose' },
      answer_key_json: { correctOptionId: 'opt-1' },
      source_candidate_id: 'cand-1',
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    expect(variant.is_active).toBe(true)
  })

  it('compiles ExerciseTypeAvailability type', () => {
    const availability: ExerciseTypeAvailability = {
      exercise_type: 'contrast_pair',
      session_enabled: true,
      authoring_enabled: true,
      requires_approved_content: true,
      rollout_phase: 'alpha',
      notes: 'Text-first rollout',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    expect(availability.session_enabled).toBe(true)
  })
})
