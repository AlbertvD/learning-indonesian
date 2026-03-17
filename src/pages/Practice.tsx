// src/pages/Practice.tsx
import { useEffect, useState, useRef } from 'react'
import {
  Container,
  Title,
  Text,
  TextInput,
  Button,
  Stack,
  Center,
  Loader,
  Paper,
  Group,
  Badge,
} from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { supabase } from '@/lib/supabase'
import { logError } from '@/lib/logger'

interface VocabItem {
  id: string
  indonesian: string
  english: string
  lesson_id: string
}

export function Practice() {
  const [vocabulary, setVocabulary] = useState<VocabItem[]>([])
  const [loading, setLoading] = useState(true)
  const [currentItem, setCurrentItem] = useState<VocabItem | null>(null)
  const [answer, setAnswer] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [isCorrect, setIsCorrect] = useState(false)
  const [correct, setCorrect] = useState(0)
  const [total, setTotal] = useState(0)
  const usedIndicesRef = useRef<Set<number>>(new Set())

  useEffect(() => {
    async function fetchVocabulary() {
      try {
        const { data, error } = await supabase
          .schema('indonesian')
          .from('vocabulary')
          .select('id, indonesian, english, lesson_id')
          .limit(100)
        if (error) throw error
        setVocabulary(data ?? [])
        if (data && data.length > 0) {
          const idx = Math.floor(Math.random() * data.length)
          usedIndicesRef.current.add(idx)
          setCurrentItem(data[idx])
        }
      } catch (err) {
        logError({ page: 'practice', action: 'fetchVocabulary', error: err })
        notifications.show({
          color: 'red',
          title: 'Failed to load vocabulary',
          message: 'Something went wrong. Please try again.',
        })
      } finally {
        setLoading(false)
      }
    }
    fetchVocabulary()
  }, [])

  function pickNextItem(vocab: VocabItem[]) {
    if (vocab.length === 0) return
    // Reset used indices if all have been used
    if (usedIndicesRef.current.size >= vocab.length) {
      usedIndicesRef.current.clear()
    }
    let idx: number
    do {
      idx = Math.floor(Math.random() * vocab.length)
    } while (usedIndicesRef.current.has(idx) && usedIndicesRef.current.size < vocab.length)
    usedIndicesRef.current.add(idx)
    setCurrentItem(vocab[idx])
  }

  function handleSubmit() {
    if (!currentItem || !answer.trim()) return
    const correct_answer = currentItem.english.trim().toLowerCase()
    const user_answer = answer.trim().toLowerCase()
    const correct = user_answer === correct_answer
    setIsCorrect(correct)
    setSubmitted(true)
    setTotal((t) => t + 1)
    if (correct) setCorrect((c) => c + 1)
  }

  function handleNext() {
    setAnswer('')
    setSubmitted(false)
    setIsCorrect(false)
    pickNextItem(vocabulary)
  }

  if (loading) {
    return (
      <Center h="50vh">
        <Loader size="xl" />
      </Center>
    )
  }

  if (vocabulary.length === 0) {
    return (
      <Container size="sm">
        <Center h="50vh">
          <Stack align="center" gap="md">
            <Title order={2}>No vocabulary available yet</Title>
            <Text c="dimmed">Check back after lessons have been added.</Text>
          </Stack>
        </Center>
      </Container>
    )
  }

  return (
    <Container size="sm">
      <Stack gap="xl" my="xl">
        <Group justify="space-between" align="center">
          <Title order={2}>Vocabulary Practice</Title>
          {total > 0 && (
            <Badge color="blue" size="lg">
              {correct} / {total} correct
            </Badge>
          )}
        </Group>

        {currentItem && (
          <Paper withBorder p="xl" radius="md" shadow="sm">
            <Stack gap="lg">
              <Stack gap="xs" align="center">
                <Text size="sm" c="dimmed" tt="uppercase" fw={500}>
                  Translate to English
                </Text>
                <Title order={2}>{currentItem.indonesian}</Title>
              </Stack>

              <TextInput
                label="Your answer"
                placeholder="Type the English translation..."
                value={answer}
                onChange={(e) => setAnswer(e.currentTarget.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !submitted) handleSubmit()
                  if (e.key === 'Enter' && submitted) handleNext()
                }}
                disabled={submitted}
                error={
                  submitted && !isCorrect
                    ? `Correct answer: ${currentItem.english}`
                    : undefined
                }
                styles={
                  submitted && isCorrect
                    ? { input: { borderColor: 'var(--mantine-color-green-6)', color: 'var(--mantine-color-green-7)' } }
                    : undefined
                }
              />

              {submitted && (
                <Text
                  fw={600}
                  c={isCorrect ? 'green' : 'red'}
                  ta="center"
                >
                  {isCorrect ? 'Correct!' : `Incorrect — the answer is: ${currentItem.english}`}
                </Text>
              )}

              <Group justify="center">
                {!submitted ? (
                  <Button onClick={handleSubmit} disabled={!answer.trim()}>
                    Check Answer
                  </Button>
                ) : (
                  <Button onClick={handleNext}>Next</Button>
                )}
              </Group>
            </Stack>
          </Paper>
        )}
      </Stack>
    </Container>
  )
}
