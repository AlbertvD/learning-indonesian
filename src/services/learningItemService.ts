// src/services/learningItemService.ts
import { supabase } from '@/lib/supabase'
import { chunkedIn } from '@/lib/chunkedQuery'
import type { LearningItem, ItemMeaning, ItemContext, ItemAnswerVariant, ExerciseVariant } from '@/types/learning'

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
    return chunkedIn<ItemMeaning>('item_meanings', 'learning_item_id', itemIds)
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
    return chunkedIn<ItemContext>('item_contexts', 'learning_item_id', itemIds)
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
    return chunkedIn<ItemAnswerVariant>('item_answer_variants', 'learning_item_id', itemIds,
      (b) => b.eq('is_accepted', true))
  },

  async getExerciseVariantsByContext(contextIds: string[]): Promise<ExerciseVariant[]> {
    return chunkedIn<ExerciseVariant>('exercise_variants', 'context_id', contextIds,
      (b) => b.eq('is_active', true))
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

    const CHUNK_SIZE = 50
    const result: Record<string, { confusion_group?: string }> = {}

    for (let i = 0; i < itemIds.length; i += CHUNK_SIZE) {
      const chunk = itemIds.slice(i, i + CHUNK_SIZE)
      const { data, error } = await supabase
        .schema('indonesian')
        .from('item_contexts')
        .select('learning_item_id, item_context_grammar_patterns(grammar_pattern_id, grammar_patterns(confusion_group))')
        .in('learning_item_id', chunk)

      if (error) throw error

      for (const row of data ?? []) {
        const links = (row as any).item_context_grammar_patterns ?? []
        for (const link of links) {
          const group = link.grammar_patterns?.confusion_group
          if (group) {
            result[row.learning_item_id] = { confusion_group: group }
            break
          }
        }
      }
    }

    return result
  },
}
