import { useState, useEffect } from 'react'
import {
  Container,
  Stack,
  Select,
  Grid,
  Card,
  Text,
  Group,
  Button,
  Badge,
  Textarea,
  Loader,
  Center,
  Alert,
  Tabs,
  TextInput,
  ActionIcon,
  ScrollArea,
  Title,
} from '@mantine/core'
import {
  IconAlertCircle,
  IconCheck,
  IconX,
  IconDeviceFloppy,
  IconRefresh,
  IconChevronLeft,
  IconChevronRight,
  IconPlus,
  IconTrash,
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

interface LearningItem {
  base_text: string
  item_type: string
  context_type: string
  translation_nl: string
  translation_en: string
  source_page: number
  review_status: 'pending_review' | 'approved' | 'rejected'
}

interface LessonSection {
  title: string
  content: any
  order_index: number
}

interface StagingData {
  lesson: {
    title: string
    description: string
    level: string
    module_id: string
    order_index: number
    sections: LessonSection[]
  } | null
  learningItems: LearningItem[]
  grammarPatterns: any[]
  candidates: any[]
}

function App() {
  const [lessons, setLessons] = useState<number[]>([])
  const [selectedLesson, setSelectedLesson] = useState<string | null>(null)
  const [pages, setPages] = useState<Page[]>([])
  const [currentPageIndex, setCurrentPageIndex] = useState(0)
  const [ocrText, setOcrText] = useState('')
  const [staging, setStaging] = useState<StagingData>({
    lesson: null,
    learningItems: [],
    grammarPatterns: [],
    candidates: [],
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [activeTab, setActiveTab] = useState<string | null>('items')

  // Load lessons on mount
  useEffect(() => {
    const fetchLessons = async () => {
      try {
        const res = await axios.get('/api/lessons')
        setLessons(res.data)
      } catch (err) {
        setError('Failed to load lessons')
        console.error(err)
      }
    }
    fetchLessons()
  }, [])

  // Load pages and staging when lesson changes
  useEffect(() => {
    if (!selectedLesson) return

    const fetchData = async () => {
      setLoading(true)
      setError(null)
      try {
        const [pagesRes, stagingRes] = await Promise.all([
          axios.get(`/api/pages/${selectedLesson}`),
          axios.get(`/api/staging/${selectedLesson}`),
        ])
        setPages(pagesRes.data)
        setStaging(stagingRes.data)
        setCurrentPageIndex(0)
        if (pagesRes.data.length > 0) {
          setOcrText(pagesRes.data[0].ocr_text)
        }
      } catch (err) {
        setError('Failed to load content')
        console.error(err)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [selectedLesson])

  // Update OCR text when page index changes
  useEffect(() => {
    if (pages.length > 0 && currentPageIndex < pages.length) {
      setOcrText(pages[currentPageIndex].ocr_text)
    }
  }, [currentPageIndex, pages])

  const handleSaveOcr = async (reparse = false) => {
    if (!selectedLesson || pages.length === 0) return
    const pageNum = pages[currentPageIndex].page_number
    setSaving(true)
    try {
      await axios.post(`/api/pages/${selectedLesson}/${pageNum}`, { text: ocrText })
      
      // Update local pages state
      const updatedPages = [...pages]
      updatedPages[currentPageIndex].ocr_text = ocrText
      setPages(updatedPages)

      if (reparse) {
        await axios.post(`/api/pages/${selectedLesson}/reparse`)
        const stagingRes = await axios.get(`/api/staging/${selectedLesson}`)
        setStaging(stagingRes.data)
      }
    } catch (err) {
      setError('Failed to save OCR text')
      console.error(err)
    } finally {
      setSaving(false)
    }
  }

  const handleSaveAll = async () => {
    if (!selectedLesson) return
    setSaving(true)
    try {
      await axios.post(`/api/staging/${selectedLesson}`, staging)
      alert('All changes saved to staging files!')
    } catch (err) {
      setError('Failed to save staging data')
      console.error(err)
    } finally {
      setSaving(false)
    }
  }

  const updateItem = (index: number, field: keyof LearningItem, value: any) => {
    const updated = [...staging.learningItems]
    updated[index] = { ...updated[index], [field]: value }
    setStaging({ ...staging, learningItems: updated })
  }

  const removeItem = (index: number) => {
    const updated = [...staging.learningItems]
    updated.splice(index, 1)
    setStaging({ ...staging, learningItems: updated })
  }

  const addItem = () => {
    const newItem: LearningItem = {
      base_text: '',
      item_type: 'word',
      context_type: 'vocabulary_list',
      translation_nl: '',
      translation_en: '',
      source_page: pages[currentPageIndex]?.page_number || 1,
      review_status: 'pending_review',
    }
    setStaging({ ...staging, learningItems: [newItem, ...staging.learningItems] })
  }

  const currentPage = pages[currentPageIndex]

  if (loading) {
    return (
      <Center h="100vh">
        <Loader size="xl" />
      </Center>
    )
  }

  return (
    <Container size="100%" px="md" py="md">
      <Stack gap="md">
        <Group justify="space-between">
          <Group gap="lg">
            <Title order={2}>Content Pipeline Review</Title>
            <Select
              placeholder="Select Lesson"
              data={lessons.map(l => ({ value: l.toString(), label: `Lesson ${l}` }))}
              value={selectedLesson}
              onChange={setSelectedLesson}
              w={150}
            />
          </Group>
          {selectedLesson && (
            <Group>
              <Button
                leftSection={<IconDeviceFloppy size={18} />}
                onClick={handleSaveAll}
                loading={saving}
                color="blue"
              >
                Save All Changes
              </Button>
            </Group>
          )}
        </Group>

        {!selectedLesson ? (
          <Center h="50vh">
            <Text c="dimmed" size="lg">Please select a lesson to begin review</Text>
          </Center>
        ) : (
          <>
            {error && (
              <Alert icon={<IconAlertCircle size={16} />} color="red" title="Error" withCloseButton onClose={() => setError(null)}>
                {error}
              </Alert>
            )}

            <Card withBorder p="xs">
              <Group justify="center" gap="xl">
                <ActionIcon 
                  variant="subtle" 
                  size="xl" 
                  disabled={currentPageIndex === 0}
                  onClick={() => setCurrentPageIndex(prev => prev - 1)}
                >
                  <IconChevronLeft />
                </ActionIcon>
                <Text fw={700}>Page {currentPageIndex + 1} of {pages.length}</Text>
                <ActionIcon 
                  variant="subtle" 
                  size="xl" 
                  disabled={currentPageIndex === pages.length - 1}
                  onClick={() => setCurrentPageIndex(prev => prev + 1)}
                >
                  <IconChevronRight />
                </ActionIcon>
              </Group>
            </Card>

            <Grid gutter="md">
              {/* Left Panel: Image */}
              <Grid.Col span={4}>
                <Card withBorder h={600} p={0}>
                  <Card.Section withBorder inheritPadding py="xs">
                    <Text fw={500}>Page Image</Text>
                  </Card.Section>
                  <ScrollArea h={560}>
                    {currentPage && (
                      <img 
                        src={currentPage.image_url} 
                        alt={`Page ${currentPage.page_number}`} 
                        style={{ width: '100%', display: 'block' }} 
                      />
                    )}
                  </ScrollArea>
                </Card>
              </Grid.Col>

              {/* Middle Panel: OCR Text */}
              <Grid.Col span={4}>
                <Card withBorder h={600}>
                  <Card.Section withBorder inheritPadding py="xs">
                    <Group justify="space-between">
                      <Text fw={500}>OCR Text (Correct here)</Text>
                      <Group gap="xs">
                        <Button size="compact-xs" leftSection={<IconDeviceFloppy size={14} />} onClick={() => handleSaveOcr()} loading={saving}>Save</Button>
                        <Button size="compact-xs" color="orange" leftSection={<IconRefresh size={14} />} onClick={() => handleSaveOcr(true)} loading={saving}>Save & Re-parse</Button>
                      </Group>
                    </Group>
                  </Card.Section>
                  <Textarea
                    value={ocrText}
                    onChange={(e) => setOcrText(e.currentTarget.value)}
                    h={520}
                    styles={{ input: { height: '100%', fontFamily: 'monospace' } }}
                    mt="sm"
                  />
                </Card>
              </Grid.Col>

              {/* Right Panel: Structured Staging */}
              <Grid.Col span={4}>
                <Card withBorder h={600} p="xs">
                  <Tabs value={activeTab} onChange={setActiveTab}>
                    <Tabs.List>
                      <Tabs.Tab value="items">Learning Items ({staging.learningItems.length})</Tabs.Tab>
                      <Tabs.Tab value="sections">Sections ({staging.lesson?.sections.length || 0})</Tabs.Tab>
                      <Tabs.Tab value="metadata">Lesson Meta</Tabs.Tab>
                    </Tabs.List>

                    <Tabs.Panel value="items" pt="xs">
                      <ScrollArea h={500}>
                        <Stack gap="xs">
                          <Button 
                            variant="light" 
                            leftSection={<IconPlus size={16} />} 
                            onClick={addItem}
                            fullWidth
                          >
                            Add New Item
                          </Button>
                          {staging.learningItems.map((item, idx) => (
                            <Card key={idx} withBorder p="xs" shadow="xs">
                              <Stack gap="xs">
                                <Group justify="space-between">
                                  <Badge size="xs" color="blue">Page {item.source_page}</Badge>
                                  <Group gap={4}>
                                    <ActionIcon 
                                      color="green" 
                                      variant={item.review_status === 'approved' ? 'filled' : 'light'}
                                      size="sm"
                                      onClick={() => updateItem(idx, 'review_status', 'approved')}
                                    >
                                      <IconCheck size={14} />
                                    </ActionIcon>
                                    <ActionIcon 
                                      color="red" 
                                      variant={item.review_status === 'rejected' ? 'filled' : 'light'}
                                      size="sm"
                                      onClick={() => updateItem(idx, 'review_status', 'rejected')}
                                    >
                                      <IconX size={14} />
                                    </ActionIcon>
                                    <ActionIcon color="gray" variant="light" size="sm" onClick={() => removeItem(idx)}>
                                      <IconTrash size={14} />
                                    </ActionIcon>
                                  </Group>
                                </Group>
                                <TextInput
                                  label="Indonesian"
                                  size="xs"
                                  value={item.base_text}
                                  onChange={(e) => updateItem(idx, 'base_text', e.currentTarget.value)}
                                />
                                <TextInput
                                  label="Dutch"
                                  size="xs"
                                  value={item.translation_nl}
                                  onChange={(e) => updateItem(idx, 'translation_nl', e.currentTarget.value)}
                                />
                                <Group grow>
                                  <Select
                                    label="Type"
                                    size="xs"
                                    data={['word', 'phrase', 'sentence', 'dialogue_chunk']}
                                    value={item.item_type}
                                    onChange={(val) => updateItem(idx, 'item_type', val)}
                                  />
                                  <Select
                                    label="Context"
                                    size="xs"
                                    data={['vocabulary_list', 'example_sentence', 'dialogue', 'exercise_prompt']}
                                    value={item.context_type}
                                    onChange={(val) => updateItem(idx, 'context_type', val)}
                                  />
                                </Group>
                              </Stack>
                            </Card>
                          ))}
                        </Stack>
                      </ScrollArea>
                    </Tabs.Panel>

                    <Tabs.Panel value="sections" pt="xs">
                      <ScrollArea h={500}>
                        <Stack gap="xs">
                          {staging.lesson?.sections.map((section, idx) => (
                            <Card key={idx} withBorder p="xs">
                              <Text fw={700} size="sm">{section.title}</Text>
                              <Text size="xs" c="dimmed">Type: {section.content.type}</Text>
                              {section.content.type === 'dialogue' && (
                                <Text size="xs">{section.content.lines.length} lines</Text>
                              )}
                              {section.content.type === 'text' && (
                                <Text size="xs">{section.content.paragraphs.length} paragraphs</Text>
                              )}
                            </Card>
                          ))}
                        </Stack>
                      </ScrollArea>
                    </Tabs.Panel>

                    <Tabs.Panel value="metadata" pt="xs">
                      {staging.lesson && (
                        <Stack gap="sm">
                          <TextInput
                            label="Lesson Title"
                            value={staging.lesson.title}
                            onChange={(e) => setStaging({
                              ...staging,
                              lesson: { ...staging.lesson!, title: e.currentTarget.value }
                            })}
                          />
                          <Textarea
                            label="Description"
                            value={staging.lesson.description}
                            onChange={(e) => setStaging({
                              ...staging,
                              lesson: { ...staging.lesson!, description: e.currentTarget.value }
                            })}
                          />
                          <Group grow>
                            <Select
                              label="Level"
                              data={['A1', 'A2', 'B1', 'B2']}
                              value={staging.lesson.level}
                              onChange={(val) => setStaging({
                                ...staging,
                                lesson: { ...staging.lesson!, level: val || 'A1' }
                              })}
                            />
                            <TextInput
                              label="Order Index"
                              type="number"
                              value={staging.lesson.order_index}
                              onChange={(e) => setStaging({
                                ...staging,
                                lesson: { ...staging.lesson!, order_index: parseInt(e.currentTarget.value, 10) }
                              })}
                            />
                          </Group>
                        </Stack>
                      )}
                    </Tabs.Panel>
                  </Tabs>
                </Card>
              </Grid.Col>
            </Grid>
          </>
        )}
      </Stack>
    </Container>
  )
}

export default App
