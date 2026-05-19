// src/components/exercises/primitives/ExerciseAudioButton.tsx
// Exercise-surface audio control. Distinct from generic <PlayButton>: owns
// playback lifecycle, autoplay-blocked fallback, error + loading states.
// See docs/plans/2026-04-23-exercise-framework-design.md §6.10

import { useEffect, useRef, useState } from 'react'
import { IconAlertTriangle, IconPlayerPlay, IconVolume } from '@tabler/icons-react'
import { Loader } from '@mantine/core'
import { triggerHaptic } from './haptics'
import classes from './ExerciseAudioButton.module.css'

export type AudioVariant = 'primary' | 'decorative'
type PlaybackState = 'idle' | 'playing' | 'played' | 'loading' | 'error' | 'blocked'

export interface ExerciseAudioButtonProps {
  audioUrl: string
  variant: AudioVariant
  autoplay?: boolean
  onPlay?: () => void
  onError?: () => void
  /** Called on manual replay (feedback screen). */
  onReplay?: () => void
  'aria-label'?: string
}

export function ExerciseAudioButton({
  audioUrl,
  variant,
  autoplay = false,
  onPlay,
  onError,
  onReplay,
  'aria-label': ariaLabel,
}: ExerciseAudioButtonProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [state, setState] = useState<PlaybackState>('idle')

  // Hold callbacks in a ref so the audio-element lifecycle below depends only
  // on `audioUrl` + `autoplay`. Without this, a parent that re-renders during
  // playback (e.g. Dictation re-rendering on every keystroke) churns the
  // effect, which pause()-interrupts the in-flight play() promise and trips
  // its reject path — surfacing as state='blocked'/'error' even though the
  // clip was loading fine. See useRef-callback pattern in the README.
  const callbacksRef = useRef({ onPlay, onError, onReplay })
  useEffect(() => {
    callbacksRef.current = { onPlay, onError, onReplay }
  }, [onPlay, onError, onReplay])

  useEffect(() => {
    const audio = new Audio(audioUrl)
    audioRef.current = audio

    const onEnded = () => setState('played')
    const onErr = () => { setState('error'); callbacksRef.current.onError?.() }

    audio.addEventListener('ended', onEnded)
    audio.addEventListener('error', onErr)

    if (autoplay) {
      const result = audio.play()
      if (result && typeof result.then === 'function') {
        result
          .then(() => { setState('playing'); callbacksRef.current.onPlay?.() })
          .catch(() => setState('blocked'))
      } else {
        queueMicrotask(() => setState('blocked'))
      }
    }

    return () => {
      audio.pause()
      audio.removeEventListener('ended', onEnded)
      audio.removeEventListener('error', onErr)
    }
  }, [audioUrl, autoplay])

  const play = () => {
    const audio = audioRef.current
    if (!audio) return
    triggerHaptic('selection')
    if (state === 'played' || state === 'playing') {
      callbacksRef.current.onReplay?.()
    }
    audio.currentTime = 0
    const result = audio.play()
    if (result && typeof result.then === 'function') {
      result
        .then(() => { setState('playing'); callbacksRef.current.onPlay?.() })
        .catch(() => setState('error'))
    } else {
      setState('playing')
      callbacksRef.current.onPlay?.()
    }
  }

  const icon = () => {
    switch (state) {
      case 'loading': return <Loader size="xs" />
      case 'error':   return <IconAlertTriangle size={variantIconSize(variant)} />
      case 'played':
      case 'playing': return <IconVolume size={variantIconSize(variant)} />
      default:        return <IconPlayerPlay size={variantIconSize(variant)} />
    }
  }

  const label = ariaLabel ?? defaultLabel(state, variant)

  return (
    <button
      type="button"
      onClick={play}
      className={`${classes.root} ${classes[variant]} ${classes[state]}`}
      aria-label={label}
      aria-live="polite"
    >
      {icon()}
    </button>
  )
}

function variantIconSize(v: AudioVariant): number {
  return v === 'decorative' ? 16 : 24
}

function defaultLabel(state: PlaybackState, variant: AudioVariant): string {
  if (state === 'error') return 'Audio fout'
  if (state === 'blocked') return 'Klik om af te spelen'
  if (state === 'played' || state === 'playing') return 'Herhaal audio'
  return variant === 'decorative' ? 'Speel audio af' : 'Luister'
}
