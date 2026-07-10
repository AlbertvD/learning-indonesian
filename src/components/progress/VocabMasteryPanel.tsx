// src/components/progress/VocabMasteryPanel.tsx
//
// Woordenschat-tab wrapper (slice 2,
// docs/plans/2026-07-09-voortgang-jouw-indonesisch-hero.md Part B) — the only
// caller of MasteryFunnelPanel that owns the at-risk → sheet action.
// MasteryFunnelPanel's at-risk ListCard only triggers (`onAtRiskClick`); this
// wrapper fetches the troublesome-words set and holds the sheet's open-state.
// Unlike Dashboard's Home nudge (which filters to the un-hooked subset via
// `fetchMnemonicsForRefs` for its own count), this keeps the FULL troublesome
// set (at-risk ∪ stubborn) — has-hook dots and edit come for free from
// MnemonicWordChips inside TroublesomeWordsSheet, so no second
// fetchMnemonicsForRefs call is needed here.
import { useEffect, useState } from 'react'
import { useT } from '@/hooks/useT'
import { getTroublesomeWords, type TroublesomeWord } from '@/lib/analytics/mastery/masteryModel'
import { TroublesomeWordsSheet } from '@/components/mnemonics/TroublesomeWordsSheet'
import { logError } from '@/lib/logger'
import { MasteryFunnelPanel } from './MasteryFunnelPanel'
import { StubbornWordsCard } from './StubbornWordsCard'

export interface VocabMasteryPanelProps {
  userId: string
}

// A convenience read (feeds the sheet); failing must not block the funnel
// panel above it — fails silently to an empty set, mirroring Dashboard's
// loadTroublesomeUnhooked.
async function loadTroublesome(userId: string): Promise<TroublesomeWord[]> {
  try {
    return await getTroublesomeWords(userId)
  } catch (err) {
    logError({ page: 'progress', action: 'troublesomeWords', error: err })
    return []
  }
}

export function VocabMasteryPanel({ userId }: VocabMasteryPanelProps) {
  const T = useT()
  const [troublesome, setTroublesome] = useState<TroublesomeWord[]>([])
  const [opened, setOpened] = useState(false)

  useEffect(() => {
    let active = true
    loadTroublesome(userId).then((v) => active && setTroublesome(v))
    return () => {
      active = false
    }
  }, [userId])

  return (
    <>
      <MasteryFunnelPanel
        userId={userId}
        kind="vocabulary"
        unitLabel={T.progress.unitWords}
        onAtRiskClick={() => setOpened(true)}
        footer={() => <StubbornWordsCard userId={userId} />}
      />
      {opened && (
        <TroublesomeWordsSheet
          userId={userId}
          entries={troublesome}
          onClose={() => setOpened(false)}
        />
      )}
    </>
  )
}
