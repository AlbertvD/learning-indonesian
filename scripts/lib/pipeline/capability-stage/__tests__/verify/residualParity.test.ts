/**
 * residualParity.test.ts — Task 5a.6: Parity gate for DB-native residual output.
 *
 * Verifies that `compareResidualParity` correctly:
 *   1. Reports `parity: true` when the only deltas are the two ALLOWED kinds.
 *   2. Classifies sentence/dialogue item unit omissions as ALLOWED.
 *   3. Classifies grammar unit re-keys (curated-slug → l{N}-…) as ALLOWED.
 *   4. (N1) Asserts DB-native contains NO grammar unit in the old curated-slug form.
 *   5. (arch #3) Asserts affixed cap sourceRef is byte-equal to TypedAffixedPair.source_ref.
 *   6. Negative control: a perturbed surface (flipped word-item slug or dropped audio cap)
 *      appears in unexpectedDeltas with parity: false.
 *
 * Fixture design:
 *   - LESSON_NUMBER = 5 (arbitrary, distinct from other tests)
 *   - Word item "makan" (vocabulary) + phrase item "apa kabar" (dialogue): exercises
 *     byte-identical word/phrase content_units + audio caps (seeded in audio map).
 *   - Sentence item "Saya tidak ada": exercises the sentence_dialogue_item_omitted ALLOWED delta.
 *   - Grammar categories:
 *       CAT_VERBOSE: 'Bukan — ontkenning van zelfstandig naamwoorden' (verbose, non-pre-slugified)
 *         → staging slug = 'bukan-ontkenning-van-zelfstandig-naamwoorden' (stableSlug of the
 *           curated pattern.slug, which itself is already this)
 *         → DB slug = 'l5-bukan-ontkenning-van-zelfstandig-naamwoorden' (lesson-prefixed)
 *       CAT_COLLIDE_A + CAT_COLLIDE_B: both title-slug to 'omschrijving' so DB-native
 *         applies the display_order tie-break: 'l5-omschrijving-0' and 'l5-omschrijving-1'.
 *         This exercises the collision path and proves DB-native slug is the disambiguation form.
 *   - Affixed pair: exercises byte-identical affixed content_units + affixed caps; also
 *     asserts the arch #3 invariant (cap.sourceRef == pair.source_ref).
 */

import { describe, it, expect } from 'vitest'

import {
  buildContentUnitsFromStaging,
  buildCapabilityStagingFromContent,
  type StagingLessonInput,

} from '../../../../content-pipeline-output'

import { buildContentUnitsFromDb } from '../../projectors/contentUnits'
import { projectAffixedCapabilities } from '../../projectors/affixedCapabilities'
import { projectItemsFromTypedRows } from '../../projectors/vocab'
import { projectPatternsFromCategories } from '../../projectors/grammar'
import { compareResidualParity } from '../../verify/residualParity'

import { sourceRefForLearningItem } from '../../../../content-pipeline-output'
import { normalizeTtsText } from '../../../../tts-normalize'

import type { LoadedLessonSection } from '../../loader'
import type { TypedItemRow, TypedGrammarCategory, TypedAffixedPair } from '../../loadFromDb'
import type { CapabilityInput } from '../../adapter'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const LESSON_NUMBER = 5
const LESSON_ID = 'lesson-uuid-5'

// ---------------------------------------------------------------------------
// Staging fixture (StagingLessonInput shape)
// ---------------------------------------------------------------------------

/**
 * NOTE on staging grammar slugs:
 * `buildCapabilityStagingFromContent` uses `grammarSourceRef(lessonNumber, slug)` which calls
 * `stableSlug(pattern.slug)`. So for staging, `pattern.slug` IS the curated slug.
 *
 * For CAT_VERBOSE, staging uses slug 'bukan-ontkenning-van-zelfstandig-naamwoorden' (pre-slugified
 * from the verbose title). The staging builder runs stableSlug on it → same string.
 * The DB builder uses l5-<stableSlug(title)> which = l5-bukan-ontkenning-van-zelfstandig-naamwoorden.
 *
 * For CAT_COLLIDE_A and CAT_COLLIDE_B: both title-slug to 'omschrijving'. Staging slugs are
 * 'omschrijving-a' and 'omschrijving-b' (pre-slugified, kept distinct). DB slugs after collision
 * tie-break: 'l5-omschrijving' x2 → disambiguated to 'l5-omschrijving-0' and 'l5-omschrijving-1'.
 */
