import type { CapabilityPublicationStatus, CapabilityReadinessStatus } from '@/lib/capabilities'
import type { SessionMode } from './model'

export interface LearnerCapabilityStateRow {
  id: string
  userId: string
  capabilityId: string
  canonicalKeySnapshot: string
  activationState: 'dormant' | 'active' | 'suspended' | 'retired'
  readinessStatus: CapabilityReadinessStatus
  publicationStatus: CapabilityPublicationStatus
  stability: number | null
  difficulty: number | null
  lastReviewedAt: string | null
  nextDueAt: string | null
  reviewCount: number
  lapseCount: number
  consecutiveFailureCount: number
  stateVersion: number
}

export interface DueCapability {
  stateId: string
  capabilityId: string
  canonicalKeySnapshot: string
  nextDueAt: string
  stateVersion: number
}

export interface DueCapabilityRequest {
  userId: string
  now: Date
  mode: SessionMode
  limit: number
}

export interface CapabilitySchedulerReadAdapter {
  listLearnerCapabilityStates(request: DueCapabilityRequest): Promise<LearnerCapabilityStateRow[]>
}

export async function getDueCapabilities(
  request: DueCapabilityRequest,
  adapter: CapabilitySchedulerReadAdapter,
): Promise<DueCapability[]> {
  const rows = await adapter.listLearnerCapabilityStates(request)
  return getDueCapabilitiesFromRows({
    now: request.now,
    limit: request.limit,
    rows,
  })
}

// Cards due within the same 24h window are equivalent in urgency, so we present
// them in a randomised order rather than strictly by next_due_at. This breaks a
// self-perpetuating alphabetical ordering: same-grade cards reviewed seconds
// apart get the same FSRS interval, so their next_due_at preserves the
// alphabetical sequence they were introduced in — which a plain next_due_at sort
// then replays every single session. Bucketing by whole-days-overdue keeps
// genuinely-more-overdue cards ahead of fresher ones (spacing priority is
// preserved at day granularity), while shuffling within each day-bucket gives
// session-to-session variety in both order and which cards make the limit cut.
const DUE_BUCKET_MS = 24 * 60 * 60 * 1000

export function getDueCapabilitiesFromRows(input: {
  now: Date
  limit: number
  rows: LearnerCapabilityStateRow[]
  // Injectable for deterministic tests; production omits it and uses Math.random,
  // giving fresh variety on every session build.
  random?: () => number
}): DueCapability[] {
  const random = input.random ?? Math.random
  const nowMs = input.now.getTime()
  const dueRows = input.rows.filter(row => (
    row.activationState === 'active'
    && row.readinessStatus === 'ready'
    && row.publicationStatus === 'published'
    && row.nextDueAt != null
    && new Date(row.nextDueAt) <= input.now
  ))

  const byDaysOverdue = new Map<number, LearnerCapabilityStateRow[]>()
  for (const row of dueRows) {
    const daysOverdue = Math.floor((nowMs - new Date(row.nextDueAt!).getTime()) / DUE_BUCKET_MS)
    const bucket = byDaysOverdue.get(daysOverdue)
    if (bucket) bucket.push(row)
    else byDaysOverdue.set(daysOverdue, [row])
  }

  // Most-overdue day-bucket first; randomised within each bucket.
  const ordered: LearnerCapabilityStateRow[] = []
  for (const daysOverdue of [...byDaysOverdue.keys()].sort((a, b) => b - a)) {
    ordered.push(...shuffle(byDaysOverdue.get(daysOverdue)!, random))
  }

  return ordered
    .slice(0, input.limit)
    .map(row => ({
      stateId: row.id,
      capabilityId: row.capabilityId,
      canonicalKeySnapshot: row.canonicalKeySnapshot,
      nextDueAt: row.nextDueAt!,
      stateVersion: row.stateVersion,
    }))
}

// Fisher-Yates over a copy; deterministic for a given `random`.
function shuffle<T>(items: readonly T[], random: () => number): T[] {
  const result = [...items]
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1))
    const tmp = result[i]!
    result[i] = result[j]!
    result[j] = tmp
  }
  return result
}

