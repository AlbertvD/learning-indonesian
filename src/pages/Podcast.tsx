// src/pages/Podcast.tsx
import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Text, Button, Paper, Group, Stack, Tabs, Anchor } from '@mantine/core'
import { IconChevronLeft, IconMicrophone } from '@tabler/icons-react'
import {
  PageContainer,
  PageBody,
  PageHeader,
  LoadingState,
  EmptyState,
} from '@/components/page/primitives'
import { podcastService, type Podcast } from '@/services/podcastService'
import { useAuthStore } from '@/stores/authStore'
import { logError } from '@/lib/logger'
import { notifications } from '@mantine/notifications'
import { useT } from '@/hooks/useT'

export function Podcast() {
  const { podcastId } = useParams<{ podcastId: string }>()
  const navigate = useNavigate()
  const T = useT()
  const user = useAuthStore((state) => state.user)
  const lang = useAuthStore((state) => state.profile?.language ?? 'nl')

  const [podcast, setPodcast] = useState<Podcast | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    async function fetchData() {
      if (!podcastId || !user) return
      try {
        const podcastData = await podcastService.getPodcast(podcastId)
        setPodcast(podcastData)
      } catch (err) {
        logError({ page: 'podcast', action: 'fetchData', error: err })
        notifications.show({ color: 'red', title: T.common.error, message: T.podcast.failedToLoad })
        setError(true)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [podcastId, user, T.common.error, T.podcast.failedToLoad])

  if (loading) {
    return (
      <PageContainer size="md">
        <PageBody>
          <LoadingState />
        </PageBody>
      </PageContainer>
    )
  }

  if (error || !podcast) {
    return (
      <PageContainer size="md">
        <PageBody>
          <EmptyState
            icon={<IconMicrophone size={48} />}
            message="Failed to load podcast."
          />
        </PageBody>
      </PageContainer>
    )
  }

  const audioUrl = podcastService.getAudioUrl(podcast.audio_path)

  return (
    <PageContainer size="md">
      <PageBody>
        <PageHeader
          title={podcast.title}
          subtitle={podcast.description ?? undefined}
          action={(
            <Button
              variant="subtle"
              color="gray"
              leftSection={<IconChevronLeft size={16} />}
              onClick={() => navigate('/podcasts')}
            >
              {T.podcast.backToList}
            </Button>
          )}
        />

        <Paper withBorder p="xl" radius="md">
          <Stack gap="lg">
            <Group>
              <IconMicrophone size={32} color="var(--accent-primary)" />
            </Group>

            <audio controls style={{ width: '100%' }} src={audioUrl} />

            <Tabs defaultValue="indonesian">
              <Tabs.List>
                <Tabs.Tab value="indonesian">{T.podcast.transcriptIndonesian}</Tabs.Tab>
                <Tabs.Tab value="translation">
                  {lang === 'nl' ? T.podcast.transcriptDutch : T.podcast.transcriptEnglish}
                </Tabs.Tab>
              </Tabs.List>

              <Tabs.Panel value="indonesian" pt="md">
                <Text style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
                  {podcast.transcript_indonesian || T.podcast.noTranscriptIndonesian}
                </Text>
              </Tabs.Panel>

              <Tabs.Panel value="translation" pt="md">
                <Text style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
                  {lang === 'nl'
                    ? podcast.transcript_dutch || T.podcast.noTranscriptDutch
                    : podcast.transcript_english || T.podcast.noTranscriptEnglish}
                </Text>
              </Tabs.Panel>
            </Tabs>

            {podcast.attribution && (
              <Text size="xs" c="dimmed">
                {'Bron: '}
                <Anchor href={podcast.attribution.source_url} target="_blank" rel="noopener noreferrer" inherit>
                  {podcast.attribution.source_title}
                </Anchor>
                {` — ${podcast.attribution.author} · `}
                <Anchor href={podcast.attribution.license_url} target="_blank" rel="noopener noreferrer" inherit>
                  {podcast.attribution.license}
                </Anchor>
              </Text>
            )}
          </Stack>
        </Paper>
      </PageBody>
    </PageContainer>
  )
}
