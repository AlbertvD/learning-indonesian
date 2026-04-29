# Capability Implementation Slice Index

**Purpose:** Decompose the target capability architecture into implementation-ready slices. Each slice should be reviewed against the architecture docs before code is written.

**Execution Rule:** Implement slices in order unless an ADR explicitly changes the sequence. Later slices assume earlier seams exist and have passing tests.

## Environment Prerequisites

Before executing any slice:

- Install dependencies with `bun install` and verify `bun --version` is available. The repo has `bun.lock`, and the script commands in these specs assume Bun can execute TypeScript files.
- If Bun is unavailable, package scripts may be adapted to `npm install` / `npm run`, but every direct `bun scripts/*.ts` command in a slice must first be replaced by a repo-supported runner.
- Capability migration flags must default to disabled, unlike the existing broad-availability exercise flags:
  - `VITE_CAPABILITY_SESSION_DIAGNOSTICS=false`
  - `VITE_CAPABILITY_REVIEW_SHADOW=false`
  - `VITE_CAPABILITY_REVIEW_COMPAT=false`
  - `VITE_CAPABILITY_STANDARD_SESSION=false`
  - `VITE_EXPERIENCE_PLAYER_V1=false`
  - `VITE_LESSON_READER_V2=false`

## Slice Order

1. `01-context-and-adrs.md` - domain vocabulary and architectural decisions.
2. `01a-runtime-migration-safety.md` - disabled-by-default migration flags and stable session item identity.
3. `02-capability-identity-projection.md` - canonical capability keys and projection from current content.
4. `03-contract-validation-health.md` - readiness validation and health script.
5. `04-session-diagnostics.md` - shadow diagnostics for current session output.
6. `05-capability-tables-materialization.md` - DB tables, canonical-key materialization, source progress storage.
7. `06-capability-review-processor.md` - atomic/idempotent capability review commits and first-review activation ownership.
8. `07a-pedagogy-planner-eligibility.md` - learner eligibility, source progress, and new-load pacing.
9. `07-capability-scheduler-adapter.md` - due capability reads and schedule previews for active capabilities.
10. `08-exercise-resolver.md` - capability-to-exercise render plans.
11. `09-session-composer-mvp.md` - standard daily capability session composer behind a flag.
12. `10-content-pipeline-output.md` - staging/publish capability output and lesson page blocks.
13. `11-mastery-model-mvp.md` - derived learner-facing mastery.
14. `12-experience-player.md` - block-based session experience player.
15. `13-lesson-reader-redesign.md` - modern responsive lesson reader.
16. `14-podcast-morphology-expansion.md` - first podcast and morphology expansion after core seams are stable.

## Global Invariants

- Slice 01A must land before any diagnostic, shadow, compatibility, composer, or lesson-reader flag is read.
- FSRS schedules active capabilities only.
- Content readiness and learner eligibility are separate decisions.
- Capability readiness fails closed and cannot be overridden by session mode.
- Capability readiness statuses use `ready`, `blocked`, `exposure_only`, `deprecated`, and `unknown`.
- Artifact quality statuses use `draft`, `approved`, `blocked`, and `deprecated`.
- Review Processor is the only write owner for review events, learner FSRS state, and idempotent first-review activation of eligible dormant capabilities.
- Pedagogy Planner is read-only: it recommends eligible dormant capabilities but never activates them.
- Session Composer is composition-only: it may include pending activation items, but it does not persist activation.
- Scheduler reads already-active learner capabilities until Review Processor activates new ones.
- Lesson Reader emits source progress; it does not activate FSRS review directly.
- UI must work on mobile and desktop.
- Stages and mastery labels are derived views, not scheduling authority.

## Global Verification

Run after each implemented slice where applicable:

```bash
bun run test
bun run build
```

For script-heavy slices, also run their explicit script tests or help commands; `bun run build` does not prove every script entrypoint is type-safe.

For UI slices, also run browser or Playwright checks once implemented.
