---
status: approved
reviewed_by: [architect, data-architect, staff-engineer]
supersedes: []
---

# Vocab annotation cleanup + TTS contamination fix

> **Revision note (2026-06-24).** Reviewed across three rounds by `architect`, `data-architect`,
> and `staff-engineer`. Round 1 found the draft reinvented a live cleaner, specified a writer that
> doesn't exist, and duplicated an existing gate. Round 2 (this file's prior version) fixed those
> but introduced a new defect — a projection-time slash auto-collapse that would silently drop
> genuine synonyms (`abu-abu / kelabu`→`abu-abu`) for all future content and self-contradicted the
> "split genuine synonyms" rule. **This revision removes that auto-collapse**: every synonym bundle
> is a one-time hand-edit, and recurrence is a *warning* (author chooses collapse-vs-split), never a
> silent transform. The plan is now ~22 hand-edits + a republish + an optional one-line warn. The
> `data-architect` approved the prior version on schema grounds (no schema change; removing the
> base_text auto-mutation only shrinks that surface). A final `architect` pass is the gate before
> `status: approved`.

## Context

Ten admin content-flags submitted in-app (`indonesian.content_flags`) cluster around vocabulary
items whose canonical Indonesian string carries authoring annotations — synonym lists joined by
`/` or `,`, and coursebook pronunciation respellings in parentheses (`becak (bècak)`). Stored
verbatim, the annotation both clutters the displayed word and is fed to Google Cloud TTS, which
voices the separators ("bus **slash** bis") or the bracketed respelling as a second word.

A live-DB scan of all **2,171** `learning_items` established the affected surface and proved the
problem does **not** uniformly generalize — the separator characters encode six things, only two
of which are defects:

| Category | ~Count | Action |
|---|---|---|
| Parenthetical respellings / glosses (`becak (bècak)`, `rupiah (rp)`) | ~33 | **Already fixed at projection — just republish (§A)** |
| Synonym / variant bundles, slash + comma (`bus/bis`, `nol, kosong`, `cengkeh, cengkih`) | ~22 | **Hand-edit the canonical form (§B)** |
| Reduplication (`anak-anak`), morphology (`dagang, pe-`), dialogue sentences, Dutch grammar prompts | ~220 | **Leave — separators are correct here** |

## Why the obvious "fixes" are wrong (kept so the next reader doesn't re-propose them)

- **Don't change `normalizeTtsText`.** It is a shared writer↔reader key (`scripts/lib/tts-normalize.ts`
  + `src/lib/ttsNormalize.ts`, used by the synth and the frontend `audioService`). Changing it
  re-keys every clip in the library and still wouldn't clean the *display* string.
