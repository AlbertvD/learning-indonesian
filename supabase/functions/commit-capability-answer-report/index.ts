import { createEmptyCard, fsrs, generatorParameters, Rating } from 'npm:ts-fsrs@5.3.2'
import type { Card, FSRSParameters, Grade } from 'npm:ts-fsrs@5.3.2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const fsrsParams: FSRSParameters = {
  ...generatorParameters(),
  request_retention: 0.85,
  w: [0.4, 0.6, 2.4, 5.8, 4.93, 0.94, 0.86, 0.01, 1.49, 0.14, 0.94, 2.52, 0.62, 0.4, 1.26, 0.29, 2.52],
}
const scheduler = fsrs(fsrsParams)

type ReviewState = 'dormant' | 'active' | 'suspended' | 'retired'

interface AnswerReport {
  wasCorrect: boolean
  hintUsed: boolean
  isFuzzy: boolean
  rawResponse: string | null
  normalizedResponse: string | null
  latencyMs: number | null
}

interface ScheduleSnapshot {
  stateVersion: number
  activationState: ReviewState
  activationSource?: 'review_processor' | 'admin_backfill' | 'legacy_migration'
  stability?: number | null
  difficulty?: number | null
  retrievability?: number | null
  lastReviewedAt?: string | null
  nextDueAt?: string | null
  reviewCount: number
  lapseCount: number
  consecutiveFailureCount: number
}

interface CapabilityRow {
  id: string
  canonical_key: string
  readiness_status: string
  publication_status: string
}

interface StateRow {
  id: string
  activation_state: ReviewState
  activation_source: 'review_processor' | 'admin_backfill' | 'legacy_migration' | null
  stability: number | null
  difficulty: number | null
  last_reviewed_at: string | null
  next_due_at: string | null
  review_count: number
  lapse_count: number
  consecutive_failure_count: number
  state_version: number
}

interface ExistingReviewEventRow {
  id: string
  state_after_json: ScheduleSnapshot
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  })
}

function publicReject(status: number, error: string): Response {
  return jsonResponse({ error }, status)
}

