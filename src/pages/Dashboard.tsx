// src/pages/Dashboard.tsx
import { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import {
  Container,
  Center,
  Loader,
} from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { IconBook, IconCards, IconMicrophone, IconChevronRight } from '@tabler/icons-react'
import { cardService } from '@/services/cardService'
import { lessonService } from '@/services/lessonService'
import { useAuthStore } from '@/stores/authStore'
import { useT } from '@/hooks/useT'
import { logError } from '@/lib/logger'
import classes from './Dashboard.module.css'

export function Dashboard() {
  const navigate = useNavigate()
  const T = useT()
  const user = useAuthStore((state) => state.user)
  const profile = useAuthStore((state) => state.profile)

  const [loading, setLoading] = useState(true)
  const [dueCardsCount, setDueCardsCount] = useState(0)
  const [lessonsCompletedCount, setLessonsCompletedCount] = useState(0)

  useEffect(() => {
    async function fetchData() {
      if (!user) return
      try {
        const [dueCards, lessonProgress] = await Promise.all([
          cardService.getDueCards(user.id),
          lessonService.getUserLessonProgress(user.id),
        ])
        setDueCardsCount(dueCards.length)
        const completed = lessonProgress.filter((lp) => lp.completed_at != null)
        setLessonsCompletedCount(completed.length)
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
        <Loader size="xl" color="violet" />
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
        <Link to="/lessons" className={classes.continueCard}>
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

      <div className={classes.actionsSection}>
        <span className={classes.sectionLabel}>{T.dashboard.quickActions}</span>
        <div className={classes.actions}>
          <button className={`${classes.btn} ${classes.btnPrimary}`} onClick={() => navigate('/lessons')}>
            <IconBook size={16} />
            {T.dashboard.continueLearning}
          </button>
          <button className={`${classes.btn} ${classes.btnOutline}`} onClick={() => navigate('/review')}>
            <IconCards size={16} />
            {T.dashboard.reviewCards}
            {dueCardsCount > 0 && (
              <span className={`${classes.badge} ${classes.badgeOrange}`} style={{ marginLeft: 2 }}>
                {dueCardsCount}
              </span>
            )}
          </button>
          <button className={`${classes.btn} ${classes.btnGhost}`} onClick={() => navigate('/podcasts')}>
            <IconMicrophone size={16} />
            {T.dashboard.browsePodcasts}
          </button>
        </div>
      </div>
    </Container>
  )
}
