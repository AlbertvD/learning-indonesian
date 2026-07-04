// The pronunciation primer page (the Leren-tab Study surface, sibling of the
// Affix Trainer). Reference view of the closed pitfall set for the learner's
// first language; tapping an example word plays its native pronunciation.
// Reads the pure pitfall catalog (lib/pronunciation) and prefetches example
// audio from the existing audio_clips path. No ASR, no FSRS (ADR 0025).

import { useEffect, useState } from 'react'
import { Alert, Paper, Stack, Text, Title } from '@mantine/core'
import { IconAlertCircle, IconVolume, IconHeadphones } from '@tabler/icons-react'
import { PageContainer, PageBody, PageHeader, LoadingState, EmptyState } from '@/components/page/primitives'
import { LerenNav } from '@/components/lessons/LerenNav'
import { PitfallCard } from '@/components/pronunciation'
import { getPitfallsForL1 } from '@/lib/pronunciation/pitfallCatalog'
import { fetchSessionAudioMap, type SessionAudioMap } from '@/services/audioService'
import { textService, type Podcast } from '@/services/textService'
import { useAuthStore } from '@/stores/authStore'
import { useT } from '@/hooks/useT'
import { logError } from '@/lib/logger'

export function Pronunciation() {
  const { profile } = useAuthStore()
  const T = useT()
  const language = (profile?.language ?? 'nl') as 'nl' | 'en'
  const pitfalls = getPitfallsForL1(language)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [audioMap, setAudioMap] = useState<SessionAudioMap>(new Map())
  const [podcast, setPodcast] = useState<Podcast | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const words = getPitfallsForL1(language).flatMap((p) => [
          ...p.examples,
          ...(p.minimalPairs ?? []).flatMap((mp) => [mp.a, mp.b]),
        ])
        const [map, pronunciationPodcast] = await Promise.all([
          fetchSessionAudioMap(words.map((text) => ({ text, voiceId: null }))),
          textService.getPronunciationPodcast(),
        ])
        if (!cancelled) {
          setAudioMap(map)
          setPodcast(pronunciationPodcast)
        }
      } catch (err) {
        if (cancelled) return
        logError({ page: 'pronunciation', action: 'fetchAudio', error: err })
        setError(T.pronunciation.loadError)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [language, T.pronunciation.loadError])

  // L1 routing (ADR 0025): the English learner hears the English twin
  // (audio_path_en); everyone else hears the NL host track (audio_path).
  const podcastSource = podcast
    ? (language === 'en' && podcast.audio_path_en ? podcast.audio_path_en : podcast.audio_path)
    : null
  const podcastUrl = podcastSource ? textService.getAudioUrl(podcastSource) : ''

  return (
    <PageContainer size="lg">
      <PageBody>
        <LerenNav />
        <PageHeader title={T.pronunciation.title} subtitle={T.pronunciation.subtitle} />

        {!loading && !error && podcastUrl && (
          <Paper withBorder radius="md" p="lg" mb="md">
            <Stack gap="sm">
              <Stack gap={4}>
                <Title order={4} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <IconHeadphones size={20} color="var(--accent-primary)" />
                  {T.pronunciation.podcastHeading}
                </Title>
                <Text size="sm" c="dimmed">{T.pronunciation.podcastBlurb}</Text>
              </Stack>
              <audio controls preload="none" style={{ width: '100%' }} src={podcastUrl} />
            </Stack>
          </Paper>
        )}

        {loading && <LoadingState caption={T.pronunciation.title} />}

        {!loading && error && (
          <Alert icon={<IconAlertCircle size={16} />} color="red" title={T.pronunciation.title}>
            {error}
          </Alert>
        )}

        {!loading && !error && (
          pitfalls.length === 0 ? (
            <EmptyState icon={<IconVolume size={40} />} message={T.pronunciation.empty} />
          ) : (
            <Stack gap="md">
              {pitfalls.map((p) => (
                <PitfallCard key={p.id} pitfall={p} language={language} audioMap={audioMap} />
              ))}
            </Stack>
          )
        )}
      </PageBody>
    </PageContainer>
  )
}
