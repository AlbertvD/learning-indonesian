/**
 * lesson-stage/validators/displayContent.ts — GT10.
 *
 * Display-content blob structure, folded out of the monolithic `lint-staging`
 * gate (ADR 0013 §6) plus generic per-type shape for the display-only sections
 * GT5 leaves permissive (ADR 0013 §1).
 *
 * Folded from lint-staging's `checkLessonStructure`:
 *   - grammar-section-no-categories (CRITICAL): a grammar section has no
 *       non-empty `categories[]` — whether it kept a legacy `body:string` or
 *       (the 2026-06-12 L16 failure) put its rules under the enricher-owned
 *       `grammar_topics` key. Either way it projects zero grammar categories →
 *       zero grammar capabilities, silently. The invariant is "rule-bearing
 *       content lives under content.categories"; this asserts it pre-write.
 *   - grammar-category-empty        (WARNING):  a category has no rules,
 *       examples, or table.
 *   - translation-drill-no-answer   (WARNING):  a translation/grammar_drill
 *       exercise item is missing its `answer`.
 *   The fourth lint check — `exercises-section-unstructured` — is NOT folded
 *   here because GT5 already enforces it: `validateSectionType` requires a
 *   non-empty `sections[]` for exercises sections, which subsumes the legacy
 *   `body:string`-with-no-`sections[]` case. Re-checking it here would
 *   duplicate within the gate.
 *
 * Generic display-only shape (CRITICAL): a `culture` or `reference_table`
 * section must carry at least one content key beyond `type`/`grammar_topics` —
 * i.e. it must not be an empty shell. This is deliberately GENERIC: it does NOT
 * assert any per-bespoke-page field (e.g. a lesson page reading
 * `content.borobudur_levels`); those remain the lesson page's concern, backed
 * by a render smoke (ADR 0013 §1). text/pronunciation/exercises display-only
 * shape is already GT5's.
 *
 * Pure + self-contained to the lesson (ADR 0013 §4): inspects only the authored
 * section blobs. No DB, no network.
 */

import type { ValidationFinding } from '../model'

interface SectionLike {
  title?: string
  order_index?: number
  content: Record<string, unknown>
}

/** Keys that don't count as "content" for the empty-shell check. */
const NON_CONTENT_KEYS = new Set(['type', 'grammar_topics'])

function isNonEmptyArray(value: unknown): boolean {
  return Array.isArray(value) && value.length > 0
}

export function validateDisplayContentShape(sections: SectionLike[]): ValidationFinding[] {
  const out: ValidationFinding[] = []

  for (const s of sections) {
    const c = s?.content ?? {}
    const type = c.type
    const ctx = { sectionTitle: s?.title, sectionOrderIndex: s?.order_index }

    if (type === 'grammar') {
      // grammar-section-no-categories (CRITICAL). A grammar section's
      // rule-bearing content MUST live under content.categories[] — that is the
      // shape projectSections reads into lesson_section_grammar_categories, the
      // typed rows the capability stage's pattern path needs to emit grammar
      // capabilities. A grammar section with no non-empty categories[] — whether
      // it kept a legacy body:string, OR (the silent 2026-06-12 L16 failure) put
      // all its rules under the enricher-owned grammar_topics key — projects ZERO
      // categories and therefore ZERO grammar capabilities, while the publish and
      // the capability gate both otherwise pass green. Fail it here, pre-write.
      if (!isNonEmptyArray(c.categories)) {
        out.push({
          gate: 'GT10',
          severity: 'error',
          message: typeof c.body === 'string'
            ? 'grammar section still has body:string and no categories[] — structure the rules under content.categories'
            : 'grammar section has no non-empty categories[] — rule content must live under content.categories, not grammar_topics (which is enricher-owned flat labels)',
          context: ctx,
        })
      }
      // grammar-category-empty (WARNING).
      if (Array.isArray(c.categories)) {
        for (const cat of c.categories as Array<Record<string, unknown>>) {
          const hasContent = Array.isArray(cat?.rules) || Array.isArray(cat?.examples) || Boolean(cat?.table)
          if (!hasContent) {
            out.push({
              gate: 'GT10',
              severity: 'warning',
              message: 'category has no rules, examples, or table',
              context: { ...ctx, blockKey: typeof cat?.title === 'string' ? (cat.title as string) : undefined },
            })
          }
        }
      }
    }

    if (type === 'exercises') {
      // translation-drill-no-answer (WARNING). exercises-section-unstructured
      // is GT5's job (it requires a non-empty sections[]). Array.isArray guards
      // keep a malformed blob from throwing — GT5 emits the shape finding; this
      // validator must still return cleanly rather than crash the gate.
      const subs = Array.isArray(c.sections) ? (c.sections as Array<Record<string, unknown>>) : []
      for (const sub of subs) {
        if (sub?.type === 'translation' || sub?.type === 'grammar_drill') {
          const items = Array.isArray(sub.items) ? (sub.items as Array<Record<string, unknown>>) : []
          items.forEach((it, i) => {
            if (it?.answer == null || it.answer === '') {
              out.push({
                gate: 'GT10',
                severity: 'warning',
                message: `${sub.type} item missing answer field`,
                context: { ...ctx, blockKey: typeof sub?.title === 'string' ? (sub.title as string) : undefined, lineIndex: i },
              })
            }
          })
        }
      }
    }

    // Generic display-only shape for the types GT5 leaves permissive.
    if (type === 'culture' || type === 'reference_table') {
      const contentKeys = Object.keys(c).filter((k) => !NON_CONTENT_KEYS.has(k))
      const hasAnyContent = contentKeys.some((k) => {
        const v = c[k]
        return isNonEmptyArray(v) || (typeof v === 'string' && v.trim().length > 0) || (v != null && typeof v === 'object' && !Array.isArray(v) && Object.keys(v as object).length > 0)
      })
      if (!hasAnyContent) {
        out.push({
          gate: 'GT10',
          severity: 'error',
          message: `${type} section is an empty shell — no display content beyond type/grammar_topics`,
          context: ctx,
        })
      }
    }
  }

  return out
}
