# Slice 14: Podcast and Morphology Expansion Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL when implementing: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Prove the capability model extends beyond vocabulary by adding one podcast/story source and one morphology pattern pilot.

**Architecture:** Use existing capability contracts, Pedagogy Planner, scheduler, resolver, review processor, source progress, and mastery model without new special-case session branches.

**Tech Stack:** TypeScript, existing podcast/staging scripts, Vitest.

**Architecture References:**
- `docs/plans/2026-04-25-capability-based-learning-architecture.md`
- `docs/plans/2026-04-25-learning-experience-ui-audio-mastery.md`

---

## Scope

After core seams are stable, add one podcast/story pilot and one morphology pattern pilot.

## Files

- Modify: `scripts/data/podcasts.ts` for podcast metadata if it remains the repo's metadata source.
- Create staged podcast capability files under `scripts/data/staging/podcast-<slug>/` for the pilot. Do not introduce `content/stories` until a separate source-ingestion ADR chooses that convention.
- Modify or create morphology staging data under `scripts/data/staging/lesson-N/grammar-patterns.ts` / future `morphology-patterns.ts`.
- Add tests: `src/__tests__/podcastCapabilityProjection.test.ts`
- Add tests: `src/__tests__/morphologyCapabilityProjection.test.ts`
- Add resolver tests for morphology and podcast capabilities.

## Podcast MVP

- one segmented transcript using `transcript_segment` artifacts
- slow/normal audio where available using `audio_segment` artifacts
- guided transcript
- gist prompt using `podcast_gist_prompt`
- 1-3 mined phrase capabilities using `timecoded_phrase`
- exposure-only segment support

## Morphology MVP

- one pattern: `meN- active verbs`
- recognition capability
- derived-to-root capability using `root_derived_pair`
- root-to-derived capability only after recognition evidence
- allomorph explanation using `allomorph_rule` where needed
- contrast with `di-` only when content is ready
- no broad production mastery claims

## Verification

Run:

```bash
bun run test -- src/__tests__/podcastCapabilityProjection.test.ts src/__tests__/morphologyCapabilityProjection.test.ts src/__tests__/exerciseResolver.test.ts
bun scripts/check-capability-health.ts
bun run build
```

## Acceptance Criteria

- Podcast and morphology use the same Capability Catalog, Contract, Pedagogy Planner, Scheduler, Resolver, Review Processor, and Mastery Model seams.
- No new `sessionQueue.ts` special-case branch for podcast or morphology.
- Podcast segment can stay exposure-only.
- Morphology mastery remains facet-specific.
- Planner load budgets control when mined phrases and morphology patterns become eligible.

## Out Of Scope

- Open-ended conversation grading.
- AI pronunciation scoring.
- Full podcast subscription system.
- Full morphology syllabus.
