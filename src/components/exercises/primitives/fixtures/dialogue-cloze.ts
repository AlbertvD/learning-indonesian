// Fixture data for dialogue-line-sourced cloze exercises. Consumed by
// /admin/design-lab so the dialogue variant can render alongside the vocab
// variant without inline data littering the design-lab page.
//
// Source kind: dialogue_line. Speaker prefix is rendered as "<Name>: " before
// the sentence. The targetWord and translation come from artifact payloads
// the publish pipeline writes (cloze_context + cloze_answer + translation:l1
// — see scripts/lib/pipeline/capability-stage/projectors/dialogueArtifacts.ts).
//
// PR-C of the lib/exercise-content fold
// (docs/plans/2026-05-21-lib-exercise-content-fold.md).

import type { ExerciseItem } from '@/types/learning'

/** Dialogue-line cloze from L9, section 1, line 10 (Titin). */
export const DIALOGUE_CLOZE_FIXTURE: ExerciseItem = {
  learningItem: null,
  meanings: [],
  contexts: [],
  answerVariants: [],
  skillType: 'produce_mode',
  exerciseType: 'type_missing_word_ex',
  clozeContext: {
    sentence: 'Aku tidak ___ tinggal di rumah terus',
    targetWord: 'suka',
    translation: 'Ik vind het niet leuk om de hele tijd thuis te blijven',
    speaker: 'Titin',
  },
}

/** Item-sourced cloze for side-by-side comparison — no speaker. */
export const VOCAB_CLOZE_FIXTURE: ExerciseItem = {
  learningItem: {
    id: 'item-1', item_type: 'word', base_text: 'tujuh', normalized_text: 'tujuh',
    language: 'id', level: 'A1', source_type: 'lesson',
    source_vocabulary_id: null, source_card_id: null, notes: null,
    is_active: true, pos: 'numeral', translation_nl: null, translation_en: null, usage_note: null, created_at: '', updated_at: '',
  },
  meanings: [],
  contexts: [],
  answerVariants: [],
  skillType: 'produce_mode',
  exerciseType: 'type_missing_word_ex',
  clozeContext: {
    sentence: 'Saya punya ___ buku',
    targetWord: 'tujuh',
    translation: 'Ik heb zeven boeken',
  },
}
