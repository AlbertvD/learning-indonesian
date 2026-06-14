// A stacked coverage bar for a word-list: known ⊆ eligible ⊆ total, drawn as
// three nested segments so the whole "what you own / what's scheduled / what you'd
// gain" story reads in one glance. The gain tail (eligible→total) is the
// call-to-action — striped accent until the list is activated, at which point
// eligible == total and the tail vanishes. Token-only; reusable by the Voortgang
// coverage face later (foundation doc "one object, two faces").
import classes from './CoverageBar.module.css'

export interface CoverageBarProps {
  total: number
  /** Already schedulable for the learner (lesson- or list-activated). */
  eligible: number
  /** Already mastered (receptive recognition). known ≤ eligible ≤ total. */
  known: number
}

export function CoverageBar({ total, eligible, known }: CoverageBarProps) {
  const safeTotal = Math.max(1, total)
  const k = Math.max(0, Math.min(known, eligible, total))
  const e = Math.max(k, Math.min(eligible, total))
  const pct = (n: number) => `${(n / safeTotal) * 100}%`
  return (
    <span className={classes.track} aria-hidden="true">
      <span className={classes.known} style={{ width: pct(k) }} />
      <span className={classes.eligible} style={{ width: pct(e - k) }} />
      <span className={classes.gain} style={{ width: pct(total - e) }} />
    </span>
  )
}
