// The shadowing capture state machine: record the learner's voice, expose a
// playable blob URL, and discard it on reset. Client-only — nothing is uploaded
// or persisted (ADR 0025). Isolated from React so the state machine is unit-
// testable by mocking getUserMedia / MediaRecorder / URL.

export type ShadowState = 'idle' | 'recording' | 'recorded' | 'error'

export class ShadowRecorder {
  state: ShadowState = 'idle'
  recordingUrl: string | null = null

  private recorder: MediaRecorder | null = null
  private stream: MediaStream | null = null
  private chunks: BlobPart[] = []
  private readonly onChange: (state: ShadowState) => void

  constructor(onChange: (state: ShadowState) => void = () => {}) {
    this.onChange = onChange
  }

  private set(state: ShadowState) {
    this.state = state
    this.onChange(state)
  }

  /** Request the mic and begin recording. Resets any prior take first. */
  async start(): Promise<void> {
    this.reset()
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      this.chunks = []
      this.recorder = new MediaRecorder(this.stream)
      this.recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) this.chunks.push(e.data)
      }
      this.recorder.onstop = () => {
        const blob = new Blob(this.chunks, { type: this.recorder?.mimeType || 'audio/webm' })
        this.recordingUrl = URL.createObjectURL(blob)
        this.stopStream()
        this.set('recorded')
      }
      this.recorder.start()
      this.set('recording')
    } catch {
      this.stopStream()
      this.set('error')
    }
  }

  /** Stop recording; the blob URL becomes available and state → 'recorded'. */
  stop(): void {
    if (this.recorder && this.state === 'recording') this.recorder.stop()
  }

  /** Discard the current take (revokes the blob URL) and return to idle. */
  reset(): void {
    if (this.recordingUrl) {
      URL.revokeObjectURL(this.recordingUrl)
      this.recordingUrl = null
    }
    this.chunks = []
    this.stopStream()
    if (this.state !== 'idle') this.set('idle')
  }

  private stopStream(): void {
    this.stream?.getTracks().forEach((t) => t.stop())
    this.stream = null
  }
}
