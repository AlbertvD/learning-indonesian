/**
 * projectors/grammar.ts — DB-native grammar pattern projector.
 *
 * `projectPatternsFromCategories` derives grammar patterns + pattern capabilities
 * from the typed grammar CATEGORIES (lesson_section_grammar_categories), one
 * category = one pattern (OQ2-5). The legacy staging projector (`projectGrammar`,
 * which mapped staging grammar-patterns + exercise candidates into the retired
 * `exercise_variants` writer) was removed in Slice 5b (#147) — the pattern path
 * (runner step 5d) is the only caller now.
 */

import type { GrammarPatternInput } from '../adapter'

// ===========================================================================
// Task 3 (Slice 2): projectPatternsFromCategories — pure pattern projector
// ===========================================================================
//
// Derives grammar patterns + pattern capabilities DB-native from the typed
// grammar CATEGORIES (lesson_section_grammar_categories), ONE CATEGORY = ONE
// PATTERN (OQ2-5). NOT byte-identical to the legacy bundle — grammar was never
// practiced (0 review events / 0 learner state), so the legacy curated slugs
// carry no progress and are superseded. NO grammar_pattern_examples (OQ2-4 cut;
// examples are generator-input only, read by Task 4). Pure: fixtures in → rows
// out, no I/O. The WRITER (Task 5/6) owns skip-if-exists + the cutover-delete.

import { buildCanonicalKey, CAPABILITY_PROJECTION_VERSION, normalizeLessonSourceRef } from '@/lib/capabilities'
import { stableSlug } from '../../../content-pipeline-output'
import type { CapabilityInput } from '../adapter'
import type { TypedGrammarCategory } from '../loadFromDb'

/**
 * complexity_score is NOT NULL on grammar_patterns but has no category-native
 * source (it was a hand-tuned legacy field). Default to 1 — verified to have
 * NO runtime reader (grep: 0 matches in src/; coverageService reads only
 * id+introduced_by_lesson_id), so a constant degrades nothing.
 */
const DEFAULT_PATTERN_COMPLEXITY = 1

/** Per-category plan: the grammar_patterns row + its 2 pattern capabilities. */
export interface PatternPlan {
  category: TypedGrammarCategory
  slug: string
  sourceRef: string
  grammarPatternInput: GrammarPatternInput
  /** recognise → contrast → produce (ADR 0017): linear prereq chain
   *  (contrast prereq = recognition; produce prereq = contrast). */
  capabilities: CapabilityInput[]
}

export interface PatternProjectionInput {
  categories: TypedGrammarCategory[]
  lessonNumber: number
  lessonId: string
}

export interface PatternProjectionOutput {
  patternPlans: PatternPlan[]
}

/**
 * Pure projector: typed grammar categories → grammar_patterns + pattern caps.
 *
 * Projection rules (per the plan's Implementation reconciliation / OQ2-5):
 *   - slug = `l{N}-{stableSlug(category.title)}` — lesson-prefixed so it
 *     satisfies the GLOBAL `grammar_patterns.slug UNIQUE` and cannot merge two
 *     lessons' patterns via the onConflict:'slug' upsert. Within-lesson title
 *     collisions are disambiguated with `-{display_order}`; a surviving
 *     duplicate THROWS (content signal — never a silent merge).
 *   - source_ref = `lesson-{N}/pattern-{slug}` (normalised; byKind/pattern.ts
 *     strips the `lesson-{N}/pattern-` envelope back to slug).
 *   - canonical_key = buildCanonicalKey with sourceKind='pattern',
 *     direction/learnerLanguage='none', modality='text' — matching
 *     capabilityCatalog.ts:131-155 (the cap shape reference).
 *   - grammar_patterns NOT-NULL columns: name=title, short_explanation=rules
 *     joined (falls back to title so the NOT NULL write never fails),
 *     complexity_score=1, confusion_group=null, introduced_by_lesson_id=lessonId.
 *   - Each category → 3 caps (ADR 0017): recognise_grammar_pattern_cap, a
 *     contrast_grammar_pattern_cap sibling (prereq = recognition), and a
 *     produce_grammar_pattern_cap (prereq = contrast).
 *
 * Idempotency: the projector EMITS all patterns + caps; the writer decides
 * skip-vs-regenerate against the DB seeded-check. Projector stays pure.
 */
