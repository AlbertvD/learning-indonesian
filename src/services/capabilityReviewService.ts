import { supabase } from '@/lib/supabase'
import type {
  CapabilityReviewCommitPlan,
  CapabilityReviewCommitResult,
} from '@/lib/reviews/capabilityReviewProcessor'

interface SupabaseSchemaClient {
  schema(schema: 'indonesian'): {
    rpc(fn: string, args: Record<string, unknown>): any
  }
}

export function createCapabilityReviewService(client: SupabaseSchemaClient = supabase) {
  return {
    async commitCapabilityAnswerReport(plan: CapabilityReviewCommitPlan): Promise<CapabilityReviewCommitResult> {
      const { data, error } = await client
        .schema('indonesian')
        .rpc('commit_capability_answer_report', { p_command: plan })
      if (error) throw error
      return data as CapabilityReviewCommitResult
    },
  }
}

export const capabilityReviewService = createCapabilityReviewService()
