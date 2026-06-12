import type {
  CapabilityDirection,
  CapabilityModality,
  CapabilitySourceKind,
  CapabilityType,
  LearnerLanguage,
} from './capabilityTypes'

export interface CanonicalKeyInput {
  sourceKind: CapabilitySourceKind
  sourceRef: string
  capabilityType: CapabilityType
  direction: CapabilityDirection
  modality: CapabilityModality
  learnerLanguage: LearnerLanguage
}

function encodeSegment(segment: string): string {
  return segment.replace(/%/g, '%25').replace(/:/g, '%3A')
}

export function normalizeLessonSourceRef(sourceRef: string): string {
  const [lessonPart, ...rest] = sourceRef.split('/')
  const match = lessonPart.trim().toLowerCase().replace(/[_\s]+/g, '-').match(/^lesson-?0*(\d+)$/)
  const normalizedLesson = match ? `lesson-${Number(match[1])}` : lessonPart.trim().toLowerCase()
  return [normalizedLesson, ...rest].join('/')
}

/**
 * A pattern capability's `source_ref` is `lesson-<N>/pattern-<slug>`; strip the
 * envelope back to the bare `grammar_patterns.slug`. The single source of truth
 * for this mapping, shared by the grammar exercise reader (`exercise-content/
 * byKind/pattern.ts`) and the voortgang grammar-topics reader (`getGrammarTopics`)
 * so the two cannot drift. Verified against the live DB: all pattern caps'
 * source_refs resolve to a `grammar_patterns.slug` this way (byKind/pattern.ts,
 * 2026-05-24). A source_ref without the envelope is returned unchanged.
 */
export function patternSlugFromSourceRef(sourceRef: string): string {
  return sourceRef.replace(/^lesson-\d+\/pattern-/u, '')
}

export function buildCanonicalKey(input: CanonicalKeyInput): string {
  return [
    'cap',
    'v1',
    input.sourceKind,
    encodeSegment(input.sourceRef),
    input.capabilityType,
    input.direction,
    input.modality,
    input.learnerLanguage,
  ].join(':')
}
