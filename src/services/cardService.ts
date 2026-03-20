// src/services/cardService.ts
import { supabase } from '@/lib/supabase'
import type { AnkiCard, CardSet, CardSetShare, DueCard, ProfileSearchResult } from '@/types/cards'

export const cardService = {
  async getCardSets(): Promise<CardSet[]> {
    const { data, error } = await supabase
      .schema('indonesian')
      .from('card_sets')
      .select('*')
      .order('name', { ascending: true })
    if (error) throw error
    return data
  },

  async initializeCardReviews(cardIds: string[], userId: string): Promise<void> {
    // Insert a review row for each card that doesn't have one yet.
    // ignoreDuplicates: true means existing review state is never overwritten.
    const rows = cardIds.map((cardId) => ({
      card_id: cardId,
      user_id: userId,
      next_review_at: new Date().toISOString(),
    }))
    const { error } = await supabase
      .schema('indonesian')
      .from('card_reviews')
      .upsert(rows, { onConflict: 'card_id,user_id', ignoreDuplicates: true })
    if (error) throw error
  },

  async getCards(setId: string): Promise<AnkiCard[]> {
    const { data, error } = await supabase
      .schema('indonesian')
      .from('anki_cards')
      .select('*')
      .eq('card_set_id', setId)
      .order('front', { ascending: true })
    if (error) throw error
    return data
  },

  async createCardSet(name: string, description: string, userId: string): Promise<CardSet> {
    const { data, error } = await supabase
      .schema('indonesian')
      .from('card_sets')
      .insert({ name, description, owner_id: userId, visibility: 'private' })
      .select()
      .single()
    if (error) throw error
    return data
  },

  async createCard(setId: string, front: string, back: string, notes?: string): Promise<AnkiCard> {
    const { data, error } = await supabase
      .schema('indonesian')
      .from('anki_cards')
      .insert({ card_set_id: setId, front, back, notes: notes || null })
      .select()
      .single()
    if (error) throw error
    return data
  },

  async getDueCards(userId: string): Promise<DueCard[]> {
    const { data, error } = await supabase
      .schema('indonesian')
      .from('card_reviews')
      .select('*, anki_cards!inner(*, card_sets!inner(*))')
      .eq('user_id', userId)
      .lte('next_review_at', new Date().toISOString())
      .order('next_review_at')
    if (error) throw error
    return data as unknown as DueCard[]
  },

  async updateCardReview(cardId: string, userId: string, sm2: {
    easiness_factor: number
    interval_days: number
    repetitions: number
    next_review_at: string
    last_reviewed_at: string
  }): Promise<void> {
    const { error } = await supabase
      .schema('indonesian')
      .from('card_reviews')
      .upsert({ card_id: cardId, user_id: userId, ...sm2 }, { onConflict: 'card_id,user_id' })
    if (error) throw error
  },

  async updateCardSetVisibility(setId: string, visibility: 'private' | 'shared' | 'public'): Promise<void> {
    const { error } = await supabase
      .schema('indonesian')
      .from('card_sets')
      .update({ visibility })
      .eq('id', setId)
    if (error) throw error
  },

  async shareCardSet(setId: string, withUserId: string): Promise<void> {
    const { error } = await supabase
      .schema('indonesian')
      .from('card_set_shares')
      .insert({ card_set_id: setId, shared_with_user_id: withUserId })
    if (error) throw error
  },

  async unshareCardSet(setId: string, withUserId: string): Promise<void> {
    const { error } = await supabase
      .schema('indonesian')
      .from('card_set_shares')
      .delete()
      .eq('card_set_id', setId)
      .eq('shared_with_user_id', withUserId)
    if (error) throw error
  },

  async getCardSetShares(setId: string): Promise<CardSetShare[]> {
    const { data, error } = await supabase
      .schema('indonesian')
      .from('card_set_shares')
      .select('shared_with_user_id, profiles!inner(display_name, id)')
      .eq('card_set_id', setId)
    if (error) throw error
    return data
  },

  async searchProfiles(query: string): Promise<ProfileSearchResult[]> {
    const { data, error } = await supabase
      .schema('indonesian')
      .from('profiles')
      .select('id, display_name')
      .ilike('display_name', `%${query}%`)
      .limit(10)
    if (error) throw error
    return data
  },
}
