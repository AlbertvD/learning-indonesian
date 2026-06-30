// Play a list of audio URLs back-to-back, resolving after the last one ends.
// Pure of React and unit-testable by stubbing the global Audio constructor.
// Used by the minimal-pair drill (A vs B) and shadowing (model then your take).

export function playSequence(urls: Array<string | undefined>): Promise<void> {
  const queue = urls.filter((u): u is string => Boolean(u))
  return new Promise((resolve) => {
    if (queue.length === 0) {
      resolve()
      return
    }
    let i = 0
    const playNext = () => {
      if (i >= queue.length) {
        resolve()
        return
      }
      const audio = new Audio(queue[i])
      i += 1
      audio.addEventListener('ended', playNext, { once: true })
      // On playback failure, skip to the next rather than stalling the sequence.
      audio.play().catch(() => playNext())
    }
    playNext()
  })
}
