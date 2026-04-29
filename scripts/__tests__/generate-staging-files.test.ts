import { describe, expect, it } from 'vitest'
import {
  canUseCatalogForGeneration,
  generateIndexTs,
  mergeGeneratedLearningItemsWithExisting,
  selectLessonForGeneration,
} from '../generate-staging-files'

describe('generate-staging-files catalog selection', () => {
  it('treats legacy reverse-engineered catalogs as existing-staging input', () => {
    expect(canUseCatalogForGeneration({
      lesson_number: 2,
      lesson_title: 'Les 2 - Di Indonesia',
      level: 'A1',
      sections: [{
        section_type: 'dialogue',
        title: 'Di Indonesia',
        order_index: 0,
      }],
    })).toBe(false)
  })

  it('uses current catalogs that contain lesson metadata and typed sections', () => {
    expect(canUseCatalogForGeneration({
      lesson: 8,
      generatedAt: '2026-04-29T00:00:00.000Z',
      sourcePages: 10,
      lessonMeta: {
        title: 'Les 8 - Batik',
        level: 'A1',
        module_id: 'module-1',
        order_index: 8,
      },
      sections: [{
        id: 1,
        type: 'vocabulary',
        title: 'Woordenlijst',
        source_pages: [1],
        confidence: 'high',
        items: [],
      }],
      flags: [],
    })).toBe(true)
  })

  it('keeps an existing curated lesson when a current catalog is also available', () => {
    const existingLesson = {
      title: 'Les 8 - Batik',
      level: 'A1',
      module_id: 'module-1',
      order_index: 8,
      sections: [{
        title: 'Grammar',
        order_index: 0,
        content: {
          type: 'grammar',
          categories: [{ title: 'Verleden tijd', rules: ['Use sudah for completed actions.'] }],
        },
      }],
    }

    const selected = selectLessonForGeneration({
      lesson: 8,
      generatedAt: '2026-04-29T00:00:00.000Z',
      sourcePages: 10,
      lessonMeta: {
        title: 'Les 8 - Batik',
        level: 'A1',
        module_id: 'module-1',
        order_index: 8,
      },
      sections: [{
        id: 1,
        type: 'grammar',
        title: 'Raw grammar',
        source_pages: [1],
        confidence: 'high',
        raw_text: 'raw text',
      }],
      flags: [],
    }, existingLesson)

    expect(selected).toBe(existingLesson)
  })

  it('preserves curated learning item metadata when regenerating from a catalog', () => {
    const merged = mergeGeneratedLearningItemsWithExisting(
      [{
        base_text: 'libur sekolah',
        item_type: 'phrase',
        context_type: 'vocabulary_list',
        translation_nl: 'schoolvakantie',
        translation_en: '',
        source_page: 6,
        review_status: 'pending_review',
      }],
      [{
        base_text: 'libur sekolah',
        item_type: 'word',
        context_type: 'vocabulary_list',
        translation_nl: 'schoolvakantie',
        translation_en: 'school holiday',
        source_page: 5,
        review_status: 'published',
        pos: 'noun',
      }],
    )

    expect(merged).toEqual([expect.objectContaining({
      base_text: 'libur sekolah',
      item_type: 'phrase',
      translation_nl: 'schoolvakantie',
      translation_en: 'school holiday',
      source_page: 6,
      review_status: 'published',
      pos: 'noun',
    })])
  })

  it('prefers curated translations over regenerated catalog translations', () => {
    const merged = mergeGeneratedLearningItemsWithExisting(
      [{
        base_text: 'libur sekolah',
        item_type: 'phrase',
        context_type: 'vocabulary_list',
        translation_nl: 'schoolvakantie',
        translation_en: 'school holiday',
        source_page: 6,
        review_status: 'pending_review',
      }],
      [{
        base_text: 'libur sekolah',
        item_type: 'word',
        context_type: 'vocabulary_list',
        translation_nl: 'vakantie van school',
        translation_en: 'school break',
        source_page: 5,
        review_status: 'approved',
      }],
    )

    expect(merged).toEqual([expect.objectContaining({
      item_type: 'phrase',
      translation_nl: 'vakantie van school',
      translation_en: 'school break',
      source_page: 6,
      review_status: 'approved',
    })])
  })

  it('combines duplicate curated translations for the same generated item', () => {
    const merged = mergeGeneratedLearningItemsWithExisting(
      [{
        base_text: 'kaki',
        item_type: 'word',
        context_type: 'vocabulary_list',
        translation_nl: 'voet',
        translation_en: '',
        source_page: 4,
        review_status: 'pending_review',
      }],
      [
        {
          base_text: 'kaki',
          item_type: 'word',
          context_type: 'vocabulary_list',
          translation_nl: 'voet',
          translation_en: '',
          source_page: 4,
          review_status: 'published',
        },
        {
          base_text: 'kaki',
          item_type: 'word',
          context_type: 'vocabulary_list',
          translation_nl: 'been',
          translation_en: '',
          source_page: 9,
          review_status: 'published',
        },
      ],
    )

    expect(merged).toEqual([expect.objectContaining({
      translation_nl: 'voet / been',
      review_status: 'published',
    })])
  })

  it('keeps explicit empty translation fields when no curated translation exists', () => {
    const merged = mergeGeneratedLearningItemsWithExisting(
      [{
        base_text: 'Di lantai empat, Bu.',
        item_type: 'dialogue_chunk',
        context_type: 'dialogue',
        translation_nl: '',
        translation_en: '',
        source_page: 3,
        review_status: 'pending_review',
      }],
      [{
        base_text: 'Di lantai empat, Bu.',
        item_type: 'dialogue_chunk',
        context_type: 'dialogue',
        translation_nl: '',
        translation_en: '',
        source_page: 3,
        review_status: 'published',
      }],
    )

    expect(merged).toEqual([expect.objectContaining({
      translation_nl: '',
      translation_en: '',
      review_status: 'published',
    })])
  })

  it('preserves custom index exports while adding Slice 10 exports', () => {
    expect(generateIndexTs(`
export { lesson } from './lesson'
export { affixedFormPairs } from './morphology-patterns'
export { candidates } from './candidates'
`)).toContain("export { affixedFormPairs } from './morphology-patterns'\nexport { candidates } from './candidates'")
  })
})
