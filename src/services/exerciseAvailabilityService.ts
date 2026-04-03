// src/services/exerciseAvailabilityService.ts
import { supabase } from '@/lib/supabase'
import type { ExerciseTypeAvailability } from '@/types/learning'

// Cache availability data in memory (1-hour TTL)
let availabilityCache: Record<string, ExerciseTypeAvailability> | null = null
let cacheTime: number = 0
const CACHE_TTL_MS = 60 * 60 * 1000 // 1 hour

export const exerciseAvailabilityService = {
  async getAllAvailability(): Promise<Record<string, ExerciseTypeAvailability>> {
    const now = Date.now()

    // Return cached data if fresh
    if (availabilityCache && now - cacheTime < CACHE_TTL_MS) {
      return availabilityCache
    }

    const { data, error } = await supabase
      .schema('indonesian')
      .from('exercise_type_availability')
      .select('*')

    if (error) throw error

    // Build map by exercise_type
    availabilityCache = {}
    for (const item of data || []) {
      availabilityCache[item.exercise_type] = item
    }

    cacheTime = now

    return availabilityCache
  },

  async getAvailability(exerciseType: string): Promise<ExerciseTypeAvailability | null> {
    const all = await exerciseAvailabilityService.getAllAvailability()
    return all[exerciseType] ?? null
  },

  async isSessionEnabled(exerciseType: string): Promise<boolean> {
    const availability = await exerciseAvailabilityService.getAvailability(exerciseType)
    return availability?.session_enabled ?? false
  },

  async requiresApprovedContent(exerciseType: string): Promise<boolean> {
    const availability = await exerciseAvailabilityService.getAvailability(exerciseType)
    return availability?.requires_approved_content ?? false
  },

  // Invalidate cache after content changes
  invalidateCache(): void {
    availabilityCache = null
    cacheTime = 0
  },
}
