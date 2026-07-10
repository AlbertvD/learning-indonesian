// The word-family explorer — the generative "one root → many words" view. Shows
// the FULL family (status-marked, "you know N of M"), not owned-only; cross-affix
// per root; frozen/lexicalised forms marked "vocab, not rule-formed"; unknown
// roots flagged (they gate the produce drills — ADR 0018, reflected here, not
// enforced). Genuinely new — no existing equivalent to reuse (capstone §2.2).
//
// Stays a domain component (not promoted to page/primitives — see
// WordFamilyExplorer.module.css's header comment); adopts the LessonCard
// pattern of a token-only co-located CSS module instead of Mantine's <Card>.

import { Stack, Group, Text, Tooltip } from '@mantine/core'
import { IconAlertTriangle, IconAbc } from '@tabler/icons-react'
import { EmptyState, StatusPill } from '@/components/page/primitives'
import { cx } from '@/components/page/primitives/cx'
import { useT } from '@/hooks/useT'
import type { MasteryLabel, WordFamily } from '@/lib/morphology'
import { resolveSessionAudioUrl, type SessionAudioMap } from '@/services/audioService'
import { PlayButton } from '@/components/PlayButton'
import { masteryDotColor } from './affixVisuals'
import classes from './WordFamilyExplorer.module.css'

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
          <div key={family.rootText} className={classes.card}>
            <Stack gap="xs">
              <Group justify="space-between" align="flex-start" wrap="nowrap">
                <div>
                  <Group gap={8} align="baseline">
                    <Text fw={700}>{family.rootText}</Text>
                    {family.rootMeaning && <Text size="sm" c="dimmed">{family.rootMeaning}</Text>}
                  </Group>
                  {!family.rootKnown && (
                    <Group gap={4} mt={2}>
                      <IconAlertTriangle size={13} color="var(--warning)" />
                      <Text size="xs" className={classes.rootUnknown}>{T.morphology.rootUnknown}</Text>
                    </Group>
                  )}
                </div>
                <StatusPill tone="neutral">{known}/{family.forms.length}</StatusPill>
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
                        <span className={classes.dot} style={{ background: masteryDotColor(form.label) }} />
                      </Tooltip>
                      <Text size="sm" fw={isCurrent ? 700 : 500} c={isCurrent ? 'var(--accent-primary)' : undefined}>{form.derivedText}</Text>
                      <span className={cx(classes.affixPill, isCurrent && classes.affixPillCurrent)}>{form.affix}</span>
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
          </div>
        )
      })}
    </Stack>
  )
}
