import { supabase } from '@/lib/supabase'
import { listActivatedLessons } from '@/lib/lessons'
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
  state_after_json?: Record<string, unknown> | null
  state_version: number
}

interface LessonOrderDbRow {
  id: string
  order_index: number
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
  capabilityById: Map<string, LearningCapabilityDbRow>,
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
} {
  const db = () => client.schema('indonesian')

  return {
    async listLearnerCapabilityStates(request) {
      const { data: capabilities, error: capabilitiesError } = await db()
        .from('learning_capabilities')
        .select('*')
        .is('retired_at', null)
      if (capabilitiesError) throw capabilitiesError
      const capabilityById = new Map<string, LearningCapabilityDbRow>(
        ((capabilities ?? []) as LearningCapabilityDbRow[]).map(row => [row.id, row]),
      )

      const { data, error } = await db()
        .from('learner_capability_state')
        .select('*')
        .eq('user_id', request.userId)
      if (error) throw error

      return (data ?? [])
        .filter((row: LearnerCapabilityStateDbRow) => capabilityById.has(row.capability_id))
        .map((row: LearnerCapabilityStateDbRow) => toLearnerRow(row, capabilityById))
    },

    async loadCapabilitySessionData(request: CapabilitySessionDataRequest): Promise<CapabilitySessionDataSnapshot> {
      const [
        capabilitiesResult,
        statesResult,
        activatedLessons,
        lessonsResult,
      ] = await Promise.all([
        db()
          .from('learning_capabilities')
          .select(CAPABILITY_COLUMNS)
          .eq('readiness_status', 'ready')
          .eq('publication_status', 'published')
          .is('retired_at', null),
        db().from('learner_capability_state').select('*').eq('user_id', request.userId),
        listActivatedLessons(request.userId, client),
        db().from('lessons').select('id, order_index'),
      ])

      if (capabilitiesResult.error) throw capabilitiesResult.error
      if (statesResult.error) throw statesResult.error
      if (lessonsResult.error) throw lessonsResult.error

      const capabilityRows = (capabilitiesResult.data ?? []) as LearningCapabilityDbRow[]
      const capabilityById = new Map(capabilityRows.map(row => [row.id, row]))

      // lessonId → order_index, reused from the lessons rows already loaded above
      // for deriveLessonProgression. Feeds the planner's lesson-priority ordering.
      const lessonRows = (lessonsResult.data ?? []) as LessonOrderDbRow[]
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

      const schedulerRows = ((statesResult.data ?? []) as LearnerCapabilityStateDbRow[])
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
          recentFailures,
          selectedLessonId: request.selectedLessonId,
          selectedSourceRefs: request.selectedSourceRefs,
        },
        capabilitiesByKey,
        readinessByKey,
        currentLessonId,
        nextLessonNeedsExposure,
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
        .select('*')
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
  }
}

export const sessionBuilderAdapter = createSessionBuilderAdapter()
