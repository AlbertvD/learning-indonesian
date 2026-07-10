// src/pages/Progress.tsx
//
// Voortgang — the learner's "reflect" surface, on the Leren/Ontdek hub shape
// (voortgang-hub-redesign, docs/plans/2026-07-09-voortgang-hub-redesign.md): a
// single /progress route, hub-vs-detail switched by `?tab=`. Mobile with no
// (or an unknown) tab shows the hub — five ListCard launchers, each with a
// live-summary subtitle derived from the same readers the detail panels
// already use. A known `?tab=` shows that detail with the shared ProgressNav
// switcher. Desktop always lands on a detail (Woordenschat by default) with
// the persistent switcher — no separate hub screen, exactly like desktop
// /leren lands on Lessen (Lessons.tsx:384-457).
import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useMediaQuery } from '@mantine/hooks'
import { SimpleGrid } from '@mantine/core'
import { IconBook, IconLanguage, IconPuzzle, IconTarget, IconFlame } from '@tabler/icons-react'
import { PageContainer, PageBody, PageHeader, ListCard } from '@/components/page/primitives'
import { useT } from '@/hooks/useT'
import { useAuthStore } from '@/stores/authStore'
import { getMasteryFunnel, type MasteryFunnels } from '@/lib/analytics/mastery/masteryModel'
import { engagement, type PracticeTime } from '@/lib/analytics/engagement'
import { logError } from '@/lib/logger'
import { ProgressNav } from '@/components/nav/ProgressNav'
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

interface HubSummaries {
  vocabUsable: number | null
  grammarUsable: number | null
  morfologieUsable: number | null
  streakDays: number | null
  minutesThisWeek: number | null
}

// One guarded fetch for the hub's five live-summary subtitles: two readers
// (the all-lessons funnel, practice time), each individually caught so one
// failing degrades only its own card's subtitle to "no subtitle" rather than
// losing the hub or surfacing a blocking notification (mirrors the retired
// JouwIndonesischHero's per-reader guard, PR #408).
async function loadHubSummaries(userId: string): Promise<HubSummaries> {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
  const [funnel, practiceTime] = await Promise.all([
    getMasteryFunnel(userId).catch((err) => {
      logError({ page: 'progress', action: 'hubMasteryFunnel', error: err })
      return null as MasteryFunnels | null
    }),
    engagement.practiceTime(userId, tz).catch((err) => {
      logError({ page: 'progress', action: 'hubPracticeTime', error: err })
      return null as PracticeTime | null
    }),
  ])
  return {
    vocabUsable: funnel ? funnel.vocabulary.strengthening + funnel.vocabulary.mastered : null,
    grammarUsable: funnel ? funnel.grammar.strengthening + funnel.grammar.mastered : null,
    morfologieUsable: funnel ? funnel.morphology.strengthening + funnel.morphology.mastered : null,
    streakDays: practiceTime ? practiceTime.streakDays : null,
    minutesThisWeek: practiceTime ? practiceTime.minutesThisWeek : null,
  }
}

