import { describe, expect, it } from 'vitest'

import { findCapsMissingSatellite, type CapForSatelliteCheck } from '../satellitePresence'

/**
 * Mock supabase covering the read chains findCapsMissingSatellite uses:
 *   .from(table).select(cols).in(col, values)   — dialogue_clozes, affixed_form_pairs, grammar_patterns
 *   .from(table).select(cols).eq('is_active', true) — the 4 typed grammar-exercise tables
 *
 * `tables` maps a table name → its rows. `.in(col, values)` filters rows by
 * membership (faithful to PostgREST); `.eq` returns the configured rows as-is
 * (every seeded grammar-exercise row is is_active=true in these fixtures).
 * Any table set to `{ error }` makes its read reject.
 */
function buildSatelliteClient(
  tables: Record<string, Array<Record<string, unknown>> | { error: string }>,
  inCalls?: Record<string, number[]>, // optional: records the size of each .in(col, values) call per table
) {
  const rowsFor = (table: string) => {
    const v = tables[table]
    if (v && !Array.isArray(v)) return v // error sentinel
    return (v ?? []) as Array<Record<string, unknown>>
  }
  const client = {
    schema: () => ({
      from: (table: string) => ({
        select: () => {
          const entry = tables[table]
          const errored = entry && !Array.isArray(entry) ? entry.error : null
          return {
            in: async (col: string, values: string[]) => {
              if (inCalls) (inCalls[table] ??= []).push(values.length)
              if (errored) return { data: null, error: { message: errored } }
              const data = (rowsFor(table) as Array<Record<string, unknown>>).filter((r) =>
                values.includes(r[col] as string),
              )
              return { data, error: null }
            },
            eq: async () => {
              if (errored) return { data: null, error: { message: errored } }
              return { data: rowsFor(table) as Array<Record<string, unknown>>, error: null }
            },
          }
        },
      }),
    }),
  } as never
  return client
}

const dialogueCap = (id: string): CapForSatelliteCheck => ({
  id,
  canonical_key: `dialogue_line:${id}:produce_form_from_context_cap`,
  source_kind: 'dialogue_line_src',
  source_ref: `lesson-1/section-3/line-${id}`,
  capability_type: 'produce_form_from_context_cap',
})

const affixedCap = (id: string): CapForSatelliteCheck => ({
  id,
  canonical_key: `word_form_pair_src:${id}:recognise_word_form_link_cap`,
  source_kind: 'word_form_pair_src',
  source_ref: `lesson-2/affixed-${id}`,
  capability_type: 'recognise_word_form_link_cap',
})

const patternCap = (id: string, slug: string, type: string): CapForSatelliteCheck => ({
  id,
  canonical_key: `pattern:${slug}:${type}`,
  source_kind: 'grammar_pattern_src',
  source_ref: `lesson-3/pattern-${slug}`,
  capability_type: type,
})

