import { describe, expect, it } from 'vitest'
import { buildAffixCatalog, rollUpProgress } from '../catalog'
import { buildAffixDetail, buildWordFamiliesForAffix } from '../family'
import { affixPracticePath, affixScopeFromSnapshot, AFFIX_SESSION_MODE } from '../practice'
import type {
  MorphologyCapRow,
  MorphologyPairRow,
  MorphologySnapshot,
  MorphologyStateRow,
} from '../adapter'
import type { CapabilityMasteryEvidence } from '@/lib/analytics/mastery/masteryModel'
import type { CapabilityType } from '@/lib/capabilities'

const now = new Date('2026-06-19T10:00:00.000Z')
const recent = '2026-06-18T10:00:00.000Z'

// Lesson ids ↔ order. L9/L7/L13 activated; L20 (peN-) NOT activated.
const L7 = 'lesson-7-id'
const L9 = 'lesson-9-id'
const L13 = 'lesson-13-id'
const L20 = 'lesson-20-id'
// The hidden "Common Words" lesson (order_index=999) — deliberately absent
// from lessonOrderById below (the adapter excludes hidden rows), so a root
// whose only vocab cap sits here must resolve rootIntroLessonNumber to null,
// not 999 (the Les-999 trap).
const L_HIDDEN = 'lesson-hidden-id'

function cap(overrides: Partial<MorphologyCapRow> & { id: string; sourceRef: string }): MorphologyCapRow {
  return {
    canonicalKey: `key:${overrides.id}`,
    sourceKind: 'word_form_pair_src',
    capabilityType: 'recognise_word_form_link_cap',
    modality: 'text',
    readinessStatus: 'ready',
    publicationStatus: 'published',
    lessonId: null,
    ...overrides,
  }
}

function pair(overrides: Partial<MorphologyPairRow> & { capabilityId: string; rootText: string; derivedText: string; affix: string }): MorphologyPairRow {
  return {
    affixType: 'prefix',
    affixGloss: null,
    allomorphClass: null,
    allomorphRule: '',
    productive: true,
    carrierText: null,
    derivedGlossNl: null,
    derivedGlossEn: null,
    grammarPatternId: null,
    ...overrides,
  }
}

function masteredState(capabilityId: string): MorphologyStateRow {
  return { capabilityId, reviewCount: 5, lapseCount: 0, consecutiveFailureCount: 0, stability: 20, lastReviewedAt: recent }
}

// Minimal CapabilityMasteryEvidence factory for direct rollUpProgress unit
// tests (the recognition/production split doesn't need the full snapshot/
// adapter fan-out — it's a pure per-cap tally).
function evidence(
  overrides: Partial<CapabilityMasteryEvidence> & {
    capabilityId: string
    sourceRef: string
    capabilityType: CapabilityType
  },
): CapabilityMasteryEvidence {
  return {
    canonicalKey: `key:${overrides.capabilityId}`,
    sourceKind: 'word_form_pair_src',
    modality: 'text',
    readinessStatus: 'ready',
    publicationStatus: 'published',
    lessonActivated: true,
    lessonNumber: 9,
    reviewCount: 0,
    lapseCount: 0,
    consecutiveFailureCount: 0,
    stability: null,
    lastReviewedAt: null,
    ...overrides,
  }
}

