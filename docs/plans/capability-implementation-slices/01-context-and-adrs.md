# Slice 01: Context and ADR Baseline Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL when implementing: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create project vocabulary and ADRs so future implementation and reviews do not re-litigate the target architecture.

**Architecture:** This slice adds documentation only. It creates the domain language and decision record that later Modules must follow.

**Tech Stack:** Markdown docs only.

**Architecture References:**
- `docs/plans/2026-04-25-capability-based-learning-architecture.md`
- `docs/plans/2026-04-25-capability-content-pipeline-and-exercises.md`
- `docs/plans/2026-04-25-learning-experience-ui-audio-mastery.md`
- `docs/plans/2026-04-25-capability-architecture-migration-roadmap.md`

---

## Scope

Create domain and ADR docs. No runtime code, migrations, or UI changes.

## Files

- Create: `CONTEXT.md`
- Create directory if missing: `docs/adr/`
- Create: `docs/adr/0001-capability-based-learning-core.md`
- Create: `docs/adr/0002-stages-are-derived-not-scheduling-authority.md`
- Create: `docs/adr/0003-fsrs-schedules-capabilities-not-content-sources.md`
- Create: `docs/adr/0004-capability-review-commits-are-atomic-and-idempotent.md`
- Create: `docs/adr/0005-lesson-reader-emits-source-progress-not-fsrs-activation.md`

## Required CONTEXT Terms

Define at least:

```text
Content Source
Content Unit
Learning Capability
Capability Contract
Typed Artifact
Capability Readiness
Learner Activation State
Source Progress
Lesson Page Block
Review Processor
Exercise Resolver
Session Composer
Lesson Experience Module
Mastery Model
```

## ADR Decisions

- ADR 0001: schedule learning capabilities, not raw content rows.
- ADR 0002: stages are derived labels, not scheduling authority.
- ADR 0003: FSRS schedules only active memory traces.
- ADR 0004: capability review commits are atomic and idempotent.
- ADR 0005: the Lesson Reader records source progress but never directly activates FSRS review.

## Verification

Run:

```bash
bun run build
```

Expected: build still succeeds because docs only.

## Acceptance Criteria

- Terms match the architecture docs.
- ADRs are short, decisive, and implementation-relevant.
- No runtime behavior changes.

## Out Of Scope

- New TypeScript types.
- DB migrations.
- UI changes.
