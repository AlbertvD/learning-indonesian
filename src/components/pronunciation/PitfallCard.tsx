// One pronunciation pitfall, rendered for the primer reference view: the sound,
// how it's correctly pronounced, the common L1 mistake to avoid, and tappable
// example words that play a native model. Presentational — reads the pitfall +
// the prefetched audio map; no data fetching of its own.

import { Group, Stack, Text } from '@mantine/core'
import { IconAlertTriangle } from '@tabler/icons-react'
import { PlayButton } from '@/components/PlayButton'
import classes from './PitfallCard.module.css'
import { MinimalPairPlayer } from './MinimalPairPlayer'
import { ShadowControl } from './ShadowControl'
import { EarQuiz } from './EarQuiz'
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
  // "Test je oor" (Task U-C / review UP2) only ever sees pairs where BOTH
  // members already resolve — the quiz never sees a dead pair.
  const playablePairs = (pitfall.minimalPairs ?? []).filter(
    (mp) =>
      Boolean(resolveSessionAudioUrl(audioMap, mp.a, null)) &&
      Boolean(resolveSessionAudioUrl(audioMap, mp.b, null)),
  )

  return (
    <section className={classes.card}>
      <Stack gap="md">
        <Group gap="sm" wrap="nowrap" align="flex-start">
          <span className={classes.soundPill}>{pitfall.sound}</span>
          <Text fw={600}>{rule}</Text>
        </Group>

        <div className={classes.mistake}>
          <IconAlertTriangle size={16} className={classes.mistakeIcon} />
          <Text size="sm">
            <Text span fw={700} size="sm" className={classes.mistakeLabel}>
              {T.pronunciation.mistakeLabel}:{' '}
            </Text>
            {mistake}
          </Text>
        </div>

        <div>
          <div className="eyebrow" style={{ marginBottom: 8 }}>
            {T.pronunciation.examplesLabel}
          </div>
          <div className={classes.examplesGrid}>
            {pitfall.examples.map((word) => {
              const url = resolveSessionAudioUrl(audioMap, word, null)
              return (
                <div key={word} className={classes.exampleChip}>
                  <Text className={classes.exampleWord}>{word}</Text>
                  <div className={classes.exampleControls}>
                    <PlayButton audioUrl={url} size="lg" />
                    {url && <ShadowControl word={word} modelUrl={url} size="lg" />}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {pitfall.minimalPairs && pitfall.minimalPairs.length > 0 && (
          <div>
            <div className="eyebrow" style={{ marginBottom: 8 }}>
              {T.pronunciation.perceptionLabel}
            </div>
            <Stack gap="xs">
              {pitfall.minimalPairs.map((mp) => (
                <MinimalPairPlayer key={`${mp.a}-${mp.b}`} pair={mp} language={language} audioMap={audioMap} />
              ))}
            </Stack>
            {playablePairs.length > 0 && (
              <EarQuiz playablePairs={playablePairs} audioMap={audioMap} language={language} />
            )}
          </div>
        )}
      </Stack>
    </section>
  )
}
