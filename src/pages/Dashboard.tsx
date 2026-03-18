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
import { useT } from '@/hooks/useT'
import { logError } from '@/lib/logger'
import type { UserProgress } from '@/types/progress'

export function Dashboard() {
  const navigate = useNavigate()
  const T = useT()
  const user = useAuthStore((state) => state.user)
  const profile = useAuthStore((state) => state.profile)

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
          title: T.common.error,
          message: T.common.somethingWentWrong,
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
  const welcomeText = profile?.fullName 
    ? `${T.dashboard.welcomeBack}, ${profile.fullName.split(' ')[0]}!`
    : `${T.dashboard.welcomeBack}!`

  return (
    <Container size="md">
      <Stack gap="xl" my="xl">
        <div>
          <Title order={1}>{welcomeText}</Title>
          <Text c="dimmed" mt="xs">
            {T.dashboard.overview}
          </Text>
        </div>

        <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md">
          <Card withBorder radius="md" shadow="sm" p="lg">
            <Text size="sm" c="dimmed" fw={500} tt="uppercase">
              {T.dashboard.lessonsCompleted}
            </Text>
            <Title order={2} mt="xs">
              {lessonsCompletedCount}
            </Title>
          </Card>

          <Card withBorder radius="md" shadow="sm" p="lg">
            <Text size="sm" c="dimmed" fw={500} tt="uppercase">
              {T.dashboard.cardsDue}
            </Text>
            <Group gap="xs" mt="xs" align="center">
              <Title order={2}>{dueCardsCount}</Title>
              {dueCardsCount > 0 && (
                <Badge color="orange" size="sm">
                  {T.dashboard.reviewNow}
                </Badge>
              )}
            </Group>
          </Card>

          <Card withBorder radius="md" shadow="sm" p="lg">
            <Text size="sm" c="dimmed" fw={500} tt="uppercase">
              {T.dashboard.level}
            </Text>
            <Title order={2} mt="xs">
              {level}
            </Title>
          </Card>
        </SimpleGrid>

        <Stack gap="sm">
          <Title order={3}>{T.dashboard.quickActions}</Title>
          <Group gap="sm" wrap="wrap">
            <Button
              leftSection={<IconBook size={16} />}
              onClick={() => navigate('/lessons')}
            >
              {T.dashboard.continueLearning}
            </Button>
            <Button
              variant="outline"
              leftSection={<IconCards size={16} />}
              onClick={() => navigate('/review')}
            >
              {T.dashboard.reviewCards}
            </Button>
            <Button
              variant="subtle"
              leftSection={<IconMicrophone size={16} />}
              onClick={() => navigate('/podcasts')}
            >
              {T.dashboard.browsePodcasts}
            </Button>
          </Group>
        </Stack>
      </Stack>
    </Container>
  )
}
