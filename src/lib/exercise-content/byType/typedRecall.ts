// builder for exerciseType='type_form_ex'.
//
// Item path: user sees the meaning, types the Indonesian form. Needs a
// user-lang meaning (for the prompt) and answer_variants (for fuzzy-match
// acceptance).
//
// word_form_pair_src path (added 2026-05-21 per
// docs/plans/2026-05-21-affixed-form-pair-runtime.md): user sees one side
// of the pair (root or derived per the cap's direction), types the other.
// No meaning lookup; no answer_variants. The allomorph rule is carried on
// the exerciseItem for the wrong-answer Doorgaan screen via feedbackMapping.

import type { BuilderInputFor, BuilderResult } from './types'
import type { ExerciseItem } from '@/types/learning'
import { audibleTextFieldsOf } from '@/lib/session-builder'
import { blankDerivedInCarrier, affixCatalogEntry } from '@/lib/capabilities'

export function buildTypedRecall(input: BuilderInputFor<'type_form_ex'>): BuilderResult {
  // word_form_pair_src path — input.affixedFormPair is populated; input.learningItem is null.
  if (input.affixedFormPair) {
    const { root, derived, direction, allomorphRule, affix, carrierText } = input.affixedFormPair
    const isRootToDerived = direction === 'root_to_derived'
    // ADR 0019 option B: on the produce direction, if a carrier sentence exists,
    // present the derived form blanked in context instead of the isolated prompt.
    const carrierBlanked = isRootToDerived && carrierText
      ? blankDerivedInCarrier(carrierText, derived)
      : null
    // Use the pair's actual affix (peN-/ber-/di-/-an…), not a hardcoded meN-,
    // and prompt in Dutch (the learner's language). `affix` carries its own
    // hyphen marking the attachment point (e.g. 'peN-'); strip a trailing one so
    // 'peN-' → 'peN-vorm' reads cleanly. Null only for legacy rows → generic.
    // Reduplication affix labels (e.g. 'reduplication-an') are dev strings, not
    // learner Dutch — use "verdubbelde vorm" for any reduplication shape.
    const isRedup = affix ? affixCatalogEntry(affix)?.affixType === 'reduplication' : false
    const affixLabel = affix ? affix.replace(/-+$/, '') : null
    const promptText = isRootToDerived
      ? isRedup
        ? `Geef de verdubbelde vorm van: ${root}`
        : affixLabel
          ? `Geef de ${affixLabel}-vorm van: ${root}`
          : `Geef de afgeleide vorm van: ${root}`
      : `Wat is het basiswoord van: ${derived}`
    const acceptedAnswer = isRootToDerived ? derived : root
    const exerciseItem: ExerciseItem = {
      learningItem: null,
      meanings: [],
      contexts: [],
      answerVariants: [],
      skillType: isRootToDerived ? 'produce_mode' : 'recognise_mode',
      exerciseType: 'type_form_ex',
      affixedFormPairData: {
        promptText,
        acceptedAnswer,
        direction,
        allomorphRule,
        root,
        derived,
        carrierBlanked,
      },
    }
    return { kind: 'ok', exerciseItem, audibleTexts: audibleTextFieldsOf(exerciseItem) }
  }

  // Item path — learningItem and primaryMeaning are non-null by contract
  // (the projector narrows when the word_form_pair_src path is not active).
  const exerciseItem: ExerciseItem = {
    learningItem: input.learningItem!,
    meanings: input.meanings,
    contexts: input.contexts,
    answerVariants: input.answerVariants,
    skillType: 'produce_mode',
    exerciseType: 'type_form_ex',
  }
  return { kind: 'ok', exerciseItem, audibleTexts: audibleTextFieldsOf(exerciseItem) }
}
