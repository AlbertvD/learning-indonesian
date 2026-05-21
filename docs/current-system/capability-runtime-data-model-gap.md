# Capability Runtime vs Data Model — what ships, what's inert

**Date:** 2026-05-21

The capability data model accommodates six source kinds and twelve capability types. The runtime currently renders one source kind. This doc records the gap explicitly so a future session does not chase phantom features that were never wired to a user-facing surface.

## The six source kinds

Defined at `src/lib/capabilities/capabilityTypes.ts:5-30`:

| Source kind | Conceptual unit |
|---|---|
| `item` | A learning_items row — vocabulary word or phrase |
| `pattern` | A grammar_patterns row |
| `dialogue_line` | A specific line inside a dialogue section in `lesson_sections.content` |
| `podcast_segment` | A chunk of a podcast (reserved; not emitted by the pipeline today) |
| `podcast_phrase` | A phrase pulled from a podcast (reserved; not emitted) |
| `affixed_form_pair` | A morphology pair (root + derived form, e.g. `jalan` → `jalan-jalan`) |

## The runtime gate

`src/services/capabilityContentService.ts:215-220` rejects any block whose decoded sourceKind is not `'item'`:

```ts
if (decoded.sourceKind !== 'item') {
  result.set(block.id, makeFailContext(block, 'unsupported_source_kind',
    `sourceKind '${decoded.sourceKind}' is out of PR-2 scope`,
    { sourceKind: decoded.sourceKind, sourceRef: decoded.sourceRef }))
  continue
}
```

The whole resolver downstream of this check assumes a learning item with translations, normalized text, and item-level artifacts. Every render contract in `src/lib/capabilities/renderContracts.ts:42-104` declares `supportedSourceKinds: ['item']` — there is no exception today.

A lock-in test at `src/lib/capabilities/__tests__/renderContracts.test.ts:144-148` asserts the restriction holds for `dialogue_line`, and a sibling test at `:150-154` does the same for `affixed_form_pair`.

## What's in the live database (snapshot 2026-05-21)

Total capability rows: **4,005**. Distribution by `(source_kind, capability_type)`:

```
  3,900 (97.4%) item-sourced       — rendered
        655 item / l1_to_id_choice
        655 item / text_recognition
        655 item / form_recall
        655 item / meaning_recall
        640 item / dictation
        640 item / audio_recognition

     94 (2.3%) pattern-sourced     — inert
         47 pattern / pattern_contrast
         47 pattern / pattern_recognition

      7 (0.2%) dialogue_line       — inert
          7 dialogue_line / contextual_cloze

      4 (0.1%) affixed_form_pair   — inert
          2 affixed_form_pair / root_derived_recognition
          2 affixed_form_pair / root_derived_recall
```

Reproducible via: `select source_kind, capability_type, count(*) from indonesian.learning_capabilities group by 1, 2 order by 3 desc`.

`podcast_segment` and `podcast_phrase` capabilities are not emitted by the projection pipeline at runtime today — the projectors in `scripts/lib/pipeline/capability-stage/projectors/` cover item / pattern / dialogue_line / affixed_form_pair only.

## Why the inert capabilities exist

Each inert flavor was projected for a different reason:

- **pattern / pattern_recognition + pattern_contrast** — emitted by `scripts/lib/pipeline/capability-stage/projectors/grammar.ts`. Grammar exercises today (`contrast_pair`, `sentence_transformation`, `constrained_translation`) draw from the authored `exercise_variants` table, not from these projected capabilities. The render contracts for those three exercises all declare `capabilityTypes: []` (`renderContracts.ts:83-98`), meaning no capability type routes to them. So `pattern_recognition` + `pattern_contrast` caps have no consumer in the running app.
- **dialogue_line / contextual_cloze** — emitted by `scripts/lib/pipeline/capability-stage/projectors/vocab.ts:163-203` (Decision 5b). Intended to power a "fill the blank in this dialogue line" exercise. The cloze and cloze_mcq exercises exist (`renderContracts.ts:73-82`) but both restrict to `supportedSourceKinds: ['item']`. Inert.
- **affixed_form_pair / root_derived_*** — emitted by `scripts/lib/pipeline/capability-stage/projectors/morphology.ts`. Would power a paired-form recognition exercise (root word → derived word). No exercise type exists for this yet.

