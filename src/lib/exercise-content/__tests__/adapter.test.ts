import { describe, it, expect } from 'vitest'
import { decodeCanonicalKey, extractItemKey, bucketByDecodedSourceKind } from '../adapter'
import { buildCanonicalKey } from '@/lib/capabilities/canonicalKey'
import { CAPABILITY_SOURCE_KINDS } from '@/lib/capabilities/capabilityTypes'
import type { SessionBlock } from '@/lib/session-builder'

describe('decodeCanonicalKey', () => {
  // Round-trip: every CapabilitySourceKind should encode + decode cleanly.
  // Using buildCanonicalKey outputs (not synthetic strings) catches divergence
  // between the encoder and decoder mechanically.
  for (const sourceKind of CAPABILITY_SOURCE_KINDS) {
    it(`round-trips sourceKind='${sourceKind}'`, () => {
      const sourceRef = sourceKind === 'item' ? 'learning_items/abc-123' : `${sourceKind}-source-id`
      const key = buildCanonicalKey({
        sourceKind,
        sourceRef,
        capabilityType: 'text_recognition',
        direction: 'id_to_l1',
        modality: 'text',
        learnerLanguage: 'nl',
      })
      const decoded = decodeCanonicalKey(key)
      expect(decoded.kind).toBe('ok')
      if (decoded.kind === 'ok') {
        expect(decoded.sourceKind).toBe(sourceKind)
        expect(decoded.sourceRef).toBe(sourceRef)
      }
    })
  }

  it('returns malformed for unparseable garbage', () => {
    expect(decodeCanonicalKey('garbage').kind).toBe('malformed')
  })

  it('returns malformed for missing prefix', () => {
    expect(decodeCanonicalKey('foo:bar:baz:qux').kind).toBe('malformed')
  })

  it('returns malformed for wrong version', () => {
    expect(decodeCanonicalKey('cap:v2:item:learning_items/abc:text_recognition:id_to_l1:text:nl').kind).toBe('malformed')
  })

  it('returns malformed for unknown sourceKind', () => {
    // Shape-correct, 8 parts, but parts[2] is not in CAPABILITY_SOURCE_KINDS.
    // Exercises the whitelist guard introduced in v3 of the spec.
    expect(decodeCanonicalKey('cap:v1:notakind:foo:bar:baz:qux:quux').kind).toBe('malformed')
  })

  it('preserves slashes in sourceRef (encodeSegment does not encode /)', () => {
    const decoded = decodeCanonicalKey(buildCanonicalKey({
      sourceKind: 'item',
      sourceRef: 'learning_items/abc/def',  // hypothetical nested path
      capabilityType: 'text_recognition',
      direction: 'id_to_l1',
      modality: 'text',
      learnerLanguage: 'nl',
    }))
    expect(decoded.kind).toBe('ok')
    if (decoded.kind === 'ok') expect(decoded.sourceRef).toBe('learning_items/abc/def')
  })

  it('decodes %3A back to colons in sourceRef', () => {
    // encodeSegment maps `:` → `%3A` so the split-on-`:` doesn't corrupt
    // sourceRefs that contain a colon. Verify the inverse.
    const decoded = decodeCanonicalKey(buildCanonicalKey({
      sourceKind: 'item',
      sourceRef: 'learning_items/has:colon',
      capabilityType: 'text_recognition',
      direction: 'id_to_l1',
      modality: 'text',
      learnerLanguage: 'nl',
    }))
    expect(decoded.kind).toBe('ok')
    if (decoded.kind === 'ok') expect(decoded.sourceRef).toBe('learning_items/has:colon')
  })
})

describe('extractItemKey', () => {
  it('extracts the id after learning_items/', () => {
    expect(extractItemKey('learning_items/abc-123-def')).toBe('abc-123-def')
  })

  it('returns null for non-item refs', () => {
    expect(extractItemKey('lesson-1/some_pattern')).toBeNull()
    expect(extractItemKey('patterns/grammar-1')).toBeNull()
    expect(extractItemKey('garbage')).toBeNull()
    expect(extractItemKey('')).toBeNull()
  })

  it('captures greedily — preserves nested slashes in id portion', () => {
    expect(extractItemKey('learning_items/some/path')).toBe('some/path')
  })
})

