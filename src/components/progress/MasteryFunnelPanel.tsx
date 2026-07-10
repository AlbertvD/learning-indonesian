// src/components/progress/MasteryFunnelPanel.tsx
//
// Shared progress panel for Woordenschat, Grammatica and Morfologie: a lesson
// filter (landing = "Alle lessen", then per lesson) over the mastery ladder
// (MasteryLadder). `kind` picks vocab/grammar/morphology; `footer` lets each
// page add scope-aware content below (Woordenschat → moeilijke woorden;
// Grammatica → the per-pattern chips for the selected lesson). One fetch
// (getMasteryFunnels) returns both the all-lessons and per-lesson funnels.
//
// The at-risk callout (voortgang-hub-redesign,
// docs/plans/2026-07-09-voortgang-hub-redesign.md) lives HERE, below the
// ladder, as its own tappable ListCard — not inside MasteryLadder. It only
// renders when the caller supplies `onAtRiskClick` (Woordenschat only, via
// VocabMasteryPanel) AND the scoped funnel has at-risk words; grammar/
// morfologie never pass the callback, so they never render the card.
import { useEffect, useState, type ReactNode } from 'react'
import { Select, UnstyledButton } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { IconLeaf2 } from '@tabler/icons-react'
import { useT } from '@/hooks/useT'
import { getMasteryFunnels, type MasteryFunnels } from '@/lib/analytics/mastery/masteryModel'
import { logError } from '@/lib/logger'
import { ListCard } from '@/components/page/primitives'
import { MasteryLadder } from './MasteryLadder'
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
  /** Noun for the ladder headline, e.g. "woorden" / "patronen" / "affixen". */
  unitLabel: string
  /** Scope-aware content rendered below the funnel. */
  footer?: (scope: FunnelScope) => ReactNode
  /** Slice 2 (Woordenschat only) — when supplied, the at-risk ListCard opens
   *  the troublesome-words sheet. Grammar/Morfologie callers omit this, so
   *  they never render the at-risk card at all. */
  onAtRiskClick?: () => void
}

export function MasteryFunnelPanel({ userId, kind, unitLabel, footer, onAtRiskClick }: MasteryFunnelPanelProps) {
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
  const funnel = funnels[kind]

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
          // 16px input font stops iOS from auto-zooming on focus (owner report);
          // green tint matches the success-green used by the ladder + cards.
          styles={{
            input: {
              fontSize: '16px',
              background: 'var(--success-subtle)',
              borderColor: 'var(--success-border)',
            },
          }}
        />
      )}
      {/* key re-mounts so the ladder re-animates when the lesson filter changes */}
      <MasteryLadder key={scope} funnel={funnel} unitLabel={unitLabel} />
      {onAtRiskClick && funnel.at_risk > 0 && (
        <UnstyledButton onClick={onAtRiskClick} display="block" w="100%">
          <ListCard
            feature
            tone="gold"
            icon={<IconLeaf2 size={25} stroke={1.7} />}
            title={T.progress.atRiskCardTitle(funnel.at_risk)}
            subtitle={T.progress.atRiskCardSubtitle}
          />
        </UnstyledButton>
      )}
      {footer?.(funnelScope)}
    </div>
  )
}
