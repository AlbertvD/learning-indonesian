# Lessons Overview And Lesson Practice Spec

**Date:** 2026-04-29
**Status:** Draft
**Source:** Grilling session on the lessons overview, individual lesson page, and lesson-specific practice.

## 1. Terminology

Use these names consistently:

- **Lessons overview:** the `/lessons` page with all lessons listed.
- **Lesson page / Lesson reader:** the individual lesson page with grammar audio, dialogue, vocabulary, sentences, culture text, pronunciation notes, and other lesson content.
- **Today:** the global guided practice path, owned by the dashboard/Today entry point.
- **Lesson practice:** a focused FSRS-writing session for one selected lesson.
- **Lesson review:** a focused FSRS-writing review session for one selected lesson, without introducing new items.

## 2. Product Principles

Today is the guided path. Lessons are side quests that prepare and support Today.

The lessons overview should not compete with the dashboard. It helps the learner choose and open a lesson. The individual lesson page introduces new learning content through reading and listening. Mastery still comes from exercise sessions.

The lesson page prepares. The exercise page teaches through retrieval.

## 3. Lessons Overview

The lessons overview is guidance-first, not catalog-first.

It should show:

- one recommended lesson card at the top;
- a continuous ordered list of published lessons below;
- every lesson in normal lesson order;
- title, status, action, and a short "What's inside" grammar tag;
- no progress bars;
- no search or filtering;
- no culture previews;
- no generic audio availability tags;
- no estimated lesson time;
- no course progress summary;
- no admin/content-health signals for normal learners.

The recommended lesson card may duplicate the same lesson that appears in the ordered list. This keeps the list complete and linear while still making the next lesson obvious.

## 4. Overview Statuses

Learner-facing statuses:

```text
Not started
In progress
Ready to practice
In practice
Practiced
Later
```

Definitions:

- `Not started`: the lesson is available in the current path, but the learner has not meaningfully opened or consumed it.
- `In progress`: the learner has started the lesson, but exposure is not yet enough to make practice available.
- `Ready to practice`: the lesson has enough meaningful exposure and at least one eligible practice item.
- `In practice`: the learner has started lesson-specific practice, but not all eligible introduced content has had a first FSRS-writing attempt.
- `Practiced`: all currently eligible introduced content from the lesson has had at least one real FSRS-writing practice attempt. This does not mean mastered.
- `Later`: the lesson is published and openable, but it is later than the current recommended path.

Avoid `Completed` on the lessons overview. It is ambiguous and can mean read, listened, practiced, mastered, or all of those.

## 5. Overview Actions

The lessons overview opens lessons. It does not launch lesson-specific practice directly.

Action labels:

```text
Not started      -> Open lesson
In progress      -> Continue
Ready to practice -> Open lesson
In practice      -> Continue
Practiced        -> Open lesson
Later            -> Open lesson
```

The status can say `Ready to practice`, but the actual `Practice this lesson` action and ready-item count belong inside the individual lesson page.

## 6. Recommendation Logic

The lessons overview should recommend a lesson, not Today. The dashboard owns Today as the global guided path.

Recommendation priority:

1. In-progress lesson that is not practice-ready yet.
2. Earliest ready-to-practice or in-practice lesson that is not yet `Practiced`.
3. Next not-started lesson in sequence.
4. Later lesson only when earlier lessons are sufficiently introduced or practiced.

`Practiced` lessons should usually not be recommended unless there is a strong lesson-specific reason. Global review pressure belongs on Today/dashboard, not the lessons overview.

Opening a `Later` lesson is allowed. Reading ahead records source progress for that lesson, but it must not silently move the normal practice path forward while earlier lessons still need exposure or practice.

For the first build, an earlier lesson is considered satisfied when it is `Practiced`, or when it has meaningful exposure and no authored eligible practice content available. This keeps the recommendation concrete while still allowing lessons without practice material to be passed.

## 6a. New Learner State

If the learner has never started a lesson, the recommended card should point to Lesson 1.

Recommended copy:

```text
Start with Lesson 1
Listen to the explanation and read the first examples to prepare your first practice.
```

The action is `Open lesson`. Do not show an empty stats message such as "no lessons completed".

## 7. What's Inside Tag

Each overview lesson row/card can show one short "What's inside" line, but only for grammar topics.

Examples:

```text
Grammar: possessive pronouns
Grammar: word order, negation
Grammar: meN- verbs
Grammar: possessive pronouns +1 more
```

Rules:

- show at most one or two grammar topics;
- if there are more, use `+1 more`;
- omit the tag if grammar metadata is missing;
- do not show generic tags such as `Audio`, `Dialogue`, `Vocabulary`, `Culture`, or `Pronunciation`.

## 8. Individual Lesson Page

The individual lesson page is a rich reading and listening surface.

It can include:

