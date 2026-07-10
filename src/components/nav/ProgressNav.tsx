// The Voortgang section nav, shared by the five progress details (Woordenschat,
// Grammatica, Morfologie, Vaardigheden, Tijd) — the Voortgang-side twin of
// LerenNav/OntdekNav. Unlike those two, every detail lives on the SAME route
// (`/progress`), switched by `?tab=` rather than by pathname — so `activeKey`
// is derived from the search param, not the location. A thin wrapper over
// <SurfaceNav/>, which owns the desktop switcher row / mobile "back to
// Voortgang" link, matching the Leren/Ontdek hub shape
// (docs/plans/2026-07-09-voortgang-hub-redesign.md).
import { useSearchParams } from 'react-router-dom'
import { IconBook, IconLanguage, IconPuzzle, IconTarget, IconFlame } from '@tabler/icons-react'
import { SurfaceNav } from './SurfaceNav'
import { useT } from '@/hooks/useT'

export function ProgressNav() {
  const T = useT()
  const [searchParams] = useSearchParams()
  // No/unknown tab defaults to Woordenschat — the desktop landing detail
  // (Progress.tsx mirrors Lessons.tsx: desktop has no separate hub screen).
  const active = searchParams.get('tab') ?? 'woorden'

  return (
    <SurfaceNav
      ariaLabel={T.nav.progress}
      activeKey={active}
      backTo="/progress"
      backLabel={T.nav.backToProgress}
      items={[
        { key: 'woorden', label: T.progress.tabWoordenschat, icon: <IconBook size={22} />, to: '/progress?tab=woorden' },
        { key: 'grammar', label: T.progress.tabGrammar, icon: <IconLanguage size={22} />, to: '/progress?tab=grammar' },
        { key: 'morfologie', label: T.progress.tabMorphology, icon: <IconPuzzle size={22} />, to: '/progress?tab=morfologie' },
        { key: 'skills', label: T.progress.tabSkills, icon: <IconTarget size={22} />, to: '/progress?tab=skills' },
        { key: 'time', label: T.progress.tabTime, icon: <IconFlame size={22} />, to: '/progress?tab=time' },
      ]}
    />
  )
}
