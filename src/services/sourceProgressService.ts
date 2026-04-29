import { supabase } from '@/lib/supabase'

export type SourceProgressEventType =
  | 'opened'
  | 'section_exposed'
  | 'intro_completed'
  | 'heard_once'
  | 'pattern_noticing_seen'
  | 'guided_practice_completed'
  | 'lesson_completed'

export type SourceProgressStateValue = 'not_started' | SourceProgressEventType

export interface SourceProgressEventInput {
  userId: string
  sourceRef: string
  sourceSectionRef?: string
  eventType: SourceProgressEventType
  occurredAt: string
  metadataJson?: Record<string, unknown>
  idempotencyKey?: string
}

export interface SourceProgressState {
  userId: string
  sourceRef: string
  sourceSectionRef: string
  currentState: SourceProgressStateValue
  completedEventTypes: SourceProgressEventType[]
  lastEventAt: string
  metadataJson?: Record<string, unknown>
}

interface SourceProgressStateRow {
  user_id: string
  source_ref: string
  source_section_ref: string
  current_state: SourceProgressStateValue
  completed_event_types: SourceProgressEventType[]
  last_event_at: string
  metadata_json?: Record<string, unknown>
}

interface SupabaseSchemaClient {
  schema(schema: 'indonesian'): {
    from(table: string): any
    rpc(fn: string, args: Record<string, unknown>): any
  }
}

const DEFAULT_SOURCE_SECTION_REF = '__lesson__'
const progressOrder: SourceProgressStateValue[] = [
  'not_started',
  'opened',
  'section_exposed',
  'intro_completed',
  'heard_once',
  'pattern_noticing_seen',
  'guided_practice_completed',
  'lesson_completed',
]

function toState(row: SourceProgressStateRow | null): SourceProgressState | null {
  if (!row) return null
  return {
    userId: row.user_id,
    sourceRef: row.source_ref,
    sourceSectionRef: row.source_section_ref,
    currentState: row.current_state,
    completedEventTypes: row.completed_event_types ?? [],
    lastEventAt: row.last_event_at,
    metadataJson: row.metadata_json,
  }
}

function progressRank(state: SourceProgressStateValue): number {
  return progressOrder.indexOf(state)
}

export function reduceSourceProgressEvent(
  existing: SourceProgressState | null,
  event: SourceProgressEventInput,
): SourceProgressState {
  const sourceSectionRef = event.sourceSectionRef ?? DEFAULT_SOURCE_SECTION_REF
  const completed = new Set<SourceProgressEventType>(existing?.completedEventTypes ?? [])
  completed.add(event.eventType)

  const completedEventTypes = progressOrder
    .filter((state): state is SourceProgressEventType => state !== 'not_started' && completed.has(state))

  const highestCompleted = completedEventTypes.reduce<SourceProgressStateValue>((highest, current) => (
    progressRank(current) > progressRank(highest) ? current : highest
  ), existing?.currentState ?? 'not_started')
  const lastEventAt = existing && existing.lastEventAt > event.occurredAt
    ? existing.lastEventAt
    : event.occurredAt
  const metadataJson = {
    ...(existing?.metadataJson ?? {}),
    ...(event.metadataJson ?? {}),
  }

  return {
    userId: event.userId,
    sourceRef: event.sourceRef,
    sourceSectionRef,
    currentState: highestCompleted,
    completedEventTypes,
    lastEventAt,
    ...(Object.keys(metadataJson).length > 0 ? { metadataJson } : {}),
  }
}

export function createSourceProgressService(client: SupabaseSchemaClient = supabase) {
  const db = () => client.schema('indonesian')

  async function getState(input: {
    userId: string
    sourceRef: string
    sourceSectionRef?: string
  }): Promise<SourceProgressState | null> {
    const { data, error } = await db()
      .from('learner_source_progress_state')
      .select('*')
      .eq('user_id', input.userId)
      .eq('source_ref', input.sourceRef)
      .eq('source_section_ref', input.sourceSectionRef ?? DEFAULT_SOURCE_SECTION_REF)
      .maybeSingle()
    if (error) throw error
    return toState(data as SourceProgressStateRow | null)
  }

  return {
    getState,
    async recordEvent(event: SourceProgressEventInput): Promise<SourceProgressState> {
      const sourceSectionRef = event.sourceSectionRef ?? DEFAULT_SOURCE_SECTION_REF
      const idempotencyKey = event.idempotencyKey
        ?? `${event.userId}:${event.sourceRef}:${sourceSectionRef}:${event.eventType}:${event.occurredAt}`

      const { data, error } = await db()
        .rpc('record_source_progress_event', {
          p_event: {
            userId: event.userId,
            sourceRef: event.sourceRef,
            sourceSectionRef,
            eventType: event.eventType,
            occurredAt: event.occurredAt,
            metadataJson: event.metadataJson ?? {},
            idempotencyKey,
          },
        })
      if (error) throw error
      const state = toState(data as SourceProgressStateRow)
      if (!state) {
        throw new Error('record_source_progress_event returned no state')
      }
      return state
    },
  }
}

export const sourceProgressService = createSourceProgressService()
