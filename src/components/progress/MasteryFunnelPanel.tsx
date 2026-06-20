// src/components/progress/MasteryFunnelPanel.tsx
//
// Shared progress panel for Woordenschat and Grammatica: a lesson filter
// (landing = "Alle lessen", then per lesson) over the mastery-progression funnel
// (the same MasteryJourney as before). `kind` picks vocab vs grammar; `footer`
// lets each page add scope-aware content below (Woordenschat → moeilijke woorden;
// Grammatica → the per-pattern chips for the selected lesson). One fetch
// (getMasteryFunnels) returns both the all-lessons and per-lesson funnels.
import { useEffect, useState, type ReactNode } from 'react'
import { Select } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { useT } from '@/hooks/useT'
import { getMasteryFunnels, type MasteryFunnels } from '@/lib/analytics/mastery/masteryModel'
import { logError } from '@/lib/logger'
import { MasteryJourney } from './MasteryJourney'
import classes from './MasteryFunnelPanel.module.css'

const ALL = 'all'

const EMPTY: MasteryFunnels = {
  vocabulary: { not_assessed: 0, introduced: 0, learning: 0, strengthening: 0, mastered: 0, at_risk: 0 },
  grammar: { not_assessed: 0, introduced: 0, learning: 0, strengthening: 0, mastered: 0, at_risk: 0 },
  morphology: { not_assessed: 0, introduced: 0, learning: 0, strengthening: 0, mastered: 0, at_risk: 0 },
}

export interface FunnelScope {
  all: boolean
  lessonNumber: number | null
}

export interface MasteryFunnelPanelProps {
  userId: string
  kind: 'vocabulary' | 'grammar' | 'morphology'
  /** Noun for the funnel headline, e.g. "woorden" / "patronen". */
  unitLabel: string
  /** Scope-aware content rendered below the funnel. */
  footer?: (scope: FunnelScope) => ReactNode
}

export function MasteryFunnelPanel({ userId, kind, unitLabel, footer }: MasteryFunnelPanelProps) {
  const T = useT()
  const [data, setData] = useState<{ all: MasteryFunnels; byLesson: Map<number, MasteryFunnels> } | null>(null)
  const [scope, setScope] = useState<string>(ALL)

  useEffect(() => {
    let active = true
    getMasteryFunnels(userId)
      .then((v) => active && setData(v))
      .catch((err) => {
        logError({ page: 'progress', action: 'masteryFunnels', error: err })
        notifications.show({ color: 'red', title: T.common.error, message: T.common.somethingWentWrong })
      })
    return () => {
      active = false
    }
  }, [userId, T.common.error, T.common.somethingWentWrong])

  if (!data) return null

  const lessons = [...data.byLesson.keys()].sort((a, b) => a - b)
  const selectData = [
    { value: ALL, label: T.progress.grammarAllLessons },
    ...lessons.map((n) => ({ value: String(n), label: `${T.progress.grammarLessonLabel} ${n}` })),
  ]
  const funnels = scope === ALL ? data.all : data.byLesson.get(Number(scope)) ?? EMPTY
  const funnelScope: FunnelScope = { all: scope === ALL, lessonNumber: scope === ALL ? null : Number(scope) }

  return (
    <div className={classes.panel}>
      {lessons.length > 0 && (
        <Select
          className={classes.filter}
          aria-label={unitLabel}
          data={selectData}
          value={scope}
          onChange={(value) => value && setScope(value)}
          allowDeselect={false}
          comboboxProps={{ withinPortal: false }}
        />
      )}
      {/* key re-mounts so the journey re-animates when the lesson filter changes */}
      <MasteryJourney key={scope} funnel={funnels[kind]} unitLabel={unitLabel} />
      {footer?.(funnelScope)}
    </div>
  )
}
