// src/pages/Dashboard.tsx
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Stack,
  Text,
  Button,
  Group,
} from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { IconFlame, IconAlertTriangle, IconBook } from '@tabler/icons-react'
import {
  PageContainer,
  PageBody,
  PageHeader,
  ListCard,
  ActionCard,
  LoadingState,
} from '@/components/page/primitives'
import { RecencyBadge } from '@/components/dashboard/RecencyBadge'
import { lessonService } from '@/services/lessonService'
import { getLessonsBasic } from '@/lib/lessons'
import { learnerStateService } from '@/services/learnerStateService'
import { learnerProgressService } from '@/services/learnerProgressService'
import { useAuthStore } from '@/stores/authStore'
import { useT } from '@/hooks/useT'
import { logError } from '@/lib/logger'

export function Dashboard() {
  const T = useT()
  const navigate = useNavigate()
  const user = useAuthStore((state) => state.user)
  const profile = useAuthStore((state) => state.profile)

  const [loading, setLoading] = useState(true)
  const [continueUrl, setContinueUrl] = useState('/lessons')
  const [currentStreak, setCurrentStreak] = useState(0)
  const [lapsingCount, setLapsingCount] = useState(0)
  const [lastPracticeAgeDays, setLastPracticeAgeDays] = useState<number | null>(null)

  useEffect(() => {
    async function fetchData() {
      if (!user) return
      try {
        const [lapsingResult, lessonProgress, lessons] = await Promise.all([
          learnerStateService.getLapsingItems(user.id),
          lessonService.getUserLessonProgress(user.id),
          getLessonsBasic(),
        ])
        setLapsingCount(lapsingResult.count)

        const inProgress = lessons.find((l) => {
          const p = lessonProgress.find((lp) => lp.lesson_id === l.id)
          return p && p.completed_at == null && p.sections_completed.length > 0
        })
        const notStarted = lessons.find((l) =>
          !lessonProgress.find((lp) => lp.lesson_id === l.id)
        )
        const target = inProgress ?? notStarted
        if (target) {
          setContinueUrl(`/lesson/${target.id}`)
        }

        const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone
        const [streak, ageDays] = await Promise.all([
          learnerProgressService.getCurrentStreakDays({
            userId: user.id,
            timezone: userTimezone,
          }),
          learnerProgressService.getLastPracticeAgeDays({
            userId: user.id,
            timezone: userTimezone,
          }),
        ])
        setCurrentStreak(streak)
        setLastPracticeAgeDays(ageDays)
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
      <PageContainer size="lg">
        <PageBody>
          <LoadingState />
        </PageBody>
      </PageContainer>
    )
  }

  const name = profile?.fullName?.split(' ')[0] ?? profile?.email ?? 'User'

  return (
    <PageContainer size="lg">
      <PageBody>
        <PageHeader
          title={`${T.dashboard.welcomeBack}, ${name}`}
          action={(
            <Group gap="xs">
              <IconFlame size={18} color="orange" />
              <Text size="sm" fw={600}>{currentStreak} {T.dashboard.daysInARow}</Text>
            </Group>
          )}
        />

        <Stack gap="md">
          <RecencyBadge ageDays={lastPracticeAgeDays} />

          {lapsingCount > 0 && (
            <ActionCard
              tone="danger"
              icon={<IconAlertTriangle size={18} />}
              title={T.dashboard.rescueTitle.replace('{count}', `${lapsingCount}`)}
              focus={`${lapsingCount} ${T.dashboard.lapsesLabel}`}
              reason={T.dashboard.rescueSubtitle}
              to="/session?mode=standard"
            />
          )}

          <ListCard
            to={continueUrl}
            icon={<IconBook size={18} color="var(--accent-primary)" />}
            title={T.dashboard.continueLesson}
            subtitle={T.dashboard.nextLesson}
          />

          <Button onClick={() => navigate('/session')} size="lg" fullWidth>
            {T.dashboard.startTodaysSessionMinimal}
          </Button>
        </Stack>
      </PageBody>
    </PageContainer>
  )
}
