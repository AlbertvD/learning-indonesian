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
import { Link } from 'react-router-dom'
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
                      <Text size="xs" className={classes.rootUnknown}>
                        {T.morphology.rootUnknown}
                        {family.rootIntroLessonNumber != null &&
                          ` \u00b7 ${T.morphology.rootIntroLesson} ${family.rootIntroLessonNumber}`}
                      </Text>
                    </Group>
                  )}
                </div>
                <StatusPill tone="neutral">{known}/{family.forms.length}</StatusPill>
              </Group>

              <div className={classes.formList}>
                {family.forms.map((form) => {
                  // Anchor the learner to "the affix you're on": the current affix's
                  // form is emphasised; the rest read as its cross-affix family.
                  const isCurrent = form.affix === affix
                  const audioUrl = resolveSessionAudioUrl(audioMap, form.derivedText, null)
                  return (
                    <div key={`${form.affix}:${form.derivedText}`} className={classes.formRow}>
                      <Tooltip label={form.label.replace('_', ' ')} withArrow>
                        <span className={classes.dot} style={{ background: masteryDotColor(form.label) }} />
                      </Tooltip>
                      <div className={classes.formContent}>
                        <div className={classes.formHead}>
                          <span className={cx(classes.formWord, isCurrent && classes.formWordCurrent)}>{form.derivedText}</span>
                          {form.affixLinkable && !isCurrent ? (
                            <Link
                              to={`/morphology?affix=${encodeURIComponent(form.affix)}`}
                              className={cx(classes.affixPill, classes.affixPillLink)}
                            >
                              {form.affix}
                            </Link>
                          ) : (
                            <span className={cx(classes.affixPill, isCurrent && classes.affixPillCurrent)}>{form.affix}</span>
                          )}
                        </div>
                        {(form.derivedMeaning || !form.productive) && (
                          <div className={classes.formSub}>
                            {form.derivedMeaning && <span className={classes.formMeaning}>{form.derivedMeaning}</span>}
                            {!form.productive && <span className={classes.formFrozen}>({T.morphology.frozen})</span>}
                          </div>
                        )}
                      </div>
                      <div className={classes.formAudio}>
                        {audioUrl && <PlayButton audioUrl={audioUrl} size="xs" />}
                      </div>
                    </div>
                  )
                })}
              </div>
            </Stack>
          </div>
        )
      })}
    </Stack>
  )
}
