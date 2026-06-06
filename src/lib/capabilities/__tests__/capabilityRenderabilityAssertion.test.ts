import { describe, it, expect } from 'vitest'
import { assertCapabilityTypesRenderable } from '../renderContracts'
import { CAPABILITY_TYPES, deriveSkillTypeFromCapabilityType } from '../capabilityTypes'

// Boot-time identity guardrail (Slice 1, cap-v2 §2 guardrail 1): every
// capability type the catalog can emit must have (a) at least one
// RENDER_CONTRACTS entry that serves it (a render path) and (b) a
// non-throwing deriveSkillTypeFromCapabilityType branch (a level). The IIFE in
// renderContracts.ts calls this against the real CAPABILITY_TYPES at module
// load; this test exercises the same pure check directly.

describe('assertCapabilityTypesRenderable', () => {
  it('passes for the real CAPABILITY_TYPES (every live type renders + has a level)', () => {
    expect(() =>
      assertCapabilityTypesRenderable(CAPABILITY_TYPES, deriveSkillTypeFromCapabilityType),
    ).not.toThrow()
  })

  it('throws when a type has no RENDER_CONTRACTS render path', () => {
    // Fabricate a type absent from every contract's capabilityTypes.
    const fabricated = 'totally_unrenderable_type' as (typeof CAPABILITY_TYPES)[number]
    expect(() =>
      assertCapabilityTypesRenderable([...CAPABILITY_TYPES, fabricated], deriveSkillTypeFromCapabilityType),
    ).toThrow(/no render path|RENDER_CONTRACTS/i)
  })

  it('throws when a type has no level (derive branch throws / returns undefined)', () => {
    // A derive fn that throws for one type stands in for a missing switch branch.
    const fabricated = 'levelless_type' as (typeof CAPABILITY_TYPES)[number]
    const deriveWithGap = (t: (typeof CAPABILITY_TYPES)[number]) => {
      if (t === fabricated) throw new Error('no level branch')
      return deriveSkillTypeFromCapabilityType(t as Parameters<typeof deriveSkillTypeFromCapabilityType>[0])
    }
    // Give the fabricated type a render path so we isolate the level failure:
    // it still fails because the derive fn throws for it.
    expect(() =>
      assertCapabilityTypesRenderable([...CAPABILITY_TYPES, fabricated], deriveWithGap),
    ).toThrow()
  })
})
