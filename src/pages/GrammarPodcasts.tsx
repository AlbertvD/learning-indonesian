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
import { Paper, Group, Text, Stack } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { IconLanguage } from '@tabler/icons-react'
import {
  PageContainer,
  PageBody,
  PageHeader,
  LoadingState,
  EmptyState,
} from '@/components/page/primitives'
import { OntdekNav } from '@/components/nav/OntdekNav'
import { lessonService, type GrammarPodcastRow } from '@/services/lessonService'
import { useAuthStore } from '@/stores/authStore'
import { logError } from '@/lib/logger'
import { useT } from '@/hooks/useT'

export function GrammarPodcasts() {
  const T = useT()
  const lang = useAuthStore((s) => s.profile?.language ?? 'nl')
  const [rows, setRows] = useState<GrammarPodcastRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchData() {
      try {
        setRows(await lessonService.listGrammarPodcasts())
      } catch (err) {
        logError({ page: 'grammarPodcasts', action: 'fetchData', error: err })
        notifications.show({ color: 'red', title: T.common.error, message: T.common.somethingWentWrong })
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [T.common.error, T.common.somethingWentWrong])

  const episodes = rows
    .map((r) => ({ order: r.order_index, title: r.title, path: lang === 'en' ? r.audio_path_en : r.audio_path }))
    .filter((e): e is { order: number; title: string; path: string } => !!e.path)

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
          <Stack gap="sm">
            {episodes.map((e) => (
              <Paper key={e.order} withBorder radius="md" p="sm">
                <Group gap={10} mb={8} wrap="nowrap">
                  <Text fw={700} c="dimmed">{String(e.order).padStart(2, '0')}</Text>
                  <Text fw={600}>{e.title}</Text>
                </Group>
                <audio
                  controls
                  preload="none"
                  src={lessonService.getAudioUrl(e.path)}
                  style={{ width: '100%', display: 'block' }}
                  data-testid="grammar-podcast-player"
                />
              </Paper>
            ))}
          </Stack>
        )}
      </PageBody>
    </PageContainer>
  )
}
