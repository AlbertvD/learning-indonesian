import { describe, expect, it } from 'vitest'
import {
  buildCapabilityStagingFromContent,
  buildContentUnitsFromStaging,
  buildLessonPageBlocksFromStaging,
  validateLessonPageBlocks,
  type StagingLessonInput,
} from '../lib/content-pipeline-output'

const input: StagingLessonInput = {
  lessonNumber: 1,
  lesson: {
    title: 'Les 1 - Di Pasar',
    level: 'A1',
    module_id: 'module-1',
    order_index: 1,
    sections: [{
      title: 'Vocabulary',
      order_index: 0,
      content: { type: 'vocabulary' },
    }],
  },
  learningItems: [{
    base_text: 'makan',
    item_type: 'word',
    context_type: 'vocabulary_list',
    translation_nl: 'eten',
    translation_en: 'to eat',
    source_page: 1,
    review_status: 'pending_review',
  }],
  grammarPatterns: [],
}

describe('lesson page block staging', () => {
  it('emits hero, grouped vocab strip, single practice bridge, and recap', () => {
    const contentUnits = buildContentUnitsFromStaging(input)
    const capabilities = buildCapabilityStagingFromContent({ ...input, contentUnits }).capabilities
    const blocks = buildLessonPageBlocksFromStaging({ ...input, contentUnits, capabilities })

    expect(blocks[0]).toEqual(expect.objectContaining({
      block_key: 'lesson-1-hero',
      block_kind: 'hero',
      content_unit_slugs: [],
      capability_key_refs: [],
    }))
    // One vocab strip per context_type group, not one block per item
    expect(blocks).toEqual(expect.arrayContaining([
      expect.objectContaining({
        block_kind: 'section',
        source_progress_event: 'section_exposed',
        content_unit_slugs: ['item-makan'],
        payload_json: expect.objectContaining({
          type: 'vocabulary',
          items: expect.arrayContaining([
            expect.objectContaining({ indonesian: 'makan' }),
          ]),
        }),
      }),
      expect.objectContaining({
        block_key: 'lesson-1-practice-bridge',
        block_kind: 'practice_bridge',
        source_progress_event: 'intro_completed',
        capability_key_refs: expect.arrayContaining([expect.stringContaining(':text_recognition:')]),
      }),
      expect.objectContaining({
        block_key: 'lesson-1-recap',
        block_kind: 'recap',
        source_progress_event: 'lesson_completed',
      }),
    ]))
    // No per-item practice_bridge blocks anymore
    const practiceBridges = blocks.filter(block => block.block_kind === 'practice_bridge')
    expect(practiceBridges).toHaveLength(1)
  })

  it('validates block references without requiring every block to own a unit', () => {
    const contentUnits = buildContentUnitsFromStaging(input)
    const capabilities = buildCapabilityStagingFromContent({ ...input, contentUnits }).capabilities
    const blocks = buildLessonPageBlocksFromStaging({ ...input, contentUnits, capabilities })
    const findings = validateLessonPageBlocks({
      blocks: [
        ...blocks,
        { ...blocks[0]!, block_key: 'Bad Key' },
        { ...blocks[1]!, content_unit_slugs: ['missing-unit'] },
      ],
      contentUnits,
      capabilities,
    })

    expect(findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ severity: 'CRITICAL', rule: 'lesson-block-key-not-stable' }),
      expect.objectContaining({ severity: 'CRITICAL', rule: 'lesson-block-content-unit-missing' }),
    ]))
    expect(findings).not.toContainEqual(expect.objectContaining({
      rule: 'lesson-block-content-unit-required',
    }))
  })
})
