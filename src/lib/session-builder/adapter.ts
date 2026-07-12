import { supabase } from '@/lib/supabase'
import {
  CAPABILITY_PROJECTION_VERSION,
  deriveSkillTypeFromCapabilityType,
  validateCapability,
  type CapabilityDirection,
  type CapabilityModality,
  type CapabilityReadiness,
  type CapabilitySourceKind,
  type CapabilityType,
  type LearnerLanguage,
  type ProjectedCapability,
} from '@/lib/capabilities'
import {
  getDueCapabilitiesFromRows,
  type LearnerCapabilityStateRow,
} from './dueFilter'
import type { PlannerCapability, PlannerLearnerCapabilityState } from '@/lib/session-builder/pedagogy'
import type { CapabilitySessionDataAdapter, CapabilitySessionDataRequest, CapabilitySessionDataSnapshot } from '@/lib/session-builder/builder'
import type {
  CapabilityPublicationStatus,
  CapabilityReadinessStatus,
} from '@/lib/capabilities'

interface SupabaseSchemaClient {
  schema(schema: 'indonesian'): {
    from(table: string): any
    rpc(fn: string, args: Record<string, unknown>): any
  }
}

const CAPABILITY_COLUMNS = [
  'id',
  'canonical_key',
  'source_kind',
  'source_ref',
  'capability_type',
  'direction',
  'modality',
  'learner_language',
  'projection_version',
  'readiness_status',
  'publication_status',
  'lesson_id',
  'prerequisite_keys',
].join(',')

// toLearnerRow's full column list for learner_capability_state — deliberately
// excludes fsrs_state_json (an FSRS-internal jsonb blob no mapper reads; the FSRS
// review-commit path reads/writes it via the SECURITY DEFINER RPC, not this
// client-side adapter) and activation_source/activation_event_id/created_at/
// updated_at (unused by any mapper below).
const LEARNER_STATE_COLUMNS = [
  'id',
  'user_id',
  'capability_id',
  'canonical_key_snapshot',
  'activation_state',
  'stability',
  'difficulty',
  'last_reviewed_at',
  'next_due_at',
  'review_count',
  'lapse_count',
  'consecutive_failure_count',
  'state_version',
].join(',')

interface LearningCapabilityDbRow {
  id: string
  canonical_key: string
  source_kind: CapabilitySourceKind
  source_ref: string
  capability_type: CapabilityType
  direction: CapabilityDirection
  modality: CapabilityModality
  learner_language: LearnerLanguage
  projection_version: string
  readiness_status: CapabilityReadinessStatus
  publication_status: CapabilityPublicationStatus
  lesson_id: string | null
  prerequisite_keys: string[] | null
}

interface LearnerCapabilityStateDbRow {
  id: string
  user_id: string
  capability_id: string
  canonical_key_snapshot: string
  activation_state: LearnerCapabilityStateRow['activationState']
  stability: number | null
  difficulty: number | null
  last_reviewed_at: string | null
  next_due_at: string | null
  review_count: number
  lapse_count: number
  consecutive_failure_count: number
  state_version: number
}

// The subset of a learning_capabilities row toLearnerRow actually consults.
// LearningCapabilityDbRow satisfies this structurally, so toLearnerRow accepts
// the full projection (loadCapabilitySessionData/loadForceCapabilitySnapshot)
// without needing a dedicated narrower select.
interface CapabilityReadinessRow {
  readiness_status: CapabilityReadinessStatus
  publication_status: CapabilityPublicationStatus
}

interface LessonOrderDbRow {
  id: string
  order_index: number
}

// The get_session_build_data RPC's jsonb payload shape (docs/plans/2026-07-02-
// session-data-narrowing-rpc.md). One scalar jsonb object carrying the six
// pieces the six-query fan-out used to assemble separately — field-for-field
// the same snake_case row shapes the mappers below already consume, so
// toProjectedCapability/toPlannerCapability/toLearnerRow/toPlannerState are
// unchanged. `capabilities` is server-narrowed to the sufficiency predicate
// (clauses A-E in the RPC); `learner_states` is the learner's FULL state set
// (unbounded by activation — due caps can come from any lesson).
interface SessionBuildDataPayload {
  capabilities: LearningCapabilityDbRow[]
  learner_states: LearnerCapabilityStateDbRow[]
  activated_lesson_ids: string[]
  lessons: LessonOrderDbRow[]
  reviewed_today_capability_ids: string[]
  activated_member_refs: string[]
}

