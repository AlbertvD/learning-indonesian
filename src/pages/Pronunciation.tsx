// The pronunciation primer page (the Leren-tab Study surface, sibling of the
// Affix Trainer). Reference view of the closed pitfall set for the learner's
// first language; tapping an example word plays its native pronunciation.
// Reads the pure pitfall catalog (lib/pronunciation) and prefetches example
// audio from the existing audio_clips path. No ASR, no FSRS (ADR 0025).

import { useEffect, useState } from 'react'
import { Alert, Box, Stack } from '@mantine/core'
import { IconAlertCircle, IconVolume, IconHeadphones } from '@tabler/icons-react'
import { PageContainer, PageBody, PageHeader, LoadingState, EmptyState, MediaPlayerCard } from '@/components/page/primitives'
import { LerenNav } from '@/components/lessons/LerenNav'
import { PitfallCard, DialogueShadowSection } from '@/components/pronunciation'
import { getPitfallsForL1, PAIR_DRILL_VOICES } from '@/lib/pronunciation/pitfallCatalog'
import { DIALOGUE_SHADOW_SET } from '@/lib/pronunciation/dialogueShadowSet'
import { fetchSessionAudioMap, type SessionAudioMap } from '@/services/audioService'
import { textService, type Podcast } from '@/services/textService'
import { useAuthStore } from '@/stores/authStore'
import { useT } from '@/hooks/useT'
import { logError } from '@/lib/logger'
import { PRONUNCIATION_VISITED_KEY, setFirstRunFlag } from '@/lib/firstRun'

export function Pronunciation() {
  const { profile } = useAuthStore()
  const T = useT()
  const language = (profile?.language ?? 'nl') as 'nl' | 'en'
  const pitfalls = getPitfallsForL1(language)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [audioMap, setAudioMap] = useState<SessionAudioMap>(new Map())
  const [podcast, setPodcast] = useState<Podcast | null>(null)

  // First-run checklist step (day-one hook, review UP6): done on first visit —
  // the exact Ontdek.tsx:26 pattern.
  useEffect(() => { setFirstRunFlag(PRONUNCIATION_VISITED_KEY) }, [])

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const pitfallsForL1 = getPitfallsForL1(language)
        const words = pitfallsForL1.flatMap((p) => [
          ...p.examples,
          ...(p.minimalPairs ?? []).flatMap((mp) => [mp.a, mp.b]),
        ])
        // Voice-paired requests (HVPT talker variability, review UP3): one per
        // pair word × PAIR_DRILL_VOICES entry, for the current L1's pairs only.
        // Combined into the SAME fetchSessionAudioMap call as the existing
        // voice-agnostic requests below.
        const pairWords = pitfallsForL1.flatMap((p) => (p.minimalPairs ?? []).flatMap((mp) => [mp.a, mp.b]))
        // "Schaduw de dialoog" sentences (UP5 shape (c)): same voice-agnostic
        // path as the pitfall examples — talker variability is a perception-
        // drill concern, not a shadowing one. Folded into the SAME combined
        // request list, one fetchSessionAudioMap call for the whole page.
        const shadowSentences = DIALOGUE_SHADOW_SET.map((s) => s.text)
        const requests = [
          ...words.map((text) => ({ text, voiceId: null as string | null })),
          ...shadowSentences.map((text) => ({ text, voiceId: null as string | null })),
          ...pairWords.flatMap((text) => PAIR_DRILL_VOICES.map((voiceId) => ({ text, voiceId }))),
        ]
        const [map, pronunciationPodcast] = await Promise.all([
          fetchSessionAudioMap(requests),
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
          <Box mb="md">
            <MediaPlayerCard
              medallion={<IconHeadphones size={20} />}
              title={T.pronunciation.podcastHeading}
              subtitle={T.pronunciation.podcastBlurb}
            >
              <audio controls preload="none" src={podcastUrl} />
            </MediaPlayerCard>
          </Box>
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
              <DialogueShadowSection audioMap={audioMap} />
            </Stack>
          )
        )}
      </PageBody>
    </PageContainer>
  )
}
