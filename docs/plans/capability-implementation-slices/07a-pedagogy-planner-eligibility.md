# Slice 07A: Pedagogy Planner Eligibility Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL when implementing: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Decide which ready dormant capabilities a learner is eligible to activate, using source progress, prerequisites, evidence, goals, and load budgets.

**Architecture:** Add a Pedagogy Planner Module whose Interface owns learner eligibility and activation recommendations without updating FSRS, rendering exercises, or writing review events.

**Tech Stack:** TypeScript, Vitest, existing learner/session services.

**Architecture References:**
- `docs/plans/2026-04-25-capability-based-learning-architecture.md`
- `docs/plans/2026-04-25-learning-experience-ui-audio-mastery.md`
- `docs/plans/2026-04-25-capability-content-pipeline-and-exercises.md`

---

## Scope

Eligibility and recommendation logic only. Read-only: it reads source progress, learner capability state, recent evidence, and goals. It never writes learner state, FSRS state, source progress, or review events. Session Composer consumes this later.

## Files

- Create: `src/lib/pedagogy/pedagogyPlanner.ts`
- Create: `src/lib/pedagogy/sourceProgressGates.ts`
- Create: `src/lib/pedagogy/loadBudgets.ts`
- Create: `src/__tests__/pedagogyPlanner.test.ts`
- Create: `src/__tests__/sourceProgressGates.test.ts`
- Create: `src/__tests__/loadBudgets.test.ts`
- Modify: `src/services/sourceProgressService.ts` only if Slice 05 already exists and needs read helpers.

## Interface

```ts
export type CurrentSessionMode = 'standard' | 'backlog_clear' | 'quick'
export type FutureSessionMode = 'listening_focus' | 'pattern_workshop' | 'podcast'
export type PlannerSessionMode = CurrentSessionMode | FutureSessionMode

export interface PedagogyInput {
  userId: string
  mode: PlannerSessionMode
  now: Date
  readyCapabilities: LearningCapability[]
  learnerCapabilityStates: LearnerCapabilityState[]
  sourceProgress: LearnerSourceProgress[]
  recentReviewEvidence: ReviewEvidence[]
  goals?: LearnerGoal[]
}

export interface EligibleCapability {
  capability: LearningCapability
  activationRecommendation: {
    recommended: true
    reason: PlannerReason
    requiredActivationOwner: 'review_processor'
  }
}

export interface LearningPlan {
  eligibleNewCapabilities: EligibleCapability[]
  suppressedCapabilities: SuppressedCapability[]
  loadBudget: LoadBudgetDecision
  reasons: PlannerReason[]
}

export function planLearningPath(input: PedagogyInput): LearningPlan
```

## Session Mode Vocabulary

Current repo modes from `src/lib/sessionQueue.ts` map as follows:

- App `standard` maps to planner daily learning behavior.
- App `backlog_clear` maps to backlog clear behavior.
- App `quick` maps to quick session behavior.

Future planner modes `listening_focus`, `pattern_workshop`, and `podcast` are planned vocabulary only and must not be wired into current session routes until separate UI/session specs implement them.

## Eligibility Gates

All must pass. Session mode may tighten load budgets or prerequisites, but it must never override fail-closed readiness.

- capability readiness is `ready`
- required source progress is satisfied
- prerequisite capabilities are satisfied
- difficulty jump is acceptable
- recent failure/fatigue rules do not suppress it
- mode load budget allows it
- capability is useful for current goals or current lesson path

## Source Progress Rules

Use the documented source progress states:

```text
not_started
opened
section_exposed
intro_completed
heard_once
pattern_noticing_seen
guided_practice_completed
lesson_completed
```

Default capability requirements:

- `text_recognition`: `section_exposed`
- `form_recall`: `intro_completed` or text recognition evidence
- `audio_recognition`: `heard_once` and text recognition introduced
- `pattern_recognition`: `pattern_noticing_seen` or `section_exposed`
- `pattern_production`: `guided_practice_completed` and recognition evidence

## Load Budget Rules

- Backlog clear: no new capabilities.
- Quick: no heavy concepts, at most one small new item if explicitly allowed.
- Daily/standard: limited lexical introductions, at most one new pattern idea.
- Pattern workshop: one target pattern and one contrast pattern.
- Podcast: mostly exposure, at most 1-3 mined phrase capabilities.

## Activation Boundary

The planner returns eligibility and activation recommendations only. The persisted transition from dormant or absent learner state to active learner state is owned by the Review Processor when the learner submits the first committed answer/introduction-completion review for that capability.

## Verification

Run:

```bash
bun run test -- src/__tests__/pedagogyPlanner.test.ts src/__tests__/sourceProgressGates.test.ts src/__tests__/loadBudgets.test.ts
bun run build
```

## Acceptance Criteria

- Lesson-sequenced content is not eligible before required source progress.
- Remediation can use learner evidence instead of lesson completion where allowed.
- Backlog mode suppresses new capabilities.
- Planner returns reasons that can be shown in Today/recommendation UI.
- Planner does not update learner state, source progress, review events, activation state, or FSRS.

## Out Of Scope

- Session composition.
- Exercise resolution.
- Review event writes.
- UI recommendation rendering.
