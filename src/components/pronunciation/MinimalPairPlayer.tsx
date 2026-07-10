// A minimal-pair perception drill: the two contrasting Indonesian words with
// individual play buttons plus a "compare" button that plays them back-to-back
// (A then B) so the learner trains their ear on the contrast. Perception only —
// no recording, no scoring (ADR 0025).

import { useState, useCallback } from 'react'
import { Button, Group, Text, Stack } from '@mantine/core'
import { IconVolume } from '@tabler/icons-react'
import { PlayButton } from '@/components/PlayButton'
import classes from './MinimalPairPlayer.module.css'
import { playSequence } from '@/lib/pronunciation/playSequence'
import { resolveSessionAudioUrl, type SessionAudioMap } from '@/services/audioService'
import { useT } from '@/hooks/useT'
import type { MinimalPair, L1 } from '@/lib/pronunciation/pitfallCatalog'

interface MinimalPairPlayerProps {
  pair: MinimalPair
  language: L1
  audioMap: SessionAudioMap
}

export function MinimalPairPlayer({ pair, language, audioMap }: MinimalPairPlayerProps) {
  const T = useT()
  const aUrl = resolveSessionAudioUrl(audioMap, pair.a, null)
  const bUrl = resolveSessionAudioUrl(audioMap, pair.b, null)
  const contrast = language === 'nl' ? pair.contrastNl : pair.contrastEn
  const [playing, setPlaying] = useState(false)

  const playBoth = useCallback(() => {
    setPlaying(true)
    void playSequence([aUrl, bUrl]).finally(() => setPlaying(false))
  }, [aUrl, bUrl])

  return (
    <div className={classes.subCard}>
      <Stack gap={4}>
        <Group justify="space-between" wrap="nowrap">
          <Group gap="xs" wrap="nowrap">
            <Group gap={2} wrap="nowrap">
              <Text size="sm" fw={600}>{pair.a}</Text>
              <PlayButton audioUrl={aUrl} size="xs" />
            </Group>
            <Text size="sm" c="dimmed">/</Text>
            <Group gap={2} wrap="nowrap">
              <Text size="sm" fw={600}>{pair.b}</Text>
              <PlayButton audioUrl={bUrl} size="xs" />
            </Group>
          </Group>
          <Button
            size="compact-xs"
            variant="light"
            leftSection={<IconVolume size={14} />}
            onClick={playBoth}
            disabled={playing || !aUrl || !bUrl}
          >
            {T.pronunciation.compareLabel}
          </Button>
        </Group>
        <Text size="xs" c="dimmed">{contrast}</Text>
      </Stack>
    </div>
  )
}
