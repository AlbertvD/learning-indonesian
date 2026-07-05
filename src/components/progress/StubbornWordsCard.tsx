// src/components/progress/StubbornWordsCard.tsx
//
// "Moeilijke woorden" callout — words never learned that the learner keeps
// failing (deriveStubbornWords). Distinct from at-risk (a retention loss): this is
// an ACQUISITION problem whose fix is a different STRATEGY, not more reps. Renders
// nothing when there are none (a small, often-empty safety net). TS-only signal
// (getStubbornWords), plus the mnemonic-workshop secondary entry point (design
// §4.2): tap a chip to browse/create/edit that word's saved memory hook.
import { useEffect, useState } from 'react'
import { notifications } from '@mantine/notifications'
import { useT } from '@/hooks/useT'
import { getStubbornWords, type StubbornWord } from '@/lib/analytics/mastery/masteryModel'
import { fetchMnemonicsForRefs, labelForSourceRef } from '@/lib/mnemonics'
import { MnemonicWorkshop } from '@/components/mnemonics/MnemonicWorkshop'
import { logError } from '@/lib/logger'
import { InsightTips } from './InsightTips'
import classes from './StubbornWordsCard.module.css'

interface StubbornWordEntry {
  sourceRef: string
  label: string
  isAffixed: boolean
}

export interface StubbornWordsCardProps {
  userId: string
}

export function StubbornWordsCard({ userId }: StubbornWordsCardProps) {
  const T = useT()
  const [words, setWords] = useState<StubbornWord[] | null>(null)
  const [notesBySourceRef, setNotesBySourceRef] = useState<Map<string, string>>(new Map())
  const [workshopEntry, setWorkshopEntry] = useState<StubbornWordEntry | null>(null)

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
  // the two writers.
  const entries: StubbornWordEntry[] = words
    ? [...new Map(words.map((w) => [w.sourceRef, w] as const)).values()].map((w) => ({
        sourceRef: w.sourceRef,
        label: labelForSourceRef(w.sourceRef),
        isAffixed: w.sourceKind === 'word_form_pair_src',
      }))
    : []
  // A stable primitive dependency (entries is a fresh array every render).
  const sourceRefsKey = entries.map((e) => e.sourceRef).join(',')

  useEffect(() => {
    if (!sourceRefsKey) return
    let active = true
    fetchMnemonicsForRefs(userId, sourceRefsKey.split(','))
      .then((map) => active && setNotesBySourceRef(map))
      .catch((err) => {
        logError({ page: 'progress', action: 'fetchStubbornMnemonics', error: err })
      })
    return () => {
      active = false
    }
  }, [userId, sourceRefsKey])

  // Often empty — a stubborn word has to resist across several sessions. Show nothing then.
  if (!words || words.length === 0) return null

  return (
    <div className={classes.card}>
      <div className={classes.head}>
        <span className={classes.icon}>🧩</span>
        <div className={classes.body}>
          <span className={classes.title}>
            {entries.length} {T.progress.stubbornNoun}
          </span>
          <span className={classes.explain}>{T.progress.stubbornExplain}</span>
        </div>
      </div>
      <div className={classes.chips}>
        {entries.map((entry) => (
          <button
            key={entry.sourceRef}
            type="button"
            className={classes.chip}
            onClick={() => setWorkshopEntry(entry)}
          >
            {entry.label}
            {notesBySourceRef.has(entry.sourceRef) && (
              <span className={classes.hasNoteDot} aria-hidden="true" />
            )}
          </button>
        ))}
      </div>
      <InsightTips area="stubborn" defaultOpen={false} />
      {workshopEntry && (
        <MnemonicWorkshop
          userId={userId}
          sourceRef={workshopEntry.sourceRef}
          label={workshopEntry.label}
          isAffixed={workshopEntry.isAffixed}
          opened
          onClose={() => setWorkshopEntry(null)}
          onSaved={(note) => setNotesBySourceRef((m) => new Map(m).set(workshopEntry.sourceRef, note))}
        />
      )}
    </div>
  )
}