- grammar audio for the lesson;
- grammar text explanation;
- dialogue/conversation;
- vocabulary;
- sentences and examples;
- culture text;
- pronunciation notes and examples;
- other authored lesson sections.

It should be visually pleasant and comfortable to read/listen to. It should not become a full workbook. Light orientation interactions are allowed, but lesson-page interactions write source progress only, not FSRS review history.

Allowed lesson-page interactions:

- listen and follow along;
- tap-to-reveal translations;
- light noticing prompts;
- section exposure events;
- practice bridge after readiness.

Not allowed on the lesson page:

- FSRS-scored recall;
- full MCQ drills;
- typed review attempts;
- long exercise sequences;
- direct learner capability activation.

## 9. Exposure Rules

The learner should not need to browse all lesson content manually.

### Grammar

Grammar exposure is satisfied by either:

- meaningful grammar-audio listening; or
- meaningful grammar-text exposure.

Grammar audio and grammar text are equivalent for unlocking grammar practice.

Grammar-audio threshold:

- if the audio is shorter than 5 minutes, the learner must finish it once;
- if the audio is 5 minutes or longer, the learner must listen to at least 60%;
- the meaningful long-audio floor is 5 minutes, but 60% will normally be higher for 20-35 minute lessons.

Grammar-text threshold:

- seeing/reading the grammar explanation block counts when the learner has meaningfully exposed the block;
- do not require the learner to read every example manually.

### Words And Sentences

Words and sentences become eligible through meaningful lesson exposure.

Preferred path:

- dialogue/conversation audio exposure;
- or dialogue/conversation text exposure.

Dialogue-audio threshold:

- short dialogue: finish once;
- longer dialogue: listen to at least 60%;
- no 5-minute minimum.

Dialogue-text threshold:

- about 2 minutes in the dialogue section;
- or meaningful scroll/viewing of the dialogue section.

Fallback:

- if the lesson has no dialogue/conversation section, meaningful grammar exposure can also unlock words and sentences from that lesson.

Vocabulary section browsing is not required. A learner should not have to inspect every word in a vocabulary list before the session engine can introduce selected approved words.

### Culture And Pronunciation

Culture text enriches the lesson but does not gate lesson status, practice readiness, or next-lesson recommendation.

Pronunciation sections may appear on the individual lesson page when authored. They are enrichment only for now:

- no pronunciation exercises;
- no pronunciation FSRS capabilities;
- no pronunciation status gating;
- no pronunciation tags on the lessons overview.

## 10. Practice-Ready Feedback

When a lesson transitions to practice-ready, show a subtle one-time toast on the individual lesson page:

```text
Lesson 4 is ready to practice.
```

Then show the lesson-specific action:

```text
Practice this lesson · 8 ready
```

The toast should not be a modal and should not interrupt reading/listening.

## 11. Lesson Practice

Lesson practice is launched from the individual lesson page only.

Rules:

- selected lesson only;
- counts toward FSRS;
- respects the learner's profile session size;
- underfills cleanly when fewer items are eligible;
- never pulls items from other lessons;
- still uses capability readiness, source progress, prerequisites, load budgets, and the Review Processor.

If the learner's profile session size is 25 and the lesson has 12 eligible items, the lesson practice session has 12 items. Do not pad with unrelated content.

Lesson practice priority:

1. due or fragile active capabilities from the selected lesson;
2. recently failed selected-lesson capabilities;
3. introduced but not yet practiced selected-lesson capabilities;
4. under-practiced capability types needed for balance;
5. light stretch items if budget allows.

Lesson practice should preserve direction balance where eligible content allows it, especially Indonesian-to-Dutch and Dutch-to-Indonesian practice.

## 12. Lesson Review

Lesson review is launched from the individual lesson page only.

Rules:

- selected lesson only;
- counts toward FSRS;
- includes active/practiced capabilities from that lesson;
- prioritizes due/fragile capabilities;
- does not introduce new capabilities.

Before first practice, there is no lesson review action.

When both practice and review are available:

- `Practice this lesson` is primary while any eligible introduced content has not had a first attempt;
- `Review this lesson` is secondary;
- once all eligible introduced content has had a first attempt, `Review this lesson` becomes the main lesson-specific action.

## 13. Error And Fallback Behavior

If lesson status signals cannot be refreshed:

- show published lessons in order;
- keep `Open lesson` available;
- hide ready counts if unknown;
- use a small non-blocking message if needed:

```text
Lesson progress could not be refreshed.
```

Do not show technical labels such as source progress, capability readiness, FSRS, or content units to normal learners.

## 14. Later Polish

Build after the core behavior is working:

- preserve overview scroll position when returning from a lesson;
- resume exact audio position inside a lesson;
- polish empty/error states;
- optional admin-only content-health overlays.

Keep out of scope for now:

- pronunciation exercises;
- offline-specific behavior;
- search/filter on the lessons overview.
