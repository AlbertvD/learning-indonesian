---
status: draft
---
<!-- HIGH-LEVEL PROGRAM SPEC — the lesson-page redesign decided 2026-07-06.
     Evidence base: docs/research/2026-07-06-lesson-page-ux-review.md (measured: 11.2
     desktop / 20.6 mobile screens of scroll, zero navigation, CTA at the bottom).
     The interim "shared chrome" phase was CUT by the omission test (user decision,
     recorded in the review §3) — this is the single track. Execution spec + gauntlet
     (staff-engineer → architect; no data-model → data-architect likely N/A) before build. -->

# Lesson chapter experience — from scroll-document to guided chapters

## Goal

Every bespoke lesson page becomes a sequence of **navigable chapters** — one section on screen at a time, a segmented progress header, next/prev + swipe, position memory — ending on the **Oefenen** chapter (activation + practice CTA), so the lesson's one action is always one tap away instead of 20 mobile screens down. Content is untouched; this is presentation + navigation only.

## The learner experience

- Opening a lesson shows the **hero as chapter 1** (it's already excellent — review §2) with the whole-lesson audio player.
- A **segmented progress header** (● ● ○ ○ ○ ○ + current chapter title) sits under the app header: each segment is tappable (jump), filled segments = visited. It doubles as the section nav — no separate TOC.
- **Next/prev** buttons + **horizontal swipe** (mobile) move between chapters; vertical scroll remains *within* a chapter (chapters vary in length — never paginate mid-section).
- **Position memory:** returning to a lesson shows a "Ga verder bij *Woorden*" chip (offer, never auto-jump). Completion ticks per visited chapter.
- **The final chapter is Oefenen** — the existing activation gate + practice CTA end every lesson on the action.
- Chapter is in the **URL** (`?h=<chapter-id>` or a path segment — execution spec picks one), so back-button and deep links behave.

## How it works in the code (high level)

### 1. The chapter contract (per-page, minimal)

Bespoke pages keep full editorial freedom *inside* chapters; they change only their top-level composition. Today (`src/pages/lessons/lesson-N/Page.tsx`, ~500–700 lines each):

```tsx
// today: one long fragment
<PageContainer>… hero … grammar … vocab … culture … CTA …</PageContainer>
```

Target — the page slices its existing JSX at the H2 boundaries it already has:

```tsx
<ChapterExperience lessonId={meta.id} chapters={[
  { id: 'verhaal',    title: 'Verhaal',    node: <HeroChapter … /> },
  { id: 'grammatica', title: 'Grammatica', node: <GrammarChapter … /> },
  { id: 'woorden',    title: 'Woorden',    node: <VocabChapter … /> },
  { id: 'cultuur',    title: 'Cultuur',    node: <CultureChapter … /> },
  { id: 'oefenen',    title: 'Oefenen',    node: <PracticeChapter … /> },  // ActivationGate + PracticeActions, as today
]} />
```

Same content, same components, same CSS modules — re-grouped, not rewritten. Chapter count/ids vary per lesson (pages own their editorial structure; the chrome renders whatever list it gets).

**⚠️ The grouping is editorial, NOT a mechanical `section[i]→chapter[i]` map** (staff-engineer, verified on lesson 5): the hero+lede+audio band are three separate top-level sections with no shared H2 (`Page.tsx:363-403`), and `TussendoorSpread` already merges two content sections into one node (`:411`). The converter (human or agent) groups by hand per lesson; the H2s are the *starting* seams, not the rule. Also: the whole-lesson audio component is **`LessonGrammarAudioBand`**, not "LessonAudioPlayer" — grep, don't trust names. Activation coupling verified safe: `useLessonActivation(meta.id)` stays at page top (`:351`); the Oefenen chapter node closes over it — single-owner pattern survives untouched.

### 2. The shared chrome: `ChapterExperience`

One new deep component (likely `src/components/lessons/ChapterExperience.tsx` — sibling of `ActivationGate`/`PracticeActions`; architect confirms placement). Owns ALL chapter behavior so 19 pages carry zero navigation logic:

- current-chapter state ↔ URL sync (back button, deep links)
- the segmented progress header (tap-to-jump; horizontally scrollable on mobile — the Voortgang pill-strip precedent)
- next/prev controls + touch swipe; on chapter change: scroll-to-top **and move focus to the new chapter's heading** (the pages already use `aria-labelledby` sections — screen-reader users must not regress; staff-engineer)
- visited/completion ticks (near-free — "visited" already drives the header) + **position memory** (localStorage `lesson-chapter:<lessonId>`; renders the resume chip). *Honest defer-candidate:* position memory + resume chip is the one part v1 can cut if the pilot needs to move fast — nothing structural depends on it (staff-engineer omission test)
- mounts inside the existing page framework (`PageContainer`/`PageBody`) — no chrome duplication

Uses existing primitives + tokens throughout (`feedback_ui_default_to_existing_framework`); new primitives only if a recurring shape emerges during the pilot (the `MediaShowcaseCard` precedent). Gets a module spec when the second non-trivial file lands (CLAUDE.md rule).

### 3. Rollout mechanics (the bespoke architecture helps)

- `registry.tsx` / `LessonRouter.tsx` are untouched — a page either composes `ChapterExperience` or stays a scroll document. **Both shapes coexist during rollout;** no flag, no fork.
- **Pilot ONE lesson** (lesson 5 — it's the measured baseline), iterate the feel in `/preview` + page-lab, THEN update the **`lesson-page-designer` agent definition** with the chapter contract and regenerate/convert the rest lesson-by-lesson (mechanical: slicing existing JSX at existing H2 seams).
- **Content-parity guard per conversion:** a test asserting the text content of the chaptered page equals the pre-conversion rendering (both derive from the same `content.json`). **⚠️ Guard design is coupled to the mount strategy (staff-engineer):** with one-chapter-at-a-time conditional mounting, the live DOM holds only the current chapter — the test harness must render/concatenate **every** chapter node (or the component must keep all chapters mounted, hidden via CSS/scroll-snap, making parity trivial). Therefore **open Q2 (mount/swipe strategy) must be DECIDED before the parity guard is written**, not left to the pilot. This guard is what makes the 19-page rollout safe to delegate.

### 4. The vocab-grid redesign rides the same per-page pass

The review's worst region (D grade): replace the ragged 4-col card grid with a compact grouped list (word · gloss · ▶, equal-height rows, thematic sub-groups where the content has them). If a recurring shape emerges → one shared `VocabList` component in `components/lessons/`. Done per-lesson during its chapter conversion, not as a separate program.

### 5. What does NOT change

- No schema, no content, no `content.json` regeneration, no pipeline involvement — **Supabase Requirements: N/A across the board** (pure frontend presentation).
- `useLessonActivation` single-owner pattern, `LessonAudioPlayer`, all section-internal components and CSS modules.
- Lezen, Session, and every non-lesson surface.

## Contingency (not scope)

If rollout stalls with lessons unconverted for a long stretch, a temporary DOM-driven scroll-spy pill-nav can serve the stragglers — ~a day if ever needed; deliberately not built in advance (review §3).

## Open questions (for the execution spec)

1. URL shape: query param (`?h=woorden`) vs path segment (`/lessen/5/woorden`) — path is prettier, query is zero-router-change. Lean query.
2. **Swipe/mount strategy — DECIDE FIRST, not in the pilot** (staff-engineer: it determines the parity-guard design, §3): CSS scroll-snap panels (all chapters mounted → parity trivial, less code, but constrains per-chapter vertical scroll) vs conditional mount + pointer events (cleaner DOM, parity harness must iterate chapters).
3. Chapter-visited semantics for the completion ticks: seen-at-all vs scrolled-to-end (lean seen-at-all — honest enough, no scroll-tracking machinery).
4. Whether the hero image treatment repeats per chapter header (visual rhythm) or stays chapter-1-only (lean: chapter-1-only; interior chapters get a slim title band — the review's monotony finding argues for *some* per-chapter identity, pilot decides).
5. Desktop: chapters as horizontal panels too, or generous single-column with the same header nav? (Lean: same model both form factors — one mental model, one codebase; desktop just gets wider chapters.)
