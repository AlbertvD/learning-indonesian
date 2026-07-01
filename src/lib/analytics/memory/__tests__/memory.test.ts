import { describe, it, expect, vi } from 'vitest'
import { createMemory } from '../index'

describe('memory.stabilitySeries', () => {
  it('maps the get_stability_series rows into the camelCase StabilityWeek shape', async () => {
    const rows = [
      { week_start: '2026-06-01', avg_stability_days: 18.4, sample_size: 40 },
      { week_start: '2026-06-08', avg_stability_days: 25.1, sample_size: 52 },
    ]
    const rpc = vi.fn().mockResolvedValue({ data: rows, error: null })
    const client = { schema: () => ({ rpc }) }

    const memory = createMemory(client as never)
    const series = await memory.stabilitySeries('user-1', 'Europe/Amsterdam', 12)

    expect(series).toEqual([
      { weekStart: '2026-06-01', avgStabilityDays: 18.4, sampleSize: 40 },
      { weekStart: '2026-06-08', avgStabilityDays: 25.1, sampleSize: 52 },
    ])
    expect(rpc).toHaveBeenCalledWith('get_stability_series', {
      p_user_id: 'user-1',
      p_timezone: 'Europe/Amsterdam',
      p_weeks: 12,
    })
  })

  it('preserves null avg for weeks before the first review (sample of 0)', async () => {
    const rows = [{ week_start: '2026-05-25', avg_stability_days: null, sample_size: 0 }]
    const rpc = vi.fn().mockResolvedValue({ data: rows, error: null })
    const client = { schema: () => ({ rpc }) }

    const memory = createMemory(client as never)
    const series = await memory.stabilitySeries('user-1', 'UTC', 12)

    expect(series).toEqual([{ weekStart: '2026-05-25', avgStabilityDays: null, sampleSize: 0 }])
  })

  it('returns an empty array when the RPC yields no rows', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null })
    const client = { schema: () => ({ rpc }) }

    const memory = createMemory(client as never)
    expect(await memory.stabilitySeries('user-1', 'UTC', 12)).toEqual([])
  })

  it('throws a readable error when the RPC errors', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: 'boom' } })
    const client = { schema: () => ({ rpc }) }

    const memory = createMemory(client as never)
    await expect(memory.stabilitySeries('user-1', 'UTC', 12)).rejects.toThrow('boom')
  })
})
