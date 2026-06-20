// src/pages/Progress.tsx
//
// Voortgang — the learner's "reflect" surface. Four tabs (minimal scroll on
// mobile): Woordenschat and Grammatica each show the mastery-progression funnel
// (landing = all lessons, filter = per lesson) — vocab and grammar as parallel
// pages, no longer a toggle inside one funnel; Grammatica adds per-pattern detail
// when a lesson is picked. Vaardigheden (skill-mode gaps) and Tijd (week/month)
// stay as their own tabs. Each view animates in on switch.
import { useSearchParams } from 'react-router-dom'
import { PageContainer, PageBody, PageHeader } from '@/components/page/primitives'
import { useT } from '@/hooks/useT'
import { useAuthStore } from '@/stores/authStore'
import { PillSegmented } from '@/components/progress/PillSegmented'
import { MasteryFunnelPanel } from '@/components/progress/MasteryFunnelPanel'
import { StubbornWordsCard } from '@/components/progress/StubbornWordsCard'
import { GrammarPatternList } from '@/components/progress/GrammarPatternList'
import { SkillModeGapsCard } from '@/components/progress/SkillModeGapsCard'
import { TimeComparisonCard } from '@/components/progress/TimeComparisonCard'
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
            <div className={classes.tabs}>
              <PillSegmented
                fullWidth
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
              {tab === 'woorden' && (
                <MasteryFunnelPanel
                  userId={user.id}
                  kind="vocabulary"
                  unitLabel={T.progress.unitWords}
                  footer={() => <StubbornWordsCard userId={user.id} />}
                />
              )}
              {tab === 'grammar' && (
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
              )}
              {tab === 'morfologie' && (
                <MasteryFunnelPanel
                  userId={user.id}
                  kind="morphology"
                  unitLabel={T.progress.morphologyUnitAffixes}
                />
              )}
              {tab === 'skills' && <SkillModeGapsCard userId={user.id} />}
              {tab === 'time' && <TimeComparisonCard userId={user.id} timezone={timezone} />}
            </div>
          </>
        )}
      </PageBody>
    </PageContainer>
  )
}
