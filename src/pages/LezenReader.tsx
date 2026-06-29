// src/pages/LezenReader.tsx
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Anchor, Group } from '@mantine/core'
import { IconArrowLeft } from '@tabler/icons-react'
import { notifications } from '@mantine/notifications'
import {
  PageContainer,
  PageBody,
  PageHeader,
  LoadingState,
} from '@/components/page/primitives'
import { textService } from '@/services/textService'
import { loadReader, harvestWord, type LoadedReader } from '@/lib/reading'
import { GlossableText } from '@/components/reading'
import { logError } from '@/lib/logger'
import { useT } from '@/hooks/useT'
import { useAuthStore } from '@/stores/authStore'

/**
 * Lezen reader — one story, silent + tap-to-gloss (PRD #299). No audio in Phase 1.
 */
export function LezenReader() {
  const { podcastId } = useParams<{ podcastId: string }>()
  const T = useT()
  const userId = useAuthStore((s) => s.user?.id)
  const [reader, setReader] = useState<LoadedReader | null>(null)
  const [title, setTitle] = useState('')
  const [loading, setLoading] = useState(true)

  // Harvest a tapped word into the learner's reading set (reader §4). Membership
  // only — eligibility rides the existing gate-OR, state is minted on first review.
  // Throws on failure so GlossableText keeps the button in its pre-confirm state.
  async function handleHarvest(itemId: string) {
    if (!userId) return
    try {
      await harvestWord(userId, itemId)
      notifications.show({ color: 'teal', message: T.reading.harvestedToast })
    } catch (err) {
      logError({ page: 'lezen-reader', action: 'harvestWord', error: err })
      notifications.show({
        color: 'red',
        title: T.reading.harvestFailed,
        message: T.common.somethingWentWrong,
      })
      throw err
    }
  }

  useEffect(() => {
    let cancelled = false
    async function fetchData() {
      if (!podcastId) return
      try {
        const podcast = await textService.getText(podcastId)
        const loaded = await loadReader(podcast)
        if (!cancelled) {
          setTitle(podcast.title)
          setReader(loaded)
        }
      } catch (err) {
        logError({ page: 'lezen-reader', action: 'fetchData', error: err })
        notifications.show({
          color: 'red',
          title: T.reading.failedToLoad,
          message: T.common.somethingWentWrong,
        })
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    fetchData()
    return () => { cancelled = true }
  }, [podcastId, T.reading.failedToLoad, T.common.somethingWentWrong])

  return (
    <PageContainer size="md">
      <PageBody>
        <Group mb="sm">
          <Anchor component={Link} to="/lezen" size="sm">
            <Group gap={4}><IconArrowLeft size={16} />{T.reading.backToList}</Group>
          </Anchor>
        </Group>
        {loading ? (
          <LoadingState />
        ) : reader ? (
          <>
            <PageHeader title={title} />
            <GlossableText text={reader.text} glossFor={reader.glossFor} onHarvest={userId ? handleHarvest : undefined} />
          </>
        ) : null}
      </PageBody>
    </PageContainer>
  )
}
