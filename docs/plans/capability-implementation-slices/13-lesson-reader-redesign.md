# Slice 13: Responsive Lesson Reader Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL when implementing: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace clunky book-derived lesson display with a modern responsive lesson reader that emits source progress and bridges to practice.

**Architecture:** Add a Lesson Experience Module and UI renderer powered by lesson page blocks from the pipeline.

**Tech Stack:** React 19, CSS Modules, Vitest/React Testing Library, Playwright.

**Architecture References:**
- `docs/plans/2026-04-25-learning-experience-ui-audio-mastery.md`
- `docs/plans/2026-04-25-capability-content-pipeline-and-exercises.md`

---

## Scope

One textbook lesson rendered through the new responsive Lesson Reader. No direct FSRS activation.

## Prerequisites

- Slice 05 source progress persistence and `sourceProgressService` exist for lesson-reader progress events.
- Slice 10 content pipeline output exists for `content-units.ts` and `lesson-page-blocks.ts`.
- `VITE_LESSON_READER_V2` is implemented by Slice 01A and defaults disabled.

## Files

- Create: `src/lib/lessons/lessonExperience.ts`
- Create: `src/components/lessons/LessonReader.tsx`
- Create: `src/components/lessons/LessonReader.module.css`
- Create: `src/components/lessons/blocks/*.tsx` for initial block renderers.
- Create: `src/__tests__/lessonExperience.test.ts`
- Create: `src/__tests__/LessonReader.test.tsx`
- Create: `e2e/lesson-reader.spec.ts`
- Modify: `src/pages/Lesson.tsx` behind `VITE_LESSON_READER_V2`.
- Modify: `src/services/lessonService.ts` only to load lesson page blocks and source progress data.

## Blocks

- lesson hero
- lesson goals
- reading section
- inline example
- vocab strip
- dialogue card
- audio moment
- pattern callout
- noticing prompt
- micro-check
- practice bridge
- lesson recap

## Responsive Requirements

Mobile:

- single-column flow
- large tap targets
- inline or collapsible audio/progress controls
- no hover-only interactions
- no horizontal scrolling

Desktop:

- centered readable text column
- left progress rail
- right companion panel for vocabulary, audio, notes, or source references
- keyboard shortcuts for reveal/audio/next section where safe

## Source Progress Events

The reader may emit:

```text
opened
section_exposed
intro_completed
heard_once
pattern_noticing_seen
guided_practice_completed
lesson_completed
```

Use `opened`, not `lesson_opened`, to match the source-progress schema.

## Verification

Run:

```bash
bun run test -- src/__tests__/lessonExperience.test.ts src/__tests__/LessonReader.test.tsx
bun run build
npx playwright test e2e/lesson-reader.spec.ts
```

Playwright coverage should include at least one mobile viewport and one desktop viewport, verify no horizontal overflow, verify keyboard-safe navigation, and confirm source progress events are emitted without creating FSRS state.

## Acceptance Criteria

- One lesson feels like a modern web-native lesson, not a PDF reconstruction.
- Same lesson plan supports mobile and desktop.
- Practice bridges reference capability keys but do not activate them directly.
- Source provenance is available in metadata/admin affordances.
- `VITE_LESSON_READER_V2` defaults false and gates the route/render path.

## Out Of Scope

- Full visual redesign of all pages.
- Full lesson authoring UI.
- Capability activation from lesson page.
