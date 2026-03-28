// src/pages/Lessons.tsx
import { useEffect, useState } from 'react'
import { Container, Loader, Center } from '@mantine/core'
import { Link } from 'react-router-dom'
import { IconChevronRight, IconBook } from '@tabler/icons-react'
import { lessonService, type Lesson } from '@/services/lessonService'
import { useAuthStore } from '@/stores/authStore'
import { useT } from '@/hooks/useT'
import { logError } from '@/lib/logger'
import { notifications } from '@mantine/notifications'
import classes from './Lessons.module.css'

export function Lessons() {
  const T = useT()
  const [lessons, setLessons] = useState<Lesson[]>([])
  const [progress, setProgress] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const user = useAuthStore((state) => state.user)

  useEffect(() => {
    async function fetchData() {
      if (!user) return
      try {
        const [lessonsData, progressData] = await Promise.all([
          lessonService.getLessons(),
          lessonService.getUserLessonProgress(user.id)
        ])
        setLessons(lessonsData)
        setProgress(progressData)
      } catch (err) {
        logError({ page: 'lessons', action: 'fetchData', error: err })
        notifications.show({ color: 'red', title: T.common.error, message: T.common.somethingWentWrong })
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

  const getCompletionPercentage = (lessonId: string) => {
    const lessonData = lessons.find(l => l.id === lessonId)
    const lessonProgress = progress.find(p => p.lesson_id === lessonId)

    if (!lessonData || !lessonProgress) return 0

    const totalSections = lessonData.lesson_sections?.length || 0
    const completedSections = lessonProgress.sections_completed?.length || 0

    if (totalSections === 0) return 0
    return Math.round((completedSections / totalSections) * 100)
  }

  const isCompleted = (lessonId: string) =>
    progress.some(p => p.lesson_id === lessonId && p.completed_at)

  return (
    <Container size="lg" className={classes.lessons}>
      <div className={classes.header}>
        <div className={classes.displaySm}>{T.nav.lessons}</div>
      </div>

      <div className={classes.lessonGrid}>
        {lessons.map((lesson) => {
          const done = isCompleted(lesson.id)
          const completionPercent = getCompletionPercentage(lesson.id)
          return (
            <Link
              key={lesson.id}
              to={`/lesson/${lesson.id}`}
              className={`${classes.lessonCard} ${done ? classes.done : ''}`}
            >
              <div className={classes.lessonIcon}>
                <IconBook size={18} />
              </div>
              <div className={classes.lessonInfo}>
                <div className={classes.lessonTitle}>{lesson.title.replace(/\s*\([^)]*\)/g, '')}</div>
              </div>
              <span className={classes.lessonArrow}><IconChevronRight size={15} /></span>
              <div className={classes.progressBarWrapper}>
                <div className={classes.progressBarBackground} />
                <div
                  className={classes.progressBarFill}
                  style={{ width: `${completionPercent}%` }}
                />
              </div>
            </Link>
          )
        })}
      </div>
    </Container>
  )
}
