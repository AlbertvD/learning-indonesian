// A single word-list (collection) row in the Woordenlijsten checklist. A band is
// "one object, two faces" (foundation doc §1): this is the LEREN face — a
// check-to-schedule toggle + a coverage bar. It is never "opened"; activating it
// adds its words to the Home session via set_collection_activation. The Voortgang
// face (coverage insight) reads the same get_collections_overview model.
//
// Presentational + pure: the container owns load + optimistic toggle, so this
// stays trivially testable.
import { Switch } from '@mantine/core'
import classes from './WoordenlijstCard.module.css'

export interface WoordenlijstCardProps {
  name: string
  totalWords: number
  knownWords: number
  activated: boolean
  saving: boolean
  /** e.g. "woorden gekend" / "words known" — rendered after "known/total". */
  knownLabel: string
  /** Toggle control label (visually hidden, used as the switch's a11y name). */
  activateLabel: string
  onToggle: (next: boolean) => void
}

export function WoordenlijstCard({
  name,
  totalWords,
  knownWords,
  activated,
  saving,
  knownLabel,
  activateLabel,
  onToggle,
}: WoordenlijstCardProps) {
  const percent = totalWords > 0 ? Math.round((knownWords / totalWords) * 100) : 0
  return (
    <div className={classes.card} data-activated={activated || undefined}>
      <div className={classes.main}>
        <h3 className={classes.name}>{name}</h3>
        <div className={classes.bar}>
          <span className={classes.barTrack} aria-hidden="true">
            <span className={classes.barFill} style={{ width: `${percent}%` }} />
          </span>
          <span className={classes.coverage}>
            {knownWords}/{totalWords} {knownLabel}
          </span>
        </div>
      </div>
      <Switch
        checked={activated}
        disabled={saving}
        onChange={(e) => onToggle(e.currentTarget.checked)}
        aria-label={`${activateLabel}: ${name}`}
        className={classes.toggle}
      />
    </div>
  )
}
