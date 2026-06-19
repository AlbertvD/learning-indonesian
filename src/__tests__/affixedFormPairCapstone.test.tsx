// Capstone integration test for the word_form_pair_src:root_derived_* flow.
//
// Walks the full runtime read-path: a SessionBlock for an word_form_pair_src
// cap → the lib/exercise-content resolver (with a mocked Supabase client) →
// the resulting CapabilityRenderContext → the TypedRecall React component →
// a simulated correct answer → the onAnswer callback.
//
// What this test locks in:
//   - root_derived_pair + allomorph_rule artifact payloads flow through
//     fetchForAffixedFormPairBlocks into a RawProjectorInput with
//     `affixedFormPair` populated.
//   - decodeCanonicalKey returns the cap's `direction` in the tail.
//   - The projector accepts type_form_ex with learningItem=null +
//     affixedFormPair set.
//   - byType/typedRecall.ts builds an ExerciseItem with affixedFormPairData
//     populated and direction-aware prompt/answer.
//   - TypedRecall.tsx renders the morphology prompt; typing the correct
//     answer triggers onAnswer with wasCorrect=true.
//   - audibleTextFieldsOf includes both root and derived for TTS prefetch.
//
// Closes the affixed-form-pair plan's capstone item
// (docs/plans/2026-05-21-affixed-form-pair-runtime.md "PR 1 step 13 — Capstone").

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MantineProvider } from '@mantine/core'
import { createCapabilityContentService } from '@/lib/exercise-content'
import { buildCanonicalKey } from '@/lib/capabilities/canonicalKey'
import { audibleTextFieldsOf } from '@/lib/session-builder/audibleTexts'
import TypedRecall from '@/components/exercises/implementations/TypedRecall'
import DecomposeWordExercise from '@/components/exercises/implementations/DecomposeWordExercise'
import type { SessionBlock } from '@/lib/session-builder'

vi.mock('@/lib/supabase', () => ({ supabase: {} }))

interface MockTable {
  rows: unknown[]
  inserts: unknown[]
}

function makeMockClient(tables: Record<string, MockTable>) {
  function query(table: string): any {
    const t = tables[table] ?? { rows: [], inserts: [] }
    const chain: any = {
      select: () => chain,
      eq: () => chain,
      in: () => chain,
      insert: (row: unknown) => { t.inserts.push(row); return Promise.resolve({ data: null, error: null }) },
      then: (resolve: (value: { data: unknown[]; error: null }) => void) => resolve({ data: t.rows, error: null }),
    }
    return chain
  }
  return { schema: () => ({ from: (table: string) => query(table) }) }
}

function makeAffixedBlock(opts: {
  capabilityId: string
  sourceRef: string
  direction: 'root_to_derived' | 'derived_to_root'
  capabilityType: 'produce_derived_form_cap' | 'recognise_word_form_link_cap'
  exerciseType?: 'type_form_ex' | 'decompose_word_ex'
}): SessionBlock {
  const key = buildCanonicalKey({
    sourceKind: 'word_form_pair_src',
    sourceRef: opts.sourceRef,
    capabilityType: opts.capabilityType,
    direction: opts.direction,
    modality: 'text',
    learnerLanguage: 'none',
  })
  return {
    id: `block-${opts.capabilityId}`,
    kind: 'due_review',
    capabilityId: opts.capabilityId,
    canonicalKeySnapshot: key,
    renderPlan: {
      capabilityKey: key,
      sourceRef: opts.sourceRef,
      exerciseType: opts.exerciseType ?? 'type_form_ex',
      capabilityType: opts.capabilityType,
      skillType: opts.direction === 'root_to_derived' ? 'produce_mode' : 'recognise_mode',
    },
    reviewContext: {
      schedulerSnapshot: {} as never,
      currentStateVersion: 0,
      artifactVersionSnapshot: {},
      capabilityReadinessStatus: 'ready',
      capabilityPublicationStatus: 'published',
    },
  }
}

