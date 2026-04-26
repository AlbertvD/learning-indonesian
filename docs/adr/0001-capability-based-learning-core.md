# ADR 0001: Capability-Based Learning Core

## Status

Accepted

## Context

The previous design mixed content rows, exercise variants, stages, and review state in ways that made bugs hard to localize. The new architecture needs stable schedulable units that can support vocabulary, grammar, audio, lesson reading, podcasts, and morphology without special-case branches.

## Decision

Schedule learning capabilities, not raw content rows. A content source may produce many capabilities. Each capability has a canonical identity, typed artifacts, readiness, learner activation state, and review evidence.

## Consequences

- FSRS operates on concrete capability memory traces.
- Content import/publishing can evolve without directly corrupting review state.
- Sessions compose from capabilities through Scheduler, Pedagogy Planner, Exercise Resolver, and Review Processor seams.
