// src/components/morphology/affixVisuals.ts
// Shared colour mappings for the Affix Trainer's catalog grid + detail page,
// so a tile's affix-type hue and the mastery-dot palette speak one language
// across both surfaces. UI layer only — `lib/morphology` is pure data and its
// spec forbids styling concerns; this module imports ONLY the two view-model
// types it needs (AffixType, MasteryLabel), never any lib/morphology logic.

import type { AffixType, MasteryLabel } from '@/lib/morphology'

/** Curated brand-ramp hue per affix type — tamarind / teal / gold / batik-green.
 *  `gradient` drives the catalog tile banner (AffixCatalogGrid); `solid` drives
 *  the detail-page accent (AffixDetailView) and RuleCard's type pill.
 *
 *  Deliberately NOT the semantic design tokens for all four: tamarind
 *  (`--accent-primary`) and teal (`--teal`) already are tokens, but gold and
 *  batik-green are curated literals with no token family of their own — the
 *  same values the catalog grid has shipped since the "off-brand
 *  indigo/purple/sky" migration. That is intentional, not drift (see the
 *  harmonization plan's Design principle). */
export const AFFIX_TYPE_HUE: Record<AffixType, { gradient: string; solid: string }> = {
  prefix: { gradient: 'linear-gradient(135deg, #C64A26 0%, #8A3117 100%)', solid: 'var(--accent-primary)' },
  suffix: { gradient: 'linear-gradient(135deg, #17867F 0%, #0C5A55 100%)', solid: 'var(--teal)' },
  confix: { gradient: 'linear-gradient(135deg, #B4862F 0%, #7E5F1E 100%)', solid: '#B4862F' },
  reduplication: { gradient: 'linear-gradient(135deg, #3A6A5C 0%, #1F3D36 100%)', solid: '#3A6A5C' },
}

/** Mastery-rung → token colour. Six on-brand hues, replacing WordFamilyExplorer's
 *  raw-Mantine `blue`/`yellow`/`teal`/`green`/`red`/`gray` palette. */
export function masteryDotColor(label: MasteryLabel): string {
  const MASTERY_DOT_COLOR: Record<MasteryLabel, string> = {
    not_assessed: 'var(--text-tertiary)',
    introduced: 'var(--accent-primary)',
    learning: 'var(--warning)',
    strengthening: 'var(--teal)',
    mastered: 'var(--success)',
    at_risk: 'var(--danger)',
  }
  return MASTERY_DOT_COLOR[label]
}
