// Capstone integration test for the dialogue_line:produce_form_from_context_cap flow.
//
// Walks the full runtime read-path: a SessionBlock for a dialogue_line cap →
// the lib/exercise-content resolver (with a mocked Supabase client) →
// the resulting CapabilityRenderContext → the Cloze React component →
// a simulated correct answer → the onAnswer callback.
//
// What this test locks in:
//   - PR 1's artifact payload shape (cloze_context / cloze_answer /
//     translation:l1) flows through fetchForDialogueLineBlocks into a
//     RawProjectorInput with `dialogueLine` populated.
//   - The projector accepts cloze with learningItem=null + dialogueLine set.
//   - byType/cloze.ts builds an ExerciseItem with clozeContext.speaker set
//     when the dialogue line has a speaker.
//   - Cloze.tsx renders the speaker prefix and the surrounding sentence.
//   - Typing the correct answer triggers onAnswer with wasCorrect=true.
//
// Closes the dialogue_line plan's capstone item
// (docs/plans/2026-05-21-dialogue-line-contextual-cloze.md "Capstone — end-to-end").

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MantineProvider } from '@mantine/core'
import { createCapabilityContentService } from '@/lib/exercise-content'
import { buildCanonicalKey } from '@/lib/capabilities/canonicalKey'
import Cloze from '@/components/exercises/implementations/Cloze'
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

function makeDialogueBlock(capabilityId: string, sourceRef: string): SessionBlock {
  const key = buildCanonicalKey({
    sourceKind: 'dialogue_line_src',
    sourceRef,
    capabilityType: 'produce_form_from_context_cap',
    direction: 'id_to_l1',
    modality: 'text',
    learnerLanguage: 'nl',
  })
  return {
    id: `block-${capabilityId}`,
    kind: 'due_review',
    capabilityId,
    canonicalKeySnapshot: key,
    renderPlan: {
      capabilityKey: key,
      sourceRef,
      exerciseType: 'type_missing_word_ex',
      capabilityType: 'produce_form_from_context_cap',
      skillType: 'form_recall',
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

describe('dialogue_line:produce_form_from_context_cap — end-to-end capstone', () => {
  it('resolves a dialogue_line block → renders Cloze with speaker prefix → answering correctly fires onAnswer', async () => {
    const capabilityId = 'cap-l9-dialogue-1'
    const sourceRef = 'lesson-9/section-1/line-10'

    // ── 1. Mock Supabase with one typed `dialogue_clozes` row + its
    //       nested `lesson_dialogue_lines` JOIN row. PR 2 — the reader at
    //       byKind/dialogueLine.ts reads dialogue_clozes WHERE capability_id
    //       IN (...) and PostgREST returns the joined lesson_dialogue_lines
    //       row as a nested object.
    const tables: Record<string, MockTable> = {
      dialogue_clozes: { rows: [
        {
          capability_id: capabilityId,
          sentence_with_blank: 'Aku tidak ___ tinggal di rumah terus',
          answer_text: 'suka',
          translation_text: 'Ik vind het niet leuk om de hele tijd thuis te blijven',
          lesson_dialogue_lines: {
            text: 'Aku tidak suka tinggal di rumah terus',
            speaker: 'Titin',
            translation: 'Ik vind het niet leuk om de hele tijd thuis te blijven',
          },
        },
      ], inserts: [] },
      capability_resolution_failure_events: { rows: [], inserts: [] },
    }

    // ── 2. Run the production resolver pipeline.
    const service = createCapabilityContentService(makeMockClient(tables) as never)
    const block = makeDialogueBlock(capabilityId, sourceRef)
    const result = await service.resolveBlocks([block], {
      userId: 'user-1',
      userLanguage: 'nl',
      sessionId: 'sess-1',
    })

    const ctx = result.get(block.id)
    expect(ctx).toBeDefined()
    expect(ctx?.diagnostic).toBeNull()
    expect(ctx?.exerciseItem).toBeDefined()

    // ── 3. Render the resolved exerciseItem through Cloze.
    const onAnswer = vi.fn()
    render(
      <MantineProvider>
        <Cloze
          exerciseItem={ctx!.exerciseItem!}
          userLanguage="nl"
          onAnswer={onAnswer}
          onEvent={vi.fn()}
          adminOverlay={null}
        />
      </MantineProvider>
    )

    // Speaker prefix + surrounding sentence both rendered.
    expect(screen.getByText(/Titin:/)).toBeInTheDocument()
    expect(screen.getByText(/Aku tidak/)).toBeInTheDocument()
    expect(screen.getByText(/tinggal di rumah terus/)).toBeInTheDocument()

    // ── 4. Type the correct answer and submit.
    const user = userEvent.setup()
    const input = screen.getByRole('textbox')
    await user.type(input, 'suka')
    // Hit enter to submit — the Cloze submits on Enter via the scoring hook's
    // onSubmit handler bound to ExerciseTextInput.
    await user.keyboard('{Enter}')

    // ── 5. onAnswer fired with wasCorrect=true. The component schedules the
    //       callback after a small delay (correct answers auto-advance per
    //       feedback memory); wait for the call.
    await vi.waitFor(() => {
      expect(onAnswer).toHaveBeenCalled()
    }, { timeout: 2000 })

    const args = onAnswer.mock.calls[0]?.[0]
    expect(args?.wasCorrect).toBe(true)
    expect(args?.rawResponse).toBe('suka')
  })
})
