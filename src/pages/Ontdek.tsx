// src/pages/Ontdek.tsx
//
// The "Ontdek" (Discover) tab — a thin hub for the immerse surfaces: Podcasts
// and the Story reader. Each is its own route (/podcasts, /lezen); the OntdekNav
// switcher moves between them.
//
// Landing shape mirrors Leren:
//   • Mobile — a hub landing of two shared cards (ListCard `feature` + a
//     per-surface tone), each opening its destination (which shows a back link).
//   • Desktop — no separate hub screen; the persistent switcher row is always
//     shown and /ontdek lands straight on the first surface (Podcasts), so
//     there's no "pick a card, then a menu appears" detour on a wide screen.
import { useEffect } from 'react'
import { useMediaQuery } from '@mantine/hooks'
import { SimpleGrid } from '@mantine/core'
import { IconHeadphones, IconBook2 } from '@tabler/icons-react'
import { PageContainer, PageBody, PageHeader, ListCard } from '@/components/page/primitives'
import { ONTDEK_VISITED_KEY, setFirstRunFlag } from '@/lib/firstRun'
import { useT } from '@/hooks/useT'
import { Podcasts } from './Podcasts'

export function Ontdek() {
  const T = useT()
  const isMobile = useMediaQuery('(max-width: 768px)') ?? false
  // First-run checklist step ③ (desktop program slice 3): done on first visit.
  useEffect(() => { setFirstRunFlag(ONTDEK_VISITED_KEY) }, [])

  // Desktop: land on the first surface with the persistent switcher (Podcasts
  // renders <OntdekNav/> itself), exactly as desktop /leren lands on Lessen.
  if (!isMobile) return <Podcasts />

  return (
    <PageContainer size="lg">
      <PageBody>
        <PageHeader title={T.ontdek.title} subtitle={T.ontdek.subtitle} />
        <SimpleGrid cols={{ base: 1 }} spacing="sm" mt="md">
          <ListCard
            feature
            tone="gold"
            to="/podcasts"
            icon={<IconHeadphones size={25} stroke={1.7} />}
            title={T.ontdek.podcastsTitle}
            subtitle={T.ontdek.podcastsDesc}
          />
          <ListCard
            feature
            tone="rail"
            to="/lezen"
            icon={<IconBook2 size={25} stroke={1.7} />}
            title={T.ontdek.readerTitle}
            subtitle={T.ontdek.readerDesc}
          />
        </SimpleGrid>
      </PageBody>
    </PageContainer>
  )
}
