// src/pages/Review.tsx
import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Container,
  Center,
  Loader,
} from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { calculateNextReview, type ReviewQuality } from '@/lib/sm2'
import { startSession, endSession } from '@/lib/session'
import { cardService } from '@/services/cardService'
import { useCardStore } from '@/stores/cardStore'
import { useAuthStore } from '@/stores/authStore'
import { logError } from '@/lib/logger'
import type { DueCard } from '@/types/cards'
import classes from './Review.module.css'

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
  }, [user, fetchDueCards])

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
        <Loader size="xl" color="violet" />
      </Center>
    )
  }

  if (dueCards.length === 0) {
    return (
      <Container size="sm" className={classes.review}>
        <div className={classes.doneCard}>
          <div className={classes.doneTitle}>All caught up!</div>
          <div className={classes.doneText}>No cards due for review. Check back later.</div>
          <button className={classes.showBtn} onClick={() => navigate('/cards')}>
            Browse Card Sets
          </button>
        </div>
      </Container>
    )
  }

  if (sessionDone) {
    return (
      <Container size="sm" className={classes.review}>
        <div className={classes.doneCard}>
          <div className={classes.doneTitle}>Session Complete!</div>
          <div className={classes.doneText}>You reviewed {reviewedCount} cards today. Keep it up!</div>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
            <button className={classes.showBtn} onClick={() => navigate('/')}>
              Dashboard
            </button>
            <button className={`${classes.showBtn}`} style={{ background: 'rgba(255,255,255,0.1)', color: 'var(--text-1)', boxShadow: 'none' }} onClick={() => navigate('/cards')}>
              Flashcards
            </button>
          </div>
        </div>
      </Container>
    )
  }

  const card = dueCards[currentIndex]

  return (
    <Container size="sm" className={classes.review}>
      <div className={classes.reviewHeader}>
        <div className={classes.reviewTitle}>Daily Review</div>
        <div className={classes.reviewProgress}>
          {currentIndex + 1} / {dueCards.length}
        </div>
      </div>

      <div className={classes.cardContainer}>
        <div className={`${classes.cardInner} ${showAnswer ? classes.cardFlipped : ''}`}>
          {/* Front */}
          <div className={classes.cardFace}>
            <div className={classes.setName}>{card.anki_cards.card_sets.name}</div>
            <div className={classes.cardText}>{card.anki_cards.front}</div>
            <div className={classes.cardTranslation}>Tap to show answer</div>
          </div>
          {/* Back */}
          <div className={`${classes.cardFace} ${classes.cardBack}`}>
            <div className={classes.setName}>{card.anki_cards.card_sets.name}</div>
            <div className={classes.cardText}>{card.anki_cards.back}</div>
            <div className={classes.cardTranslation}>How well did you know this?</div>
          </div>
        </div>
      </div>

      <div className={classes.actions}>
        {!showAnswer ? (
          <button className={classes.showBtn} onClick={() => setShowAnswer(true)}>
            Show Answer
          </button>
        ) : (
          <div className={classes.ratingGrid}>
            <button className={`${classes.ratingBtn} ${classes.again}`} onClick={() => handleRating('again', card)} disabled={submitting}>
              <div className={classes.ratingLabel}>Again</div>
              <div className={classes.ratingSub}>&lt; 1m</div>
            </button>
            <button className={`${classes.ratingBtn} ${classes.hard}`} onClick={() => handleRating('hard', card)} disabled={submitting}>
              <div className={classes.ratingLabel}>Hard</div>
              <div className={classes.ratingSub}>2d</div>
            </button>
            <button className={`${classes.ratingBtn} ${classes.good}`} onClick={() => handleRating('good', card)} disabled={submitting}>
              <div className={classes.ratingLabel}>Good</div>
              <div className={classes.ratingSub}>4d</div>
            </button>
            <button className={`${classes.ratingBtn} ${classes.easy}`} onClick={() => handleRating('easy', card)} disabled={submitting}>
              <div className={classes.ratingLabel}>Easy</div>
              <div className={classes.ratingSub}>7d</div>
            </button>
          </div>
        )}
      </div>
    </Container>
  )
}