const STAGING_INPUT: StagingLessonInput = {
  lessonNumber: LESSON_NUMBER,
  lessonId: LESSON_ID,
  lesson: {
    title: 'Test Lesson 5',
    level: 'A1',
    module_id: 'module-1',
    order_index: 4,
    sections: [
      {
        title: 'Woordenschat',
        order_index: 0,
        content: { type: 'vocabulary' },
      },
      {
        title: 'Dialoog',
        order_index: 1,
        content: { type: 'dialogue' },
      },
      {
        title: 'Grammatica',
        order_index: 2,
        content: { type: 'grammar' },
      },
      {
        title: 'Morfologie',
        order_index: 3,
        content: { type: 'morphology' },
      },
    ],
  },
  learningItems: [
    {
      base_text: 'makan',
      item_type: 'word',
      context_type: 'vocabulary_list',
      translation_nl: 'eten',
      translation_en: 'to eat',
      review_status: 'published',
    },
    {
      base_text: 'apa kabar',
      item_type: 'phrase',
      context_type: 'dialogue',
      translation_nl: 'hoe gaat het',
      translation_en: 'how are you',
      review_status: 'published',
    },
    {
      base_text: 'Saya tidak ada',
      item_type: 'sentence',
      context_type: 'vocabulary_list',
      translation_nl: 'Ik ben er niet',
      review_status: 'published',
    },
  ],
  grammarPatterns: [
    {
      // Verbose non-pre-slugified title maps to this curated slug
      slug: 'bukan-ontkenning-van-zelfstandig-naamwoorden',
      pattern_name: 'Bukan — ontkenning van zelfstandig naamwoorden',
      description: 'Use bukan before nouns to negate.',
      complexity_score: 1,
    },
    {
      // First collision: 'omschrijving-a' → stableSlug = 'omschrijving-a' (distinct from b)
      slug: 'omschrijving-a',
      pattern_name: 'Omschrijving A',
      description: 'First omschrijving pattern.',
      complexity_score: 1,
    },
    {
      // Second collision: 'omschrijving-b' → stableSlug = 'omschrijving-b' (distinct from a)
      slug: 'omschrijving-b',
      pattern_name: 'Omschrijving B',
      description: 'Second omschrijving pattern.',
      complexity_score: 1,
    },
  ],
  affixedFormPairs: [
    {
      id: 'meN-baca-membaca',
      root: 'baca',
      derived: 'membaca',
      allomorphRule: 'meN- + baca → membaca',
      sourceRef: `lesson-${LESSON_NUMBER}/morphology/men-baca-membaca`,
    },
  ],
}

// ---------------------------------------------------------------------------
// DB-native fixture shapes (equivalent data, typed DB shape)
// ---------------------------------------------------------------------------

const DB_SECTIONS: LoadedLessonSection[] = [
  { id: 'sec-uuid-0', title: 'Woordenschat', content: { type: 'vocabulary' }, order_index: 0 },
  { id: 'sec-uuid-1', title: 'Dialoog', content: { type: 'dialogue' }, order_index: 1 },
  { id: 'sec-uuid-2', title: 'Grammatica', content: { type: 'grammar' }, order_index: 2 },
  { id: 'sec-uuid-3', title: 'Morfologie', content: { type: 'morphology' }, order_index: 3 },
]

