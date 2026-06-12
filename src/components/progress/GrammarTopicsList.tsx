// src/components/progress/GrammarTopicsList.tsx
//
// Grammar progress on voortgang (#209): a lesson filter on top, then for the
// selected lesson a rung distribution (the same MasteryJourney funnel as the
// Voortgang vocab/grammar funnels — grammar-only, counting THIS lesson's
// patterns) and below it each pattern's two skill dimensions — Herkennen
// (recognise the rule) and Toepassen (apply it) — as a position on the same
// ladder, plus how often it's been practised. "Alle lessen" shows the grouped
// overview without the per-lesson funnel. Read-only, client-side over the same
// evidence the funnels use.
import { useEffect, useMemo, useState } from 'react'
import { Select } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { useT } from '@/hooks/useT'
import {
  getGrammarTopics,
  type GrammarTopic,
  type GrammarDimensionProgress,
  type MasteryFunnel,
  type MasteryLabel,
} from '@/lib/analytics/mastery/masteryModel'
import { logError } from '@/lib/logger'
import { MasteryJourney } from './MasteryJourney'
import classes from './GrammarTopicsList.module.css'

export interface GrammarTopicsListProps {
  userId: string
}

const ALL = 'all'

function buildFunnel(topics: GrammarTopic[]): MasteryFunnel {
  const funnel: MasteryFunnel = {
    not_assessed: 0, introduced: 0, learning: 0, strengthening: 0, mastered: 0, at_risk: 0,
  }
  for (const topic of topics) funnel[topic.label] += 1
  return funnel
}

export function GrammarTopicsList({ userId }: GrammarTopicsListProps) {
  const T = useT()
  const [topics, setTopics] = useState<GrammarTopic[]>([])
  const [lesson, setLesson] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    getGrammarTopics(userId)
      .then((value) => {
        if (!active) return
        setTopics(value)
        // Default to the most recent lesson so the view opens focused, not as an
        // endless scroll. Only lessons that actually have patterns are offered.
        const lessons = [...new Set(value.map((t) => t.lessonNumber).filter((n): n is number => n != null))]
        if (lessons.length > 0) setLesson(String(Math.max(...lessons)))
        else setLesson(ALL)
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
    not_assessed: T.progress.grammarNotStarted,
    introduced: T.progress.rungIntroduced,
    learning: T.progress.rungLearning,
    strengthening: T.progress.rungStrengthening,
    mastered: T.progress.rungMastered,
    at_risk: T.progress.rungAtRisk,
  }

  const lessons = useMemo(
    () => [...new Set(topics.map((t) => t.lessonNumber).filter((n): n is number => n != null))].sort((a, b) => a - b),
    [topics],
  )

  const selectData = [
    ...lessons.map((n) => ({ value: String(n), label: `${T.progress.grammarLessonLabel} ${n}` })),
    { value: ALL, label: T.progress.grammarAllLessons },
  ]

  const singleLesson = lesson != null && lesson !== ALL
  const visible = singleLesson ? topics.filter((t) => String(t.lessonNumber) === lesson) : topics

  // Group the visible patterns by lesson (deriveGrammarTopics already sorted them
  // by lesson then slug, so insertion order is the learning order).
  const byLesson = new Map<number | null, GrammarTopic[]>()
  for (const topic of visible) {
    byLesson.set(topic.lessonNumber, [...(byLesson.get(topic.lessonNumber) ?? []), topic])
  }

  return (
    <div className={classes.card}>
      <h3 className={classes.title}>{T.progress.grammarTopicsTitle}</h3>

      {lessons.length > 0 && (
        <Select
          className={classes.filter}
          aria-label={T.progress.grammarTopicsTitle}
          data={selectData}
          value={lesson}
          onChange={(value) => value && setLesson(value)}
          allowDeselect={false}
          comboboxProps={{ withinPortal: false }}
        />
      )}

      {[...byLesson.entries()].map(([lessonNumber, lessonTopics]) => (
        <div key={lessonNumber ?? 'other'} className={classes.group}>
          {singleLesson ? (
            <MasteryJourney funnel={buildFunnel(lessonTopics)} unitLabel={T.progress.grammarUnitPatterns} />
          ) : (
            <h4 className={classes.groupHead}>
              {lessonNumber != null
                ? `${T.progress.grammarLessonLabel} ${lessonNumber}`
                : T.progress.grammarOtherLabel}
            </h4>
          )}
          <ul className={classes.list}>
            {lessonTopics.map((topic) => (
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
                  <DimBar label={T.progress.grammarRecognise} dim={topic.recognise} rungLabel={rungLabel} />
                  <DimBar label={T.progress.grammarUse} dim={topic.use} rungLabel={rungLabel} />
                </div>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}

function DimBar({
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
