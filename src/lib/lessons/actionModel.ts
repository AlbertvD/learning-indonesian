export interface LessonPracticeActionState {
  // After retirement #6, derived as:
  //   lessonActivated ? max(0, ready_capability_count - active_practiced_count) : 0
  practiceReadyCount: number
  hasActivePracticedItems: boolean
  hasUnpracticedEligibleItems: boolean
}

export interface LessonPracticeAction {
  kind: 'practice' | 'review'
  label: string
  href: string
  priority: 'primary' | 'secondary'
}

export function buildLessonPracticeActions(input: {
  lessonId: string
  state: LessonPracticeActionState
}): LessonPracticeAction[] {
  const { lessonId, state } = input
  const actions: LessonPracticeAction[] = []

  if (state.hasUnpracticedEligibleItems && state.practiceReadyCount > 0) {
    actions.push({
      kind: 'practice',
      label: `Practice this lesson · ${state.practiceReadyCount} ready`,
      href: `/session?lesson=${encodeURIComponent(lessonId)}&mode=lesson_practice`,
      priority: 'primary',
    })
  }

  if (state.hasActivePracticedItems) {
    actions.push({
      kind: 'review',
      label: 'Review this lesson',
      href: `/session?lesson=${encodeURIComponent(lessonId)}&mode=lesson_review`,
      priority: actions.length > 0 ? 'secondary' : 'primary',
    })
  }

  return actions
}