const DB_ITEM_ROWS: TypedItemRow[] = [
  {
    id: 'item-uuid-1',
    section_id: 'sec-uuid-0',
    lesson_id: LESSON_ID,
    display_order: 0,
    source_item_ref: 'makan',
    item_type: 'word',
    indonesian_text: 'makan',
    l1_translation: 'eten',
    l2_translation: 'to eat',
    section_kind: 'vocabulary',
  },
  {
    id: 'item-uuid-2',
    section_id: 'sec-uuid-1',
    lesson_id: LESSON_ID,
    display_order: 1,
    source_item_ref: 'apa kabar',
    item_type: 'phrase',
    indonesian_text: 'apa kabar',
    l1_translation: 'hoe gaat het',
    l2_translation: 'how are you',
    section_kind: 'dialogue',
  },
  // NOTE: no sentence row — sentence/dialogue_chunk items are excluded from
  // lesson_section_item_rows (TypedItemRow.item_type is 'word' | 'phrase' only).
  // The staging builder emits a unit for the sentence; DB-native does not.
]

/**
 * Grammar categories for the DB-native path.
 *
 * CAT_VERBOSE: title = 'Bukan — ontkenning van zelfstandig naamwoorden'
 *   → stableSlug(title) = 'bukan-ontkenning-van-zelfstandig-naamwoorden'
 *   → DB slug = 'l5-bukan-ontkenning-van-zelfstandig-naamwoorden'
 *   → Staging slug = 'bukan-ontkenning-van-zelfstandig-naamwoorden'  (curated; old form)
 *   → This is the grammar_rekey ALLOWED delta.
 *
 * CAT_COLLIDE_A + CAT_COLLIDE_B: both stableSlug(title) = 'omschrijving'
 *   → DB slugs: 'l5-omschrijving-0' (display_order=1) and 'l5-omschrijving-1' (display_order=2)
 *   → Staging slugs: 'omschrijving-a' and 'omschrijving-b' (distinct curated; old form)
 *   → Both are grammar_rekey ALLOWED deltas.
 *
 * display_order values MUST MATCH between grammar categories and staging grammarPatterns
 * position so the pairwise matching works: 0 = verbose, 1 = collision A, 2 = collision B.
 */
const DB_GRAMMAR_CATEGORIES: TypedGrammarCategory[] = [
  {
    id: 'cat-uuid-1',
    section_id: 'sec-uuid-2',
    lesson_id: LESSON_ID,
    display_order: 0,
    title: 'Bukan — ontkenning van zelfstandig naamwoorden',
    title_en: 'Bukan — negation of nouns',
    rules: ['Use bukan before nouns.'],
    rules_en: ['Use bukan before nouns.'],
    examples: [],
  },
  {
    id: 'cat-uuid-2',
    section_id: 'sec-uuid-2',
    lesson_id: LESSON_ID,
    display_order: 1,
    title: 'Omschrijving',   // stableSlug = 'omschrijving' — collides with cat-uuid-3
    title_en: 'Description A',
    rules: ['First omschrijving pattern.'],
    rules_en: [],
    examples: [],
  },
  {
    id: 'cat-uuid-3',
    section_id: 'sec-uuid-2',
    lesson_id: LESSON_ID,
    display_order: 2,
    title: 'Omschrijving',   // stableSlug = 'omschrijving' — collides with cat-uuid-2
    title_en: 'Description B',
    rules: ['Second omschrijving pattern.'],
    rules_en: [],
    examples: [],
  },
]

const DB_AFFIXED_PAIR: TypedAffixedPair = {
  id: 'pair-uuid-1',
  lesson_id: LESSON_ID,
  section_id: 'sec-uuid-3',
  source_ref: `lesson-${LESSON_NUMBER}/morphology/men-baca-membaca`,
  affix: 'meN-',
  root_text: 'baca',
  derived_text: 'membaca',
  allomorph_rule: 'meN- + baca → membaca',
}

// ---------------------------------------------------------------------------
// Audio map (seeded for word + phrase; not sentence)
// ---------------------------------------------------------------------------

const AUDIO_MAP = new Map([
  [normalizeTtsText('makan'), { storage_path: 'lessons/5/makan.mp3', voice_id: 'Achird' }],
  [normalizeTtsText('apa kabar'), { storage_path: 'lessons/5/apa-kabar.mp3', voice_id: 'Achird' }],
])

// ---------------------------------------------------------------------------
// Build staging outputs
// ---------------------------------------------------------------------------

