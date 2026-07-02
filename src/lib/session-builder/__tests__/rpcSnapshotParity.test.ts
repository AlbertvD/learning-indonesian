import { describe, expect, it } from 'vitest'
import { createSessionBuilderAdapter } from '@/lib/session-builder/adapter'
import type { CapabilitySessionDataRequest } from '@/lib/session-builder/builder'

// ADR-0015 layer-b (semantic) parity — data-architect APPROVE condition 1
// (docs/plans/2026-07-02-session-data-narrowing-rpc.md, "Testing" #1).
//
// The narrowing RPC changes exactly ONE input to loadCapabilitySessionData's
// assembly: the `capabilities` array (candidate_caps, narrowed by the
// sufficiency predicate A-E) — the other five payload pieces
// (learner_states/activated_lesson_ids/lessons/reviewed_today_capability_ids/
// activated_member_refs) were NEVER filtered by the pre-cutover six-query
// fan-out either (learner_capability_state, learner_lesson_activation, lessons,
// capability_review_events, and resolveActivatedMemberRefs were all read
// user-scoped-but-otherwise-unconditional). So "old six-query snapshot" ==
// "new RPC snapshot fed the UNNARROWED (full ready+published) catalog" for
// every field this module reads — the adapter's in-memory assembly logic
// (§3.1 of the spec) is byte-for-byte unchanged by the cutover.
//
// This test proves the CLOSED-WORLD case the spec's own edge cases name for
// Testing #1 ("Completionist who activated everything... payload ≈ today's.
// No regression, no improvement"): a fixture where every ready+published
// capability is reachable via the sufficiency predicate, so the narrowed
// catalog and the full catalog COINCIDE — and asserts the resulting
// CapabilitySessionDataSnapshot is deep-equal whichever catalog the RPC
// mock returns. (The case where narrowing genuinely DROPS an out-of-scope
// capability is Testing #2/#3's job — proving that drop doesn't change the
// planner's due/practice/new-introduction output — not this snapshot-equality
// test, which only holds when the catalogs coincide.)

interface FixtureCapability {
  id: string
  canonical_key: string
  source_kind: string
  source_ref: string
  capability_type: string
  direction: string
  modality: string
  learner_language: string
  projection_version: string
  readiness_status: string
  publication_status: string
  lesson_id: string | null
  prerequisite_keys: string[]
}

interface FixtureState {
  id: string
  user_id: string
  capability_id: string
  canonical_key_snapshot: string
  activation_state: string
  stability: number | null
  difficulty: number | null
  last_reviewed_at: string | null
  next_due_at: string | null
  review_count: number
  lapse_count: number
  consecutive_failure_count: number
  state_version: number
}

interface World {
  capabilities: FixtureCapability[]
  states: FixtureState[]
  lessons: { id: string; order_index: number }[]
  activatedLessonIds: string[]
  activatedMemberRefs: string[]
  reviewedTodayCapabilityIds: string[]
}

// Mirrors the RPC's candidate_caps WHERE clause (migration.sql, clauses A-E) —
// the SQL-side narrowing predicate, replicated in TS so this test can compute
// "what would the RPC return" without a live database. Parity between THIS
// mirror and the actual SQL is guarded separately by the structural test
// (scripts/__tests__/session-build-data-rpc-migration.test.ts).
function narrow(world: World, mode: CapabilitySessionDataRequest['mode'], selectedSourceRefs: string[]): FixtureCapability[] {
  const stateCapabilityIds = new Set(world.states.map(s => s.capability_id))
  const activatedLessonIds = new Set(world.activatedLessonIds)
  const activatedMemberRefs = new Set(world.activatedMemberRefs)
  return world.capabilities.filter(c => {
    if (c.readiness_status !== 'ready' || c.publication_status !== 'published') return false
    if (stateCapabilityIds.has(c.id)) return true // (A) unconditional
    if (mode === 'standard') {
      if (c.lesson_id != null && activatedLessonIds.has(c.lesson_id)) return true // (B)
      if (activatedMemberRefs.has(c.source_ref)) return true // (C)
      if (c.lesson_id == null) return true // (D)
      return false
    }
    return selectedSourceRefs.includes(c.source_ref) // (E)
  })
}