describe('word_form_pair_src:root_derived_* — end-to-end capstone', () => {
  it('resolves a root→derived (recall) block, renders TypedRecall, answering correctly fires onAnswer; audibleTexts harvest contains root + derived', async () => {
    const capabilityId = 'cap-l9-membaca-recall'
    const sourceRef = 'lesson-9/morphology/meN-baca-membaca'

    // ── 1. Mock Supabase with the typed affixed_form_pairs row the publish
    //       pipeline writes (PR 3 — replaces the two capability_artifacts rows;
    //       reader: src/lib/exercise-content/byKind/affixedFormPair.ts).
    const tables: Record<string, MockTable> = {
      affixed_form_pairs: { rows: [
        {
          capability_id: capabilityId,
          root_text: 'baca',
          derived_text: 'membaca',
          allomorph_rule: 'meN- becomes mem- before roots beginning with b: baca -> membaca.',
          affix: 'meN-',
        },
      ], inserts: [] },
      capability_resolution_failure_events: { rows: [], inserts: [] },
    }

    // ── 2. Run the production resolver pipeline.
    const service = createCapabilityContentService(makeMockClient(tables) as never)
    const block = makeAffixedBlock({
      capabilityId,
      sourceRef,
      direction: 'root_to_derived',
      capabilityType: 'produce_derived_form_cap',
    })
    const result = await service.resolveBlocks([block], {
      userId: 'user-1',
      userLanguage: 'nl',
      sessionId: 'sess-1',
    })

    const ctx = result.get(block.id)
    expect(ctx).toBeDefined()
    expect(ctx?.diagnostic).toBeNull()
    expect(ctx?.exerciseItem).toBeDefined()
    expect(ctx?.exerciseItem?.affixedFormPairData).toEqual({
      promptText: 'Geef de meN-vorm van: baca',
      acceptedAnswer: 'membaca',
      direction: 'root_to_derived',
      allomorphRule: 'meN- becomes mem- before roots beginning with b: baca -> membaca.',
      root: 'baca',
      derived: 'membaca',
      carrierBlanked: null, // no carrier on this fixture (ADR 0019 option B)
    })
    expect(ctx?.exerciseItem?.learningItem).toBeNull()

    // ── 3. audibleTexts harvest includes both root + derived (Indonesian).
    expect(audibleTextFieldsOf(ctx!.exerciseItem!)).toEqual(expect.arrayContaining(['baca', 'membaca']))

    // ── 4. Render the resolved exerciseItem through TypedRecall.
    const onAnswer = vi.fn()
    render(
      <MantineProvider>
        <TypedRecall
          exerciseItem={ctx!.exerciseItem!}
          userLanguage="nl"
          onAnswer={onAnswer}
          onEvent={vi.fn()}
          adminOverlay={null}
        />
      </MantineProvider>
    )

    // The prompt is shown.
    expect(screen.getByText('Geef de meN-vorm van: baca')).toBeInTheDocument()

    // ── 5. Type the correct answer and submit.
    const user = userEvent.setup()
    const input = screen.getByRole('textbox')
    await user.type(input, 'membaca')
    await user.keyboard('{Enter}')

    // ── 6. onAnswer fired with wasCorrect=true. Correct answers auto-advance
    //       (per the feedback_exercise_answer_screen memory); wait for the call.
    await vi.waitFor(() => {
      expect(onAnswer).toHaveBeenCalled()
    }, { timeout: 2000 })

    const args = onAnswer.mock.calls[0]?.[0]
    expect(args?.wasCorrect).toBe(true)
    expect(args?.rawResponse).toBe('membaca')
  })

  it('resolves a derived→root (recognition) block — prompt flips to "Wat is het basiswoord van: membaca", answer is "baca"', async () => {
    const capabilityId = 'cap-l9-membaca-recognition'
    const sourceRef = 'lesson-9/morphology/meN-baca-membaca'

    const tables: Record<string, MockTable> = {
      affixed_form_pairs: { rows: [
        {
          capability_id: capabilityId,
          root_text: 'baca',
          derived_text: 'membaca',
          allomorph_rule: 'meN- becomes mem- before roots beginning with b.',
        },
      ], inserts: [] },
      capability_resolution_failure_events: { rows: [], inserts: [] },
    }

    const service = createCapabilityContentService(makeMockClient(tables) as never)
    const block = makeAffixedBlock({
      capabilityId,
      sourceRef,
      direction: 'derived_to_root',
      capabilityType: 'recognise_word_form_link_cap',
    })
    const result = await service.resolveBlocks([block], {
      userId: 'user-1',
      userLanguage: 'nl',
      sessionId: 'sess-1',
    })

    const ctx = result.get(block.id)
    expect(ctx?.exerciseItem?.affixedFormPairData?.promptText).toBe('Wat is het basiswoord van: membaca')
    expect(ctx?.exerciseItem?.affixedFormPairData?.acceptedAnswer).toBe('baca')

    const onAnswer = vi.fn()
    render(
      <MantineProvider>
        <TypedRecall
          exerciseItem={ctx!.exerciseItem!}
          userLanguage="nl"
          onAnswer={onAnswer}
          onEvent={vi.fn()}
          adminOverlay={null}
        />
      </MantineProvider>
    )

    expect(screen.getByText('Wat is het basiswoord van: membaca')).toBeInTheDocument()

    const user = userEvent.setup()
    const input = screen.getByRole('textbox')
    await user.type(input, 'baca')
    await user.keyboard('{Enter}')

    await vi.waitFor(() => {
      expect(onAnswer).toHaveBeenCalled()
    }, { timeout: 2000 })

    const args = onAnswer.mock.calls[0]?.[0]
    expect(args?.wasCorrect).toBe(true)
  })

  it('typing the wrong answer fires onAnswer with wasCorrect=false', async () => {
    const capabilityId = 'cap-l9-wrong-answer'
    const tables: Record<string, MockTable> = {
      affixed_form_pairs: { rows: [
        {
          capability_id: capabilityId,
          root_text: 'baca',
          derived_text: 'membaca',
          allomorph_rule: 'meN- becomes mem- before roots beginning with b.',
        },
      ], inserts: [] },
      capability_resolution_failure_events: { rows: [], inserts: [] },
    }

    const service = createCapabilityContentService(makeMockClient(tables) as never)
    const block = makeAffixedBlock({
      capabilityId,
      sourceRef: 'lesson-9/morphology/meN-baca-membaca',
      direction: 'root_to_derived',
      capabilityType: 'produce_derived_form_cap',
    })
    const result = await service.resolveBlocks([block], {
      userId: 'user-1',
      userLanguage: 'nl',
      sessionId: 'sess-1',
    })
    const ctx = result.get(block.id)!

    const onAnswer = vi.fn()
    render(
      <MantineProvider>
        <TypedRecall
          exerciseItem={ctx.exerciseItem!}
          userLanguage="nl"
          onAnswer={onAnswer}
          onEvent={vi.fn()}
          adminOverlay={null}
        />
      </MantineProvider>
    )

    const user = userEvent.setup()
    const input = screen.getByRole('textbox')
    await user.type(input, 'menbaca')  // wrong allomorph
    await user.keyboard('{Enter}')

    await vi.waitFor(() => {
      expect(onAnswer).toHaveBeenCalled()
    }, { timeout: 2000 })

    expect(onAnswer.mock.calls[0]?.[0]?.wasCorrect).toBe(false)
  })

  // ── ADR 0019 — confix render-verify using the LIVE L21 data shapes ──────────
  // (root beli + meN-…-kan → membelikan, circumfix mem/kan, carrier harvested from
  // L21's grammar example "Ibu membelikan anaknya buku"). Mirrors what the live
  // app renders for the published L21 caps, without needing admin auth.

  const L21_CONFIX_ROW = {
    capability_id: 'cap-l21-membelikan',
    root_text: 'beli',
    derived_text: 'membelikan',
    allomorph_rule: 'meN-…-kan: voorvoegsel mem- met achtervoegsel -kan: beli → membelikan.',
    affix: 'meN-…-kan',
    circumfix_left: 'mem',
    circumfix_right: 'kan',
    carrier_text: 'Ibu membelikan anaknya buku',
  }

  it('renders decompose_word_ex for a confix recognition cap — the breakdown "mem + beli + kan" is selectable and answering fires onAnswer', async () => {
    const tables: Record<string, MockTable> = {
      affixed_form_pairs: { rows: [L21_CONFIX_ROW], inserts: [] },
      capability_resolution_failure_events: { rows: [], inserts: [] },
    }
    const service = createCapabilityContentService(makeMockClient(tables) as never)
    const block = makeAffixedBlock({
      capabilityId: 'cap-l21-membelikan',
      sourceRef: 'lesson-21/morphology/meN-…-kanbeli-membelikan',
      direction: 'derived_to_root',
      capabilityType: 'recognise_word_form_link_cap',
      exerciseType: 'decompose_word_ex',
    })
    const result = await service.resolveBlocks([block], { userId: 'u', userLanguage: 'nl', sessionId: 's' })
    const ctx = result.get(block.id)
    expect(ctx?.diagnostic).toBeNull()
    expect(ctx?.exerciseItem?.decomposeData?.word).toBe('membelikan')
    expect(ctx?.exerciseItem?.decomposeData?.correctOptionId).toBe('mem + beli + kan')

    const onAnswer = vi.fn()
    render(
      <MantineProvider>
        <DecomposeWordExercise exerciseItem={ctx!.exerciseItem!} userLanguage="nl" onAnswer={onAnswer} onEvent={vi.fn()} adminOverlay={null} />
      </MantineProvider>
    )
    // The word renders as the prompt (and also as the unsegmented-word distractor,
    // so it appears more than once — that distractor is intentional).
    expect(screen.getAllByText('membelikan').length).toBeGreaterThanOrEqual(1)
    const correct = screen.getByText('mem + beli + kan')
    expect(correct).toBeInTheDocument()

    await userEvent.setup().click(correct)
    await vi.waitFor(() => { expect(onAnswer).toHaveBeenCalled() }, { timeout: 2000 })
    expect(onAnswer.mock.calls[0]?.[0]?.wasCorrect).toBe(true)
  })

  it('renders the contextualised carrier on the produce cap — type_form_ex shows the blanked sentence "Ibu ___ anaknya buku"', async () => {
    const tables: Record<string, MockTable> = {
      affixed_form_pairs: { rows: [L21_CONFIX_ROW], inserts: [] },
      capability_resolution_failure_events: { rows: [], inserts: [] },
    }
    const service = createCapabilityContentService(makeMockClient(tables) as never)
    const block = makeAffixedBlock({
      capabilityId: 'cap-l21-membelikan',
      sourceRef: 'lesson-21/morphology/meN-…-kanbeli-membelikan',
      direction: 'root_to_derived',
      capabilityType: 'produce_derived_form_cap',
    })
    const result = await service.resolveBlocks([block], { userId: 'u', userLanguage: 'nl', sessionId: 's' })
    const ctx = result.get(block.id)
    expect(ctx?.exerciseItem?.affixedFormPairData?.carrierBlanked).toBe('Ibu ___ anaknya buku')

    render(
      <MantineProvider>
        <TypedRecall exerciseItem={ctx!.exerciseItem!} userLanguage="nl" onAnswer={vi.fn()} onEvent={vi.fn()} adminOverlay={null} />
      </MantineProvider>
    )
    // The carrier sentence (blanked) is the prompt; typing the form is graded against membelikan.
    expect(screen.getByText('Ibu ___ anaknya buku')).toBeInTheDocument()
    const user = userEvent.setup()
    await user.type(screen.getByRole('textbox'), 'membelikan')
    await user.keyboard('{Enter}')
    // (grading uses acceptedAnswer=membelikan; the carrier is the prompt context.)
  })
})

