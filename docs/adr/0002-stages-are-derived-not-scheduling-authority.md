# ADR 0002: Stages Are Derived, Not Scheduling Authority

## Status

Accepted

## Context

Stage labels are useful for learner communication, but using them as scheduling authority makes state transitions brittle and hides which skill facet is actually due.

## Decision

Stages and mastery labels are derived views over capability evidence. They do not decide what FSRS schedules.

## Consequences

- Scheduler reads active learner capabilities and due timestamps.
- Mastery Model can explain learner-facing progress without mutating review state.
- Stage label bugs cannot directly reschedule content.
