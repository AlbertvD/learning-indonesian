import { describe, it, expect, vi, beforeEach } from 'vitest'
import { entitlementService, isActiveStatus, FREE_TIER_MAX_LESSON, type EntitlementStatus } from '@/services/entitlementService'
import { supabase } from '@/lib/supabase'

function createChainableMock() {
  const chain: any = {}
  for (const method of ['from', 'select', 'eq']) {
    chain[method] = vi.fn(() => chain)
  }
  chain.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null })
  return chain
}

const mockChain = createChainableMock()

vi.mock('@/lib/supabase', () => ({
  supabase: {
    schema: vi.fn(() => mockChain),
  },
}))

describe('entitlementService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('isActiveStatus', () => {
    it.each<EntitlementStatus>(['active', 'past_due', 'comped'])('%s is an active status', (status) => {
      expect(isActiveStatus(status)).toBe(true)
    })

    it('canceled is not an active status', () => {
      expect(isActiveStatus('canceled')).toBe(false)
    })
  })

  it('FREE_TIER_MAX_LESSON is 3 — the TS twin of indonesian.is_free_tier_lesson', () => {
    expect(FREE_TIER_MAX_LESSON).toBe(3)
  })

  describe('getEntitlement', () => {
    it('returns null when the caller has no entitlement row', async () => {
      mockChain.maybeSingle.mockResolvedValueOnce({ data: null, error: null })

      const result = await entitlementService.getEntitlement('user-1')

      expect(supabase.schema).toHaveBeenCalledWith('indonesian')
      expect(mockChain.from).toHaveBeenCalledWith('entitlements')
      expect(mockChain.eq).toHaveBeenCalledWith('user_id', 'user-1')
      expect(result).toBeNull()
    })

    it('returns the row when one exists', async () => {
      const row = {
        user_id: 'user-1',
        status: 'active',
        source: 'stripe',
        stripe_customer_id: 'cus_123',
        stripe_subscription_id: 'sub_123',
        current_period_end: '2026-08-12T00:00:00Z',
      }
      mockChain.maybeSingle.mockResolvedValueOnce({ data: row, error: null })

      const result = await entitlementService.getEntitlement('user-1')

      expect(result).toEqual(row)
    })

    it('throws on a Supabase error rather than swallowing it', async () => {
      mockChain.maybeSingle.mockResolvedValueOnce({ data: null, error: { message: 'read failed' } })

      await expect(entitlementService.getEntitlement('user-1')).rejects.toBeTruthy()
    })
  })
})
