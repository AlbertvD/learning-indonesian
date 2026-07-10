// The Affix Trainer page (the morphology Study-tab surface). One route, two
// views: the sequenced affix catalog grid (no ?affix) and a single affix's
// detail (?affix=<label>). Reads via lib/morphology; practice LAUNCHES a scoped
// session (it hosts no drills). Friendly loading/error/empty states per CLAUDE.md.

import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Alert } from '@mantine/core'
import { IconAlertCircle, IconAbc, IconSearchOff } from '@tabler/icons-react'
import { PageContainer, PageBody, PageHeader, LoadingState, EmptyState } from '@/components/page/primitives'
import { LerenNav } from '@/components/lessons/LerenNav'
import { AffixCatalogGrid, AffixDetailView } from '@/components/morphology'
import { getAffixCatalog, getAffixDetail, type AffixCatalogTile, type AffixDetail } from '@/lib/morphology'
import { fetchSessionAudioMap, type SessionAudioMap } from '@/services/audioService'
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
  const [audioMap, setAudioMap] = useState<SessionAudioMap>(new Map())

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
          if (!result) {
            setNotFound(true)
          } else {
            // Audio is enrichment, not core data: fetch it AFTER the detail
            // resolves (the word list depends on detail's families/examples),
            // and never let a failure here fail the detail view itself.
            const words = [
              ...result.families.flatMap((family) => family.forms.map((form) => form.derivedText)),
              ...result.examples.map((example) => example.derivedText),
            ]
            try {
              const map = await fetchSessionAudioMap(words.map((text) => ({ text, voiceId: null })))
              if (!cancelled) setAudioMap(map)
            } catch (audioErr) {
              logError({ page: 'affix-trainer', action: 'fetchAffixAudio', error: audioErr })
            }
          }
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
        {/* Catalog view only: the detail view has its own BackLink to /morphology,
            so LerenNav (whose mobile form shows a "terug naar leren" link) would
            be a redundant second back affordance there. */}
        {!affix && <LerenNav />}
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

        {!loading && !error && affix && detail && <AffixDetailView detail={detail} audioMap={audioMap} />}

        {!loading && !error && !affix && tiles && (
          tiles.length === 0
            ? <EmptyState icon={<IconAbc size={40} />} message={T.morphology.emptyCatalog} />
            : <AffixCatalogGrid tiles={tiles} />
        )}
      </PageBody>
    </PageContainer>
  )
}
