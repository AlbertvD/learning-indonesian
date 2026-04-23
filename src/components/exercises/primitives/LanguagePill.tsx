// src/components/exercises/primitives/LanguagePill.tsx
// Tiny language tag shown inline with role labels in feedback cards.
// See docs/plans/2026-04-23-exercise-framework-design.md §6.8

import classes from './LanguagePill.module.css'

export type PillLanguage = 'ID' | 'NL' | 'EN'

export interface LanguagePillProps {
  lang: PillLanguage
}

/**
 * Decorative language marker ("ID", "NL", "EN"). aria-hidden because the
 * adjacent role label already communicates language. Never interactive.
 */
export function LanguagePill({ lang }: LanguagePillProps) {
  return (
    <span className={classes.root} aria-hidden="true">{lang}</span>
  )
}