// meN- (ajar→mengajar mastered L9, tulis→menulis introduced L13),
// ber- (ajar→belajar L7, aman→beraman out-of-course, makan→bermakan on the
// hidden lesson only), peN- (ajar→pengajar L20, unavailable).
// aman/makan are ber- roots (not meN-) so the new rootIntroLessonNumber
// fixtures don't shift meN-'s existing derivation-count assertions below.
function fixture(): MorphologySnapshot {
  const pairs: MorphologyPairRow[] = [
    pair({ capabilityId: 'cap-men-ajar', rootText: 'ajar', derivedText: 'mengajar', affix: 'meN-', allomorphRule: 'ajar → mengajar (ng-)', carrierText: 'Saya mengajar di sekolah.', derivedGlossNl: 'lesgeven', derivedGlossEn: 'to teach', grammarPatternId: 'pat-men' }),
    pair({ capabilityId: 'cap-men-tulis', rootText: 'tulis', derivedText: 'menulis', affix: 'meN-', allomorphRule: 'tulis → menulis (n-)', grammarPatternId: 'pat-men' }),
    pair({ capabilityId: 'cap-ber-ajar', rootText: 'ajar', derivedText: 'belajar', affix: 'ber-', productive: true }),
    pair({ capabilityId: 'cap-ber-aman', rootText: 'aman', derivedText: 'beraman', affix: 'ber-' }),
    pair({ capabilityId: 'cap-ber-makan', rootText: 'makan', derivedText: 'bermakan', affix: 'ber-' }),
    pair({ capabilityId: 'cap-pen-ajar', rootText: 'ajar', derivedText: 'pengajar', affix: 'peN-', productive: false }),
    // a null-affix projection row — must be excluded defensively everywhere.
    pair({ capabilityId: 'cap-null', rootText: 'ajar', derivedText: 'mengajarkan', affix: null as unknown as string }),
  ]
  const caps = [
    cap({ id: 'cap-men-ajar', sourceRef: 'affixed_form_pairs/men-ajar', lessonId: L9 }),
    cap({ id: 'cap-men-tulis', sourceRef: 'affixed_form_pairs/men-tulis', lessonId: L13 }),
    cap({ id: 'cap-ber-ajar', sourceRef: 'affixed_form_pairs/ber-ajar', lessonId: L7 }),
    cap({ id: 'cap-ber-aman', sourceRef: 'affixed_form_pairs/ber-aman', lessonId: L7 }),
    cap({ id: 'cap-ber-makan', sourceRef: 'affixed_form_pairs/ber-makan', lessonId: L7 }),
    cap({ id: 'cap-pen-ajar', sourceRef: 'affixed_form_pairs/pen-ajar', lessonId: L20 }),
    cap({ id: 'cap-null', sourceRef: 'affixed_form_pairs/null', lessonId: L9 }),
    // root vocab cap for ajar — mastered → ajar is a known root, introducing lesson L9.
    cap({ id: 'cap-root-ajar', sourceRef: 'learning_items/ajar', sourceKind: 'vocabulary_src', capabilityType: 'recognise_meaning_from_text_cap', lessonId: L9 }),
    // root vocab cap for tulis — NOT mastered (no state below) → known-but-unlearned, introducing lesson L13.
    cap({ id: 'cap-root-tulis', sourceRef: 'learning_items/tulis', sourceKind: 'vocabulary_src', capabilityType: 'recognise_meaning_from_text_cap', lessonId: L13 }),
    // root vocab cap for makan — ONLY on the hidden lesson. L_HIDDEN is deliberately
    // absent from lessonOrderById (mirrors the adapter's hidden-row exclusion).
    cap({ id: 'cap-root-makan', sourceRef: 'learning_items/makan', sourceKind: 'vocabulary_src', capabilityType: 'recognise_meaning_from_text_cap', lessonId: L_HIDDEN }),
    // 'aman' has NO vocab cap at all — genuinely out-of-course.
  ]
  return {
    pairs,
    pairCapsById: new Map(caps.filter(c => c.sourceKind === 'word_form_pair_src').map(c => [c.id, c])),
    rootCaps: caps.filter(c => c.sourceKind === 'vocabulary_src'),
    statesByCapId: new Map<string, MorphologyStateRow>([
      ['cap-men-ajar', masteredState('cap-men-ajar')],
      ['cap-root-ajar', masteredState('cap-root-ajar')],
    ]),
    lessonOrderById: new Map([[L7, 7], [L9, 9], [L13, 13], [L20, 20]]),
    lessonPodcastById: new Map([
      [L9, { nl: 'lessons/9/grammar-nl.mp3', en: 'lessons/9/grammar-en.mp3' }],
      [L13, { nl: null, en: null }],
    ]),
    activatedLessonIds: new Set([L7, L9, L13]),
    patternsById: new Map([['pat-men', { slug: 'l9-men', name: 'Het voorvoegsel meN-', shortExplanation: 'Vormt actieve werkwoorden.' }]]),
    rootItemsBySlug: new Map([
      ['ajar', { normalizedText: 'ajar', baseText: 'ajar', meaningNl: 'onderwijzen', meaningEn: 'to teach' }],
      ['tulis', { normalizedText: 'tulis', baseText: 'tulis', meaningNl: 'schrijven', meaningEn: 'to write' }],
      ['makan', { normalizedText: 'makan', baseText: 'makan', meaningNl: 'eten', meaningEn: 'to eat' }],
    ]),
  }
}

