/**
 * runner.dialogueCutover.test.ts — Slice 3 Task 7 runner wiring for the dialogue
 * cloze path (DB→DB).
 *
 * Asserts the cutover:
 *   - dialogue_line:contextual_cloze caps come from the in-stage GENERATOR output
 *     (loadDialogueFromDb + fetchClozePool + generateClozeFn), NOT from
 *     staging.clozeContexts — even when staging HAS a (legacy) cloze context, no
 *     dialogue cap is minted from it (no double-write).
 *   - the dialogue_clozes row is written from the generated cloze.
 *   - the per-line seeded gate: a seeded line runs neither the generator nor the
 *     writer (no LLM call, no dialogue_clozes write).
 *   - affixed_form_pairs rows are built from the DB (fetchAffixedPairsFromDb).
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const { enrichMissingPosMock } = vi.hoisted(() => ({
  enrichMissingPosMock: vi.fn().mockResolvedValue({ posByBaseText: new Map<string, string>(), enrichedCount: 0 }),
}))
vi.mock('../enrichPos', () => ({ enrichMissingPos: enrichMissingPosMock }))

import { runCapabilityStage } from '../runner'
import type { LoadedLesson } from '../loader'
import type { DialogueDbResult, PatternDbResult } from '../loadFromDb'
import type { ClozePoolItem } from '../generateClozeContexts'

interface RecordedOp {
  table: string
  op: 'upsert' | 'insert' | 'delete' | 'update'
  payload?: Record<string, unknown> | Array<Record<string, unknown>>
  opts?: Record<string, unknown>
}

/** Generic mock that completes the whole runner + resolves dialogue line refs. */
function buildMock() {
  const ops: RecordedOp[] = []
  let seq = 0
  const nextId = (p: string) => `${p}-${++seq}`

  const fromBuilder = (table: string) => {
    let upsertOpts: Record<string, unknown> = {}
    let inCol: string | undefined
    let inVals: unknown[] = []
    const chain: any = {
      eq: () => chain,
      in: (col: string, vals: unknown[]) => { inCol = col; inVals = vals; return chain },
      is: () => chain,
      not: () => chain,
      ilike: () => chain,
      limit: () => chain,
      order: () => chain,
      range: () => Promise.resolve({ data: [], error: null, count: 0 }),
      maybeSingle: async () => ({ data: null, error: null }),
      single: async () => ({ data: { id: nextId(table), slug: 'slug', canonical_key: 'key', normalized_text: 'nt' }, error: null }),
      then: (resolve: (v: { data: unknown; error: null }) => unknown) => {
        // replaceDialogueClozes resolves source_line_ref → lesson_dialogue_lines.id
        if (table === 'lesson_dialogue_lines' && inCol === 'source_line_ref') {
          const rows = (inVals as string[]).map((ref) => ({ id: nextId('ldl'), source_line_ref: ref }))
          return resolve({ data: rows, error: null })
        }
        return resolve({ data: [], error: null })
      },
    }
    return {
      select: () => chain,
      upsert: (payload: Record<string, unknown> | Array<Record<string, unknown>>, opts2?: Record<string, unknown>) => {
        upsertOpts = opts2 ?? {}
        ops.push({ table, op: 'upsert', payload, opts: upsertOpts })
        const rows = (Array.isArray(payload) ? payload : [payload]) as Array<Record<string, unknown>>
        if (table === 'learning_capabilities' && upsertOpts?.ignoreDuplicates === true) {
          const inserted = rows.map((r) => ({ ...r, id: nextId('cap') }))
          return { select: () => ({ then: (resolve: (v: unknown) => unknown) => resolve({ data: inserted, error: null }) }) }
        }
        const single = () => {
          const row = rows[0] ?? {}
          return { data: { id: nextId(table), canonical_key: row.canonical_key, normalized_text: row.normalized_text }, error: null }
        }
        return {
          select: () => ({ single: async () => single(), then: (resolve: (v: unknown) => unknown) => resolve({ data: rows.map((r) => ({ ...r, id: nextId(table) })), error: null }) }),
          then: (resolve: (v: unknown) => unknown) => resolve({ data: null, error: null }),
        }
      },
      insert: (payload: Record<string, unknown> | Array<Record<string, unknown>>) => {
        ops.push({ table, op: 'insert', payload })
        return {
          select: () => ({ single: async () => ({ data: { id: nextId(table) }, error: null }) }),
          then: (resolve: (v: unknown) => unknown) => resolve({ error: null, data: { id: nextId(table) } }),
        }
      },
      update: (payload: Record<string, unknown>) => {
        ops.push({ table, op: 'update', payload })
        return { eq: () => ({ select: () => ({ single: async () => ({ data: { id: nextId(table) }, error: null }) }), in: async () => ({ error: null }) }), in: async () => ({ error: null }) }
      },
      delete: () => {
        ops.push({ table, op: 'delete' })
        return { eq: () => ({ select: async () => ({ data: [], error: null }) }), in: async () => ({ error: null }) }
      },
    }
  }
  return { client: { schema: () => ({ from: fromBuilder }) }, ops }
}

