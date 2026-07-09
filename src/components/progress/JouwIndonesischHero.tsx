// src/components/progress/JouwIndonesischHero.tsx
//
// Voortgang's "felt-progress" hero strip (I1,
// docs/plans/2026-07-09-voortgang-jouw-indonesisch-hero.md Part A) — three
// honest numbers above the tab strip, composed entirely from existing
// read-model calls (no new schema/RPC). Non-blocking: renders nothing until
// the load resolves, so the tab strip below is never held up. Each of the
// three readers is individually guarded with its own `.catch` (mirrors
// Dashboard's `loadTroublesomeUnhooked`/`hasCompletedSession` fallback
// pattern) so one reader failing degrades only its own tile to a neutral "—"
// rather than losing the whole strip or surfacing a blocking red notification.
import { useEffect, useState } from 'react'
import { SectionHeading, StatCard } from '@/components/page/primitives'
import { useT } from '@/hooks/useT'
import { getMasteryFunnel } from '@/lib/analytics/mastery/masteryModel'
import { getCollectionsOverview, type CollectionOverview } from '@/lib/collections'
import { engagement } from '@/lib/analytics/engagement'
import { logError } from '@/lib/logger'
import classes from './JouwIndonesischHero.module.css'

export interface JouwIndonesischHeroProps {
  userId: string
}

interface HeroData {
  /** Words mastered + strengthening across all 2,523 items — never saturates. */
  wordsKnown: number | null
  /** The top-1000 frequency collection's knownWords; null if unreadable/absent. */
  coverageKnown: number | null
  /** The matching collection's totalWords; 1000 fallback (design's documented default). */
  coverageTotal: number
  streakDays: number | null
}

// The kind==='frequency' collection with the largest rankCutoff (the widest
// frequency band the learner has coverage data for — currently top-1000).
function widestFrequencyCollection(collections: CollectionOverview[]): CollectionOverview | null {
  return collections
    .filter((c) => c.kind === 'frequency')
    .reduce<CollectionOverview | null>((best, c) => (
      best === null || (c.rankCutoff ?? 0) > (best.rankCutoff ?? 0) ? c : best
    ), null)
}

async function loadHero(userId: string): Promise<HeroData> {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
  const [funnel, collections, practiceTime] = await Promise.all([
    getMasteryFunnel(userId).catch((err) => {
      logError({ page: 'progress', action: 'heroMasteryFunnel', error: err })
      return null
    }),
    getCollectionsOverview(userId).catch((err) => {
      logError({ page: 'progress', action: 'heroCollectionsOverview', error: err })
      return [] as CollectionOverview[]
    }),
    engagement.practiceTime(userId, tz).catch((err) => {
      logError({ page: 'progress', action: 'heroPracticeTime', error: err })
      return null
    }),
  ])
  const widest = widestFrequencyCollection(collections)
  return {
    wordsKnown: funnel ? funnel.vocabulary.mastered + funnel.vocabulary.strengthening : null,
    coverageKnown: widest ? widest.knownWords : null,
    coverageTotal: widest?.totalWords ?? 1000,
    streakDays: practiceTime ? practiceTime.streakDays : null,
  }
}

export function JouwIndonesischHero({ userId }: JouwIndonesischHeroProps) {
  const T = useT()
  const [data, setData] = useState<HeroData | null>(null)

  useEffect(() => {
    let active = true
    loadHero(userId).then((v) => active && setData(v))
    return () => {
      active = false
    }
  }, [userId])

  if (!data) return null

  const coverageValue = `${data.coverageKnown ?? '—'} / ${data.coverageTotal}`

  return (
    <div className={classes.root}>
      <SectionHeading>{T.progress.heroTitle}</SectionHeading>
      <div className={classes.grid}>
        <StatCard label={T.progress.heroWordsKnownLabel} value={data.wordsKnown ?? '—'} />
        <StatCard label={T.progress.heroCoverageLabel} value={coverageValue} />
        <StatCard label={T.progress.heroStreakLabel} value={data.streakDays ?? '—'} />
      </div>
    </div>
  )
}