export function projectPatternsFromCategories(
  input: PatternProjectionInput,
): PatternProjectionOutput {
  // Pass 1 — base slugs (lesson-prefixed). Empty title-slug is a content error.
  const baseSlugs = input.categories.map((category) => {
    const titleSlug = stableSlug(category.title)
    if (!titleSlug) {
      throw new Error(
        `projectPatternsFromCategories: category title "${category.title}" (id=${category.id}) ` +
        'slugifies to empty — cannot derive a pattern slug',
      )
    }
    return `l${input.lessonNumber}-${titleSlug}`
  })

  // Pass 2 — count base-slug occurrences so only genuine collisions get the
  // display_order disambiguation suffix (unique titles keep the clean slug).
  const baseCounts = new Map<string, number>()
  for (const s of baseSlugs) baseCounts.set(s, (baseCounts.get(s) ?? 0) + 1)

  const patternPlans: PatternPlan[] = input.categories.map((category, i) => {
    const baseSlug = baseSlugs[i]
    const slug = (baseCounts.get(baseSlug) ?? 0) > 1
      ? `${baseSlug}-${category.display_order}`
      : baseSlug

    const sourceRef = normalizeLessonSourceRef(`lesson-${input.lessonNumber}/pattern-${slug}`)

    const description = category.rules.filter((r) => r.trim()).join('\n') || category.title

    const grammarPatternInput: GrammarPatternInput = {
      slug,
      pattern_name: category.title,
      description,
      complexity_score: DEFAULT_PATTERN_COMPLEXITY,
      confusion_group: null,
      introduced_by_lesson_id: input.lessonId,
    }

    const recognitionDraft = {
      sourceKind: 'grammar_pattern_src' as const,
      sourceRef,
      capabilityType: 'recognise_grammar_pattern_cap' as const,
      direction: 'none' as const,
      modality: 'text' as const,
      learnerLanguage: 'none' as const,
    }
    const recognitionKey = buildCanonicalKey(recognitionDraft)
    const contrastKey = buildCanonicalKey({
      ...recognitionDraft,
      capabilityType: 'contrast_grammar_pattern_cap' as const,
    })
    const produceKey = buildCanonicalKey({
      ...recognitionDraft,
      capabilityType: 'produce_grammar_pattern_cap' as const,
    })

    const capabilities: CapabilityInput[] = [
      {
        canonicalKey: recognitionKey,
        sourceKind: 'grammar_pattern_src',
        sourceRef,
        capabilityType: 'recognise_grammar_pattern_cap',
        direction: 'none',
        modality: 'text',
        learnerLanguage: 'none',
        projectionVersion: CAPABILITY_PROJECTION_VERSION,
        lessonId: input.lessonId,
        requiredArtifacts: [],
        prerequisiteKeys: [],
      },
      {
        canonicalKey: contrastKey,
        sourceKind: 'grammar_pattern_src',
        sourceRef,
        capabilityType: 'contrast_grammar_pattern_cap',
        direction: 'none',
        modality: 'text',
        learnerLanguage: 'none',
        projectionVersion: CAPABILITY_PROJECTION_VERSION,
        lessonId: input.lessonId,
        requiredArtifacts: [],
        prerequisiteKeys: [recognitionKey],
      },
      // ADR 0017 — produce_grammar_pattern_cap, gated after contrast (linear
      // recognise → contrast → produce chain). Shares the recognise/contrast
      // source_ref, so the runner junctions it to the same content_unit and
      // it carries the two production exercises per renderContracts.
      {
        canonicalKey: produceKey,
        sourceKind: 'grammar_pattern_src',
        sourceRef,
        capabilityType: 'produce_grammar_pattern_cap',
        direction: 'none',
        modality: 'text',
        learnerLanguage: 'none',
        projectionVersion: CAPABILITY_PROJECTION_VERSION,
        lessonId: input.lessonId,
        requiredArtifacts: [],
        prerequisiteKeys: [contrastKey],
      },
    ]

    return { category, slug, sourceRef, grammarPatternInput, capabilities }
  })

  // Pass 3 — final uniqueness guard. A surviving duplicate (same base slug AND
  // same display_order, e.g. across two grammar sections) is unresolvable
  // automatically → throw rather than silently merge two patterns.
  const seen = new Set<string>()
  for (const plan of patternPlans) {
    if (seen.has(plan.slug)) {
      throw new Error(
        `projectPatternsFromCategories: duplicate pattern slug "${plan.slug}" in lesson ` +
        `${input.lessonNumber} — two grammar categories collide after tie-break; rename a category title`,
      )
    }
    seen.add(plan.slug)
  }

  return { patternPlans }
}
