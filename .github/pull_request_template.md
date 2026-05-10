## Summary

<!-- 1-3 bullets on what this PR changes and why. -->

## Plan status update (if this PR implements a plan in `docs/plans/`)

If this PR implements (in whole or in part) any plan(s) under `docs/plans/`:

- [ ] The plan's YAML frontmatter `status` field is updated:
  - `status: implementing` while this PR is open
  - `status: shipped` once merged (can be set in the same commit as the merge or as a follow-up if the PR is squash-merged)
- [ ] `implementation: PR #<this PR's number>` is filled in
- [ ] `merged_at:` is filled in (when shipping)
- [ ] `implementation_paths:` lists the directories/files where the plan's code lives

**Why this matters:** the `Plan status awareness` section in `CLAUDE.md` requires every plan's frontmatter to reflect its true state. Agents (architect, developer) read frontmatter to decide whether to treat a plan as forward work or as a changelog. A shipped plan whose frontmatter still says `approved` will mislead future analysis. See the lesson-stage spec (`docs/plans/2026-05-08-pipeline-cleanup-for-lessons-fold.md`) for the reference frontmatter shape.

## Test plan

<!-- Bulleted markdown checklist of TODOs for testing this PR. -->
- [ ] `bun run lint` clean
- [ ] `bun run test --run` passes
- [ ] `bun run build` clean
- [ ] `make pre-deploy` clean (if migration or schema changes)

## Notes / follow-ups

<!-- Anything reviewers should know. -->
