import { describe, it, expect, vi, beforeEach } from 'vitest'
import { exerciseAvailabilityService } from '@/services/exerciseAvailabilityService'

// Mock Supabase
vi.mock('@/lib/supabase', () => ({
  supabase: {
    schema: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockResolvedValue({
      data: [
        { exercise_type: 'recognition_mcq', session_enabled: true, authoring_enabled: true, requires_approved_content: false, rollout_phase: 'full', notes: null, created_at: '2024-01-01', updated_at: '2024-01-01' },
        { exercise_type: 'typed_recall', session_enabled: true, authoring_enabled: true, requires_approved_content: false, rollout_phase: 'full', notes: null, created_at: '2024-01-01', updated_at: '2024-01-01' },
        { exercise_type: 'cloze', session_enabled: true, authoring_enabled: true, requires_approved_content: false, rollout_phase: 'full', notes: null, created_at: '2024-01-01', updated_at: '2024-01-01' },
        { exercise_type: 'cued_recall', session_enabled: true, authoring_enabled: true, requires_approved_content: false, rollout_phase: 'full', notes: null, created_at: '2024-01-01', updated_at: '2024-01-01' },
        { exercise_type: 'contrast_pair', session_enabled: true, authoring_enabled: true, requires_approved_content: true, rollout_phase: 'beta', notes: null, created_at: '2024-01-01', updated_at: '2024-01-01' },
        { exercise_type: 'sentence_transformation', session_enabled: true, authoring_enabled: true, requires_approved_content: true, rollout_phase: 'beta', notes: null, created_at: '2024-01-01', updated_at: '2024-01-01' },
        { exercise_type: 'constrained_translation', session_enabled: true, authoring_enabled: true, requires_approved_content: true, rollout_phase: 'beta', notes: null, created_at: '2024-01-01', updated_at: '2024-01-01' },
        { exercise_type: 'speaking', session_enabled: false, authoring_enabled: true, requires_approved_content: true, rollout_phase: 'alpha', notes: null, created_at: '2024-01-01', updated_at: '2024-01-01' },
      ],
      error: null,
    }),
  },
}))

describe('exerciseAvailabilityService', () => {
  beforeEach(() => {
    exerciseAvailabilityService.invalidateCache()
  })

  describe('getAllAvailability', () => {
    it('fetches all exercise type availability', async () => {
      const result = await exerciseAvailabilityService.getAllAvailability()

      expect(result).toHaveProperty('recognition_mcq')
      expect(result).toHaveProperty('typed_recall')
      expect(result).toHaveProperty('cloze')
      expect(result).toHaveProperty('speaking')
      expect(Object.keys(result)).toHaveLength(8)
    })

    it('caches results for subsequent calls', async () => {
      const result1 = await exerciseAvailabilityService.getAllAvailability()
      const result2 = await exerciseAvailabilityService.getAllAvailability()

      expect(result1).toBe(result2) // Same object reference
    })
  })

  describe('getAvailability', () => {
    it('returns availability for a specific exercise type', async () => {
      const availability = await exerciseAvailabilityService.getAvailability('recognition_mcq')

      expect(availability).toBeDefined()
      expect(availability?.exercise_type).toBe('recognition_mcq')
      expect(availability?.session_enabled).toBe(true)
    })

    it('returns null for unknown exercise type', async () => {
      const availability = await exerciseAvailabilityService.getAvailability('unknown_type')

      expect(availability).toBeNull()
    })
  })

  describe('isSessionEnabled', () => {
    it('returns true for session-enabled types', async () => {
      const enabled = await exerciseAvailabilityService.isSessionEnabled('recognition_mcq')

      expect(enabled).toBe(true)
    })

    it('returns false for disabled types', async () => {
      const enabled = await exerciseAvailabilityService.isSessionEnabled('speaking')

      expect(enabled).toBe(false)
    })

    it('returns false for unknown types', async () => {
      const enabled = await exerciseAvailabilityService.isSessionEnabled('unknown')

      expect(enabled).toBe(false)
    })
  })

  describe('requiresApprovedContent', () => {
    it('returns true for types requiring approved content', async () => {
      const requires = await exerciseAvailabilityService.requiresApprovedContent('contrast_pair')

      expect(requires).toBe(true)
    })

    it('returns false for live-content types', async () => {
      const requires = await exerciseAvailabilityService.requiresApprovedContent('recognition_mcq')

      expect(requires).toBe(false)
    })

    it('returns false for unknown types', async () => {
      const requires = await exerciseAvailabilityService.requiresApprovedContent('unknown')

      expect(requires).toBe(false)
    })
  })

  describe('invalidateCache', () => {
    it('clears cached availability data', async () => {
      await exerciseAvailabilityService.getAllAvailability()
      exerciseAvailabilityService.invalidateCache()

      // After invalidation, next call will fetch fresh data
      const result = await exerciseAvailabilityService.getAllAvailability()
      expect(result).toBeDefined()
    })
  })
})
