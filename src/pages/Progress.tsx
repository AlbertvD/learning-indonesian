// src/pages/Progress.tsx
import { useEffect } from 'react'
import { Container, SimpleGrid, Center, Loader } from '@mantine/core'
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

  useEffect(() => {
    if (user && data.weeklyGoals && data.weeklyGoals.length > 0) {
      data.weeklyGoals.forEach((goal) => {
        analyticsService.trackGoalViewed(user.id, goal.id, goal.goal_type)
      })
    }
  }, [user, data.weeklyGoals])

  if (data.wave1Loading) {
    return (
      <Center h="50vh" data-loading="true">
        <Loader size="xl" color="cyan" />
      </Center>
    )
  }

  return (
    <Container size="md">
      <div className={classes.page}>

        {/* Page header */}
        <div className={classes.header}>
          <h1 className={classes.headerTitle}>Geheugenoverzicht</h1>
          <p className={classes.headerSub}>Jouw leervoortgang en geheugengezondheid</p>
        </div>

        {/* Section 1 — Memory Health */}
        <section className={classes.section}>
          <MemoryHealthHero
            avgRecognitionDays={data.skillStats.avgRecognition}
            avgRecallDays={data.skillStats.avgRecall}
          />
        </section>

        {/* Section 2 — Mastery Pipeline */}
        <section className={classes.section}>
          <MasteryFunnel itemsByStage={data.itemsByStage} />
        </section>

        {/* Section 3 — Vulnerable Words */}
        <section className={classes.section}>
          <VulnerableItemsList
            items={data.vulnerableItems}
            loading={data.wave2Loading}
          />
        </section>

        {/* Section 4 — Forecast + Goals (two-column) */}
        <section className={classes.section}>
          <div className="section-label">Plannen &amp; Doelen</div>
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
            <ReviewForecastChart forecast={data.forecast} />
            <WeeklyGoalsList goals={data.weeklyGoals} loading={data.wave2Loading} />
          </SimpleGrid>
        </section>

        {/* Section 5 — Detail Stats */}
        <section className={classes.section}>
          <DetailedMetrics
            avgStability={data.skillStats.avgStability}
            accuracyBySkillType={data.accuracyBySkillType}
            lapsePrevention={data.lapsePrevention}
            avgLatencyMs={data.avgLatencyMs}
            wave2Loading={data.wave2Loading}
          />
        </section>

      </div>
    </Container>
  )
}
