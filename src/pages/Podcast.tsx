// src/pages/Podcast.tsx
import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Text, Button, Paper, Group, Stack, Tabs, Anchor } from '@mantine/core'
import { IconChevronLeft, IconMicrophone } from '@tabler/icons-react'
import {
  PageContainer,
  PageBody,
  PageHeader,
  LoadingState,
  EmptyState,
} from '@/components/page/primitives'
import { podcastService, type Podcast, type TranscriptSegment } from '@/services/podcastService'
import { findActiveWord, type ActiveWord } from '@/lib/followAlong'
import { useAuthStore } from '@/stores/authStore'
import { logError } from '@/lib/logger'
import { notifications } from '@mantine/notifications'
import { useT } from '@/hooks/useT'

/**
 * Segmented, follow-along transcript. The Indonesian tab (`lang='id'`) highlights
 * the active *word* (it's what the audio speaks, and what STT word-timed); the
 * translation tabs are only sentence-aligned, so they highlight the active *line*.
 * Clicking any line seeks the audio to that sentence's start. Falls back to a
 * prose blob when the episode has no segments (legacy / un-timed rows).
 */
export function FollowAlongTranscript({
  segments,
  lang,
  fallback,
  active,
  onSeek,
}: {
  segments: TranscriptSegment[] | null
  lang: 'id' | 'nl' | 'en'
  fallback: string
  active: ActiveWord | null
  onSeek: (segmentIdx: number) => void
}) {
  const activeLineRef = useRef<HTMLParagraphElement | null>(null)

  // Keep the active line in view without yanking the page when it's already visible.
  useEffect(() => {
    activeLineRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [active?.segmentIdx])

  if (!segments || segments.length === 0) {
    return <Text style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{fallback}</Text>
  }

  return (
    <Stack gap="sm">
      {segments.map((seg, idx) => {
        const isActiveLine = active?.segmentIdx === idx
        const timed = lang === 'id' && seg.words
        return (
          <Text
            key={seg.idx}
            ref={isActiveLine ? activeLineRef : undefined}
            data-active-line={isActiveLine || undefined}
            onClick={() => onSeek(idx)}
            style={{ cursor: 'pointer', lineHeight: 1.8, borderRadius: 4, padding: '2px 4px' }}
            bg={!timed && isActiveLine ? 'var(--mantine-primary-color-light)' : undefined}
          >
            {timed
              ? seg.words!.map((w, wi) => {
                  const isActiveWord = isActiveLine && active?.wordIdx === wi
                  return (
                    <span key={wi}>
                      <Text
                        component="span"
                        data-active={isActiveWord || undefined}
                        fw={isActiveWord ? 700 : 400}
                        bg={isActiveWord ? 'var(--mantine-primary-color-light)' : undefined}
                        style={{ borderRadius: 4, padding: isActiveWord ? '0 2px' : undefined }}
                      >
                        {w.word}
                      </Text>
                      {wi < seg.words!.length - 1 ? ' ' : ''}
                    </span>
                  )
                })
              : seg[lang]}
          </Text>
        )
      })}
    </Stack>
  )
}

export function Podcast() {
  const { podcastId } = useParams<{ podcastId: string }>()
  const navigate = useNavigate()
  const T = useT()
  const user = useAuthStore((state) => state.user)
  const lang = useAuthStore((state) => state.profile?.language ?? 'nl')

  const [podcast, setPodcast] = useState<Podcast | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const audioRef = useRef<HTMLAudioElement>(null)
  const [currentTime, setCurrentTime] = useState(0)

  useEffect(() => {
    async function fetchData() {
      if (!podcastId || !user) return
      try {
        const podcastData = await podcastService.getPodcast(podcastId)
        setPodcast(podcastData)
      } catch (err) {
        logError({ page: 'podcast', action: 'fetchData', error: err })
        notifications.show({ color: 'red', title: T.common.error, message: T.podcast.failedToLoad })
        setError(true)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [podcastId, user, T.common.error, T.podcast.failedToLoad])

  if (loading) {
    return (
      <PageContainer size="md">
        <PageBody>
          <LoadingState />
        </PageBody>
      </PageContainer>
    )
  }

  if (error || !podcast) {
    return (
      <PageContainer size="md">
        <PageBody>
          <EmptyState
            icon={<IconMicrophone size={48} />}
            message="Failed to load podcast."
          />
        </PageBody>
      </PageContainer>
    )
  }

  const audioUrl = podcastService.getAudioUrl(podcast.audio_path)
  const segments = podcast.transcript_segments ?? null
  // Cheap (~150 words, ~4×/s); not a hook so it can live after the early returns.
  const active = segments ? findActiveWord(segments, currentTime) : null

  const seekToSegment = (segmentIdx: number) => {
    const start = segments?.[segmentIdx]?.words?.[0]?.start
    if (audioRef.current && start != null) {
      audioRef.current.currentTime = start
      void audioRef.current.play().catch(() => {})
    }
  }

  return (
    <PageContainer size="md">
      <PageBody>
        <PageHeader
          title={podcast.title}
          subtitle={podcast.description ?? undefined}
          action={(
            <Button
              variant="subtle"
              color="gray"
              leftSection={<IconChevronLeft size={16} />}
              onClick={() => navigate('/podcasts')}
            >
              {T.podcast.backToList}
            </Button>
          )}
        />

        <Paper withBorder p="xl" radius="md">
          <Stack gap="lg">
            <Group>
              <IconMicrophone size={32} color="var(--accent-primary)" />
            </Group>

            <audio
              ref={audioRef}
              controls
              style={{ width: '100%' }}
              src={audioUrl}
              onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
            />

            <Tabs defaultValue="indonesian">
              <Tabs.List>
                <Tabs.Tab value="indonesian">{T.podcast.transcriptIndonesian}</Tabs.Tab>
                <Tabs.Tab value="translation">
                  {lang === 'nl' ? T.podcast.transcriptDutch : T.podcast.transcriptEnglish}
                </Tabs.Tab>
              </Tabs.List>

              <Tabs.Panel value="indonesian" pt="md">
                <FollowAlongTranscript
                  segments={segments}
                  lang="id"
                  fallback={podcast.transcript_indonesian || T.podcast.noTranscriptIndonesian}
                  active={active}
                  onSeek={seekToSegment}
                />
              </Tabs.Panel>

              <Tabs.Panel value="translation" pt="md">
                <FollowAlongTranscript
                  segments={segments}
                  lang={lang === 'nl' ? 'nl' : 'en'}
                  fallback={
                    lang === 'nl'
                      ? podcast.transcript_dutch || T.podcast.noTranscriptDutch
                      : podcast.transcript_english || T.podcast.noTranscriptEnglish
                  }
                  active={active}
                  onSeek={seekToSegment}
                />
              </Tabs.Panel>
            </Tabs>

            {podcast.attribution && (
              <Text size="xs" c="dimmed">
                {'Bron: '}
                <Anchor href={podcast.attribution.source_url} target="_blank" rel="noopener noreferrer" inherit>
                  {podcast.attribution.source_title}
                </Anchor>
                {` — ${podcast.attribution.author} · `}
                <Anchor href={podcast.attribution.license_url} target="_blank" rel="noopener noreferrer" inherit>
                  {podcast.attribution.license}
                </Anchor>
              </Text>
            )}
          </Stack>
        </Paper>
      </PageBody>
    </PageContainer>
  )
}
