// src/stores/cardStore.ts
import { create } from 'zustand'
import { cardService } from '@/services/cardService'
import type { CardSet, DueCard, ReviewDirection } from '@/types/cards'

interface CardState {
  cardSets: CardSet[]
  dueCards: DueCard[]
  loading: boolean
  fetchCardSets: () => Promise<void>
  addCardSet: (name: string, description: string, userId: string) => Promise<void>
  fetchDueCards: (userId: string, direction?: ReviewDirection) => Promise<void>
}

export const useCardStore = create<CardState>((set) => ({
  cardSets: [],
  dueCards: [],
  loading: false,

  fetchCardSets: async () => {
    set({ loading: true })
    try {
      const cardSets = await cardService.getCardSets()
      set({ cardSets, loading: false })
    } catch (error) {
      set({ loading: false })
      throw error
    }
  },

  addCardSet: async (name, description, userId) => {
    const newSet = await cardService.createCardSet(name, description, userId)
    set((state) => ({ cardSets: [newSet, ...state.cardSets] }))
  },

  fetchDueCards: async (userId, direction = 'forward') => {
    set({ loading: true })
    try {
      const dueCards = await cardService.getDueCards(userId, direction)
      set({ dueCards, loading: false })
    } catch (error) {
      set({ loading: false })
      throw error
    }
  },
}))
