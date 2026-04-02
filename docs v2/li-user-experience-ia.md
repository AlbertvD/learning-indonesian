# Learning Indonesian User Experience and Information Architecture

## Purpose

This document describes how the new retention-first learning system should feel from a learner's perspective and how the app navigation should be organized.

It complements the technical architecture by translating the system into:

- a clear user journey
- top-level app navigation
- page responsibilities
- session behavior
- key UX principles

## Core Product Shift

The app should move away from:

- lesson-specific flashcard buckets
- isolated review mode
- separate silos for lessons, review, and practice

The app should move toward:

- one smart daily learning session
- lessons as the structured teaching layer
- review as a cross-lesson retention system
- practice as a skill-focused optional layer
- progress based on real memory and usable knowledge

In simple terms:

- lessons introduce
- sessions reinforce
- review is global
- practice is skill-based
- progress reflects what the learner can actually remember and use

## User Perspective

From the learner's point of view, the system should feel like a guided memory coach.

Instead of:

- "Here are your flashcards for lesson 4"

The app should feel more like:

- "Here is the best learning session for you today"

That session may include:

- a few new items from the current lesson
- review of older due items
- weak items that need recovery
- sentence or listening tasks using previously learned vocabulary
- short production tasks such as typing or speaking

The learner does not need to think about scheduling logic, item states, or memory models. The app should quietly adapt in the background.

## Main Navigation

Recommended top-level structure:

1. Dashboard
2. Today
3. Lessons
4. Practice
5. Progress
6. Profile

Optional future area:

7. Library

Use `Library` only if the app grows to include saved words, phrases, custom sets, favorite podcast snippets, or learner-owned content that needs a dedicated home.

## Sidebar Navigation

Recommended desktop sidebar:

- `Dashboard`
- `Today`
- `Lessons`
- `Practice`
- `Progress`
- `Profile`

Recommended nested sections under `Practice`:

- `Listening`
- `Speaking`
- `Typing`
- `Weak Items`
- `Context Practice`
- `Confusing Words`

Recommended nested sections under `Lessons`:

- `Current Lesson`
- `All Lessons`
- `Podcasts`

## Mobile Navigation

Recommended mobile bottom navigation:

- `Home`
- `Today`
- `Lessons`
- `Practice`
- `Progress`

`Profile` can remain in a header menu or overflow menu on mobile.

## Top-Level Areas

## 1. Dashboard

The Dashboard is the control center.

It should answer:

- what should I do today?
- how much review is due?
- where am I in the curriculum?
- what needs attention?
- what progress am I building?

Recommended content:

- greeting and streak
- today's minutes or target
- due item count
- weak item count
- current lesson status
- recent progress snapshot

Primary actions:

- `Start Today's Session`
- `Continue Current Lesson`
- `Do Quick Review`
- `Practice Weak Words`

Recommended layout:

- top summary strip:
  - streak
  - minutes today
  - items due
- hero card:
  - `Start Today's Session`
  - summary of what is inside
- secondary cards:
  - continue lesson
  - weak words
  - listening practice
- progress snapshot:
  - items strengthened
  - current level
  - recognition vs production

The Dashboard should reduce decision fatigue.

## 2. Today

This is the most important page in the product.

It is the main daily habit loop.

Purpose:

- give the learner the best mixed session for long-term retention

Possible sections:

- `Ready Now`
- `Due Review`
- `New From Current Lesson`
- `Weak Items`
- `Recommended Focus`

Primary call to action:

- `Start Session`

Optional session presets:

- `10 min`
- `20 min`
- `Review only`
- `Speaking focus`
- `Listening focus`

How it should work:

- the app assembles a mixed session
- the learner does not manually pick cards
- the session adapts difficulty and content type
- the learner gets a clean summary at the end

Example session mix:

- overdue review
- a few lesson-linked new items
- weak-item recovery
- one context task from a lesson or podcast
- one productive challenge

## 3. Lessons

Lessons remain important, but their role changes.

Lessons are the structured teaching layer, not the only review structure.

Use Lessons for:

- browsing lessons by module and level
- starting a new lesson
- continuing an in-progress lesson
- revisiting explanations, examples, audio, and guided content

A lesson page should include:

- lesson overview
- grammar and vocabulary focus
- key example sentences
- audio or listening support
- initial anchored practice
- recommended next step such as `Add to Today's Learning` or `Practice Now`

Lessons should introduce and explain. The memory system should take over reinforcement afterward.

## 4. Practice

Practice is the intentional training area.

This page is for learners who want more control or extra repetition beyond the main daily session.

Recommended sections:

- `Listening`
- `Speaking`
- `Typing`
- `Context Practice`
- `Weak Items`
- `Confusing Words`

This area should not replace the main daily loop. It should be optional and targeted.

Examples:

- a learner wants only listening drills today
- a learner wants to recover frequently missed words
- a learner wants sentence-building or speaking practice

## 5. Progress

Progress should show real memory growth, not just app activity.

Recommended sections:

- `Memory`
- `Production`
- `Listening`
- `Lessons`
- `Trouble Spots`

Recommended metrics:

- items introduced
- items stable in memory
- items the learner can produce
- items that are recognition-only
- weakest topics or confusable groups
- lesson completion
- time spent
- streaks and consistency

This page should help learners see the difference between:

- "I have seen this word"
- "I can recognize this word"
- "I can recall and use this word"

## Optional 6. Library

Only add this if needed later.

Possible use cases:

- saved words
- personal items
- custom sets
- favorite phrases
- reviewed podcast excerpts

If the app stays focused and simple, you may not need this page early.

## Ideal Learner Journey

A good daily journey should look like this:

1. Open app
2. Land on Dashboard
3. See:
   - reviews due
   - current lesson
   - suggested next action
4. Tap `Start Today's Session`
5. Complete a 10-minute mixed session
6. Receive summary:
   - reviewed 12 items
   - learned 3 new items
   - strengthened 4 weak ones
   - 2 items moved into production practice
7. Optionally continue current lesson or do extra listening practice

This experience should feel guided, focused, and rewarding.

## Guided Mode vs Intentional Mode

The app should support two user modes:

### Guided Mode

Centered around:

- Dashboard
- Today

This is for users who want the app to choose what matters most.

### Intentional Mode

Centered around:

- Lessons
- Practice
- Progress

This is for users who want more control, extra practice, or targeted work on weak areas.

This balance is important:

- beginners need simplicity
- motivated learners need control

## UX Principles

### 1. One primary habit loop

The learner should always know the main action:

- `Start Today's Session`

### 2. Lessons should not trap vocabulary

Lesson content should continue to reappear later in mixed review and context practice.

### 3. Progress should feel honest

Do not imply mastery after shallow recognition.

### 4. Practice should be adaptive but not confusing

The app should feel smart without making the learner think about the underlying logic.

### 5. Reduce decision fatigue

The Dashboard and Today pages should make it easy to begin.

## Recommended Page Hierarchy

```text
Dashboard
Today
Lessons
  Current Lesson
  All Lessons
  Podcasts
Practice
  Listening
  Speaking
  Typing
  Weak Items
  Context Practice
  Confusing Words
Progress
Profile
```

## Recommended Future Design Direction

The center of gravity of the app should shift from:

- decks
- cards
- isolated review

to:

- daily sessions
- adaptive reinforcement
- cross-lesson memory building
- usable language skills

## Final Recommendation

If the product experience is working well, a learner should describe it like this:

"The app gives me one smart session each day, keeps bringing back the right words at the right time, and helps me move from recognizing Indonesian to actually using it."
