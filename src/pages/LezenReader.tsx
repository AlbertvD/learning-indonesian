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
import { podcastService } from '@/services/podcastService'
import { loadReader, type LoadedReader } from '@/lib/reading'
import { GlossableText } from '@/components/reading'
import { logError } from '@/lib/logger'
import { useT } from '@/hooks/useT'

/**
 * Lezen reader — one story, silent + tap-to-gloss (PRD #299). No audio in Phase 1.
 */
export function LezenReader() {
  const { podcastId } = useParams<{ podcastId: string }>()
  const T = useT()
  const [reader, setReader] = useState<LoadedReader | null>(null)
  const [title, setTitle] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function fetchData() {
      if (!podcastId) return
      try {
        const podcast = await podcastService.getPodcast(podcastId)
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
            <GlossableText text={reader.text} glossFor={reader.glossFor} />
          </>
        ) : null}
      </PageBody>
    </PageContainer>
  )
}
