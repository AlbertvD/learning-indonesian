import { describe, expect, it, vi } from 'vitest'
import { applyPlacementResult } from '@/lib/placement/applyResult'

function buildClient(rpcImpl?: ReturnType<typeof vi.fn>) {
  const rpc = rpcImpl ?? vi.fn(async () => ({ data: null, error: null }))
  const schema = vi.fn(() => ({ rpc }))
  return { schema, rpc }
}

describe('applyPlacementResult', () => {
  it('calls apply_placement_result with band slugs + known texts, auth.uid()-scoped', async () => {
    const client = buildClient()
    await applyPlacementResult(['top-100', 'top-300'], ['kantor', 'gratis'], client as any)
    expect(client.schema).toHaveBeenCalledWith('indonesian')
    expect(client.rpc).toHaveBeenCalledWith('apply_placement_result', {
      p_band_slugs: ['top-100', 'top-300'],
      p_known_texts: ['kantor', 'gratis'],
    })
  })

  it('calls through with empty arrays (probe converged with nothing cleared)', async () => {
    const client = buildClient()
    await applyPlacementResult([], [], client as any)
    expect(client.rpc).toHaveBeenCalledWith('apply_placement_result', {
      p_band_slugs: [],
      p_known_texts: [],
    })
  })

  it('throws when the RPC returns an error', async () => {
    const rpc = vi.fn(async () => ({ data: null, error: { message: 'not authorized' } }))
    const client = buildClient(rpc)
    await expect(applyPlacementResult(['top-100'], ['kantor'], client as any))
      .rejects.toMatchObject({ message: 'not authorized' })
  })
})
