# Slice 12: Learning Experience Player Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL when implementing: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Render block-based SessionPlans after the core capability path is stable.

**Architecture:** Add an Experience Player UI Module that renders session blocks while Exercise Frame handles individual exercises.

**Tech Stack:** React 19, CSS Modules, Vitest/React Testing Library.

**Architecture References:**
- `docs/plans/2026-04-25-learning-experience-ui-audio-mastery.md`
- `docs/plans/2026-04-25-capability-based-learning-architecture.md`

---

## Scope

Daily tutor blocks only at first: warm input, due review, new introduction, recap.

## Prerequisites

- Slice 09 Session Composer exists and produces `SessionPlan`.
- `VITE_EXPERIENCE_PLAYER_V1` is implemented by Slice 01A and defaults disabled.

## Files

- Create: `src/components/experience/ExperiencePlayer.tsx`
- Create: `src/components/experience/ExperiencePlayer.module.css`
- Create: `src/components/experience/blocks/WarmInputBlock.tsx`
- Create: `src/components/experience/blocks/DueReviewBlock.tsx`
- Create: `src/components/experience/blocks/NewIntroductionBlock.tsx`
- Create: `src/components/experience/blocks/RecapBlock.tsx`
- Create: `src/__tests__/ExperiencePlayer.test.tsx`
- Modify: `src/pages/Session.tsx` behind `VITE_EXPERIENCE_PLAYER_V1`.

## Interface

```tsx
export function ExperiencePlayer(props: {
  plan: SessionPlan
  onAnswer: (event: SessionAnswerEvent) => Promise<void>
  onComplete: () => void
}): JSX.Element
```

`SessionAnswerEvent` is an answer report emitted by the UI. It is not a grading decision, FSRS rating, review event row, or learner-state update. The Review Processor remains the write owner for grading validation, review commits, activation, and FSRS state.

## UI Requirements

- `VITE_EXPERIENCE_PLAYER_V1` is a separate disabled-by-default flag from `VITE_CAPABILITY_STANDARD_SESSION`; enabling capability-composed sessions must not automatically enable the richer block UI.
- Mobile and desktop support.
- Keyboard-accessible flow.
- Exercise Frame remains the exercise render seam.
- Audio controls do not conflict with existing audio contexts.
- Visual design should be web-native and intentional, not a book/PDF reconstruction.

## Verification

Run:

```bash
bun run test -- src/__tests__/ExperiencePlayer.test.tsx src/__tests__/sessionFlow.test.tsx
bun run build
```

## Acceptance Criteria

- Existing session UI remains available behind fallback.
- `VITE_EXPERIENCE_PLAYER_V1=false` leaves the existing session UI unchanged even when `VITE_CAPABILITY_STANDARD_SESSION=true`.
- Recap explains which capabilities changed.
- No special cases are added to `sessionQueue.ts` for rich blocks.
- Answer events flow to Review Processor compatibility path rather than directly mutating review state.

## Out Of Scope

- Podcast listening block.
- Morphology workshop block.
- Lesson Reader.
