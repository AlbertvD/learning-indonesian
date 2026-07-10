// lib/morphology/family — pure assembly of word families (root → its derived
// forms, cross-affix) and the full affix-detail view (rule card + explorer +
// progress + practice scope). Reuses the canonical mastery predicate to status-
// mark every form (grill: show the FULL family, "you know 3 of 8", not owned-only).

import { affixCatalogEntry, allomorphClassesFor, itemSlug } from '@/lib/capabilities'
import { labelForCapability, weakestLabel, type MasteryLabel } from '@/lib/analytics/mastery/masteryModel'
import { loadMorphologySnapshot, type MorphologyCapRow, type MorphologyReadClient, type MorphologySnapshot } from './adapter'
import { buildEvidence, capsForAffix, rollUpProgress } from './catalog'
import type { AffixDetail, AffixExample, DerivedForm, WordFamily } from './model'

type Language = 'nl' | 'en'

const SOLID: ReadonlySet<MasteryLabel> = new Set<MasteryLabel>(['mastered', 'strengthening'])

/** Is the root a known vocabulary word? Exists as a learning_item AND has a
 *  recognition cap the learner has made solid (mastered/strengthening — "known
 *  word" = receptive recognition mastered). Drives the explorer's flag; the hard
 *  produce-drill block (ADR 0018) is enforced by the session engine, reflected here. */
function isRootKnown(snapshot: MorphologySnapshot, rootText: string, now: Date): boolean {
  const slug = itemSlug(rootText)
  if (!snapshot.rootItemsBySlug.has(slug)) return false
  const sourceRef = `learning_items/${slug}`
  return snapshot.rootCaps
    .filter((cap) => cap.sourceRef === sourceRef)
    .some((cap) => SOLID.has(labelForCapability(buildEvidence(cap, snapshot), now)))
}

function rootMeaning(snapshot: MorphologySnapshot, rootText: string, language: Language): string | null {
  const item = snapshot.rootItemsBySlug.get(itemSlug(rootText))
  if (!item) return null
  // No cross-language fallback: a Dutch UI shows Dutch or nothing, never a silent
  // English string (and vice-versa) — the bilingual-leak fix.
  return (language === 'nl' ? item.meaningNl : item.meaningEn) ?? null
}

/** The derived form's meaning in the learner's language (Fix 3). Same no-cross-
 *  language-fallback rule as rootMeaning: Dutch UI shows Dutch or nothing. */
function derivedMeaning(pair: { derivedGlossNl: string | null; derivedGlossEn: string | null }, language: Language): string | null {
  return (language === 'nl' ? pair.derivedGlossNl : pair.derivedGlossEn) ?? null
}

/** All derived forms of one root, across affixes, status-marked + deduped by the
 *  derived surface form (a form's status is weakest-wins across its caps). */
function formsForRoot(snapshot: MorphologySnapshot, rootText: string, language: Language, now: Date): DerivedForm[] {
  const byDerived = new Map<string, { affix: string; productive: boolean; carrierText: string | null; derivedMeaning: string | null; caps: MorphologyCapRow[] }>()
  for (const pair of snapshot.pairs) {
    if (pair.rootText !== rootText) continue
    if (!pair.affix) continue // defensive: affix is nullable on the projection table
    const cap = snapshot.pairCapsById.get(pair.capabilityId)
    const entry = byDerived.get(pair.derivedText) ?? {
      affix: pair.affix,
      productive: pair.productive,
      carrierText: pair.carrierText,
      derivedMeaning: derivedMeaning(pair, language),
      caps: [] as MorphologyCapRow[],
    }
    entry.carrierText = entry.carrierText ?? pair.carrierText
    entry.derivedMeaning = entry.derivedMeaning ?? derivedMeaning(pair, language)
    if (cap) entry.caps.push(cap)
    byDerived.set(pair.derivedText, entry)
  }
  return [...byDerived.entries()]
    .map(([derivedText, e]) => ({
      derivedText,
      affix: e.affix,
      productive: e.productive,
      label: weakestLabel(e.caps.map((cap) => labelForCapability(buildEvidence(cap, snapshot), now))),
      carrierText: e.carrierText,
      derivedMeaning: e.derivedMeaning,
    }))
    .sort((a, b) => a.derivedText.localeCompare(b.derivedText))
}

/** Word families for an affix's detail page: every root that has a pair under
 *  THIS affix, each shown with its full cross-affix family (item B root join). */