function payloadFor(world: World, capabilities: FixtureCapability[]) {
  return {
    capabilities,
    learner_states: world.states,
    activated_lesson_ids: world.activatedLessonIds,
    lessons: world.lessons,
    reviewed_today_capability_ids: world.reviewedTodayCapabilityIds,
    activated_member_refs: world.activatedMemberRefs,
  }
}

function adapterFor(payload: unknown) {
  return createSessionBuilderAdapter({
    schema: () => ({
      from: () => { throw new Error('should call .rpc(), not .from()') },
      rpc: () => Promise.resolve({ data: payload, error: null }),
    }),
  } as any)
}

// Fields the spec's Testing #1 names explicitly.
function comparableFields(snapshot: Awaited<ReturnType<ReturnType<typeof adapterFor>['loadCapabilitySessionData']>>) {
  return {
    capabilitiesByKey: snapshot.capabilitiesByKey,
    schedulerRows: snapshot.schedulerRows,
    plannerInput: snapshot.plannerInput,
    reviewedTodayRefs: snapshot.reviewedTodayRefs,
    currentLessonId: snapshot.currentLessonId,
    nextLessonNeedsExposure: snapshot.nextLessonNeedsExposure,
  }
}

async function assertParity(world: World, request: Omit<CapabilitySessionDataRequest, 'userId'>) {
  const fullRequest: CapabilitySessionDataRequest = { userId: 'user-1', ...request }
  // "Old" — the pre-cutover six-query fan-out never filtered the catalog by
  // anything other than ready+published+not-retired (adapter.ts:288-293,
  // pre-cutover). Reproduced here as the full, unnarrowed candidate set.
  const fullCatalog = world.capabilities.filter(c => c.readiness_status === 'ready' && c.publication_status === 'published')
  const oldSnapshot = await adapterFor(payloadFor(world, fullCatalog)).loadCapabilitySessionData(fullRequest)
  // "New" — the RPC's narrowed candidate_caps set.
  const narrowedCatalog = narrow(world, request.mode, request.selectedSourceRefs ?? [])
  const newSnapshot = await adapterFor(payloadFor(world, narrowedCatalog)).loadCapabilitySessionData(fullRequest)

  // Closed-world precondition: the narrowed set and the full set coincide for
  // this fixture (every capability is reachable via A-E) — this is what makes
  // deep-equal snapshot comparison meaningful (see file header comment).
  expect(narrowedCatalog.map(c => c.id).sort()).toEqual(fullCatalog.map(c => c.id).sort())

  expect(comparableFields(newSnapshot)).toEqual(comparableFields(oldSnapshot))
}

function cap(overrides: Partial<FixtureCapability> & { id: string; canonical_key: string; source_ref: string }): FixtureCapability {
  return {
    source_kind: 'vocabulary_src',
    capability_type: 'recall_meaning_from_text_cap',
    direction: 'id_to_l1',
    modality: 'text',
    learner_language: 'nl',
    projection_version: 'capability-v3',
    readiness_status: 'ready',
    publication_status: 'published',
    lesson_id: null,
    prerequisite_keys: [],
    ...overrides,
  }
}

function state(overrides: Partial<FixtureState> & { id: string; capability_id: string; canonical_key_snapshot: string }): FixtureState {
  return {
    user_id: 'user-1',
    activation_state: 'active',
    stability: 1,
    difficulty: 5,
    last_reviewed_at: '2026-04-24T00:00:00.000Z',
    next_due_at: '2026-04-25T00:00:00.000Z',
    review_count: 1,
    lapse_count: 0,
    consecutive_failure_count: 0,
    state_version: 1,
    ...overrides,
  }
}

