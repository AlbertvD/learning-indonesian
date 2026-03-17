// src/pages/Dashboard.tsx
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Container,
  Title,
  Text,
  SimpleGrid,
  Card,
  Group,
  Button,
  Stack,
  Badge,
  Center,
  Loader,
} from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { IconBook, IconCards, IconMicrophone } from '@tabler/icons-react'
import { progressService } from '@/services/progressService'
import { cardService } from '@/services/cardService'
import { lessonService } from '@/services/lessonService'
import { useAuthStore } from '@/stores/authStore'
import { logError } from '@/lib/logger'
import type { UserProgress } from '@/types/progress'

export function Dashboard() {
  const navigate = useNavigate()
  const user = useAuthStore((state) => state.user)

  const [loading, setLoading] = useState(true)
  const [progress, setProgress] = useState<UserProgress | null>(null)
  const [dueCardsCount, setDueCardsCount] = useState(0)
  const [lessonsCompletedCount, setLessonsCompletedCount] = useState(0)

  useEffect(() => {
    async function fetchData() {
      if (!user) return
      try {
        const [userProgress, dueCards, lessonProgress] = await Promise.all([
          progressService.getUserProgress(user.id),
          cardService.getDueCards(user.id),
          lessonService.getUserLessonProgress(user.id),
        ])
        setProgress(userProgress)
        setDueCardsCount(dueCards.length)
        const completed = lessonProgress.filter((lp) => lp.completed_at != null)
        setLessonsCompletedCount(completed.length)
      } catch (err) {
        logError({ page: 'dashboard', action: 'fetchData', error: err })
        notifications.show({
          color: 'red',
          title: 'Failed to load dashboard',
          message: 'Something went wrong. Please try again.',
        })
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [user])

  if (loading) {
    return (
      <Center h="50vh">
        <Loader size="xl" />
      </Center>
    )
  }

  const level = progress?.current_level ?? 'Beginner'

  return (
    <Container size="md">
      <Stack gap="xl" my="xl">
        <div>
          <Title order={1}>Selamat datang!</Title>
          <Text c="dimmed" mt="xs">
            Welcome back. Here's your learning overview.
          </Text>
        </div>

        <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md">
          <Card withBorder radius="md" shadow="sm" p="lg">
            <Text size="sm" c="dimmed" fw={500} tt="uppercase">
              Lessons Completed
            </Text>
            <Title order={2} mt="xs">
              {lessonsCompletedCount}
            </Title>
          </Card>

          <Card withBorder radius="md" shadow="sm" p="lg">
            <Text size="sm" c="dimmed" fw={500} tt="uppercase">
              Cards Due
            </Text>
            <Group gap="xs" mt="xs" align="center">
              <Title order={2}>{dueCardsCount}</Title>
              {dueCardsCount > 0 && (
                <Badge color="orange" size="sm">
                  Review now
                </Badge>
              )}
            </Group>
          </Card>

          <Card withBorder radius="md" shadow="sm" p="lg">
            <Text size="sm" c="dimmed" fw={500} tt="uppercase">
              Level
            </Text>
            <Title order={2} mt="xs">
              {level}
            </Title>
          </Card>
        </SimpleGrid>

        <Stack gap="sm">
          <Title order={3}>Quick Actions</Title>
          <Group gap="sm" wrap="wrap">
            <Button
              leftSection={<IconBook size={16} />}
              onClick={() => navigate('/lessons')}
            >
              Continue Learning
            </Button>
            <Button
              variant="outline"
              leftSection={<IconCards size={16} />}
              onClick={() => navigate('/review')}
            >
              Review Cards
            </Button>
            <Button
              variant="subtle"
              leftSection={<IconMicrophone size={16} />}
              onClick={() => navigate('/podcasts')}
            >
              Browse Podcasts
            </Button>
          </Group>
        </Stack>
      </Stack>
    </Container>
  )
}
