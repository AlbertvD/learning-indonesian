import { describe, expect, it } from 'vitest'
import { parseMaterializeArgs, planCapabilityMaterialization } from '../materialize-capabilities'
import type { ProjectedCapability } from '../../src/lib/capabilities/capabilityTypes'

function capability(overrides: Partial<ProjectedCapability> = {}): ProjectedCapability {
  return {
    canonicalKey: 'cap:v1:item:learning_items/item-1:meaning_recall:id_to_l1:text:nl',
    sourceKind: 'item',
    sourceRef: 'learning_items/item-1',
    capabilityType: 'meaning_recall',
    skillType: 'meaning_recall',
    direction: 'id_to_l1',
    modality: 'text',
    learnerLanguage: 'nl',
    requiredArtifacts: ['meaning:l1', 'accepted_answers:l1'],
    prerequisiteKeys: [],
    difficultyLevel: overrides.difficultyLevel ?? 2,
    goalTags: overrides.goalTags ?? [],
    projectionVersion: 'capability-v1',
    sourceFingerprint: 'source',
    artifactFingerprint: 'artifact',
    ...overrides,
  }
}

describe('capability materialization planning', () => {
  it('plans inserts by canonical key without writing by default', () => {
    const plan = planCapabilityMaterialization({
      capabilities: [capability()],
      existingCanonicalKeys: new Set(),
      aliases: [],
      applyBackfill: false,
      readinessByCanonicalKey: new Map([[
        'cap:v1:item:learning_items/item-1:meaning_recall:id_to_l1:text:nl',
        'ready',
      ]]),
      approvedArtifactsByCapabilityKey: new Map([[
        'cap:v1:item:learning_items/item-1:meaning_recall:id_to_l1:text:nl',
        ['meaning:l1'],
      ]]),
    })

    expect(plan.capabilityInserts).toHaveLength(1)
    expect(plan.capabilityInserts[0]?.metadataJson.requiredArtifacts).toEqual(['meaning:l1', 'accepted_answers:l1'])
    expect(plan.capabilityInserts[0]?.metadataJson.difficultyLevel).toBe(2)
    expect(plan.capabilityInserts[0]?.metadataJson.goalTags).toEqual([])
    expect(plan.artifactUpserts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        capabilityKey: 'cap:v1:item:learning_items/item-1:meaning_recall:id_to_l1:text:nl',
        sourceRef: 'learning_items/item-1',
        artifactKind: 'meaning:l1',
        qualityStatus: 'approved',
      }),
    ]))
    expect(plan.backfillWrites).toEqual([])
  })

  it('does not invent readiness or artifact approval outside the capability contract', () => {
    const plan = planCapabilityMaterialization({
      capabilities: [capability()],
      existingCanonicalKeys: new Set(),
      aliases: [],
      applyBackfill: false,
    })

    expect(plan.capabilityInserts[0]?.readinessStatus).toBe('unknown')
    expect(plan.artifactUpserts).toEqual([])
  })

  it('supports split aliases and refuses inferred auto-backfill', () => {
    const plan = planCapabilityMaterialization({
      capabilities: [capability()],
      existingCanonicalKeys: new Set(['cap:v1:item:learning_items/item-1:meaning_recall:id_to_l1:text:nl']),
      aliases: [{
        oldCanonicalKey: 'old-key',
        newCanonicalKey: 'new-key-a',
        reason: 'split',
        migrationConfidence: 'inferred',
      }, {
        oldCanonicalKey: 'old-key',
        newCanonicalKey: 'new-key-b',
        reason: 'split',
        migrationConfidence: 'medium',
      }],
      applyBackfill: true,
    })

    expect(plan.aliasUpserts).toHaveLength(2)
    expect(plan.backfillWrites).toEqual([])
    expect(plan.blockedBackfills).toEqual(expect.arrayContaining([
      expect.objectContaining({ reason: 'migration_confidence_requires_review' }),
    ]))
  })

  it('rejects alias cycles rather than planning fragile migrations', () => {
    expect(() => planCapabilityMaterialization({
      capabilities: [capability()],
      existingCanonicalKeys: new Set(),
      aliases: [{
        oldCanonicalKey: 'key-a',
        newCanonicalKey: 'key-b',
        reason: 'rename',
        migrationConfidence: 'exact',
      }, {
        oldCanonicalKey: 'key-b',
        newCanonicalKey: 'key-a',
        reason: 'rename',
        migrationConfidence: 'exact',
      }],
      applyBackfill: false,
    })).toThrow('Alias cycle')
  })

  it('backfills only ready and published capabilities when explicitly applied', () => {
    const plan = planCapabilityMaterialization({
      capabilities: [capability()],
      existingCanonicalKeys: new Set(),
      aliases: [],
      applyBackfill: true,
      learnerBackfillCandidates: [{
        userId: 'user-1',
        capabilityId: 'capability-1',
        canonicalKey: 'cap:v1:item:learning_items/item-1:meaning_recall:id_to_l1:text:nl',
        readinessStatus: 'ready',
        publicationStatus: 'published',
      }],
    })

    expect(plan.backfillWrites).toEqual([{
      userId: 'user-1',
      capabilityId: 'capability-1',
      canonicalKeySnapshot: 'cap:v1:item:learning_items/item-1:meaning_recall:id_to_l1:text:nl',
      activationSource: 'admin_backfill',
    }])
  })

  it('blocks admin backfill for non-ready or unpublished capabilities', () => {
    const plan = planCapabilityMaterialization({
      capabilities: [capability()],
      existingCanonicalKeys: new Set(),
      aliases: [],
      applyBackfill: true,
      learnerBackfillCandidates: [{
        userId: 'user-1',
        capabilityId: 'capability-1',
        canonicalKey: 'cap:v1:item:learning_items/item-1:meaning_recall:id_to_l1:text:nl',
        readinessStatus: 'blocked',
        publicationStatus: 'published',
      }, {
        userId: 'user-1',
        capabilityId: 'capability-2',
        canonicalKey: 'cap:v1:item:learning_items/item-2:meaning_recall:id_to_l1:text:nl',
        readinessStatus: 'ready',
        publicationStatus: 'draft',
      }],
    })

    expect(plan.backfillWrites).toEqual([])
    expect(plan.blockedBackfills.map(blocked => blocked.reason)).toEqual([
      'capability_not_ready_or_published',
      'capability_not_ready_or_published',
    ])
  })

  it('keeps apply backfill off unless the explicit admin flag is present', () => {
    expect(parseMaterializeArgs(['--dry-run']).applyBackfill).toBe(false)
    expect(parseMaterializeArgs(['--apply-backfill']).applyBackfill).toBe(true)
  })
})
