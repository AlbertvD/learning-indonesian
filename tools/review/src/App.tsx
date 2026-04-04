import { useState, useEffect } from 'react'
import {
  Stack,
  Select,
  Grid,
  Card,
  Text,
  Group,
  Button,
  Loader,
  Center,
  Alert,
  ScrollArea,
  Title,
  ActionIcon,
} from '@mantine/core'
import { notifications } from '@mantine/notifications'
import {
  IconAlertCircle,
  IconDeviceFloppy,
  IconChevronLeft,
  IconChevronRight,
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


function App() {
  const [lessons, setLessons] = useState<number[]>([])
  const [selectedLesson, setSelectedLesson] = useState<string | null>(null)
  const [pages, setPages] = useState<Page[]>([])
  const [currentPageIndex, setCurrentPageIndex] = useState(0)
  const [ocrText, setOcrText] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // Load lessons on mount
  useEffect(() => {
    const fetchLessons = async () => {
      try {
        const res = await axios.get('/api/lessons')
        setLessons(res.data)
      } catch {
        const message = 'Failed to load available lessons. Please check the server is running.'
        setError(message)
        notifications.show({
          color: 'red',
          title: 'Failed to load lessons',
          message,
        })
      }
    }
    fetchLessons()
  }, [])

  // Auto-select if only one lesson
  useEffect(() => {
    if (lessons.length === 1 && !selectedLesson) {
      setSelectedLesson(lessons[0].toString())
    }
  }, [lessons, selectedLesson])

  // Load pages when lesson changes (Phase 1: OCR validation only)
  useEffect(() => {
    if (!selectedLesson) return

    const fetchData = async () => {
      setLoading(true)
      setError(null)
      try {
        const pagesRes = await axios.get(`/api/pages/${selectedLesson}`)
        setPages(pagesRes.data)
        setCurrentPageIndex(0)
        if (pagesRes.data.length > 0) {
          setOcrText(pagesRes.data[0].ocr_text)
        }
      } catch {
        const message = 'Failed to load lesson content. Please check the server is running.'
        setError(message)
        notifications.show({
          color: 'red',
          title: 'Failed to load content',
          message,
        })
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

  const handleSaveOcr = async () => {
    if (!selectedLesson || pages.length === 0) return
    const pageNum = pages[currentPageIndex].page_number
    setSaving(true)
    try {
      await axios.post(`/api/pages/${selectedLesson}/${pageNum}`, { text: ocrText })

      // Update local pages state
      const updatedPages = [...pages]
      updatedPages[currentPageIndex].ocr_text = ocrText
      setPages(updatedPages)

      notifications.show({
        color: 'green',
        title: 'Page saved ✓',
        message: `Page ${currentPageIndex + 1} saved. Use arrows to go to next page.`,
      })
    } catch {
      const message = 'Failed to save OCR text. Please check the server is running.'
      setError(message)
      notifications.show({
        color: 'red',
        title: 'Failed to save OCR',
        message,
      })
    } finally {
      setSaving(false)
    }
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
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Stack gap="md" style={{ flex: 0, padding: '1rem' }}>
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
              <Text size="sm" c="dimmed">Phase 1: Validate OCR Text — Compare image with text, fix any errors, save each page</Text>
            </Group>
          )}
        </Group>

      </Stack>

      {!selectedLesson ? (
        <Center style={{ flex: 1 }}>
          <Text c="dimmed" size="lg">Please select a lesson to begin review</Text>
        </Center>
      ) : (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: '0 1rem 1rem 1rem' }}>
          {error && (
            <Alert icon={<IconAlertCircle size={16} />} color="red" title="Error" withCloseButton onClose={() => setError(null)} mb="md">
              {error}
            </Alert>
          )}

          <Card withBorder p="xs" mb="md">
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

          <Grid gutter="md" style={{ flex: 1, minHeight: 0 }}>
              {/* Left Panel: Image - 50% */}
              <Grid.Col span={6} style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                <Card withBorder p={0} style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                  <Card.Section withBorder inheritPadding py="xs" style={{ flex: 0 }}>
                    <Text fw={500} size="sm">Page Image</Text>
                  </Card.Section>
                  <ScrollArea style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
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

              {/* Middle Panel: OCR Text - 50% */}
              <Grid.Col span={6} style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                <Card withBorder p={0} style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
                  <Card.Section withBorder inheritPadding py="xs" style={{ flex: 0 }}>
                    <Group justify="space-between">
                      <Text fw={500} size="sm">OCR Text (Verify & Correct)</Text>
                      <Button size="compact-xs" leftSection={<IconDeviceFloppy size={14} />} onClick={() => handleSaveOcr()} loading={saving}>Save</Button>
                    </Group>
                  </Card.Section>
                  <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', width: '100%' }}>
                    <textarea
                      value={ocrText}
                      onChange={(e) => setOcrText(e.currentTarget.value)}
                      placeholder="Compare with the image on the left. Fix any OCR errors. Then Save and move to the next page."
                      style={{ flex: 1, minHeight: 0, width: '100%', fontFamily: 'monospace', fontSize: '12px', lineHeight: '1.6', padding: '8px', border: 'none', resize: 'none', boxSizing: 'border-box' }}
                    />
                  </div>
                </Card>
              </Grid.Col>
            </Grid>
        </div>
      )}

    </div>
  )
}

export default App
