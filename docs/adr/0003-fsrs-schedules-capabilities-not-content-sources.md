# ADR 0003: FSRS Schedules Capabilities, Not Content Sources

## Status

Accepted

## Context

A single word, phrase, lesson section, podcast segment, or morphology pattern can require multiple distinct memory traces across direction and modality.

## Decision

FSRS schedules only active learner capabilities. Content sources and content units provide provenance, sequencing, and lesson context, but they are not the direct FSRS scheduling unit.

## Consequences

- Recognition, recall, listening, dictation, cloze, and production-like facets can mature separately.
- Podcast and morphology features can reuse the same scheduling model.
- Source progress controls eligibility, not review scheduling directly.

> Narrowed by ADR 0027 (2026-07-08): for the vocabulary facet specifically, the per-facet model above is
> bounded to 3 introduced modes (2 at rest after graduation) rather than every facet combination — the
> per-word FSRS load must stay finite even though facets can mature separately in principle.