function buildStagingOutputs() {
  const contentUnits = buildContentUnitsFromStaging(STAGING_INPUT)
  const plan = buildCapabilityStagingFromContent({
    ...STAGING_INPUT,
    contentUnits,
    audioClipsByNormalizedText: AUDIO_MAP,
  })
  const audioCaps = plan.capabilities.filter(
    (c) => c.capabilityType === 'audio_recognition' || c.capabilityType === 'dictation',
  )
  const affixedCaps = plan.capabilities.filter((c) => c.sourceKind === 'affixed_form_pair')
  return { contentUnits, audioCaps, affixedCaps }
}

// ---------------------------------------------------------------------------
// Build DB-native outputs
// ---------------------------------------------------------------------------

function buildDbNativeOutputs() {
  const { patternPlans } = projectPatternsFromCategories({
    categories: DB_GRAMMAR_CATEGORIES,
    lessonNumber: LESSON_NUMBER,
    lessonId: LESSON_ID,
  })

  const contentUnits = buildContentUnitsFromDb({
    lessonNumber: LESSON_NUMBER,
    sections: DB_SECTIONS,
    itemRows: DB_ITEM_ROWS,
    patternPlans,
    affixedPairs: [DB_AFFIXED_PAIR],
  })

  const affixedCaps = projectAffixedCapabilities({
    pairs: [DB_AFFIXED_PAIR],
    lessonId: LESSON_ID,
  })

  const { perItemPlans } = projectItemsFromTypedRows({
    rows: DB_ITEM_ROWS,
    lessonId: LESSON_ID,
    level: 'A1',
    audioClipsByNormalizedText: AUDIO_MAP,
  })
  const audioCaps: CapabilityInput[] = perItemPlans.flatMap((p) =>
    p.capabilities.filter(
      (c) => c.capabilityType === 'audio_recognition' || c.capabilityType === 'dictation',
    ),
  )

  return { contentUnits, affixedCaps, audioCaps, patternPlans }
}

// ---------------------------------------------------------------------------
// Sentence/dialogue source refs (from staging input)
// ---------------------------------------------------------------------------

