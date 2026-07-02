// src/pages/Lezen.tsx
import { useEffect, useState } from 'react'
import { Badge } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import {
  PageContainer,
  PageBody,
  PageHeader,
  ListCard,
  LoadingState,
  EmptyState,
} from '@/components/page/primitives'
import { IconBook2 } from '@tabler/icons-react'
import { textService, type TextListRow } from '@/services/textService'
import { rankReadableTexts } from '@/lib/reading'
import { useAuthStore } from '@/stores/authStore'
import { logError } from '@/lib/logger'
import { useT } from '@/hooks/useT'

/**
 * Lezen (Read) — the story list, ordered most-comprehensible-first for this learner
 * by per-learner lexical coverage (PRD #299). No readability badge (dropped in the
 * gate); ordering carries the leveling.
 */
export function Lezen() {
  const T = useT()
  const user = useAuthStore((s) => s.user)
  const [stories, setStories] = useState<TextListRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function fetchData() {
      if (!user) return
      try {
        const podcasts = await textService.listTexts()
        const ranked = await rankReadableTexts(podcasts, user.id)
        if (!cancelled) setStories(ranked.map((r) => r.item))
      } catch (err) {
        logError({ page: 'lezen', action: 'fetchData', error: err })
        notifications.show({
          color: 'red',
          title: T.common.error,
          message: T.common.somethingWentWrong,
        })
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    fetchData()
    return () => { cancelled = true }
  }, [user, T.common.error, T.common.somethingWentWrong])

  if (loading) {
    return (
      <PageContainer size="lg">
        <PageBody><LoadingState /></PageBody>
      </PageContainer>
    )
  }

  return (
    <PageContainer size="lg">
      <PageBody>
        <PageHeader title={T.reading.title} />
        {stories.length === 0 ? (
          <EmptyState icon={<IconBook2 size={48} />} message={T.reading.noStories} />
        ) : (
          stories.map((story) => (
            <ListCard
              key={story.id}
              to={`/lezen/${story.id}`}
              icon={<IconBook2 size={20} />}
              title={story.title}
              subtitle={story.description ?? undefined}
              trailing={story.level ? <Badge variant="light">{story.level}</Badge> : undefined}
            />
          ))
        )}
      </PageBody>
    </PageContainer>
  )
}
