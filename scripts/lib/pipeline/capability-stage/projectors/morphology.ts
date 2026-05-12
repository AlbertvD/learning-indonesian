/**
 * projectors/morphology.ts — Decision 3.
 *
 * Morphology capabilities (`affixed_form_pair` source kind) come pre-built
 * in the staging `capabilities.ts` file via `materialize-capabilities.ts`
 * upstream. The legacy publish flow upserted them as-is.
 *
 * Decision 3 stamps `learning_capabilities.lesson_id` on every morphology
 * row at publish time so the runtime knows which lesson INTRODUCES the
 * morphology rule (not which lesson the affixed form appears in, not the
 * lesson where the root word was first taught).
 *
 * The hardcoded slug set below (fold §11 #1) gates whether the stamping
 * applies. Lessons whose `grammar_patterns` set includes any of these slugs
 * are morphology-introducing lessons; their `affixed_form_pair` capability
 * rows get `lesson_id = <this lesson>`. Lessons 1–8 without these slugs do
 * not introduce morphology and skip the stamping.
 */

export const MORPHOLOGY_PATTERN_SLUGS = new Set([
  'men-active',     // meN- prefix (lesson 9)
  'ber-prefix',
  'di-passive',
  'me-prefix',
  'pe-nominalizer',
  'ke-an-noun',
  'pe-an-noun',
])

export function lessonIntroducesMorphology(patternSlugs: string[]): boolean {
  return patternSlugs.some((slug) => MORPHOLOGY_PATTERN_SLUGS.has(slug))
}
