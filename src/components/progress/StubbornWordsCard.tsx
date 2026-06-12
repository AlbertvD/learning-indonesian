// src/components/progress/StubbornWordsCard.tsx
//
// "Moeilijke woorden" callout — words never learned that the learner keeps
// failing (deriveStubbornWords). Distinct from at-risk (a retention loss): this is
// an ACQUISITION problem whose fix is a different STRATEGY, not more reps. Renders
// nothing when there are none (a small, often-empty safety net). TS-only signal
// (getStubbornWords); the session engine is untouched.
import { useEffect, useState } from 'react'
import { notifications } from '@mantine/notifications'
import { useT } from '@/hooks/useT'
import { getStubbornWords, type StubbornWord } from '@/lib/analytics/mastery/masteryModel'
import { logError } from '@/lib/logger'
import { InsightTips } from './InsightTips'
import classes from './StubbornWordsCard.module.css'

function displayLabel(sourceRef: string): string {
  return sourceRef
    .replace(/^learning_items\//, '')
    .replace(/^lesson-\d+\/(?:pattern|section-\d+)\//, '')
}

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

  // Often empty — a stubborn word has to resist across several sessions. Show nothing then.
  if (!words || words.length === 0) return null

  // One chip per word (a word can have several stubborn skills).
  const unique = [...new Set(words.map((w) => displayLabel(w.sourceRef)))]

  return (
    <div className={classes.card}>
      <div className={classes.head}>
        <span className={classes.icon}>🧩</span>
        <div className={classes.body}>
          <span className={classes.title}>
            {unique.length} {T.progress.stubbornNoun}
          </span>
          <span className={classes.explain}>{T.progress.stubbornExplain}</span>
        </div>
      </div>
      <div className={classes.chips}>
        {unique.map((w) => (
          <span key={w} className={classes.chip}>
            {w}
          </span>
        ))}
      </div>
      <InsightTips area="stubborn" defaultOpen={false} />
    </div>
  )
}
