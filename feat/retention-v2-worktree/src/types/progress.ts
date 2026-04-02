// src/types/progress.ts
export interface LessonProgress {
  id: string
  user_id: string
  lesson_id: string
  completed_at: string | null
  sections_completed: string[]
  created_at: string
}
