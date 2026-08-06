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
import { supabase } from '@/lib/supabase'
import { SIGNED_URL_TTL_SECONDS } from '@/lib/signedAudioUrl'
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
        // ONE batch createSignedUrls call for every candidate path instead of
        // one getSignedAudioUrl call per episode (a full 30-lesson hub page
        // used to issue up to 30 requests; now issues one).
        const urlByPath = new Map<string, string>()
        if (candidates.length > 0) {
          const { data: signedRows, error: signError } = await supabase.storage
            .from('indonesian-lessons')
            .createSignedUrls(candidates.map((c) => c.path), SIGNED_URL_TTL_SECONDS)
          if (signError) {
            // Wholesale batch failure (network/plumbing) — logged, mirroring
            // audioService.fetchSessionAudioMap. Per-path failures below are
            // NOT logged (non-entitled user, missing object — expected).
            logError({ page: 'grammarPodcasts', action: 'createSignedUrls', error: signError })
          }
          for (const row of signedRows ?? []) {
            if (row.path && row.signedUrl) urlByPath.set(row.path, row.signedUrl)
          }
        }
        const signed = candidates.map((c) => ({
          order: c.order,
          summary: c.summary,
          url: urlByPath.get(c.path) ?? null,
        }))
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
