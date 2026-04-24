/**
 * String normalizers shared between scripts.
 *
 * Authoring files use varying conventions for punctuation and diacritics:
 *   learning-items.ts keeps base_text as-authored ('apa?', 'merah (mérah)')
 *   cloze-contexts.ts slugs are lowercase, trimmed, without trailing punct
 * When a linter needs to cross-reference the two, both go through one of
 * these normalizers.
 */

// Tolerates:
//   - case differences ('Monas' vs 'monas')
//   - trailing question/exclamation marks ('apa?' vs 'apa')
//   - pronunciation diacritics ('léwat' vs 'lewat') — NFD + strip combining marks
// Preserves internal parentheses / quotes / hyphens / spaces (a cloze slug
// like 'lewat (lewat)' mirrors the base_text 'lewat (léwat)').
export function normalizeForClozeCompare(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[?!]+$/, '')
}

// Stricter normalizer for matching against the discourse-particle exempt set.
// Strips trailing pronunciation parentheticals first so a particle with an
// annotation ('deh! (dèh)') still matches its bare-form exemption, then runs
// through the cloze-compare normalizer which handles case/diacritics and
// trailing punctuation that was hidden inside the parenthetical position.
export function normalizeForExemptLookup(s: string): string {
  const withoutParen = s.replace(/\s*\([^)]*\)\s*$/, '').trim()
  return normalizeForClozeCompare(withoutParen)
}

// Normalize a token extracted from a sentence when cross-referencing it against
// learning_items.normalized_text in the DB or staging files.
// Matches publish-approved-content.ts:293 derivation (.toLowerCase().trim())
// plus strips adjacent trailing ASCII punctuation (`pohon.` → `pohon`) so a
// word adjacent to a period/comma/etc. in a sentence still matches its vocab
// entry. Diacritics are preserved (unlike normalizeForClozeCompare) because
// authored sentences and vocab entries both retain them.
export function normalizeDialogueToken(token: string): string {
  return token
    .toLowerCase()
    .trim()
    .replace(/^[.,!?;:"'(]+/, '')
    .replace(/[.,!?;:"')]+$/, '')
}
