# Learning Indonesian Wireframe-Level Page Specification

## Purpose

This document describes the key page layouts and screen sections for the retention-first version of the app.

It is not a visual design system yet. It is a wireframe-level product specification for:

- Dashboard
- Today
- Learn Session
- Lessons Overview
- Lesson Detail
- Practice
- Progress

## Global Layout

### Desktop

- left sidebar navigation
- main content column
- optional right rail for secondary insights later

### Mobile

- top header
- bottom navigation
- vertically stacked content cards

## 1. Dashboard Wireframe

### Primary Goal

Help the learner start the right action with minimal friction.

### Layout Order

#### Section A: Header

Contents:

- greeting
- streak
- today's minutes

#### Section B: Main Hero Card

Contents:

- title: `Today's Learning`
- short summary:
  - `12 reviews due`
  - `3 new from Lesson 5`
  - `4 weak items`
- primary CTA: `Start Today's Session`

Optional secondary CTA:

- `Quick 5-min Review`

#### Section C: Quick Actions Row

Cards:

- `Continue Lesson`
- `Practice Weak Words`
- `Listening Practice`

#### Section D: Progress Snapshot

Contents:

- stable items
- production-ready items
- lesson progress

#### Section E: Optional Insights

Contents:

- recently improved words
- upcoming review load
- current weakness area

### Empty State

If nothing is due:

- show success message
- show `Continue Lesson`
- show optional `Speaking Practice`

## 2. Today Wireframe

### Primary Goal

Make the learner feel ready to start a well-balanced session.

### Layout Order

#### Section A: Session Overview Card

Contents:

- title: `Today's Session`
- estimated duration
- recommended focus
- summary of queue composition

Example:

- `8 review items`
- `3 new lesson items`
- `2 context tasks`

#### Section B: Session Presets

Buttons:

- `5 min`
- `10 min`
- `20 min`
- `Review only`

#### Section C: Focus Cards

Cards:

- `Speaking needs attention`
- `Listening reinforcement available`
- `Weak item recovery recommended`

#### Section D: Main CTA

- `Start Session`

### Empty State

If learner is fully caught up:

- `You're caught up`
- `Continue current lesson`
- `Try listening practice`

## 3. Learn Session Wireframe

### Primary Goal

Deliver one exercise at a time in a calm, focused way.

### Layout Order

#### Section A: Top Bar

Contents:

- close/back
- progress count
- optional remaining estimate

#### Section B: Exercise Focus Area

Contents:

- small label for exercise type
- prompt
- optional audio controls
- optional context sentence

#### Section C: Answer Area

Depends on exercise:

- multiple choice buttons
- text input
- audio/speaking control
- cloze field

#### Section D: Feedback Panel

Shown after submit:

- correct/incorrect state
- correct answer
- one example or explanation

#### Section E: Continue Action

- `Next`

or auto-advance for lightweight tasks

### Session-End Summary

Show:

- items reviewed
- new items introduced
- weak items recovered
- promoted items

Actions:

- `Done for Today`
- `Continue Lesson`
- `More Practice`

## 4. Lessons Overview Wireframe

### Primary Goal

Help learners navigate the curriculum.

### Layout Order

#### Section A: Header

- title
- current level/module

#### Section B: Current Lesson Card

Contents:

- current lesson title
- progress
- CTA: `Continue`

#### Section C: Lesson List

Each lesson card shows:

- lesson title
- module/level
- status:
  - not started
  - in progress
  - completed

#### Section D: Optional Podcast Link

- related listening content

## 5. Lesson Detail Wireframe

### Primary Goal

Introduce and explain new language clearly.

### Layout Order

#### Section A: Lesson Header

- title
- module
- level
- estimated time

#### Section B: Lesson Overview

- what learner will study
- main vocabulary themes
- grammar themes if relevant

#### Section C: Key Vocabulary

- important items
- meanings
- audio where available

#### Section D: Examples / Explanation

- lesson sections
- text
- audio

#### Section E: CTA Area

- `Start Lesson`
- `Add to Today's Learning`

### Completion State

When finished:

- celebrate completion
- explain that new items will continue appearing in future sessions
- offer `Start Today's Session`

## 6. Practice Wireframe

### Primary Goal

Offer targeted self-directed training.

### Layout Order

#### Section A: Practice Categories

Cards:

- `Listening`
- `Speaking`
- `Typing`
- `Context Practice`
- `Weak Items`
- `Confusing Words`

#### Section B: Optional Recommended Practice

- short suggestions based on learner weakness

## 7. Progress Wireframe

### Primary Goal

Show meaningful growth in retention and usable language skill.

### Layout Order

#### Section A: Progress Summary

- total introduced items
- stable items
- production-ready items
- lesson completion

#### Section B: Skill Breakdown

- recognition
- recall
- listening
- speaking

#### Section C: Trouble Spots

- weak topics
- confusable words
- fragile skills

#### Section D: Trend View

- recent improvement
- review consistency

## Important States To Design Explicitly Later

These need visual design attention in a later stage:

- loading states
- empty states
- retry states
- high due load warning state
- onboarding state for new users
- post-session success state
- learner struggling state

## Wireframe Priorities

If only a few screens are designed first, prioritize:

1. Dashboard
2. Today
3. Learn Session

These three screens define the new habit loop.

## Final Recommendation

The interface should make the new system feel simple:

- one strong daily CTA
- one focused learning session
- clear lesson structure
- visible evidence of real progress

The learner should feel guided, not managed.
