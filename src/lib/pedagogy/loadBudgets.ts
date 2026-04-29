import { decideBacklogPressure, type SessionPosture } from '@/lib/pedagogy/sessionPosture'

export type CurrentSessionMode = 'standard' | 'backlog_clear' | 'quick' | 'lesson_practice' | 'lesson_review'
export type FutureSessionMode = 'listening_focus' | 'pattern_workshop' | 'podcast'
export type PlannerSessionMode = CurrentSessionMode | FutureSessionMode

export interface LoadBudgetInput {
  mode: PlannerSessionMode
  posture?: SessionPosture
  preferredSessionSize: number
  dueCount: number
  allowQuickIntroduction?: boolean
}

export interface LoadBudgetDecision {
  allowNewCapabilities: boolean
  maxNewCapabilities: number
  maxNewPatterns: number
  maxNewConcepts: number
  maxNewProductionTasks: number
  maxHiddenAudioTasks: number
  maxSourceSwitches: number
  targetSessionSize: number
  allowQueuePadding: boolean
  reason: string
}

function budget(input: Omit<LoadBudgetDecision, 'maxNewPatterns'> & {
  maxNewPatterns?: number
}): LoadBudgetDecision {
  return {
    ...input,
    maxNewPatterns: input.maxNewPatterns ?? input.maxNewConcepts,
  }
}

export function decideLoadBudget(input: LoadBudgetInput): LoadBudgetDecision {
  const targetSessionSize = Math.max(0, input.preferredSessionSize)
  const openSlots = Math.max(0, targetSessionSize - input.dueCount)

  if (input.mode === 'lesson_review') {
    return budget({
      allowNewCapabilities: false,
      maxNewCapabilities: 0,
      maxNewConcepts: 0,
      maxNewProductionTasks: 0,
      maxHiddenAudioTasks: 0,
      maxSourceSwitches: 0,
      targetSessionSize,
      allowQueuePadding: false,
      reason: 'lesson_review_suppresses_new_content',
    })
  }

  if (input.mode === 'lesson_practice') {
    return budget({
      allowNewCapabilities: openSlots > 0,
      maxNewCapabilities: openSlots,
      maxNewConcepts: openSlots,
      maxNewProductionTasks: openSlots,
      maxHiddenAudioTasks: targetSessionSize,
      maxSourceSwitches: 0,
      targetSessionSize,
      allowQueuePadding: false,
      reason: 'lesson_practice_selected_lesson_budget',
    })
  }

  if (input.mode === 'backlog_clear') {
    return budget({
      allowNewCapabilities: false,
      maxNewCapabilities: 0,
      maxNewConcepts: 0,
      maxNewProductionTasks: 0,
      maxHiddenAudioTasks: 0,
      maxSourceSwitches: 0,
      targetSessionSize,
      allowQueuePadding: false,
      reason: 'backlog_clear_suppresses_new_content',
    })
  }

  if (input.mode === 'quick') {
    const maxNewCapabilities = input.allowQuickIntroduction === true ? 1 : 0
    return budget({
      allowNewCapabilities: input.allowQuickIntroduction === true,
      maxNewCapabilities,
      maxNewConcepts: 0,
      maxNewProductionTasks: 0,
      maxHiddenAudioTasks: 0,
      maxSourceSwitches: 1,
      targetSessionSize,
      allowQueuePadding: false,
      reason: input.allowQuickIntroduction === true ? 'quick_allows_one_light_intro' : 'quick_suppresses_new_content',
    })
  }

  if (input.mode === 'pattern_workshop') {
    return budget({
      allowNewCapabilities: true,
      maxNewCapabilities: 2,
      maxNewConcepts: 2,
      maxNewProductionTasks: 2,
      maxHiddenAudioTasks: 0,
      maxSourceSwitches: 1,
      targetSessionSize,
      allowQueuePadding: false,
      reason: 'pattern_workshop_budget',
    })
  }

  if (input.mode === 'podcast') {
    return budget({
      allowNewCapabilities: true,
      maxNewCapabilities: 3,
      maxNewConcepts: 0,
      maxNewProductionTasks: 0,
      maxHiddenAudioTasks: 3,
      maxSourceSwitches: 1,
      targetSessionSize,
      allowQueuePadding: false,
      reason: 'podcast_phrase_budget',
    })
  }

  if (input.posture === 'comeback') {
    return budget({
      allowNewCapabilities: false,
      maxNewCapabilities: 0,
      maxNewConcepts: 0,
      maxNewProductionTasks: 0,
      maxHiddenAudioTasks: 0,
      maxSourceSwitches: 0,
      targetSessionSize: Math.min(targetSessionSize, 8),
      allowQueuePadding: false,
      reason: 'comeback_suppresses_new_content',
    })
  }

  if (input.posture === 'review_first') {
    const pressure = decideBacklogPressure(input)
    const maxNewCapabilities = pressure === 'light' && openSlots > 0 ? 1 : 0
    return budget({
      allowNewCapabilities: maxNewCapabilities > 0,
      maxNewCapabilities,
      maxNewConcepts: 0,
      maxNewProductionTasks: 0,
      maxHiddenAudioTasks: 0,
      maxSourceSwitches: pressure === 'light' ? 1 : 0,
      targetSessionSize,
      allowQueuePadding: false,
      reason: maxNewCapabilities > 0 ? 'review_first_low_load_budget' : 'review_first_suppresses_new_content',
    })
  }

  if (input.posture === 'light_recovery') {
    const pressure = decideBacklogPressure(input)
    const maxNewCapabilities = Math.min(openSlots, 2)
    return budget({
      allowNewCapabilities: maxNewCapabilities > 0,
      maxNewCapabilities,
      maxNewConcepts: pressure === 'light' ? 1 : 0,
      maxNewProductionTasks: 0,
      maxHiddenAudioTasks: 1,
      maxSourceSwitches: 1,
      targetSessionSize,
      allowQueuePadding: false,
      reason: 'light_recovery_budget',
    })
  }

  if (input.posture === 'balanced') {
    const maxNewCapabilities = Math.min(openSlots, Math.max(1, Math.floor(targetSessionSize * 0.25)))
    return budget({
      allowNewCapabilities: maxNewCapabilities > 0,
      maxNewCapabilities,
      maxNewConcepts: 1,
      maxNewProductionTasks: 1,
      maxHiddenAudioTasks: targetSessionSize,
      maxSourceSwitches: 1,
      targetSessionSize,
      allowQueuePadding: false,
      reason: maxNewCapabilities > 0 ? 'balanced_daily_budget' : 'review_backlog_exhausts_budget',
    })
  }

  const maxNewCapabilities = Math.min(openSlots, Math.max(1, Math.floor(targetSessionSize * 0.25)))
  return budget({
    allowNewCapabilities: openSlots > 0,
    maxNewCapabilities,
    maxNewConcepts: 1,
    maxNewProductionTasks: 1,
    maxHiddenAudioTasks: targetSessionSize,
    maxSourceSwitches: 1,
    targetSessionSize,
    allowQueuePadding: false,
    reason: openSlots > 0 ? 'standard_daily_budget' : 'review_backlog_exhausts_budget',
  })
}