function rejectCommit(schedule: ScheduleSnapshot | null, idempotencyStatus: 'rejected_stale' | 'rejected_invalid_outcome') {
  return jsonResponse({
    idempotencyStatus,
    reviewEventId: null,
    schedule: schedule ?? {
      stateVersion: 0,
      activationState: 'dormant',
      reviewCount: 0,
      lapseCount: 0,
      consecutiveFailureCount: 0,
    },
    masteryRefreshQueued: false,
  })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isAnswerReport(value: unknown): value is AnswerReport {
  if (!isRecord(value)) return false
  return typeof value.wasCorrect === 'boolean'
    && typeof value.hintUsed === 'boolean'
    && typeof value.isFuzzy === 'boolean'
    && (value.rawResponse == null || typeof value.rawResponse === 'string')
    && (value.normalizedResponse == null || typeof value.normalizedResponse === 'string')
    && (value.latencyMs == null || typeof value.latencyMs === 'number')
}

function inferRating(answerReport: AnswerReport): Grade {
  if (!answerReport.wasCorrect) return Rating.Again
  if (answerReport.hintUsed || answerReport.isFuzzy) return Rating.Hard
  return Rating.Good
}

function retrievability(stability: number, lastReviewedAt: Date, reviewedAt: Date): number {
  const elapsedDays = (reviewedAt.getTime() - lastReviewedAt.getTime()) / (1000 * 60 * 60 * 24)
  if (elapsedDays <= 0) return 1
  return Math.pow(1 + elapsedDays / (9 * stability), -1)
}

function computeNextState(snapshot: ScheduleSnapshot, rating: Grade, reviewedAt: Date): Pick<ScheduleSnapshot, 'stability' | 'difficulty' | 'retrievability' | 'nextDueAt'> {
  const currentState = snapshot.activationState === 'dormant' || snapshot.stability == null || snapshot.difficulty == null
    ? null
    : {
        stability: snapshot.stability,
        difficulty: snapshot.difficulty,
        lastReviewedAt: snapshot.lastReviewedAt ? new Date(snapshot.lastReviewedAt) : null,
      }
  const preReviewRetrievability = currentState?.lastReviewedAt
    ? retrievability(currentState.stability, currentState.lastReviewedAt, reviewedAt)
    : 1

  let card: Card
  if (currentState) {
    card = {
      ...createEmptyCard(reviewedAt),
      stability: currentState.stability,
      difficulty: currentState.difficulty,
      last_review: currentState.lastReviewedAt ?? undefined,
      state: 2,
    } as Card
  } else {
    card = createEmptyCard(reviewedAt)
  }

  const scheduled = scheduler.next(card, reviewedAt, rating)
  return {
    stability: scheduled.card.stability,
    difficulty: scheduled.card.difficulty,
    retrievability: preReviewRetrievability,
    nextDueAt: scheduled.card.due.toISOString(),
  }
}

function stateSnapshot(row: StateRow): ScheduleSnapshot {
  return {
    stateVersion: row.state_version,
    activationState: row.activation_state,
    activationSource: row.activation_source ?? undefined,
    stability: row.stability,
    difficulty: row.difficulty,
    lastReviewedAt: row.last_reviewed_at,
    nextDueAt: row.next_due_at,
    reviewCount: row.review_count,
    lapseCount: row.lapse_count,
    consecutiveFailureCount: row.consecutive_failure_count,
  }
}

function dormantSnapshot(): ScheduleSnapshot {
  return {
    stateVersion: 0,
    activationState: 'dormant',
    reviewCount: 0,
    lapseCount: 0,
    consecutiveFailureCount: 0,
  }
}

async function fetchRows<T>(supabaseUrl: string, serviceRoleKey: string, path: string): Promise<T[]> {
  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    headers: {
      Authorization: `Bearer ${serviceRoleKey}`,
      apikey: serviceRoleKey,
      'Accept-Profile': 'indonesian',
    },
  })
  if (!response.ok) throw new Error(`postgrest_read_failed:${response.status}`)
  const data = await response.json()
  return Array.isArray(data) ? data as T[] : []
}

