// "Schaduw de dialoog" — UP5 shape (c), docs/plans/2026-07-09-uitspraak-
// round2.md §3. A small section in the pronunciation primer that reuses
// existing dialogue audio for sentence-level shadowing (melody/rhythm,
// distinct from the word-level shadowing already on PitfallCard's example
// words). Presentational — reads the curated sentence set + the prefetched
// audio map; no data fetching of its own.

import { Card, Group, Stack, Text, Title } from '@mantine/core'
import { PlayButton } from '@/components/PlayButton'
import { ShadowControl } from './ShadowControl'
import { resolveSessionAudioUrl, type SessionAudioMap } from '@/services/audioService'
import { useT } from '@/hooks/useT'
import { DIALOGUE_SHADOW_SET } from '@/lib/pronunciation/dialogueShadowSet'

interface DialogueShadowSectionProps {
  audioMap: SessionAudioMap
}

export function DialogueShadowSection({ audioMap }: DialogueShadowSectionProps) {
  const T = useT()

  return (
    <Card withBorder radius="md" padding="md">
      <Stack gap="xs">
        <Title order={4}>{T.pronunciation.shadowSectionHeading}</Title>
        <Text size="sm" c="dimmed">{T.pronunciation.shadowSectionIntro}</Text>

        <Stack gap="sm">
          {DIALOGUE_SHADOW_SET.map((sentence) => {
            const url = resolveSessionAudioUrl(audioMap, sentence.text, null)
            return (
              <Group key={sentence.id} gap="xs" wrap="nowrap" align="flex-start">
                <Text size="sm" style={{ flex: 1 }}>{sentence.text}</Text>
                {/* U5 guard: never a mic without a model — controls only render once the clip resolves. */}
                {url && (
                  <Group gap={2} wrap="nowrap" style={{ flexShrink: 0 }}>
                    <PlayButton audioUrl={url} size="xs" />
                    <ShadowControl word={sentence.text} modelUrl={url} />
                  </Group>
                )}
              </Group>
            )
          })}
        </Stack>
      </Stack>
    </Card>
  )
}
