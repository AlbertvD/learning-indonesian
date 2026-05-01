// src/pages/Progress.tsx
import { useEffect } from 'react'
import {
  PageContainer,
  PageBody,
  PageHeader,
  LoadingState,
} from '@/components/page/primitives'
import { useAuthStore } from '@/stores/authStore'
import { analyticsService } from '@/services/analyticsService'
import { useProgressData } from '@/hooks/useProgressData'
import { MemoryHealthHero } from '@/components/progress/MemoryHealthHero'
import { MasteryFunnel } from '@/components/progress/MasteryFunnel'
import { VulnerableItemsList } from '@/components/progress/VulnerableItemsList'
import { ReviewForecastChart } from '@/components/progress/ReviewForecastChart'
import { DetailedMetrics } from '@/components/progress/DetailedMetrics'
import classes from './Progress.module.css'

export function Progress() {
  const user = useAuthStore((s) => s.user)
  const data = useProgressData()

  useEffect(() => {
    if (user && data.weeklyGoals && data.weeklyGoals.length > 0) {
      data.weeklyGoals.forEach((goal) => {
        analyticsService.trackGoalViewed(user.id, goal.id, goal.goal_type)
      })
    }
  }, [user, data.weeklyGoals])

  if (data.wave1Loading) {
    return (
      <PageContainer size="lg">
        <PageBody>
          <LoadingState />
        </PageBody>
      </PageContainer>
    )
  }

  return (
    <PageContainer size="lg">
      <PageBody>
        <PageHeader
          title="Geheugenoverzicht"
          subtitle="Jouw leervoortgang en geheugengezondheid"
        />

        <section className={classes.section}>
          <MemoryHealthHero
            avgRecognitionDays={data.skillStats.avgRecognition}
            avgRecallDays={data.skillStats.avgRecall}
          />
        </section>

        <section className={classes.section}>
          <MasteryFunnel itemsByStage={data.itemsByStage} />
        </section>

        <section className={classes.section}>
          <VulnerableItemsList
            items={data.vulnerableItems}
            loading={data.wave2Loading}
          />
        </section>

        <section className={classes.section}>
          <ReviewForecastChart forecast={data.forecast} />
        </section>

        <section className={classes.section}>
          <DetailedMetrics
            avgStability={data.skillStats.avgStability}
            accuracyBySkillType={data.accuracyBySkillType}
            lapsePrevention={data.lapsePrevention}
            avgLatencyMs={data.avgLatencyMs}
            wave2Loading={data.wave2Loading}
          />
        </section>
      </PageBody>
    </PageContainer>
  )
}
