// lib/morphology I/O seam. Hides the `indonesian` schema, the snake_case columns,
// the multi-table fan-out (affixed_form_pairs → their caps + states + lessons +
// grammar rule + the root-vocab join), and the affix-scope resolver. The only
// impure file in the module — catalog/family/practice are pure over the snapshot.
//
// NOT a thin wrapper: it assembles the raw morphology snapshot the pure folders
// fold into views, and resolves an affix label → its scoped-session source_refs.

import { supabase } from '@/lib/supabase'
import { chunkedIn } from '@/lib/chunkedQuery'
import { itemSlug } from '@/lib/capabilities'
import type {
  CapabilitySourceKind,
  CapabilityType,
  CapabilityModality,
} from '@/lib/capabilities'
import { listActivatedLessons } from '@/lib/lessons'
import { logError } from '@/lib/logger'
import type { AffixType } from './model'

// Read-only client shape (mirrors lessons/collections adapters). The PostgREST
// builder is a thenable after a terminal `.eq`/`.in`; `any` keeps narrow mocks
// usable in tests.
export interface MorphologyReadClient {
  schema(schema: 'indonesian'): { from(table: string): any }
}

// ── Raw snapshot shapes ──────────────────────────────────────────────────────

export interface MorphologyPairRow {
  capabilityId: string
  rootText: string
  derivedText: string
  affix: string | null
  affixType: AffixType
  affixGloss: string | null
  allomorphClass: string | null
  allomorphRule: string
  productive: boolean
  carrierText: string | null
  /** Bilingual derived-form meaning (Fix 3; family.ts language-resolves these). */
  derivedGlossNl: string | null
  derivedGlossEn: string | null
  grammarPatternId: string | null
}

export interface MorphologyCapRow {
  id: string
  canonicalKey: string
  sourceKind: CapabilitySourceKind
  sourceRef: string
  capabilityType: CapabilityType
  modality: CapabilityModality
  readinessStatus: string
  publicationStatus: string
  lessonId: string | null
}

export interface MorphologyStateRow {
  capabilityId: string
  reviewCount: number
  lapseCount: number
  consecutiveFailureCount: number
  stability: number | null
  lastReviewedAt: string | null
}

export interface RootItem {
  normalizedText: string
  baseText: string
  meaningNl: string | null
  meaningEn: string | null
}

export interface PatternInfo {
  slug: string
  name: string
  shortExplanation: string
}

/** A lesson's two grammar-podcast bucket paths (storage keys, NOT playable
 *  URLs — resolve with lessonService.getAudioUrl() at the UI edge). Either may
 *  be null (a lesson can have one language before the other). */
export interface LessonPodcastPaths {
  nl: string | null
  en: string | null
}

export interface MorphologySnapshot {
  pairs: MorphologyPairRow[]
  /** Caps that back the affixed pairs, keyed by capability_id. */
  pairCapsById: Map<string, MorphologyCapRow>
  /** vocabulary_src caps for the roots (for the root-known signal). */
  rootCaps: MorphologyCapRow[]
  statesByCapId: Map<string, MorphologyStateRow>
  /** Non-hidden lessons only (order_index) — see fetchLessons. A root/affix
   *  whose only caps sit on a hidden system lesson (e.g. the "Common Words"
   *  bucket, order_index=999) resolves to no entry here, not that lesson's
   *  order_index. */
  lessonOrderById: Map<string, number>
  /** ALL lessons (hidden included) keyed by id → its grammar-podcast paths. */
  lessonPodcastById: Map<string, LessonPodcastPaths>
  activatedLessonIds: ReadonlySet<string>
  patternsById: Map<string, PatternInfo>
  /** Root vocabulary rows keyed by itemSlug(root_text). */
  rootItemsBySlug: Map<string, RootItem>
}

// ── Row decoders (snake → camel, defensive) ──────────────────────────────────

const AFFIX_TYPES = new Set<AffixType>(['prefix', 'suffix', 'confix', 'reduplication'])

function toAffixType(value: unknown): AffixType {
  return AFFIX_TYPES.has(value as AffixType) ? (value as AffixType) : 'prefix'
}

interface RawCapRow {
  id: string
  canonical_key: string
  source_kind: CapabilitySourceKind
  source_ref: string
  capability_type: CapabilityType
  modality: CapabilityModality
  readiness_status: string
  publication_status: string
  lesson_id: string | null
}

function decodeCap(row: RawCapRow): MorphologyCapRow {
  return {
    id: row.id,
    canonicalKey: row.canonical_key,
    sourceKind: row.source_kind,
    sourceRef: row.source_ref,
    capabilityType: row.capability_type,
    modality: row.modality,
    readinessStatus: row.readiness_status,
    publicationStatus: row.publication_status,
    lessonId: row.lesson_id,
  }
}

const CAP_COLUMNS =
  'id, canonical_key, source_kind, source_ref, capability_type, modality, readiness_status, publication_status, lesson_id'

