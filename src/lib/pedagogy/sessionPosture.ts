export type SessionPosture = 'balanced' | 'light_recovery' | 'review_first' | 'comeback'
export type BacklogPressure = 'light' | 'medium' | 'heavy' | 'huge'

export type SessionPostureMode =
  | 'standard'
  | 'quick'
  | 'backlog_clear'
  | 'listening_focus'
  | 'pattern_workshop'
  | 'podcast'

export interface SessionPostureInput {
  now: Date
  mode: SessionPostureMode
  lastMeaningfulPracticeAt?: string | null
  lastMeaningfulExposureAt?: string | null
  dueCount: number
  preferredSessionSize: number
  eligibleNewMaterialCount: number
}

export function isMeaningfulPractice(input: {
  completedExercises: number
  durationMinutes: number
}): boolean {
  return input.completedExercises >= 8 && input.durationMinutes >= 5
}

export function decideBacklogPressure(input: {
  dueCount: number
  preferredSessionSize: number
}): BacklogPressure {
  const preferredSize = Math.max(1, input.preferredSessionSize)
  if (input.dueCount <= preferredSize * 0.5) return 'light'
  if (input.dueCount <= preferredSize) return 'medium'
  if (input.dueCount <= preferredSize * 3) return 'heavy'
  return 'huge'
}

function ageInDays(now: Date, iso?: string | null): number | null {
  if (!iso) return null
  const timestamp = new Date(iso).getTime()
  if (Number.isNaN(timestamp)) return null
  return Math.max(0, (now.getTime() - timestamp) / (24 * 60 * 60 * 1000))
}

function recencyPosture(ageDays: number | null): SessionPosture {
  if (ageDays == null) return 'comeback'
  if (ageDays < 2) return 'balanced'
  if (ageDays < 4) return 'light_recovery'
  if (ageDays < 8) return 'review_first'
  return 'comeback'
}

export function decideSessionPosture(input: SessionPostureInput): SessionPosture {
  const practiceAgeDays = ageInDays(input.now, input.lastMeaningfulPracticeAt)
  const posture = recencyPosture(practiceAgeDays)
  const backlogPressure = decideBacklogPressure({
    dueCount: input.dueCount,
    preferredSessionSize: input.preferredSessionSize,
  })

  if (posture !== 'comeback' && backlogPressure === 'huge') {
    return 'review_first'
  }

  return posture
}
