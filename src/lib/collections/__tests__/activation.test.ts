import { describe, expect, it, vi } from 'vitest'
import { setCollectionActivated } from '@/lib/collections/activation'

function buildClient(rpcImpl?: ReturnType<typeof vi.fn>) {
  const rpc = rpcImpl ?? vi.fn(async () => ({ data: null, error: null }))
  const schema = vi.fn(() => ({ rpc }))
  return { schema, rpc }
}

describe('collection activation write', () => {
  it('calls set_collection_activation with the activate flag', async () => {
    const client = buildClient()
    await setCollectionActivated('user-1', 'top-100', true, client as any)
    expect(client.schema).toHaveBeenCalledWith('indonesian')
    expect(client.rpc).toHaveBeenCalledWith('set_collection_activation', {
      p_user_id: 'user-1',
      p_collection_id: 'top-100',
      p_activated: true,
    })
  })

  it('propagates the deactivate flag', async () => {
    const client = buildClient()
    await setCollectionActivated('user-1', 'top-100', false, client as any)
    expect(client.rpc).toHaveBeenCalledWith('set_collection_activation', {
      p_user_id: 'user-1',
      p_collection_id: 'top-100',
      p_activated: false,
    })
  })

  it('throws when the RPC returns an error', async () => {
    const rpc = vi.fn(async () => ({ data: null, error: { message: 'not authorized' } }))
    const client = buildClient(rpc)
    await expect(setCollectionActivated('user-1', 'top-100', true, client as any))
      .rejects.toMatchObject({ message: 'not authorized' })
  })
})