The code comment at `src/lib/capabilities/capabilityContracts.ts:67-70` names two of these explicitly:

> Cap_types whose source kind no current exercise supports — contextual_cloze (dialogue_line), root_derived_* (affixed_form_pair) — also return [] until the capabilityContentService fold widens supportedSourceKinds.

## Artifact-level confirmation

Inert capabilities are also incomplete at the artifact level. A `dialogue_line:contextual_cloze` capability declares it requires `['cloze_context', 'cloze_answer', 'translation:l1']` artifacts (`projectors/vocab.ts:189`), but no emitter writes those artifact rows for dialogue-line capabilities. A sample L9 cap: `id=feb36140-c928-43a7-8080-b74f1aa00869, source_ref=lesson-9/section-1/line-10` has zero `capability_artifacts` rows. So even if the runtime gate opened, there is no artifact data to render against.

## What this means for current work

- **Authoring more `dialogue_line` clozes in `cloze-contexts.ts` is busy-work** until the runtime fold widens `supportedSourceKinds` and a `cloze-artifact` emitter writes the three required artifact rows. This is the trap that almost consumed a session on 2026-05-21.
- **The 94 pattern-sourced capabilities can probably be removed entirely** — grammar exercises are wired through the authored-variants path, not the projection-capability path. A cleanup migration to delete them + a projector change to stop emitting them would simplify the data model. Sketch the design before doing this; confirm no part of the readiness/progress UI references pattern-source-kind caps.
- **The 4 affixed_form_pair caps and the dialogue_line caps are sketches of future features** — keep them in the projection pipeline so the work-in-progress data accumulates, but understand they produce nothing user-facing until the runtime is widened.

## Closing the gap (cost estimates)

Smallest to largest:

1. **Trim `pattern` caps from the projector** — *small*. Probably a half-day refactor + a cleanup migration. Reduces dark-matter rows by ~94 of 4005 (2.3%).
2. **Wire `dialogue_line:contextual_cloze`** — *small-to-medium*. Three code touches: (a) open the front-door check at `capabilityContentService.ts:215-220` to accept `dialogue_line`, (b) widen `supportedSourceKinds` in `renderContracts.ts` for `cloze` and `cloze_mcq`, (c) define the builder input shape when there is no learning item (the line text comes from `lesson_sections.content.lines`). Plus a runner change to emit the three artifact rows per dialogue cloze entry at publish time.
3. **Wire `affixed_form_pair:root_derived_*`** — *medium*. Same fold as dialogue_line, plus a new exercise type for paired-form recognition (new UI component). The data has been emitted for some time; nothing consumes it.
4. **Wire podcasts (`podcast_segment` + `podcast_phrase`)** — *medium-to-large*. Not just runtime — the projection pipeline doesn't emit anything for podcasts at runtime today. Audio fetching, segmentation, plus the runtime fold.

## Adjacent issues found while investigating

- **L5's dialogue chunks ≠ dialogue lines.** `scripts/data/staging/lesson-5/learning-items.ts` has `dialogue_chunk` items whose `base_text` is a sub-string of the corresponding `line.text` in `lesson.ts` (the line is broken into smaller chunks). L9's convention is `chunk.base_text === line.text` exactly. If/when dialogue_line caps become renderable, L5's data won't line up without alignment — the cloze-creator agent's spec (`.claude/agents/cloze-creator.md:91`) assumes `chunk.base_text` === full line, which only holds when chunks are 1:1 with lines.
- **Ghost legacy `learning_items` rows.** 45 rows have `normalized_text !== itemSlug(base_text)` (11 active) — residue from the now-deleted `scripts/seed-learning-items.ts`, which used a punctuation-stripping normalization. Modern `itemSlug` preserves punctuation. Cleanup is independent of the runtime fold; tracked in the followup memory file.

## See also

- `docs/adr/0006-every-lesson-derived-capability-has-an-introducing-lesson.md` — why `lesson_id` is required on every non-podcast capability.
- `src/lib/capabilities/capabilityTypes.ts` — the union types this doc summarises.
- `scripts/check-supabase-deep.ts` HC8 (lesson_id present) + HC9 (item source_ref resolvable) + HC10 (item caps reference active items) — health checks that watch the item-sourced data path.
