// src/types/progress.ts
export interface UserProgress {
  id: string
  user_id: string
  current_level: string
  current_module_id: string | null
  grammar_mastery: number
  last_active_date: string | null
  created_at: string
  updated_at: string
}

export interface LessonProgress {
  id: string
  user_id: string
  lesson_id: string
  completed_at: string | null
  sections_completed: string[]
  created_at: string
}
