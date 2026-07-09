// src/pages/Progress.tsx
//
// Voortgang — the learner's "reflect" surface. Four tabs (minimal scroll on
// mobile): Woordenschat and Grammatica each show the mastery-progression funnel
// (landing = all lessons, filter = per lesson) — vocab and grammar as parallel
// pages, no longer a toggle inside one funnel; Grammatica adds per-pattern detail
// when a lesson is picked. Vaardigheden (skill-mode gaps) and Tijd (week/month)
// stay as their own tabs. Each view animates in on switch.
//
// The "Jouw Indonesisch" hero strip (I1) sits above the tab strip — always
// visible, independent of which tab is active — three honest numbers composed
// from existing readers (see JouwIndonesischHero for the non-blocking fetch).
import { useSearchParams } from 'react-router-dom'
import { PageContainer, PageBody, PageHeader } from '@/components/page/primitives'
import { useT } from '@/hooks/useT'
import { useAuthStore } from '@/stores/authStore'
import { PillSegmented } from '@/components/progress/PillSegmented'
import { JouwIndonesischHero } from '@/components/progress/JouwIndonesischHero'
import { MasteryFunnelPanel } from '@/components/progress/MasteryFunnelPanel'
import { VocabMasteryPanel } from '@/components/progress/VocabMasteryPanel'
import { GrammarPatternList } from '@/components/progress/GrammarPatternList'
import { SkillModeGapsCard } from '@/components/progress/SkillModeGapsCard'
import { TimeComparisonCard } from '@/components/progress/TimeComparisonCard'
import { GrowthCurveCard } from '@/components/progress/GrowthCurveCard'
import { DurabilityCard } from '@/components/progress/DurabilityCard'
import classes from './Progress.module.css'

type Tab = 'woorden' | 'grammar' | 'morfologie' | 'skills' | 'time'
const TABS: Tab[] = ['woorden', 'grammar', 'morfologie', 'skills', 'time']

export function Progress() {
  const T = useT()
  const user = useAuthStore((state) => state.user)
  // Tab is URL-addressable (`/progress?tab=time`) so the home cells can deep-link
  // straight to the matching sub-page (e.g. the "min deze week" cell → Tijd).
  const [searchParams, setSearchParams] = useSearchParams()
  const param = searchParams.get('tab') as Tab | null
  const tab: Tab = param && TABS.includes(param) ? param : 'woorden'
  const setTab = (value: Tab) => setSearchParams({ tab: value }, { replace: true })
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone

  return (
    <PageContainer size="lg">
      <PageBody>
        <PageHeader title={T.progress.pageTitle} />

        {user && (
          <>
            <JouwIndonesischHero userId={user.id} />

            {/* Scrollable so the strip never clips a tab when labels/count grow
                (the six-tab strip previously hid Groei + Tijd past the pill edge). */}
            <div className={classes.tabs}>
              <PillSegmented
                value={tab}
                onChange={(v) => setTab(v as Tab)}
                data={[
                  { value: 'woorden', label: T.progress.tabWoordenschat },
                  { value: 'grammar', label: T.progress.tabGrammar },
                  { value: 'morfologie', label: T.progress.tabMorphology },
                  { value: 'skills', label: T.progress.tabSkills },
                  { value: 'time', label: T.progress.tabTime },
                ]}
              />
            </div>

            {/* key re-mounts the active view so it animates in on every switch */}
            <div key={tab} className={classes.view}>
              {/* Each content tab pairs its current-state funnel with its
                  growth-over-time curve for the same bucket (the Groei tab was
                  removed; growth now lives where the funnel does). */}
              {tab === 'woorden' && (
                <div className={classes.sections}>
                  <VocabMasteryPanel userId={user.id} />
                  <GrowthCurveCard userId={user.id} bucket="vocabulary" />
                </div>
              )}
              {tab === 'grammar' && (
                <div className={classes.sections}>
                  <MasteryFunnelPanel
                    userId={user.id}
                    kind="grammar"
                    unitLabel={T.progress.grammarUnitPatterns}
                    footer={(scope) =>
                      scope.lessonNumber != null
                        ? <GrammarPatternList userId={user.id} lessonNumber={scope.lessonNumber} />
                        : null
                    }
                  />
                  <GrowthCurveCard userId={user.id} bucket="grammar" />
                </div>
              )}
              {tab === 'morfologie' && (
                <div className={classes.sections}>
                  <MasteryFunnelPanel
                    userId={user.id}
                    kind="morphology"
                    unitLabel={T.progress.morphologyUnitAffixes}
                  />
                  <GrowthCurveCard userId={user.id} bucket="morphology" />
                </div>
              )}
              {tab === 'skills' && <SkillModeGapsCard userId={user.id} />}
              {tab === 'time' && (
                <div className={classes.sections}>
                  <TimeComparisonCard userId={user.id} timezone={timezone} />
                  <DurabilityCard userId={user.id} timezone={timezone} />
                </div>
              )}
            </div>
          </>
        )}
      </PageBody>
    </PageContainer>
  )
}
