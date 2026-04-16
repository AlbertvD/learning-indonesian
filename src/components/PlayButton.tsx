import { useRef, useState, useEffect, useCallback } from 'react'
import { ActionIcon } from '@mantine/core'
import { IconVolume, IconPlayerStop } from '@tabler/icons-react'

interface PlayButtonProps {
  audioUrl: string | undefined
  autoPlay?: boolean
  size?: 'xs' | 'sm' | 'md'
}

export function PlayButton({ audioUrl, autoPlay = false, size = 'sm' }: PlayButtonProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [playing, setPlaying] = useState(false)

  useEffect(() => {
    if (!audioUrl) return

    const audio = new Audio(audioUrl)
    audioRef.current = audio

    const onEnded = () => setPlaying(false)
    audio.addEventListener('ended', onEnded)

    if (autoPlay) {
      audio.play().catch(() => {})
      setPlaying(true)
    }

    return () => {
      audio.pause()
      audio.removeEventListener('ended', onEnded)
    }
  }, [audioUrl, autoPlay])

  const toggle = useCallback(() => {
    const audio = audioRef.current
    if (!audio) return
    if (playing) {
      audio.pause()
      audio.currentTime = 0
      setPlaying(false)
    } else {
      audio.play().catch(() => {})
      setPlaying(true)
    }
  }, [playing])

  if (!audioUrl) return null

  return (
    <ActionIcon variant="subtle" size={size} onClick={toggle} aria-label="Play audio">
      {playing ? <IconPlayerStop size={16} /> : <IconVolume size={16} />}
    </ActionIcon>
  )
}
