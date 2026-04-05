import { useState, useEffect, useCallback } from 'react'
import {
  Stack,
  Select,
  Card,
  Text,
  Group,
  Button,
  Loader,
  Center,
  Badge,
  Tabs,
  ScrollArea,
  Title,
  ActionIcon,
  Grid,
  Code,
  Divider,
  SegmentedControl,
  Tooltip,
} from '@mantine/core'
import { notifications } from '@mantine/notifications'
import {
  IconCheck,
  IconX,
  IconRefresh,
  IconChevronLeft,
  IconChevronRight,
  IconDeviceFloppy,
} from '@tabler/icons-react'
import axios from 'axios'
import './App.css'

interface Page {
  page_number: number
  image_filename: string
  image_url: string
  ocr_text: string
  has_ocr: boolean
}

interface Candidate {
  exercise_type: string
  grammar_pattern_slug: string
  source_page?: number
  review_status: 'pending_review' | 'approved' | 'rejected' | 'published'
  requiresManualApproval?: boolean
  payload: Record<string, any>
}

const STATUS_COLORS: Record<string, string> = {
  pending_review: 'yellow',
  approved: 'green',
  rejected: 'red',
  published: 'blue',
}

const EXERCISE_COLORS: Record<string, string> = {
  contrast_pair: 'violet',
  sentence_transformation: 'cyan',
  constrained_translation: 'orange',
  cued_recall: 'teal',
}

function PayloadPreview({ payload, exerciseType }: { payload: Record<string, any>, exerciseType: string }) {
  if (exerciseType === 'contrast_pair') {
    return (
      <Stack gap={4}>
        <Text size="sm" fw={500}>{payload.promptText}</Text>
        {payload.options?.map((o: any) => (
          <Group key={o.id} gap="xs">
            <Badge size="xs" color={o.id === payload.correctOptionId ? 'green' : 'gray'} variant="light">
              {o.id === payload.correctOptionId ? '✓' : '✗'}
            </Badge>
            <Text size="sm">{o.text}</Text>
          </Group>
        ))}
        {payload.explanationText && (
          <Text size="xs" c="dimmed" mt={4}>{payload.explanationText}</Text>
        )}
      </Stack>
    )
  }

  if (exerciseType === 'sentence_transformation') {
    return (
      <Stack gap={4}>
        <Text size="sm" fw={500}>{payload.sourceSentence}</Text>
        <Text size="sm" c="blue.4">→ {payload.transformationInstruction}</Text>
        <Text size="xs" c="green.4">✓ {payload.acceptableAnswers?.join(' / ')}</Text>
        {payload.explanationText && (
          <Text size="xs" c="dimmed">{payload.explanationText}</Text>
        )}
      </Stack>
    )
  }

  if (exerciseType === 'constrained_translation') {
    return (
      <Stack gap={4}>
        <Text size="sm" fw={500}>{payload.sourceLanguageSentence}</Text>
        <Text size="xs" c="dimmed">Pattern: {payload.requiredTargetPattern}</Text>
        <Text size="xs" c="green.4">✓ {payload.acceptableAnswers?.join(' / ')}</Text>
        {payload.disallowedShortcutForms?.length > 0 && (
          <Text size="xs" c="red.4">✗ {payload.disallowedShortcutForms.join(' / ')}</Text>
        )}
        {payload.explanationText && (
          <Text size="xs" c="dimmed">{payload.explanationText}</Text>
        )}
      </Stack>
    )
  }

  return <Code block>{JSON.stringify(payload, null, 2)}</Code>
}

