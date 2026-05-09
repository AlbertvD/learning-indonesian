import { describe, it, expect } from 'vitest'
import { validateLessonVoices } from '../../validators/lessonVoices'

describe('validateLessonVoices (GT4)', () => {
  it('accepts a lesson with no dialogue sections regardless of voice config', () => {
    expect(
      validateLessonVoices(
        { primary_voice: null, dialogue_voices: null },
        [
          { content: { type: 'text', paragraphs: ['halo'] } },
          { content: { type: 'vocabulary', items: [{ indonesian: 'satu' }] } },
        ],
      ),
    ).toEqual([])
  })

  it('accepts a lesson with dialogue sections + voices fully configured', () => {
    expect(
      validateLessonVoices(
        { primary_voice: 'Despina', dialogue_voices: { Andi: 'Despina', Budi: 'Achird' } },
        [
          {
            content: {
              type: 'dialogue',
              lines: [
                { text: 'Halo', speaker: 'Andi' },
                { text: 'Halo juga', speaker: 'Budi' },
              ],
            },
          },
        ],
      ),
    ).toEqual([])
  })

  it('rejects a lesson with dialogue sections but missing primary_voice', () => {
    const findings = validateLessonVoices(
      { primary_voice: null, dialogue_voices: { A: 'Despina' } },
      [{ content: { type: 'dialogue', lines: [{ text: 'halo', speaker: 'A' }] } }],
    )
    expect(findings).toHaveLength(1)
    expect(findings[0].gate).toBe('GT4')
    expect(findings[0].severity).toBe('error')
    expect(findings[0].message).toMatch(/primary_voice/)
  })

  it('rejects a lesson with dialogue sections but missing dialogue_voices', () => {
    const findings = validateLessonVoices(
      { primary_voice: 'Despina', dialogue_voices: null },
      [{ content: { type: 'dialogue', lines: [{ text: 'halo', speaker: 'A' }] } }],
    )
    expect(findings).toHaveLength(1)
    expect(findings[0].gate).toBe('GT4')
    expect(findings[0].message).toMatch(/dialogue_voices/)
  })

  it('rejects a lesson with empty dialogue_voices map', () => {
    const findings = validateLessonVoices(
      { primary_voice: 'Despina', dialogue_voices: {} },
      [{ content: { type: 'dialogue', lines: [{ text: 'halo', speaker: 'A' }] } }],
    )
    expect(findings).toHaveLength(1)
    expect(findings[0].gate).toBe('GT4')
  })

  it('rejects a lesson where a speaker is missing from dialogue_voices', () => {
    const findings = validateLessonVoices(
      { primary_voice: 'Despina', dialogue_voices: { Andi: 'Despina' } },
      [
        {
          content: {
            type: 'dialogue',
            lines: [
              { text: 'halo', speaker: 'Andi' },
              { text: 'halo juga', speaker: 'Budi' },
            ],
          },
        },
      ],
    )
    expect(findings).toHaveLength(1)
    expect(findings[0].gate).toBe('GT4')
    expect(findings[0].message).toMatch(/Budi/)
  })

  it('aggregates speakers across multiple dialogue sections', () => {
    const findings = validateLessonVoices(
      { primary_voice: 'Despina', dialogue_voices: { Andi: 'Despina' } },
      [
        { content: { type: 'dialogue', lines: [{ text: 'a', speaker: 'Andi' }] } },
        { content: { type: 'dialogue', lines: [{ text: 'b', speaker: 'Cici' }] } },
      ],
    )
    expect(findings).toHaveLength(1)
    expect(findings[0].message).toMatch(/Cici/)
  })
})