describe('buildAffixCatalog', () => {
  it('returns every catalog affix, sorted by teaching rank', () => {
    const tiles = buildAffixCatalog(fixture(), 'nl', now)
    expect(tiles.length).toBeGreaterThanOrEqual(21)
    const ranks = tiles.map(t => t.rank)
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b))
    expect(tiles[0]?.affix).toBe('ber-')
  })

  it('rolls up per-affix progress weakest-wins per derivation', () => {
    const tiles = buildAffixCatalog(fixture(), 'nl', now)
    const meN = tiles.find(t => t.affix === 'meN-')!
    // 2 derivations: mengajar (mastered) + menulis (introduced, L13 activated, 0 reviews).
    expect(meN.progress.totalCount).toBe(2)
    expect(meN.progress.masteredCount).toBe(1)
    expect(meN.progress.practisedCount).toBe(1)
    expect(meN.progress.funnel.mastered).toBe(1)
    expect(meN.progress.funnel.introduced).toBe(1)
    expect(meN.progress.label).toBe('introduced') // weakest of {mastered, introduced}
    expect(meN.available).toBe(true)
    expect(meN.introLessonNumber).toBe(9)
  })

  it('marks an affix unavailable when its introducing lesson is not activated', () => {
    const peN = buildAffixCatalog(fixture(), 'nl', now).find(t => t.affix === 'peN-')!
    expect(peN.available).toBe(false)
    expect(peN.progress.funnel.not_assessed).toBe(1)
  })

  it('shows zero-content affixes (e.g. -i) as empty, unavailable tiles', () => {
    const minusI = buildAffixCatalog(fixture(), 'nl', now).find(t => t.affix === '-i')!
    expect(minusI.progress.totalCount).toBe(0)
    expect(minusI.available).toBe(false)
  })

  it('language-selects the affix rule gloss (bilingual — no English in the NL grid)', () => {
    const nl = buildAffixCatalog(fixture(), 'nl', now).find(t => t.affix === 'di-')!
    const en = buildAffixCatalog(fixture(), 'en', now).find(t => t.affix === 'di-')!
    expect(nl.gloss).toMatch(/lijdende|passieve/i)
    expect(en.gloss).toMatch(/passive/i)
    expect(nl.gloss).not.toBe(en.gloss)
  })

  it('splits per-affix progress into recognition/production class tallies (review P1) — affix with only recognition caps has production.totalCount 0', () => {
    const tiles = buildAffixCatalog(fixture(), 'nl', now)
    const meN = tiles.find(t => t.affix === 'meN-')!
    // Both meN- fixture caps are recognise_word_form_link_cap (recognition class);
    // no produce_* cap exists yet for this affix — the production tier doesn't
    // exist, so its denominator is 0 (renders as the LessonCard Bar's "—" path,
    // never a false "0%").
    expect(meN.progress.recognition.totalCount).toBe(2)
    expect(meN.progress.recognition.masteredCount).toBe(1) // mengajar mastered, menulis not
    expect(meN.progress.production.totalCount).toBe(0)
    expect(meN.progress.production.masteredCount).toBe(0)
  })
})

describe('rollUpProgress — recognition/production class split (review P1)', () => {
  it('tallies mastered recognition + untouched production as 100%/0% honestly (the tier exists, nothing mastered)', () => {
    const progress = rollUpProgress([
      evidence({
        capabilityId: 'r1', sourceRef: 'affixed_form_pairs/x',
        capabilityType: 'recognise_meaning_from_text_cap',
        reviewCount: 5, stability: 20, lastReviewedAt: recent,
      }),
      evidence({
        capabilityId: 'p1', sourceRef: 'affixed_form_pairs/x',
        capabilityType: 'produce_derived_form_cap',
        reviewCount: 0,
      }),
    ], now)
    expect(progress.recognition.totalCount).toBe(1)
    expect(progress.recognition.masteredCount).toBe(1)
    expect(progress.production.totalCount).toBe(1)
    expect(progress.production.masteredCount).toBe(0) // honest 0%, tier exists
  })

  it('leaves production.totalCount at 0 when no production cap exists for the affix yet', () => {
    const progress = rollUpProgress([
      evidence({ capabilityId: 'r1', sourceRef: 'affixed_form_pairs/x', capabilityType: 'recognise_word_form_link_cap' }),
    ], now)
    expect(progress.production.totalCount).toBe(0)
    expect(progress.production.masteredCount).toBe(0)
  })

  it('keeps the overall label weakest-wins across BOTH classes, unaffected by the per-class split', () => {
    const progress = rollUpProgress([
      evidence({
        capabilityId: 'r1', sourceRef: 'affixed_form_pairs/x',
        capabilityType: 'recognise_meaning_from_text_cap',
        reviewCount: 5, stability: 20, lastReviewedAt: recent,
      }),
      evidence({
        capabilityId: 'p1', sourceRef: 'affixed_form_pairs/x',
        capabilityType: 'produce_derived_form_cap',
        reviewCount: 0,
      }),
    ], now)
    // Same derivation (one source_ref), weakest-wins across both caps: mastered
    // recognition + introduced production → the derivation's headline rung is
    // 'introduced' — the new class split is purely additive, it does not change
    // the existing weakest-wins invariant.
    expect(progress.label).toBe('introduced')
    expect(progress.totalCount).toBe(1)
  })
})

