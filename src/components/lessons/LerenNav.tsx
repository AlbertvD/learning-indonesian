// The Leren section nav, shared by all four surfaces (Lessen, Woordenlijsten,
// Affix trainer, Uitspraak trainer). It's a thin wrapper over the shared
// <SurfaceNav/> that pins the Leren-specific items + active-surface derivation;
// SurfaceNav owns the desktop switcher row / mobile back-link rendering.
//
// Active state is derived from the location, so every page renders <LerenNav/>
// with no props. Routes are unchanged, so reader→/morphology?affix= deep links
// keep working (and still show the row too).
import { useLocation } from 'react-router-dom'
import { IconBook, IconListCheck, IconAbc, IconVolume } from '@tabler/icons-react'
import { SurfaceNav } from '@/components/nav/SurfaceNav'
import { useT } from '@/hooks/useT'

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

  return (
    <SurfaceNav
      ariaLabel={T.nav.leren}
      activeKey={active}
      backTo="/leren"
      backLabel={T.nav.backToLeren}
      items={[
        { key: 'lessen', label: T.leren.lessenTab, icon: <IconBook size={22} />, to: '/leren' },
        { key: 'woordenlijsten', label: T.collections.title, icon: <IconListCheck size={22} />, to: '/leren?v=woorden' },
        { key: 'affix', label: T.leren.affixTitle, icon: <IconAbc size={22} />, to: '/morphology' },
        { key: 'uitspraak', label: T.leren.pronunciationTitle, icon: <IconVolume size={22} />, to: '/pronunciation' },
      ]}
    />
  )
}