// ─── bucketByDecodedSourceKind ──────────────────────────────────────────────

function makeBlockWithSourceRef(opts: { sourceKind: 'item' | 'dialogue_line' | 'pattern' | 'affixed_form_pair'; sourceRef: string }): SessionBlock {
  const key = buildCanonicalKey({
    sourceKind: opts.sourceKind,
    sourceRef: opts.sourceRef,
    capabilityType: 'contextual_cloze',
    direction: 'id_to_l1',
    modality: 'text',
    learnerLanguage: 'nl',
  })
  return {
    id: `block-${opts.sourceRef}`,
    kind: 'due_review',
    capabilityId: `cap-${opts.sourceRef}`,
    canonicalKeySnapshot: key,
    renderPlan: {
      capabilityKey: key,
      sourceRef: opts.sourceRef,
      exerciseType: 'cloze',
      capabilityType: 'contextual_cloze',
      skillType: 'form_recall',
    },
    reviewContext: {
      schedulerSnapshot: {} as never,
      currentStateVersion: 0,
      artifactVersionSnapshot: {},
      capabilityReadinessStatus: 'ready',
      capabilityPublicationStatus: 'published',
    },
  }
}

describe('bucketByDecodedSourceKind', () => {
  it('places item blocks in the item bucket with their slug extracted', () => {
    const block = makeBlockWithSourceRef({ sourceKind: 'item', sourceRef: 'learning_items/apa' })
    const { buckets, failures } = bucketByDecodedSourceKind([block])
    expect(failures.size).toBe(0)
    expect(buckets.item).toEqual([{ block, itemKey: 'apa' }])
    expect(buckets.dialogue_line).toEqual([])
  })

  it('places dialogue_line blocks in the dialogue_line bucket', () => {
    const block = makeBlockWithSourceRef({ sourceKind: 'dialogue_line', sourceRef: 'lesson-9/section-1/line-10' })
    const { buckets, failures } = bucketByDecodedSourceKind([block])
    expect(failures.size).toBe(0)
    expect(buckets.dialogue_line).toEqual([{ block, sourceRef: 'lesson-9/section-1/line-10' }])
    expect(buckets.item).toEqual([])
  })

  it('fails dialogue_line_ref_unparseable when the sourceRef does not match lesson-N/section-M/line-K', () => {
    const block = makeBlockWithSourceRef({ sourceKind: 'dialogue_line', sourceRef: 'lesson-9/section-1' })
    const { buckets, failures } = bucketByDecodedSourceKind([block])
    expect(buckets.dialogue_line).toEqual([])
    expect(failures.size).toBe(1)
    const ctx = failures.get(block.id)!
    expect(ctx.diagnostic?.reasonCode).toBe('dialogue_line_ref_unparseable')
  })

  it('places pattern blocks in the pattern bucket post 2026-05-24 (PR 4 fetcher landed)', () => {
    const blockPattern = makeBlockWithSourceRef({ sourceKind: 'pattern', sourceRef: 'lesson-9/pattern-1' })
    const { buckets, failures } = bucketByDecodedSourceKind([blockPattern])
    expect(buckets.item).toEqual([])
    expect(buckets.dialogue_line).toEqual([])
    expect(buckets.affixed_form_pair).toEqual([])
    expect(failures.size).toBe(0)
    expect(buckets.pattern).toEqual([{ block: blockPattern, sourceRef: 'lesson-9/pattern-1' }])
  })

  it('fails pattern_ref_unparseable for a pattern block whose ref lacks the /pattern- segment', () => {
    const blockPattern = makeBlockWithSourceRef({ sourceKind: 'pattern', sourceRef: 'lesson-9/morphology-1' })
    const { buckets, failures } = bucketByDecodedSourceKind([blockPattern])
    expect(buckets.pattern).toEqual([])
    expect(failures.size).toBe(1)
    expect(failures.get(blockPattern.id)?.diagnostic?.reasonCode).toBe('pattern_ref_unparseable')
  })

  it('places affixed_form_pair blocks in the affixed_form_pair bucket with direction parsed from canonical-key tail', () => {
    const block = makeBlockWithSourceRef({ sourceKind: 'affixed_form_pair', sourceRef: 'lesson-9/morphology/meN-baca-membaca' })
    const { buckets, failures } = bucketByDecodedSourceKind([block])
    expect(failures.size).toBe(0)
    expect(buckets.affixed_form_pair).toHaveLength(1)
    const entry = buckets.affixed_form_pair[0]
    expect(entry.sourceRef).toBe('lesson-9/morphology/meN-baca-membaca')
    // The test's makeBlockWithSourceRef builds the canonical key with
    // direction='id_to_l1' (a synthetic value used across this test file);
    // the bucketing function reads it from the tail and surfaces it
    // verbatim. Production caps carry 'root_to_derived' or 'derived_to_root'.
    expect(entry.direction).toBe('id_to_l1')
  })

  it('fails affixed_form_pair_ref_unparseable when the sourceRef does not match lesson-N/morphology/<slug>', () => {
    const block = makeBlockWithSourceRef({ sourceKind: 'affixed_form_pair', sourceRef: 'garbage/path' })
    const { buckets, failures } = bucketByDecodedSourceKind([block])
    expect(buckets.affixed_form_pair).toEqual([])
    expect(failures.size).toBe(1)
    const ctx = failures.get(block.id)!
    expect(ctx.diagnostic?.reasonCode).toBe('affixed_form_pair_ref_unparseable')
  })

  it('mixes item + dialogue_line + affixed_form_pair in one call without crosstalk', () => {
    const itemBlock = makeBlockWithSourceRef({ sourceKind: 'item', sourceRef: 'learning_items/apa' })
    const dialogueBlock = makeBlockWithSourceRef({ sourceKind: 'dialogue_line', sourceRef: 'lesson-9/section-1/line-10' })
    const affixedBlock = makeBlockWithSourceRef({ sourceKind: 'affixed_form_pair', sourceRef: 'lesson-9/morphology/meN-baca-membaca' })
    const { buckets, failures } = bucketByDecodedSourceKind([itemBlock, dialogueBlock, affixedBlock])
    expect(failures.size).toBe(0)
    expect(buckets.item).toHaveLength(1)
    expect(buckets.dialogue_line).toHaveLength(1)
    expect(buckets.affixed_form_pair).toHaveLength(1)
  })
})

describe('decodeCanonicalKey — tail parsing', () => {
  it('returns tail components when canonical key has all 8 parts', () => {
    const key = buildCanonicalKey({
      sourceKind: 'affixed_form_pair',
      sourceRef: 'lesson-9/morphology/meN-baca-membaca',
      capabilityType: 'root_derived_recall',
      direction: 'root_to_derived',
      modality: 'text',
      learnerLanguage: 'none',
    })
    const decoded = decodeCanonicalKey(key)
    expect(decoded.kind).toBe('ok')
    if (decoded.kind === 'ok') {
      expect(decoded.tail).toEqual({
        capabilityType: 'root_derived_recall',
        direction: 'root_to_derived',
        modality: 'text',
        learnerLanguage: 'none',
      })
    }
  })

  it('returns tail=null when canonical key has fewer than 8 parts but is otherwise valid', () => {
    // 4-part key passes the leading guard; tail is null.
    const decoded = decodeCanonicalKey('cap:v1:item:learning_items/abc')
    expect(decoded.kind).toBe('ok')
    if (decoded.kind === 'ok') {
      expect(decoded.tail).toBeNull()
    }
  })
})
