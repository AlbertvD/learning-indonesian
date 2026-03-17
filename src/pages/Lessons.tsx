// src/pages/Lessons.tsx
import { useEffect, useState } from 'react'
import { Container, Title, Text, Card, Group, Badge, SimpleGrid, Loader, Center } from '@mantine/core'
import { Link } from 'react-router-dom'
import { lessonService, type Lesson } from '@/services/lessonService'
import { useAuthStore } from '@/stores/authStore'
import { logError } from '@/lib/logger'
import { notifications } from '@mantine/notifications'

export function Lessons() {
  const [lessons, setLessons] = useState<Lesson[]>([])
  const [progress, setProgress] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const user = useAuthStore((state) => state.user)

  useEffect(() => {
    async function fetchData() {
      if (!user) return
      try {
        const [lessonsData, progressData] = await Promise.all([
          lessonService.getLessons(),
          lessonService.getUserLessonProgress(user.id)
        ])
        setLessons(lessonsData)
        setProgress(progressData)
      } catch (err) {
        logError({ page: 'lessons', action: 'fetchData', error: err })
        notifications.show({ color: 'red', title: 'Error', message: 'Failed to load lessons. Please try again.' })
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

  const isCompleted = (lessonId: string) => 
    progress.some(p => p.lesson_id === lessonId && p.completed_at)

  return (
    <Container size="lg">
      <Title order={1} mb="xl">Lessons</Title>
      
      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="lg">
        {lessons.map((lesson) => (
          <Card
            key={lesson.id}
            shadow="sm"
            padding="lg"
            radius="md"
            withBorder
            component={Link}
            to={`/lesson/${lesson.id}`}
            style={{ textDecoration: 'none' }}
          >
            <Group justify="space-between" mb="xs">
              <Text fw={700} size="lg">{lesson.title}</Text>
              <Group gap="xs">
                <Badge color="blue" variant="light">{lesson.level}</Badge>
                {isCompleted(lesson.id) && (
                  <Badge color="green" variant="filled">Completed</Badge>
                )}
              </Group>
            </Group>

            <Text size="sm" c="dimmed" lineClamp={2}>
              {lesson.description || 'Start learning Indonesian through this interactive lesson.'}
            </Text>
            
            <Text size="xs" mt="md" fw={500} c="blue">
              {lesson.lesson_sections?.length || 0} sections
            </Text>
          </Card>
        ))}
      </SimpleGrid>
    </Container>
  )
}
