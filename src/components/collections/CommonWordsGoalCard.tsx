// The Home "goal" face of a frequency band (foundation doc §1/§2): a coverage
// read-out for the headline word-list, linking to the Woordenlijsten checklist
// (on the Lessons page) where it can be toggled. Reads the SAME
// get_collections_overview model as the checklist and the Voortgang coverage view
// — a band is one object with multiple faces, never a second source of truth.
//
// Headline band = the frequency collection with the largest rank_cutoff (the
// biggest ambition, e.g. Top-1000). Renders nothing until a band is seeded.
import { useEffect, useState } from 'react'
import { IconListCheck } from '@tabler/icons-react'
import { ListCard } from '@/components/page/primitives'
import { useAuthStore } from '@/stores/authStore'
import { useT } from '@/hooks/useT'
import { logError } from '@/lib/logger'
import { getCollectionsOverview, type CollectionOverview } from '@/lib/collections'

function headlineBand(collections: CollectionOverview[]): CollectionOverview | null {
  const frequency = collections.filter((c) => c.kind === 'frequency')
  if (frequency.length === 0) return null
  return frequency.reduce((best, c) => ((c.rankCutoff ?? 0) > (best.rankCutoff ?? 0) ? c : best))
}

export function CommonWordsGoalCard() {
  const T = useT()
  const userId = useAuthStore((s) => s.user?.id)
  const [band, setBand] = useState<CollectionOverview | null>(null)

  useEffect(() => {
    if (!userId) return
    let cancelled = false
    getCollectionsOverview(userId)
      .then((rows) => { if (!cancelled) setBand(headlineBand(rows)) })
      .catch((err) => {
        if (cancelled) return
        logError({ page: 'dashboard', action: 'load-collections-goal', error: err })
      })
    return () => { cancelled = true }
  }, [userId])

  if (!band) return null

  const subtitle = band.isActivated
    ? `${band.knownWords}/${band.totalWords} ${T.collections.wordsKnown}`
    : T.collections.goalCta

  return (
    <ListCard
      to="/leren"
      icon={<IconListCheck size={18} color="var(--accent-primary)" />}
      title={T.collections.lists[band.slug]?.name ?? band.name}
      subtitle={subtitle}
    />
  )
}