describe('findCapsMissingSatellite', () => {
  it('returns empty for an empty cap list (no DB reads needed)', async () => {
    const client = buildSatelliteClient({})
    expect(await findCapsMissingSatellite(client, [])).toEqual([])
  })

  it('flags dialogue_line caps with no dialogue_clozes row (HC15 mirror)', async () => {
    const caps = [dialogueCap('a'), dialogueCap('b'), dialogueCap('c')]
    const client = buildSatelliteClient({
      // only a + c have a cloze row; b is the artifact-less offender.
      dialogue_clozes: [{ capability_id: 'a' }, { capability_id: 'c' }],
    })
    const missing = await findCapsMissingSatellite(client, caps)
    expect(missing.map((m) => m.id)).toEqual(['b'])
  })

  it('returns none when every dialogue_line cap has a cloze row', async () => {
    const caps = [dialogueCap('a'), dialogueCap('b')]
    const client = buildSatelliteClient({
      dialogue_clozes: [{ capability_id: 'a' }, { capability_id: 'b' }],
    })
    expect(await findCapsMissingSatellite(client, caps)).toEqual([])
  })

  it('flags word_form_pair_src caps with no affixed_form_pairs row (HC17 mirror)', async () => {
    const caps = [affixedCap('x'), affixedCap('y')]
    const client = buildSatelliteClient({
      affixed_form_pairs: [{ capability_id: 'x' }],
    })
    const missing = await findCapsMissingSatellite(client, caps)
    expect(missing.map((m) => m.id)).toEqual(['y'])
  })

  it('flags contrast_grammar_pattern_cap caps with no choose_correct_form_ex row (HC19 mirror)', async () => {
    const caps = [patternCap('p1', 'meN', 'contrast_grammar_pattern_cap'), patternCap('p2', 'di', 'contrast_grammar_pattern_cap')]
    const client = buildSatelliteClient({
      grammar_patterns: [{ id: 'gp-men', slug: 'meN' }, { id: 'gp-di', slug: 'di' }],
      // only the meN pattern has a choose_correct_form_ex row; di is the offender.
      contrast_pair_exercises: [{ grammar_pattern_id: 'gp-men' }],
      sentence_transformation_exercises: [],
      constrained_translation_exercises: [],
      cloze_mcq_exercises: [],
    })
    const missing = await findCapsMissingSatellite(client, caps)
    expect(missing.map((m) => m.id)).toEqual(['p2'])
  })

  it('treats recognise_grammar_pattern_cap as covered ONLY by a cloze row (ADR 0017; HC20 mirror)', async () => {
    const caps = [
      patternCap('r1', 'meN', 'recognise_grammar_pattern_cap'), // covered by cloze_mcq → ok
      patternCap('r2', 'di', 'recognise_grammar_pattern_cap'),  // ONLY transform → offender (no cloze)
      patternCap('r3', 'ber', 'recognise_grammar_pattern_cap'), // no row at all → offender
    ]
    const client = buildSatelliteClient({
      grammar_patterns: [
        { id: 'gp-men', slug: 'meN' },
        { id: 'gp-di', slug: 'di' },
        { id: 'gp-ber', slug: 'ber' },
      ],
      contrast_pair_exercises: [],
      sentence_transformation_exercises: [{ grammar_pattern_id: 'gp-di' }],
      constrained_translation_exercises: [],
      cloze_mcq_exercises: [{ grammar_pattern_id: 'gp-men' }],
    })
    const missing = await findCapsMissingSatellite(client, caps)
    expect(missing.map((m) => m.id).sort()).toEqual(['r2', 'r3'])
  })

  it('treats produce_grammar_pattern_cap as covered by transform OR translate (ADR 0017)', async () => {
    const caps = [
      patternCap('q1', 'meN', 'produce_grammar_pattern_cap'), // covered by transform → ok
      patternCap('q2', 'di', 'produce_grammar_pattern_cap'),  // covered by translate → ok
      patternCap('q3', 'ber', 'produce_grammar_pattern_cap'), // only a cloze row → offender
      patternCap('q4', 'ke', 'produce_grammar_pattern_cap'),  // no row at all → offender
    ]
    const client = buildSatelliteClient({
      grammar_patterns: [
        { id: 'gp-men', slug: 'meN' },
        { id: 'gp-di', slug: 'di' },
        { id: 'gp-ber', slug: 'ber' },
        { id: 'gp-ke', slug: 'ke' },
      ],
      contrast_pair_exercises: [],
      sentence_transformation_exercises: [{ grammar_pattern_id: 'gp-men' }],
      constrained_translation_exercises: [{ grammar_pattern_id: 'gp-di' }],
      cloze_mcq_exercises: [{ grammar_pattern_id: 'gp-ber' }],
    })
    const missing = await findCapsMissingSatellite(client, caps)
    expect(missing.map((m) => m.id).sort()).toEqual(['q3', 'q4'])
  })

  it('flags a pattern cap whose slug does not resolve to a grammar_pattern row', async () => {
    const caps = [patternCap('p1', 'ghost', 'contrast_grammar_pattern_cap')]
    const client = buildSatelliteClient({
      grammar_patterns: [], // slug 'ghost' resolves to nothing
      contrast_pair_exercises: [],
      sentence_transformation_exercises: [],
      constrained_translation_exercises: [],
      cloze_mcq_exercises: [],
    })
    const missing = await findCapsMissingSatellite(client, caps)
    expect(missing.map((m) => m.id)).toEqual(['p1'])
  })

  it('never flags item caps — no per-cap satellite predicate (§2c)', async () => {
    const itemCaps: CapForSatelliteCheck[] = [
      { id: 'i1', canonical_key: 'item:halo:recognition', source_kind: 'vocabulary_src', source_ref: 'learning_items/halo', capability_type: 'recognition' },
    ]
    const client = buildSatelliteClient({})
    expect(await findCapsMissingSatellite(client, itemCaps)).toEqual([])
  })

  it('handles a mixed-kind cap list, returning offenders across kinds', async () => {
    const caps = [
      dialogueCap('d-ok'),
      dialogueCap('d-bad'),
      affixedCap('a-bad'),
      patternCap('pc-bad', 'meN', 'contrast_grammar_pattern_cap'),
    ]
    const client = buildSatelliteClient({
      dialogue_clozes: [{ capability_id: 'd-ok' }],
      affixed_form_pairs: [],
      grammar_patterns: [{ id: 'gp-men', slug: 'meN' }],
      contrast_pair_exercises: [],
      sentence_transformation_exercises: [],
      constrained_translation_exercises: [],
      cloze_mcq_exercises: [],
    })
    const missing = await findCapsMissingSatellite(client, caps)
    expect(missing.map((m) => m.id).sort()).toEqual(['a-bad', 'd-bad', 'pc-bad'])
  })

  it('chunks the grammar_patterns slug read (≤50 per request) so a large pattern set does not overrun the PostgREST URL limit', async () => {
    // Regression for the HC19/20/30 live 502: an unchunked .in('slug', slugs) over
    // ~169 slugs overran Kong's upstream URL limit. Fails on the pre-fix code
    // (one 169-wide call); passes once the read is chunked at CHUNK=50.
    const N = 120
    const caps = Array.from({ length: N }, (_, i) =>
      patternCap(`p${i}`, `slug-${i}`, 'contrast_grammar_pattern_cap'),
    )
    const grammarRows = Array.from({ length: N }, (_, i) => ({ id: `gp-${i}`, slug: `slug-${i}` }))
    const inCalls: Record<string, number[]> = {}
    const client = buildSatelliteClient(
      {
        grammar_patterns: grammarRows,
        contrast_pair_exercises: grammarRows.map((r) => ({ grammar_pattern_id: r.id })),
        sentence_transformation_exercises: [],
        constrained_translation_exercises: [],
        cloze_mcq_exercises: [],
      },
      inCalls,
    )
    const missing = await findCapsMissingSatellite(client, caps)
    // every slug resolves + every pattern has a contrast row → none missing
    expect(missing).toEqual([])
    // the grammar_patterns read was chunked: ceil(120/50)=3 calls, none over 50 wide
    expect(inCalls.grammar_patterns).toHaveLength(Math.ceil(N / 50))
    expect(Math.max(...inCalls.grammar_patterns)).toBeLessThanOrEqual(50)
  })

  it('throws when a satellite read errors', async () => {
    const caps = [dialogueCap('a')]
    const client = buildSatelliteClient({ dialogue_clozes: { error: 'boom' } })
    await expect(findCapsMissingSatellite(client, caps)).rejects.toThrow(/dialogue_clozes.*boom/)
  })
})
