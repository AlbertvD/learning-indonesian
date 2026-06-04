// lib/exercise-content/byKind/dialogueLine — dialogue_line-source-kind fetcher.
//
// PR 2 (2026-05-23): switched from the legacy `capability_artifacts` reader
// (cloze_context / cloze_answer / translation:l1 — three rows per cap) to the
// typed `dialogue_clozes` JOIN `lesson_dialogue_lines` reader. The new reader
// is FAIL-LOUD per §1.5 of `docs/plans/2026-05-22-data-model-migration.md`:
// when `learning_capabilities` says the cap is ready but the JOIN returns
// nothing, the resolver surfaces a `dialogue_line_typed_row_missing` failure
// diagnostic. This is intentionally noisier than the silent skip that masked
// the dialogue-cloze gap on L7/8/9.
//
// The legacy `capability_artifacts` rows are still written by the projector
// during PR 2 (parallel paths — see §1.4 item 5 of the migration plan), but
// no live reader consumes them. The final cleanup PR drops the legacy
// writes + tables.
//
// cloze_mcq remains item-only (its distractor pool is lesson-anchored and
// extending it to dialogue_line is a follow-up). dialogue_line blocks
// scheduled with exerciseType=cloze_mcq would be a planner bug —
// defensively we still emit them with their typed-row data, but the
// projector will reject the input shape with item_not_found.

import {
  type DialogueLineBucketEntry,
  type BlockResolutionData,
  type SupabaseSchemaClient,
  makeFailContext,
} from '../adapter'

/**
 * Shape returned by the dialogue_clozes JOIN lesson_dialogue_lines query.
 * Validated row-by-row before it reaches the byType packager — every column
 * present in this shape has a NOT NULL constraint in the DB, but we narrow
 * defensively in case Postgres-side referential integrity ever drifts.
 */
interface DialogueClozeRow {
  capability_id: string
  sentence_with_blank: string
  answer_text: string
  translation_text: string
  // PostgREST returns the JOINed row as a nested object. lesson_dialogue_lines
  // has line_index UNIQUE per section_id and source_line_ref UNIQUE globally;
  // dialogue_clozes.dialogue_line_id is a NOT NULL FK so this is always
  // present for any row we fetch.
  lesson_dialogue_lines: {
    text: string
    speaker: string | null
    translation: string
  } | null
}

export async function fetchForDialogueLineBlocks(
  client: SupabaseSchemaClient,
  dialogueBlocks: DialogueLineBucketEntry[],
  userLanguage: 'nl' | 'en',
  result: Map<string, BlockResolutionData>,
): Promise<void> {
  if (dialogueBlocks.length === 0) return

  const capabilityIds = [...new Set(dialogueBlocks.map(b => b.block.capabilityId))]
  const { data, error } = await client.schema('indonesian')
    .from('dialogue_clozes')
    .select(`
      capability_id,
      sentence_with_blank,
      answer_text,
      translation_text,
      lesson_dialogue_lines(text, speaker, translation)
    `)
    .in('capability_id', capabilityIds)
  if (error) throw error

  const rowByCapability = new Map<string, DialogueClozeRow>()
  for (const row of (data ?? []) as DialogueClozeRow[]) {
    rowByCapability.set(row.capability_id, row)
  }

  for (const { block, sourceRef } of dialogueBlocks) {
    const row = rowByCapability.get(block.capabilityId)
    if (!row) {
      // Fail-loud: a ready dialogue_line cap with no typed row means
      // either Stage A skipped this section (write-side bug) or the cap
      // was promoted before the typed-row write landed. Surface, do not
      // skip silently.
      result.set(block.id, {
        kind: 'fail',
        block,
        context: makeFailContext(block, 'dialogue_line_typed_row_missing',
          `dialogue_line cap ${block.capabilityId} has no dialogue_clozes row — typed-row writer failed or did not run for this lesson`,
          { capabilityId: block.capabilityId, sourceRef }),
      })
      continue
    }

    if (!row.lesson_dialogue_lines) {
      // FK on dialogue_clozes.dialogue_line_id is NOT NULL — this should
      // not happen unless the row was hand-edited in the DB. Treat as
      // hard fail so the resolver diagnostic surfaces in production.
      result.set(block.id, {
        kind: 'fail',
        block,
        context: makeFailContext(block, 'dialogue_line_typed_row_missing',
          `dialogue_clozes row for cap ${block.capabilityId} resolves to no lesson_dialogue_lines row (broken FK)`,
          { capabilityId: block.capabilityId, sourceRef }),
      })
      continue
    }

    const lineText = row.lesson_dialogue_lines.text
    const speaker = row.lesson_dialogue_lines.speaker
    const translation = row.translation_text
    const targetWord = row.answer_text
    const sourceText = row.sentence_with_blank

    if (!sourceText || !lineText || !targetWord || !translation) {
      // DB NOT NULL constraints guard against empties at write time. This
      // branch is defensive belt-and-braces.
      result.set(block.id, {
        kind: 'fail',
        block,
        context: makeFailContext(block, 'dialogue_line_typed_row_missing',
          `dialogue_clozes row for cap ${block.capabilityId} has empty fields after fetch`,
          {
            capabilityId: block.capabilityId,
            sourceRef,
            hasSourceText: !!sourceText,
            hasLineText: !!lineText,
            hasTargetWord: !!targetWord,
            hasTranslation: !!translation,
          }),
      })
      continue
    }

    result.set(block.id, {
      kind: 'ok',
      block,
      input: {
        block,
        learningItem: null,
        dialogueLine: { text: lineText, speaker, sourceRef, targetWord, translation, sourceText },
        affixedFormPair: null,
        patternExercise: null,
        meanings: [],
        contexts: [],
        answerVariants: [],
        // No artifacts in the typed-table path — the byType/cloze.ts packager
        // reads input.dialogueLine for the dialogue path; the empty map is
        // a no-op for it.
        poolItems: [],
        poolMeaningsByItem: new Map(),
        userLanguage,
        curatedRecognitionDistractors: new Map(),
        curatedCuedRecallDistractors: new Map(),
      },
    })
  }
}
