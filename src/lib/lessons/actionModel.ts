import { translations } from '@/lib/i18n'

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
  // Optional so existing callers/tests keep the Dutch defaults byte-for-byte;
  // the one real caller (PracticeActions.tsx) always passes the learner's
  // profile language. See docs/audits/2026-07-02-a11y-i18n-audit.md.
  userLanguage?: 'nl' | 'en'
}): LessonPracticeAction[] {
  const { lessonId, state, userLanguage = 'nl' } = input
  const T = translations[userLanguage]
  const actions: LessonPracticeAction[] = []

  if (state.hasUnpracticedEligibleItems && state.practiceReadyCount > 0) {
    actions.push({
      kind: 'practice',
      label: T.lessons.practiceThisLesson(state.practiceReadyCount),
      href: `/session?lesson=${encodeURIComponent(lessonId)}&mode=lesson_practice`,
      priority: 'primary',
    })
  }

  if (state.hasActivePracticedItems) {
    actions.push({
      kind: 'review',
      label: T.lessons.reviewThisLesson,
      href: `/session?lesson=${encodeURIComponent(lessonId)}&mode=lesson_review`,
      priority: actions.length > 0 ? 'secondary' : 'primary',
    })
  }

  return actions
}
