// src/services/learningItemService.ts
import { supabase } from '@/lib/supabase'
import type { LearningItem, ItemMeaning, ItemContext, ItemAnswerVariant } from '@/types/learning'
import type { ExerciseVariant } from '@/types/contentGeneration'

export interface ItemContextGrammarPattern {
  context_id: string
  grammar_pattern_id: string
  pattern_name?: string
}

export const learningItemService = {
  async getLearningItems(): Promise<LearningItem[]> {
    const { data, error } = await supabase
      .schema('indonesian')
      .from('learning_items')
      .select('*')
      .eq('is_active', true)
      .order('base_text')
    if (error) throw error
    return data
  },

  async getLearningItem(id: string): Promise<LearningItem> {
    const { data, error } = await supabase
      .schema('indonesian')
      .from('learning_items')
      .select('*')
      .eq('id', id)
      .single()
    if (error) throw error
    return data
  },

  async getMeanings(itemId: string): Promise<ItemMeaning[]> {
    const { data, error } = await supabase
      .schema('indonesian')
      .from('item_meanings')
      .select('*')
      .eq('learning_item_id', itemId)
    if (error) throw error
    return data
  },

  async getMeaningsBatch(itemIds: string[]): Promise<ItemMeaning[]> {
    const { data, error } = await supabase
      .schema('indonesian')
      .from('item_meanings')
      .select('*')
      .in('learning_item_id', itemIds)
    if (error) throw error
    return data
  },

  async getContexts(itemId: string): Promise<ItemContext[]> {
    const { data, error } = await supabase
      .schema('indonesian')
      .from('item_contexts')
      .select('*')
      .eq('learning_item_id', itemId)
    if (error) throw error
    return data
  },

  async getContextsBatch(itemIds: string[]): Promise<ItemContext[]> {
    const { data, error } = await supabase
      .schema('indonesian')
      .from('item_contexts')
      .select('*')
      .in('learning_item_id', itemIds)
    if (error) throw error
    return data
  },

  async getItemContextsByLesson(lessonId: string): Promise<ItemContext[]> {
    const { data, error } = await supabase
      .schema('indonesian')
      .from('item_contexts')
      .select('*')
      .eq('source_lesson_id', lessonId)
    if (error) throw error
    return data
  },

  async getAnswerVariants(itemId: string): Promise<ItemAnswerVariant[]> {
    const { data, error } = await supabase
      .schema('indonesian')
      .from('item_answer_variants')
      .select('*')
      .eq('learning_item_id', itemId)
      .eq('is_accepted', true)
    if (error) throw error
    return data
  },

  async getAnswerVariantsBatch(itemIds: string[]): Promise<ItemAnswerVariant[]> {
    const { data, error } = await supabase
      .schema('indonesian')
      .from('item_answer_variants')
      .select('*')
      .in('learning_item_id', itemIds)
      .eq('is_accepted', true)
    if (error) throw error
    return data
  },

  async getExerciseVariantsByContext(contextIds: string[]): Promise<ExerciseVariant[]> {
    // Batch into chunks of 50 to avoid Kong's URL length limit, which drops CORS headers
    // on very long GET requests containing hundreds of UUIDs in the IN clause.
    const CHUNK_SIZE = 50
    const results: ExerciseVariant[] = []
    for (let i = 0; i < contextIds.length; i += CHUNK_SIZE) {
      const chunk = contextIds.slice(i, i + CHUNK_SIZE)
      const { data, error } = await supabase
        .schema('indonesian')
        .from('exercise_variants')
        .select('*')
        .in('context_id', chunk)
        .eq('is_active', true)
      if (error) throw error
      results.push(...data)
    }
    return results
  },

  async getItemContextGrammarPatterns(contextIds: string[]): Promise<ItemContextGrammarPattern[]> {
    const { data, error } = await supabase
      .schema('indonesian')
      .from('item_context_grammar_patterns')
      .select('context_id, grammar_pattern_id')
      .in('context_id', contextIds)
    if (error) throw error
    return data
  },

  /**
   * Returns a map of learning_item_id → { confusion_group } for use in
   * grammar-aware session interleaving. Joins item_contexts →
   * item_context_grammar_patterns → grammar_patterns.
   */
  async getGrammarPatternsByItem(
    itemIds: string[],
  ): Promise<Record<string, { confusion_group?: string }>> {
    if (itemIds.length === 0) return {}

    const { data, error } = await supabase
      .schema('indonesian')
      .from('item_contexts')
      .select('learning_item_id, item_context_grammar_patterns(grammar_pattern_id, grammar_patterns(confusion_group))')
      .in('learning_item_id', itemIds)

    if (error) throw error

    const result: Record<string, { confusion_group?: string }> = {}
    for (const row of data ?? []) {
      const links = (row as any).item_context_grammar_patterns ?? []
      for (const link of links) {
        const group = link.grammar_patterns?.confusion_group
        if (group) {
          result[row.learning_item_id] = { confusion_group: group }
          break // one confusion group per item is enough
        }
      }
    }
    return result
  },
}
