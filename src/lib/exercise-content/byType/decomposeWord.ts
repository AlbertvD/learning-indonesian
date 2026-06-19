// builder for exerciseType='decompose_word_ex' (ADR 0019).
//
// The morphology segmentation drill: the learner sees a derived word and picks
// its correct morpheme breakdown from plausible alternatives. Serves
// recognise_word_form_link_cap on word_form_pair_src — the "parse direction"
// recognition skill (word → its pieces), complementing type_form_ex's
// production. Renders purely from the typed affixed_form_pairs row; the affix's
// surface pieces are taken from circumfix_left/right (confixes) or re-derived
// from (root, affix) for bare prefixes/suffixes via the deterministic engine.

import type { BuilderInputFor, BuilderResult } from './types'
import type { ExerciseItem } from '@/types/learning'
import { audibleTextFieldsOf } from '@/lib/session-builder'
import { deriveAffixedForm } from '@/lib/capabilities'
import { allomorphClassesFor } from '@/lib/capabilities/affixCatalog'

/** The morpheme surface pieces of a derived form: prefix? + root + suffix?. */
function morphemePieces(
  root: string,
  affix: string | null,
  circumfixLeft: string | null,
  circumfixRight: string | null,
): { prefix: string | null; root: string; suffix: string | null } {
  // Confix: both pieces stored on the row.
  if (circumfixLeft && circumfixRight) return { prefix: circumfixLeft, root, suffix: circumfixRight }
  if (!affix) return { prefix: null, root, suffix: null }
  // Bare suffix (e.g. '-an'): the piece is the affix without its leading hyphen.
  if (affix.startsWith('-')) return { prefix: null, root, suffix: affix.replace(/^-+/u, '') }
  // Bare prefix: nasalising → the chosen spelling (the engine's allomorphClass);
  // invariant (ber-/di-/ter-/se-/memper-) → the affix without its trailing hyphen.
  let prefix: string | null
  if (allomorphClassesFor(affix).length > 0) {
    try {
      prefix = deriveAffixedForm(root, affix).allomorphClass
    } catch {
      prefix = null
    }
  } else {
    prefix = affix.replace(/-+$/u, '')
  }
  return { prefix, root, suffix: null }
}

/** Build the correct breakdown + deterministic plausible-wrong alternatives. */
function buildBreakdowns(prefix: string | null, root: string, suffix: string | null): { correct: string; options: string[] } {
  const pieces = [prefix, root, suffix].filter((p): p is string => !!p)
  const join = (ps: string[]) => ps.join(' + ')
  const correct = join(pieces)

  const distractors = new Set<string>()
  distractors.add(pieces.join('')) // the unsegmented word — "did you see the structure?"
  if (pieces.length >= 3) {
    distractors.add(join([pieces[0] + pieces[1], pieces[2]])) // missed the prefix boundary
    distractors.add(join([pieces[0], pieces[1] + pieces[2]])) // missed the suffix boundary
  } else if (pieces.length === 2) {
    const [a, b] = pieces
    if (a.length > 1) distractors.add(join([a.slice(0, -1), a.slice(-1) + b])) // boundary one char too early
    if (b.length > 1) distractors.add(join([a + b[0], b.slice(1)])) // one char too late
  }
  distractors.delete(correct)

  const options = [correct, ...distractors].slice(0, 4).sort((x, y) => x.localeCompare(y))
  return { correct, options }
}

export function buildDecomposeWord(input: BuilderInputFor<'decompose_word_ex'>): BuilderResult {
  const { root, derived, affix, circumfixLeft, circumfixRight, allomorphRule } = input.affixedFormPair
  const { prefix, root: stem, suffix } = morphemePieces(root, affix ?? null, circumfixLeft ?? null, circumfixRight ?? null)

  const { correct, options } = buildBreakdowns(prefix, stem, suffix)
  if (options.length < 2) {
    // No affix to segment (legacy null-affix row) — fail loud rather than render a
    // one-option "MCQ". word_form_pair rows in the live DB always carry an affix.
    return {
      kind: 'fail',
      reasonCode: 'malformed_payload',
      message: `decompose_word_ex: cannot segment "${derived}" (no affix pieces)`,
      payloadSnapshot: { root, derived, affix },
    }
  }

  const exerciseItem: ExerciseItem = {
    learningItem: null,
    meanings: [],
    contexts: [],
    answerVariants: [],
    skillType: 'recognise_mode',
    exerciseType: 'decompose_word_ex',
    decomposeData: {
      word: derived,
      options,
      correctOptionId: correct,
      explanationText: allomorphRule,
    },
  }
  return { kind: 'ok', exerciseItem, audibleTexts: audibleTextFieldsOf(exerciseItem) }
}
