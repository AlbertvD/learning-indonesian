// src/components/progress/GrammarPatternList.tsx
//
// The per-pattern detail for ONE lesson, shown under the Grammatica funnel when a
// specific lesson is selected. Each pattern shows its three dimensions (ADR 0017)
// — Herkennen (recognise the rule), Onderscheiden (distinguish it from a
// contrasting pattern), and Produceren (apply the rule to build a sentence) — as
// colored rung chips (status, not counts), plus how often it's been practised.
// The funnel +
// lesson filter live in MasteryFunnelPanel; this is just the list.
import { useEffect, useState } from 'react'
import { notifications } from '@mantine/notifications'
import { useT } from '@/hooks/useT'
import {
  getGrammarTopics,
  type GrammarTopic,
  type GrammarDimensionProgress,
  type MasteryLabel,
} from '@/lib/analytics/mastery/masteryModel'
import { logError } from '@/lib/logger'
import classes from './GrammarPatternList.module.css'

export interface GrammarPatternListProps {
  userId: string
  lessonNumber: number
}

export function GrammarPatternList({ userId, lessonNumber }: GrammarPatternListProps) {
  const T = useT()
  const [topics, setTopics] = useState<GrammarTopic[]>([])

  useEffect(() => {
    let active = true
    getGrammarTopics(userId)
      .then((value) => active && setTopics(value))
      .catch((err) => {
        logError({ page: 'progress', action: 'grammarPatterns', error: err })
        notifications.show({ color: 'red', title: T.common.error, message: T.common.somethingWentWrong })
      })
    return () => {
      active = false
    }
  }, [userId, T.common.error, T.common.somethingWentWrong])

  const rungLabel: Record<MasteryLabel, string> = {
    not_assessed: T.progress.grammarNotStarted,
    introduced: T.progress.rungIntroduced,
    learning: T.progress.rungLearning,
    strengthening: T.progress.rungStrengthening,
    mastered: T.progress.rungMastered,
    at_risk: T.progress.rungAtRisk,
  }

  const patterns = topics.filter((t) => t.lessonNumber === lessonNumber)
  if (patterns.length === 0) return null

  return (
    <ul className={classes.list}>
      {patterns.map((topic) => (
        <li key={topic.slug} className={classes.row}>
          <div className={classes.rowHead}>
            <span className={classes.name}>{topic.name}</span>
            {topic.reviewCount > 0 && (
              <span className={classes.reviews}>
                {topic.reviewCount}× {T.progress.grammarPractised}
              </span>
            )}
          </div>
          {topic.shortExplanation && <p className={classes.desc}>{topic.shortExplanation}</p>}
          <div className={classes.dims}>
            <DimChip label={T.progress.grammarRecognise} dim={topic.recognise} rungLabel={rungLabel} />
            <DimChip label={T.progress.grammarContrast} dim={topic.contrast} rungLabel={rungLabel} />
            <DimChip label={T.progress.grammarProduce} dim={topic.produce} rungLabel={rungLabel} />
          </div>
        </li>
      ))}
    </ul>
  )
}

function DimChip({
  label,
  dim,
  rungLabel,
}: {
  label: string
  dim: GrammarDimensionProgress | null
  rungLabel: Record<MasteryLabel, string>
}) {
  if (!dim) return null
  return (
    <span className={classes.dim}>
      <span className={classes.dimLabel}>{label}</span>
      <span className={`${classes.chip} ${classes[dim.label] ?? ''}`}>{rungLabel[dim.label]}</span>
    </span>
  )
}
