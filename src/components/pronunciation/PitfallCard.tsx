// One pronunciation pitfall, rendered for the primer reference view: the sound,
// how it's correctly pronounced, the common L1 mistake to avoid, and tappable
// example words that play a native model. Presentational — reads the pitfall +
// the prefetched audio map; no data fetching of its own.

import { Card, Badge, Group, Stack, Text } from '@mantine/core'
import { PlayButton } from '@/components/PlayButton'
import { MinimalPairPlayer } from './MinimalPairPlayer'
import { resolveSessionAudioUrl, type SessionAudioMap } from '@/services/audioService'
import { useT } from '@/hooks/useT'
import type { Pitfall, L1 } from '@/lib/pronunciation/pitfallCatalog'

interface PitfallCardProps {
  pitfall: Pitfall
  language: L1
  audioMap: SessionAudioMap
}

export function PitfallCard({ pitfall, language, audioMap }: PitfallCardProps) {
  const T = useT()
  const rule = language === 'nl' ? pitfall.ruleNl : pitfall.ruleEn
  const mistake = language === 'nl' ? pitfall.pitfallNl : pitfall.pitfallEn

  return (
    <Card withBorder radius="md" padding="md">
      <Stack gap="xs">
        <Group gap="sm" wrap="nowrap" align="flex-start">
          <Badge size="lg" variant="light" style={{ flexShrink: 0 }}>
            {pitfall.sound}
          </Badge>
          <Text fw={600}>{rule}</Text>
        </Group>

        <Text size="sm" c="dimmed">
          <Text span fw={600} size="sm">{T.pronunciation.mistakeLabel}: </Text>
          {mistake}
        </Text>

        <div>
          <Text size="xs" tt="uppercase" c="dimmed" mb={4}>
            {T.pronunciation.examplesLabel}
          </Text>
          <Group gap="md">
            {pitfall.examples.map((word) => (
              <Group key={word} gap={2} wrap="nowrap">
                <Text size="sm">{word}</Text>
                <PlayButton audioUrl={resolveSessionAudioUrl(audioMap, word, null)} size="xs" />
              </Group>
            ))}
          </Group>
        </div>

        {pitfall.minimalPairs && pitfall.minimalPairs.length > 0 && (
          <div>
            <Text size="xs" tt="uppercase" c="dimmed" mb={4}>
              {T.pronunciation.perceptionLabel}
            </Text>
            <Stack gap="xs">
              {pitfall.minimalPairs.map((mp) => (
                <MinimalPairPlayer key={`${mp.a}-${mp.b}`} pair={mp} language={language} audioMap={audioMap} />
              ))}
            </Stack>
          </div>
        )}
      </Stack>
    </Card>
  )
}
