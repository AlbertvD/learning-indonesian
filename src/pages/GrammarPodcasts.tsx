// src/pages/GrammarPodcasts.tsx
//
// The third Ontdek surface: every lesson's "Kamoe Bisa" grammar podcast in one
// place, so a learner can pick one and listen on the go without opening the
// lesson page. One row per lesson (course order + title + an inline player).
//
// Language convention matches <LessonGrammarAudioBand/>: show only the episode
// in the learner's app language, with no cross-language fallback — a Dutch
// learner never hears the English twin, and vice versa. Players use
// preload="none", so only the episode a learner actually presses is fetched.
import { useEffect, useState } from 'react'
import { SimpleGrid } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { IconLanguage } from '@tabler/icons-react'
import {
  PageContainer,
  PageBody,
  PageHeader,
  LoadingState,
  EmptyState,
  MediaPlayerCard,
} from '@/components/page/primitives'
import { OntdekNav } from '@/components/nav/OntdekNav'
import { lessonService, type GrammarPodcastRow } from '@/services/lessonService'
import { GRAMMAR_TOPIC_SUMMARIES } from '@/lib/lessons/grammarTopicSummaries'
import { useAuthStore } from '@/stores/authStore'
import { logError } from '@/lib/logger'
import { useT } from '@/hooks/useT'

interface Episode {
  order: number
  summary: string
  url: string
}

export function GrammarPodcasts() {
  const T = useT()
  const lang = useAuthStore((s) => s.profile?.language ?? 'nl')
  const [episodes, setEpisodes] = useState<Episode[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function fetchData() {
      setLoading(true)
      try {
        const rows: GrammarPodcastRow[] = await lessonService.listGrammarPodcasts()
        const candidates = rows
          .map((r) => ({
            order: r.order_index,
            summary: GRAMMAR_TOPIC_SUMMARIES[r.order_index]?.[lang],
            path: lang === 'en' ? r.audio_path_en : r.audio_path,
          }))
          .filter((e): e is { order: number; summary: string; path: string } => !!e.path)
        // Signing moves into this async load path (the bucket is private) —
        // each row's audio_path resolves to a signed URL before the player
        // ever mounts, so <audio src=> never receives a raw storage path.
        const signed = await Promise.all(
          candidates.map(async (c) => ({
            order: c.order,
            summary: c.summary,
            url: await lessonService.getSignedAudioUrl(c.path),
          })),
        )
        if (!cancelled) {
          setEpisodes(signed.filter((e): e is Episode => !!e.url))
        }
      } catch (err) {
        if (cancelled) return
        logError({ page: 'grammarPodcasts', action: 'fetchData', error: err })
        notifications.show({ color: 'red', title: T.common.error, message: T.common.somethingWentWrong })
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    fetchData()
    return () => {
      cancelled = true
    }
  }, [lang, T.common.error, T.common.somethingWentWrong])

  if (loading) {
    return (
      <PageContainer size="lg">
        <PageBody>
          <LoadingState />
        </PageBody>
      </PageContainer>
    )
  }

  return (
    <PageContainer size="lg">
      <PageBody>
        <OntdekNav />
        <PageHeader title={T.ontdek.grammarTitle} subtitle={T.ontdek.grammarDesc} />

        {episodes.length === 0 ? (
          <EmptyState icon={<IconLanguage size={48} />} message={T.ontdek.grammarEmpty} />
        ) : (
          <SimpleGrid cols={{ base: 1 }} spacing="sm" mt="md">
            {episodes.map((e) => (
              <MediaPlayerCard
                key={e.order}
                medallion={String(e.order).padStart(2, '0')}
                title={T.ontdek.grammarLesson.replace('{n}', String(e.order))}
                subtitle={e.summary || undefined}
              >
                <audio
                  controls
                  preload="none"
                  src={e.url}
                  data-testid="grammar-podcast-player"
                />
              </MediaPlayerCard>
            ))}
          </SimpleGrid>
        )}
      </PageBody>
    </PageContainer>
  )
}