// ── Snapshot loader ──────────────────────────────────────────────────────────

/**
 * Load everything the trainer needs in one fan-out. Bounded reads (the affixed
 * pairs are content, a few hundred at full rollout). Throws on a hard query error
 * so the caller can surface a friendly notification + logError (CLAUDE.md error
 * handling); empty results are valid (content-thin) and return an empty snapshot.
 */
export async function loadMorphologySnapshot(
  userId: string,
  client: MorphologyReadClient = supabase,
): Promise<MorphologySnapshot> {
  const db = () => client.schema('indonesian')

  const { data: pairData, error: pairError } = await db()
    .from('affixed_form_pairs')
    .select(
      'capability_id, root_text, derived_text, affix, affix_type, affix_gloss, allomorph_class, allomorph_rule, productive, carrier_text, derived_gloss_nl, derived_gloss_en, grammar_pattern_id',
    )
  if (pairError) throw pairError

  const pairs: MorphologyPairRow[] = ((pairData ?? []) as Array<Record<string, unknown>>).map(
    (row) => ({
      capabilityId: row.capability_id as string,
      rootText: row.root_text as string,
      derivedText: row.derived_text as string,
      affix: (row.affix as string | null) ?? null,
      affixType: toAffixType(row.affix_type),
      affixGloss: (row.affix_gloss as string | null) ?? null,
      allomorphClass: (row.allomorph_class as string | null) ?? null,
      allomorphRule: (row.allomorph_rule as string) ?? '',
      productive: Boolean(row.productive),
      carrierText: (row.carrier_text as string | null) ?? null,
      derivedGlossNl: (row.derived_gloss_nl as string | null) ?? null,
      derivedGlossEn: (row.derived_gloss_en as string | null) ?? null,
      grammarPatternId: (row.grammar_pattern_id as string | null) ?? null,
    }),
  )

  const pairCapIds = [...new Set(pairs.map((p) => p.capabilityId))]
  const patternIds = [...new Set(pairs.map((p) => p.grammarPatternId).filter((id): id is string => Boolean(id)))]
  const rootSlugs = [...new Set(pairs.map((p) => itemSlug(p.rootText)))]

  // Caps backing the pairs + their learner state, lesson order, activation,
  // grammar rule, root vocabulary rows, and the root caps for the root-known
  // signal — run concurrently; each is independent.
  const [
    pairCaps,
    pairStates,
    { lessonOrderById, lessonPodcastById },
    activatedLessonIds,
    patternsById,
    rootItemsBySlug,
    rootCapResult,
  ] = await Promise.all([
    fetchCapsById(client, pairCapIds),
    fetchStates(client, userId, pairCapIds),
    fetchLessons(db),
    listActivatedLessons(userId, client),
    fetchPatterns(client, patternIds),
    fetchRootItems(client, rootSlugs),
    fetchRootCaps(client, rootSlugs),
  ])

  // Root-cap states (vocabulary_src caps for the roots) for the root-known signal.
  const rootStates = await fetchStates(client, userId, rootCapResult.map((c) => c.id))

  const statesByCapId = new Map<string, MorphologyStateRow>()
  for (const s of [...pairStates, ...rootStates]) statesByCapId.set(s.capabilityId, s)

  return {
    pairs,
    pairCapsById: new Map(pairCaps.map((c) => [c.id, c])),
    rootCaps: rootCapResult,
    statesByCapId,
    lessonOrderById,
    lessonPodcastById,
    activatedLessonIds,
    patternsById,
    rootItemsBySlug,
  }
}

// All the `.in(...)` reads below go through chunkedIn (CHUNK_SIZE 50) — an
// un-chunked `.in()` with many UUIDs blows Kong's request-URL length limit and
// returns "invalid response from upstream server" (the same bug class
// masteryModel.ts solved; observed live at 126 affixed-pair caps, 2026-06-20).

async function fetchCapsById(
  client: MorphologyReadClient,
  ids: string[],
): Promise<MorphologyCapRow[]> {
  const rows = await chunkedIn<RawCapRow>(
    'learning_capabilities',
    'id',
    ids,
    (b) => b.select(CAP_COLUMNS).is('retired_at', null),
    client,
  )
  return rows.map(decodeCap)
}

async function fetchRootCaps(
  client: MorphologyReadClient,
  rootSlugs: string[],
): Promise<MorphologyCapRow[]> {
  const sourceRefs = rootSlugs.map((slug) => `learning_items/${slug}`)
  const rows = await chunkedIn<RawCapRow>(
    'learning_capabilities',
    'source_ref',
    sourceRefs,
    (b) => b.select(CAP_COLUMNS).eq('source_kind', 'vocabulary_src').is('retired_at', null),
    client,
  )
  return rows.map(decodeCap)
}

