import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

const messagesCreateMock = vi.hoisted(() => vi.fn())

vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: class MockAnthropic {
      messages = { create: messagesCreateMock }
    },
  }
})

import { enrichMissingGrammarTopics } from '../enrichGrammarTopics'

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

describe('enrichMissingGrammarTopics — trigger', () => {
  it('no-op when every grammar section already has populated grammar_topics', async () => {
    const sections = [
      {
        title: 'Grammatica',
        order_index: 1,
        content: { type: 'grammar', grammar_topics: ['Yang-constructies'], categories: [{ title: 'irrelevant' }] },
      },
    ]
    const result = await enrichMissingGrammarTopics(sections, 4)
    expect(result.source).toBe('none')
    expect(result.filledSectionCount).toBe(0)
    expect(sections[0].content.grammar_topics).toEqual(['Yang-constructies'])
    expect(messagesCreateMock).not.toHaveBeenCalled()
  })

  it('no-op when there are no grammar/reference_table sections at all', async () => {
    const sections = [
      { title: 'Vocab', order_index: 0, content: { type: 'vocabulary', items: [] } },
      { title: 'Dialoog', order_index: 1, content: { type: 'dialogue', lines: [] } },
    ]
    const result = await enrichMissingGrammarTopics(sections, 4)
    expect(result.source).toBe('none')
    expect(result.filledSectionCount).toBe(0)
  })

  it('fires when at least one grammar section has missing grammar_topics', async () => {
    const sections = [
      {
        title: 'Grammatica',
        order_index: 1,
        content: {
          type: 'grammar',
          categories: [
            { title: 'Yang als betrekkelijk voornaamwoord (die/dat)' },
            { title: 'Yang maakt zelfstandige naamwoorden (nominalisering)' },
          ],
        },
      },
    ]
    const result = await enrichMissingGrammarTopics(sections, 4)
    expect(result.filledSectionCount).toBeGreaterThan(0)
  })

  it('fires when grammar section has empty grammar_topics array', async () => {
    const sections = [
      {
        title: 'Grammatica',
        order_index: 1,
        content: {
          type: 'grammar',
          grammar_topics: [],
          categories: [{ title: 'Yang' }],
        },
      },
    ]
    const result = await enrichMissingGrammarTopics(sections, 4)
    expect(result.filledSectionCount).toBe(1)
  })
})

describe('enrichMissingGrammarTopics — deterministic fallback (no API key)', () => {
  it('fills grammar_topics from categories[].title when available', async () => {
    const sections = [
      {
        title: 'Grammatica: YANG',
        order_index: 1,
        content: {
          type: 'grammar',
          categories: [{ title: 'Yang als betrekkelijk voornaamwoord' }, { title: 'Yang nominalisering' }],
        },
      },
    ]
    const result = await enrichMissingGrammarTopics(sections, 4)
    expect(result.source).toBe('deterministic')
    expect(sections[0].content.grammar_topics).toEqual([
      'Yang als betrekkelijk voornaamwoord',
      'Yang nominalisering',
    ])
  })

  it('falls back to content.title when no categories', async () => {
    const sections = [
      {
        title: 'Section title',
        order_index: 1,
        content: { type: 'grammar', title: 'Grammatica: Ada' },
      },
    ]
    const result = await enrichMissingGrammarTopics(sections, 3)
    expect(result.source).toBe('deterministic')
    expect(sections[0].content.grammar_topics).toEqual(['Ada'])
  })

  it('falls back to section.title when no categories and no content.title', async () => {
    const sections = [
      {
        title: 'Grammatica: Sekali',
        order_index: 1,
        content: { type: 'grammar' },
      },
    ]
    const result = await enrichMissingGrammarTopics(sections, 3)
    expect(result.source).toBe('deterministic')
    expect(sections[0].content.grammar_topics).toEqual(['Sekali'])
  })

  it('strips "grammar:" / "grammatica:" prefix on derived labels', async () => {
    const sections = [
      {
        title: 'Section',
        order_index: 1,
        content: {
          type: 'grammar',
          categories: [{ title: 'Grammatica: Ontkenning' }, { title: 'GRAMMAR: tidak' }],
        },
      },
    ]
    await enrichMissingGrammarTopics(sections, 6)
    expect(sections[0].content.grammar_topics).toEqual(['Ontkenning', 'tidak'])
  })

  it('reference_table sections follow the same logic', async () => {
    const sections = [
      {
        title: 'Bezittelijk voornaamwoord',
        order_index: 1,
        content: { type: 'reference_table' },
      },
    ]
    const result = await enrichMissingGrammarTopics(sections, 5)
    expect(result.source).toBe('deterministic')
    expect(sections[0].content.grammar_topics).toEqual(['Bezittelijk voornaamwoord'])
  })
})