describe('buildAffixDetail', () => {
  it('returns null for an affix that is not a catalog member', () => {
    expect(buildAffixDetail(fixture(), 'not-an-affix', 'nl', now)).toBeNull()
  })

  it('builds the rule card from catalog metadata + the introducing lesson/pattern', () => {
    const detail = buildAffixDetail(fixture(), 'meN-', 'nl', now)!
    expect(detail.allomorphClasses).toEqual(['me', 'mem', 'men', 'meny', 'meng', 'menge'])
    expect(detail.ruleNote).toContain('mengajar')
    expect(detail.rule.lessonNumber).toBe(9)
    expect(detail.rule.patternName).toBe('Het voorvoegsel meN-')
    expect(detail.examples.length).toBeGreaterThan(0)
    expect(detail.cefrLevel).toBe('A2')
  })

  it('resolves the introducing lesson\'s raw grammar-podcast paths onto rule.podcastNl/En (Change 2)', () => {
    // meN-'s representative cap is on L9, which carries both paths in the fixture.
    const detail = buildAffixDetail(fixture(), 'meN-', 'nl', now)!
    expect(detail.rule.podcastNl).toBe('lessons/9/grammar-nl.mp3')
    expect(detail.rule.podcastEn).toBe('lessons/9/grammar-en.mp3')
  })

  it('resolves podcastNl/En to null when the introducing lesson has no podcast', () => {
    // peN-'s only cap is on L20, absent from lessonPodcastById entirely.
    const detail = buildAffixDetail(fixture(), 'peN-', 'nl', now)!
    expect(detail.rule.podcastNl).toBeNull()
    expect(detail.rule.podcastEn).toBeNull()
  })

  it('explores full cross-affix families, status-marked, with productive flags', () => {
    const detail = buildAffixDetail(fixture(), 'meN-', 'nl', now)!
    const ajar = detail.families.find(f => f.rootText === 'ajar')!
    // ajar leads the meN- page but shows its whole family: mengajar (meN-),
    // belajar (ber-), pengajar (peN-). The null-affix row is excluded.
    const forms = ajar.forms.map(f => f.derivedText)
    expect(forms).toEqual(expect.arrayContaining(['mengajar', 'belajar', 'pengajar']))
    expect(forms).not.toContain('mengajarkan')
    expect(ajar.rootMeaning).toBe('onderwijzen')
    expect(ajar.rootKnown).toBe(true)
    const pengajar = ajar.forms.find(f => f.derivedText === 'pengajar')!
    expect(pengajar.productive).toBe(false) // lexicalised — "vocab, not rule-formed"
    const mengajar = ajar.forms.find(f => f.derivedText === 'mengajar')!
    expect(mengajar.label).toBe('mastered')
  })

  it('flags an unknown root and uses the user language for the gloss', () => {
    const detail = buildAffixDetail(fixture(), 'meN-', 'en', now)!
    const tulis = detail.families.find(f => f.rootText === 'tulis')!
    expect(tulis.rootKnown).toBe(false) // item exists but no solid recognition cap
    expect(tulis.rootMeaning).toBe('to write')
  })

  it('language-selects the rule gloss on the detail view (bilingual)', () => {
    expect(buildAffixDetail(fixture(), 'di-', 'nl', now)!.gloss).toMatch(/lijdende|passieve/i)
    expect(buildAffixDetail(fixture(), 'di-', 'en', now)!.gloss).toMatch(/passive/i)
  })

  it('does NOT cross-language-fall-back the root meaning (no English leak in NL)', () => {
    const snap = fixture()
    // tulis loses its EN meaning: an EN UI must show null, never the Dutch 'schrijven'.
    snap.rootItemsBySlug.set('tulis', { normalizedText: 'tulis', baseText: 'tulis', meaningNl: 'schrijven', meaningEn: null })
    const tulis = buildAffixDetail(snap, 'meN-', 'en', now)!.families.find(f => f.rootText === 'tulis')!
    expect(tulis.rootMeaning).toBeNull()
  })

  it('language-selects the derived-form meaning on examples + family forms (Fix 3)', () => {
    const nl = buildAffixDetail(fixture(), 'meN-', 'nl', now)!
    const nlEx = nl.examples.find(e => e.derivedText === 'mengajar')!
    expect(nlEx.derivedMeaning).toBe('lesgeven')
    const nlForm = nl.families.find(f => f.rootText === 'ajar')!.forms.find(f => f.derivedText === 'mengajar')!
    expect(nlForm.derivedMeaning).toBe('lesgeven')

    const en = buildAffixDetail(fixture(), 'meN-', 'en', now)!
    expect(en.examples.find(e => e.derivedText === 'mengajar')!.derivedMeaning).toBe('to teach')

    // Un-glossed pair → null, never a stale fallback.
    const nlForms = nl.families.find(f => f.rootText === 'tulis')!.forms.find(f => f.derivedText === 'menulis')!
    expect(nlForms.derivedMeaning).toBeNull()
  })

  it('does NOT cross-language-fall-back the derived meaning (no EN leak in NL)', () => {
    const snap = fixture()
    // mengajar loses its EN gloss: an EN UI must show null, never the Dutch 'lesgeven'.
    const p = snap.pairs.find(x => x.derivedText === 'mengajar')!
    p.derivedGlossEn = null
    const ex = buildAffixDetail(snap, 'meN-', 'en', now)!.examples.find(e => e.derivedText === 'mengajar')!
    expect(ex.derivedMeaning).toBeNull()
  })

  it('exposes only ready+published source_refs for the practice scope', () => {
    const detail = buildAffixDetail(fixture(), 'meN-', 'nl', now)!
    expect(detail.practiceSourceRefs.sort()).toEqual([
      'affixed_form_pairs/men-ajar',
      'affixed_form_pairs/men-tulis',
    ])
  })

  it('dedupes rule-card examples by derived form (the live table holds exact-duplicate pairs)', () => {
    const snap = fixture()
    // A second, exact-duplicate meN- pair for mengajar — as affixed_form_pairs
    // currently does for many forms (e.g. berdua under ber-). The rule examples
    // must still list mengajar ONCE, mirroring the word-family dedup.
    snap.pairs = [
      ...snap.pairs,
      pair({ capabilityId: 'cap-men-ajar-dup', rootText: 'ajar', derivedText: 'mengajar', affix: 'meN-' }),
    ]
    snap.pairCapsById.set('cap-men-ajar-dup', cap({ id: 'cap-men-ajar-dup', sourceRef: 'affixed_form_pairs/men-ajar-dup', lessonId: L9 }))
    const derived = buildAffixDetail(snap, 'meN-', 'nl', now)!.examples.map(e => e.derivedText)
    expect(derived.filter(d => d === 'mengajar')).toHaveLength(1)
    expect(new Set(derived).size).toBe(derived.length)
  })
})

