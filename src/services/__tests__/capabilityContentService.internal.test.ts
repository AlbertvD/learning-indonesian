import { describe, it, expect } from 'vitest'
import { decodeCanonicalKey, extractItemId } from '../capabilityContentService.internal'
import { buildCanonicalKey } from '@/lib/capabilities/canonicalKey'
import { CAPABILITY_SOURCE_KINDS } from '@/lib/capabilities/capabilityTypes'

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

describe('extractItemId', () => {
  it('extracts the id after learning_items/', () => {
    expect(extractItemId('learning_items/abc-123-def')).toBe('abc-123-def')
  })

  it('returns null for non-item refs', () => {
    expect(extractItemId('lesson-1/some_pattern')).toBeNull()
    expect(extractItemId('patterns/grammar-1')).toBeNull()
    expect(extractItemId('garbage')).toBeNull()
    expect(extractItemId('')).toBeNull()
  })

  it('captures greedily — preserves nested slashes in id portion', () => {
    expect(extractItemId('learning_items/some/path')).toBe('some/path')
  })
})
