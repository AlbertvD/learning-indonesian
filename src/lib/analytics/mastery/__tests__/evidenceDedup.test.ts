import { describe, it, expect, vi } from 'vitest'
import { createMasteryModel } from '../masteryModel'

// C2 fix (docs/plans/2026-07-11-mastery-evidence-rpc-narrowing.md §3): the
// woorden tab mounts five cards that each independently called into
// allLearnerEvidence. All five now share ONE get_mastery_evidence RPC call
// per (client, userId), in-flight deduped — no TTL, evicted on settle
// (resolve AND reject).

const EMPTY_PAYLOAD = { states: [], capabilities: [], activated_lesson_ids: [], lessons: [] }

function makeClient(rpcImpl: (fn: string, args: unknown) => Promise<{ data: unknown; error: unknown }>) {
  const rpc = vi.fn(rpcImpl)
  const client = { schema: () => ({ rpc, from: () => { throw new Error('unexpected from() call — this path should be RPC-only') } }) }
  return { client, rpc }
}

// Five distinct readers that ALL route solely through allLearnerEvidence (no
// extra table reads) — mirrors the five woorden-tab cards C2 describes
// (VocabMasteryPanel/MasteryFunnelPanel, GrowthCurveCard's sibling funnel
// reader, SkillModeGapsCard, StubbornWordsCard, the troublesome-words nudge).
function fiveReaderCalls(model: ReturnType<typeof createMasteryModel>, userId: string) {
  return [
    model.getMasteryOverview(userId),
    model.getMasteryFunnel(userId),
    model.getSkillModeGaps(userId),
    model.getStubbornWords(userId),
    model.getTroublesomeWords(userId),
  ]
}

describe('mastery evidence — in-flight dedup', () => {
  it('coalesces 5 concurrent reader calls into exactly 1 RPC invocation', async () => {
    const { client, rpc } = makeClient(async () => ({ data: EMPTY_PAYLOAD, error: null }))
    const model = createMasteryModel(client as never)

    await Promise.all(fiveReaderCalls(model, 'user-1'))

    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledWith('get_mastery_evidence', { p_user_id: 'user-1' })
  })

  it('issues a fresh fetch for a call AFTER the in-flight one settles', async () => {
    const { client, rpc } = makeClient(async () => ({ data: EMPTY_PAYLOAD, error: null }))
    const model = createMasteryModel(client as never)

    await model.getMasteryOverview('user-1')
    await model.getMasteryOverview('user-1')

    expect(rpc).toHaveBeenCalledTimes(2)
  })

  it('evicts the in-flight entry on REJECT too — a failed fetch does not poison later calls', async () => {
    let call = 0
    const { client, rpc } = makeClient(async () => {
      call += 1
      if (call === 1) return { data: null, error: new Error('boom') }
      return { data: EMPTY_PAYLOAD, error: null }
    })
    const model = createMasteryModel(client as never)

    await expect(model.getMasteryOverview('user-1')).rejects.toThrow('boom')
    await expect(model.getMasteryOverview('user-1')).resolves.toBeDefined()

    expect(rpc).toHaveBeenCalledTimes(2)
  })

  it('a REJECTING fetch still coalesces concurrent callers into 1 RPC call (all see the same rejection)', async () => {
    const { client, rpc } = makeClient(async () => ({ data: null, error: new Error('boom') }))
    const model = createMasteryModel(client as never)

    const results = await Promise.allSettled(fiveReaderCalls(model, 'user-1'))

    expect(rpc).toHaveBeenCalledTimes(1)
    expect(results.every(r => r.status === 'rejected')).toBe(true)
  })

  it('injected mock clients get isolated dedup entries — one client never shares another client\'s in-flight entry', async () => {
    const a = makeClient(async () => ({ data: EMPTY_PAYLOAD, error: null }))
    const b = makeClient(async () => ({ data: EMPTY_PAYLOAD, error: null }))
    const modelA = createMasteryModel(a.client as never)
    const modelB = createMasteryModel(b.client as never)

    await Promise.all([
      ...fiveReaderCalls(modelA, 'user-1'),
      ...fiveReaderCalls(modelB, 'user-1'),
    ])

    expect(a.rpc).toHaveBeenCalledTimes(1)
    expect(b.rpc).toHaveBeenCalledTimes(1)
  })
})
