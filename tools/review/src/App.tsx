import { useState, useEffect } from 'react'
import {
  Container,
  Stack,
  Select,
  Card,
  Text,
  Group,
  Button,
  Badge,
  Box,
  Textarea,
  Loader,
  Center,
  Alert,
} from '@mantine/core'
import { IconAlertCircle, IconCheck, IconX } from '@tabler/icons-react'
import axios from 'axios'
import './App.css'

interface GeneratedExerciseCandidate {
  exercise_type: string
  page_reference: number
  grammar_pattern_id?: string
  source_text: string
  prompt_text: string
  answer_key: string[]
  explanation: string
  target_pattern?: string
  review_status: string
  created_at: string
  reviewer_notes?: string
}

interface Page {
  page_number: number
  raw_text: string
}

function App() {
  const [lessons, setLessons] = useState<number[]>([])
  const [selectedLesson, setSelectedLesson] = useState<string | null>(null)
  const [candidates, setCandidates] = useState<GeneratedExerciseCandidate[]>([])
  const [pages, setPages] = useState<Page[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [reviewerNotes, setReviewerNotes] = useState<Record<number, string>>({})

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

  // Load candidates and pages when lesson changes
  useEffect(() => {
    if (!selectedLesson) return

    const fetchData = async () => {
      setLoading(true)
      setError(null)
      try {
        const [candidatesRes, pagesRes] = await Promise.all([
          axios.get(`/api/candidates/${selectedLesson}`),
          axios.get(`/api/pages/${selectedLesson}`),
        ])
        setCandidates(candidatesRes.data)
        setPages(pagesRes.data)
        setCurrentIndex(0)
        setReviewerNotes({})
      } catch (err) {
        setError('Failed to load content')
        console.error(err)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [selectedLesson])

  const handleApprove = () => {
    const updated = [...candidates]
    updated[currentIndex].review_status = 'approved'
    updated[currentIndex].reviewer_notes = reviewerNotes[currentIndex] || ''
    setCandidates(updated)
    nextCandidate()
  }

  const handleReject = () => {
    const updated = [...candidates]
    updated[currentIndex].review_status = 'rejected'
    updated[currentIndex].reviewer_notes = reviewerNotes[currentIndex] || ''
    setCandidates(updated)
    nextCandidate()
  }

  const nextCandidate = () => {
    if (currentIndex < candidates.length - 1) {
      setCurrentIndex(currentIndex + 1)
      setReviewerNotes({})
    }
  }

  const prevCandidate = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1)
      setReviewerNotes({})
    }
  }

  const handleSave = async () => {
    if (!selectedLesson) return
    setSaving(true)
    try {
      await axios.post(`/api/candidates/${selectedLesson}/save`, { candidates })
      setError(null)
      alert('Candidates saved successfully!')
    } catch (err) {
      setError('Failed to save candidates')
      console.error(err)
    } finally {
      setSaving(false)
    }
  }

  const candidate = candidates[currentIndex]
  const sourcePage = candidate ? pages.find(p => p.page_number === candidate.page_reference) : null

  const approvedCount = candidates.filter(c => c.review_status === 'approved').length
  const rejectedCount = candidates.filter(c => c.review_status === 'rejected').length
  const pendingCount = candidates.filter(c => c.review_status === 'pending_review').length

  return (
    <Container size="xl" py="xl">
      <Stack gap="lg">
        <div>
          <h1>Exercise Candidate Review</h1>
          <Text c="dimmed">Review and approve exercise candidates from textbook extractions</Text>
        </div>

        {error && (
          <Alert icon={<IconAlertCircle size={16} />} color="red" title="Error">
            {error}
          </Alert>
        )}

        <Select
          label="Select Lesson"
          placeholder="Choose a lesson"
          data={lessons.map(l => ({ value: l.toString(), label: `Lesson ${l}` }))}
          value={selectedLesson}
          onChange={setSelectedLesson}
        />

        {selectedLesson && (
          <>
            <Card withBorder>
              <Card.Section withBorder inheritPadding py="xs">
                <Group justify="space-between">
                  <div>
                    <Text fw={500}>Progress: {currentIndex + 1} of {candidates.length}</Text>
                    <Group gap="xs" mt="xs">
                      <Badge color="blue">Pending: {pendingCount}</Badge>
                      <Badge color="green">Approved: {approvedCount}</Badge>
                      <Badge color="red">Rejected: {rejectedCount}</Badge>
                    </Group>
                  </div>
                  <Button onClick={handleSave} loading={saving} disabled={candidates.length === 0}>
                    Save All Changes
                  </Button>
                </Group>
              </Card.Section>

              {loading ? (
                <Center py="xl">
                  <Loader />
                </Center>
              ) : candidates.length === 0 ? (
                <Center py="xl">
                  <Text c="dimmed">No candidates found for this lesson</Text>
                </Center>
              ) : candidate ? (
                <Card.Section inheritPadding py="lg">
                  <Stack gap="lg">
                    {/* Source Page Context */}
                    {sourcePage && (
                      <Box style={{ backgroundColor: '#f5f5f5', padding: '12px', borderRadius: '4px' }}>
                        <Text size="sm" fw={500} mb="xs">
                          Source Page {sourcePage.page_number}:
                        </Text>
                        <Text size="sm" style={{ maxHeight: '150px', overflow: 'auto', whiteSpace: 'pre-wrap' }}>
                          {sourcePage.raw_text.substring(0, 300)}...
                        </Text>
                      </Box>
                    )}

                    {/* Candidate Details */}
                    <div>
                      <Group justify="space-between" mb="md">
                        <div>
                          <Text fw={500}>Exercise Type</Text>
                          <Badge mt="xs">{candidate.exercise_type}</Badge>
                        </div>
                        <div>
                          <Text fw={500}>Status</Text>
                          <Badge
                            mt="xs"
                            color={
                              candidate.review_status === 'approved'
                                ? 'green'
                                : candidate.review_status === 'rejected'
                                  ? 'red'
                                  : 'blue'
                            }
                          >
                            {candidate.review_status}
                          </Badge>
                        </div>
                      </Group>

                      <Stack gap="md">
                        <div>
                          <Text size="sm" fw={500} mb="xs">
                            Source Text
                          </Text>
                          <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>
                            {candidate.source_text}
                          </Text>
                        </div>

                        <div>
                          <Text size="sm" fw={500} mb="xs">
                            Prompt / Instruction
                          </Text>
                          <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>
                            {candidate.prompt_text}
                          </Text>
                        </div>

                        {candidate.target_pattern && (
                          <div>
                            <Text size="sm" fw={500} mb="xs">
                              Target Pattern
                            </Text>
                            <Text size="sm">{candidate.target_pattern}</Text>
                          </div>
                        )}

                        <div>
                          <Text size="sm" fw={500} mb="xs">
                            Answer Key
                          </Text>
                          {candidate.answer_key.map((ans, idx) => (
                            <Text key={idx} size="sm" style={{ whiteSpace: 'pre-wrap' }}>
                              {idx + 1}. {ans}
                            </Text>
                          ))}
                        </div>

                        <div>
                          <Text size="sm" fw={500} mb="xs">
                            Explanation
                          </Text>
                          <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>
                            {candidate.explanation}
                          </Text>
                        </div>

                        <Textarea
                          label="Reviewer Notes (optional)"
                          placeholder="Add any feedback or corrections..."
                          value={reviewerNotes[currentIndex] || ''}
                          onChange={e => setReviewerNotes({ ...reviewerNotes, [currentIndex]: e.currentTarget.value })}
                        />
                      </Stack>
                    </div>

                    {/* Actions */}
                    <Group justify="space-between" mt="lg">
                      <Group>
                        <Button variant="default" onClick={prevCandidate} disabled={currentIndex === 0}>
                          ← Previous
                        </Button>
                        <Button variant="default" onClick={nextCandidate} disabled={currentIndex === candidates.length - 1}>
                          Next →
                        </Button>
                      </Group>

                      <Group>
                        <Button
                          color="red"
                          leftSection={<IconX size={16} />}
                          onClick={handleReject}
                          variant={candidate.review_status === 'rejected' ? 'filled' : 'light'}
                        >
                          Reject
                        </Button>
                        <Button
                          color="green"
                          leftSection={<IconCheck size={16} />}
                          onClick={handleApprove}
                          variant={candidate.review_status === 'approved' ? 'filled' : 'light'}
                        >
                          Approve
                        </Button>
                      </Group>
                    </Group>
                  </Stack>
                </Card.Section>
              ) : null}
            </Card>
          </>
        )}
      </Stack>
    </Container>
  )
}

export default App
