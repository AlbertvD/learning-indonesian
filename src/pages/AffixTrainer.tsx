// The Affix Trainer page (the morphology Study-tab surface). One route, two
// views: the sequenced affix catalog grid (no ?affix) and a single affix's
// detail (?affix=<label>). Reads via lib/morphology; practice LAUNCHES a scoped
// session (it hosts no drills). Friendly loading/error/empty states per CLAUDE.md.

import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Alert } from '@mantine/core'
import { IconAlertCircle, IconAbc, IconSearchOff } from '@tabler/icons-react'
import { PageContainer, PageBody, PageHeader, LoadingState, EmptyState } from '@/components/page/primitives'
import { AffixCatalogGrid, AffixDetailView } from '@/components/morphology'
import { getAffixCatalog, getAffixDetail, type AffixCatalogTile, type AffixDetail } from '@/lib/morphology'
import { useAuthStore } from '@/stores/authStore'
import { useT } from '@/hooks/useT'
import { logError } from '@/lib/logger'

export function AffixTrainer() {
  const { user, profile } = useAuthStore()
  const T = useT()
  const [searchParams] = useSearchParams()
  const affix = searchParams.get('affix')
  const language = (profile?.language ?? 'nl') as 'nl' | 'en'

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tiles, setTiles] = useState<AffixCatalogTile[] | null>(null)
  const [detail, setDetail] = useState<AffixDetail | null>(null)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    if (!user) return
    let cancelled = false
    const load = async () => {
      setLoading(true)
      setError(null)
      setNotFound(false)
      try {
        if (affix) {
          const result = await getAffixDetail(user.id, affix, language)
          if (cancelled) return
          if (!result) setNotFound(true)
          setDetail(result)
        } else {
          const result = await getAffixCatalog(user.id, language)
          if (cancelled) return
          setTiles(result)
        }
      } catch (err) {
        if (cancelled) return
        logError({ page: 'affix-trainer', action: affix ? 'getAffixDetail' : 'getAffixCatalog', error: err })
        setError(T.morphology.loadError)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [user, affix, language, T.morphology.loadError])

  return (
    <PageContainer size="lg">
      <PageBody>
        {!affix && <PageHeader title={T.morphology.title} subtitle={T.morphology.subtitle} />}

        {loading && <LoadingState caption={T.morphology.title} />}

        {!loading && error && (
          <Alert icon={<IconAlertCircle size={16} />} color="red" title={T.morphology.title}>
            {error}
          </Alert>
        )}

        {!loading && !error && affix && notFound && (
          <EmptyState icon={<IconSearchOff size={40} />} message={T.morphology.notFound} />
        )}

        {!loading && !error && affix && detail && <AffixDetailView detail={detail} />}

        {!loading && !error && !affix && tiles && (
          tiles.length === 0
            ? <EmptyState icon={<IconAbc size={40} />} message={T.morphology.emptyCatalog} />
            : <AffixCatalogGrid tiles={tiles} />
        )}
      </PageBody>
    </PageContainer>
  )
}
