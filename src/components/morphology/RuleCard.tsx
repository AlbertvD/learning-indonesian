// The rule card — net-new structure the lesson never had (the lesson is static
// prose + audio). Built from the affix catalog metadata (gloss, allomorph
// classes) + the morphology data (allomorph_rule prose, worked examples) + a link
// to the introducing lesson. No re-authoring of lesson content (capstone §2.1).
//
// Rides the SettingsCard primitive (page/primitives) via its additive `aside`
// slot — the affix-type + CEFR badges sit beside the "Rule" heading instead of
// a bespoke <Card>. The gloss line moved to AffixDetailView's PageHeader
// subtitle (it used to repeat here — deduped by the harmonization plan).

import { Stack, Text, Group, Anchor } from '@mantine/core'
import { Link } from 'react-router-dom'
import { SettingsCard, StatusPill } from '@/components/page/primitives'
import { useT } from '@/hooks/useT'
import type { AffixDetail } from '@/lib/morphology'
import { resolveSessionAudioUrl, type SessionAudioMap } from '@/services/audioService'
import { PlayButton } from '@/components/PlayButton'
import { LessonGrammarAudioBand } from '@/components/lessons/LessonGrammarAudioBand'
import { lessonService } from '@/services/lessonService'
import { AFFIX_TYPE_HUE } from './affixVisuals'
import classes from './RuleCard.module.css'

export function RuleCard({ detail, audioMap }: { detail: AffixDetail; audioMap: SessionAudioMap }) {
  const T = useT()
  const hue = AFFIX_TYPE_HUE[detail.affixType].solid
  // Bucket paths are storage keys, not playable URLs — resolve at this edge
  // (mirrors GrammarPodcasts.tsx / Podcast.tsx). LessonGrammarAudioBand picks
  // nl/en by app language and renders nothing when that language's src is null.
  const podcastNlUrl = detail.rule.podcastNl ? lessonService.getAudioUrl(detail.rule.podcastNl) : null
  const podcastEnUrl = detail.rule.podcastEn ? lessonService.getAudioUrl(detail.rule.podcastEn) : null

  return (
    <SettingsCard
      title={T.morphology.ruleTitle}
      aside={
        <Group gap={6} wrap="nowrap">
          <span
            className={classes.typePill}
            style={{ background: `color-mix(in srgb, ${hue} 14%, transparent)`, color: hue }}
          >
            {detail.affixType}
          </span>
          <StatusPill tone="neutral">{detail.cefrLevel}</StatusPill>
        </Group>
      }
    >
      <Stack gap="sm">
        {detail.rule.patternName && (
          <Text size="sm" c="dimmed">{detail.rule.patternName}</Text>
        )}

        {detail.allomorphClasses.length > 0 && (
          <div>
            <Text size="sm" fw={600} c="dimmed" mb={4}>{T.morphology.allomorphsTitle}</Text>
            <Group gap={6}>
              {detail.allomorphClasses.map((cls) => (
                <span key={cls} className={classes.allomorphBadge}>{cls}-</span>
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

        <LessonGrammarAudioBand
          nl={podcastNlUrl}
          en={podcastEnUrl}
          label={T.morphology.podcastLabel}
          bandClassName={classes.podcastBand}
          labelClassName={classes.podcastLabel}
        />
      </Stack>
    </SettingsCard>
  )
}
