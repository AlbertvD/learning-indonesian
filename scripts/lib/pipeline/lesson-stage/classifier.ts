import type { SectionContentType } from './model'

export type ReaderBlockKind =
  | 'lesson_hero'
  | 'reading_section'
  | 'vocab_strip'
  | 'dialogue_card'
  | 'pattern_callout'
  | 'practice_bridge'
  | 'lesson_recap'

export type LegacyBlockKind = 'hero' | 'section' | 'exposure' | 'practice_bridge' | 'recap'

export interface ClassifyBlockKindInput {
  legacyKind: LegacyBlockKind
  payloadType?: SectionContentType
  contentUnitSlugs: string[]
}

/**
 * Derive the canonical 7-value reader `block_kind` from the legacy 5-value
 * pipeline kind, the payload `content.type`, and the content-unit slug list.
 *
 * Precedence (per spec §6):
 *  1. hero / practice_bridge / recap pass through directly.
 *  2. payloadType=dialogue → dialogue_card.
 *  3. payloadType ∈ {vocabulary,numbers,expressions} → vocab_strip.
 *  4. any slug starts with "pattern-" → pattern_callout.
 *  5. otherwise → reading_section.
 *
 * Pure function. No I/O.
 */
export function classifyBlockKind(input: ClassifyBlockKindInput): ReaderBlockKind {
  if (input.legacyKind === 'hero') return 'lesson_hero'
  if (input.legacyKind === 'practice_bridge') return 'practice_bridge'
  if (input.legacyKind === 'recap') return 'lesson_recap'

  if (input.payloadType === 'dialogue') return 'dialogue_card'
  if (
    input.payloadType === 'vocabulary'
    || input.payloadType === 'numbers'
    || input.payloadType === 'expressions'
  ) {
    return 'vocab_strip'
  }

  if (input.contentUnitSlugs.some((slug) => slug.startsWith('pattern-'))) {
    return 'pattern_callout'
  }

  return 'reading_section'
}
