# ADR 0005: Lesson Reader Emits Source Progress, Not FSRS Activation

## Status

Accepted

## Context

Lessons derived from book content should feel web-native and should prepare learners for practice. But reading a lesson is not the same as committing a review or activating a memory trace.

## Decision

The Lesson Reader emits source progress events such as opened, section exposed, intro completed, heard once, pattern noticing seen, guided practice completed, and lesson completed. It may link to capability keys for practice bridges, but it does not directly activate FSRS review.

## Consequences

- Pedagogy Planner can use lesson progress to decide eligibility.
- Review Processor remains the activation/write owner.
- Lesson UI can improve independently from scheduling and review logic.
