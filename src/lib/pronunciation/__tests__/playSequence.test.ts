import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { playSequence } from '../playSequence'

// Minimal fake Audio: records the order of src played and fires 'ended' on the
// next microtask so the sequence advances.
class FakeAudio {
  static played: string[] = []
  src: string
  private endedCbs: Array<() => void> = []
  constructor(src: string) {
    this.src = src
  }
  addEventListener(ev: string, cb: () => void) {
    if (ev === 'ended') this.endedCbs.push(cb)
  }
  play() {
    FakeAudio.played.push(this.src)
    Promise.resolve().then(() => this.endedCbs.forEach((cb) => cb()))
    return Promise.resolve()
  }
}

beforeEach(() => {
  FakeAudio.played = []
  vi.stubGlobal('Audio', FakeAudio as unknown as typeof Audio)
})
afterEach(() => vi.unstubAllGlobals())

describe('playSequence', () => {
  it('plays urls back-to-back in order, resolving after the last', async () => {
    await playSequence(['a.mp3', 'b.mp3'])
    expect(FakeAudio.played).toEqual(['a.mp3', 'b.mp3'])
  })

  it('skips undefined urls', async () => {
    await playSequence([undefined, 'b.mp3'])
    expect(FakeAudio.played).toEqual(['b.mp3'])
  })

  it('resolves with nothing played when no url is playable', async () => {
    await playSequence([undefined])
    expect(FakeAudio.played).toEqual([])
  })
})
