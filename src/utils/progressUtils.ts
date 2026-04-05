import type { LearnerSkillState } from '@/types/learning'

export function computeReviewForecast(
  skillStates: LearnerSkillState[],
  baseDate: Date = new Date()
): { date: Date; count: number }[] {
  return Array.from({ length: 7 }, (_, i) => {
    const dayStart = new Date(baseDate)
    dayStart.setDate(dayStart.getDate() + i)
    dayStart.setHours(0, 0, 0, 0)

    const dayEnd = new Date(dayStart)
    dayEnd.setHours(23, 59, 59, 999)

    const count = skillStates.filter((s) => {
      if (s.next_due_at === null) return false
      const due = new Date(s.next_due_at).getTime()
      return due >= dayStart.getTime() && due <= dayEnd.getTime()
    }).length

    return { date: dayStart, count }
  })
}