// Derives "current lesson" + "next lesson needs exposure" from the learner's
// activations and the lessons table. Both feed the queue-drying detector.
// Returns null/false defensively when the learner has no activations or has
// reached the final lesson — the detector suppresses drying in those cases.
function deriveLessonProgression(input: {
  activatedLessonIds: ReadonlySet<string>
  lessons: LessonOrderDbRow[]
}): { currentLessonId: string | null; nextLessonNeedsExposure: boolean } {
  if (input.activatedLessonIds.size === 0) {
    return { currentLessonId: null, nextLessonNeedsExposure: false }
  }
  const activatedLessons = input.lessons.filter(lesson => input.activatedLessonIds.has(lesson.id))
  if (activatedLessons.length === 0) {
    return { currentLessonId: null, nextLessonNeedsExposure: false }
  }
  const current = activatedLessons.reduce((acc, candidate) => (
    candidate.order_index > acc.order_index ? candidate : acc
  ))
  const next = input.lessons.find(lesson => lesson.order_index === current.order_index + 1)
  return {
    currentLessonId: current.id,
    nextLessonNeedsExposure: next != null && !input.activatedLessonIds.has(next.id),
  }
}

function toProjectedCapability(row: LearningCapabilityDbRow): ProjectedCapability {
  // After Decision F (revised 2026-05-22), the typed column prerequisite_keys
  // is the source of truth; skill_type is derived from capability_type via the
  // closed mapping in capabilityTypes.ts.
  return {
    canonicalKey: row.canonical_key,
    sourceKind: row.source_kind,
    sourceRef: row.source_ref,
    capabilityType: row.capability_type,
    skillType: deriveSkillTypeFromCapabilityType(row.capability_type),
    direction: row.direction,
    modality: row.modality,
    learnerLanguage: row.learner_language,
    // Slice 4b: required_artifacts column dropped; runtime readiness no longer
    // reads it. The in-memory field is retained on ProjectedCapability for the
    // (Slice-5-owned) legacy staging regeneration only, so the DB→projection
    // read defaults it to [].
    requiredArtifacts: [],
    prerequisiteKeys: row.prerequisite_keys ?? [],
    lessonId: row.lesson_id,
    projectionVersion: CAPABILITY_PROJECTION_VERSION,
  }
}

function toPlannerCapability(
  row: LearningCapabilityDbRow,
  projection: ProjectedCapability,
  lessonOrderById: ReadonlyMap<string, number>,
): PlannerCapability {
  return {
    id: row.id,
    canonicalKey: projection.canonicalKey,
    sourceKind: projection.sourceKind,
    sourceRef: projection.sourceRef,
    capabilityType: projection.capabilityType,
    skillType: projection.skillType,
    readinessStatus: row.readiness_status,
    publicationStatus: row.publication_status,
    prerequisiteKeys: projection.prerequisiteKeys,
    lessonId: row.lesson_id,
    // Lesson order for the planner's prioritize stage. Null for podcast/null-lesson
    // caps (sort last). Derived from the lessons rows already loaded below — no
    // extra query. See docs/plans/2026-06-07-lesson-priority-candidate-ordering-design.md.
    lessonOrder: row.lesson_id != null ? lessonOrderById.get(row.lesson_id) ?? null : null,
  }
}

function toLearnerRow(
  row: LearnerCapabilityStateDbRow,
  capabilityById: Map<string, CapabilityReadinessRow>,
): LearnerCapabilityStateRow {
  const capability = capabilityById.get(row.capability_id)
  return {
    id: row.id,
    userId: row.user_id,
    capabilityId: row.capability_id,
    canonicalKeySnapshot: row.canonical_key_snapshot,
    activationState: row.activation_state,
    readinessStatus: capability?.readiness_status ?? 'unknown',
    publicationStatus: capability?.publication_status ?? 'draft',
    stability: row.stability,
    difficulty: row.difficulty,
    lastReviewedAt: row.last_reviewed_at,
    nextDueAt: row.next_due_at,
    reviewCount: row.review_count,
    lapseCount: row.lapse_count,
    consecutiveFailureCount: row.consecutive_failure_count,
    stateVersion: row.state_version,
  }
}

