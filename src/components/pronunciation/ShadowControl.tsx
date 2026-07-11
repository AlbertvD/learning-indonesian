// Shadowing on one example word: tap to record yourself saying it, then compare
// (the native model played back-to-back with your take). Client-only — the
// recording lives in memory and is discarded on unmount/re-record; nothing is
// uploaded or scored (ADR 0025).

import { useRef, useState, useCallback, useEffect } from 'react'
import { ActionIcon, Tooltip } from '@mantine/core'
import { IconMicrophone, IconPlayerStopFilled, IconArrowsLeftRight } from '@tabler/icons-react'
import { ShadowRecorder, type ShadowState } from '@/lib/pronunciation/shadowRecorder'
import { playSequence } from '@/lib/pronunciation/playSequence'
import { useT } from '@/hooks/useT'

interface ShadowControlProps {
  word: string
  modelUrl: string | undefined
  /** ActionIcon size — defaults to the compact `xs` used in the minimal-pair rows. */
  size?: 'xs' | 'sm' | 'md' | 'lg'
}

const ICON_SIZE: Record<NonNullable<ShadowControlProps['size']>, number> = {
  xs: 14,
  sm: 14,
  md: 16,
  lg: 18,
}

export function ShadowControl({ modelUrl, size = 'xs' }: ShadowControlProps) {
  const T = useT()
  const iconSize = ICON_SIZE[size]
  const [state, setState] = useState<ShadowState>('idle')
  const recorderRef = useRef<ShadowRecorder | null>(null)
  if (recorderRef.current == null) {
    recorderRef.current = new ShadowRecorder(setState)
  }

  // Discard the in-memory take when the card unmounts.
  useEffect(() => {
    const recorder = recorderRef.current
    return () => recorder?.reset()
  }, [])

  const onMic = useCallback(() => {
    const r = recorderRef.current!
    if (r.state === 'recording') r.stop()
    else void r.start()
  }, [])

  const onCompare = useCallback(() => {
    const r = recorderRef.current!
    if (r.recordingUrl) void playSequence([modelUrl, r.recordingUrl])
  }, [modelUrl])

  const recording = state === 'recording'

  return (
    <>
      <Tooltip label={recording ? T.pronunciation.shadowStop : T.pronunciation.shadowRecord} withArrow>
        <ActionIcon
          variant="subtle"
          size={size}
          style={recording ? { color: 'var(--danger)' } : undefined}
          onClick={onMic}
          aria-label={recording ? T.pronunciation.shadowStop : T.pronunciation.shadowRecord}
        >
          {recording ? <IconPlayerStopFilled size={iconSize} /> : <IconMicrophone size={iconSize} />}
        </ActionIcon>
      </Tooltip>

      {state === 'recorded' && (
        <Tooltip label={T.pronunciation.shadowCompare} withArrow>
          <ActionIcon variant="subtle" size={size} onClick={onCompare} aria-label={T.pronunciation.shadowCompare}>
            <IconArrowsLeftRight size={iconSize} />
          </ActionIcon>
        </Tooltip>
      )}
    </>
  )
}
