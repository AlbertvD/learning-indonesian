import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ShadowRecorder } from '../shadowRecorder'

// Fake MediaRecorder whose stop() synchronously fires onstop after pushing one
// data chunk — enough to drive the capture state machine deterministically.
class FakeMediaRecorder {
  mimeType = 'audio/webm'
  ondataavailable: ((e: { data: Blob }) => void) | null = null
  onstop: (() => void) | null = null
  start() {}
  stop() {
    this.ondataavailable?.({ data: new Blob(['x'], { type: 'audio/webm' }) })
    this.onstop?.()
  }
}

let revoked: string[] = []
let trackStopped = 0

beforeEach(() => {
  revoked = []
  trackStopped = 0
  vi.stubGlobal('MediaRecorder', FakeMediaRecorder as unknown as typeof MediaRecorder)
  vi.stubGlobal('navigator', {
    mediaDevices: {
      getUserMedia: vi.fn().mockResolvedValue({
        getTracks: () => [{ stop: () => { trackStopped += 1 } }],
      }),
    },
  })
  vi.stubGlobal('URL', {
    createObjectURL: vi.fn(() => 'blob:fake-url'),
    revokeObjectURL: vi.fn((u: string) => revoked.push(u)),
  })
})
afterEach(() => vi.unstubAllGlobals())

describe('ShadowRecorder', () => {
  it('enters recording after start()', async () => {
    const r = new ShadowRecorder()
    await r.start()
    expect(r.state).toBe('recording')
  })

  it('stop() yields a recorded state with a playable blob url', async () => {
    const r = new ShadowRecorder()
    await r.start()
    r.stop()
    expect(r.state).toBe('recorded')
    expect(r.recordingUrl).toBe('blob:fake-url')
  })

  it('reset() discards the take: revokes the blob url and returns to idle', async () => {
    const r = new ShadowRecorder()
    await r.start()
    r.stop()
    r.reset()
    expect(revoked).toContain('blob:fake-url')
    expect(r.recordingUrl).toBeNull()
    expect(r.state).toBe('idle')
  })

  it('reports an error and stops the mic stream when the mic is denied', async () => {
    ;(navigator.mediaDevices.getUserMedia as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('denied'))
    const r = new ShadowRecorder()
    await r.start()
    expect(r.state).toBe('error')
  })

  it('frees the mic stream after stopping', async () => {
    const r = new ShadowRecorder()
    await r.start()
    r.stop()
    expect(trackStopped).toBeGreaterThan(0)
  })
})
