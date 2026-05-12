/**
 * candidateSlugs — slug-resolution helper for cloze contexts.
 *
 * Extracted verbatim from capability-stage-legacy.ts:130–158.
 *
 * Normalise a cloze context slug to match normalized_text in the DB.
 * normalized_text = base_text.toLowerCase().trim().
 *
 * NOTE: do NOT replace hyphens with spaces — Indonesian has legitimately
 * hyphenated words (oleh-oleh, sama-sama, baik-baik) where the hyphen is
 * part of the word.
 *
 * The slug in cloze-contexts.ts ideally matches base_text exactly, but the
 * linguist-structurer often writes simplified slugs (e.g. "beres") while the
 * base_text — and therefore normalized_text in the DB — includes accent
 * annotations and passive markers (e.g. "beres (bèrès)", "dibawa*").
 *
 * candidateSlugs() returns the exact slug first, then fallback variants:
 *   1. exact: "beres (bèrès)"  →  matches DB directly
 *   2. strip trailing *: "dibawa*" → "dibawa"
 *   3. strip parenthetical: "beres (bèrès)" → "beres"
 *   4. both: "disetrika* (foo)" → "disetrika"
 * When the slug from the upstream agent lacks parentheticals/asterisks,
 * variant 1 is tried first; if not found the DB is queried with a LIKE
 * prefix match (see adapter.findLearningItemBySlug).
 */
export function candidateSlugs(slug: string): string[] {
  const exact = slug.toLowerCase().trim()
  const stripped = exact
    .replace(/\s*\([^)]*\)\s*$/, '') // remove trailing (...)
    .replace(/\*$/, '')              // remove trailing *
    .trim()
  const noAsterisk = exact.replace(/\*$/, '').trim()
  const noParens = exact.replace(/\s*\([^)]*\)\s*$/, '').trim()
  // Deduplicate while preserving priority order
  return [...new Set([exact, noAsterisk, noParens, stripped])]
}
