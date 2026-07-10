// src/components/progress/StubbornWordsCard.tsx
//
// "Moeilijke woorden" callout — words never learned that the learner keeps
// failing (deriveStubbornWords). Distinct from at-risk (a retention loss): this is
// an ACQUISITION problem whose fix is a different STRATEGY, not more reps. Renders
// nothing when there are none (a small, often-empty safety net). TS-only signal
// (getStubbornWords); the chip/dot/workshop body is the shared MnemonicWordChips
// (components/mnemonics/, extracted 2026-07-09 home-mnemonic-weak-words-surface
// slice 1) — also consumed by Home's TroublesomeWordsSheet, so neither
// duplicates the chip/dot/workshop wiring.
import { useEffect, useState } from 'react'
import { notifications } from '@mantine/notifications'
import { useT } from '@/hooks/useT'
import { getStubbornWords, type StubbornWord } from '@/lib/analytics/mastery/masteryModel'
import { MnemonicWordChips, type MnemonicWordChipsEntry } from '@/components/mnemonics/MnemonicWordChips'
import { logError } from '@/lib/logger'
import { InsightTips } from './InsightTips'
import classes from './StubbornWordsCard.module.css'

export interface StubbornWordsCardProps {
  userId: string
}

export function StubbornWordsCard({ userId }: StubbornWordsCardProps) {
  const T = useT()
  const [words, setWords] = useState<StubbornWord[] | null>(null)

  useEffect(() => {
    let active = true
    getStubbornWords(userId)
      .then((v) => active && setWords(v))
      .catch((err) => {
        logError({ page: 'progress', action: 'stubbornWords', error: err })
        notifications.show({ color: 'red', title: T.common.error, message: T.common.somethingWentWrong })
      })
    return () => {
      active = false
    }
  }, [userId, T.common.error, T.common.somethingWentWrong])

  // C1 fix (data-architect): dedupe by the raw source_ref, not the stripped display
  // label — the in-session feedback-screen path keys notes by the same raw
  // source_ref, so a display-label dedupe here would fragment a word's note across
  // the two writers. Label/isAffixed are no longer computed here — MnemonicWordChips
  // is the sole holder of that (see its file header).
  const entries: MnemonicWordChipsEntry[] = words
    ? [...new Map(words.map((w) => [w.sourceRef, w] as const)).values()].map((w) => ({
        sourceRef: w.sourceRef,
        sourceKind: w.sourceKind,
      }))
    : []

  // Often empty — a stubborn word has to resist across several sessions. Show nothing then.
  if (!words || words.length === 0) return null

  return (
    <div className={classes.card}>
      <div className={classes.head}>
        <span className={classes.title}>
          {entries.length} {T.progress.stubbornNoun}
        </span>
        <span className={classes.explain}>{T.progress.stubbornExplain}</span>
      </div>
      <MnemonicWordChips userId={userId} entries={entries} />
      <InsightTips area="stubborn" defaultOpen={false} />
    </div>
  )
}
