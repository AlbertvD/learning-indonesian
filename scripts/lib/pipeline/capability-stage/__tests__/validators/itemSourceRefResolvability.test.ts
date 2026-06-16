import { describe, it, expect } from 'vitest'
import { validateItemSourceRefResolvability } from '../../validators/itemSourceRefResolvability'

type CapStub = {
  canonicalKey: string
  sourceKind: string
  sourceRef: string
}

function cap(overrides: Partial<CapStub>): CapStub {
  return {
    canonicalKey: 'cap:v1:vocabulary_src:learning_items/foo:recall_meaning_from_text_cap:id_to_l1:text:nl',
    sourceKind: 'vocabulary_src',
    sourceRef: 'learning_items/foo',
    ...overrides,
  }
}

function item(base_text: string): { base_text: string } {
  return { base_text }
}

describe('validateItemSourceRefResolvability (#59)', () => {
  it('passes when every item-cap source_ref matches an item slug', () => {
    expect(() =>
      validateItemSourceRefResolvability(
        [cap({ sourceRef: 'learning_items/bandar udara' })],
        [item('bandar udara')],
      ),
    ).not.toThrow()
  })

  it('passes when no item-source-kind caps exist', () => {
    expect(() =>
      validateItemSourceRefResolvability([], [item('bandar udara')]),
    ).not.toThrow()
  })

  it('throws when an item-cap source_ref has no matching item', () => {
    expect(() =>
      validateItemSourceRefResolvability(
        [cap({ sourceRef: 'learning_items/bandar-udara' })],
        [item('bandar udara')],
      ),
    ).toThrow(/bandar-udara/)
  })

  it('error message includes the closest item slug as a hint', () => {
    try {
      validateItemSourceRefResolvability(
        [cap({ sourceRef: 'learning_items/bandar-udara' })],
        [item('bandar udara'), item('makan')],
      )
      throw new Error('should have thrown')
    } catch (err) {
      expect((err as Error).message).toMatch(/bandar udara/)
    }
  })

  it('ignores non-item source kinds (pattern, word_form_pair_src)', () => {
    for (const kind of ['pattern', 'word_form_pair_src']) {
      expect(() =>
        validateItemSourceRefResolvability(
          [cap({ sourceKind: kind, sourceRef: 'lesson-1/pattern-foo' })],
          [],
        ),
      ).not.toThrow()
    }
  })

  it('ignores podcast source kinds', () => {
    for (const kind of ['podcast_segment_src', 'podcast_phrase_src']) {
      expect(() =>
        validateItemSourceRefResolvability(
          [cap({ sourceKind: kind, sourceRef: 'podcasts/foo' })],
          [],
        ),
      ).not.toThrow()
    }
  })

  it('ignores dialogue_line caps (lesson sections, not items)', () => {
    expect(() =>
      validateItemSourceRefResolvability(
        [cap({
          sourceKind: 'dialogue_line_src',
          sourceRef: 'lesson-1/section-1/line-0',
        })],
        [],
      ),
    ).not.toThrow()
  })

  it('groups multiple violations into one error reporting the count', () => {
    expect(() =>
      validateItemSourceRefResolvability(
        [
          cap({ sourceRef: 'learning_items/foo-bar' }),
          cap({ sourceRef: 'learning_items/baz-qux' }),
        ],
        [item('foo bar'), item('baz qux')],
      ),
    ).toThrow(/2/)
  })

  it('handles items with empty learning_items list (cap is unresolvable)', () => {
    expect(() =>
      validateItemSourceRefResolvability(
        [cap({ sourceRef: 'learning_items/lonely' })],
        [],
      ),
    ).toThrow(/lonely/)
  })
})
