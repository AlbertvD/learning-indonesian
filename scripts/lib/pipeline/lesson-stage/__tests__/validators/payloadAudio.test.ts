import { describe, it, expect } from 'vitest'
import { validatePayloadAudio } from '../../validators/payloadAudio'

describe('validatePayloadAudio (GT3)', () => {
  it('accepts payload without audioUrl/audio_url keys', () => {
    expect(
      validatePayloadAudio([
        { block_key: 'b1', payload_json: { type: 'text', paragraphs: ['halo'] } },
      ]),
    ).toEqual([])
  })

  it('rejects payload containing audioUrl', () => {
    const findings = validatePayloadAudio([
      { block_key: 'b1', payload_json: { audioUrl: 'tts/x.mp3' } },
    ])
    expect(findings).toHaveLength(1)
    expect(findings[0].gate).toBe('GT3')
    expect(findings[0].severity).toBe('error')
    expect(findings[0].context?.blockKey).toBe('b1')
    expect(findings[0].message).toMatch(/audioUrl/)
  })

  it('rejects payload containing audio_url (snake_case variant)', () => {
    const findings = validatePayloadAudio([
      { block_key: 'b1', payload_json: { audio_url: 'tts/x.mp3' } },
    ])
    expect(findings).toHaveLength(1)
    expect(findings[0].gate).toBe('GT3')
    expect(findings[0].message).toMatch(/audio_url/)
  })

  it('rejects payload containing both keys', () => {
    const findings = validatePayloadAudio([
      { block_key: 'b1', payload_json: { audioUrl: 'a', audio_url: 'b' } },
    ])
    expect(findings).toHaveLength(1)
    expect(findings[0].message).toMatch(/audioUrl.*audio_url|audio_url.*audioUrl/)
  })

  it('flags nested audioUrl inside arbitrary nested objects', () => {
    const findings = validatePayloadAudio([
      {
        block_key: 'b1',
        payload_json: {
          type: 'dialogue',
          lines: [{ text: 'halo', speaker: 'A', audioUrl: 'tts/x.mp3' }],
        },
      },
    ])
    expect(findings).toHaveLength(1)
    expect(findings[0].gate).toBe('GT3')
  })

  it('handles missing payload_json gracefully (no findings, no throw)', () => {
    expect(validatePayloadAudio([{ block_key: 'b1', payload_json: undefined }])).toEqual([])
    expect(validatePayloadAudio([{ block_key: 'b1', payload_json: null as unknown as undefined }])).toEqual([])
  })

  it('reports each offender separately', () => {
    const findings = validatePayloadAudio([
      { block_key: 'b1', payload_json: { audioUrl: 'a' } },
      { block_key: 'b2', payload_json: { type: 'text' } },
      { block_key: 'b3', payload_json: { audio_url: 'c' } },
    ])
    expect(findings).toHaveLength(2)
    expect(findings.map((f) => f.context?.blockKey).sort()).toEqual(['b1', 'b3'])
  })
})