function toPlannerState(row: LearnerCapabilityStateRow): PlannerLearnerCapabilityState {
  return {
    canonicalKey: row.canonicalKeySnapshot,
    activationState: row.activationState,
    reviewCount: row.reviewCount,
    successfulReviewCount: Math.max(0, row.reviewCount - row.lapseCount - row.consecutiveFailureCount),
    // FSRS stability in days. Used by the receptive-before-productive staging
    // gate in pedagogy.ts (added 2026-05-18). Null when no FSRS state is yet
    // recorded for the capability (dormant rows before any review).
    stability: row.stability,
  }
}

export class CapabilityNotFoundError extends Error {
  constructor(canonicalKey: string) {
    super(`No learning_capabilities row with canonical_key=${canonicalKey}.`)
    this.name = 'CapabilityNotFoundError'
  }
}

export interface ForceCapabilitySnapshot {
  capabilityRow: LearningCapabilityDbRow
  capability: ProjectedCapability
  readiness: CapabilityReadiness
  learnerState: LearnerCapabilityStateRow
}

export function createSessionBuilderAdapter(client: SupabaseSchemaClient = supabase): CapabilitySessionDataAdapter & {
  loadForceCapabilitySnapshot(canonicalKey: string, userId: string): Promise<ForceCapabilitySnapshot>
  loadInformalItemSourceRefs(): Promise<Set<string>>
} {
  const db = () => client.schema('indonesian')

  return {
    async loadCapabilitySessionData(request: CapabilitySessionDataRequest): Promise<CapabilitySessionDataSnapshot> {
      // Local-midnight boundary for sibling burying. request.now is constructed
      // browser-side (Session.tsx), so its local date is the learner's wall-clock
      // day; toISOString() gives the UTC instant the RPC compares against
      // capability_review_events.created_at (timestamptz), via p_day_start. See
      // docs/plans/2026-06-09-sibling-burying-design.md and
      // docs/plans/2026-07-02-session-data-narrowing-rpc.md (open question 1).
      const dayStart = new Date(request.now)
      dayStart.setHours(0, 0, 0, 0)

      // Single narrowed-snapshot RPC — replaces the six-query client-side fan-out
      // (learning_capabilities catalog, learner_capability_state, activated
      // lessons, lessons, today's review events, activated collection/harvest
      // member refs). The RPC narrows the catalog server-side to the learner's
      // activated surface + their state (sufficiency predicate clauses A-E); see
      // docs/plans/2026-07-02-session-data-narrowing-rpc.md for the proof. Scalar
      // jsonb return is immune to PGRST_DB_MAX_ROWS row truncation (HC39/HC40).
      const { data, error } = await db().rpc('get_session_build_data', {
        p_user_id: request.userId,
        p_mode: request.mode,
        p_selected_source_refs: request.selectedSourceRefs ?? [],
        p_day_start: dayStart.toISOString(),
      })
      if (error) throw error

      const payload = (data ?? {}) as Partial<SessionBuildDataPayload>
      const capabilityRows = (payload.capabilities ?? []) as LearningCapabilityDbRow[]
      const capabilityById = new Map(capabilityRows.map(row => [row.id, row]))

      // Sibling burying seed: the distinct source_refs reviewed earlier today.
      // capability_id → source_ref resolved in memory from capabilityById — no
      // JOIN, no embed, no new index. A reviewed cap that is no longer
      // ready/published won't be in the map; skip it (it can't be a candidate).
      const reviewedTodayRefs = new Set<string>()
      for (const capabilityId of (payload.reviewed_today_capability_ids ?? []) as string[]) {
        const ref = capabilityById.get(capabilityId)?.source_ref
        if (ref) reviewedTodayRefs.add(ref)
      }

      // lessonId → order_index, reused from the lessons rows the RPC returns
      // whole (small table) for deriveLessonProgression. Feeds the planner's
      // lesson-priority ordering.
      const lessonRows = (payload.lessons ?? []) as LessonOrderDbRow[]
      const lessonOrderById = new Map(lessonRows.map(lesson => [lesson.id, lesson.order_index]))

      const capabilitiesByKey = new Map<string, ProjectedCapability>()
      const readinessByKey = new Map<string, CapabilityReadiness>()
      const readyCapabilities: PlannerCapability[] = []

      for (const row of capabilityRows) {
        const projection = toProjectedCapability(row)
        capabilitiesByKey.set(row.canonical_key, projection)
        const readiness = row.readiness_status === 'ready'
          ? validateCapability({ capability: projection })
          : { status: row.readiness_status, reason: `Capability readiness is ${row.readiness_status}` } as CapabilityReadiness
        readinessByKey.set(row.canonical_key, readiness)
        readyCapabilities.push(toPlannerCapability(row, projection, lessonOrderById))
      }

      const schedulerRows = ((payload.learner_states ?? []) as LearnerCapabilityStateDbRow[])
        .filter(row => capabilityById.has(row.capability_id))
        .map(row => toLearnerRow(row, capabilityById))
      const dueCount = getDueCapabilitiesFromRows({
        now: request.now,
        limit: Number.MAX_SAFE_INTEGER,
        rows: schedulerRows,
      }).length
      const recentFailures = schedulerRows
        .filter(row => row.consecutiveFailureCount >= 2 && row.lastReviewedAt != null)
        .map(row => ({
          canonicalKey: row.canonicalKeySnapshot,
          failedAt: row.lastReviewedAt!,
          consecutiveFailures: row.consecutiveFailureCount,
        }))
      const activatedLessons = new Set<string>((payload.activated_lesson_ids ?? []) as string[])
      // Collections gate-OR (spec §5): the source_refs of words in any collection
      // the learner has activated, unioned with reader-harvested words. Feeds
      // plannerInput.activatedCollectionRefs so gap-word caps (homed on the
      // un-activated "Common Words" lesson) surface.
      const activatedCollectionRefs = new Set<string>((payload.activated_member_refs ?? []) as string[])
      const { currentLessonId, nextLessonNeedsExposure } = deriveLessonProgression({
        activatedLessonIds: activatedLessons,
        lessons: lessonRows,
      })

      return {
        schedulerRows,
        plannerInput: {
          userId: request.userId,
          preferredSessionSize: request.preferredSessionSize,
          dueCount,
          readyCapabilities,
          learnerCapabilityStates: schedulerRows.map(toPlannerState),
          activatedLessons,
          activatedCollectionRefs,
          recentFailures,
          selectedLessonId: request.selectedLessonId,
          selectedSourceRefs: request.selectedSourceRefs,
        },
        capabilitiesByKey,
        readinessByKey,
        currentLessonId,
        nextLessonNeedsExposure,
        reviewedTodayRefs,
      }
    },

    // Loads everything needed to build a one-card session for a named capability.
    // Bypasses the planner. Used by the ?force_capability dev URL (see Session.tsx)
    // and by scripts/force-capability-answer.ts (per-PR post-deploy gate, plan §3.8).
    // Throws CapabilityNotFoundError if the canonical_key does not resolve.
    // Seeds a dormant learner_capability_state row on first hit so the card renders
    // even when the learner has never encountered the capability before.
    async loadForceCapabilitySnapshot(canonicalKey: string, userId: string): Promise<ForceCapabilitySnapshot> {
      const { data: rows, error: capError } = await db()
        .from('learning_capabilities')
        .select(CAPABILITY_COLUMNS)
        .eq('canonical_key', canonicalKey)
        .limit(1)
      if (capError) throw capError
      const capabilityRow = ((rows ?? []) as LearningCapabilityDbRow[])[0]
      if (!capabilityRow) throw new CapabilityNotFoundError(canonicalKey)

      const capability = toProjectedCapability(capabilityRow)

      const readiness = capabilityRow.readiness_status === 'ready'
        ? validateCapability({ capability })
        : { status: capabilityRow.readiness_status, reason: `Capability readiness is ${capabilityRow.readiness_status}` } as CapabilityReadiness

      // Read any existing learner_capability_state row for this cap.
      const { data: existing, error: stateLoadError } = await db()
        .from('learner_capability_state')
        .select(LEARNER_STATE_COLUMNS)
        .eq('user_id', userId)
        .eq('capability_id', capabilityRow.id)
        .limit(1)
      if (stateLoadError) throw stateLoadError
      // When none exists, synthesize a dormant state IN MEMORY rather than
      // inserting it. learner_capability_state is RLS SELECT-only for the owner —
      // every real write goes through the commit_capability_answer_report
      // SECURITY DEFINER RPC — so a client-side insert here 403s ("Sessiefout").
      // The bypass only needs a snapshot to render against; the answer-commit RPC
      // creates the real row on the first answer, the same first-write path a
      // brand-new capability takes in a normal session (see the stateRow-null
      // default-snapshot branch in builder.ts).
      const stateRow: LearnerCapabilityStateDbRow =
        ((existing ?? []) as LearnerCapabilityStateDbRow[])[0] ?? {
          id: crypto.randomUUID(),
          user_id: userId,
          capability_id: capabilityRow.id,
          canonical_key_snapshot: capabilityRow.canonical_key,
          activation_state: 'dormant',
          stability: null,
          difficulty: null,
          last_reviewed_at: null,
          next_due_at: null,
          review_count: 0,
          lapse_count: 0,
          consecutive_failure_count: 0,
          state_version: 0,
        }

      const learnerState = toLearnerRow(stateRow, new Map([[capabilityRow.id, capabilityRow]]))

      return {
        capabilityRow,
        capability,
        readiness,
        learnerState,
      }
    },

    // Spreektaal toggle (spec docs/plans/2026-07-09-spreektaal-lesson-woven-core.md
    // §5): the informal-item source_ref set spreektaalFilter.ts needs to strip
    // register='informal' capabilities from a snapshot. A plain read, independent
    // of the parity-locked get_session_build_data RPC — register isn't part of
    // the capability projection the way listening's modality field is, so this
    // needs its own small query. Throws on a real query error like every other
    // method here; buildSession (builder.ts) is the layer that treats a failure
    // as "no informal items yet" while the register/register_counterpart columns
    // (parallel schema PR) don't exist.
    //
    // Memoized module-wide (see informalItemSourceRefsMemo below, 2026-07-11
    // prod-ready audit "REPEATED CONTENT FETCH"): every session build was
    // re-scanning the FULL learning_items register='informal' registry, but this
    // is content data — DB-authoritative-after-seeding (ADR 0011), it only
    // changes at publish time. Caching it for the lifetime of the page load
    // (staleness-until-reload) is correct under that regime; a learner who wants
    // a freshly-published informal item reflected just needs a page reload, the
    // same bar every other content read in this app already accepts.
    async loadInformalItemSourceRefs(): Promise<Set<string>> {
      if (!informalItemSourceRefsMemo) {
        informalItemSourceRefsMemo = (async () => {
          const { data, error } = await db()
            .from('learning_items')
            .select('normalized_text')
            .eq('register', 'informal')
          if (error) throw error
          return new Set(
            ((data ?? []) as Array<{ normalized_text: string }>)
              .map(row => `learning_items/${row.normalized_text}`),
          )
        })().catch((err) => {
          // Don't cache a rejected promise — a transient network blip would
          // otherwise permanently poison the memo for the rest of the page
          // session. The caller (buildSession, builder.ts) already treats a
          // thrown error as "no informal items this build" and logs it.
          informalItemSourceRefsMemo = null
          throw err
        })
      }
      return informalItemSourceRefsMemo
    },
  }
}

// Module-level memo for loadInformalItemSourceRefs above. Caching the PROMISE
// (not just the resolved Set) dedupes in-flight requests — two session builds
// racing on first page load share one query rather than firing two. Shared
// across every createSessionBuilderAdapter() instance (there is exactly one
// production instance, `sessionBuilderAdapter` below); test doubles that build
// their own CapabilitySessionDataAdapter object literal never touch this.
let informalItemSourceRefsMemo: Promise<Set<string>> | null = null

// Test-only: clears the module-level memo so a test can assert a fresh fetch
// happens, or so cache state doesn't leak across test files/order. Underscore
// prefix marks it test-only; no production caller should ever need it.
export function _resetInformalItemSourceRefsMemo(): void {
  informalItemSourceRefsMemo = null
}

export const sessionBuilderAdapter = createSessionBuilderAdapter()
