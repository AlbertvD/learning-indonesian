// src/components/morphology/AffixIntro.tsx
// The Affix Trainer catalog intro. Its hero is the affix MECHANIC shown, not
// described: a live composition `jalan + [ber-] → berjalan` (root + affix pill
// → derived word), each Indonesian term glossed in the learner's language.
// Below it a display-serif heading + two tight body sentences frame the drill.
//
// A bespoke token-only domain card (like LessonCard / WordFamilyExplorer) — a
// calm surface that deliberately does NOT compete with the vivid tamarind/teal
// affix tiles beneath it. The one bold signature is the tamarind affix pill,
// which reuses the trainer's affix-pill language (AFFIX_TYPE_HUE.prefix.solid).
//
// The Indonesian composition (jalan / ber- / berjalan) is fixed content — only
// the two glosses + the heading/body copy come from i18n (NL/EN).

import { useT } from '@/hooks/useT'
import classes from './AffixIntro.module.css'

// A clean, correct ber- pair: jalan (a noun — road/way) → berjalan (to walk /
// to go). ber- forms an intransitive verb, the trainer's very first affix.
const ROOT = 'jalan'
const AFFIX = 'ber-'
const DERIVED = 'berjalan'

export function AffixIntro() {
  const T = useT()
  return (
    <section className={classes.card}>
      <div className={classes.composition} aria-hidden="true">
        <span className={classes.term}>
          <span className={classes.root}>{ROOT}</span>
          <span className={classes.gloss}>{T.morphology.introRootGloss}</span>
        </span>
        <span className={classes.op}>+</span>
        <span className={classes.pill}>{AFFIX}</span>
        <span className={classes.op}>&rarr;</span>
        <span className={classes.term}>
          <span className={classes.derived}>{DERIVED}</span>
          <span className={classes.gloss}>{T.morphology.introDerivedGloss}</span>
        </span>
      </div>

      <h2 className={classes.heading}>{T.morphology.introHeading}</h2>
      <p className={classes.body}>{T.morphology.introBody}</p>
    </section>
  )
}
