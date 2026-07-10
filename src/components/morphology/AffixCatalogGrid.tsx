// The sequenced affix catalog grid. Each tile REUSES the lesson tile pattern
// (two nested bars: % beheerst over % geoefend + level badge + status pill) —
// nothing morphology-specific is invented (capstone §2). Tiles are pre-sorted by
// teaching rank by buildAffixCatalog; the rank shows as the tile number.
//
// The two bars are split by capability-type class (review P1), not by the
// generic practised/mastered pair: recognition (recognise_meaning_from_text_cap
// + recognise_word_form_link_cap) over production (produce_derived_form_cap +
// produce_form_from_context_cap). The LessonCard prop slots stay `practiced`/
// `mastered` (the generic bar-pair contract); only the data they carry differs
// here. Production's denominator is content-fixed and often zero (the
// production tier doesn't exist yet for many affixes) — that renders as the
// LessonCard Bar's null path ("—"), never a false "0%".
//
// The banner hue is sourced from affixVisuals.ts's AFFIX_TYPE_HUE — shared
// with the detail page's accent so a tile's colour and the detail it opens
// read as one surface (harmonization plan Change 6).

import { SimpleGrid } from '@mantine/core'
import { LessonCard } from '@/components/lessons/LessonCard'
import { useT } from '@/hooks/useT'
import type { AffixCatalogTile } from '@/lib/morphology'
import { AFFIX_TYPE_HUE } from './affixVisuals'

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

/** A class tally's % mastered, or null when its denominator is zero (nothing
 *  to divide — the LessonCard Bar renders this as "—", not a false "0%"). */
function classPercent(tally: { masteredCount: number; totalCount: number }): number | null {
  return tally.totalCount > 0 ? Math.round((tally.masteredCount / tally.totalCount) * 100) : null
}

export function AffixCatalogGrid({ tiles }: { tiles: AffixCatalogTile[] }) {
  const T = useT()
  return (
    <SimpleGrid cols={{ base: 1, xs: 2, md: 3 }} spacing="md">
      {tiles.map((tile) => {
        const recognitionPct = classPercent(tile.progress.recognition)
        const productionPct = classPercent(tile.progress.production)
        return (
          <LessonCard
            key={tile.affix}
            banner={
              <div
                aria-hidden="true"
                style={{ position: 'absolute', inset: 0, background: AFFIX_TYPE_HUE[tile.affixType].gradient }}
              />
            }
            orderIndex={tile.rank}
            title={tile.affix}
            level={tile.cefrLevel}
            grammarTopics={tile.gloss}
            practiced={{ label: T.morphology.recognitionLabel, percent: tile.available ? recognitionPct : null }}
            mastered={{ label: T.morphology.productionLabel, percent: tile.available ? productionPct : null }}
            status={tileStatus(tile, T)}
            to={`/morphology?affix=${encodeURIComponent(tile.affix)}`}
          />
        )
      })}
    </SimpleGrid>
  )
}
