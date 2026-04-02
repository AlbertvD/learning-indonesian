// src/types/auth.ts
export interface UserProfile {
  id: string
  email: string
  fullName: string | null
  language: 'nl' | 'en'
  preferredSessionSize: number
  isAdmin: boolean
}
