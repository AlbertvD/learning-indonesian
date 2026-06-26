import { describe, it, expect } from 'vitest'
import { buildTodo } from '../todo'

describe('buildTodo', () => {
  it('lists all NL episodes first, then all EN, ordered by lesson', () => {
    const todo = buildTodo([
      { order_index: 2, audio_path: null, audio_path_en: null },
      { order_index: 1, audio_path: null, audio_path_en: null },
    ])
    expect(todo).toEqual([
      { lesson: 1, lang: 'nl' },
      { lesson: 2, lang: 'nl' },
      { lesson: 1, lang: 'en' },
      { lesson: 2, lang: 'en' },
    ])
  })

  it('skips episodes whose path is already set (DB-as-todo)', () => {
    const todo = buildTodo([
      { order_index: 1, audio_path: 'grammar/lesson-1-nl.mp3', audio_path_en: null }, // NL done, EN pending
      { order_index: 2, audio_path: null, audio_path_en: 'grammar/lesson-2-en.mp3' }, // NL pending, EN done
    ])
    expect(todo).toEqual([
      { lesson: 2, lang: 'nl' },
      { lesson: 1, lang: 'en' },
    ])
  })

  it('returns empty when everything is done', () => {
    expect(buildTodo([{ order_index: 1, audio_path: 'a', audio_path_en: 'b' }])).toEqual([])
  })

  it('excludes hidden lessons (e.g. the Common Words container)', () => {
    const todo = buildTodo([
      { order_index: 1, audio_path: null, audio_path_en: null },
      { order_index: 999, audio_path: null, audio_path_en: null, is_hidden: true },
    ])
    expect(todo).toEqual([
      { lesson: 1, lang: 'nl' },
      { lesson: 1, lang: 'en' },
    ])
  })
})
