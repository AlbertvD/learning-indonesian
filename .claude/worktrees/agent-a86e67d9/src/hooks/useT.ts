// src/hooks/useT.ts
import { useAuthStore } from '@/stores/authStore'
import { translations } from '@/lib/i18n'

export function useT() {
  const lang = useAuthStore((state) => state.profile?.language ?? 'nl')
  return translations[lang]
}
