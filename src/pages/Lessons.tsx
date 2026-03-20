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
          return (
            <Link
              key={lesson.id}
              to={`/lesson/${lesson.id}`}
              className={`${classes.lessonCard} ${done ? classes.done : ''}`}
            >
              <div className={classes.lessonIcon}>
                <IconBook size={16} />
              </div>
              <div className={classes.lessonInfo}>
                <div className={classes.lessonTitle}>{lesson.title.replace(/\s*\([^)]*\)/g, '')}</div>
              </div>
              <span className={classes.lessonArrow}><IconChevronRight size={15} /></span>
            </Link>
          )
        })}
      </div>
    </Container>
  )
}
