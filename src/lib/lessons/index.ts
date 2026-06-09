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

// Overview — two single-sourced facts per tile (activation + % mastered).
// The status enum, order-gate, and recommender retired with overviewStatus.ts
// (docs/plans/2026-06-09-lesson-status-two-sources-design.md).
export {
  buildLessonOverviewModel,
  lessonMasteredPercent,
  lessonPracticedPercent,
  PRACTICED_MIN_REVIEWS,
  isPublishedOverviewLesson,
} from './overview'
export type {
  LessonOverviewModel,
  LessonOverviewModelLesson,
  LessonOverviewCapabilityCounts,
  LessonOverviewRow,
} from './overview'

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

// Adapter (folded lesson-domain methods from services/lessonService.ts)
export {
  getLessons,
  getLesson,
  getLessonsBasic,
  getLessonsWithVoice,
  getLessonSourceRefsByLessonId,
  getLessonCapabilityPracticeSummaryByLessonId,
  getLessonsOverview,
  lessonSourceRefForOverview,
  lessonSourceRefsByLesson,
  extractLessonGrammarTopics,
  formatGrammarTopicTag,
} from './adapter'
export type {
  Lesson,
  LessonSection,
  LessonCapabilityPracticeSummary,
  LessonOverviewSourceBlock,
  LessonOverviewRpcRow,
  LessonGrammarTopic,
} from './adapter'
