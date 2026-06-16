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
      exerciseType: 'type_form_ex',
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
      promptText: 'Form the meN- form of: baca',
      acceptedAnswer: 'membaca',
      direction: 'root_to_derived',
      allomorphRule: 'meN- becomes mem- before roots beginning with b: baca -> membaca.',
      root: 'baca',
      derived: 'membaca',
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
    expect(screen.getByText('Form the meN- form of: baca')).toBeInTheDocument()

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

  it('resolves a derived→root (recognition) block — prompt flips to "What is the root of: membaca", answer is "baca"', async () => {
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
    expect(ctx?.exerciseItem?.affixedFormPairData?.promptText).toBe('What is the root of: membaca')
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

    expect(screen.getByText('What is the root of: membaca')).toBeInTheDocument()

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
})
