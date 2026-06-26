import { describe, it, expect } from 'vitest'
import { lessonAudioUrl } from '../lessonAudioUrl'

const BASE = 'https://api.supabase.duin.home'

describe('lessonAudioUrl', () => {
  it('builds the public indonesian-lessons bucket URL for a path', () => {
    expect(lessonAudioUrl(BASE, 'grammar/lesson-17-nl.mp3')).toBe(
      'https://api.supabase.duin.home/storage/v1/object/public/indonesian-lessons/grammar/lesson-17-nl.mp3',
    )
  })

  it('builds the EN path identically to the NL path (same bucket)', () => {
    const nl = lessonAudioUrl(BASE, 'grammar/lesson-17-nl.mp3')
    const en = lessonAudioUrl(BASE, 'grammar/lesson-17-en.mp3')
    expect(en).toBe(nl!.replace('-nl.mp3', '-en.mp3'))
  })

  it('returns null for an absent path (lesson without that language episode)', () => {
    expect(lessonAudioUrl(BASE, null)).toBeNull()
    expect(lessonAudioUrl(BASE, undefined)).toBeNull()
    expect(lessonAudioUrl(BASE, '')).toBeNull()
  })
})
