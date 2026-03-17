// src/types/cards.ts
export type Visibility = 'private' | 'shared' | 'public'

export interface CardSetShare {
  shared_with_user_id: string
  profiles: Array<{
    id: string
    display_name: string | null
  }>
}

export interface ProfileSearchResult {
  id: string
  display_name: string | null
}

export interface CardSet {
  id: string
  owner_id: string
  name: string
  description: string | null
  visibility: Visibility
  created_at: string
}

export interface AnkiCard {
  id: string
  card_set_id: string
  owner_id: string
  front: string
  back: string
  notes: string | null
  tags: string[]
  created_at: string
}

export interface DueCard {
  id: string
  card_id: string
  user_id: string
  easiness_factor: number
  interval_days: number
  repetitions: number
  next_review_at: string
  last_reviewed_at: string | null
  anki_cards: AnkiCard & {
    card_sets: CardSet
  }
}