describe('buildWordFamiliesForAffix — rootIntroLessonNumber (Change 3)', () => {
  it('sets the lowest introducing-lesson number for a known-but-unlearned root', () => {
    // tulis has a vocab cap on L13 (order 13) but no mastered state.
    const families = buildWordFamiliesForAffix(fixture(), 'meN-', 'nl', now)
    const tulis = families.find(f => f.rootText === 'tulis')!
    expect(tulis.rootKnown).toBe(false)
    expect(tulis.rootIntroLessonNumber).toBe(13)
  })

  it('is null for a genuinely out-of-course root with no vocab cap at all', () => {
    const families = buildWordFamiliesForAffix(fixture(), 'ber-', 'nl', now)
    const aman = families.find(f => f.rootText === 'aman')!
    expect(aman.rootIntroLessonNumber).toBeNull()
  })

  it('is null (never the hidden lesson\'s order_index) for a root whose only vocab cap sits on a hidden lesson — the Les-999 trap', () => {
    // makan's only rootCaps entry is on L_HIDDEN, which lessonOrderById never
    // carries (mirrors the adapter excluding is_hidden rows) — must not fall
    // back to that lesson's order_index.
    const families = buildWordFamiliesForAffix(fixture(), 'ber-', 'nl', now)
    const makan = families.find(f => f.rootText === 'makan')!
    expect(makan.rootIntroLessonNumber).toBeNull()
  })
})

describe('practice launch', () => {
  it('builds the scoped-session route with the affix in the URL', () => {
    expect(affixPracticePath('meN-')).toBe('/session?mode=affix_practice&affix=meN-')
    expect(AFFIX_SESSION_MODE).toBe('affix_practice')
  })

  it('affixScopeFromSnapshot mirrors the ready+published source_refs', () => {
    expect(affixScopeFromSnapshot(fixture(), 'meN-').sort()).toEqual([
      'affixed_form_pairs/men-ajar',
      'affixed_form_pairs/men-tulis',
    ])
    expect(affixScopeFromSnapshot(fixture(), '-i')).toEqual([])
  })
})
