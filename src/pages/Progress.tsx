// src/pages/Progress.tsx
//
// Voortgang — the learner's "reflect" surface, on two capability/mastery-aligned
// axes (CONTEXT.md → Learner Progress Axes). A tabbed layout (minimal scroll on
// mobile): Voortgang (the journey funnel, vocab/grammar filter) · Vaardigheden
// (skill-mode gaps) · Tijd (week/month comparison) · Grammatica (named topics).
// Each view animates in on switch.
import { useSearchParams } from 'react-router-dom'
import { PageContainer, PageBody, PageHeader } from '@/components/page/primitives'
import { useT } from '@/hooks/useT'
import { useAuthStore } from '@/stores/authStore'
import { PillSegmented } from '@/components/progress/PillSegmented'
import { MasteryFunnelCard } from '@/components/progress/MasteryFunnelCard'
import { SkillModeGapsCard } from '@/components/progress/SkillModeGapsCard'
import { TimeComparisonCard } from '@/components/progress/TimeComparisonCard'
import { GrammarTopicsList } from '@/components/progress/GrammarTopicsList'
import classes from './Progress.module.css'

type Tab = 'funnel' | 'skills' | 'time' | 'grammar'
const TABS: Tab[] = ['funnel', 'skills', 'time', 'grammar']

export function Progress() {
  const T = useT()
  const user = useAuthStore((state) => state.user)
  // Tab is URL-addressable (`/progress?tab=time`) so the home cells can deep-link
  // straight to the matching sub-page (e.g. the "min deze week" cell → Tijd).
  const [searchParams, setSearchParams] = useSearchParams()
  const param = searchParams.get('tab') as Tab | null
  const tab: Tab = param && TABS.includes(param) ? param : 'funnel'
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
                  { value: 'funnel', label: T.progress.tabFunnel },
                  { value: 'skills', label: T.progress.tabSkills },
                  { value: 'time', label: T.progress.tabTime },
                  { value: 'grammar', label: T.progress.tabGrammar },
                ]}
              />
            </div>

            {/* key re-mounts the active view so it animates in on every switch */}
            <div key={tab} className={classes.view}>
              {tab === 'funnel' && <MasteryFunnelCard userId={user.id} />}
              {tab === 'skills' && <SkillModeGapsCard userId={user.id} />}
              {tab === 'time' && <TimeComparisonCard userId={user.id} timezone={timezone} />}
              {tab === 'grammar' && <GrammarTopicsList userId={user.id} />}
            </div>
          </>
        )}
      </PageBody>
    </PageContainer>
  )
}
