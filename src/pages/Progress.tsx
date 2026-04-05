// src/pages/Progress.tsx
import { useEffect } from 'react'
import { Container, Title, Stack, Center, Loader } from '@mantine/core'
import { useAuthStore } from '@/stores/authStore'
import { analyticsService } from '@/services/analyticsService'
import { useProgressData } from '@/hooks/useProgressData'
import { MemoryHealthHero } from '@/components/progress/MemoryHealthHero'
import { MasteryFunnel } from '@/components/progress/MasteryFunnel'
import { VulnerableItemsList } from '@/components/progress/VulnerableItemsList'
import { ReviewForecastChart } from '@/components/progress/ReviewForecastChart'
import { WeeklyGoalsList } from '@/components/progress/WeeklyGoalsList'
import { DetailedMetrics } from '@/components/progress/DetailedMetrics'
import classes from './Progress.module.css'

export function Progress() {
  const user = useAuthStore((s) => s.user)
  const data = useProgressData()

  // Track goal views when goals become available
  useEffect(() => {
    if (user && data.weeklyGoals && data.weeklyGoals.length > 0) {
      data.weeklyGoals.forEach((goal) => {
        analyticsService.trackGoalViewed(user.id, goal.id, goal.goal_type)
      })
    }
  }, [user, data.weeklyGoals])

  if (data.wave1Loading) {
    return (
      <Center h="50vh">
        <Loader size="xl" color="cyan" />
      </Center>
    )
  }

  return (
    <Container size="md">
      <Stack gap="xl" my="xl" className={classes.stack}>
        <Title order={2}>Geheugenoverzicht</Title>

        <MemoryHealthHero
          avgRecognitionDays={data.skillStats.avgRecognition}
          avgRecallDays={data.skillStats.avgRecall}
        />

        <MasteryFunnel itemsByStage={data.itemsByStage} />

        <VulnerableItemsList
          items={data.vulnerableItems}
          loading={data.wave2Loading}
        />

        <ReviewForecastChart forecast={data.forecast} />

        <WeeklyGoalsList goals={data.weeklyGoals} loading={data.wave2Loading} />

        <DetailedMetrics
          avgStability={data.skillStats.avgStability}
          accuracyBySkillType={data.accuracyBySkillType}
          lapsePrevention={data.lapsePrevention}
          wave2Loading={data.wave2Loading}
        />
      </Stack>
    </Container>
  )
}
