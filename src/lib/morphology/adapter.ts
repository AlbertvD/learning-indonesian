// lib/morphology I/O seam. Hides the `indonesian` schema, the snake_case columns,
// the multi-table fan-out (affixed_form_pairs → their caps + states + lessons +
// grammar rule + the root-vocab join), and the affix-scope resolver. The only
// impure file in the module — catalog/family/practice are pure over the snapshot.
//
// NOT a thin wrapper: it assembles the raw morphology snapshot the pure folders
// fold into views, and resolves an affix label → its scoped-session source_refs.

import { supabase } from '@/lib/supabase'
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

export interface MorphologySnapshot {
  pairs: MorphologyPairRow[]
  /** Caps that back the affixed pairs, keyed by capability_id. */
  pairCapsById: Map<string, MorphologyCapRow>
  /** vocabulary_src caps for the roots (for the root-known signal). */
  rootCaps: MorphologyCapRow[]
  statesByCapId: Map<string, MorphologyStateRow>
  lessonOrderById: Map<string, number>
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
      'capability_id, root_text, derived_text, affix, affix_type, affix_gloss, allomorph_class, allomorph_rule, productive, carrier_text, grammar_pattern_id',
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
    lessonOrderById,
    activatedLessonIds,
    patternsById,
    rootItemsBySlug,
    rootCapResult,
  ] = await Promise.all([
    fetchCaps(db, 'id', pairCapIds),
    fetchStates(db, userId, pairCapIds),
    fetchLessonOrder(db),
    listActivatedLessons(userId, client),
    fetchPatterns(db, patternIds),
    fetchRootItems(db, rootSlugs),
    fetchRootCaps(db, rootSlugs),
  ])

  // Root-cap states (vocabulary_src caps for the roots) for the root-known signal.
  const rootStates = await fetchStates(db, userId, rootCapResult.map((c) => c.id))

  const statesByCapId = new Map<string, MorphologyStateRow>()
  for (const s of [...pairStates, ...rootStates]) statesByCapId.set(s.capabilityId, s)

  return {
    pairs,
    pairCapsById: new Map(pairCaps.map((c) => [c.id, c])),
    rootCaps: rootCapResult,
    statesByCapId,
    lessonOrderById,
    activatedLessonIds,
    patternsById,
    rootItemsBySlug,
  }
}

async function fetchCaps(
  db: () => { from(table: string): any },
  column: 'id',
  ids: string[],
): Promise<MorphologyCapRow[]> {
  if (ids.length === 0) return []
  const { data, error } = await db()
    .from('learning_capabilities')
    .select(CAP_COLUMNS)
    .in(column, ids)
    .is('retired_at', null)
  if (error) throw error
  return ((data ?? []) as RawCapRow[]).map(decodeCap)
}

async function fetchRootCaps(
  db: () => { from(table: string): any },
  rootSlugs: string[],
): Promise<MorphologyCapRow[]> {
  if (rootSlugs.length === 0) return []
  const sourceRefs = rootSlugs.map((slug) => `learning_items/${slug}`)
  const { data, error } = await db()
    .from('learning_capabilities')
    .select(CAP_COLUMNS)
    .eq('source_kind', 'vocabulary_src')
    .in('source_ref', sourceRefs)
    .is('retired_at', null)
  if (error) throw error
  return ((data ?? []) as RawCapRow[]).map(decodeCap)
}

async function fetchStates(
  db: () => { from(table: string): any },
  userId: string,
  capabilityIds: string[],
): Promise<MorphologyStateRow[]> {
  if (capabilityIds.length === 0) return []
  const { data, error } = await db()
    .from('learner_capability_state')
    .select('capability_id, review_count, lapse_count, consecutive_failure_count, stability, last_reviewed_at')
    .eq('user_id', userId)
    .in('capability_id', capabilityIds)
  if (error) throw error
  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    capabilityId: row.capability_id as string,
    reviewCount: (row.review_count as number | null) ?? 0,
    lapseCount: (row.lapse_count as number | null) ?? 0,
    consecutiveFailureCount: (row.consecutive_failure_count as number | null) ?? 0,
    stability: (row.stability as number | null) ?? null,
    lastReviewedAt: (row.last_reviewed_at as string | null) ?? null,
  }))
}

async function fetchLessonOrder(
  db: () => { from(table: string): any },
): Promise<Map<string, number>> {
  const { data, error } = await db().from('lessons').select('id, order_index')
  if (error) throw error
  return new Map(((data ?? []) as Array<{ id: string; order_index: number }>).map((l) => [l.id, l.order_index]))
}

async function fetchPatterns(
  db: () => { from(table: string): any },
  patternIds: string[],
): Promise<Map<string, PatternInfo>> {
  if (patternIds.length === 0) return new Map()
  const { data, error } = await db()
    .from('grammar_patterns')
    .select('id, slug, name, short_explanation')
    .in('id', patternIds)
  if (error) throw error
  return new Map(
    ((data ?? []) as Array<{ id: string; slug: string; name: string; short_explanation: string }>).map((p) => [
      p.id,
      { slug: p.slug, name: p.name, shortExplanation: p.short_explanation ?? '' },
    ]),
  )
}

async function fetchRootItems(
  db: () => { from(table: string): any },
  rootSlugs: string[],
): Promise<Map<string, RootItem>> {
  if (rootSlugs.length === 0) return new Map()
  const { data, error } = await db()
    .from('learning_items')
    .select('normalized_text, base_text, translation_nl, translation_en')
    .in('normalized_text', rootSlugs)
  if (error) throw error
  return new Map(
    ((data ?? []) as Array<{ normalized_text: string; base_text: string; translation_nl: string | null; translation_en: string | null }>).map(
      (r) => [
        r.normalized_text,
        { normalizedText: r.normalized_text, baseText: r.base_text, meaningNl: r.translation_nl, meaningEn: r.translation_en },
      ],
    ),
  )
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
