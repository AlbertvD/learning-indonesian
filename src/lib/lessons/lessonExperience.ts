import type { Lesson, LessonPageBlock } from '@/services/lessonService'
import type { SourceProgressEventType } from '@/services/sourceProgressService'

export type LessonExperienceBlockKind =
  | 'lesson_hero'
  | 'reading_section'
  | 'vocab_strip'
  | 'dialogue_card'
  | 'pattern_callout'
  | 'noticing_prompt'
  | 'practice_bridge'
  | 'lesson_recap'

export interface LessonExperienceBlock {
  id: string
  kind: LessonExperienceBlockKind
  title: string
  sourceRef: string
  sourceRefs: string[]
  contentUnitSlugs: string[]
  displayOrder: number
  payload: Record<string, unknown>
  sourceProgressEvent?: SourceProgressEventType
  capabilityKeyRefs: string[]
}

export interface LessonExperience {
  lessonId: string
  sourceRef: string
  title: string
  level: string
  blocks: LessonExperienceBlock[]
  sourceRefs: string[]
}

const SOURCE_PROGRESS_EVENTS = new Set<SourceProgressEventType>([
  'opened',
  'section_exposed',
  'intro_completed',
  'heard_once',
  'pattern_noticing_seen',
  'guided_practice_completed',
  'lesson_completed',
])

function isSourceProgressEvent(value: unknown): value is SourceProgressEventType {
  return typeof value === 'string' && SOURCE_PROGRESS_EVENTS.has(value as SourceProgressEventType)
}

function sourceRefForLesson(lesson: Lesson): string {
  return `lesson-${lesson.order_index}`
}

function titleFromPayload(payload: Record<string, unknown>, fallback: string): string {
  return typeof payload.title === 'string' && payload.title.trim() ? payload.title : fallback
}

function blockKindFromPipeline(block: LessonPageBlock): LessonExperienceBlockKind {
  if (block.block_kind === 'hero') return 'lesson_hero'
  if (block.block_kind === 'practice_bridge') return 'practice_bridge'
  if (block.block_kind === 'recap') return 'lesson_recap'
  if (block.payload_json?.type === 'dialogue') return 'dialogue_card'
  if (block.payload_json?.type === 'vocabulary' || block.payload_json?.type === 'numbers' || block.payload_json?.type === 'expressions') return 'vocab_strip'
  if (block.content_unit_slugs?.some(slug => slug.startsWith('pattern-'))) return 'pattern_callout'
  return block.source_progress_event === 'pattern_noticing_seen' ? 'noticing_prompt' : 'reading_section'
}

function fromPipelineBlock(block: LessonPageBlock, lesson: Lesson): LessonExperienceBlock {
  const payload = block.payload_json ?? {}
  return {
    id: block.block_key,
    kind: blockKindFromPipeline(block),
    title: titleFromPayload(payload, lesson.title),
    sourceRef: block.source_ref,
    sourceRefs: block.source_refs ?? [block.source_ref],
    contentUnitSlugs: block.content_unit_slugs ?? [],
    displayOrder: block.display_order,
    payload,
    ...(isSourceProgressEvent(block.source_progress_event) ? { sourceProgressEvent: block.source_progress_event } : {}),
    capabilityKeyRefs: block.capability_key_refs ?? [],
  }
}

export function buildLessonExperience(input: {
  lesson: Lesson
  pageBlocks: LessonPageBlock[]
}): LessonExperience {
  const sourceRef = sourceRefForLesson(input.lesson)
  const blocks = input.pageBlocks.map(block => fromPipelineBlock(block, input.lesson))

  return {
    lessonId: input.lesson.id,
    sourceRef,
    title: input.lesson.title,
    level: input.lesson.level,
    blocks: blocks.sort((a, b) => a.displayOrder - b.displayOrder),
    sourceRefs: [...new Set(blocks.flatMap(block => block.sourceRefs.length > 0 ? block.sourceRefs : [block.sourceRef]))],
  }
}
