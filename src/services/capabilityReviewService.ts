import { supabase } from '@/lib/supabase'
import type {
  CapabilityAnswerReportCommand,
  CapabilityReviewCommitResult,
} from '@/lib/reviews/capabilityReviewProcessor'

interface SupabaseSchemaClient {
  functions: {
    invoke(fn: string, args: { body: Record<string, unknown> }): Promise<{
      data: unknown
      error: unknown
    }>
  }
}

export function createCapabilityReviewService(client: SupabaseSchemaClient = supabase) {
  return {
    async commitCapabilityAnswerReport(command: CapabilityAnswerReportCommand): Promise<CapabilityReviewCommitResult> {
      const { data, error } = await client.functions.invoke('commit-capability-answer-report', {
        body: { plan: command },
      })
      if (error) throw error
      return data as CapabilityReviewCommitResult
    },
  }
}

export const capabilityReviewService = createCapabilityReviewService()