- **Don't blanket-split on separators.** That would corrupt the ~220 "Leave" items.
- **Don't auto-collapse a bundle to its first element at projection** (the rejected round-2 idea).
  Whether a slash/comma pair is a *spelling variant* (collapse to one form) or a *genuine synonym*
  (split into two cards, §B.3) is a human lexical judgment. A deterministic "take the first
  element" rule silently drops the second word of every future synonym pair (e.g. `abu-abu /
  kelabu`→`abu-abu`) and removes the author's chance to split. So bundles are hand-edited once
  (§B), and recurrence is surfaced as a *warning* for an author decision (§C), never auto-collapsed.

## §A — Parenthetical items: republish (no edits)

`scripts/lib/clean-item-text.ts` (`cleanItemText`) already strips orthographic parentheticals
from vocab headwords at projection time, wired at three read points:
`lesson-stage/projectSections.ts:190` (→ `learning_items.base_text`),
`lesson-stage/runner.ts:471` (→ TTS input), and `lesson-stage/adapter.ts:20`
(`cleanSectionDisplayContent` → the reader's on-page word list). Verified:
`becak (bècak)`→`becak`, `rupiah (rp)`→`rupiah`, `k(e)ran`→`keran`, `tidak (ada) apa-apa`→
`tidak ada apa-apa`. So the ~33 dirty rows in the live DB are **stale rows from lessons published
before `cleanItemText` was wired**.

- **A.1** Re-scan the live DB for `base_text` still containing ` (`; map the rows to their lessons.
- **A.2** Republish those lessons (`bun scripts/publish-approved-content.ts <N>`). Re-projection
  applies `cleanItemText`; re-synthesis produces clean audio. No staging edits, no TTS spot-check
  (the cleaner's design note already settled that Chirp3-HD voices the clean form correctly).

## §B — Synonym bundles: hand-edit the canonical form (~22, one-time)

Slash and comma bundles are both edited by hand in the owning staging `learning-items.ts` — there
is no auto-rule (see "Why the obvious fixes are wrong"). The scan undercounts slightly: at least
one paren+slash time expression (`jam tujuh (malam) pas/tepat`, lesson-6) is a slash item not in
the first enumerated set, so **§B.0 re-scans `base_text` for any bare `/` or `, ` (vocab/expression
items only) to get the exact working list** before editing.

- **B.0** Re-scan for the exact slash/comma bundle set (don't trust the draft's enumerated 7+15).
- **B.1** **Spelling variants** (`bus/bis`, `tapi / tetapi`, `cengkeh, cengkih`, `nol, kosong`, …):
  pick the single canonical/standard form and set `base_text` to it. Eyeball each — the standard
  form is not always the first element (`tapi / tetapi` → `tetapi` is the fuller standard word).
- **B.2** **Genuine synonyms** (`tubuh`/`badan`, `bandar udara`/`lapangan terbang`, `abu-abu`/
  `kelabu`): two *different* words each worth learning — **split into two separate `learning_items`**,
  don't collapse to one card. (Verified clean: `tubuh` and `badan` get distinct `normalized_text`,
  so two independent items project to independent capabilities with no key collision.)
- **B.3** **Delete the duplicate** `naik sepeda/bus/mobil` — `naik bus` / `naik mobil` / `naik
  sepeda` already exist as separate items (verified live); the combined phrase is a redundant row.
  Remove it from `lesson-3/lesson.ts` and republish (the derived `content-units.ts` /
  `sections-catalog.json` regenerate).
- **B.4** Republish affected lessons; verify clean display + audio in-app on a sample, **and
  spot-check the live DB that no stale `bus/bis`-style row is still surfacing** (changed `base_text`
  leaves the old row in the DB with its capabilities soft-retired — invisible to the learner, but
  confirm; a `make migrate` truncate-rebuild clears the orphan if wanted).

### Dropped: accepted-answer variants

The first draft proposed preserving the alternate spelling as an accepted answer via
`item_answer_variants`. **There is no pipeline writer for that table** — it is read-only at runtime
(verified: zero writes in `scripts/`; the CS19 validator's own comment documents the absence). So
"demote to accepted variant" would require building a staging→projector→adapter write path for a
table nothing currently writes — new mechanism to solve a problem this plan would create. For a
build-stage, single-author, disposable-data app, the minimum-mechanism choice is to **pick one
canonical form and drop the orthographic twin.** Accepting both spellings is a deliberate future
feature (build the writer once, for all variants) — not a rider on a cleanup.

## §C — Recurrence warning (optional, small CS19 extension)

A separator-convention gate already exists: `validateItemSeparatorConvention` (CS19), wired into
the vocab gate (`vocabulary/gate.ts`). Today it flags the Dutch `translation_nl` axis (error) and
Indonesian accepted-answer values (warn); it does **not** check the Indonesian `base_text` headword.

- **C.1** Add a **warn** to `validateItemSeparatorConvention` when a vocab `base_text` (item_type
  `word`/`phrase` only — the existing discriminator that already excludes dialogue/sentence items)
  contains a bare `/` or `, `, with the morphology/reduplication exemption. **Implementation note:**
  this is a *new* check added inside the CS19 validator keyed on `item_type`; it is **not** a reuse
  of `classifyIndonesianSeparator` (that helper only flags `;` and takes no exempt arg). Warn-level
  only — it surfaces the bundle so the author makes the §B.1-vs-§B.2 (collapse-vs-split) call;
  it does not block or transform.
- **Not doing:** a parallel new validator, a projection-time auto-transform, or a deep-check health
  assertion. Two enforcement points (or a silent transform) for one stylistic smell on a
  single-author pre-launch corpus is the live-system safety machinery Operating Context says to
  skip. **§C is optional** — defer it if §A–§B clear the flags and recurrence proves rare.

## Out of scope (separate flags — do the first one FIRST)

Three flagged items are unrelated to annotation contamination. The first is a real functional bug
and is **more user-visible than this entire cosmetic cleanup** — fix it first:

1. **ini/itu `transform_sentence_ex` — "This answer does not work"** (cap `7d274a01…`, lesson-2):
   accepted-answer-variant bug in a grammar exercise. **Highest priority of the ten flags.**
2. **L3 dialogue cloze `type_missing_word_ex` — "no explanation"** (cap `6f53caaf…`): exercise-shell
   UX gap (no instruction prompt).
3. **`dua` `type_form_from_audio_ex` — "mispronounced"** (cap `e245c523…`): plain TTS model
   mispronunciation of a clean word; re-synth / pronunciation override.

## Supabase Requirements

### Schema changes
- **None.** §A/§B change only `base_text` *values* (staging → re-projection); §C extends an
  existing validator. No new tables/columns. `item_answer_variants` is not touched (the variant
  mechanism was dropped). `data-architect`-confirmed on the prior version.
- **RLS / grants:** N/A.

### homelab-configs changes
- PostgREST / Kong / GoTrue / Storage: **all N/A** (no schema, re-synthesis reuses the existing
  `indonesian-tts` bucket).

### Health check additions
- **None.**

## Tasks (ordered)

- **0.** (Out-of-scope #1) Fix the ini/itu accepted-answer bug — most user-visible. *Tracked
  separately; do first.*
- **A.1–A.2** Re-scan dirty `base_text` parens → republish those lessons.
- **B.0–B.4** Re-scan the exact bundle set; hand-edit spelling variants to one canonical form; split
  genuine synonyms into separate items; delete the `naik …` duplicate; republish; verify in-app +
  DB spot-check.
- **C.1** (optional) CS19 `base_text` warn-extension + unit test.
- Resolve the corresponding `content_flags` rows as each item is fixed.

## Verification

- Re-run the ground-truth scan post-republish: parens and slash/comma bundles drop to ~0 in
  `base_text`; the ~220 "Leave" items are unchanged in count.
- In-app: previously-flagged cards show single clean words; audio voices no separator/respelling.
  Live-DB spot-check: no stale orphan row surfacing.
- `bun run test` green (if §C is built, its validator test).
