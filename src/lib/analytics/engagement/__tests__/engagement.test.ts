import { describe, it, expect, vi } from 'vitest'
import { createEngagement } from '../index'

describe('engagement.practiceMinutesThisWeek', () => {
  it('returns the minutes the get_practice_time RPC reports for the week', async () => {
    const rpc = vi
      .fn()
      .mockResolvedValue({ data: { minutes_this_week: 45 }, error: null })
    const client = { schema: () => ({ rpc }) }

    const engagement = createEngagement(client as never)
    const minutes = await engagement.practiceMinutesThisWeek(
      'user-1',
      'Europe/Amsterdam',
    )

    expect(minutes).toBe(45)
    expect(rpc).toHaveBeenCalledWith('get_practice_time', {
      p_user_id: 'user-1',
      p_timezone: 'Europe/Amsterdam',
    })
  })

  it('treats a null RPC result as zero minutes', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null })
    const client = { schema: () => ({ rpc }) }

    const engagement = createEngagement(client as never)

    expect(
      await engagement.practiceMinutesThisWeek('user-1', 'UTC'),
    ).toBe(0)
  })

  it('throws when the RPC returns an error', async () => {
    const rpc = vi
      .fn()
      .mockResolvedValue({ data: null, error: { message: 'boom' } })
    const client = { schema: () => ({ rpc }) }

    const engagement = createEngagement(client as never)

    await expect(
      engagement.practiceMinutesThisWeek('user-1', 'UTC'),
    ).rejects.toThrow('boom')
  })
})
