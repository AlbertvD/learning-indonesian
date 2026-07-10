// The affix detail — three panels: rule card, word-family explorer, and ONE
// practice action that LAUNCHES a scoped session (the trainer hosts no drills;
// capstone §2.3 / item F′). Composes the panels under a header.
//
// Header rides the page-framework PageHeader primitive (gloss as the
// subtitle — the ONLY place the gloss renders; RuleCard used to repeat it, a
// dedup fixed by the harmonization plan). A thin left-edge accent, colour-
// matched to the catalog tile's affix-type hue (affixVisuals.ts), threads the
// two surfaces together — purely decorative chrome around PageHeader, which
// itself is not touched a second time.
//
// The "practise this affix" CTA sits BELOW the rule card (under the rule's
// description), not in the header's action slot — the header carries identity
// (affix + meaning), and the practice action reads as the next step after you
// understand the rule.

import { Stack, Text, Button, Tooltip } from '@mantine/core'
import { IconPlayerPlay } from '@tabler/icons-react'
import { Link } from 'react-router-dom'
import { PageHeader, SectionHeading } from '@/components/page/primitives'
import { BackLink } from '@/components/nav/BackLink'
import { useT } from '@/hooks/useT'
import { affixPracticePath, type AffixDetail } from '@/lib/morphology'
import type { SessionAudioMap } from '@/services/audioService'
import { AFFIX_TYPE_HUE } from './affixVisuals'
import { RuleCard } from './RuleCard'
import { WordFamilyExplorer } from './WordFamilyExplorer'
import classes from './AffixDetailView.module.css'

export function AffixDetailView({ detail, audioMap }: { detail: AffixDetail; audioMap: SessionAudioMap }) {
  const T = useT()
  const canPractise = detail.practiceSourceRefs.length > 0

  const practiseAction = canPractise ? (
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
  )

  return (
    <Stack gap="lg">
      <BackLink to="/morphology" label={T.morphology.back} />

      <div
        className={classes.headerAccent}
        style={{ borderLeftColor: AFFIX_TYPE_HUE[detail.affixType].solid }}
      >
        <PageHeader title={detail.affix} subtitle={detail.gloss} />
      </div>

      <RuleCard detail={detail} audioMap={audioMap} />

      {/* Primary CTA, under the rule — natural width, left-aligned (a plain
          block wrapper decouples it from Stack's stretch). */}
      <div>{practiseAction}</div>

      <div>
        <SectionHeading>{T.morphology.familiesTitle}</SectionHeading>
        <Text size="sm" c="dimmed" mt={4}>{T.morphology.familiesSubtitle}</Text>
      </div>
      <WordFamilyExplorer families={detail.families} affix={detail.affix} audioMap={audioMap} />
    </Stack>
  )
}
