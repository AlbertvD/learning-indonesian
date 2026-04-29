import { supabase } from '@/lib/supabase'
import type {
  CapabilityDirection,
  CapabilityModality,
  CapabilitySourceKind,
  CapabilityType,
  LearnerLanguage,
} from '@/lib/capabilities/capabilityTypes'

export type CapabilityReadinessStatus = 'ready' | 'blocked' | 'exposure_only' | 'deprecated' | 'unknown'
export type CapabilityPublicationStatus = 'draft' | 'published' | 'retired'

export interface LearningCapabilityRow {
  id?: string
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
  source_fingerprint?: string | null
  artifact_fingerprint?: string | null
  metadata_json: Record<string, unknown>
  created_at?: string
  updated_at?: string
}

interface SupabaseSchemaClient {
  schema(schema: 'indonesian'): {
    from(table: string): any
  }
}

export function createCapabilityService(client: SupabaseSchemaClient = supabase) {
  const db = () => client.schema('indonesian')

  return {
    async listCapabilities(): Promise<LearningCapabilityRow[]> {
      const { data, error } = await db()
        .from('learning_capabilities')
        .select('*')
      if (error) throw error
      return (data ?? []) as LearningCapabilityRow[]
    },

    async getCapabilityByCanonicalKey(canonicalKey: string): Promise<LearningCapabilityRow | null> {
      const { data, error } = await db()
        .from('learning_capabilities')
        .select('*')
        .eq('canonical_key', canonicalKey)
        .maybeSingle()
      if (error) throw error
      return data as LearningCapabilityRow | null
    },

    async upsertCapability(row: Omit<LearningCapabilityRow, 'id' | 'created_at' | 'updated_at'>): Promise<LearningCapabilityRow> {
      const { data, error } = await db()
        .from('learning_capabilities')
        .upsert({
          ...row,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'canonical_key' })
        .select()
        .single()
      if (error) throw error
      return data as LearningCapabilityRow
    },
  }
}

export const capabilityService = createCapabilityService()
