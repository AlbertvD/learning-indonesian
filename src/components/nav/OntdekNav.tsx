// The Ontdek section nav, shared by the two Ontdek destinations (Podcasts,
// Verhalen lezen) — the Ontdek-side twin of LerenNav. A thin wrapper over
// <SurfaceNav/> that pins the Ontdek items + active derivation; on desktop it's
// the switcher row, on mobile a "back to Ontdek" link, matching the Leren hub.
import { useLocation } from 'react-router-dom'
import { IconHeadphones, IconBook2, IconLanguage } from '@tabler/icons-react'
import { SurfaceNav } from './SurfaceNav'
import { useT } from '@/hooks/useT'

export function OntdekNav() {
  const T = useT()
  const { pathname } = useLocation()
  const active = pathname.startsWith('/lezen')
    ? 'lezen'
    : pathname.startsWith('/grammatica')
      ? 'grammatica'
      : 'podcasts'

  return (
    <SurfaceNav
      ariaLabel={T.nav.ontdek}
      activeKey={active}
      backTo="/ontdek"
      backLabel={T.nav.backToOntdek}
      items={[
        { key: 'podcasts', label: T.ontdek.podcastsTitle, icon: <IconHeadphones size={22} />, to: '/podcasts' },
        { key: 'lezen', label: T.ontdek.readerTitle, icon: <IconBook2 size={22} />, to: '/lezen' },
        { key: 'grammatica', label: T.ontdek.grammarTitle, icon: <IconLanguage size={22} />, to: '/grammatica' },
      ]}
    />
  )
}