function CandidatesTab({ lesson }: { lesson: string }) {
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [filter, setFilter] = useState('pending_review')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await axios.get(`/api/candidates/${lesson}`)
      setCandidates(res.data)
    } catch {
      notifications.show({ color: 'red', title: 'Failed to load candidates', message: 'Check server is running.' })
    } finally {
      setLoading(false)
    }
  }, [lesson])

  useEffect(() => { load() }, [load])

  const save = async (updated: Candidate[]) => {
    setSaving(true)
    try {
      await axios.post(`/api/candidates/${lesson}`, { candidates: updated })
      setCandidates(updated)
    } catch {
      notifications.show({ color: 'red', title: 'Failed to save', message: 'Check server is running.' })
    } finally {
      setSaving(false)
    }
  }

  const updateStatus = (index: number, status: Candidate['review_status']) => {
    const globalIndex = candidates.findIndex((_, i) => filtered[index] === candidates[i])
    if (globalIndex === -1) return
    const updated = candidates.map((c, i) => i === globalIndex ? { ...c, review_status: status } : c)
    save(updated)
  }

  const approveAll = () => {
    const updated = candidates.map(c =>
      c.review_status === 'pending_review' ? { ...c, review_status: 'approved' as const } : c
    )
    save(updated)
  }

  const filtered = candidates.filter(c =>
    filter === 'all' ? true : c.review_status === filter
  )

  const counts = {
    all: candidates.length,
    pending_review: candidates.filter(c => c.review_status === 'pending_review').length,
    approved: candidates.filter(c => c.review_status === 'approved').length,
    rejected: candidates.filter(c => c.review_status === 'rejected').length,
    published: candidates.filter(c => c.review_status === 'published').length,
  }

  if (loading) return <Center h={300}><Loader /></Center>

  if (candidates.length === 0) return (
    <Center h={300}>
      <Text c="dimmed">No candidates found for lesson {lesson}.</Text>
    </Center>
  )

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <SegmentedControl
          value={filter}
          onChange={setFilter}
          data={[
            { value: 'all', label: `All (${counts.all})` },
            { value: 'pending_review', label: `Pending (${counts.pending_review})` },
            { value: 'approved', label: `Approved (${counts.approved})` },
            { value: 'rejected', label: `Rejected (${counts.rejected})` },
            { value: 'published', label: `Published (${counts.published})` },
          ]}
          size="xs"
        />
        <Group gap="xs">
          <Tooltip label="Reload from disk">
            <ActionIcon variant="subtle" onClick={load} loading={loading}><IconRefresh size={16} /></ActionIcon>
          </Tooltip>
          {counts.pending_review > 0 && (
            <Button size="xs" color="green" leftSection={<IconCheck size={14} />} onClick={approveAll} loading={saving}>
              Approve all pending ({counts.pending_review})
            </Button>
          )}
        </Group>
      </Group>

      <ScrollArea h="calc(100vh - 220px)">
        <Stack gap="sm">
          {filtered.map((c, i) => (
            <Card key={i} withBorder p="sm">
              <Group justify="space-between" mb="xs">
                <Group gap="xs">
                  <Badge color={EXERCISE_COLORS[c.exercise_type] ?? 'gray'} size="sm">{c.exercise_type}</Badge>
                  <Badge variant="outline" size="sm" color="gray">{c.grammar_pattern_slug}</Badge>
                  {c.source_page && <Text size="xs" c="dimmed">p.{c.source_page}</Text>}
                </Group>
                <Group gap="xs">
                  <Badge color={STATUS_COLORS[c.review_status]} size="sm">{c.review_status}</Badge>
                  {c.review_status !== 'published' && (
                    <>
                      {c.review_status !== 'approved' && (
                        <Tooltip label="Approve">
                          <ActionIcon size="sm" color="green" variant="light" onClick={() => updateStatus(i, 'approved')} loading={saving}>
                            <IconCheck size={14} />
                          </ActionIcon>
                        </Tooltip>
                      )}
                      {c.review_status !== 'rejected' && (
                        <Tooltip label="Reject">
                          <ActionIcon size="sm" color="red" variant="light" onClick={() => updateStatus(i, 'rejected')} loading={saving}>
                            <IconX size={14} />
                          </ActionIcon>
                        </Tooltip>
                      )}
                      {c.review_status !== 'pending_review' && (
                        <Tooltip label="Reset to pending">
                          <ActionIcon size="sm" color="yellow" variant="light" onClick={() => updateStatus(i, 'pending_review')} loading={saving}>
                            <IconRefresh size={14} />
                          </ActionIcon>
                        </Tooltip>
                      )}
                    </>
                  )}
                </Group>
              </Group>
              <Divider mb="xs" />
              <PayloadPreview payload={c.payload} exerciseType={c.exercise_type} />
            </Card>
          ))}
          {filtered.length === 0 && (
            <Center h={100}><Text c="dimmed">No candidates with status "{filter}".</Text></Center>
          )}
        </Stack>
      </ScrollArea>
    </Stack>
  )
}

