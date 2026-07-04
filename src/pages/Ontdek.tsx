// src/pages/Ontdek.tsx
//
// The "Ontdek" (Discover) tab — a thin hub for the immerse surfaces. Two choices
// only (Podcasts, Story reader); no further structure until content warrants it
// (foundation plan §7.1). Each routes into its existing page.
//
// Desktop slice 4: the two entries are featured MediaShowcaseCards side by side
// (stacked on mobile), their banners echoing the deep batik-green of the rail —
// the brand constant — instead of two thin list rows lost in the page.
import { useEffect } from 'react'
import { useMediaQuery } from '@mantine/hooks'
import { IconHeadphones, IconBook2 } from '@tabler/icons-react'
import { PageContainer, PageBody, PageHeader, MediaShowcaseCard } from '@/components/page/primitives'
import { ONTDEK_VISITED_KEY, setFirstRunFlag } from '@/lib/firstRun'
import { useT } from '@/hooks/useT'
import classes from './Ontdek.module.css'

function BannerPanel({ tone, icon }: { tone: 'gold' | 'ink'; icon: React.ReactNode }) {
  return (
    <div className={classes.panel} data-tone={tone} aria-hidden="true">
      <span className={classes.panelHalo} />
      <span className={classes.panelIcon}>{icon}</span>
    </div>
  )
}

export function Ontdek() {
  const T = useT()
  // Desktop keeps the roomy featured cards side-by-side; on mobile the two cards
  // divide the viewport height (Ontdek.module.css), so `featured` is dropped there
  // to free the fixed 200px banner the featured variant enforces.
  const isMobile = useMediaQuery('(max-width: 768px)') ?? false
  // First-run checklist step ③ (desktop program slice 3): done on first visit.
  useEffect(() => { setFirstRunFlag(ONTDEK_VISITED_KEY) }, [])
  return (
    <PageContainer size="lg" fit={isMobile}>
      <PageBody variant={isMobile ? 'fit' : 'auto'}>
        <PageHeader title={T.ontdek.title} subtitle={T.ontdek.subtitle} />
        <div className={classes.grid}>
          <MediaShowcaseCard
            featured={!isMobile}
            banner={<BannerPanel tone="gold" icon={<IconHeadphones size={isMobile ? 42 : 56} stroke={1.6} />} />}
            eyebrow={T.ontdek.podcastsEyebrow}
            title={T.ontdek.podcastsTitle}
            subtitle={T.ontdek.podcastsDesc}
            cta={T.ontdek.podcastsCta}
            to="/podcasts"
          />
          <MediaShowcaseCard
            featured={!isMobile}
            banner={<BannerPanel tone="ink" icon={<IconBook2 size={isMobile ? 42 : 56} stroke={1.6} />} />}
            eyebrow={T.ontdek.readerEyebrow}
            title={T.ontdek.readerTitle}
            subtitle={T.ontdek.readerDesc}
            cta={T.ontdek.readerCta}
            to="/lezen"
          />
        </div>
      </PageBody>
    </PageContainer>
  )
}