async function fetchStates(
  client: MorphologyReadClient,
  userId: string,
  capabilityIds: string[],
): Promise<MorphologyStateRow[]> {
  const rows = await chunkedIn<Record<string, unknown>>(
    'learner_capability_state',
    'capability_id',
    capabilityIds,
    (b) => b
      .select('capability_id, review_count, lapse_count, consecutive_failure_count, stability, last_reviewed_at')
      .eq('user_id', userId),
    client,
  )
  return rows.map((row) => ({
    capabilityId: row.capability_id as string,
    reviewCount: (row.review_count as number | null) ?? 0,
    lapseCount: (row.lapse_count as number | null) ?? 0,
    consecutiveFailureCount: (row.consecutive_failure_count as number | null) ?? 0,
    stability: (row.stability as number | null) ?? null,
    lastReviewedAt: (row.last_reviewed_at as string | null) ?? null,
  }))
}

/**
 * Non-hidden lessons feed lessonOrderById (an affix/root's introducing-lesson
 * number must never resolve to a hidden system lesson's order_index — the
 * "Les 999" trap, see MorphologySnapshot doc). ALL lessons (hidden included)
 * feed lessonPodcastById: the affix rule card resolves its podcast via the
 * representative cap's own lesson, which is always a real chapter in
 * practice (verified live 2026-07-10 — no affix's introducing lesson is the
 * hidden row), so podcast lookup needs no such exclusion.
 */
async function fetchLessons(
  db: () => { from(table: string): any },
): Promise<{ lessonOrderById: Map<string, number>; lessonPodcastById: Map<string, LessonPodcastPaths> }> {
  const { data, error } = await db()
    .from('lessons')
    .select('id, order_index, is_hidden, audio_path, audio_path_en')
  if (error) throw error
  const rows = (data ?? []) as Array<{
    id: string
    order_index: number
    is_hidden: boolean | null
    audio_path: string | null
    audio_path_en: string | null
  }>
  const lessonOrderById = new Map<string, number>()
  const lessonPodcastById = new Map<string, LessonPodcastPaths>()
  for (const row of rows) {
    if (row.is_hidden !== true) lessonOrderById.set(row.id, row.order_index)
    lessonPodcastById.set(row.id, { nl: row.audio_path ?? null, en: row.audio_path_en ?? null })
  }
  return { lessonOrderById, lessonPodcastById }
}

async function fetchPatterns(
  client: MorphologyReadClient,
  patternIds: string[],
): Promise<Map<string, PatternInfo>> {
  const rows = await chunkedIn<{ id: string; slug: string; name: string; short_explanation: string }>(
    'grammar_patterns',
    'id',
    patternIds,
    (b) => b.select('id, slug, name, short_explanation'),
    client,
  )
  return new Map(rows.map((p) => [p.id, { slug: p.slug, name: p.name, shortExplanation: p.short_explanation ?? '' }]))
}

async function fetchRootItems(
  client: MorphologyReadClient,
  rootSlugs: string[],
): Promise<Map<string, RootItem>> {
  const rows = await chunkedIn<{ normalized_text: string; base_text: string; translation_nl: string | null; translation_en: string | null }>(
    'learning_items',
    'normalized_text',
    rootSlugs,
    (b) => b.select('normalized_text, base_text, translation_nl, translation_en'),
    client,
  )
  return new Map(rows.map((r) => [
    r.normalized_text,
    { normalizedText: r.normalized_text, baseText: r.base_text, meaningNl: r.translation_nl, meaningEn: r.translation_en },
  ]))
}

/**
 * Resolve an affix label → its scoped-session source_refs (capstone item F′).
 * Mirrors loadSelectedLessonScope (Session.tsx): the Session page calls this for
 * mode=affix_practice and feeds the result to buildSession. Returns null when the
 * affix has no ready+published caps (the page shows a friendly empty state).
 *
 * `affix` is nullable on the projection table; we filter by the requested label
 * (never null) so a null-affix row can never leak into a scope.
 */
export async function loadSelectedAffixScope(
  affix: string | null,
  client: MorphologyReadClient = supabase,
): Promise<{ selectedSourceRefs: string[] } | null> {
  if (!affix) return null
  try {
    const { data, error } = await client
      .schema('indonesian')
      .from('affixed_form_pairs')
      .select('learning_capabilities!inner(source_ref, readiness_status, publication_status)')
      .eq('affix', affix)
    if (error) throw error
    const refs = new Set<string>()
    for (const row of (data ?? []) as Array<{ learning_capabilities: { source_ref: string; readiness_status: string; publication_status: string } | null }>) {
      const cap = row.learning_capabilities
      if (cap && cap.readiness_status === 'ready' && cap.publication_status === 'published') {
        refs.add(cap.source_ref)
      }
    }
    if (refs.size === 0) return null
    return { selectedSourceRefs: [...refs] }
  } catch (err) {
    logError({ page: 'session', action: 'loadSelectedAffixScope', error: err })
    return null
  }
}
