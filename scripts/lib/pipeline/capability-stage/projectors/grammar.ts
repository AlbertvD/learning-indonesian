/**
 * projectors/grammar.ts — staged grammar patterns + exercise candidates →
 * adapter write plans.
 *
 * Source-of-truth mapping (legacy → here):
 *   386–420 grammar pattern upsert (introduced_by_lesson_id rule)
 *   566–579 GRAMMAR_EXERCISE_TYPES + approved candidate filter
 *   580–698 candidate publish loop — routing rule (grammar via lesson_id+pattern,
 *           vocab via context_id lookup) is encoded here as plan items the
 *           adapter executes.
 */

import type { GrammarPatternInput } from '../adapter'
import { extractAnswerKey, GRAMMAR_EXERCISE_TYPES } from '../validators/candidatePayload'

export interface GrammarStagingPattern {
  slug: string
  pattern_name: string
  description?: string
  complexity_score: number
  confusion_group?: string | null
}

export interface CandidateStagingItem {
  exercise_type: string
  grammar_pattern_slug?: string | null
  payload: Record<string, unknown> | null | undefined
  review_status?: string
}

export interface GrammarProjectionInput {
  lessonNumber: number
  lessonId: string
  grammarPatterns: GrammarStagingPattern[]
  candidates: CandidateStagingItem[]
}

export type ExerciseVariantPlan =
  | {
      kind: 'grammar'
      exercise_type: string
      grammarPatternSlug: string | null
      lessonId: string
      payload_json: Record<string, unknown>
      answer_key_json: Record<string, unknown>
    }
  | {
      kind: 'vocab'
      exercise_type: string
      sourceText: string
      grammarPatternSlug: string | null
      payload_json: Record<string, unknown>
      answer_key_json: Record<string, unknown>
    }

export interface GrammarProjectionOutput {
  grammarPatterns: GrammarPatternInput[]
  exerciseVariants: ExerciseVariantPlan[]
}

export function projectGrammar(input: GrammarProjectionInput): GrammarProjectionOutput {
  const grammarPatterns: GrammarPatternInput[] = input.grammarPatterns.map((pattern) => ({
    slug: pattern.slug,
    pattern_name: pattern.pattern_name,
    description: pattern.description,
    complexity_score: pattern.complexity_score,
    confusion_group: pattern.confusion_group ?? null,
    introduced_by_lesson_id: input.lessonId,
  }))

  const approved = input.candidates.filter((c) =>
    c.review_status === 'pending_review' || c.review_status === 'approved',
  )

  const exerciseVariants: ExerciseVariantPlan[] = []
  for (const candidate of approved) {
    if (!candidate.payload) continue
    const answerKey = extractAnswerKey(candidate.exercise_type, candidate.payload)
    if (GRAMMAR_EXERCISE_TYPES.has(candidate.exercise_type)) {
      exerciseVariants.push({
        kind: 'grammar',
        exercise_type: candidate.exercise_type,
        grammarPatternSlug: candidate.grammar_pattern_slug ?? null,
        lessonId: input.lessonId,
        payload_json: candidate.payload,
        answer_key_json: answerKey,
      })
    } else {
      const sourceText = typeof candidate.payload.sentence === 'string'
        ? candidate.payload.sentence
        : typeof candidate.payload.sourceSentence === 'string'
          ? candidate.payload.sourceSentence
          : typeof candidate.payload.sourceLanguageSentence === 'string'
            ? candidate.payload.sourceLanguageSentence
            : ''
      if (!sourceText) continue
      exerciseVariants.push({
        kind: 'vocab',
        exercise_type: candidate.exercise_type,
        sourceText,
        grammarPatternSlug: candidate.grammar_pattern_slug ?? null,
        payload_json: candidate.payload,
        answer_key_json: answerKey,
      })
    }
  }

  return { grammarPatterns, exerciseVariants }
}

export { GRAMMAR_EXERCISE_TYPES }

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
  /** pattern_recognition + pattern_contrast (contrast prereq = recognition). */
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
 *   - Each category → 2 caps: pattern_recognition + a pattern_contrast sibling
 *     whose prerequisite is the recognition key.
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
      sourceKind: 'pattern' as const,
      sourceRef,
      capabilityType: 'pattern_recognition' as const,
      direction: 'none' as const,
      modality: 'text' as const,
      learnerLanguage: 'none' as const,
    }
    const recognitionKey = buildCanonicalKey(recognitionDraft)
    const contrastKey = buildCanonicalKey({
      ...recognitionDraft,
      capabilityType: 'pattern_contrast' as const,
    })

    const capabilities: CapabilityInput[] = [
      {
        canonicalKey: recognitionKey,
        sourceKind: 'pattern',
        sourceRef,
        capabilityType: 'pattern_recognition',
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
        sourceKind: 'pattern',
        sourceRef,
        capabilityType: 'pattern_contrast',
        direction: 'none',
        modality: 'text',
        learnerLanguage: 'none',
        projectionVersion: CAPABILITY_PROJECTION_VERSION,
        lessonId: input.lessonId,
        requiredArtifacts: [],
        prerequisiteKeys: [recognitionKey],
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
