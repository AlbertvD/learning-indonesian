// src/pages/Ontdek.tsx
//
// The "Ontdek" (Discover) tab — a thin hub for the immerse surfaces. Two choices
// only (Podcasts, Story reader); no further structure until content warrants it
// (foundation plan §7.1). Each routes into its existing page.
import { useEffect } from 'react'
import { IconHeadphones, IconBook2 } from '@tabler/icons-react'
import { PageContainer, PageBody, PageHeader } from '@/components/page/primitives'
import { HubCard } from '@/components/nav/HubCard'
import { ONTDEK_VISITED_KEY, setFirstRunFlag } from '@/lib/firstRun'
import { useT } from '@/hooks/useT'
import classes from './Ontdek.module.css'

export function Ontdek() {
  const T = useT()
  // First-run checklist step ③ (desktop program slice 3): done on first visit.
  useEffect(() => { setFirstRunFlag(ONTDEK_VISITED_KEY) }, [])
  return (
    <PageContainer size="lg">
      <PageBody>
        <PageHeader title={T.ontdek.title} subtitle={T.ontdek.subtitle} />
        <div className={classes.grid}>
          <HubCard
            to="/podcasts"
            icon={<IconHeadphones size={24} />}
            title={T.ontdek.podcastsTitle}
            description={T.ontdek.podcastsDesc}
          />
          <HubCard
            to="/lezen"
            icon={<IconBook2 size={24} />}
            title={T.ontdek.readerTitle}
            description={T.ontdek.readerDesc}
          />
        </div>
      </PageBody>
    </PageContainer>
  )
}
