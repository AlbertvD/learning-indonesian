// src/pages/Review.tsx
import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Container,
  Title,
  Text,
  Button,
  Group,
  Stack,
  Card,
  Center,
  Loader,
  Paper,
} from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { calculateNextReview, type ReviewQuality } from '@/lib/sm2'
import { startSession, endSession } from '@/lib/session'
import { cardService } from '@/services/cardService'
import { useCardStore } from '@/stores/cardStore'
import { useAuthStore } from '@/stores/authStore'
import { logError } from '@/lib/logger'
import type { DueCard } from '@/types/cards'

export function Review() {
  const navigate = useNavigate()
  const user = useAuthStore((state) => state.user)
  const { dueCards, fetchDueCards } = useCardStore()

  const [loading, setLoading] = useState(true)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [showAnswer, setShowAnswer] = useState(false)
  const [reviewedCount, setReviewedCount] = useState(0)
  const [sessionDone, setSessionDone] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const sessionIdRef = useRef<string | null>(null)

  useEffect(() => {
    async function init() {
      if (!user) return
      try {
        const [sid] = await Promise.all([
          startSession(user.id, 'review'),
          fetchDueCards(user.id),
        ])
        sessionIdRef.current = sid
      } catch (err) {
        logError({ page: 'review', action: 'init', error: err })
        notifications.show({
          color: 'red',
          title: 'Failed to load review',
          message: 'Something went wrong. Please try again.',
        })
      } finally {
        setLoading(false)
      }
    }
    init()

    return () => {
      if (sessionIdRef.current) {
        endSession(sessionIdRef.current).catch((err) =>
          logError({ page: 'review', action: 'endSession', error: err })
        )
      }
    }
  }, [user])

  async function handleRating(quality: ReviewQuality, card: DueCard) {
    if (!user || submitting) return
    setSubmitting(true)
    try {
      const result = calculateNextReview(
        quality,
        card.easiness_factor,
        card.interval_days,
        card.repetitions
      )
      await cardService.updateCardReview(card.card_id, user.id, {
        easiness_factor: result.easinessFactor,
        interval_days: result.intervalDays,
        repetitions: result.repetitions,
        next_review_at: result.nextReviewAt.toISOString(),
        last_reviewed_at: new Date().toISOString(),
      })
      const nextReviewed = reviewedCount + 1
      setReviewedCount(nextReviewed)
      if (currentIndex + 1 >= dueCards.length) {
        setSessionDone(true)
        if (sessionIdRef.current) {
          await endSession(sessionIdRef.current).catch((err) =>
            logError({ page: 'review', action: 'endSession', error: err })
          )
          sessionIdRef.current = null
        }
      } else {
        setCurrentIndex((i) => i + 1)
        setShowAnswer(false)
      }
    } catch (err) {
      logError({ page: 'review', action: 'submitCard', error: err })
      notifications.show({
        color: 'red',
        title: 'Failed to save review',
        message: 'Something went wrong. Please try again.',
      })
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <Center h="50vh">
        <Loader size="xl" />
      </Center>
    )
  }

  if (dueCards.length === 0) {
    return (
      <Container size="sm">
        <Center h="50vh">
          <Stack align="center" gap="md">
            <Title order={2}>No cards due for review</Title>
            <Text c="dimmed">You're all caught up! Check back later.</Text>
            <Button onClick={() => navigate('/sets')}>Browse Card Sets</Button>
          </Stack>
        </Center>
      </Container>
    )
  }

  if (sessionDone) {
    return (
      <Container size="sm">
        <Center h="50vh">
          <Stack align="center" gap="md">
            <Title order={2}>Session Complete!</Title>
            <Text c="dimmed">
              You reviewed {reviewedCount} card{reviewedCount !== 1 ? 's' : ''}.
            </Text>
            <Group gap="sm">
              <Button onClick={() => navigate('/')}>Back to Dashboard</Button>
              <Button variant="outline" onClick={() => navigate('/sets')}>
                Browse Card Sets
              </Button>
            </Group>
          </Stack>
        </Center>
      </Container>
    )
  }

  const card = dueCards[currentIndex]

  return (
    <Container size="sm">
      <Stack gap="xl" my="xl">
        <Group justify="space-between">
          <Title order={2}>Review</Title>
          <Text c="dimmed">
            {currentIndex + 1} / {dueCards.length}
          </Text>
        </Group>

        <Paper withBorder p="xl" radius="md" shadow="sm" mih={200}>
          <Stack gap="md">
            <Text size="xs" c="dimmed" tt="uppercase" fw={500}>
              {card.anki_cards.card_sets.name}
            </Text>
            <Title order={3} ta="center" py="xl">
              {card.anki_cards.front}
            </Title>

            {showAnswer && (
              <>
                <Card withBorder radius="md" p="md" bg="gray.0">
                  <Text ta="center" size="lg">
                    {card.anki_cards.back}
                  </Text>
                </Card>
              </>
            )}
          </Stack>
        </Paper>

        {!showAnswer ? (
          <Center>
            <Button size="md" onClick={() => setShowAnswer(true)}>
              Show Answer
            </Button>
          </Center>
        ) : (
          <Stack gap="xs">
            <Text size="sm" c="dimmed" ta="center">
              How well did you know this?
            </Text>
            <Group justify="center" gap="sm">
              <Button
                color="red"
                disabled={submitting}
                onClick={() => handleRating('again', card)}
              >
                Again
              </Button>
              <Button
                color="orange"
                disabled={submitting}
                onClick={() => handleRating('hard', card)}
              >
                Hard
              </Button>
              <Button
                color="blue"
                disabled={submitting}
                onClick={() => handleRating('good', card)}
              >
                Good
              </Button>
              <Button
                color="green"
                disabled={submitting}
                onClick={() => handleRating('easy', card)}
              >
                Easy
              </Button>
            </Group>
          </Stack>
        )}
      </Stack>
    </Container>
  )
}
