// src/pages/Lesson.tsx
import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Container, Title, Text, Button, Paper, Group, Progress, Stack, Center, Loader, Table, List, Badge, Divider } from '@mantine/core'
import { IconChevronLeft, IconChevronRight, IconCheck } from '@tabler/icons-react'
import { lessonService, type Lesson } from '@/services/lessonService'
import { progressService } from '@/services/progressService'
import { startSession, endSession } from '@/lib/session'
import { useAuthStore } from '@/stores/authStore'
import { logError } from '@/lib/logger'
import { notifications } from '@mantine/notifications'

type ExerciseItem = { dutch?: string; indonesian?: string }
type PhoneticExample = { indonesian: string; phonetic: string; dutch: string }
type SpellingRule = { rule: string; example: string; dutch: string }
type SimpleSentence = { indonesian: string; dutch: string }
type GrammarCategory = { title: string; rules: string[] }
type DialogueLine = { speaker: string; text: string }

import { useT } from '@/hooks/useT'

type SectionContentData =
  | { type: 'exercises'; items: ExerciseItem[] }
  | { type: 'text'; intro?: string; examples?: PhoneticExample[]; spelling?: SpellingRule[]; sentences?: SimpleSentence[] }
  | { type: 'grammar'; intro?: string; categories: GrammarCategory[] }
  | { type: 'dialogue'; setup?: string; lines: DialogueLine[] }

function SectionContent({ content }: { content: unknown }) {
  const data = content as SectionContentData
  const T = useT()

  if (data?.type === 'exercises' && Array.isArray(data.items)) {
    const hasDutch = data.items.some((i) => i.dutch)
    const hasIndonesian = data.items.some((i) => i.indonesian)
    return (
      <Table striped highlightOnHover withTableBorder withColumnBorders>
        <Table.Thead>
          <Table.Tr>
            {hasDutch && <Table.Th>{T.lessons.dutch}</Table.Th>}
            {hasIndonesian && <Table.Th>{T.lessons.indonesian}</Table.Th>}
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

  if (data?.type === 'text') {
    return (
      <Stack gap="lg">
        {data.intro && <Text>{data.intro}</Text>}
        {data.examples && data.examples.length > 0 && (
          <Stack gap="xs">
            <Text fw={600}>{T.lessons.examples}</Text>
            <Table withTableBorder withColumnBorders>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>{T.lessons.indonesian}</Table.Th>
                  <Table.Th>{T.lessons.phonetic}</Table.Th>
                  <Table.Th>{T.lessons.dutch}</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {data.examples.map((ex, i) => (
                  <Table.Tr key={i}>
                    <Table.Td fw={500}>{ex.indonesian}</Table.Td>
                    <Table.Td c="dimmed">{ex.phonetic}</Table.Td>
                    <Table.Td>{ex.dutch}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Stack>
        )}
        {data.spelling && data.spelling.length > 0 && (
          <Stack gap="xs">
            <Text fw={600}>{T.lessons.spelling}</Text>
            <Table withTableBorder withColumnBorders>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>{T.lessons.rule}</Table.Th>
                  <Table.Th>{T.lessons.example}</Table.Th>
                  <Table.Th>{T.lessons.dutch}</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {data.spelling.map((s, i) => (
                  <Table.Tr key={i}>
                    <Table.Td fw={600}>{s.rule}</Table.Td>
                    <Table.Td>{s.example}</Table.Td>
                    <Table.Td>{s.dutch}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Stack>
        )}
        {data.sentences && data.sentences.length > 0 && (
          <Stack gap="xs">
            <Text fw={600}>{T.lessons.simpleSentences}</Text>
            <Table withTableBorder withColumnBorders>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>{T.lessons.indonesian}</Table.Th>
                  <Table.Th>{T.lessons.dutch}</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {data.sentences.map((s, i) => (
                  <Table.Tr key={i}>
                    <Table.Td fw={500}>{s.indonesian}</Table.Td>
                    <Table.Td>{s.dutch}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Stack>
        )}
      </Stack>
    )
  }

  if (data?.type === 'grammar' && Array.isArray(data.categories)) {
    return (
      <Stack gap="lg">
        {data.intro && <Text>{data.intro}</Text>}
        {data.categories.map((cat, i) => (
          <Stack key={i} gap="xs">
            {i > 0 && <Divider />}
            <Text fw={600} size="lg">{cat.title}</Text>
            <List spacing="xs">
              {cat.rules.map((rule, j) => (
                <List.Item key={j}>{rule}</List.Item>
              ))}
            </List>
          </Stack>
        ))}
      </Stack>
    )
  }

  if (data?.type === 'dialogue' && Array.isArray(data.lines)) {
    return (
      <Stack gap="md">
        {data.setup && (
          <Text fs="italic" c="dimmed">{data.setup}</Text>
        )}
        {data.lines.map((line, i) => (
          <Group key={i} align="flex-start" gap="sm">
            <Badge variant="light" miw={80} ta="center">{line.speaker}</Badge>
            <Text style={{ flex: 1 }}>{line.text}</Text>
          </Group>
        ))}
      </Stack>
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
  const T = useT()
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
        notifications.show({ color: 'red', title: T.common.error, message: T.lessons.failedToLoadLesson })
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
      notifications.show({ color: 'red', title: T.common.error, message: T.lessons.failedToSaveProgress })
    }

    if (currentSectionIndex < lesson.lesson_sections.length - 1) {
      setCurrentSectionIndex(currentSectionIndex + 1)
      window.scrollTo(0, 0)
    } else {
      // Final completion
      notifications.show({
        color: 'green',
        title: T.lessons.lessonComplete,
        message: T.lessons.lessonCompleteMessage(lesson.title),
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
            {T.lessons.backToList}
          </Button>
          <Text size="sm" fw={500} c="dimmed">
            {T.lessons.section} {currentSectionIndex + 1} {T.lessons.of} {lesson.lesson_sections.length}
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
            {T.lessons.previous}
          </Button>
          <Button 
            size="lg"
            onClick={handleNext}
            rightSection={currentSectionIndex === lesson.lesson_sections.length - 1 ? <IconCheck size={16} /> : <IconChevronRight size={16} />}
            color={currentSectionIndex === lesson.lesson_sections.length - 1 ? 'green' : 'blue'}
          >
            {currentSectionIndex === lesson.lesson_sections.length - 1 ? T.lessons.finishLesson : T.lessons.nextSection}
          </Button>
        </Group>
      </Stack>
    </Container>
  )
}
