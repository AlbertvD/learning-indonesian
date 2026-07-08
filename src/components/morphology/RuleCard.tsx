// The rule card — net-new structure the lesson never had (the lesson is static
// prose + audio). Built from the affix catalog metadata (gloss, allomorph
// classes) + the morphology data (allomorph_rule prose, worked examples) + a link
// to the introducing lesson. No re-authoring of lesson content (capstone §2.1).

import { Card, Stack, Group, Title, Text, Badge, Anchor } from '@mantine/core'
import { Link } from 'react-router-dom'
import { useT } from '@/hooks/useT'
import type { AffixDetail } from '@/lib/morphology'
import { resolveSessionAudioUrl, type SessionAudioMap } from '@/services/audioService'
import { PlayButton } from '@/components/PlayButton'

export function RuleCard({ detail, audioMap }: { detail: AffixDetail; audioMap: SessionAudioMap }) {
  const T = useT()
  return (
    <Card withBorder radius="md" padding="lg">
      <Stack gap="sm">
        <Group justify="space-between" align="flex-start">
          <Title order={3}>{T.morphology.ruleTitle}</Title>
          <Badge variant="light" color="gray">{detail.cefrLevel}</Badge>
        </Group>

        <Text>{detail.gloss}</Text>

        {detail.rule.patternName && (
          <Text size="sm" c="dimmed">{detail.rule.patternName}</Text>
        )}

        {detail.allomorphClasses.length > 0 && (
          <div>
            <Text size="sm" fw={600} c="dimmed" mb={4}>{T.morphology.allomorphsTitle}</Text>
            <Group gap={6}>
              {detail.allomorphClasses.map((cls) => (
                <Badge key={cls} variant="outline" color="tamarind">{cls}-</Badge>
              ))}
            </Group>
          </div>
        )}

        {detail.ruleNote && (
          <Text size="sm" c="dimmed">{detail.ruleNote}</Text>
        )}

        {detail.examples.length > 0 && (
          <div>
            <Text size="sm" fw={600} c="dimmed" mb={4}>{T.morphology.examplesTitle}</Text>
            <Stack gap={4}>
              {detail.examples.map((ex) => {
                const audioUrl = resolveSessionAudioUrl(audioMap, ex.derivedText, null)
                return (
                  <div key={ex.derivedText}>
                    <Group gap={4} wrap="nowrap" align="center">
                      <Text size="sm">
                        <Text span c="dimmed">{ex.rootText}</Text>
                        {' → '}
                        <Text span fw={600}>{ex.derivedText}</Text>
                        {ex.derivedMeaning && <Text span c="dimmed"> — {ex.derivedMeaning}</Text>}
                      </Text>
                      {audioUrl && <PlayButton audioUrl={audioUrl} size="xs" />}
                    </Group>
                    {ex.carrierText && <Text size="xs" c="dimmed" fs="italic">{ex.carrierText}</Text>}
                  </div>
                )
              })}
            </Stack>
          </div>
        )}

        {detail.rule.lessonId && detail.rule.lessonNumber != null && (
          <Anchor component={Link} to={`/lesson/${detail.rule.lessonId}`} size="sm">
            {T.morphology.introLesson} {detail.rule.lessonNumber}
          </Anchor>
        )}
      </Stack>
    </Card>
  )
}
