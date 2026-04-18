// scripts/lib/validate-pos.ts
// Pure helper: validates POS tags on learning_items before publish.

export const VALID_POS = new Set([
  'verb', 'noun', 'adjective', 'adverb', 'pronoun', 'numeral',
  'classifier', 'preposition', 'conjunction', 'particle',
  'question_word', 'greeting',
])

export interface POSValidationResult {
  warnings: string[]       // WARNING messages — non-blocking
  criticalErrors: string[] // CRITICAL — abort publish
  coverage: Record<string, number>  // per-POS count for word/phrase items
}

export interface StagingItem {
  base_text: string
  item_type: string
  pos?: string | null
}

export function validatePOS(items: StagingItem[]): POSValidationResult {
  const warnings: string[] = []
  const criticalErrors: string[] = []
  const coverage: Record<string, number> = {}

  for (const item of items) {
    // Gate 1: missing POS on word/phrase → WARNING
    if ((item.item_type === 'word' || item.item_type === 'phrase') && !item.pos) {
      warnings.push(`[POS-missing] Item "${item.base_text}" (${item.item_type}) has no POS`)
    }
    // Gate 2: invalid POS value → CRITICAL
    if (item.pos != null && !VALID_POS.has(item.pos)) {
      criticalErrors.push(`[POS-invalid] Item "${item.base_text}" has invalid pos="${item.pos}"`)
    }
    // Gate 3: coverage counts
    if (item.item_type === 'word' || item.item_type === 'phrase') {
      const key = item.pos ?? 'null'
      coverage[key] = (coverage[key] ?? 0) + 1
    }
  }

  return { warnings, criticalErrors, coverage }
}
