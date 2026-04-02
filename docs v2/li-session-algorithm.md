# Learning Session Algorithm Specification

## Purpose

This document defines how the app should assemble and adapt a daily learning session for a learner.

It translates the target architecture into concrete decision logic for:

- what enters a session
- how items are prioritized
- how session length changes composition
- how difficulty is balanced
- when new lesson items are allowed
- how promotion and demotion work during live sessions

## Core Principle

The daily session is not a lesson replay and not a pure review deck.

It is a guided mixed session built to maximize:

- long-term retention
- transfer into actual use
- session completion
- efficient use of learner attention

## Inputs

The session builder should use:

- learner profile
- current lesson position
- unfinished lesson and podcast content
- all due learner skill states
- recent failures
- weak skills
- item stage
- available contexts
- target session length
- optional user focus preference

## Session Types

Primary session types:

- `daily_mixed`
- `review_only`
- `lesson_reinforcement`
- `weak_item_recovery`
- `listening_focus`
- `speaking_focus`

Default mode should be `daily_mixed`.

## Session Length Profiles

### 5-Minute Session

Target item count:

- 8 to 12 interactions

Recommended mix:

- 70% due review
- 20% weak-item reinforcement
- 10% new lesson items

Rules:

- no more than 1 or 2 new items
- keep contexts short
- avoid long production prompts

### 10-Minute Session

Target item count:

- 14 to 20 interactions

Recommended mix:

- 55% due review
- 15% weak-item reinforcement
- 15% new lesson items
- 15% contextual or transfer tasks

Rules:

- best default daily experience
- include at least one contextual task if possible
- include one productive task if learner has eligible items

### 20-Minute Session

Target item count:

- 24 to 36 interactions

Recommended mix:

- 45% due review
- 15% weak-item reinforcement
- 20% new lesson items
- 20% contextual or transfer tasks

Rules:

- allows more varied modality mix
- may include multiple productive tasks
- should still avoid overloading with too many high-effort items in sequence

## Candidate Pools

Each session is assembled from these pools.

### 1. Due Pool

Items whose skill state is due or overdue.

Priority signals:

- lower predicted recall
- more overdue
- production-oriented skill
- recent lapses

### 2. Weak Pool

Items not necessarily due yet, but showing fragility.

Weakness signals:

- high lapse count
- low production success
- repeated confusion with related items
- high hint usage

### 3. New Pool

Items from the learner's current lesson that have not yet been introduced or are still in `new` stage.

### 4. Context Pool

Items with anchor or varied contexts available from:

- lessons
- podcasts
- example banks

### 5. Transfer Pool

Items eligible for:

- cloze
- sentence build
- dialogue response
- speaking

These items must already be anchored and have at least moderate recall strength.

## Candidate Ranking Logic

The session engine should assign a rank score to each candidate.

Suggested conceptual ranking formula:

`session_priority = urgency + weakness + curriculum_relevance + transfer_value - fatigue_cost - similarity_penalty`

### Urgency

Higher when:

- item is overdue
- recall probability is low
- item has not been seen in longer than intended

### Weakness

Higher when:

- learner repeatedly fails this item
- learner can recognize but not produce it
- learner uses many hints

### Curriculum Relevance

Higher when:

- item belongs to the current lesson or nearby lesson
- item appears in current podcast or lesson reinforcement

### Transfer Value

Higher when:

- item has rich contexts
- item is common and useful
- item is ready for contextual use

### Fatigue Cost

Higher when:

- task is cognitively demanding
- learner has already seen several hard tasks in this session

### Similarity Penalty

Higher when:

- nearby queue items are confusable or too similar

## New Item Budget Logic

The app should not introduce new lesson items every day without checking review pressure.

### Allow new items if:

- due load is moderate
- learner completed recent sessions
- current session has enough easier items to support momentum

### Reduce or pause new items if:

- due load is very high
- learner has many recent failures
- learner abandoned recent sessions