function buildSentenceDialogueSourceRefs(): Set<string> {
  return new Set(
    STAGING_INPUT.learningItems
      .filter((i) => i.item_type === 'sentence' || i.item_type === 'dialogue_chunk')
      .map((i) => sourceRefForLearningItem(i.base_text)),
  )
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('compareResidualParity — residual parity gate (Task 5a.6)', () => {
  // =========================================================================
  // Assertion 1: parity: true with full fixture — only allowed deltas
  // =========================================================================
  it('returns parity: true and unexpectedDeltas: [] for the full fixture (only allowed deltas)', () => {
    const staging = buildStagingOutputs()
    const dbNative = buildDbNativeOutputs()
    const sentenceDialogueSourceRefs = buildSentenceDialogueSourceRefs()

    const result = compareResidualParity({
      staging: {
        contentUnits: staging.contentUnits,
        affixedCaps: staging.affixedCaps as CapabilityInput[],
        audioCaps: staging.audioCaps as CapabilityInput[],
      },
      dbNative: {
        contentUnits: dbNative.contentUnits,
        affixedCaps: dbNative.affixedCaps,
        audioCaps: dbNative.audioCaps,
      },
      sentenceDialogueItemSourceRefs: sentenceDialogueSourceRefs,
    })

    expect(result.parity).toBe(true)
    expect(result.unexpectedDeltas).toHaveLength(0)
  })

  // =========================================================================
  // Assertion 2: allowedDeltas contains BOTH expected kinds
  // =========================================================================
  it('allowedDeltas contains the sentence/dialogue omission AND grammar re-key deltas', () => {
    const staging = buildStagingOutputs()
    const dbNative = buildDbNativeOutputs()
    const sentenceDialogueSourceRefs = buildSentenceDialogueSourceRefs()

    const result = compareResidualParity({
      staging: {
        contentUnits: staging.contentUnits,
        affixedCaps: staging.affixedCaps as CapabilityInput[],
        audioCaps: staging.audioCaps as CapabilityInput[],
      },
      dbNative: {
        contentUnits: dbNative.contentUnits,
        affixedCaps: dbNative.affixedCaps,
        audioCaps: dbNative.audioCaps,
      },
      sentenceDialogueItemSourceRefs: sentenceDialogueSourceRefs,
    })

    // Sentence/dialogue omission — exercises the ALLOWED path is non-vacuous
    const sentenceOmissions = result.allowedDeltas.filter(
      (d) => d.kind === 'sentence_dialogue_item_omitted',
    )
    expect(sentenceOmissions.length).toBeGreaterThanOrEqual(1)
    // Verify the omission key matches the staging sentence item's source_ref
    const sentenceSourceRef = sourceRefForLearningItem('Saya tidak ada')
    const omittedKeys = sentenceOmissions.map((d) => d.key)
    // The key is the content_unit_key which includes the source_ref
    expect(omittedKeys.some((k) => k.includes(sentenceSourceRef))).toBe(true)

    // Grammar re-keys (one per grammar category = 3 re-keys: verbose + 2 collision)
    const grammarRekeys = result.allowedDeltas.filter((d) => d.kind === 'grammar_rekey')
    expect(grammarRekeys.length).toBeGreaterThanOrEqual(1)
    // All grammar re-keys must reference the old curated form in detail and new l{N} form
    for (const rekey of grammarRekeys) {
      expect(rekey.detail).toMatch(/curated-slug/)
      expect(rekey.detail).toMatch(/l\{N\}-/)
    }
  })

  // =========================================================================
  // Assertion 3 (N1): DB-native contains NO grammar unit in old curated-slug form
  // =========================================================================
  it('N1: DB-native grammar units all match /^pattern-l\\d+-/ — no old curated-slug form', () => {
    const dbNative = buildDbNativeOutputs()
    const grammarUnits = dbNative.contentUnits.filter((u) => u.unit_kind === 'grammar_pattern')

    expect(grammarUnits.length).toBeGreaterThan(0)

    for (const u of grammarUnits) {
      expect(u.unit_slug).toMatch(/^pattern-l\d+-/)
      // Negative: must NOT be old curated form (pattern-X where X doesn't start with l{N}-)
      expect(u.unit_slug).not.toMatch(/^pattern-(?!l\d+-)/)
    }
  })

  // =========================================================================
  // Assertion 4 (arch #3): DB-native affixed cap sourceRef == pair.source_ref (byte-equal)
  // =========================================================================
  it('arch #3: every DB-native affixed cap sourceRef is byte-equal to its TypedAffixedPair.source_ref', () => {
    const dbNative = buildDbNativeOutputs()

    expect(dbNative.affixedCaps.length).toBeGreaterThan(0)

    for (const cap of dbNative.affixedCaps) {
      // The only pair in the fixture is DB_AFFIXED_PAIR
      expect(cap.sourceRef).toBe(DB_AFFIXED_PAIR.source_ref)
    }
  })

  // =========================================================================
  // Assertion 5 (negative control): perturbing a byte-identical surface yields unexpectedDelta
  // =========================================================================
  describe('negative control — comparator catches real parity breaks', () => {
    it('detects an unexpected delta when a word-item unit_slug is flipped in DB-native', () => {
      const staging = buildStagingOutputs()
      const dbNative = buildDbNativeOutputs()
      const sentenceDialogueSourceRefs = buildSentenceDialogueSourceRefs()

      // Perturb: find the word-item 'makan' unit in DB-native and change its unit_slug
      const perturbedUnits = dbNative.contentUnits.map((u) => {
        if (u.unit_kind === 'learning_item' && u.unit_slug === 'item-makan') {
          return { ...u, unit_slug: 'item-PERTURBED', content_unit_key: u.content_unit_key + '-PERTURBED' }
        }
        return u
      })

      // Verify the perturbation actually changed something
      const hasPerturbedUnit = perturbedUnits.some((u) => u.unit_slug === 'item-PERTURBED')
      expect(hasPerturbedUnit).toBe(true)

      const result = compareResidualParity({
        staging: {
          contentUnits: staging.contentUnits,
          affixedCaps: staging.affixedCaps as CapabilityInput[],
          audioCaps: staging.audioCaps as CapabilityInput[],
        },
        dbNative: {
          contentUnits: perturbedUnits,
          affixedCaps: dbNative.affixedCaps,
          audioCaps: dbNative.audioCaps,
        },
        sentenceDialogueItemSourceRefs: sentenceDialogueSourceRefs,
      })

      expect(result.parity).toBe(false)
      expect(result.unexpectedDeltas.length).toBeGreaterThan(0)
      // The missing-in-db-native finding covers the original 'item-makan' unit
      const missingUnit = result.unexpectedDeltas.find((d) => d.kind === 'unit_missing_in_db_native')
      expect(missingUnit).toBeDefined()
    })

    it('detects an unexpected delta when an audio cap is dropped from DB-native', () => {
      const staging = buildStagingOutputs()
      const dbNative = buildDbNativeOutputs()
      const sentenceDialogueSourceRefs = buildSentenceDialogueSourceRefs()

      // Perturb: drop the first audio cap from DB-native
      expect(dbNative.audioCaps.length).toBeGreaterThan(0)
      const perturbedAudioCaps = dbNative.audioCaps.slice(1) // drop first

      const result = compareResidualParity({
        staging: {
          contentUnits: staging.contentUnits,
          affixedCaps: staging.affixedCaps as CapabilityInput[],
          audioCaps: staging.audioCaps as CapabilityInput[],
        },
        dbNative: {
          contentUnits: dbNative.contentUnits,
          affixedCaps: dbNative.affixedCaps,
          audioCaps: perturbedAudioCaps,
        },
        sentenceDialogueItemSourceRefs: sentenceDialogueSourceRefs,
      })

      expect(result.parity).toBe(false)
      expect(result.unexpectedDeltas.length).toBeGreaterThan(0)
      const missingCap = result.unexpectedDeltas.find((d) => d.kind === 'cap_missing_in_db_native')
      expect(missingCap).toBeDefined()
    })
  })

  // =========================================================================
  // Bonus: verify fixture is non-vacuous (exercises all expected delta paths)
  // =========================================================================
  it('fixture is non-vacuous: staging has audio caps (word+phrase get audio), DB-native matches', () => {
    const staging = buildStagingOutputs()
    const dbNative = buildDbNativeOutputs()

    // Both word 'makan' and phrase 'apa kabar' have audio → 2 items × 2 caps = 4 audio caps
    expect(staging.audioCaps.length).toBe(4)
    expect(dbNative.audioCaps.length).toBe(4)
  })

  it('fixture is non-vacuous: staging has affixed caps, DB-native matches', () => {
    const staging = buildStagingOutputs()
    const dbNative = buildDbNativeOutputs()

    // 1 affixed pair × 2 caps = 2
    expect(staging.affixedCaps.length).toBe(2)
    expect(dbNative.affixedCaps.length).toBe(2)
  })

  it('fixture is non-vacuous: staging has 3 grammar re-key deltas (verbose + 2 collision)', () => {
    const staging = buildStagingOutputs()
    const dbNative = buildDbNativeOutputs()
    const sentenceDialogueSourceRefs = buildSentenceDialogueSourceRefs()

    const result = compareResidualParity({
      staging: {
        contentUnits: staging.contentUnits,
        affixedCaps: staging.affixedCaps as CapabilityInput[],
        audioCaps: staging.audioCaps as CapabilityInput[],
      },
      dbNative: {
        contentUnits: dbNative.contentUnits,
        affixedCaps: dbNative.affixedCaps,
        audioCaps: dbNative.audioCaps,
      },
      sentenceDialogueItemSourceRefs: sentenceDialogueSourceRefs,
    })

    const grammarRekeys = result.allowedDeltas.filter((d) => d.kind === 'grammar_rekey')
    // 3 categories = 3 re-keys (verbose + collide-A + collide-B)
    expect(grammarRekeys).toHaveLength(3)
  })
})
