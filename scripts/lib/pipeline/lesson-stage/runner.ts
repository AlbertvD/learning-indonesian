import type { LessonStageInput, LessonStageOutput } from './model'

export async function runLessonStage(input: LessonStageInput): Promise<LessonStageOutput> {
  throw new Error(
    `runLessonStage not implemented yet — see commit 8 (lesson ${input.lessonNumber})`,
  )
}
