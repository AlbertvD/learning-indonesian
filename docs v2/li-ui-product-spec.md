# Learning Indonesian UI and Product Flow Specification

## Purpose

This document defines the main user-facing screens and flows for the retention-first version of the app.

It covers:

- top-level pages
- page responsibilities
- main user actions
- key screen states
- session flow behavior

## Product Structure

Recommended top-level areas:

1. Dashboard
2. Today
3. Lessons
4. Practice
5. Progress
6. Profile

Optional later:

7. Library

## Global Navigation

### Desktop Sidebar

- `Dashboard`
- `Today`
- `Lessons`
- `Practice`
- `Progress`
- `Profile`

### Mobile Bottom Nav

- `Home`
- `Today`
- `Lessons`
- `Practice`
- `Progress`

Profile remains in a top-right menu on mobile.

## 1. Dashboard

### Purpose

The Dashboard is the learner's home base and should reduce decision fatigue.

### Main Questions Answered

- What should I do today?
- How much is due?
- What lesson am I on?
- Where am I weak?
- How am I progressing?

### Main Components

#### Hero Card

Shows:

- `Start Today's Session`
- short summary such as:
  - reviews due
  - new items ready
  - weak items waiting

#### Progress Strip

Shows:

- streak
- minutes today
- items due
- current level or lesson

#### Quick Actions

- `Continue Lesson`
- `Practice Weak Words`
- `Listening Practice`
- `Quick Review`

#### Progress Snapshot

Shows:

- items strengthened this week
- recognition vs production
- recent milestone

### Empty State

If the learner is fully caught up:

- celebrate briefly
- offer `Continue Lesson` or `Do Speaking Practice`

### Error State

If data fails:

- show a friendly retry prompt
- keep primary CTA visible if possible

## 2. Today

### Purpose

This is the main daily habit loop.

### Main Components

#### Session Overview Card

Shows:

- recommended session type
- estimated duration
- what is inside the session

Example:

- `12 due reviews`
- `3 new items from Lesson 5`
- `2 weak words to recover`

#### Session Presets

- `5 min`
- `10 min`
- `20 min`
- `Review only`
- `Listening focus`

#### Focus Recommendations

Optional cards:

- weak speaking
- weak listening
- overdue review spike

### Main CTA

- `Start Session`

### Empty State

If nothing is due:

- show `You're caught up`
- suggest:
  - continue lesson
  - optional extra listening
  - optional speaking or context practice

## 3. Learn Session

### Purpose

This page delivers the actual mixed session.

### Layout

#### Top Bar

Shows:

- progress count
- time estimate remaining
- exit button

Optional:

- current focus label like `Review`, `New`, `Listening`, `Production`

#### Exercise Shell

Contains:

- prompt area
- optional audio controls
- answer area
- feedback area
- next button or auto-advance

#### Progress Footer

Shows:

- session progress
- optional stage labels

### Required Behavior

- clean transitions between exercises
- one main action per screen
- immediate feedback after response
- no unnecessary navigation complexity

### Pause / Exit Behavior

If learner exits:

- save session progress if queue persistence exists
- otherwise save completed interactions and discard remaining queue safely

## 4. Lessons

### Purpose

Lessons are the structured teaching layer.

### Main Views

#### Lessons Overview

Shows:

- modules
- levels
- lesson completion status
- current lesson

#### Lesson Detail

Shows:

- lesson title and overview
- vocabulary and grammar focus
- examples
- audio
- structured content sections
- `Start Lesson`
- `Add to Today's Learning`

### Lesson Completion UX

At lesson completion:

- celebrate progress
- explain that vocabulary will continue appearing in future sessions
- offer `Start Today's Session`

## 5. Practice

### Purpose

Practice gives learners intentional control beyond the daily guided session.

### Practice Sections

- `Listening`
- `Speaking`
- `Typing`
- `Context Practice`
- `Weak Items`
- `Confusing Words`

### Usage

This area is optional and should not overwhelm beginners.

## 6. Progress

### Purpose

Show meaningful learning growth.

### Sections

- `Memory`
- `Production`
- `Listening`
- `Lessons`
- `Trouble Spots`

### Important Metrics

- items introduced
- items stable
- items you can produce
- items still recognition-only
- weakest topics
- recent improvements

### UX Goal

Learners should feel that progress is honest and motivating, not inflated.

## 7. Profile

### Purpose

Holds personal settings and account management.

Potential controls:

- display name
- interface language
- preferred session length
- audio preferences
- future speaking/privacy settings

## Session-End Summary

After every session, show:

- items reviewed
- new items introduced
- weak items improved
- items promoted to harder practice
- recommended next action

Primary follow-up actions:

- `Done for Today`
- `Continue Lesson`
- `Practice Listening`

## Major UX Rules

1. One clear primary action on each main page.
2. Dashboard and Today should make starting easy.
3. Lessons should introduce, not permanently contain, vocabulary.
4. Progress should reflect durable learning, not superficial activity.
5. Practice should offer control without becoming the default burden.

## Screen States To Explicitly Design Later

These still need visual/UI design treatment:

- loading states
- empty states
- error states
- session interruption states
- completed session summary
- first-time user onboarding
- learner with no due items
- learner with very high due load

## Final Recommendation

The product should feel simple on the surface:

- one smart session per day
- lessons for structured learning
- practice for targeted training
- progress that proves memory is sticking

The complexity should stay behind the scenes.
