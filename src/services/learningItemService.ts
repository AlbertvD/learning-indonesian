// src/services/learningItemService.ts
import { supabase } from '@/lib/supabase'
import type { LearningItem, ItemMeaning, ItemContext, ItemAnswerVariant } from '@/types/learning'

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
}
