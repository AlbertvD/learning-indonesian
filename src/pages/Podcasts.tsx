// src/pages/Podcasts.tsx
import { useEffect, useMemo, useState } from 'react'
import { Text, SimpleGrid, Stack } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import {
  PageContainer,
  PageBody,
  PageHeader,
  SectionHeading,
  ListCard,
  LoadingState,
  EmptyState,
} from '@/components/page/primitives'
import { IconHeadphones } from '@tabler/icons-react'
import { OntdekNav } from '@/components/nav/OntdekNav'
import { textService, type PodcastListRow } from '@/services/textService'
import { groupByCefrLevel } from '@/lib/cefr'
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
  const [podcasts, setPodcasts] = useState<PodcastListRow[]>([])
  const [loading, setLoading] = useState(true)

  // Group into CEFR sections (A1 → B2 → …), newest-first order preserved inside
  // each level. A running index across groups keeps the numbering continuous so
  // every episode has a stable ordinal regardless of its section.
  const levelGroups = useMemo(() => groupByCefrLevel(podcasts, (p) => p.level), [podcasts])

  useEffect(() => {
    async function fetchData() {
      try {
        const data = await textService.listPodcasts()
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
        <OntdekNav />
        <PageHeader title={T.nav.podcasts} subtitle={T.ontdek.podcastsDesc} />

        {podcasts.length === 0 ? (
          <EmptyState
            icon={<IconHeadphones size={48} />}
            message={T.podcast.noPodcasts}
          />
        ) : (
          <Stack gap="lg" mt="md">
            {(() => {
              let ordinal = 0
              return levelGroups.map((group) => (
                <Stack gap="sm" key={group.level}>
                  <SectionHeading>
                    {group.isUnknown ? T.common.levelOther : `${T.common.levelPrefix} ${group.level}`}
                  </SectionHeading>
                  <SimpleGrid cols={{ base: 1 }} spacing="sm">
                    {group.items.map((podcast) => {
                      ordinal += 1
                      const duration = formatDuration(podcast.duration_seconds)
                      return (
                        <ListCard
                          key={podcast.id}
                          tone="gold"
                          to={`/podcast/${podcast.id}`}
                          icon={<Text fw={700} c="inherit">{String(ordinal).padStart(2, '0')}</Text>}
                          title={podcast.title}
                          subtitle={podcast.description ?? undefined}
                          meta={duration ? <Text size="sm" c="dimmed">{duration}</Text> : undefined}
                        />
                      )
                    })}
                  </SimpleGrid>
                </Stack>
              ))
            })()}
          </Stack>
        )}
      </PageBody>
    </PageContainer>
  )
}
