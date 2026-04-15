// src/services/grammarStateService.ts
import { supabase } from '@/lib/supabase'
import { chunkedIn } from '@/lib/chunkedQuery'
import type { LearnerGrammarState, GrammarPatternWithLesson, ExerciseVariant } from '@/types/learning'

const CHUNK_SIZE = 50

export const grammarStateService = {
  async getGrammarStates(userId: string): Promise<LearnerGrammarState[]> {
    const { data, error } = await supabase
      .schema('indonesian')
      .from('learner_grammar_state')
      .select('*')
      .eq('user_id', userId)
    if (error) throw error
    return data ?? []
  },

  async getAllGrammarPatterns(): Promise<GrammarPatternWithLesson[]> {
    const { data, error } = await supabase
      .schema('indonesian')
      .from('grammar_patterns')
      .select('id, slug, name, lessons!introduced_by_lesson_id(order_index)')
    if (error) throw error
    return (data ?? []).map((row: any) => ({
      id: row.id,
      slug: row.slug,
      name: row.name,
      introduced_by_lesson_order: row.lessons?.order_index ?? 9999,
    }))
  },

  async getGrammarVariants(patternIds: string[]): Promise<ExerciseVariant[]> {
    return chunkedIn<ExerciseVariant>('exercise_variants', 'grammar_pattern_id', patternIds,
      (b) => b.eq('is_active', true))
  },

  // Idempotent — seeds all patterns as stage='new'. ON CONFLICT DO NOTHING.
  // Safe to call on every session start. New patterns added when new lessons are published
  // will be picked up automatically on the next session.
  async seedGrammarStates(userId: string, patternIds: string[]): Promise<void> {
    if (patternIds.length === 0) return
    const rows = patternIds.map(id => ({ user_id: userId, grammar_pattern_id: id }))
    for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
      const chunk = rows.slice(i, i + CHUNK_SIZE)
      const { error } = await supabase
        .schema('indonesian')
        .from('learner_grammar_state')
        .upsert(chunk, { onConflict: 'user_id,grammar_pattern_id', ignoreDuplicates: true })
      if (error) throw error
    }
  },

  async upsertGrammarState(
    state: Omit<LearnerGrammarState, 'id' | 'updated_at'>,
  ): Promise<LearnerGrammarState> {
    const { data, error } = await supabase
      .schema('indonesian')
      .from('learner_grammar_state')
      .upsert(
        { ...state, updated_at: new Date().toISOString() },
        { onConflict: 'user_id,grammar_pattern_id' },
      )
      .select()
      .single()
    if (error) throw error
    return data
  },
}
