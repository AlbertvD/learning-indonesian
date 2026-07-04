// The Leren section chrome, shared by all four surfaces (Lessen, Woordenlijsten,
// Affix trainer, Uitspraak trainer). It renders two viewport-exclusive things:
//   • Desktop — the persistent switcher row, so the four icons always sit above
//     the content and you can jump between surfaces without losing the row.
//   • Mobile — a "back to Leren" link, since the surfaces are reached from the
//     Leren hub (Lessons.tsx) one at a time.
// Active state is derived from the location, so every page renders <LerenNav/>
// with no props. Routes are unchanged, so reader→/morphology?affix= deep links
// keep working (and now show the row too).
import type { ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { IconBook, IconListCheck, IconAbc, IconVolume } from '@tabler/icons-react'
import { BackLink } from '@/components/nav/BackLink'
import { useT } from '@/hooks/useT'
import classes from './LerenNav.module.css'

type SurfaceKey = 'lessen' | 'woordenlijsten' | 'affix' | 'uitspraak'

function activeSurface(pathname: string, search: string): SurfaceKey {
  if (pathname.startsWith('/morphology')) return 'affix'
  if (pathname.startsWith('/pronunciation')) return 'uitspraak'
  return new URLSearchParams(search).get('v') === 'woorden' ? 'woordenlijsten' : 'lessen'
}

export function LerenNav() {
  const T = useT()
  const { pathname, search } = useLocation()
  const active = activeSurface(pathname, search)

  const items: { key: SurfaceKey; label: string; icon: ReactNode; to: string }[] = [
    { key: 'lessen', label: T.leren.lessenTab, icon: <IconBook size={22} />, to: '/leren' },
    { key: 'woordenlijsten', label: T.collections.title, icon: <IconListCheck size={22} />, to: '/leren?v=woorden' },
    { key: 'affix', label: T.leren.affixTitle, icon: <IconAbc size={22} />, to: '/morphology' },
    { key: 'uitspraak', label: T.leren.pronunciationTitle, icon: <IconVolume size={22} />, to: '/pronunciation' },
  ]

  return (
    <>
      <nav className={classes.nav} aria-label={T.nav.leren}>
        {items.map((item) => (
          <Link
            key={item.key}
            to={item.to}
            aria-current={active === item.key ? 'page' : undefined}
            className={`${classes.card} ${active === item.key ? classes.cardActive : ''}`}
          >
            {item.icon}
            <span className={classes.label}>{item.label}</span>
          </Link>
        ))}
      </nav>
      <div className={classes.mobileBack}>
        <BackLink to="/leren" label={T.nav.backToLeren} />
      </div>
    </>
  )
}
