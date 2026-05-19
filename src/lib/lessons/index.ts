// src/lib/lessons/index.ts
//
// Public barrel for the `lib/lessons/` deep module. Per
// docs/target-architecture.md §Module conventions, index.ts is the inbound
// port: it declares what callers can use. Internal files are not re-exported.
//
// Populated incrementally across the fold PR:
//   - Commit 1: created empty
//   - Commit 2: re-exports from overview / overviewStatus / experience / actionModel / activation (this commit)
//   - Commit 6: re-exports from adapter (folded lesson-domain methods from services/lessonService.ts)

// Overview
export {
  buildLessonOverviewModel,
  buildLessonOverviewSignals,
  isPublishedOverviewLesson,
} from './overview'
export type {
  LessonOverviewModel,
  LessonOverviewModelLesson,
  LessonOverviewExposure,
  LessonOverviewExposureKind,
  LessonOverviewCapabilityCounts,
  LessonOverviewRow,
} from './overview'

// Overview status helpers (still public until the status-tree retirement PR)
export {
  decideLessonOverviewStatus,
  formatGrammarTopicTag,
  isLessonSatisfiedForRecommendation,
  overviewActionLabel,
  recommendLesson,
} from './overviewStatus'
export type {
  LessonOverviewStatus,
  LessonOverviewSignal,
  LessonGrammarTopic,
} from './overviewStatus'

// Experience
export { buildLessonExperience } from './experience'
export type {
  LessonExperience,
  LessonExperienceBlock,
  LessonExperienceBlockKind,
  Lesson,
  LessonPageBlock,
} from './experience'

// Practice actions
export { buildLessonPracticeActions } from './actionModel'
export type {
  LessonPracticeAction,
  LessonPracticeActionState,
} from './actionModel'

// Activation
export {
  isLessonActivated,
  listActivatedLessons,
  setLessonActivated,
} from './activation'
