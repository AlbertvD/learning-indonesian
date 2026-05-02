/**
 * Split an option text into normalized component words for substring-overlap dedup.
 * Strips parentheticals, splits on clause separators (, ; /), lowercases, trims.
 * Components ≥ 3 chars are considered significant; shorter ones (de, en) skipped.
 *
 * Examples:
 *   "omdat"                          → ["omdat"]
 *   "omdat, de reden is"             → ["omdat", "de reden is"]
 *   "fijn / mooi (kwaliteit)"        → ["fijn", "mooi"]
 *   "met de bus gaan"                → ["met de bus gaan"]
 */
export function optionComponents(s: string): string[] {
  return s
    .replace(/\s*\([^)]*\)\s*/g, ' ')
    .split(/[,;/]/)
    .map(t => t.trim().toLowerCase())
    .filter(t => t.length >= 3)
}

/**
 * True if the candidate's option shares meaningful text with any already-
 * selected option — either as a whole component match or a whole-word
 * substring. Used to prevent visual duplicates like
 * [omdat, "omdat, de reden is"] from surfacing together.
 */
export function sharesMeaningfulWord(candidate: string, selected: Set<string>): boolean {
  const candParts = optionComponents(candidate)
  if (candParts.length === 0) return false
  for (const sel of selected) {
    const selParts = optionComponents(sel)
    for (const cp of candParts) {
      for (const sp of selParts) {
        if (cp === sp) return true
        // whole-word substring match in either direction
        const inCp = cp.length > sp.length && (cp.startsWith(`${sp} `) || cp.endsWith(` ${sp}`) || cp.includes(` ${sp} `))
        const inSp = sp.length > cp.length && (sp.startsWith(`${cp} `) || sp.endsWith(` ${cp}`) || sp.includes(` ${cp} `))
        if (inCp || inSp) return true
      }
    }
  }
  return false
}
