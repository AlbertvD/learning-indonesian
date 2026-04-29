import { describe, expect, it } from 'vitest'
import { buildLessonExperience } from '@/lib/lessons/lessonExperience'
import type { Lesson, LessonPageBlock } from '@/services/lessonService'

const lesson: Lesson = {
  id: 'lesson-id-1',
  module_id: 'module-1',
  level: 'A1',
  title: 'Les 1 - Di Pasar',
  description: null,
  order_index: 1,
  created_at: '2026-04-25T00:00:00.000Z',
  audio_path: null,
  duration_seconds: null,
  transcript_dutch: null,
  transcript_indonesian: null,
  transcript_english: null,
  primary_voice: null,
  dialogue_voices: null,
  lesson_sections: [{
    id: 'section-1',
    lesson_id: 'lesson-id-1',
    title: 'Vocabulary',
    content: { type: 'vocabulary', items: [{ indonesian: 'makan', dutch: 'eten' }] },
    order_index: 0,
  }],
}

describe('lesson experience', () => {
  it('maps pipeline lesson page blocks into ordered reader blocks', () => {
    const pageBlocks: LessonPageBlock[] = [
      {
        block_key: 'lesson-1-item-makan-practice',
        source_ref: 'lesson-1',
        source_refs: ['learning_items/makan'],
        content_unit_slugs: ['item-makan'],
        block_kind: 'practice_bridge',
        display_order: 20,
        payload_json: { label: 'Practice this content' },
        source_progress_event: 'intro_completed',
        capability_key_refs: ['capability:makan'],
      },
      {
        block_key: 'lesson-1-hero',
        source_ref: 'lesson-1',
        source_refs: ['lesson-1'],
        content_unit_slugs: [],
        block_kind: 'hero',
        display_order: 0,
        payload_json: { title: 'A market morning' },
        source_progress_event: null,
        capability_key_refs: [],
      },
    ]

    const experience = buildLessonExperience({ lesson, pageBlocks })

    expect(experience.sourceRef).toBe('lesson-1')
    expect(experience.blocks.map(block => block.id)).toEqual(['lesson-1-hero', 'lesson-1-item-makan-practice'])
    expect(experience.blocks[0]).toEqual(expect.objectContaining({
      kind: 'lesson_hero',
      title: 'A market morning',
    }))
    expect(experience.blocks[1]).toEqual(expect.objectContaining({
      kind: 'practice_bridge',
      sourceProgressEvent: 'intro_completed',
      capabilityKeyRefs: ['capability:makan'],
    }))
  })

  it('does not synthesize legacy reader blocks when pipeline blocks are not present', () => {
    const experience = buildLessonExperience({ lesson, pageBlocks: [] })

    expect(experience.blocks).toEqual([])
    expect(experience.sourceRefs).toEqual([])
  })
})
