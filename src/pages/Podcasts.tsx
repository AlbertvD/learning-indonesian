// src/pages/Podcasts.tsx
import { useEffect, useState } from 'react'
import { Container, Title, Text, Card, Group, Badge, Stack, Loader, Center } from '@mantine/core'
import { Link } from 'react-router-dom'
import { podcastService, type Podcast } from '@/services/podcastService'
import { logError } from '@/lib/logger'
import { IconMicrophone } from '@tabler/icons-react'

export function Podcasts() {
  const [podcasts, setPodcasts] = useState<Podcast[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchData() {
      try {
        const data = await podcastService.getPodcasts()
        setPodcasts(data)
      } catch (err) {
        logError({ page: 'podcasts', action: 'fetchData', error: err })
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [])

  if (loading) {
    return (
      <Center h="50vh">
        <Loader size="xl" />
      </Center>
    )
  }

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return 'Unknown'
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  return (
    <Container size="lg">
      <Title order={1} mb="xl">Podcasts</Title>
      
      <Stack gap="md">
        {podcasts.map((podcast) => (
          <Card
            key={podcast.id}
            shadow="sm"
            padding="lg"
            radius="md"
            withBorder
            component={Link}
            to={`/podcast/${podcast.id}`}
            style={{ textDecoration: 'none' }}
          >
            <Group justify="space-between" align="flex-start">
              <Group>
                <IconMicrophone size={24} color="gray" />
                <div>
                  <Text fw={700} size="lg">{podcast.title}</Text>
                  <Text size="sm" c="dimmed">{podcast.description}</Text>
                </div>
              </Group>
              <Group gap="xs">
                {podcast.level && <Badge color="blue" variant="light">{podcast.level}</Badge>}
                <Badge color="gray" variant="outline">{formatDuration(podcast.duration_seconds)}</Badge>
              </Group>
            </Group>
          </Card>
        ))}
        
        {podcasts.length === 0 && (
          <Center h="20vh">
            <Text c="dimmed">No podcasts available yet.</Text>
          </Center>
        )}
      </Stack>
    </Container>
  )
}
