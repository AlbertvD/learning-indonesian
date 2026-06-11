import { describe, it, expect, vi } from 'vitest'
import { createEngagement } from '../index'

const fullRow = {
  streak_days: 4,
  minutes_today: 12,
  minutes_this_week: 45,
  minutes_last_week: 30,
  minutes_this_month: 160,
  minutes_last_month: 120,
  avg_session_minutes: 8,
  active_days_this_week: 3,
  last_practice_age_days: 0,
}

describe('engagement.practiceTime', () => {
  it('maps the get_practice_time RPC row into the camelCase PracticeTime shape', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: fullRow, error: null })
    const client = { schema: () => ({ rpc }) }

    const engagement = createEngagement(client as never)
    const pt = await engagement.practiceTime('user-1', 'Europe/Amsterdam')

    expect(pt).toEqual({
      streakDays: 4,
      minutesToday: 12,
      minutesThisWeek: 45,
      minutesLastWeek: 30,
      minutesThisMonth: 160,
      minutesLastMonth: 120,
      avgSessionMinutes: 8,
      activeDaysThisWeek: 3,
      lastPracticeAgeDays: 0,
    })
    expect(rpc).toHaveBeenCalledWith('get_practice_time', {
      p_user_id: 'user-1',
      p_timezone: 'Europe/Amsterdam',
    })
  })

  it('treats a null RPC result as an all-zero practice week', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null })
    const client = { schema: () => ({ rpc }) }

    const engagement = createEngagement(client as never)
    const pt = await engagement.practiceTime('user-1', 'UTC')

    expect(pt).toEqual({
      streakDays: 0,
      minutesToday: 0,
      minutesThisWeek: 0,
      minutesLastWeek: 0,
      minutesThisMonth: 0,
      minutesLastMonth: 0,
      avgSessionMinutes: 0,
      activeDaysThisWeek: 0,
      lastPracticeAgeDays: null,
    })
  })

  it('throws when the RPC returns an error', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: 'boom' } })
    const client = { schema: () => ({ rpc }) }

    const engagement = createEngagement(client as never)

    await expect(engagement.practiceTime('user-1', 'UTC')).rejects.toThrow('boom')
  })
})
