# ADR 0004: Capability Review Commits Are Atomic And Idempotent

## Status

Accepted

## Context

Review submission can be duplicated, stale, or interrupted. Applying FSRS updates and review events through separate writes risks double reviews, lost counters, and inconsistent learner state.

## Decision

Capability review commits are atomic and idempotent. The Review Processor owns validated answer reports, FSRS state transition planning, idempotency, review event persistence, counter updates, and first-review activation. Runtime app code must not write learner capability state or capability review events directly.

## Consequences

- Duplicate submissions return the original committed result.
- Stale scheduler snapshots fail closed.
- Review state bugs localize to the Review Processor seam.
- Reviewed admin backfill remains a migration-time exception, not a runtime scheduling path.
