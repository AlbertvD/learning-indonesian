// Shared helpers for capabilityContentService builders.

import type { ItemMeaning } from '@/types/learning'

/**
 * Pick the user-language primary meaning, falling back to any user-language
 * meaning. Returns null if nothing matches — the builder then emits
 * `no_meaning_in_lang`.
 */
export function pickUserLangMeaning(
  meanings: ItemMeaning[],
  userLanguage: 'nl' | 'en',
): ItemMeaning | null {
  return (
    meanings.find(m => m.translation_language === userLanguage && m.is_primary)
    ?? meanings.find(m => m.translation_language === userLanguage)
    ?? null
  )
}

export function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}
