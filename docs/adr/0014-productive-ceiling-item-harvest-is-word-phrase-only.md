# ADR 0014: The Productive Ceiling — Item-Harvest Is Word/Phrase Only

## Status

Accepted. Complements **ADR 0007** (receptive-before-productive staging) and is the operational form of the item-harvest rule in `CONTEXT.md` → Learning Item.

## Context

The harvester turned whole **sentences** and **dialogue lines** into `learning_items` (`item_type` `sentence` / `dialogue_chunk`). Like any item, each then received the full item capability suite — including the two **typed-production** types `form_recall` (type the whole Indonesian sentence from the Dutch cue) and `dictation` (type the whole sentence from audio), plus `meaning_recall` (type the whole Dutch translation).

A 2026-06 audit of real usage (user `7eaacda5`, 769 review events) found this is a primary failure source:

- An 11-word grammar-example sentence (`"Ada yang dari negeri Belanda dan ada yang dari negeri Jerman."`) was failed **18 of 28** attempts; two L5 dialogue lines failed 14× and 13×.
- Course-wide, **56 distinct ≥5-word "items"** produce the item suite; dialogue lines run up to **40–47 words**. Asking a learner to retype a 40-word line verbatim is not retrieval practice.

This is undesirable difficulty, not desirable difficulty. The SLA evidence (our `memory/research_audio_sla.md`; Bjork's desirable difficulty; the ~85%-success target for spaced retrieval; working-memory / chunk-size limits; Nation/Webb receptive-before-productive) all point the same way: **verbatim productive recall belongs at the lexical-chunk level, not the sentence level.** `CONTEXT.md` already named the `dialogue_chunk` item rows as "over-harvest — to be dropped"; this ADR records the decision and its boundary.

ADR 0007 *sequences* the productive caps that exist (a productive cap unlocks only after a receptive sibling matures). It does **not** bound *which* caps a source produces — a 40-word line still mints `form_recall` + `dictation`, merely staged later. The ceiling is a separate, prior decision: such caps should never exist.

## Decision

**Item-harvest is restricted to lexical chunks.** Only `item_type` ∈ {`word`, `phrase`} is harvested as a `learning_item` and given the item capability suite. The `sentence` and `dialogue_chunk` types produce **no item capabilities**. **Kind is the gate**; a word-count guard (a `word`/`phrase` running ≥ ~6 words) is a secondary flag for a likely mis-tag, never a rule on its own.

Nothing learnable is lost when a sentence/line is dropped from item-harvest:

- its **lexical** content is still scheduled as the separate `phrase` items extracted from it;
- its **grammar** is still scheduled as a `pattern` capability;
- a **dialogue line** keeps its `contextual_cloze` (`dialogue_line` source) — the learner types one blanked word, not the whole line;
- the sentence/line itself **remains visible to the learner** in the lesson reader as the grammar example, dialogue, or book exercise it always was (Lesson-Stage content).

Leftovers (un-clozable dialogue lines, example sentences) become **reader-only** — no scheduled capability. A `sentence`/`dialogue_chunk` whose text is *not* present in the lesson's rendered content is **flagged on drop** (a reader gap or a spurious harvest), never silently discarded.

Enforcement lives in the **Capability Stage** (per ADR 0012 it owns `learning_items` generation); the Lesson Stage keeps recording every dialogue line and example sentence faithfully as content.

## Considered alternatives

- **Serve-time gate in `pedagogy.ts` ("Solution A").** Suppress productive caps for long items at session-build time. *Rejected:* it leaves the bad caps in the catalog (still carrying FSRS state, still counted), and it conflates "this cap should not exist" with "this cap is not yet unlocked" — which is exactly ADR 0007's job. The cleaner cut is at harvest.
- **`exposure_only` capabilities for the leftovers.** Mint a row marked `exposure_only` for un-clozable lines. *Rejected:* redundant with the reader, which already provides the exposure; extra rows and pipeline work for no scheduling benefit. (`exposure_only` earns its keep for podcasts, where listening *is* the practice.)
- **Cloze every `sentence`.** *Rejected:* new authoring scope, and example sentences are not dialogue — their grammar is already drilled via the `pattern` capability.

## Consequences

- **56 already-published over-harvested caps are soft-retired** (`retired_at`), targeting `source_kind='item'` caps whose source is a `sentence`/`dialogue_chunk` — leaving `dialogue_line` cloze caps untouched. This is a targeted, DB-resident correction consistent with **ADR 0011** (seed-once; corrections live in the DB), *not* a destructive `--regenerate`.
- `learner_capability_state` rows are **left inert** — the session builder already excludes retired catalog capabilities, so dangling learner rows never surface; review history is kept as the audit trail.
- The Capability Stage's existing retire-sweep cleans the over-harvest on any future re-publish; a one-off backfill script retires the existing 56 so no mass re-publish is required.
- The productive ceiling and ADR 0007's staging are complementary: 0014 decides *which* productive caps exist; 0007 decides *when* the surviving ones unlock.
