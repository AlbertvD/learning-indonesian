// A single word-list (collection) cell in the Woordenlijsten checklist. A band is
// "one object, two faces" (foundation doc §1): this is the LEREN face — a
// check-to-schedule toggle + a coverage story. It is never "opened"; activating it
// adds its `gain` words to the Home session.
//
// Layout (mobile-first):
//   ┌ [icon] [rank?] Title …………………………… (+N woorden | ✓ Toegevoegd) ┐
//   │ description (2 lines) …                                          │
//   │ ████▒▒▒▒░░░░  ← CoverageBar (known ⊂ eligible ⊂ gain)           │
//   │ ● N gekend   ● N in oefeningen ……………………………………………… [ switch ] │
//   └─────────────────────────────────────────────────────────────────┘
//
// Presentational + pure: the container owns load + optimistic toggle + the
// kind→icon mapping, so this stays trivially testable.
import type { ReactNode } from 'react'
import { Switch } from '@mantine/core'
import { StatusPill } from '@/components/page/primitives'
import { CoverageBar } from './CoverageBar'
import classes from './WoordenlijstCard.module.css'

export interface WoordenlijstCardProps {
  name: string
  description: string
  kind: 'frequency' | 'theme'
  /** Shown as a small chip on frequency bands (100/300/…); null hides it. */
  rankCutoff: number | null
  /** Lead glyph (kind/slug-specific); composed by the container. */
  icon: ReactNode
  totalWords: number
  knownWords: number
  eligibleNow: number
  gain: number
  activated: boolean
  saving: boolean
  knownLabel: string
  eligibleLabel: string
  gainWordsLabel: string
  addedLabel: string
  /** Visually-hidden a11y name for the switch. */
  activateLabel: string
  onToggle: (next: boolean) => void
}

export function WoordenlijstCard({
  name,
  description,
  kind,
  rankCutoff,
  icon,
  totalWords,
  knownWords,
  eligibleNow,
  gain,
  activated,
  saving,
  knownLabel,
  eligibleLabel,
  gainWordsLabel,
  addedLabel,
  activateLabel,
  onToggle,
}: WoordenlijstCardProps) {
  return (
    <div className={classes.card} data-activated={activated || undefined} data-saving={saving || undefined}>
      <div className={classes.head}>
        <span className={classes.icon} aria-hidden="true">{icon}</span>
        <div className={classes.titleWrap}>
          <h3 className={classes.name}>
            {kind === 'frequency' && rankCutoff != null && (
              <span className={classes.rankChip}>{rankCutoff}</span>
            )}
            {name}
          </h3>
        </div>
        {activated ? (
          <StatusPill tone="success">{addedLabel}</StatusPill>
        ) : gain > 0 ? (
          <span className={classes.gainPill}>+{gain} {gainWordsLabel}</span>
        ) : null}
      </div>

      <p className={classes.description}>{description}</p>

      <CoverageBar total={totalWords} eligible={eligibleNow} known={knownWords} />

      <div className={classes.foot}>
        <span className={classes.legend}>
          <span className={classes.legendItem}>
            <span className={`${classes.dot} ${classes.dotKnown}`} aria-hidden="true" />
            {knownWords} {knownLabel}
          </span>
          <span className={classes.legendItem}>
            <span className={`${classes.dot} ${classes.dotEligible}`} aria-hidden="true" />
            {eligibleNow} {eligibleLabel}
          </span>
        </span>
        <Switch
          checked={activated}
          disabled={saving}
          onChange={(e) => onToggle(e.currentTarget.checked)}
          aria-label={`${activateLabel}: ${name}`}
          className={classes.toggle}
        />
      </div>
    </div>
  )
}
