// src/pages/Lesson.tsx
import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Container, Title, Text, Button, Paper, Group, Progress, Stack, Center, Loader, Table } from '@mantine/core'
import { IconChevronLeft, IconChevronRight, IconCheck } from '@tabler/icons-react'
import { lessonService, type Lesson } from '@/services/lessonService'
import { progressService } from '@/services/progressService'
import { startSession, endSession } from '@/lib/session'
import { useAuthStore } from '@/stores/authStore'
import { logError } from '@/lib/logger'
import { notifications } from '@mantine/notifications'

type ExerciseItem = { dutch?: string; indonesian?: string }
type SectionContentData = { type: string; items?: ExerciseItem[] }

function SectionContent({ content }: { content: unknown }) {
  const data = content as SectionContentData
  if (data?.type === 'exercises' && Array.isArray(data.items)) {
    const hasDutch = data.items.some((i) => i.dutch)
    const hasIndonesian = data.items.some((i) => i.indonesian)
    return (
      <Table striped highlightOnHover withTableBorder withColumnBorders>
        <Table.Thead>
          <Table.Tr>
            {hasDutch && <Table.Th>Nederlands</Table.Th>}
            {hasIndonesian && <Table.Th>Bahasa Indonesia</Table.Th>}
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {data.items.map((item, i) => (
            <Table.Tr key={i}>
              {hasDutch && <Table.Td>{item.dutch ?? ''}</Table.Td>}
              {hasIndonesian && <Table.Td>{item.indonesian ?? ''}</Table.Td>}
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    )
  }
  return (
    <Text size="lg" style={{ whiteSpace: 'pre-wrap' }}>
      {typeof content === 'string' ? content : JSON.stringify(content, null, 2)}
    </Text>
  )
}

export function Lesson() {
  const { lessonId } = useParams<{ lessonId: string }>()
  const navigate = useNavigate()
  const user = useAuthStore((state) => state.user)
  
  const [lesson, setLesson] = useState<Lesson | null>(null)
  const [currentSectionIndex, setCurrentSectionIndex] = useState(0)
  const [loading, setLoading] = useState(true)
  const sessionIdRef = useRef<string | null>(null)
  const [completedSections, setCompletedSections] = useState<string[]>([])

  useEffect(() => {
    async function fetchData() {
      if (!lessonId || !user) return
      try {
        const [lessonData, sid] = await Promise.all([
          lessonService.getLesson(lessonId),
          startSession(user.id, 'lesson')
        ])
        setLesson(lessonData)
        sessionIdRef.current = sid
        
        // Fetch existing progress
        const progress = await lessonService.getUserLessonProgress(user.id)
        const lessonProgress = progress.find((p: any) => p.lesson_id === lessonId)
        if (lessonProgress) {
          setCompletedSections(lessonProgress.sections_completed || [])
        }
      } catch (err) {
        logError({ page: 'lesson', action: 'fetchData', error: err })
        notifications.show({ color: 'red', title: 'Error', message: 'Failed to load lesson' })
      } finally {
        setLoading(false)
      }
    }
    fetchData()

    return () => {
      if (sessionIdRef.current) {
        endSession(sessionIdRef.current).catch(err =>
          logError({ page: 'lesson', action: 'endSession', error: err })
        )
      }
    }
  }, [lessonId, user])

  const handleNext = async () => {
    if (!lesson || !user) return
    
    const section = lesson.lesson_sections[currentSectionIndex]
    const nextSections = Array.from(new Set([...completedSections, section.id]))
    setCompletedSections(nextSections)
    
    // Save incremental progress
    try {
      await progressService.markLessonComplete(user.id, lesson.id, nextSections)
    } catch (err) {
      logError({ page: 'lesson', action: 'saveProgress', error: err })
      notifications.show({ color: 'red', title: 'Error', message: 'Failed to save your progress. Please try again.' })
    }

    if (currentSectionIndex < lesson.lesson_sections.length - 1) {
      setCurrentSectionIndex(currentSectionIndex + 1)
      window.scrollTo(0, 0)
    } else {
      // Final completion
      notifications.show({
        color: 'green',
        title: 'Lesson complete!',
        message: `You've finished ${lesson.title}`,
        icon: <IconCheck size={16} />
      })
      navigate('/lessons')
    }
  }

  const handleBack = () => {
    if (currentSectionIndex > 0) {
      setCurrentSectionIndex(currentSectionIndex - 1)
      window.scrollTo(0, 0)
    }
  }

  if (loading || !lesson) {
    return (
      <Center h="50vh">
        <Loader size="xl" />
      </Center>
    )
  }

  const currentSection = lesson.lesson_sections[currentSectionIndex]
  const progress = ((currentSectionIndex + 1) / lesson.lesson_sections.length) * 100

  return (
    <Container size="md">
      <Stack gap="xl" my="xl">
        <Group justify="space-between">
          <Button variant="subtle" color="gray" leftSection={<IconChevronLeft size={16} />} onClick={() => navigate('/lessons')}>
            Back to list
          </Button>
          <Text size="sm" fw={500} c="dimmed">
            Section {currentSectionIndex + 1} of {lesson.lesson_sections.length}
          </Text>
        </Group>

        <Progress value={progress} size="sm" radius="xl" animated />

        <Paper withBorder p="xl" radius="md" shadow="sm">
          <Title order={2} mb="lg">{currentSection.title}</Title>
          <div style={{ minHeight: '200px' }}>
            <SectionContent content={currentSection.content} />
          </div>
        </Paper>

        <Group justify="space-between">
          <Button 
            variant="light" 
            onClick={handleBack} 
            disabled={currentSectionIndex === 0}
            leftSection={<IconChevronLeft size={16} />}
          >
            Previous
          </Button>
          <Button 
            size="lg"
            onClick={handleNext}
            rightSection={currentSectionIndex === lesson.lesson_sections.length - 1 ? <IconCheck size={16} /> : <IconChevronRight size={16} />}
            color={currentSectionIndex === lesson.lesson_sections.length - 1 ? 'green' : 'blue'}
          >
            {currentSectionIndex === lesson.lesson_sections.length - 1 ? 'Finish Lesson' : 'Next Section'}
          </Button>
        </Group>
      </Stack>
    </Container>
  )
}