describe('enrichMissingGrammarTopics — LLM path', () => {
  it('applies LLM-returned labels to ALL grammar/reference_table sections (so runtime dedup yields ≤2 chip entries)', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key'
    messagesCreateMock.mockResolvedValue({
      content: [{ type: 'text', text: '{"labels": ["Ontkenning", "Gebiedende wijs"]}' }],
    })

    const sections = [
      { title: 'Belum = nog niet', order_index: 1, content: { type: 'grammar', categories: [{ title: 'Belum' }] } },
      { title: 'Bukan', order_index: 2, content: { type: 'grammar', categories: [{ title: 'Bukan' }] } },
      { title: 'Tidak', order_index: 3, content: { type: 'grammar', categories: [{ title: 'Tidak' }] } },
      { title: 'Vocab', order_index: 4, content: { type: 'vocabulary', items: [] } },
    ]
    const result = await enrichMissingGrammarTopics(sections, 6)
    expect(result.source).toBe('llm')
    expect(result.labels).toEqual(['Ontkenning', 'Gebiedende wijs'])
    expect(sections[0].content.grammar_topics).toEqual(['Ontkenning', 'Gebiedende wijs'])
    expect(sections[1].content.grammar_topics).toEqual(['Ontkenning', 'Gebiedende wijs'])
    expect(sections[2].content.grammar_topics).toEqual(['Ontkenning', 'Gebiedende wijs'])
    expect((sections[3].content as Record<string, unknown>).grammar_topics).toBeUndefined()
    expect(messagesCreateMock).toHaveBeenCalledTimes(1)
  })

  it('caps at 2 labels and ≤40 chars; strips "grammar:" prefix from LLM output', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key'
    messagesCreateMock.mockResolvedValue({
      content: [{
        type: 'text',
        text: '{"labels": ["Grammatica: Yang-constructies", "A very very very very very very very long label that exceeds forty characters", "Third label gets dropped", "Fourth"]}',
      }],
    })

    const sections = [
      { title: 'Grammatica', order_index: 1, content: { type: 'grammar', categories: [{ title: 'irrelevant' }] } },
    ]
    const result = await enrichMissingGrammarTopics(sections, 4)
    expect(result.source).toBe('llm')
    expect(result.labels).toEqual(['Yang-constructies', 'Third label gets dropped'])
  })

  it('falls back to deterministic fill when LLM returns an unparseable response', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key'
    messagesCreateMock.mockResolvedValue({
      content: [{ type: 'text', text: 'I cannot do this' }],
    })

    const sections = [
      {
        title: 'Section',
        order_index: 1,
        content: { type: 'grammar', categories: [{ title: 'Yang' }] },
      },
    ]
    const result = await enrichMissingGrammarTopics(sections, 4)
    expect(result.source).toBe('deterministic')
    expect(sections[0].content.grammar_topics).toEqual(['Yang'])
  })

  it('passes ALL grammar sections to the LLM for cohesive lesson-level summarisation, not just the empty ones', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key'
    messagesCreateMock.mockResolvedValue({
      content: [{ type: 'text', text: '{"labels": ["Tijdaanduiding"]}' }],
    })

    const sections = [
      // Already populated — but should still be passed to LLM for context.
      { title: 'Dagindeling', order_index: 1, content: { type: 'grammar', grammar_topics: ['existing'], categories: [{ title: 'Dagdelen' }] } },
      // Empty — this is the trigger.
      { title: 'Tijdsindeling', order_index: 2, content: { type: 'grammar', categories: [{ title: 'Kloktijd' }, { title: 'Tijdsduur' }] } },
    ]
    await enrichMissingGrammarTopics(sections, 6)

    expect(messagesCreateMock).toHaveBeenCalledTimes(1)
    const call = messagesCreateMock.mock.calls[0][0] as { messages: Array<{ content: string }> }
    const prompt = call.messages[0].content
    expect(prompt).toContain('Dagindeling')
    expect(prompt).toContain('Tijdsindeling')
    expect(prompt).toContain('Dagdelen')
    expect(prompt).toContain('Kloktijd')
    // Both sections get the same new label, overriding the prior 'existing' value
    // — lesson-level cohesion wins. Curated per-section labels were preserved by
    // the trigger check earlier (if no section was empty, the enricher would not
    // run at all).
    expect(sections[0].content.grammar_topics).toEqual(['Tijdaanduiding'])
    expect(sections[1].content.grammar_topics).toEqual(['Tijdaanduiding'])
  })
})
