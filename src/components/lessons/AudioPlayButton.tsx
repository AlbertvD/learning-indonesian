// src/components/lessons/AudioPlayButton.tsx
//
// The byte-identical inline play button that used to be copy-pasted into all
// 30 lesson `Page.tsx` files (`function PlayButton({ src })`). `className`
// stays a REQUIRED prop rather than an internal default — each page keeps
// resolving its own `Page.module.css` `.playButton` class (one page,
// lesson-20, sizes it a few px smaller than the other 29), so extracting
// this component changes nothing about any page's rendered output.
//
// Signing goes through `useSignedAudioSrc` (src/lib/signedAudioUrl.ts),
// which coalesces same-tick sibling requests into one `createSignedUrls`
// batch per bucket — a vocab-heavy page mounting up to 10 of these issues
// ONE network call instead of 10.

import { useRef, useState } from 'react'
import { useSignedAudioSrc } from '@/lib/signedAudioUrl'

export function AudioPlayButton({ src, className }: { src?: string; className: string }) {
  const ref = useRef<HTMLAudioElement | null>(null)
  const [playing, setPlaying] = useState(false)
  const signedSrc = useSignedAudioSrc(src)

  if (!src) return null
  return (
    <>
      <button
        type="button"
        className={className}
        data-playing={playing}
        aria-label={playing ? 'Stop' : 'Speel uit'}
        onClick={() => {
          if (!ref.current) return
          if (playing) { ref.current.pause(); ref.current.currentTime = 0; setPlaying(false); return }
          void ref.current.play().then(() => setPlaying(true)).catch(() => setPlaying(false))
        }}
      >
        <svg viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
          {playing ? <><rect x="2" y="2" width="3" height="8" /><rect x="7" y="2" width="3" height="8" /></> : <polygon points="3,1 11,6 3,11" />}
        </svg>
      </button>
      {signedSrc && <audio ref={ref} src={signedSrc} preload="none" onEnded={() => setPlaying(false)} />}
    </>
  )
}
