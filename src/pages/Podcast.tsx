// src/pages/Podcast.tsx
import { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Container, Title, Text, Button, Paper, Group, Stack, Center, Loader, Tabs } from '@mantine/core'
import { IconChevronLeft, IconMicrophone } from '@tabler/icons-react'
import { podcastService, type Podcast } from '@/services/podcastService'
import { startSession, endSession } from '@/lib/session'
import { useAuthStore } from '@/stores/authStore'
import { logError } from '@/lib/logger'
import { notifications } from '@mantine/notifications'

export function Podcast() {
  const { podcastId } = useParams<{ podcastId: string }>()
  const navigate = useNavigate()
  const user = useAuthStore((state) => state.user)
  
  const [podcast, setPodcast] = useState<Podcast | null>(null)
  const [loading, setLoading] = useState(true)
  const sessionIdRef = useRef<string | null>(null)

  useEffect(() => {
    async function fetchData() {
      if (!podcastId || !user) return
      try {
        const [podcastData, sid] = await Promise.all([
          podcastService.getPodcast(podcastId),
          startSession(user.id, 'podcast')
        ])
        setPodcast(podcastData)
        sessionIdRef.current = sid
      } catch (err) {
        logError({ page: 'podcast', action: 'fetchData', error: err })
        notifications.show({ color: 'red', title: 'Error', message: 'Failed to load podcast' })
      } finally {
        setLoading(false)
      }
    }
    fetchData()

    return () => {
      if (sessionIdRef.current) {
        endSession(sessionIdRef.current).catch(err =>
          logError({ page: 'podcast', action: 'endSession', error: err })
        )
      }
    }
  }, [podcastId, user])

  if (loading || !podcast) {
    return (
      <Center h="50vh">
        <Loader size="xl" />
      </Center>
    )
  }

  const audioUrl = podcastService.getAudioUrl(podcast.audio_path)

  return (
    <Container size="md">
      <Stack gap="xl" my="xl">
        <Group justify="space-between">
          <Button variant="subtle" color="gray" leftSection={<IconChevronLeft size={16} />} onClick={() => navigate('/podcasts')}>
            Back to list
          </Button>
        </Group>

        <Paper withBorder p="xl" radius="md" shadow="sm">
          <Group mb="lg">
            <IconMicrophone size={32} color="blue" />
            <div>
              <Title order={2}>{podcast.title}</Title>
              <Text c="dimmed">{podcast.description}</Text>
            </div>
          </Group>

          <audio 
            controls 
            style={{ width: '100%', marginBottom: '20px' }}
            src={audioUrl}
          >
            Your browser does not support the audio element.
          </audio>

          <Tabs defaultValue="indonesian">
            <Tabs.List>
              <Tabs.Tab value="indonesian">Indonesian</Tabs.Tab>
              <Tabs.Tab value="english">English</Tabs.Tab>
              <Tabs.Tab value="dutch">Dutch</Tabs.Tab>
            </Tabs.List>

            <Tabs.Panel value="indonesian" pt="md">
              <Text style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
                {podcast.transcript_indonesian || 'No Indonesian transcript available.'}
              </Text>
            </Tabs.Panel>

            <Tabs.Panel value="english" pt="md">
              <Text style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
                {podcast.transcript_english || 'No English transcript available.'}
              </Text>
            </Tabs.Panel>

            <Tabs.Panel value="dutch" pt="md">
              <Text style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
                {podcast.transcript_dutch || 'No Dutch transcript available.'}
              </Text>
            </Tabs.Panel>
          </Tabs>
        </Paper>
      </Stack>
    </Container>
  )
}
