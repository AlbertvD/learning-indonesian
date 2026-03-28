// src/pages/Dashboard.tsx
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Container,
  Center,
  Loader,
} from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { IconBook, IconChevronRight } from '@tabler/icons-react'
import { cardService } from '@/services/cardService'
import { lessonService } from '@/services/lessonService'
import { useAuthStore } from '@/stores/authStore'
import { useT } from '@/hooks/useT'
import { logError } from '@/lib/logger'
import classes from './Dashboard.module.css'

export function Dashboard() {
  const T = useT()
  const user = useAuthStore((state) => state.user)
  const profile = useAuthStore((state) => state.profile)

  const [loading, setLoading] = useState(true)
  const [dueCardsCount, setDueCardsCount] = useState(0)
  const [lessonsCompletedCount, setLessonsCompletedCount] = useState(0)
  const [continueUrl, setContinueUrl] = useState('/lessons')

  useEffect(() => {
    async function fetchData() {
      if (!user) return
      try {
        const [dueCards, lessonProgress, lessons] = await Promise.all([
          cardService.getDueCards(user.id),
          lessonService.getUserLessonProgress(user.id),
          lessonService.getLessonsBasic(),
        ])
        setDueCardsCount(dueCards.length)
        const completed = lessonProgress.filter((lp) => lp.completed_at != null)
        setLessonsCompletedCount(completed.length)

        // Find the lesson to continue: first in-progress (started but not done), else first not started
        const inProgress = lessons.find((l) => {
          const p = lessonProgress.find((lp) => lp.lesson_id === l.id)
          return p && p.completed_at == null && p.sections_completed.length > 0
        })
        const notStarted = lessons.find((l) =>
          !lessonProgress.find((lp) => lp.lesson_id === l.id)
        )
        const target = inProgress ?? notStarted
        if (target) {
          const progress = lessonProgress.find((lp) => lp.lesson_id === target.id)
          const sectionIndex = progress?.sections_completed.length ?? 0
          setContinueUrl(`/lessons/${target.id}?section=${sectionIndex}`)
        }
      } catch (err) {
        logError({ page: 'dashboard', action: 'fetchData', error: err })
        notifications.show({
          color: 'red',
          title: T.common.error,
          message: T.common.somethingWentWrong,
        })
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [user, T.common.error, T.common.somethingWentWrong])

  if (loading) {
    return (
      <Center h="50vh">
        <Loader size="xl" color="cyan" />
      </Center>
    )
  }

  const name = profile?.fullName?.split(' ')[0] ?? profile?.email ?? 'User'

  return (
    <Container size="md" className={classes.dashboard}>
      <div className={classes.welcome}>
        <div className={classes.display}>
          {T.dashboard.welcomeBack}, {name}.
        </div>
      </div>

      <div className={classes.statGrid}>
        <div className={`${classes.statCard} ${classes.statCardPurple}`}>
          <div className={classes.statLabel}>{T.dashboard.lessonsCompleted}</div>
          <div className={classes.statValue}>{lessonsCompletedCount}</div>
          <div className={classes.statSub}>{T.dashboard.ofModuleOne}</div>
        </div>
        <div className={`${classes.statCard} ${classes.statCardOrange}`}>
          <div className={classes.statLabel}>{T.dashboard.cardsDue}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div className={classes.statValue}>{dueCardsCount}</div>
            {dueCardsCount > 0 && (
              <span className={`${classes.badge} ${classes.badgeOrange}`} style={{ marginTop: 10 }}>
                {T.dashboard.reviewNow}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className={classes.continueSection}>
        <span className={classes.sectionLabel}>{T.dashboard.continueWhereYouLeftOff}</span>
        <Link to={continueUrl} className={classes.continueCard}>
          <div className={classes.continueIcon}>
            <IconBook size={20} style={{ opacity: 0.7 }} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className={classes.continueTitle}>{T.dashboard.continueLearning}</div>
            <div className={classes.continueSub}>{lessonsCompletedCount} {T.dashboard.ofModuleOne}</div>
          </div>
          <IconChevronRight size={16} className={classes.continueArrow} />
        </Link>
      </div>

    </Container>
  )
}
