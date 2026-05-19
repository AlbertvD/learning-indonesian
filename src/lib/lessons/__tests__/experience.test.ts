import { describe, it, expect } from 'vitest'
import { buildLessonExperience } from '../experience'
import type { Lesson, LessonPageBlock } from '../experience'

const baseLesson: Lesson = {
  id: 'l1',
  module_id: 'm1',
  level: 'A1',
  title: 'Lesson 1',
  description: null,
  order_index: 1,
  created_at: '',
  audio_path: null,
  duration_seconds: null,
  transcript_dutch: null,
  transcript_indonesian: null,
  transcript_english: null,
  primary_voice: null,
  dialogue_voices: null,
  lesson_sections: [],
}

function makeBlock(
  overrides: Partial<LessonPageBlock> & Pick<LessonPageBlock, 'block_kind' | 'block_key'>,
): LessonPageBlock {
  return {
    block_key: overrides.block_key,
    source_ref: 'lesson-1#x',
    source_refs: ['lesson-1#x'],
    content_unit_slugs: overrides.content_unit_slugs ?? [],
    block_kind: overrides.block_kind,
    display_order: overrides.display_order ?? 0,
    payload_json: overrides.payload_json ?? {},
  }
}

describe('buildLessonExperience — pass-through for canonical 7-value block_kind', () => {
  it.each([
    ['lesson_hero', 'lesson_hero'],
    ['reading_section', 'reading_section'],
    ['vocab_strip', 'vocab_strip'],
    ['dialogue_card', 'dialogue_card'],
    ['pattern_callout', 'pattern_callout'],
    ['practice_bridge', 'practice_bridge'],
    ['lesson_recap', 'lesson_recap'],
  ] as const)('%s passes through unchanged', (input, expected) => {
    const exp = buildLessonExperience({
      lesson: baseLesson,
      pageBlocks: [makeBlock({ block_key: 'b1', block_kind: input })],
    })
    expect(exp.blocks[0].kind).toBe(expected)
  })
})

describe('buildLessonExperience — legacy fallback for 5-value block_kind', () => {
  it('hero → lesson_hero', () => {
    const exp = buildLessonExperience({
      lesson: baseLesson,
      pageBlocks: [makeBlock({ block_key: 'b1', block_kind: 'hero' })],
    })
    expect(exp.blocks[0].kind).toBe('lesson_hero')
  })

  it('practice_bridge → practice_bridge (legacy value already canonical)', () => {
    const exp = buildLessonExperience({
      lesson: baseLesson,
      pageBlocks: [makeBlock({ block_key: 'b1', block_kind: 'practice_bridge' })],
    })
    expect(exp.blocks[0].kind).toBe('practice_bridge')
  })

  it('recap → lesson_recap', () => {
    const exp = buildLessonExperience({
      lesson: baseLesson,
      pageBlocks: [makeBlock({ block_key: 'b1', block_kind: 'recap' })],
    })
    expect(exp.blocks[0].kind).toBe('lesson_recap')
  })

  it('section + payload.type=dialogue → dialogue_card', () => {
    const exp = buildLessonExperience({
      lesson: baseLesson,
      pageBlocks: [
        makeBlock({
          block_key: 'b1',
          block_kind: 'section',
          payload_json: { type: 'dialogue' },
        }),
      ],
    })
    expect(exp.blocks[0].kind).toBe('dialogue_card')
  })

  it.each(['vocabulary', 'numbers', 'expressions'])(
    'section + payload.type=%s → vocab_strip',
    (payloadType) => {
      const exp = buildLessonExperience({
        lesson: baseLesson,
        pageBlocks: [
          makeBlock({
            block_key: 'b1',
            block_kind: 'section',
            payload_json: { type: payloadType },
          }),
        ],
      })
      expect(exp.blocks[0].kind).toBe('vocab_strip')
    },
  )

  it('section + content_unit_slugs starting with "pattern-" → pattern_callout', () => {
    const exp = buildLessonExperience({
      lesson: baseLesson,
      pageBlocks: [
        makeBlock({
          block_key: 'b1',
          block_kind: 'section',
          content_unit_slugs: ['pattern-ada-existence'],
        }),
      ],
    })
    expect(exp.blocks[0].kind).toBe('pattern_callout')
  })

  it('section default → reading_section', () => {
    const exp = buildLessonExperience({
      lesson: baseLesson,
      pageBlocks: [
        makeBlock({
          block_key: 'b1',
          block_kind: 'section',
          payload_json: { type: 'text' },
        }),
      ],
    })
    expect(exp.blocks[0].kind).toBe('reading_section')
  })

  it('exposure + dialogue payload → dialogue_card', () => {
    const exp = buildLessonExperience({
      lesson: baseLesson,
      pageBlocks: [
        makeBlock({
          block_key: 'b1',
          block_kind: 'exposure',
          payload_json: { type: 'dialogue' },
        }),
      ],
    })
    expect(exp.blocks[0].kind).toBe('dialogue_card')
  })
})
