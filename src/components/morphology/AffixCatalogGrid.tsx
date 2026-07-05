// The sequenced affix catalog grid. Each tile REUSES the lesson tile pattern
// (two nested bars: % beheerst over % geoefend + level badge + status pill) —
// nothing morphology-specific is invented (capstone §2). Tiles are pre-sorted by
// teaching rank by buildAffixCatalog; the rank shows as the tile number.

import { SimpleGrid } from '@mantine/core'
import { LessonCard } from '@/components/lessons/LessonCard'
import { useT } from '@/hooks/useT'
import type { AffixCatalogTile, AffixType } from '@/lib/morphology'

// Affix-type banners drawn from the brand ramp (tamarind / teal / gold /
// batik-green) — each type keeps a distinct hue, but all four stay in the
// warm-editorial palette instead of the former off-brand indigo/purple/sky set.
const TYPE_GRADIENT: Record<AffixType, string> = {
  prefix: 'linear-gradient(135deg, #C64A26 0%, #8A3117 100%)',        // tamarind
  suffix: 'linear-gradient(135deg, #17867F 0%, #0C5A55 100%)',        // teal
  confix: 'linear-gradient(135deg, #B4862F 0%, #7E5F1E 100%)',        // gold
  reduplication: 'linear-gradient(135deg, #3A6A5C 0%, #1F3D36 100%)', // batik green
}

type Tone = 'success' | 'warning' | 'danger' | 'accent' | 'neutral'

function tileStatus(
  tile: AffixCatalogTile,
  T: ReturnType<typeof useT>,
): { tone: Tone; label: string } {
  if (!tile.available) return { tone: 'neutral', label: T.morphology.locked }
  if (tile.progress.totalCount === 0) return { tone: 'neutral', label: T.morphology.available }
  if (tile.progress.funnel.at_risk > 0) return { tone: 'danger', label: T.morphology.inProgress }
  if (tile.progress.label === 'mastered') return { tone: 'success', label: T.morphology.masteredStatus }
  if (tile.progress.practisedCount > 0) return { tone: 'accent', label: T.morphology.inProgress }
  return { tone: 'neutral', label: T.morphology.available }
}

export function AffixCatalogGrid({ tiles }: { tiles: AffixCatalogTile[] }) {
  const T = useT()
  return (
    <SimpleGrid cols={{ base: 1, xs: 2, md: 3 }} spacing="md">
      {tiles.map((tile) => {
        const total = tile.progress.totalCount
        const masteredPct = total > 0 ? Math.round((tile.progress.masteredCount / total) * 100) : null
        const practisedPct = total > 0 ? Math.round((tile.progress.practisedCount / total) * 100) : null
        return (
          <LessonCard
            key={tile.affix}
            banner={
              <div
                aria-hidden="true"
                style={{ position: 'absolute', inset: 0, background: TYPE_GRADIENT[tile.affixType] }}
              />
            }
            orderIndex={tile.rank}
            title={tile.affix}
            level={tile.cefrLevel}
            grammarTopics={tile.gloss}
            practiced={{ label: T.morphology.practisedLabel, percent: tile.available ? practisedPct : null }}
            mastered={{ label: T.morphology.masteredLabel, percent: tile.available ? masteredPct : null }}
            status={tileStatus(tile, T)}
            to={`/morphology?affix=${encodeURIComponent(tile.affix)}`}
          />
        )
      })}
    </SimpleGrid>
  )
}
