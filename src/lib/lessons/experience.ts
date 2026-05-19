import type { Lesson, LessonPageBlock } from '@/services/lessonService'

// Re-export the input types so callers can pull them from the lessons module
// surface (and the colocated test can import them from `../experience`).
// In commit 6 these types relocate to `./adapter`; the re-export survives.
export type { Lesson, LessonPageBlock }

export type LessonExperienceBlockKind =
  | 'lesson_hero'
  | 'reading_section'
  | 'vocab_strip'
  | 'dialogue_card'
  | 'pattern_callout'
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
}

export interface LessonExperience {
  lessonId: string
  sourceRef: string
  title: string
  level: string
  blocks: LessonExperienceBlock[]
  sourceRefs: string[]
}

function sourceRefForLesson(lesson: Lesson): string {
  return `lesson-${lesson.order_index}`
}

function titleFromPayload(payload: Record<string, unknown>, fallback: string): string {
  return typeof payload.title === 'string' && payload.title.trim() ? payload.title : fallback
}

function blockKindFromPipeline(block: LessonPageBlock): LessonExperienceBlockKind {
  // Pass-through for the 7 canonical pipeline values (post-Item 2 backfill).
  // This whole function retires in the lessons fold PR; until then it bridges
  // the gap for any rows still carrying the legacy 5-value enum.
  const direct = block.block_kind
  if (
    direct === 'lesson_hero'
    || direct === 'reading_section'
    || direct === 'vocab_strip'
    || direct === 'dialogue_card'
    || direct === 'pattern_callout'
    || direct === 'practice_bridge'
    || direct === 'lesson_recap'
  ) {
    return direct
  }
  // Legacy fallback (only for rows authored before the GT2 backfill ran).
  if (direct === 'hero') return 'lesson_hero'
  if (direct === 'recap') return 'lesson_recap'
  if (block.payload_json?.type === 'dialogue') return 'dialogue_card'
  if (
    block.payload_json?.type === 'vocabulary'
    || block.payload_json?.type === 'numbers'
    || block.payload_json?.type === 'expressions'
  ) {
    return 'vocab_strip'
  }
  if (block.content_unit_slugs?.some((slug) => slug.startsWith('pattern-'))) {
    return 'pattern_callout'
  }
  return 'reading_section'
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
