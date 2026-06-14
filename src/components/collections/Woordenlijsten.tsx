// The Woordenlijsten checklist — the LEREN-tab surface for selectable word-lists
// (frequency bands + thematic packs). Loads the per-learner coverage model
// (get_collections_overview) and lets the learner toggle a list into their
// scheduler (set_collection_activation). Optimistic toggle with revert-on-error,
// mirroring useLessonActivation. The Voortgang coverage view reads the SAME model.
//
// Display name + description come from i18n (keyed by slug) so the surface stays
// fully NL/EN consistent; the DB `name` is only a fallback for un-localized lists.
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { notifications } from '@mantine/notifications'
import {
  IconTrophy, IconToolsKitchen2, IconBodyScan, IconCalendarMonth,
  IconCloudRain, IconShirt, IconHome, IconClockHour4, IconVocabulary,
} from '@tabler/icons-react'
import { LoadingState, EmptyState } from '@/components/page/primitives'
import { useAuthStore } from '@/stores/authStore'
import { useT } from '@/hooks/useT'
import { logError } from '@/lib/logger'
import {
  getCollectionsOverview,
  setCollectionActivated,
  type CollectionOverview,
} from '@/lib/collections'
import { WoordenlijstCard } from './WoordenlijstCard'
import classes from './Woordenlijsten.module.css'

// Lead glyph per list. Frequency bands all share the trophy (rank conveys order);
// theme packs get a topical icon. Unknown slugs fall back to the generic glyph.
const THEME_ICONS: Record<string, ReactNode> = {
  'food-drink': <IconToolsKitchen2 size={20} />,
  'body-parts': <IconBodyScan size={20} />,
  'days-months-time': <IconCalendarMonth size={20} />,
  'nature-weather': <IconCloudRain size={20} />,
  'clothing': <IconShirt size={20} />,
  'household': <IconHome size={20} />,
  'daily-routine': <IconClockHour4 size={20} />,
}
function iconFor(c: CollectionOverview): ReactNode {
  if (c.kind === 'frequency') return <IconTrophy size={20} />
  return THEME_ICONS[c.slug] ?? <IconVocabulary size={20} />
}

export function Woordenlijsten() {
  const T = useT()
  const userId = useAuthStore((s) => s.user?.id)
  const [collections, setCollections] = useState<CollectionOverview[]>([])
  const [loading, setLoading] = useState(true)
  const [savingIds, setSavingIds] = useState<ReadonlySet<string>>(new Set())

  useEffect(() => {
    if (!userId) return
    let cancelled = false
    setLoading(true)
    getCollectionsOverview(userId)
      .then((rows) => { if (!cancelled) setCollections(rows) })
      .catch((err) => {
        if (cancelled) return
        logError({ page: 'woordenlijsten', action: 'load-overview', error: err })
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [userId])

  const toggle = useCallback(async (collectionId: string, next: boolean) => {
    if (!userId || savingIds.has(collectionId)) return
    const previous = collections
    setCollections((rows) =>
      rows.map((c) => (c.collectionId === collectionId ? { ...c, isActivated: next } : c)))
    setSavingIds((ids) => new Set(ids).add(collectionId))
    try {
      await setCollectionActivated(userId, collectionId, next)
      notifications.show({
        color: 'teal',
        message: next ? T.collections.activated : T.collections.deactivated,
      })
    } catch (err) {
      setCollections(previous)
      logError({ page: 'woordenlijsten', action: 'toggle-activation', error: err })
      notifications.show({
        color: 'red',
        title: T.collections.activationFailed,
        message: T.common.somethingWentWrong,
      })
    } finally {
      setSavingIds((ids) => {
        const nextIds = new Set(ids)
        nextIds.delete(collectionId)
        return nextIds
      })
    }
  }, [userId, savingIds, collections, T])

  if (loading) return <LoadingState />
  if (collections.length === 0) {
    return <EmptyState icon={<IconVocabulary size={40} />} message={T.collections.empty} />
  }

  return (
    <section className={classes.section} aria-label={T.collections.title}>
      <p className={classes.subtitle}>{T.collections.subtitle}</p>
      <ul className={classes.list}>
        {collections.map((c) => {
          const meta = T.collections.lists[c.slug]
          return (
            <li key={c.collectionId}>
              <WoordenlijstCard
                name={meta?.name ?? c.name}
                description={meta?.description ?? ''}
                kind={c.kind}
                rankCutoff={c.rankCutoff}
                icon={iconFor(c)}
                totalWords={c.totalWords}
                knownWords={c.knownWords}
                eligibleNow={c.eligibleNow}
                gain={c.gain}
                activated={c.isActivated}
                saving={savingIds.has(c.collectionId)}
                knownLabel={T.collections.known}
                eligibleLabel={T.collections.eligible}
                gainWordsLabel={T.collections.gainWords}
                addedLabel={T.collections.added}
                activateLabel={T.collections.activate}
                onToggle={(next) => toggle(c.collectionId, next)}
              />
            </li>
          )
        })}
      </ul>
    </section>
  )
}