describe('get_session_build_data snapshot parity — old (full catalog) vs new (RPC-narrowed) assembly', () => {
  it('standard mode: a closed world spanning clauses A (state), B (lesson-activated), C (collection member), D (null-lesson podcast) assembles identically', async () => {
    const world: World = {
      capabilities: [
        cap({ id: 'cap-a', canonical_key: 'key-a', source_ref: 'learning_items/a', lesson_id: 'lesson-1' }), // (A) has state
        cap({ id: 'cap-b', canonical_key: 'key-b', source_ref: 'learning_items/b', lesson_id: 'lesson-1' }), // (B) lesson activated
        cap({ id: 'cap-c', canonical_key: 'key-c', source_ref: 'learning_items/c', lesson_id: 'lesson-2' }), // (C) collection member (lesson-2 NOT activated)
        cap({ id: 'cap-d', canonical_key: 'key-d', source_ref: 'podcasts/warung/seg-01', source_kind: 'podcast_segment_src', capability_type: 'recognise_meaning_from_audio_cap', lesson_id: null }), // (D) null lesson
      ],
      states: [
        state({ id: 'state-a', capability_id: 'cap-a', canonical_key_snapshot: 'key-a' }),
      ],
      lessons: [{ id: 'lesson-1', order_index: 1 }, { id: 'lesson-2', order_index: 2 }],
      activatedLessonIds: ['lesson-1'],
      activatedMemberRefs: ['learning_items/c'],
      reviewedTodayCapabilityIds: ['cap-a'],
    }

    await assertParity(world, {
      mode: 'standard',
      now: new Date('2026-04-25T12:00:00.000Z'),
      limit: 100,
      preferredSessionSize: 15,
    })
  })

  it('scoped mode (clause E): a lesson-practice session over selected source_refs assembles identically', async () => {
    const world: World = {
      capabilities: [
        cap({ id: 'cap-e1', canonical_key: 'key-e1', source_ref: 'learning_items/e1', lesson_id: 'lesson-4' }),
        cap({ id: 'cap-e2', canonical_key: 'key-e2', source_ref: 'learning_items/e2', lesson_id: 'lesson-4' }),
      ],
      states: [],
      lessons: [{ id: 'lesson-4', order_index: 4 }],
      activatedLessonIds: [],
      activatedMemberRefs: [],
      reviewedTodayCapabilityIds: [],
    }

    await assertParity(world, {
      mode: 'lesson_practice',
      now: new Date('2026-04-25T12:00:00.000Z'),
      limit: 100,
      preferredSessionSize: 15,
      selectedLessonId: 'lesson-4',
      selectedSourceRefs: ['learning_items/e1', 'learning_items/e2'],
    })
  })

  it('Trap 1 — a due capability in a NON-activated lesson (reachable only via clause A) still assembles identically', async () => {
    const world: World = {
      capabilities: [
        cap({ id: 'cap-due', canonical_key: 'key-due', source_ref: 'learning_items/due-word', lesson_id: 'lesson-99' }),
      ],
      states: [
        state({ id: 'state-due', capability_id: 'cap-due', canonical_key_snapshot: 'key-due', next_due_at: '2026-04-25T00:00:00.000Z' }),
      ],
      lessons: [{ id: 'lesson-99', order_index: 99 }],
      activatedLessonIds: [], // lesson-99 is NOT activated
      activatedMemberRefs: [],
      reviewedTodayCapabilityIds: [],
    }

    await assertParity(world, {
      mode: 'standard',
      now: new Date('2026-04-25T12:00:00.000Z'),
      limit: 100,
      preferredSessionSize: 15,
    })

    // Positive control: the due capability actually surfaces (not just present
    // in the map) — schedulerRows carries it either way.
    const narrowedCatalog = narrow(world, 'standard', [])
    const snapshot = await adapterFor(payloadFor(world, narrowedCatalog)).loadCapabilitySessionData({
      userId: 'user-1', mode: 'standard', now: new Date('2026-04-25T12:00:00.000Z'), limit: 100, preferredSessionSize: 15,
    })
    expect(snapshot.schedulerRows.some(row => row.canonicalKeySnapshot === 'key-due')).toBe(true)
    expect(snapshot.plannerInput.dueCount).toBe(1)
  })
})