// ── ADR 0019 (amended L22) — reduplication render-verify on LIVE L22 data shapes ──
// circumfix_left/right are NULL on the row (Option A); decompose re-derives the
// segmentation from the catalog recipe. Full reduplication renders [root, root];
// wrapped reduplication renders [left, root-root, right]; the produce prompt is the
// Dutch "verdubbelde vorm". Mirrors what the published L22 caps render in-app.
describe('word_form_pair_src reduplication (L22) — render-verify', () => {
  it('full reduplication decompose_word_ex: "anak + anak" is selectable and answering fires onAnswer', async () => {
    const tables: Record<string, MockTable> = {
      affixed_form_pairs: { rows: [{
        capability_id: 'cap-l22-anak-anak', root_text: 'anak', derived_text: 'anak-anak',
        allomorph_rule: 'Verdubbeling: anak → anak-anak.', affix: 'reduplication',
        circumfix_left: null, circumfix_right: null, carrier_text: null,
      }], inserts: [] },
      capability_resolution_failure_events: { rows: [], inserts: [] },
    }
    const service = createCapabilityContentService(makeMockClient(tables) as never)
    const block = makeAffixedBlock({
      capabilityId: 'cap-l22-anak-anak', sourceRef: 'lesson-22/morphology/reduplicationanak-anak-anak',
      direction: 'derived_to_root', capabilityType: 'recognise_word_form_link_cap', exerciseType: 'decompose_word_ex',
    })
    const result = await service.resolveBlocks([block], { userId: 'u', userLanguage: 'nl', sessionId: 's' })
    const ctx = result.get(block.id)
    expect(ctx?.diagnostic).toBeNull()
    expect(ctx?.exerciseItem?.decomposeData?.correctOptionId).toBe('anak + anak')

    const onAnswer = vi.fn()
    render(
      <MantineProvider>
        <DecomposeWordExercise exerciseItem={ctx!.exerciseItem!} userLanguage="nl" onAnswer={onAnswer} onEvent={vi.fn()} adminOverlay={null} />
      </MantineProvider>
    )
    const correct = screen.getByText('anak + anak')
    expect(correct).toBeInTheDocument()
    await userEvent.setup().click(correct)
    await vi.waitFor(() => { expect(onAnswer).toHaveBeenCalled() }, { timeout: 2000 })
    expect(onAnswer.mock.calls[0]?.[0]?.wasCorrect).toBe(true)
  })

  it('wrapped reduplication decompose_word_ex: "ke + biru-biru + an" is the correct breakdown', async () => {
    const tables: Record<string, MockTable> = {
      affixed_form_pairs: { rows: [{
        capability_id: 'cap-l22-kebiru-biruan', root_text: 'biru', derived_text: 'kebiru-biruan',
        allomorph_rule: 'ke-…-an om de verdubbeling: biru → kebiru-biruan.', affix: 'ke-…-an-reduplication',
        circumfix_left: null, circumfix_right: null, carrier_text: null,
      }], inserts: [] },
      capability_resolution_failure_events: { rows: [], inserts: [] },
    }
    const service = createCapabilityContentService(makeMockClient(tables) as never)
    const block = makeAffixedBlock({
      capabilityId: 'cap-l22-kebiru-biruan', sourceRef: 'lesson-22/morphology/ke-…-an-reduplicationbiru-kebiru-biruan',
      direction: 'derived_to_root', capabilityType: 'recognise_word_form_link_cap', exerciseType: 'decompose_word_ex',
    })
    const result = await service.resolveBlocks([block], { userId: 'u', userLanguage: 'nl', sessionId: 's' })
    const ctx = result.get(block.id)
    expect(ctx?.diagnostic).toBeNull()
    expect(ctx?.exerciseItem?.decomposeData?.word).toBe('kebiru-biruan')
    expect(ctx?.exerciseItem?.decomposeData?.correctOptionId).toBe('ke + biru-biru + an')

    render(
      <MantineProvider>
        <DecomposeWordExercise exerciseItem={ctx!.exerciseItem!} userLanguage="nl" onAnswer={vi.fn()} onEvent={vi.fn()} adminOverlay={null} />
      </MantineProvider>
    )
    expect(screen.getByText('ke + biru-biru + an')).toBeInTheDocument()
  })

  it('reduplication produce type_form_ex (isolated): Dutch "verdubbelde vorm" prompt, typing the doubled form is correct', async () => {
    const tables: Record<string, MockTable> = {
      affixed_form_pairs: { rows: [{
        capability_id: 'cap-l22-anak-anak-produce', root_text: 'anak', derived_text: 'anak-anak',
        allomorph_rule: 'Verdubbeling: anak → anak-anak.', affix: 'reduplication',
        circumfix_left: null, circumfix_right: null, carrier_text: null,
      }], inserts: [] },
      capability_resolution_failure_events: { rows: [], inserts: [] },
    }
    const service = createCapabilityContentService(makeMockClient(tables) as never)
    const block = makeAffixedBlock({
      capabilityId: 'cap-l22-anak-anak-produce', sourceRef: 'lesson-22/morphology/reduplicationanak-anak-anak',
      direction: 'root_to_derived', capabilityType: 'produce_derived_form_cap',
    })
    const result = await service.resolveBlocks([block], { userId: 'u', userLanguage: 'nl', sessionId: 's' })
    const ctx = result.get(block.id)
    expect(ctx?.exerciseItem?.affixedFormPairData?.promptText).toBe('Geef de verdubbelde vorm van: anak')
    expect(ctx?.exerciseItem?.affixedFormPairData?.carrierBlanked).toBeNull()

    const onAnswer = vi.fn()
    render(
      <MantineProvider>
        <TypedRecall exerciseItem={ctx!.exerciseItem!} userLanguage="nl" onAnswer={onAnswer} onEvent={vi.fn()} adminOverlay={null} />
      </MantineProvider>
    )
    expect(screen.getByText('Geef de verdubbelde vorm van: anak')).toBeInTheDocument()
    const user = userEvent.setup()
    await user.type(screen.getByRole('textbox'), 'anak-anak')
    await user.keyboard('{Enter}')
    await vi.waitFor(() => { expect(onAnswer).toHaveBeenCalled() }, { timeout: 2000 })
    expect(onAnswer.mock.calls[0]?.[0]?.wasCorrect).toBe(true)
  })

  it('reduplication produce with carrier: the hyphenated form blanks as a whole word ("…, ___ tentu")', async () => {
    const tables: Record<string, MockTable> = {
      affixed_form_pairs: { rows: [{
        capability_id: 'cap-l22-sayur-sayuran', root_text: 'sayur', derived_text: 'sayur-sayuran',
        allomorph_rule: 'Verdubbeling + achtervoegsel -an: sayur → sayur-sayuran.', affix: 'reduplication-an',
        circumfix_left: null, circumfix_right: null, carrier_text: 'Kura-kura makan apa, sayur-sayuran tentu',
      }], inserts: [] },
      capability_resolution_failure_events: { rows: [], inserts: [] },
    }
    const service = createCapabilityContentService(makeMockClient(tables) as never)
    const block = makeAffixedBlock({
      capabilityId: 'cap-l22-sayur-sayuran', sourceRef: 'lesson-22/morphology/reduplication-ansayur-sayur-sayuran',
      direction: 'root_to_derived', capabilityType: 'produce_derived_form_cap',
    })
    const result = await service.resolveBlocks([block], { userId: 'u', userLanguage: 'nl', sessionId: 's' })
    const ctx = result.get(block.id)
    // The whole reduplication token (internal hyphen kept) blanks, not just one half.
    expect(ctx?.exerciseItem?.affixedFormPairData?.carrierBlanked).toBe('Kura-kura makan apa, ___ tentu')

    render(
      <MantineProvider>
        <TypedRecall exerciseItem={ctx!.exerciseItem!} userLanguage="nl" onAnswer={vi.fn()} onEvent={vi.fn()} adminOverlay={null} />
      </MantineProvider>
    )
    expect(screen.getByText('Kura-kura makan apa, ___ tentu')).toBeInTheDocument()
  })
})
