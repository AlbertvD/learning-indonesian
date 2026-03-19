// src/pages/Podcasts.tsx
import { useEffect, useState } from 'react'
import { Container, Center, Loader } from '@mantine/core'
import { Link } from 'react-router-dom'
import { IconChevronRight } from '@tabler/icons-react'
import { podcastService, type Podcast } from '@/services/podcastService'
import { logError } from '@/lib/logger'
import { notifications } from '@mantine/notifications'
import { useT } from '@/hooks/useT'
import classes from './Podcasts.module.css'

export function Podcasts() {
  const T = useT()
  const [podcasts, setPodcasts] = useState<Podcast[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchData() {
      try {
        const data = await podcastService.getPodcasts()
        setPodcasts(data)
      } catch (err) {
        logError({ page: 'podcasts', action: 'fetchData', error: err })
        notifications.show({ color: 'red', title: T.common.error, message: T.common.somethingWentWrong })
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [T.common.error, T.common.somethingWentWrong])

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return null
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  if (loading) {
    return (
      <Center h="50vh">
        <Loader size="xl" color="violet" />
      </Center>
    )
  }

  return (
    <Container size="lg" className={classes.podcasts}>
      <div className={classes.header}>
        <div className={classes.displaySm}>{T.nav.podcasts}</div>
        <div className={classes.bodySm}>{T.podcast.episodes(podcasts.length)}</div>
      </div>

      <div className={classes.podcastList}>
        {podcasts.map((podcast, i) => {
          const duration = formatDuration(podcast.duration_seconds)
          return (
            <Link key={podcast.id} to={`/podcast/${podcast.id}`} className={classes.podcastCard}>
              <div className={classes.podcastNum}>{String(i + 1).padStart(2, '0')}</div>
              <div className={classes.podcastInfo}>
                <div className={classes.podcastTitle}>{podcast.title}</div>
                {podcast.description && (
                  <div className={classes.podcastDescription}>{podcast.description}</div>
                )}
                <div className={classes.podcastMeta}>
                  {podcast.level && (
                    <span className={`${classes.badge} ${classes.badgePurple}`}>{podcast.level}</span>
                  )}
                  {duration && <span className={classes.podcastDuration}>{duration}</span>}
                </div>
              </div>
              <span className={classes.podcastArrow}><IconChevronRight size={15} /></span>
            </Link>
          )
        })}

        {podcasts.length === 0 && (
          <Center h="20vh">
            <div className={classes.bodySm}>{T.podcast.noPodcasts}</div>
          </Center>
        )}
      </div>
    </Container>
  )
}
