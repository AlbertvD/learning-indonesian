// src/pages/Lezen.tsx
import { useEffect, useMemo, useState } from 'react'
import { SimpleGrid, Stack } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import {
  PageContainer,
  PageBody,
  PageHeader,
  SectionHeading,
  ListCard,
  LoadingState,
  EmptyState,
} from '@/components/page/primitives'
import { IconBook2 } from '@tabler/icons-react'
import { OntdekNav } from '@/components/nav/OntdekNav'
import { textService, type TextListRow } from '@/services/textService'
import { rankReadableTexts } from '@/lib/reading'
import { groupByCefrLevel } from '@/lib/cefr'
import { useAuthStore } from '@/stores/authStore'
import { logError } from '@/lib/logger'
import { useT } from '@/hooks/useT'

/**
 * Lezen (Read) — the story list, grouped into CEFR level sections (A1 → B2 → …).
 * Within each level, stories stay ordered most-comprehensible-first for this
 * learner by per-learner lexical coverage (PRD #299): `groupByCefrLevel` is
 * stable, so the readability rank IS the in-section order.
 */
export function Lezen() {
  const T = useT()
  const user = useAuthStore((s) => s.user)
  const [stories, setStories] = useState<TextListRow[]>([])
  const [loading, setLoading] = useState(true)

  const levelGroups = useMemo(() => groupByCefrLevel(stories, (s) => s.level), [stories])

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
        <OntdekNav />
        <PageHeader title={T.reading.title} subtitle={T.ontdek.readerDesc} />
        {stories.length === 0 ? (
          <EmptyState icon={<IconBook2 size={48} />} message={T.reading.noStories} />
        ) : (
          <Stack gap="lg" mt="md">
            {levelGroups.map((group) => (
              <Stack gap="sm" key={group.level}>
                <SectionHeading>
                  {group.isUnknown ? T.common.levelOther : `${T.common.levelPrefix} ${group.level}`}
                </SectionHeading>
                <SimpleGrid cols={{ base: 1 }} spacing="sm">
                  {group.items.map((story) => (
                    <ListCard
                      key={story.id}
                      tone="rail"
                      to={`/lezen/${story.id}`}
                      icon={<IconBook2 size={20} />}
                      title={story.title}
                      subtitle={story.description ?? undefined}
                    />
                  ))}
                </SimpleGrid>
              </Stack>
            ))}
          </Stack>
        )}
      </PageBody>
    </PageContainer>
  )
}
