---
module: answer-matching
surface: src/lib/answerNormalization.ts
last_verified_against_code: 2026-06-24
status: stable
---

# Answer-matching module (grading semantics)

## 1. Purpose

The single home of how a typed answer is judged correct. It owns the
normalization + matching rules every typed exercise grades against, and — as the
**dual** of that — the rule for when an exercise's content is *gradeable at all*.

One module owns both because both are defined by the same private normalization.
A second definition (e.g. a validator re-implementing "does this look gradeable")
would silently drift from what the grader actually accepts. (Same reasoning as
the separator convention in `lib/capabilities`, shared by the grader + CS19 + HC24.)

## 2. Public interface (`src/lib/answerNormalization.ts`)

| Export | Role |
|---|---|
| `normalizeAnswer(s)` | Comparison-side normalization: lowercase, strip parentheticals + punctuation, collapse whitespace. The aggressive, recall-maximising fold. |
| `checkAnswer(response, canonical, variants)` | The matcher. Splits both sides on `/`/`;` (`splitAlternatives`), normalizes, then exact-match, then fuzzy (distance-1 insertion/deletion/transposition; **no** substitution, to keep minimal pairs like `membeli`/`memberi` distinct). |
| `findIneffectiveProduceReason(source, acceptableAnswers)` | The **dual of `checkAnswer`**: returns why a produce exercise is ungradeable, or `null`. Uses `normalizeAnswer`, so it sees exactly what the matcher sees. |
| `normalizeAnswerResponse(raw)` | Storage-side fold (lowercase + trim only) for the review-event row; preserves punctuation. Distinct from `normalizeAnswer`. |

## 3. The gradeability invariant (why `findIneffectiveProduceReason` exists)

`normalizeAnswer` erases case, punctuation, and `/`. That is correct for
typo-forgiveness, but it has a consequence: **a produce exercise whose only
difference from its prompt lives in those erased characters is silently
ungradeable** — the matcher accepts the unchanged prompt. Two shapes, both found
live (2026-06-24 audit, 17 instances across 5 grammar patterns):

- `answer_equals_prompt` — an acceptable answer normalizes identically to the
  source (capitalization-only "fixes" `hari rabu`→`hari Rabu`; punctuation-only
  question forms `.`→`?`; a verbatim source listed as an accepted answer).
- `slash_fragments_answer` — an acceptable answer contains `/`, which the matcher
  reads as OR-alternatives, so a single fragment (`di kamar`) passes.

These are *too-lenient* defects: they accept everything, so they never surface
via the flag loop (a learner only flags too-*strict* exercises). They are
findable only by audit — hence the standing guard.

## 4. Seams (consumers)

| Consumer | Layer | What it does |
|---|---|---|
| `components/exercises/implementations/*` via `useExerciseScoring` | runtime | grade a response with `checkAnswer` (see `exercises.md` §5) |
| `experience/CapabilityExerciseFrame` | runtime | `normalizeAnswerResponse` at the frame boundary before the report ships |
| `capability-stage/validators/grammarExerciseEffectiveness` (**CS24**) | pipeline pre-write | thin adapter: maps each produce candidate → `(source, acceptableAnswers)` → `findIneffectiveProduceReason`; ERROR. Catches newly-projected candidates. |
| `check-supabase-deep` (**HC35**) | live-DB | same predicate over every active `sentence_transformation_exercises` + `constrained_translation_exercises` row. Catches legacy rows CS24 cannot see (already-published candidates are not re-projected). |

CS24 + HC35 are the two populations of the same invariant (future vs. legacy),
both deferring to the one predicate — the three-layer pattern of
`project_three_layer_invariant_gates` (helper + tests, pre-write gate, live-DB check).

## 5. What this spec does NOT cover

- How acceptable answers are *produced* — that is `exercise-content.md` (the render plan).
- How the UI renders/scores — `exercises.md` (`useExerciseScoring`).
- The separator convention on Dutch meanings / answer variants — `lib/capabilities` (CS19/HC24).

## 6. Known limitations

- `findIneffectiveProduceReason` covers the two *confirmed* lenience shapes. It
  does not (yet) judge whether a `disallowed_shortcut_forms` set is complete, nor
  semantic adequacy of the transformation — those need pedagogical judgment.
- The guard catches ungradeable content; it does not *repair* it. The 17 existing
  offenders are fixed separately (answer-set edits or regeneration).