let tmpDir: string

const LINE_TEXT = 'Saya benar benar jatuh dari sebuah pohon.'
const LINE_REF = 'lesson-1/section-0/line-0'
const DIALOGUE_CANONICAL_KEY = `cap:v1:dialogue_line:${LINE_REF}:contextual_cloze:id_to_l1:text:none`

function makeLesson(stagingDir: string): LoadedLesson {
  return {
    lesson: { id: 'lesson-uuid', module_id: 'module-1', order_index: 1, title: 'Test', level: 'A1', primary_voice: 'Achird' },
    sections: [
      { id: 'section-dialogue', title: 'Dialoog', order_index: 0, content: { type: 'dialogue', lines: [{ text: LINE_TEXT, speaker: 'Andi' }] } },
    ],
    audioClipsByNormalizedText: new Map(),
    staging: {
      stagingDir,
      learningItems: [],
      grammarPatterns: [],
      candidates: [],
      // A LEGACY staging cloze context — the cutover must NOT mint a dialogue cap
      // from this (the generator owns dialogue caps now).
      clozeContexts: [
        { learning_item_slug: LINE_TEXT.toLowerCase(), source_text: 'Saya benar benar jatuh dari sebuah ___.', cloze_answer: 'pohon', translation_text: 'x' },
      ],
      contentUnits: [],
      capabilities: [],
      exerciseAssets: [],
      affixedFormPairs: [],
    },
  }
}

const POOL: ClozePoolItem[] = [
  { normalized_text: 'pohon', base_text: 'pohon', pos: 'noun' },
  { normalized_text: 'kaki', base_text: 'kaki', pos: 'noun' },
  { normalized_text: 'dokter', base_text: 'dokter', pos: 'noun' },
]

function dialogueDb(seeded: boolean): DialogueDbResult {
  return {
    dialogueLines: [
      { id: 'ldl-uuid-1', section_id: 'section-dialogue', lesson_id: 'lesson-uuid', line_index: 0, source_line_ref: LINE_REF, text: LINE_TEXT, speaker: 'Andi', translation: 'Ik ben echt uit een boom gevallen.', translation_nl: 'Ik ben echt uit een boom gevallen.', translation_en: 'I really fell out of a tree.' },
    ] as never,
    dialogueState: {
      existingDialogueCapsByCanonicalKey: new Map(),
      seededDialogueLineIds: seeded ? new Set(['ldl-uuid-1']) : new Set(),
    },
  }
}

const emptyPatternDb: PatternDbResult = {
  categories: [], topics: [],
  patternState: { existingPatternsBySlug: new Map(), existingPatternCapsByCanonicalKey: new Map(), exerciseCoverageByPatternId: new Map() },
}
const NO_ITEMS = { items: [], itemState: { existingItemsByNormalizedText: new Map(), existingItemCapsByCanonicalKey: new Map() } }

const goodClozeFn = async () =>
  JSON.stringify({ answer: 'pohon', sentence_with_blank: 'Saya benar benar jatuh dari sebuah ___.' })

function baseHooks(client: unknown, overrides: Record<string, unknown> = {}) {
  return {
    loadLesson: async () => makeLesson(tmpDir),
    createSupabaseClient: () => client as never,
    loadFromDb: async () => NO_ITEMS,
    fetchDistractorPool: async () => [],
    loadPatternFromDb: async () => emptyPatternDb,
    fetchClozePool: async () => POOL,
    fetchAffixedPairsFromDb: async () => [],
    generateFn: async () => '[]',
    generateGrammarFn: async () => '[]',
    ...overrides,
  }
}

