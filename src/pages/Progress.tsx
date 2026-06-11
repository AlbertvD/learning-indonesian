// src/pages/Progress.tsx
import {
  PageContainer,
  PageBody,
  PageHeader,
  LoadingState,
} from '@/components/page/primitives'
import { useProgressData } from '@/hooks/useProgressData'
import { useT } from '@/hooks/useT'
import { useAuthStore } from '@/stores/authStore'
import { PracticeTimeCard } from '@/components/progress/PracticeTimeCard'
import { MasteryFunnelCard } from '@/components/progress/MasteryFunnelCard'
import { GrammarTopicsList } from '@/components/progress/GrammarTopicsList'
import { MemoryHealthHero } from '@/components/progress/MemoryHealthHero'
import { VulnerableItemsList } from '@/components/progress/VulnerableItemsList'
import { ReviewForecastChart } from '@/components/progress/ReviewForecastChart'
import { DetailedMetrics } from '@/components/progress/DetailedMetrics'
import classes from './Progress.module.css'

export function Progress() {
  const data = useProgressData()
  const T = useT()
  const user = useAuthStore((state) => state.user)

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
          title={T.progress.pageTitle}
          subtitle={T.progress.pageSubtitle}
        />

        {user && (
          <section className={classes.section}>
            <PracticeTimeCard
              userId={user.id}
              timezone={Intl.DateTimeFormat().resolvedOptions().timeZone}
            />
          </section>
        )}

        <section className={classes.section}>
          <MemoryHealthHero
            avgRecognitionDays={data.skillStats.avgRecognition}
            avgRecallDays={data.skillStats.avgRecall}
          />
        </section>

        {user && (
          <section className={classes.section}>
            <MasteryFunnelCard userId={user.id} />
          </section>
        )}

        {user && (
          <section className={classes.section}>
            <GrammarTopicsList userId={user.id} />
          </section>
        )}

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
