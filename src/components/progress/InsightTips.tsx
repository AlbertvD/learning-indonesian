// src/components/progress/InsightTips.tsx
//
// Metacognitive nudge: evidence-based study tips for one weak area, as a
// collapsible "tips" disclosure (progressive disclosure → low cognitive
// overload, which the nudging literature warns against). It supports the
// learner's strategy without touching the session engine. Visual language
// matches the gauges/funnel (cool→green gradient spine).
import { useState } from 'react'
import { useAuthStore } from '@/stores/authStore'
import { studyTipsFor, type TipArea } from '@/lib/analytics/studyTips'
import classes from './InsightTips.module.css'

export interface InsightTipsProps {
  area: TipArea
  /** Start expanded (the weakest area, where help is most relevant). */
  defaultOpen?: boolean
}

export function InsightTips({ area, defaultOpen = true }: InsightTipsProps) {
  const lang = useAuthStore((s) => s.profile?.language ?? 'nl')
  const [open, setOpen] = useState(defaultOpen)
  const { title, tips } = studyTipsFor(area, lang === 'en' ? 'en' : 'nl')

  return (
    <div className={classes.card}>
      <button
        type="button"
        className={classes.header}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className={classes.title}>{title}</span>
        <span className={`${classes.chevron} ${open ? classes.open : ''}`}>▶</span>
      </button>
      {open && (
        <ul className={classes.list}>
          {tips.map((tip) => (
            <li key={tip} className={classes.tip}>
              {tip}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