export function buildWordFamiliesForAffix(
  snapshot: MorphologySnapshot,
  affix: string,
  language: Language,
  now: Date = new Date(),
): WordFamily[] {
  const roots = [...new Set(snapshot.pairs.filter((p) => p.affix === affix).map((p) => p.rootText))]
  return roots
    .sort((a, b) => a.localeCompare(b))
    .map((rootText) => ({
      rootText,
      rootMeaning: rootMeaning(snapshot, rootText, language),
      rootKnown: isRootKnown(snapshot, rootText, now),
      forms: formsForRoot(snapshot, rootText, language, now),
    }))
}

/**
 * The complete affix-detail view. Returns null when the affix is not a catalog
 * member (an unknown affix in the URL). Content-thin affixes return a coherent
 * shell (empty examples/families, all-zero progress) so the panels can render
 * their empty states.
 */
export function buildAffixDetail(
  snapshot: MorphologySnapshot,
  affix: string,
  language: Language,
  now: Date = new Date(),
): AffixDetail | null {
  const entry = affixCatalogEntry(affix)
  if (!entry) return null

  const caps = capsForAffix(snapshot, affix)
  const evidence = caps.map((cap) => buildEvidence(cap, snapshot))
  const affixPairs = snapshot.pairs.filter((p) => p.affix === affix)

  // Representative rule prose + intro lesson: the pair on the lowest-order lesson.
  const representative = affixPairs
    .map((pair) => ({ pair, cap: snapshot.pairCapsById.get(pair.capabilityId) }))
    .filter((x) => x.cap != null)
    .sort((a, b) => {
      const ao = a.cap!.lessonId ? snapshot.lessonOrderById.get(a.cap!.lessonId) ?? Infinity : Infinity
      const bo = b.cap!.lessonId ? snapshot.lessonOrderById.get(b.cap!.lessonId) ?? Infinity : Infinity
      return ao - bo
    })[0]

  const repCap = representative?.cap ?? null
  const pattern = representative?.pair.grammarPatternId
    ? snapshot.patternsById.get(representative.pair.grammarPatternId) ?? null
    : null

  const ruleNote = affixPairs.find((p) => p.allomorphRule.trim().length > 0)?.allomorphRule ?? null

  // Dedupe by derivedText BEFORE slicing (mirrors buildWordFamiliesForAffix's
  // byDerived map). The affixed_form_pairs table currently holds exact-duplicate
  // rows for many derived forms, so an undeduped slice(0,3) can surface the same
  // form twice (e.g. "berdua" under ber-). One row per derived form.
  const seenDerived = new Set<string>()
  const examples: AffixExample[] = affixPairs
    .filter((p) => (seenDerived.has(p.derivedText) ? false : (seenDerived.add(p.derivedText), true)))
    .slice(0, 3)
    .map((p) => ({ rootText: p.rootText, derivedText: p.derivedText, carrierText: p.carrierText, derivedMeaning: derivedMeaning(p, language) }))

  const practiceSourceRefs = [
    ...new Set(
      caps
        .filter((c) => c.readinessStatus === 'ready' && c.publicationStatus === 'published')
        .map((c) => c.sourceRef),
    ),
  ]

  return {
    affix: entry.affix,
    affixType: entry.affixType,
    gloss: language === 'nl' ? entry.glossNl : entry.glossEn,
    rank: entry.rank,
    cefrLevel: entry.cefrLevel,
    available: caps.some((c) => c.lessonId != null && snapshot.activatedLessonIds.has(c.lessonId)),
    allomorphClasses: allomorphClassesFor(affix),
    ruleNote,
    rule: {
      lessonNumber: repCap?.lessonId ? snapshot.lessonOrderById.get(repCap.lessonId) ?? null : null,
      lessonId: repCap?.lessonId ?? null,
      patternSlug: pattern?.slug ?? null,
      patternName: pattern?.name ?? null,
      patternExplanation: pattern?.shortExplanation ?? null,
    },
    examples,
    families: buildWordFamiliesForAffix(snapshot, affix, language, now),
    progress: rollUpProgress(evidence, now),
    practiceSourceRefs,
  }
}

/** Impure entry point: load the snapshot + fold the affix detail. Null when the
 *  affix is not a catalog member. */
export async function getAffixDetail(
  userId: string,
  affix: string,
  language: Language,
  client?: MorphologyReadClient,
): Promise<AffixDetail | null> {
  const snapshot = await loadMorphologySnapshot(userId, client)
  return buildAffixDetail(snapshot, affix, language)
}
