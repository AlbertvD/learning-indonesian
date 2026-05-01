// src/pages/Podcasts.tsx
import { useEffect, useState } from 'react'
import { Group, Text, Badge } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import {
  PageContainer,
  PageBody,
  PageHeader,
  ListCard,
  LoadingState,
  EmptyState,
} from '@/components/page/primitives'
import { IconHeadphones } from '@tabler/icons-react'
import { podcastService, type Podcast } from '@/services/podcastService'
import { logError } from '@/lib/logger'
import { useT } from '@/hooks/useT'

function formatDuration(seconds: number | null): string | null {
  if (!seconds) return null
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

export function Podcasts() {
  const T = useT()
  const [podcasts, setPodcasts] = useState<Podcast[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchData() {
      try {
        const data = await podcastService.getPodcasts()
        setPodcasts(data)
      } catch (err) {
        logError({ page: 'podcasts', action: 'fetchData', error: err })
        notifications.show({ color: 'red', title: T.common.error, message: T.common.somethingWentWrong })
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [T.common.error, T.common.somethingWentWrong])

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
        <PageHeader title={T.nav.podcasts} />

        {podcasts.length === 0 ? (
          <EmptyState
            icon={<IconHeadphones size={48} />}
            message={T.podcast.noPodcasts}
          />
        ) : (
          podcasts.map((podcast, i) => {
            const duration = formatDuration(podcast.duration_seconds)
            return (
              <ListCard
                key={podcast.id}
                to={`/podcast/${podcast.id}`}
                icon={<Text fw={700}>{String(i + 1).padStart(2, '0')}</Text>}
                title={podcast.title}
                subtitle={podcast.description ?? undefined}
                trailing={(
                  <Group gap={8}>
                    {podcast.level && <Badge variant="light">{podcast.level}</Badge>}
                    {duration && <Text size="sm" c="dimmed">{duration}</Text>}
                  </Group>
                )}
              />
            )
          })
        )}
      </PageBody>
    </PageContainer>
  )
}
