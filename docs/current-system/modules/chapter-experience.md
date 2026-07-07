---
module: chapter-experience
surface: src/components/lessons/ChapterExperience.tsx, src/components/lessons/LessonChapterOverview.tsx
last_verified_against_code: 2026-07-07
status: stable
---

# Chapter experience — the bespoke lesson pages' shared chapter chrome

## 1. Purpose

Turns a bespoke lesson page from a scroll document into navigable chapters. The page supplies content; this module owns ALL navigation behavior, so the 19 lesson pages carry zero navigation logic. Program spec: `docs/plans/2026-07-06-lesson-chapter-experience-program.md`; evidence base `docs/research/2026-07-06-lesson-page-ux-review.md`.

## 2. Public interface

```tsx
<ChapterExperience lessonId={meta.id} hero={<Hero />} chapters={buildChapters(activation)} />

interface LessonChapter { id: string; title: string; description?: string; node: ReactNode }
useChapterNav(): { chapters, currentId, goTo } | null   // context; null outside the experience
<LessonChapterOverview />                                 // "In deze les" cards for the cover
```

## 3. Behavior (all owned here, verified 2026-07-07)

- **URL sync:** current chapter ⇄ `?h=<id>` (`ChapterExperience.tsx:CHAPTER_PARAM`); back button + deep links work; unknown/missing param → first chapter.
- **Cover convention:** the FIRST chapter is the lesson's cover — titled **"Inhoud"** (it is the contents page: hero + lede + `LessonChapterOverview`, NOT a story; user decision 2026-07-07); hero (optional `hero` prop) renders above the nav on the cover only; the cover pill is unnumbered (◆); content chapters number 1..n-1; the "Hoofdstuk i van n-1" label hides on the cover. Per-lesson audio (the grammar podcast band) belongs with the **Grammatica chapter**, not the cover.
- **Mount strategy:** only the current chapter is mounted (spec Q2 decision). Consequence: per-lesson content-parity tests must render every chapter node (`lesson-5/__tests__/chapters-content-parity.test.tsx` is the template — it caught a pre-existing content drop on its first run).
- **A11y:** on chapter change, scroll-to-top + focus moves to the chapter content container; the current pill auto-scrolls into view (feature-guarded `scrollIntoView` — jsdom lacks it).
- **Position memory:** localStorage `lesson-chapter:<lessonId>` `{current, visited}`; a "Ga verder bij …" resume chip is OFFERED on fresh landings (never auto-jumps); visited chapters show ✓ ticks.
- **Width contract:** the nav's inner row, resume band, and footer next/prev align to `var(--lesson-col)` — a CSS variable each bespoke page sets on its root (lesson 5: 1024px) and applies to every band inner. The nav band background stays full-bleed near-solid (96%) so it reads as the lesson's navigation over any hero.

## 4. Invariants

- Chapter `id`s are stable slugs, unique per lesson (they are URL values and localStorage state).
- `LessonChapterOverview` renders `null` outside the experience (nullable context) — chapter nodes are also mounted in isolation by parity tests.
- No content lives in this module; chrome only. Overview cards are `ListCard` page-framework primitives (`to="?h=<id>"` — Link navigation IS the chapter switch).

## 5. Seams

- **Consumers:** bespoke pages `src/pages/lessons/lesson-N/Page.tsx` (lesson 5 = the pilot/reference conversion; grouping is EDITORIAL, not mechanical — see spec §1 warning).
- **Composes:** `ListCard` (`components/page/primitives`), `useT` i18n (`lessons.chapter*` keys, nl+en).
- **Does NOT touch:** activation (pages keep `useLessonActivation` single-owner and pass nodes that close over it), registry/router (both page shapes coexist during rollout).

## 6. What this spec does NOT cover

The per-lesson editorial content and CSS (each `Page.tsx`/`Page.module.css` owns its bands); the rollout process (program spec §3); swipe gestures (deliberately absent in v1).
