// The Woordenlijsten checklist — the LEREN-tab surface for selectable word-lists
// (frequency bands + thematic packs). Loads the per-learner coverage model
// (get_collections_overview) and lets the learner toggle a list into their
// scheduler (set_collection_activation). Optimistic toggle with revert-on-error,
// mirroring useLessonActivation. The Voortgang coverage view reads the SAME model.
//
// Renders nothing when there are no published collections yet (the surface is
// additive — it appears once the first band is seeded), so it is safe to mount
// on the Lessons page before any collection exists.
import { useCallback, useEffect, useState } from 'react'
import { notifications } from '@mantine/notifications'
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

export function Woordenlijsten() {
  const T = useT()
  const userId = useAuthStore((s) => s.user?.id)
  const [collections, setCollections] = useState<CollectionOverview[]>([])
  const [savingIds, setSavingIds] = useState<ReadonlySet<string>>(new Set())

  useEffect(() => {
    if (!userId) return
    let cancelled = false
    getCollectionsOverview(userId)
      .then((rows) => { if (!cancelled) setCollections(rows) })
      .catch((err) => {
        if (cancelled) return
        // Render nothing on failure (the surface is additive — it only appears
        // once a band is seeded); the error is logged for the admin.
        logError({ page: 'woordenlijsten', action: 'load-overview', error: err })
      })
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

  // Additive surface: render nothing until at least one band is seeded, so it is
  // inert on the Lessons page until the collections content lands.
  if (collections.length === 0) return null

  return (
    <section className={classes.section} aria-label={T.collections.title}>
      <header className={classes.header}>
        <h2 className={classes.title}>{T.collections.title}</h2>
        <p className={classes.subtitle}>{T.collections.subtitle}</p>
      </header>

      <ul className={classes.list}>
        {collections.map((c) => (
          <li key={c.collectionId}>
            <WoordenlijstCard
              name={c.name}
              totalWords={c.totalWords}
              knownWords={c.knownWords}
              activated={c.isActivated}
              saving={savingIds.has(c.collectionId)}
              knownLabel={T.collections.wordsKnown}
              activateLabel={T.collections.activate}
              onToggle={(next) => toggle(c.collectionId, next)}
            />
          </li>
        ))}
      </ul>
    </section>
  )
}
