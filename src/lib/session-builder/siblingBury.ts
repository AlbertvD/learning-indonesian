// Sibling burying — at most one capability per source_ref (per "word") survives,
// across the builder's selection passes, seeded with the source_refs already
// reviewed today. The in-memory enforcement of the per-day rule.
// See docs/current-system/modules/session-builder.md and
// docs/plans/2026-06-09-sibling-burying-design.md.

/**
 * Keeps the first candidate per source_ref and buries the rest.
 *
 * Walks `candidates` in their given (already-prioritised) order. A candidate is
 * KEPT iff its source_ref has not yet been used; keeping it records the ref in
 * `usedRefs`. Subsequent siblings (same source_ref) are buried (dropped).
 *
 * `usedRefs` is mutated and meant to be threaded across passes — seed it with
 * the source_refs reviewed earlier today so those words are already spent.
 *
 * A candidate whose source_ref is `undefined` is never buried (fail-open): we
 * cannot classify it as anyone's sibling, so we keep it.
 */
export function buryThinSiblings<T>(
  candidates: readonly T[],
  sourceRefOf: (candidate: T) => string | undefined,
  usedRefs: Set<string>,
): T[] {
  return partitionBuried(candidates, sourceRefOf, usedRefs).kept
}

/**
 * Like {@link buryThinSiblings} but returns BOTH halves: `kept` (the survivors,
 * first-per-source_ref in input order) and `buried` (the rest). Used by the
 * planner so buried candidates can be recorded as `suppressedCapabilities`
 * (reason `sibling_buried`) instead of silently dropped. Same `usedRefs`
 * mutation + fail-open-on-undefined semantics as `buryThinSiblings`.
 */
export function partitionBuried<T>(
  candidates: readonly T[],
  sourceRefOf: (candidate: T) => string | undefined,
  usedRefs: Set<string>,
): { kept: T[]; buried: T[] } {
  const kept: T[] = []
  const buried: T[] = []
  for (const candidate of candidates) {
    const ref = sourceRefOf(candidate)
    if (ref === undefined) {
      kept.push(candidate)
      continue
    }
    if (usedRefs.has(ref)) {
      buried.push(candidate)
      continue
    }
    usedRefs.add(ref)
    kept.push(candidate)
  }
  return { kept, buried }
}