function dialogueCapsUpserted(ops: RecordedOp[]): Array<Record<string, unknown>> {
  return ops
    .filter((op) => op.table === 'learning_capabilities' && op.op === 'upsert')
    .flatMap((op) => (Array.isArray(op.payload) ? op.payload : [op.payload as Record<string, unknown>]))
    .filter((r) => r?.source_kind === 'dialogue_line' && r?.capability_type === 'contextual_cloze')
}

describe('runner dialogue cutover (Task 7)', () => {
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'runner-dialogue-cutover-'))
    enrichMissingPosMock.mockResolvedValue({ posByBaseText: new Map<string, string>(), enrichedCount: 0 })
  })
  afterEach(() => { if (tmpDir && fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true }) })

  it('mints the dialogue cap from the GENERATOR (DB→DB), not from staging.clozeContexts', async () => {
    const { client, ops } = buildMock()
    const result = await runCapabilityStage(
      { lessonNumber: 1, lessonId: 'lesson-uuid' },
      baseHooks(client, { loadDialogueFromDb: async () => dialogueDb(false), generateClozeFn: goodClozeFn }),
    )
    expect(['ok', 'partial']).toContain(result.status)

    const dialogueCaps = dialogueCapsUpserted(ops)
    expect(dialogueCaps).toHaveLength(1)
    // The cap's source_ref is the GENERATED line's ref, with the exact legacy key shape.
    expect(dialogueCaps[0].source_ref).toBe(LINE_REF)
    expect(dialogueCaps[0].canonical_key).toBe(DIALOGUE_CANONICAL_KEY)

    // The dialogue_clozes row was written from the generated cloze.
    const clozeInserts = ops.filter((op) => op.table === 'dialogue_clozes' && op.op === 'insert')
    expect(clozeInserts.length).toBeGreaterThan(0)
  })

  it('seeded line: runs NEITHER the generator NOR the dialogue_clozes write', async () => {
    const { client, ops } = buildMock()
    let clozeFnCalls = 0
    const countingFn = async () => { clozeFnCalls += 1; return goodClozeFn() }
    await runCapabilityStage(
      { lessonNumber: 1, lessonId: 'lesson-uuid' },
      baseHooks(client, { loadDialogueFromDb: async () => dialogueDb(true), generateClozeFn: countingFn }),
    )
    expect(clozeFnCalls).toBe(0)
    expect(dialogueCapsUpserted(ops)).toHaveLength(0)
    expect(ops.filter((op) => op.table === 'dialogue_clozes' && op.op === 'insert')).toHaveLength(0)
  })

  it('affixed_form_pairs ROW DATA comes from the DB, even though the cap is staging-derived', async () => {
    // The affixed CAP is emitted by the buildCapabilityStagingFromContent
    // regeneration from staging.affixedFormPairs (Slice-5 territory). The ROW
    // DATA (root/derived/allomorph) is repointed to the DB in this slice. We
    // prove the repoint by giving staging DELIBERATELY-WRONG root/derived and the
    // DB the correct values — the written row must carry the DB values.
    const { client, ops } = buildMock()
    const lessonWithAffixed = (): LoadedLesson => {
      const l = makeLesson(tmpDir)
      l.staging.affixedFormPairs = [
        { id: 'p1', sourceRef: 'lesson-1/morphology/ber-jalan', root: 'STALE_root', derived: 'STALE_derived', allomorphRule: 'STALE' },
      ] as never
      return l
    }
    await runCapabilityStage(
      { lessonNumber: 1, lessonId: 'lesson-uuid' },
      baseHooks(client, {
        loadLesson: async () => lessonWithAffixed(),
        loadDialogueFromDb: async () => dialogueDb(false),
        generateClozeFn: goodClozeFn,
        fetchAffixedPairsFromDb: async () => [
          { id: 'afp-1', lesson_id: 'lesson-uuid', section_id: null, source_ref: 'lesson-1/morphology/ber-jalan', affix: 'ber-', root_text: 'jalan', derived_text: 'berjalan', allomorph_rule: 'ber- + jalan -> berjalan' },
        ],
      }),
    )
    const affixedInserts = ops.filter((op) => op.table === 'affixed_form_pairs' && op.op === 'insert')
    expect(affixedInserts.length).toBeGreaterThan(0)
    const rows = affixedInserts.flatMap((op) => (Array.isArray(op.payload) ? op.payload : [op.payload as Record<string, unknown>]))
    // ROW DATA is the DB value, NOT the stale staging value.
    expect(rows.every((r) => r.root_text === 'jalan')).toBe(true)
    expect(rows.some((r) => r.root_text === 'STALE_root')).toBe(false)
  })
})
