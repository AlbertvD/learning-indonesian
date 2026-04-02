# Learning Indonesian Exercise System Specification

## Purpose

This document specifies the exercise system that powers the retention-first learning experience.

It defines:

- exercise types
- skill mapping
- unlock rules
- scoring behavior
- feedback behavior
- answer matching expectations

## Core Principles

1. Exercises exist to strengthen a specific skill facet.
2. Exercise difficulty should increase gradually.
3. Productive tasks should become more common as memory stabilizes.
4. Feedback should be immediate and useful.
5. The same item should appear in multiple exercise forms over time.

## Skill Facets

The system should support these skill facets:

- `recognition`
- `meaning_recall`
- `form_recall`
- `listening_recognition`
- `spoken_production`
- `context_use`

## Exercise Types

### 1. Recognition Multiple Choice

Purpose:

- low-friction recognition

Primary skill:

- `recognition`

Prompt examples:

- choose the correct translation
- choose the correct Indonesian form

Best for:

- new items
- early anchoring
- overloaded learners

### 2. Listen and Select

Purpose:

- identify known items from audio

Primary skill:

- `listening_recognition`

Best for:

- anchored items
- early listening reinforcement

### 3. Cued Recall

Purpose:

- retrieve with support

Primary skills:

- `meaning_recall`
- `form_recall`

Prompt examples:

- recall from meaning with first-letter hint
- recall from prompt with contextual support

### 4. Typed Recall

Purpose:

- strengthen active retrieval

Primary skills:

- `form_recall`
- `meaning_recall`

Prompt examples:

- type the Indonesian word
- translate a short phrase

### 5. Listen and Type

Purpose:

- connect listening and orthographic recall

Primary skills:

- `listening_recognition`
- `form_recall`

### 6. Cloze

Purpose:

- contextual recall

Primary skills:

- `context_use`
- `form_recall`

Prompt examples:

- fill in the missing word in a sentence

### 7. Sentence Build

Purpose:

- productive composition

Primary skills:

- `context_use`
- `form_recall`

### 8. Dialogue Reply

Purpose:

- use item in communicative context

Primary skills:

- `context_use`
- `spoken_production`

### 9. Speaking / Spoken Recall

Purpose:

- active spoken production

Primary skill:

- `spoken_production`

## Unlock Rules

### New and Anchoring Items

Allowed:

- recognition
- listen and select
- light cued recall

Avoid:

- heavy production
- open-ended sentence generation

### Retrieving Items

Allowed:

- cued recall
- typed recall
- listen and type
- simple cloze

### Productive Items

Allowed:

- typed recall
- cloze
- sentence build
- speaking

### Transfer Items

Allowed:

- dialogue reply
- contextual selection
- sentence build
- speaking in varied contexts

## Scoring Model

Each interaction should record:

- correctness
- partial score if relevant
- latency
- hint usage
- normalized learner response

### Simple Binary Scoring

Use for:

- recognition
- simple listen and select

### Partial Scoring

Use for:

- typed recall with near miss
- sentence build
- dialogue reply
- speaking confidence

## Answer Matching Rules

The app should not judge productive responses too harshly.

At minimum, answer normalization should handle:

- trimming whitespace
- case normalization
- punctuation normalization
- parenthetical stripping
- obvious formatting differences

Later additions should support:

- accepted synonyms
- variant spellings
- inflection tolerance when appropriate
- multiple valid translations

## Feedback Rules

Every exercise should provide immediate feedback.

Feedback should usually include:

- whether the learner was correct
- the correct form
- pronunciation or audio when available
- one example sentence
- short explanation when there is a confusable or common mistake

### After Success

Keep feedback brief:

- confirm success
- optionally show one reinforcing example

### After Failure

Show:

- the correct answer
- a short explanation if helpful
- optional contrast with similar item

Do not:

- overload the learner with long grammar explanations inside the session shell

## Exercise Payload Contract

Each exercise payload should include:

- `learningItemId`
- `skillType`
- `exerciseType`
- `prompt`
- `acceptedAnswers`
- `context`
- `audioPath`
- `feedbackPayload`
- `schedulerMetadata`

Each exercise result should return:

- `wasCorrect`
- `score`
- `latencyMs`
- `hintUsed`
- `normalizedResponse`
- `rawResponse`

## Failure Handling

If learner fails:

- update learner skill state
- reduce predicted recall
- decide whether to requeue in easier form or defer

If learner fails repeatedly:

- step down difficulty
- mark item as fragile
- avoid repeating the same exact prompt pattern

## Recommended Initial Exercise Rollout

Build in this order:

1. recognition multiple choice
2. cued recall
3. typed recall
4. listen and select
5. cloze
6. listen and type
7. sentence build
8. speaking
9. dialogue reply

## Minimum Viable Exercise System

For the first version of the new learning engine, implement:

- recognition
- cued recall
- typed recall

These are enough to:

- support progressive retrieval
- log richer event data
- connect to learner skill state
- start replacing pure flashcard review

## Final Recommendation

The exercise system should make one item feel alive across time.

Instead of seeing the same card repeatedly, the learner should gradually encounter the same concept as:

- something they notice
- something they recall
- something they hear
- something they type
- something they say
- something they use in context

That is what turns flashcard knowledge into real language knowledge.
