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
