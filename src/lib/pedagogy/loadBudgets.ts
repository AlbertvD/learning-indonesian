export type CurrentSessionMode = 'standard' | 'backlog_clear' | 'quick'
export type FutureSessionMode = 'listening_focus' | 'pattern_workshop' | 'podcast'
export type PlannerSessionMode = CurrentSessionMode | FutureSessionMode

export interface LoadBudgetInput {
  mode: PlannerSessionMode
  preferredSessionSize: number
  dueCount: number
  allowQuickIntroduction?: boolean
}

export interface LoadBudgetDecision {
  allowNewCapabilities: boolean
  maxNewCapabilities: number
  maxNewPatterns: number
  reason: string
}

export function decideLoadBudget(input: LoadBudgetInput): LoadBudgetDecision {
  if (input.mode === 'backlog_clear') {
    return {
      allowNewCapabilities: false,
      maxNewCapabilities: 0,
      maxNewPatterns: 0,
      reason: 'backlog_clear_suppresses_new_content',
    }
  }

  if (input.mode === 'quick') {
    return {
      allowNewCapabilities: input.allowQuickIntroduction === true,
      maxNewCapabilities: input.allowQuickIntroduction === true ? 1 : 0,
      maxNewPatterns: 0,
      reason: input.allowQuickIntroduction === true ? 'quick_allows_one_light_intro' : 'quick_suppresses_new_content',
    }
  }

  if (input.mode === 'pattern_workshop') {
    return {
      allowNewCapabilities: true,
      maxNewCapabilities: 2,
      maxNewPatterns: 2,
      reason: 'pattern_workshop_budget',
    }
  }

  if (input.mode === 'podcast') {
    return {
      allowNewCapabilities: true,
      maxNewCapabilities: 3,
      maxNewPatterns: 0,
      reason: 'podcast_phrase_budget',
    }
  }

  const openSlots = Math.max(0, input.preferredSessionSize - input.dueCount)
  return {
    allowNewCapabilities: openSlots > 0,
    maxNewCapabilities: Math.min(openSlots, Math.max(1, Math.floor(input.preferredSessionSize * 0.25))),
    maxNewPatterns: 1,
    reason: openSlots > 0 ? 'standard_daily_budget' : 'review_backlog_exhausts_budget',
  }
}