function safeString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (request.method !== 'POST') {
    return publicReject(405, 'method_not_allowed')
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceRoleKey) {
    return publicReject(500, 'server_not_configured')
  }

  const authorization = request.headers.get('Authorization')
  if (!authorization?.startsWith('Bearer ')) {
    return publicReject(401, 'missing_user_jwt')
  }

  const body = await request.json().catch(() => null)
  const plan = isRecord(body) ? body.plan : null
  if (!isRecord(plan)) {
    return publicReject(400, 'missing_commit_plan')
  }

  const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      Authorization: authorization,
      apikey: serviceRoleKey,
    },
  })
  if (!userResponse.ok) {
    return publicReject(401, 'invalid_user_jwt')
  }

  const user = await userResponse.json()
  if (user?.id !== plan.userId) {
    return publicReject(403, 'user_mismatch')
  }

  const userId = safeString(plan.userId)
  const capabilityId = safeString(plan.capabilityId)
  const canonicalKeySnapshot = safeString(plan.canonicalKeySnapshot)
  const idempotencyKey = safeString(plan.idempotencyKey)
  const answerReport = plan.answerReport
  if (!userId || !capabilityId || !canonicalKeySnapshot || !idempotencyKey || !isAnswerReport(answerReport)) {
    return rejectCommit(null, 'rejected_invalid_outcome')
  }

  const reviewedAt = new Date()

  let stateBefore: ScheduleSnapshot
  try {
    const existingEvents = await fetchRows<ExistingReviewEventRow>(
      supabaseUrl,
      serviceRoleKey,
      `capability_review_events?user_id=eq.${encodeURIComponent(userId)}&idempotency_key=eq.${encodeURIComponent(idempotencyKey)}&select=id,state_after_json&limit=1`,
    )
    const existingEvent = existingEvents[0]
    if (existingEvent) {
      return jsonResponse({
        idempotencyStatus: 'duplicate_returned',
        reviewEventId: existingEvent.id,
        schedule: existingEvent.state_after_json,
        masteryRefreshQueued: false,
      })
    }

    const capabilityRows = await fetchRows<CapabilityRow>(
      supabaseUrl,
      serviceRoleKey,
      `learning_capabilities?id=eq.${encodeURIComponent(capabilityId)}&select=id,canonical_key,readiness_status,publication_status&limit=1`,
    )
    const capability = capabilityRows[0]
    if (!capability
      || capability.canonical_key !== canonicalKeySnapshot
      || capability.readiness_status !== 'ready'
      || capability.publication_status !== 'published') {
      return rejectCommit(null, 'rejected_invalid_outcome')
    }

    const stateRows = await fetchRows<StateRow>(
      supabaseUrl,
      serviceRoleKey,
      `learner_capability_state?user_id=eq.${encodeURIComponent(userId)}&capability_id=eq.${encodeURIComponent(capabilityId)}&select=id,activation_state,activation_source,stability,difficulty,last_reviewed_at,next_due_at,review_count,lapse_count,consecutive_failure_count,state_version&limit=1`,
    )
    const state = stateRows[0]
    stateBefore = state ? stateSnapshot(state) : dormantSnapshot()

    if (stateBefore.activationState === 'suspended' || stateBefore.activationState === 'retired') {
      return rejectCommit(stateBefore, 'rejected_invalid_outcome')
    }
    if (stateBefore.activationState === 'dormant' && !isRecord(plan.activationRequest)) {
      return rejectCommit(stateBefore, 'rejected_invalid_outcome')
    }
    if (typeof plan.currentStateVersion !== 'number' || plan.currentStateVersion !== stateBefore.stateVersion) {
      return rejectCommit(stateBefore, 'rejected_stale')
    }
  } catch (error) {
    console.error('capability_commit_validation_failed', error)
    return publicReject(500, 'commit_validation_failed')
  }

  const rating = inferRating(answerReport) as 1 | 2 | 3 | 4
  const nextFsrs = computeNextState(stateBefore, rating, reviewedAt)
  const isFailure = rating === Rating.Again
  const trustedPlan = {
    ...plan,
    rating,
    submittedAt: reviewedAt.toISOString(),
    schedulerSnapshot: stateBefore,
    currentStateVersion: stateBefore.stateVersion,
    stateBefore,
    stateAfter: {
      stateVersion: stateBefore.stateVersion + 1,
      activationState: 'active',
      activationSource: stateBefore.activationState === 'dormant'
        ? 'review_processor'
        : stateBefore.activationSource,
      stability: nextFsrs.stability,
      difficulty: nextFsrs.difficulty,
      retrievability: nextFsrs.retrievability,
      lastReviewedAt: reviewedAt.toISOString(),
      nextDueAt: nextFsrs.nextDueAt,
      reviewCount: stateBefore.reviewCount + 1,
      lapseCount: stateBefore.lapseCount + (isFailure && stateBefore.reviewCount > 0 ? 1 : 0),
      consecutiveFailureCount: isFailure ? stateBefore.consecutiveFailureCount + 1 : 0,
    },
    fsrsAlgorithmVersion: 'ts-fsrs:language-learning-v1',
  }

  const rpcResponse = await fetch(`${supabaseUrl}/rest/v1/rpc/commit_capability_answer_report`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${serviceRoleKey}`,
      apikey: serviceRoleKey,
      'Content-Type': 'application/json',
      'Accept-Profile': 'indonesian',
      'Content-Profile': 'indonesian',
    },
    body: JSON.stringify({ p_command: trustedPlan }),
  })

  const result = await rpcResponse.json().catch(() => null)
  if (!rpcResponse.ok) {
    console.error('capability_commit_rpc_failed', { status: rpcResponse.status, result })
    return publicReject(rpcResponse.status, 'commit_rpc_failed')
  }

  return jsonResponse(result)
})
