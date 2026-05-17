import { describe, it, expect } from 'vitest'
import { CAPABILITY_DISPLAY, capabilityDisplay } from '../labels'
import { CAPABILITY_TYPES } from '@/lib/capabilities/capabilityTypes'

describe('CAPABILITY_DISPLAY', () => {
  it('covers every CapabilityType with non-empty label + description', () => {
    for (const type of CAPABILITY_TYPES) {
      const entry = capabilityDisplay(type)
      expect(entry, `missing entry for ${type}`).toBeDefined()
      expect(entry.label.length, `empty label for ${type}`).toBeGreaterThan(0)
      expect(entry.description.length, `empty description for ${type}`).toBeGreaterThan(0)
    }
  })

  it('has no placeholder strings in description or example', () => {
    const placeholderPattern = /TODO|FIXME|lorem|placeholder/i
    for (const type of CAPABILITY_TYPES) {
      const entry = capabilityDisplay(type)
      expect(entry.description, `placeholder in ${type} description`).not.toMatch(placeholderPattern)
      if (entry.example !== undefined) {
        expect(entry.example.length, `empty example for ${type}`).toBeGreaterThan(0)
        expect(entry.example, `placeholder in ${type} example`).not.toMatch(placeholderPattern)
      }
    }
  })

  it('descriptions are exactly one sentence with no semicolons', () => {
    for (const type of CAPABILITY_TYPES) {
      const { description } = CAPABILITY_DISPLAY[type]
      expect(description, `semicolon in ${type} description`).not.toContain(';')
      const sentenceEnds = description.match(/[.!?]/g) ?? []
      expect(sentenceEnds.length, `${type} description should end with exactly one .!? — got ${sentenceEnds.length}`).toBe(1)
    }
  })

  it('capabilityDisplay() returns the matching entry for every type', () => {
    for (const type of CAPABILITY_TYPES) {
      expect(capabilityDisplay(type)).toBe(CAPABILITY_DISPLAY[type])
    }
  })
})
