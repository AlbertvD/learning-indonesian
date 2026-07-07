// Welkom — the day-one loanword-bridge onboarding (Bet-1 §3.4).
//
// Flow: reveal a wall of Dutch→Indonesian loanword pairs ("you already know
// this"), one tap activates the `nl-leenwoorden` theme collection via the
// existing set_collection_activation RPC and starts a first session (the
// collection eligibility gate makes the words schedulable — zero session-engine
// changes). Skippable at every step. The slice-2 "instaptoets" branch link is
// intentionally ABSENT until the placement probe ships (§3.4), not stubbed.
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { IconArrowRight } from '@tabler/icons-react'
import { PageContainer, PageBody, HeroCard } from '@/components/page/primitives'
import { useAuthStore } from '@/stores/authStore'
import { getCollectionsOverview, setCollectionActivated } from '@/lib/collections'
import { logError } from '@/lib/logger'
import { nl as T } from '@/lib/i18n'
import classes from './Welkom.module.css'

const COLLECTION_SLUG = 'nl-leenwoorden'

// Curated reveal wall — the most striking everyday pairs, a deliberate mix of
// spelling-shifted "aha" loans (koelkast→kulkas) and near-identical ones
// (gratis→gratis). Every pair is a confirmed member of nl-leenwoorden.
const REVEAL: ReadonlyArray<{ nl: string; id: string }> = [
  { nl: 'koelkast', id: 'kulkas' },
  { nl: 'handdoek', id: 'handuk' },
  { nl: 'kantoor', id: 'kantor' },
  { nl: 'paspoort', id: 'paspor' },
  { nl: 'politie', id: 'polisi' },
  { nl: 'kantine', id: 'kantin' },
  { nl: 'knalpot', id: 'knalpot' },
  { nl: 'rekening', id: 'rekening' },
  { nl: 'gratis', id: 'gratis' },
  { nl: 'dokter', id: 'dokter' },
]

export function Welkom() {
  const navigate = useNavigate()
  const user = useAuthStore((state) => state.user)
  const [activating, setActivating] = useState(false)

  async function handleStart() {
    if (!user) {
      navigate('/')
      return
    }
    setActivating(true)
    try {
      const overview = await getCollectionsOverview(user.id)
      const collection = overview.find((c) => c.slug === COLLECTION_SLUG)
      if (!collection) throw new Error(`collection ${COLLECTION_SLUG} not found`)
      if (!collection.isActivated) {
        await setCollectionActivated(user.id, collection.collectionId, true)
      }
      navigate('/session')
    } catch (err) {
      notifications.show({
        color: 'red',
        title: T.welkom.headline,
        message: T.welkom.activateFailed,
      })
      logError({ page: 'Welkom', action: 'activateAndStart', error: err })
      setActivating(false)
    }
  }

  return (
    <PageContainer>
      <PageBody>
        <HeroCard title={T.welkom.headline}>
          <p className={classes.intro}>{T.welkom.intro}</p>

          <div className={classes.wall}>
            {REVEAL.map((pair) => (
              <div className={classes.pair} key={pair.id}>
                <span className={classes.src}>{pair.nl}</span>
                <IconArrowRight
                  className={classes.arrow}
                  size={16}
                  aria-label={T.welkom.arrowLabel}
                />
                <span className={classes.dest}>{pair.id}</span>
              </div>
            ))}
          </div>

          <div className={classes.ctaBlock}>
            <Button
              size="lg"
              onClick={handleStart}
              loading={activating}
            >
              {/* default filled → primaryColor 'tamarind', which contrasts on
                  BOTH hero gradients (dark-green in dark mode, light in light mode);
                  variant="white" would vanish on the light-mode hero. */}
              {T.welkom.cta}
            </Button>
            <p className={classes.hint}>{T.welkom.ctaHint}</p>
            <button type="button" className={classes.later} onClick={() => navigate('/')}>
              {T.welkom.later}
            </button>
          </div>
        </HeroCard>
      </PageBody>
    </PageContainer>
  )
}
