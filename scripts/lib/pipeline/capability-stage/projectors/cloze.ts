/**
 * projectors/cloze.ts — projects staged cloze contexts into row plans.
 * The runner's adapter resolves each plan's slug to learning_items.id via
 * candidateSlugs + ilike-prefix fallback (legacy 738–773).
 *
 * Source-of-truth mapping: legacy 727–803.
 */

export interface ClozeStagingContext {
  learning_item_slug: string
  source_text: string
  translation_text: string
  difficulty?: number | null
  topic_tag?: string | null
}

export interface ClozePlan {
  learning_item_slug: string
  source_text: string
  translation_text: string
  difficulty?: number | null
  topic_tag?: string | null
}

export interface ClozeProjectionInput {
  clozeContexts: ClozeStagingContext[]
}

export interface ClozeProjectionOutput {
  plans: ClozePlan[]
}

export function projectCloze(input: ClozeProjectionInput): ClozeProjectionOutput {
  return {
    plans: input.clozeContexts.map((ctx) => ({
      learning_item_slug: ctx.learning_item_slug,
      source_text: ctx.source_text,
      translation_text: ctx.translation_text,
      difficulty: ctx.difficulty ?? null,
      topic_tag: ctx.topic_tag ?? null,
    })),
  }
}