export function Progress() {
  const T = useT()
  const user = useAuthStore((state) => state.user)
  const isMobile = useMediaQuery('(max-width: 768px)') ?? false
  const [searchParams] = useSearchParams()
  const param = searchParams.get('tab') as Tab | null
  const tab: Tab | null = param && TABS.includes(param) ? param : null
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone

  // Mobile with no (or unknown) tab is the hub; everything else (desktop
  // always, mobile with a known tab) is a detail.
  const showHub = isMobile && tab === null
  const activeTab: Tab = tab ?? 'woorden'
  const detailTitle: Record<Tab, string> = {
    woorden: T.progress.tabWoordenschat,
    grammar: T.progress.tabGrammar,
    morfologie: T.progress.tabMorphology,
    skills: T.progress.tabSkills,
    time: T.progress.tabTime,
  }

  const [hub, setHub] = useState<HubSummaries | null>(null)
  useEffect(() => {
    if (!user || !showHub) return
    let active = true
    loadHubSummaries(user.id).then((v) => {
      if (active) setHub(v)
    })
    return () => {
      active = false
    }
  }, [user, showHub])

  if (!user) {
    return (
      <PageContainer size="lg">
        <PageBody>
          <PageHeader title={T.progress.pageTitle} />
        </PageBody>
      </PageContainer>
    )
  }

  if (showHub) {
    return (
      <PageContainer size="lg">
        <PageBody>
          <PageHeader title={T.progress.pageTitle} subtitle={T.progress.hubSubtitle} />
          <SimpleGrid cols={{ base: 1 }} spacing="sm" mt="md">
            <ListCard
              feature
              tone="accent"
              to="/progress?tab=woorden"
              icon={<IconBook size={25} stroke={1.7} />}
              title={T.progress.tabWoordenschat}
              subtitle={hub?.vocabUsable != null ? T.progress.hubWoordenschatSummary(hub.vocabUsable) : undefined}
            />
            <ListCard
              feature
              tone="teal"
              to="/progress?tab=grammar"
              icon={<IconLanguage size={25} stroke={1.7} />}
              title={T.progress.tabGrammar}
              subtitle={hub?.grammarUsable != null ? T.progress.hubGrammarSummary(hub.grammarUsable) : undefined}
            />
            <ListCard
              feature
              tone="sage"
              to="/progress?tab=morfologie"
              icon={<IconPuzzle size={25} stroke={1.7} />}
              title={T.progress.tabMorphology}
              subtitle={hub?.morfologieUsable != null ? T.progress.hubMorfologieSummary(hub.morfologieUsable) : undefined}
            />
            <ListCard
              feature
              tone="rail"
              to="/progress?tab=skills"
              icon={<IconTarget size={25} stroke={1.7} />}
              title={T.progress.tabSkills}
              subtitle={T.progress.hubVaardighedenSummary}
            />
            <ListCard
              feature
              tone="gold"
              to="/progress?tab=time"
              icon={<IconFlame size={25} stroke={1.7} />}
              title={T.progress.tabTime}
              subtitle={
                hub?.streakDays != null && hub.minutesThisWeek != null
                  ? T.progress.hubTijdSummary(hub.streakDays, hub.minutesThisWeek)
                  : undefined
              }
            />
          </SimpleGrid>
        </PageBody>
      </PageContainer>
    )
  }

  return (
    <PageContainer size="lg">
      <PageBody>
        {/* Detail: the section title "Jouw leervoortgang" lives on the hub only;
            here the topic name titles the page, above the back/switcher nav. */}
        <ProgressNav />
        <PageHeader title={detailTitle[activeTab]} />
        {/* key re-mounts the active detail so it animates in on every switch */}
        <div key={activeTab} className={classes.view}>
          {activeTab === 'woorden' && (
            <div className={classes.sections}>
              <VocabMasteryPanel userId={user.id} />
              <GrowthCurveCard userId={user.id} bucket="vocabulary" unitLabel={T.progress.unitWords} />
            </div>
          )}
          {activeTab === 'grammar' && (
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
              <GrowthCurveCard userId={user.id} bucket="grammar" unitLabel={T.progress.grammarUnitPatterns} />
            </div>
          )}
          {activeTab === 'morfologie' && (
            <div className={classes.sections}>
              <MasteryFunnelPanel
                userId={user.id}
                kind="morphology"
                unitLabel={T.progress.morphologyUnitAffixes}
              />
              <GrowthCurveCard userId={user.id} bucket="morphology" unitLabel={T.progress.morphologyUnitAffixes} />
            </div>
          )}
          {activeTab === 'skills' && <SkillModeGapsCard userId={user.id} />}
          {activeTab === 'time' && (
            <div className={classes.sections}>
              <TimeComparisonCard userId={user.id} timezone={timezone} />
              <DurabilityCard userId={user.id} timezone={timezone} />
            </div>
          )}
        </div>
      </PageBody>
    </PageContainer>
  )
}
