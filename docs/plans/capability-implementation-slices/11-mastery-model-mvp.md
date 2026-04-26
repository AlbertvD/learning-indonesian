# Slice 11: Mastery Model MVP Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL when implementing: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Derive learner-facing mastery from capability evidence without overclaiming fluency or production ability.

**Architecture:** Add a read-only Mastery Model Module that aggregates capability states, review evidence, source progress, and confidence levels.

**Tech Stack:** TypeScript, existing progress service/components, Vitest.

**Architecture References:**
- `docs/plans/2026-04-25-capability-based-learning-architecture.md`
- `docs/plans/2026-04-25-learning-experience-ui-audio-mastery.md`

---

## Scope

Read-only derivation and one progress panel. No scheduling writes.

## Prerequisites

- Slice 10 creates durable `indonesian.capability_content_units` relationships. `getContentUnitMastery(unitId, userId)` must use that relationship, not loose source-ref string matching.

## Files

- Create: `src/lib/mastery/masteryModel.ts`
- Create: `src/__tests__/masteryModel.test.ts`
- Modify: `src/services/progressService.ts` to consume mastery summaries behind a flag or additive method.
- Optional UI: `src/components/progress/CapabilityMasteryPanel.tsx`
- Optional test: `src/__tests__/CapabilityMasteryPanel.test.tsx`

## Interface

```ts
export function getContentUnitMastery(unitId: string, userId: string): Promise<ContentUnitMastery>
export function getPatternMastery(patternId: string, userId: string): Promise<PatternMastery>
export function getMasteryOverview(userId: string): Promise<MasteryOverview>
```

## Rules

- Use `not_assessed` when evidence is absent.
- Content-unit mastery joins through `capability_content_units` from content unit to capability to learner capability state.
- Track confidence based on sample size, recency, modality spread, and artifact compatibility.
- Do not infer production from recognition.
- Listening, dictation, text recall, and pattern use are separate dimensions.

## Verification

Run:

```bash
bun run test -- src/__tests__/masteryModel.test.ts src/__tests__/progressService.test.ts
bun run build
```

## Acceptance Criteria

- Progress can show capability strength by item and pattern.
- Pattern mastery is weakest-link aware.
- Labels avoid unsupported global fluency claims.

## Out Of Scope

- New scheduling decisions.
- Free production scoring.
- Full progress redesign.
