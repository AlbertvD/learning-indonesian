// src/lib/lessons/levelGrouping.ts
//
// Group lesson-overview rows into collapsible CEFR sections for the Leren hub
// (foundation plan §7.3) — so 30 lessons aren't a long mobile scroll. Pure; the
// page owns the open/closed UI state. Kept out of the page file so it's unit-
// testable without a component (and clear of the react-refresh export rule).
import type { LessonOverviewRow } from '@/lib/lessons'

const CEFR_ORDER = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const

export interface LessonLevelGroup {
  level: string
  rows: LessonOverviewRow[]
  /** Average % mastered across the group — for the collapsed-section summary. */
  masteredPercent: number
}

function levelRank(level: string): number {
  const i = CEFR_ORDER.indexOf(level.toUpperCase() as (typeof CEFR_ORDER)[number])
  return i === -1 ? CEFR_ORDER.length : i // unknown/blank levels sort last
}

export function groupRowsByLevel(rows: LessonOverviewRow[]): LessonLevelGroup[] {
  const byLevel = new Map<string, LessonOverviewRow[]>()
  for (const row of rows) {
    const level = row.level?.trim() || 'Overig'
    const list = byLevel.get(level)
    if (list) list.push(row)
    else byLevel.set(level, [row])
  }
  return [...byLevel.entries()]
    .sort((a, b) => levelRank(a[0]) - levelRank(b[0]))
    .map(([level, groupRows]) => ({
      level,
      rows: groupRows,
      masteredPercent: groupRows.length
        ? Math.round(groupRows.reduce((s, r) => s + (r.masteredPercent ?? 0), 0) / groupRows.length)
        : 0,
    }))
}

// Default-open the first level a learner is still working through (an activated
// lesson below 100%); else the first not-fully-mastered level; else the first.
export function defaultOpenLevel(groups: LessonLevelGroup[]): string | null {
  if (groups.length === 0) return null
  const inProgress = groups.find((g) => g.rows.some((r) => r.isActivated && (r.masteredPercent ?? 0) < 100))
  if (inProgress) return inProgress.level
  const incomplete = groups.find((g) => g.masteredPercent < 100)
  return (incomplete ?? groups[0]).level
}
