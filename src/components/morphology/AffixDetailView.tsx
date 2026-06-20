// The affix detail — three panels: rule card, word-family explorer, and ONE
// practice action that LAUNCHES a scoped session (the trainer hosts no drills;
// capstone §2.3 / item F′). Composes the panels under a header.

import { Stack, Group, Title, Text, Badge, Button, Anchor, Tooltip } from '@mantine/core'
import { IconArrowLeft, IconPlayerPlay } from '@tabler/icons-react'
import { Link } from 'react-router-dom'
import { SectionHeading } from '@/components/page/primitives'
import { useT } from '@/hooks/useT'
import { affixPracticePath, type AffixDetail } from '@/lib/morphology'
import { RuleCard } from './RuleCard'
import { WordFamilyExplorer } from './WordFamilyExplorer'

export function AffixDetailView({ detail }: { detail: AffixDetail }) {
  const T = useT()
  const canPractise = detail.practiceSourceRefs.length > 0

  return (
    <Stack gap="lg">
      <Anchor component={Link} to="/morphology" size="sm">
        <Group gap={4} component="span">
          <IconArrowLeft size={14} />
          {T.morphology.back}
        </Group>
      </Anchor>

      <Group justify="space-between" align="flex-start" wrap="wrap">
        <div>
          <Group gap={8} align="center">
            <Title order={2}>{detail.affix}</Title>
            <Badge variant="light" color="indigo">{detail.affixType}</Badge>
          </Group>
          <Text c="dimmed">{detail.gloss}</Text>
        </div>
        {canPractise ? (
          <Button
            component={Link}
            to={affixPracticePath(detail.affix)}
            leftSection={<IconPlayerPlay size={16} />}
          >
            {T.morphology.practise}
          </Button>
        ) : (
          <Tooltip label={T.morphology.noPractice} withArrow>
            <Button leftSection={<IconPlayerPlay size={16} />} disabled data-disabled>
              {T.morphology.practise}
            </Button>
          </Tooltip>
        )}
      </Group>

      <RuleCard detail={detail} />

      <div>
        <SectionHeading>{T.morphology.familiesTitle}</SectionHeading>
        <Text size="sm" c="dimmed" mt={4}>{T.morphology.familiesSubtitle}</Text>
      </div>
      <WordFamilyExplorer families={detail.families} />
    </Stack>
  )
}
