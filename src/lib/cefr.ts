// src/lib/cefr.ts
//
// Generic CEFR-level ordering + grouping. Used by the discovery lists — Podcasts
// (src/pages/Podcasts.tsx) and Lezen (src/pages/Lezen.tsx) — to break a flat list
// into A1 → A2 → B1 → B2 → C1 → C2 sections. The grouping is STABLE: items keep
// their incoming relative order inside each level bucket, so a caller's own
// ordering (Lezen's per-learner comprehensibility rank, Podcasts' newest-first)
// survives untouched as the in-group order.
//
// The lesson hub has its own richer grouping (src/lib/lessons/levelGrouping.ts —
// it also averages % mastered per level); this module owns the level-rank
// vocabulary both share, so the CEFR order lives in exactly one place.

export const CEFR_ORDER = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const

export type CefrLevel = (typeof CEFR_ORDER)[number]

/** Rank for sorting. Unknown/blank levels sort last (rank = CEFR_ORDER.length). */
export function cefrRank(level: string): number {
  const i = CEFR_ORDER.indexOf(level.trim().toUpperCase() as CefrLevel)
  return i === -1 ? CEFR_ORDER.length : i
}

export interface CefrGroup<T> {
  /** The trimmed level string ('A1', 'B2', …) or the `unknownLabel` bucket. */
  level: string
  /** True when this is the catch-all bucket for rows with no recognised level. */
  isUnknown: boolean
  items: T[]
}

/**
 * Group `items` into ordered CEFR buckets. Rows whose level is null/blank or
 * unrecognised collect into a single trailing bucket labelled `unknownLabel`.
 * Within every bucket, input order is preserved (stable) — the caller's sort
 * IS the in-group order.
 */
export function groupByCefrLevel<T>(
  items: T[],
  getLevel: (item: T) => string | null | undefined,
  unknownLabel = 'Overig',
): CefrGroup<T>[] {
  const byLevel = new Map<string, T[]>()
  for (const item of items) {
    const raw = getLevel(item)?.trim()
    const known = raw && cefrRank(raw) < CEFR_ORDER.length
    const key = known ? raw!.toUpperCase() : unknownLabel
    const list = byLevel.get(key)
    if (list) list.push(item)
    else byLevel.set(key, [item])
  }
  return [...byLevel.entries()]
    .sort((a, b) => cefrRank(a[0]) - cefrRank(b[0]))
    .map(([level, groupItems]) => ({
      level,
      isUnknown: level === unknownLabel,
      items: groupItems,
    }))
}
