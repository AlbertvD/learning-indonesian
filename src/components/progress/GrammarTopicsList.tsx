// src/components/progress/GrammarTopicsList.tsx
//
// Grammar-topics drill-down on voortgang (#209): each named grammar_pattern with
// its mastery ladder label. Read-only, client-side over the same evidence the
// funnels use (joins grammar_patterns names). Coaching labels (at-risk reads
// "needs review"), per the engagement research.
import { useEffect, useState } from 'react'
import { notifications } from '@mantine/notifications'
import { useT } from '@/hooks/useT'
import {
  getGrammarTopics,
  type GrammarTopic,
} from '@/lib/analytics/mastery/masteryModel'
import type { MasteryLabel } from '@/lib/analytics/mastery/masteryModel'
import { logError } from '@/lib/logger'
import classes from './GrammarTopicsList.module.css'

export interface GrammarTopicsListProps {
  userId: string
}

export function GrammarTopicsList({ userId }: GrammarTopicsListProps) {
  const T = useT()
  const [topics, setTopics] = useState<GrammarTopic[]>([])

  useEffect(() => {
    let active = true
    getGrammarTopics(userId)
      .then((value) => {
        if (active) setTopics(value)
      })
      .catch((err) => {
        logError({ page: 'progress', action: 'grammarTopics', error: err })
        notifications.show({
          color: 'red',
          title: T.common.error,
          message: T.common.somethingWentWrong,
        })
      })
    return () => {
      active = false
    }
  }, [userId, T.common.error, T.common.somethingWentWrong])

  const rungLabel: Record<MasteryLabel, string> = {
    not_assessed: T.progress.rungLearning,
    introduced: T.progress.rungIntroduced,
    learning: T.progress.rungLearning,
    strengthening: T.progress.rungStrengthening,
    mastered: T.progress.rungMastered,
    at_risk: T.progress.rungAtRisk,
  }

  // Group by introducing lesson (the learning order). deriveGrammarTopics already
  // sorts by lessonNumber → slug, so insertion order gives ascending lessons with
  // a stable within-lesson order; null (no lesson) collects under "Overig" last.
  const byLesson = new Map<number | null, GrammarTopic[]>()
  for (const topic of topics) {
    byLesson.set(topic.lessonNumber, [...(byLesson.get(topic.lessonNumber) ?? []), topic])
  }

  return (
    <div className={classes.card}>
      <h3 className={classes.title}>{T.progress.grammarTopicsTitle}</h3>
      {[...byLesson.entries()].map(([lessonNumber, lessonTopics]) => (
        <div key={lessonNumber ?? 'other'} className={classes.group}>
          <h4 className={classes.groupHead}>
            {lessonNumber != null
              ? `${T.progress.grammarLessonLabel} ${lessonNumber}`
              : T.progress.grammarOtherLabel}
          </h4>
          <ul className={classes.list}>
            {lessonTopics.map((topic) => (
              <li key={topic.slug} className={classes.row}>
                <span className={classes.info}>
                  <span className={classes.name}>{topic.name}</span>
                  {topic.shortExplanation && (
                    <span className={classes.desc}>{topic.shortExplanation}</span>
                  )}
                </span>
                <span className={`${classes.badge} ${classes[topic.label] ?? ''}`}>
                  {rungLabel[topic.label]}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}
