// src/pages/Progress.tsx
//
// Voortgang — the learner's "reflect" surface, on two capability/mastery-aligned
// axes (CONTEXT.md → Learner Progress Axes): Practice Time (engagement) and
// Mastery progression (the ladder funnels + weekly movement + skill-mode gaps).
// The legacy FSRS-machinery surfaces (memory-health hero, 5-stage funnel,
// accuracy-by-skill, stability, latency, forecast) were retired in the analytics
// redesign (#206–#212).
import { PageContainer, PageBody, PageHeader } from '@/components/page/primitives'
import { useT } from '@/hooks/useT'
import { useAuthStore } from '@/stores/authStore'
import { PracticeTimeCard } from '@/components/progress/PracticeTimeCard'
import { WeeklyRecapCard } from '@/components/progress/WeeklyRecapCard'
import { MasteryFunnelCard } from '@/components/progress/MasteryFunnelCard'
import { SkillModeGapsCard } from '@/components/progress/SkillModeGapsCard'
import { GrammarTopicsList } from '@/components/progress/GrammarTopicsList'
import classes from './Progress.module.css'

export function Progress() {
  const T = useT()
  const user = useAuthStore((state) => state.user)
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone

  return (
    <PageContainer size="lg">
      <PageBody>
        <PageHeader title={T.progress.pageTitle} subtitle={T.progress.pageSubtitle} />

        {user && (
          <>
            <section className={classes.section}>
              <PracticeTimeCard userId={user.id} timezone={timezone} />
            </section>

            <section className={classes.section}>
              <WeeklyRecapCard userId={user.id} timezone={timezone} />
            </section>

            <section className={classes.section}>
              <MasteryFunnelCard userId={user.id} />
            </section>

            <section className={classes.section}>
              <SkillModeGapsCard userId={user.id} />
            </section>

            <section className={classes.section}>
              <GrammarTopicsList userId={user.id} />
            </section>
          </>
        )}
      </PageBody>
    </PageContainer>
  )
}
