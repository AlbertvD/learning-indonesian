import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

const messagesCreateMock = vi.hoisted(() => vi.fn())

vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: class MockAnthropic {
      messages = { create: messagesCreateMock }
    },
  }
})

import {
  enrichMissingDialogueTranslations,
  collectDialogueLines,
  applyDialogueTranslationsToSections,
} from '../enrichDialogueTranslations'

const ORIGINAL_API_KEY = process.env.ANTHROPIC_API_KEY

beforeEach(() => {
  delete process.env.ANTHROPIC_API_KEY
  messagesCreateMock.mockReset()
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'log').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
  if (ORIGINAL_API_KEY !== undefined) {
    process.env.ANTHROPIC_API_KEY = ORIGINAL_API_KEY
  } else {
    delete process.env.ANTHROPIC_API_KEY
  }
})

describe('enrichMissingDialogueTranslations — trigger', () => {
  it('no-op when every line already has a non-empty translation', async () => {
    const lines = [
      { text: 'Halo', translation: 'Hallo' },
      { text: 'Apa kabar?', translation: 'Hoe gaat het?' },
    ]
    const result = await enrichMissingDialogueTranslations(lines)
    expect(result.translatedCount).toBe(0)
    expect(result.translationsByText.size).toBe(0)
    expect(messagesCreateMock).not.toHaveBeenCalled()
  })

  it('treats whitespace-only translations as empty', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key'
    messagesCreateMock.mockResolvedValue({
      content: [{ type: 'text', text: '{"1": "Hallo"}' }],
    })
    const lines = [{ text: 'Halo', translation: '   ' }]
    const result = await enrichMissingDialogueTranslations(lines)
    expect(result.translatedCount).toBe(1)
    expect(result.translationsByText.get('Halo')).toBe('Hallo')
  })

  it('skips lines with empty text', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key'
    messagesCreateMock.mockResolvedValue({ content: [{ type: 'text', text: '{}' }] })
    const lines = [{ text: '', translation: '' }, { text: '   ', translation: '' }]
    const result = await enrichMissingDialogueTranslations(lines)
    expect(result.translatedCount).toBe(0)
    expect(messagesCreateMock).not.toHaveBeenCalled()
  })

  it('returns empty result + warns when ANTHROPIC_API_KEY is unset', async () => {
    const lines = [{ text: 'Halo', translation: '' }]
    const result = await enrichMissingDialogueTranslations(lines)
    expect(result.translatedCount).toBe(0)
    expect(messagesCreateMock).not.toHaveBeenCalled()
  })
})

describe('enrichMissingDialogueTranslations — LLM path', () => {
  it('sends only the missing-translation lines, keys results by line.text', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key'
    messagesCreateMock.mockResolvedValue({
      content: [{ type: 'text', text: '{"1": "Goedemiddag mevrouw", "2": "Een glas water alstublieft"}' }],
    })
    const lines = [
      { text: 'Selamat siang Ibu', speaker: 'Andi', translation: '' },
      { text: 'Sudah punya translation', translation: 'Reeds vertaald' },
      { text: 'Segelas air, ya', speaker: 'Andi', translation: '' },
    ]
    const result = await enrichMissingDialogueTranslations(lines)
    expect(result.translatedCount).toBe(2)
    expect(result.translationsByText.get('Selamat siang Ibu')).toBe('Goedemiddag mevrouw')
    expect(result.translationsByText.get('Segelas air, ya')).toBe('Een glas water alstublieft')
    expect(result.translationsByText.has('Sudah punya translation')).toBe(false)
  })

  it('returns empty result when LLM response is unparseable', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key'
    messagesCreateMock.mockResolvedValue({
      content: [{ type: 'text', text: 'sorry, cannot' }],
    })
    const lines = [{ text: 'Halo', translation: '' }]
    const result = await enrichMissingDialogueTranslations(lines)
    expect(result.translatedCount).toBe(0)
  })
})

describe('collectDialogueLines + applyDialogueTranslationsToSections', () => {
  it('collects lines from every dialogue section, skips non-dialogue sections', () => {
    const sections = [
      { content: { type: 'vocabulary', items: [{ indonesian: 'halo' }] } },
      {
        content: {
          type: 'dialogue',
          lines: [
            { text: 'A', speaker: 'Andi', translation: '' },
            { text: 'B', speaker: 'Budi', translation: 'Reeds' },
          ],
        },
      },
      {
        content: {
          type: 'dialogue',
          lines: [{ text: 'C', translation: '' }],
        },
      },
    ]
    const lines = collectDialogueLines(sections)
    expect(lines).toHaveLength(3)
    expect(lines[0]).toMatchObject({ text: 'A', speaker: 'Andi', translation: '' })
    expect(lines[1]).toMatchObject({ text: 'B', speaker: 'Budi', translation: 'Reeds' })
    expect(lines[2]).toMatchObject({ text: 'C', translation: '' })
  })

  it('applies translations back to matching lines, counts only fills', () => {
    const sections = [
      {
        content: {
          type: 'dialogue',
          lines: [
            { text: 'A', translation: '' },
            { text: 'B', translation: 'Existing' },
            { text: 'C', translation: '' },
          ],
        },
      },
    ]
    const map = new Map([['A', 'Eerste'], ['C', 'Derde']])
    const applied = applyDialogueTranslationsToSections(sections, map)
    expect(applied).toBe(2)
    const lines = (sections[0].content as { lines: Array<{ text: string; translation: string }> }).lines
    expect(lines[0].translation).toBe('Eerste')
    expect(lines[1].translation).toBe('Existing')
    expect(lines[2].translation).toBe('Derde')
  })

  it('does not touch non-dialogue sections', () => {
    const sections = [
      { content: { type: 'vocabulary', items: [{ indonesian: 'halo' }] } },
    ]
    const map = new Map([['halo', 'hallo']])
    const applied = applyDialogueTranslationsToSections(sections, map)
    expect(applied).toBe(0)
  })
})
