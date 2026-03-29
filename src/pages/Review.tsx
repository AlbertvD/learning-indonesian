// src/pages/Review.tsx
import { useEffect, useState, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  Container,
  Center,
  Loader,
} from '@mantine/core'
import { IconChevronLeft } from '@tabler/icons-react'
import { notifications } from '@mantine/notifications'
import { calculateNextReview, type ReviewQuality } from '@/lib/sm2'
import { startSession, endSession } from '@/lib/session'
import { cardService } from '@/services/cardService'
import { useCardStore } from '@/stores/cardStore'
import { useAuthStore } from '@/stores/authStore'
import { logError } from '@/lib/logger'
import { useT } from '@/hooks/useT'
import type { DueCard, ReviewDirection } from '@/types/cards'
import classes from './Review.module.css'

export function Review() {
  const navigate = useNavigate()
  const location = useLocation()
  const T = useT()
  const backUrl = (location.state as { from?: string } | null)?.from ?? '/sets'
  const user = useAuthStore((state) => state.user)
  const { dueCards, fetchDueCards } = useCardStore()

  const [direction, setDirection] = useState<ReviewDirection>('forward')
  const [loading, setLoading] = useState(true)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [showAnswer, setShowAnswer] = useState(false)
  const [reviewedCount, setReviewedCount] = useState(0)
  const [sessionDone, setSessionDone] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const sessionIdRef = useRef<string | null>(null)
  const reverseInitializedRef = useRef(false)

  // Session tracking — runs once
  useEffect(() => {
    if (!user) return
    startSession(user.id, 'review')
      .then((sid) => { sessionIdRef.current = sid })
      .catch((err) => logError({ page: 'review', action: 'startSession', error: err }))

    return () => {
      if (sessionIdRef.current) {
        endSession(sessionIdRef.current).catch((err) =>
          logError({ page: 'review', action: 'endSession', error: err })
        )
      }
    }
  }, [user])

  // Fetch due cards — re-runs when direction changes
  useEffect(() => {
    async function fetchCards() {
      if (!user) return
      setLoading(true)
      try {
        await fetchDueCards(user.id, direction)
      } catch (err) {
        logError({ page: 'review', action: 'init', error: err })
        notifications.show({
          color: 'red',
          title: T.common.error,
          message: T.common.somethingWentWrong,
        })
      } finally {
        setLoading(false)
      }
    }
    fetchCards()
  }, [user, direction, fetchDueCards, T.common.error, T.common.somethingWentWrong])

  const handleDirectionChange = async (newDirection: ReviewDirection) => {
    if (newDirection === direction) return
    if (newDirection === 'reverse' && !reverseInitializedRef.current && user) {
      try {
        const cardIds = dueCards.map(c => c.card_id)
        if (cardIds.length > 0) {
          await cardService.initializeCardReviews(cardIds, user.id, 'reverse')
        }
        reverseInitializedRef.current = true
      } catch (err) {
        logError({ page: 'review', action: 'initReverse', error: err })
      }
    }
    setDirection(newDirection)
    setCurrentIndex(0)
    setShowAnswer(false)
    setReviewedCount(0)
    setSessionDone(false)
  }

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
      await cardService.updateCardReview(card.card_id, user.id, direction, {
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
        title: T.common.error,
        message: T.common.somethingWentWrong,
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

  const directionToggle = (
    <div className={classes.reviewSubnav}>
      <button className={classes.backBtn} onClick={() => navigate(backUrl)}>
        <IconChevronLeft size={15} />
        {T.sets.title}
      </button>
      <div className={classes.directionToggle}>
        <button
          className={`${classes.dirBtn} ${direction === 'forward' ? classes.dirBtnActive : ''}`}
          onClick={() => handleDirectionChange('forward')}
        >
          {T.review.forward}
        </button>
        <button
          className={`${classes.dirBtn} ${direction === 'reverse' ? classes.dirBtnActive : ''}`}
          onClick={() => handleDirectionChange('reverse')}
        >
          {T.review.reverse}
        </button>
      </div>
    </div>
  )

  if (dueCards.length === 0) {
    return (
      <Container size="sm" className={classes.review}>
        {directionToggle}
        <div className={classes.doneCard}>
          <div className={classes.doneTitle}>{T.review.allCaughtUp}</div>
          <div className={classes.doneText}>{T.review.noCardsDue}</div>
          <button className={classes.showBtn} onClick={() => navigate('/cards')}>
            {T.review.browseCardSets}
          </button>
        </div>
      </Container>
    )
  }

  if (sessionDone) {
    return (
      <Container size="sm" className={classes.review}>
        {directionToggle}
        <div className={classes.doneCard}>
          <div className={classes.doneTitle}>{T.review.sessionComplete}</div>
          <div className={classes.doneText}>{T.review.sessionCompleteMsg(reviewedCount)}</div>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
            <button className={classes.showBtn} onClick={() => navigate('/')}>
              {T.review.dashboard}
            </button>
            <button className={`${classes.showBtn}`} style={{ background: 'rgba(255,255,255,0.1)', color: 'var(--text-1)', boxShadow: 'none' }} onClick={() => navigate('/cards')}>
              {T.review.flashcards}
            </button>
          </div>
        </div>
      </Container>
    )
  }

  const card = dueCards[currentIndex]
  const question = direction === 'forward'
    ? card.anki_cards.front.replace(/\s*\([^)]*\)\s*$/, '')
    : card.anki_cards.back
  const answer = direction === 'forward'
    ? card.anki_cards.back
    : card.anki_cards.front.replace(/\s*\([^)]*\)\s*$/, '')

  return (
    <Container size="sm" className={classes.review}>
      {directionToggle}
      <div className={classes.reviewHeader}>
        <div className={classes.reviewTitle}>{T.review.dailyReview}</div>
        <div className={classes.reviewProgress}>
          {currentIndex + 1} / {dueCards.length}
        </div>
      </div>

      <div className={classes.cardContainer}>
        <div key={currentIndex} className={`${classes.cardInner} ${showAnswer ? classes.cardFlipped : ''}`}>
          {/* Front */}
          <div className={classes.cardFace}>
            <div className={classes.setName}>{card.anki_cards.card_sets.name.replace(/\s*\([^)]*\)/g, '')}</div>
            <div className={classes.cardText}>{question}</div>
            <div className={classes.cardTranslation}>{T.review.tapToShowAnswer}</div>
          </div>
          {/* Back */}
          <div className={`${classes.cardFace} ${classes.cardBack}`}>
            <div className={classes.setName}>{card.anki_cards.card_sets.name.replace(/\s*\([^)]*\)/g, '')}</div>
            <div className={classes.cardText}>{answer}</div>
            <div className={classes.cardTranslation}>{T.review.howWellDidYouKnow}</div>
          </div>
        </div>
      </div>

      <div className={classes.actions}>
        {!showAnswer ? (
          <button className={classes.showBtn} onClick={() => setShowAnswer(true)}>
            {T.review.showAnswer}
          </button>
        ) : (
          <div className={classes.ratingGrid}>
            <button className={`${classes.ratingBtn} ${classes.again}`} onClick={() => handleRating('again', card)} disabled={submitting}>
              <div className={classes.ratingLabel}>{T.review.again}</div>
              <div className={classes.ratingSub}>&lt; 1m</div>
            </button>
            <button className={`${classes.ratingBtn} ${classes.hard}`} onClick={() => handleRating('hard', card)} disabled={submitting}>
              <div className={classes.ratingLabel}>{T.review.hard}</div>
              <div className={classes.ratingSub}>2d</div>
            </button>
            <button className={`${classes.ratingBtn} ${classes.good}`} onClick={() => handleRating('good', card)} disabled={submitting}>
              <div className={classes.ratingLabel}>{T.review.good}</div>
              <div className={classes.ratingSub}>4d</div>
            </button>
            <button className={`${classes.ratingBtn} ${classes.easy}`} onClick={() => handleRating('easy', card)} disabled={submitting}>
              <div className={classes.ratingLabel}>{T.review.easy}</div>
              <div className={classes.ratingSub}>7d</div>
            </button>
          </div>
        )}
      </div>
    </Container>
  )
}
