// The word-family explorer — the generative "one root → many words" view. Shows
// the FULL family (status-marked, "you know N of M"), not owned-only; cross-affix
// per root; frozen/lexicalised forms marked "vocab, not rule-formed"; unknown
// roots flagged (they gate the produce drills — ADR 0018, reflected here, not
// enforced). Genuinely new — no existing equivalent to reuse (capstone §2.2).

import { Card, Stack, Group, Text, Badge, Tooltip } from '@mantine/core'
import { IconAlertTriangle, IconAbc } from '@tabler/icons-react'
import { EmptyState } from '@/components/page/primitives'
import { useT } from '@/hooks/useT'
import type { MasteryLabel, WordFamily } from '@/lib/morphology'
import { resolveSessionAudioUrl, type SessionAudioMap } from '@/services/audioService'
import { PlayButton } from '@/components/PlayButton'

const LABEL_COLOR: Record<MasteryLabel, string> = {
  not_assessed: 'gray',
  introduced: 'blue',
  learning: 'yellow',
  strengthening: 'teal',
  mastered: 'green',
  at_risk: 'red',
}

const SOLID = new Set<MasteryLabel>(['mastered', 'strengthening'])

export function WordFamilyExplorer({
  families,
  affix,
  audioMap,
}: {
  families: WordFamily[]
  affix: string
  audioMap: SessionAudioMap
}) {
  const T = useT()

  if (families.length === 0) {
    return <EmptyState icon={<IconAbc size={40} />} message={T.morphology.emptyFamilies} />
  }

  return (
    <Stack gap="md">
      {families.map((family) => {
        const known = family.forms.filter((f) => SOLID.has(f.label)).length
        return (
          <Card key={family.rootText} withBorder radius="md" padding="md">
            <Stack gap="xs">
              <Group justify="space-between" align="flex-start" wrap="nowrap">
                <div>
                  <Group gap={8} align="baseline">
                    <Text fw={700}>{family.rootText}</Text>
                    {family.rootMeaning && <Text size="sm" c="dimmed">{family.rootMeaning}</Text>}
                  </Group>
                  {!family.rootKnown && (
                    <Group gap={4} mt={2}>
                      <IconAlertTriangle size={13} color="var(--mantine-color-orange-6)" />
                      <Text size="xs" c="orange">{T.morphology.rootUnknown}</Text>
                    </Group>
                  )}
                </div>
                <Badge variant="light" color="gray">{known}/{family.forms.length}</Badge>
              </Group>

              <Stack gap={4}>
                {family.forms.map((form) => {
                  // Anchor the learner to "the affix you're on": the current affix's
                  // form is emphasised; the rest read as its cross-affix family.
                  const isCurrent = form.affix === affix
                  const audioUrl = resolveSessionAudioUrl(audioMap, form.derivedText, null)
                  return (
                    <Group key={`${form.affix}:${form.derivedText}`} gap={8} wrap="nowrap" align="center">
                      <Tooltip label={form.label.replace('_', ' ')} withArrow>
                        <Badge size="xs" circle color={LABEL_COLOR[form.label]} />
                      </Tooltip>
                      <Text size="sm" fw={isCurrent ? 700 : 500} c={isCurrent ? 'var(--accent-primary)' : undefined}>{form.derivedText}</Text>
                      <Badge size="xs" variant={isCurrent ? 'filled' : 'outline'} color={isCurrent ? 'tamarind' : 'gray'}>{form.affix}</Badge>
                      {form.derivedMeaning && (
                        <Text size="xs" c="dimmed">{form.derivedMeaning}</Text>
                      )}
                      {!form.productive && (
                        <Text size="xs" c="dimmed" fs="italic">({T.morphology.frozen})</Text>
                      )}
                      {audioUrl && <PlayButton audioUrl={audioUrl} size="xs" />}
                    </Group>
                  )
                })}
              </Stack>
            </Stack>
          </Card>
        )
      })}
    </Stack>
  )
}