### Practical rules

- if due count is high, cap new items at 0 to 2
- if due count is normal, allow 2 to 5
- if learner is struggling with weak-item recovery, pause new items temporarily

## Queue Assembly Rules

After ranking candidates, the session builder should assemble a queue with balancing rules.

### Rule 1: Start with a winnable task

The first item should usually be:

- due but not extremely fragile
- not highly confusable
- not a very hard production task

### Rule 2: Avoid too many hard tasks in a row

Do not place:

- more than 2 demanding production tasks consecutively
- multiple confusable items back-to-back when avoidable

### Rule 3: Interleave modalities

A healthy sequence might alternate:

- recall
- recognition
- listening
- contextual
- production

### Rule 4: Introduce new items after early momentum

Do not front-load the session with too many new items.

Better pattern:

- early quick wins
- one or two due reviews
- then new items

### Rule 5: End cleanly

The session should try to end on:

- a successful item
- a shorter task
- or a summary after a positive result

## In-Session Adaptation

The session should adjust while the learner is working.

### If the learner is succeeding easily

- slightly increase difficulty
- unlock more active recall
- surface one contextual or productive task

### If the learner is struggling

- reduce the number of new items
- step back from production to cued recall
- use anchor contexts again
- shorten the remaining queue if needed

### If the learner fails repeatedly on one item

- mark it as fragile or leech-prone
- requeue in an easier mode later in the session or defer to future recovery
- do not hammer the learner with the same exact prompt repeatedly

## Promotion and Demotion Rules

### Promote an item when:

- it has repeated success across relevant tasks
- latency is acceptable
- hints are low
- performance is stable across more than one mode

### Demote an item when:

- it fails repeatedly
- learner only succeeds in recognition but fails in recall/production
- contextual use is weak despite prior shallow success

### Suggested stage movement

- `new` -> `anchoring` after initial exposure
- `anchoring` -> `retrieving` after multiple successful low-support retrievals
- `retrieving` -> `productive` after stable form or meaning recall
- `productive` -> `transfer` after successful production in more than one context
- `transfer` -> `maintenance` after repeated contextual success over time

## Exercise Selection Rules

### New items

Use:

- anchor explanation
- simple recognition
- very light cued recall

Avoid:

- immediate high-effort production

### Fragile anchored items

Use:

- cued recall
- recognition with distractors
- listen-and-select

### Stable recall items

Use:

- typed recall
- cloze
- listen-and-type

### Productive-ready items

Use:

- typed sentence
- short translation
- speaking

### Transfer-ready items

Use:

- dialogue reply
- context selection
- sentence generation

## Context Selection Rules

### For new items

- use anchor context only

### For medium-strength items

- use one familiar plus one slightly varied context

### For mature items

- prefer varied contexts
- use lesson and podcast reinforcement
- avoid overusing the same sentence

## Failure Recovery Logic

When an item is failed:

1. log the event
2. reduce predicted recall
3. decide whether to:
   - requeue in easier form later in session
   - defer to future session
4. optionally show a contrast or explanation if item is confusable

Do not:

- simply repeat the same hard prompt again and again

## Daily Session Completion Summary

At the end of a session, show:

- items reviewed
- new items introduced
- weak items strengthened
- items promoted to a higher stage
- suggested next step

This summary should reinforce progress in terms of learning quality, not just raw count.

## Minimum Viable Algorithm

For the first release, a strong simplified version is:

1. collect due items
2. collect weak items
3. optionally collect a small number of current-lesson new items
4. rank all candidates
5. assemble balanced queue
6. adapt lightly when learner struggles
7. write review events and update learner skill states after each interaction

## Final Recommendation

The daily session should feel curated, varied, and intelligently paced.

The learner should experience:

- enough review to preserve memory
- enough new content to feel progress
- enough context to support transfer
- enough success to stay motivated

without ever needing to understand the algorithm behind it.
