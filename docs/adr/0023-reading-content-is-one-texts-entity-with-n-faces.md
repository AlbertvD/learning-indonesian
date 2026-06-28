# ADR 0023 — Reading content is one `texts` entity with N faces (audio optional)

- **Status:** accepted
- **Date:** 2026-06-28
- **Deciders:** architect, data-architect (reader Phase 2 design, `docs/plans/2026-06-28-reader-phase-2-design.md`)
- **Supersedes / amends:** extends ADR 0022 (story podcasts)

## Context

The Lezen reader (PRD #299) already re-presents the story-podcast transcripts as
readable text. Phase 2 adds **read-only** content (longer stories too long to narrate),
which has a transcript but **no audio**. The `podcasts` table could not hold such a row:
`audio_path` was `NOT NULL`.

A podcast and a read-only story are nearly the same object — a story with an
ID/NL/EN-aligned transcript. The only difference is whether a narration recording
exists. Modelling them as two tables (`podcasts` + a new `reading_texts`) would
duplicate `transcript_segments` / `attribution` / `level` and force the reader to read
two sources that drift — the failure mode the durability gate flagged.

## Decision

Generalize storage to **one `texts` entity where audio is optional** ("a Text with N
faces"):

- 🎧 **Listen** face — needs audio (`audio_path` set); the Podcasts page.
- 📖 **Read** face — needs only the transcript; available to *every* text (Lezen).
- 🎴 **Study** face — harvest the text's words; available to every text.

A "podcast" is simply *a Text that has a Listen face*. Concretely: rename
`podcasts` → `texts`, make `audio_path` **nullable**. The single definition of "is a
podcast" (`audio_path != null`) lives in `textService` (`listPodcasts` filters; the
reader's `listTexts` does not), never duplicated.

Build-stage (disposable data) makes this a clean rename rather than an additive
parity rollout. The migration is idempotent (`ALTER TABLE IF EXISTS … RENAME` + `CREATE
IF NOT EXISTS` + `ALTER … DROP NOT NULL`), preserving existing story-podcast data on
every `make migrate` while dropping the stale `podcasts_*` policy names in favour of
`texts_*`.

## Consequences

- Read-only texts are first-class storage; new content (ADR 0022-style LLM-authored or
  CC-BY) seeds as `texts` rows with `audio_path = NULL`.
- `podcastService` → `textService` (a within-boundary file rename; it stays a thin
  service, target-architecture §`podcastService` LOCKED). The `Podcast` row *type* name
  is retained (its primary consumers are the podcast surfaces); semantically it is a Text.
- The `indonesian-podcasts` storage bucket is **not** renamed (read-only texts write
  nothing to it). The `podcast_segment_src`/`podcast_phrase_src` capability source-kinds
  (dead, 0 rows) are unaffected.
- Health checks track `texts` (grants/RLS/policy parity, HC36 transcript consistency).

## Alternatives rejected

- **Separate `reading_texts` table** — duplicates the transcript/attribution/level shape;
  reader reads two sources that drift (durability-gate failure mode d).
- **`audio_path` nullable but keep the name `podcasts`** — lasting naming debt; a
  read-only story in a table called `podcasts` contradicts the glossary.
