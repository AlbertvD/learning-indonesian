import { describe, it, expect } from 'vitest'
import { AFFIX_TYPE_HUE, masteryDotColor } from '@/components/morphology/affixVisuals'
import type { AffixType } from '@/lib/morphology'
import type { MasteryLabel } from '@/lib/morphology'

const AFFIX_TYPES: AffixType[] = ['prefix', 'suffix', 'confix', 'reduplication']
const MASTERY_LABELS: MasteryLabel[] = [
  'not_assessed',
  'introduced',
  'learning',
  'strengthening',
  'mastered',
  'at_risk',
]

// Raw Mantine palette names the harmonization plan bans everywhere this
// module's colours end up rendered (RuleCard, WordFamilyExplorer,
// AffixCatalogGrid).
const BANNED_PALETTE_NAMES = new Set(['blue', 'yellow', 'green', 'red', 'orange', 'gray'])

describe('affixVisuals', () => {
  it('has a gradient + solid hue for every affix type', () => {
    for (const type of AFFIX_TYPES) {
      expect(AFFIX_TYPE_HUE[type].gradient).toBeTruthy()
      expect(AFFIX_TYPE_HUE[type].solid).toBeTruthy()
      expect(BANNED_PALETTE_NAMES.has(AFFIX_TYPE_HUE[type].solid)).toBe(false)
    }
  })

  it('maps every mastery label to a distinct, non-Mantine-palette colour', () => {
    const colors = MASTERY_LABELS.map((label) => masteryDotColor(label))
    for (const color of colors) {
      expect(BANNED_PALETTE_NAMES.has(color)).toBe(false)
    }
    // six distinct rungs → six distinct hues (no accidental collapsing).
    expect(new Set(colors).size).toBe(MASTERY_LABELS.length)
  })

  it('drops the off-brand blue previously used for not_assessed', () => {
    expect(masteryDotColor('not_assessed')).toBe('var(--text-tertiary)')
  })
})
