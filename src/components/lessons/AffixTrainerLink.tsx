import { Link } from 'react-router-dom'
import { IconAbc } from '@tabler/icons-react'
import { useT } from '@/hooks/useT'
import classes from './AffixTrainerLink.module.css'

// AffixTrainerLink — a small presentational band placed at the bottom of a
// lesson's Grammatica chapter (or whichever chapter node carries the
// morphology content, for lessons without a dedicated Grammatica chapter),
// deep-linking straight into the Affix Trainer for each affix that chapter
// teaches (`/morphology?affix=<label>`).
//
// Purely presentational: the affix labels are supplied by the page, sourced
// at build time from the lesson's generated `morphology-patterns.ts`
// (docs/plans/2026-07-08-affix-trainer-quick-wins.md §2) — this component
// never derives or validates them itself. One Link per affix (a lesson can
// teach several, e.g. lesson 21/22/29); rendered compactly as a wrapped row
// rather than stacked full-width bands.
export function AffixTrainerLink({ affixes }: { affixes: string[] }) {
  const T = useT()
  if (affixes.length === 0) return null
  return (
    <section className={classes.band}>
      <div className={classes.inner}>
        {affixes.map((affix) => (
          <Link
            key={affix}
            to={`/morphology?affix=${encodeURIComponent(affix)}`}
            className={classes.link}
          >
            <IconAbc size={18} className={classes.icon} aria-hidden="true" />
            <span>{T.lessons.affixTrainerCta(affix)}</span>
          </Link>
        ))}
      </div>
    </section>
  )
}