function OcrTab({ lesson }: { lesson: string }) {
  const [pages, setPages] = useState<Page[]>([])
  const [currentPageIndex, setCurrentPageIndex] = useState(0)
  const [ocrText, setOcrText] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!lesson) return
    setLoading(true)
    axios.get(`/api/pages/${lesson}`)
      .then(res => {
        setPages(res.data)
        setCurrentPageIndex(0)
        if (res.data.length > 0) setOcrText(res.data[0].ocr_text)
      })
      .catch(() => notifications.show({ color: 'red', title: 'Failed to load pages', message: 'Check server is running.' }))
      .finally(() => setLoading(false))
  }, [lesson])

  useEffect(() => {
    if (pages.length > 0 && currentPageIndex < pages.length) {
      setOcrText(pages[currentPageIndex].ocr_text)
    }
  }, [currentPageIndex, pages])

  const handleSave = async () => {
    if (!lesson || pages.length === 0) return
    setSaving(true)
    try {
      await axios.post(`/api/pages/${lesson}/${pages[currentPageIndex].page_number}`, { text: ocrText })
      const updated = [...pages]
      updated[currentPageIndex].ocr_text = ocrText
      setPages(updated)
      notifications.show({ color: 'green', title: 'Saved', message: `Page ${currentPageIndex + 1} saved.` })
    } catch {
      notifications.show({ color: 'red', title: 'Failed to save', message: 'Check server is running.' })
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <Center h={300}><Loader /></Center>

  if (pages.length === 0) return (
    <Center h={300}>
      <Text c="dimmed">No page images found for lesson {lesson}. Add images to content/raw/lesson-{lesson}/</Text>
    </Center>
  )

  const currentPage = pages[currentPageIndex]

  return (
    <Stack gap="md" style={{ height: 'calc(100vh - 160px)' }}>
      <Card withBorder p="xs">
        <Group justify="center" gap="xl">
          <ActionIcon variant="subtle" size="xl" disabled={currentPageIndex === 0} onClick={() => setCurrentPageIndex(p => p - 1)}>
            <IconChevronLeft />
          </ActionIcon>
          <Text fw={700}>Page {currentPageIndex + 1} of {pages.length}</Text>
          <ActionIcon variant="subtle" size="xl" disabled={currentPageIndex === pages.length - 1} onClick={() => setCurrentPageIndex(p => p + 1)}>
            <IconChevronRight />
          </ActionIcon>
        </Group>
      </Card>

      <Grid gutter="md" style={{ flex: 1, minHeight: 0 }}>
        <Grid.Col span={6} style={{ display: 'flex', flexDirection: 'column' }}>
          <Card withBorder p={0} style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <Card.Section withBorder inheritPadding py="xs">
              <Text fw={500} size="sm">Page Image</Text>
            </Card.Section>
            <ScrollArea style={{ flex: 1 }}>
              <img src={currentPage.image_url} alt={`Page ${currentPage.page_number}`} style={{ width: '100%', display: 'block' }} />
            </ScrollArea>
          </Card>
        </Grid.Col>
        <Grid.Col span={6} style={{ display: 'flex', flexDirection: 'column' }}>
          <Card withBorder p={0} style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
            <Card.Section withBorder inheritPadding py="xs">
              <Group justify="space-between">
                <Text fw={500} size="sm">OCR Text</Text>
                <Button size="compact-xs" leftSection={<IconDeviceFloppy size={14} />} onClick={handleSave} loading={saving}>Save</Button>
              </Group>
            </Card.Section>
            <div style={{ flex: 1, display: 'flex' }}>
              <textarea
                value={ocrText}
                onChange={e => setOcrText(e.currentTarget.value)}
                style={{ flex: 1, fontFamily: 'monospace', fontSize: '12px', lineHeight: '1.6', padding: '8px', border: 'none', resize: 'none' }}
              />
            </div>
          </Card>
        </Grid.Col>
      </Grid>
    </Stack>
  )
}

function App() {
  const [lessons, setLessons] = useState<number[]>([])
  const [selectedLesson, setSelectedLesson] = useState<string | null>(null)

  useEffect(() => {
    axios.get('/api/lessons')
      .then(res => {
        setLessons(res.data)
        if (res.data.length === 1) setSelectedLesson(res.data[0].toString())
      })
      .catch(() => notifications.show({ color: 'red', title: 'Failed to load lessons', message: 'Check server is running.' }))
  }, [])

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', padding: '1rem' }}>
      <Group justify="space-between" mb="md">
        <Group gap="lg">
          <Title order={3}>Content Review</Title>
          <Select
            placeholder="Select Lesson"
            data={lessons.map(l => ({ value: l.toString(), label: `Lesson ${l}` }))}
            value={selectedLesson}
            onChange={setSelectedLesson}
            w={140}
          />
        </Group>
      </Group>

      {!selectedLesson ? (
        <Center style={{ flex: 1 }}>
          <Text c="dimmed">Select a lesson to begin</Text>
        </Center>
      ) : (
        <Tabs defaultValue="candidates" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <Tabs.List mb="md">
            <Tabs.Tab value="candidates">Exercise Candidates</Tabs.Tab>
            <Tabs.Tab value="ocr">OCR Review</Tabs.Tab>
          </Tabs.List>
          <Tabs.Panel value="candidates" style={{ flex: 1 }}>
            <CandidatesTab lesson={selectedLesson} key={selectedLesson} />
          </Tabs.Panel>
          <Tabs.Panel value="ocr" style={{ flex: 1 }}>
            <OcrTab lesson={selectedLesson} key={selectedLesson} />
          </Tabs.Panel>
        </Tabs>
      )}
    </div>
  )
}

export default App
