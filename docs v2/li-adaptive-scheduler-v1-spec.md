# Learning Indonesian Adaptive Scheduler V1 Specification

## Purpose

This document defines the first practical adaptive scheduler for the retention-first learning system.

It is intentionally simpler than a full machine-learned scheduler, but much stronger than SM-2 because it reasons about:

- skill type
- recent success and failure
- elapsed time
- response latency
- learner stage
- weakness

The goal of V1 is not perfection. The goal is to establish a stable, interpretable, testable adaptive scheduling layer that can later evolve into a more sophisticated memory model.

## Goals

The scheduler should:

- decide when an item-skill is next due
- estimate recall fragility in a simple, explainable way
- prioritize weak and overdue items
- support different behavior by skill facet
- avoid one-interval-fits-all review timing

## Non-Goals

V1 is not trying to:

- fully learn from large-scale model training
- optimize with reinforcement learning
- model every possible memory variable
- replace product judgment with black-box scoring

## Scheduling Unit

The unit of scheduling is:

- `user_id`
- `learning_item_id`
- `skill_type`

This means one item may have different due times for:

- recognition
- form recall
- listening recognition
- spoken production
- context use

## Core State Fields

Each `learner_skill_state` should maintain at minimum:

- `success_count`
- `failure_count`
- `lapse_count`
- `last_reviewed_at`
- `next_due_at`
- `stability`
- `difficulty`
- `retrievability`
- `mean_latency_ms`
- `hint_rate`
- `current_model_version`

## Conceptual Model

V1 should use three internal concepts:

### 1. Stability

Represents how slowly the memory decays.

Higher stability means:

- longer intervals can be tolerated
- less urgent review

### 2. Difficulty

Represents how hard this skill-item combination is for the learner.

Higher difficulty means:

- slower interval growth
- more cautious promotion

### 3. Retrievability

Represents current estimated ease of retrieval at this moment.

Higher retrievability means:

- lower urgency
- item may be delayed

## Initial Values

When a skill state is first created:

- `stability = 1.0`
- `difficulty = 1.0`
- `retrievability = 1.0`
- `success_count = 0`
- `failure_count = 0`
- `lapse_count = 0`

Recommended initial bias by skill:

- `recognition`: easier baseline
- `meaning_recall`: medium baseline
- `form_recall`: medium-hard baseline
- `listening_recognition`: medium-hard baseline
- `spoken_production`: hardest baseline
- `context_use`: hardest baseline

That can be implemented as a skill-specific multiplier on interval growth or required confidence.

## Time Decay

Retrievability should decay as time passes since `last_reviewed_at`.

V1 does not need an advanced equation yet. A simple practical model is acceptable:

`retrievability = clamp(0, 1, stability / (stability + elapsed_days * difficulty_multiplier))`

Where:

- `elapsed_days` is time since last review
- `difficulty_multiplier` increases with difficulty

This keeps the model:

- interpretable
- monotonic
- easy to tune

## Difficulty Multiplier

Suggested simplified difficulty multiplier:

`difficulty_multiplier = base_skill_weight * difficulty * lapse_penalty * hint_penalty`

### Base skill weight

Recommended starting weights:

- recognition: `0.8`
- meaning_recall: `1.0`
- form_recall: `1.1`
- listening_recognition: `1.15`
- spoken_production: `1.3`
- context_use: `1.25`

### Lapse penalty

Suggested:

`1 + min(lapse_count * 0.1, 0.5)`

### Hint penalty

Suggested:

`1 + min(hint_rate * 0.3, 0.3)`

## Outcome Update Rules

After each review event, update the state.

## Success Update

If the learner succeeds:

- increment `success_count`
- slightly increase `stability`
- slightly reduce `difficulty` if success is confident
- reset or reduce fragile state if there were previous lapses

Suggested update:

`stability = stability * growth_factor`

Where `growth_factor` may depend on:

- skill type
- latency
- whether hints were used
- current stage

Suggested base success growth:

- fast confident success: `1.25`
- normal success: `1.15`
- slow success or hint-assisted success: `1.05`

Difficulty may be updated as:

`difficulty = max(0.7, difficulty * 0.98)` for strong success

or unchanged for weaker success.

## Failure Update

If the learner fails:

- increment `failure_count`
- increment `lapse_count`
- reduce `stability`
- increase `difficulty`

Suggested update:

`stability = max(0.5, stability * 0.65)`

`difficulty = min(2.0, difficulty * 1.08)`

For repeated failure:

- step down task difficulty
- consider fragile item treatment

## Latency Adjustment

Latency is an important signal even on correct answers.

Suggested latency bands:

- fast: below expected threshold for exercise
- normal: within expected range
- slow: significantly above expected range

Approximate initial thresholds:

- recognition: 4 seconds
- cued recall: 6 seconds
- typed recall: 10 seconds
- cloze: 12 seconds
- speaking: 15 seconds

Use latency to:

- dampen stability growth when answers are slow
- identify shallow knowledge that looks correct but is fragile

## Hint Adjustment

Hints should reduce confidence in success.

Suggested effect:

- success with hint counts as weaker success
- do not promote stage on repeated hinted success alone

## Next Due Calculation

Once updated state is computed, calculate the next interval.

Suggested conceptual rule:

`next_interval_days = stability * skill_interval_multiplier * stage_multiplier`

### Suggested skill interval multipliers

- recognition: `1.2`
- meaning_recall: `1.0`
- form_recall: `0.9`
- listening_recognition: `0.85`
- spoken_production: `0.7`
- context_use: `0.75`

### Suggested stage multipliers

- anchoring: `0.5`
- retrieving: `0.8`
- productive: `1.0`
- transfer: `1.1`
- maintenance: `1.25`

Then clamp to a sensible band:

- minimum: same day or next day depending on outcome
- maximum: grow gradually, not explosively in V1

## Due Score

The scheduler also needs a prioritization score for session building.

Suggested conceptual formula:

`due_score = overdue_factor + fragility_factor + production_priority + weakness_bonus - recent_exposure_penalty`

### Overdue factor

Higher when `now > next_due_at`

### Fragility factor

Higher when:

- low retrievability
- high difficulty
- high lapse count

### Production priority

Higher for:

- spoken production
- context use
- form recall weaknesses

### Weakness bonus

Higher when:

- recent repeated failure
- recognition much stronger than production

### Recent exposure penalty

Lower priority when the learner just saw the item recently unless it needs within-session recovery.

## Promotion Rules

The scheduler should recommend but not solely decide promotions.

Promotion readiness can be inferred when:

- retrievability remains acceptable over multiple reviews
- success is repeated
- latency is not too high
- success appears across more than one task type

## Demotion Rules

Recommend demotion when:

- repeated failures occur
- learner only succeeds with hints
- production repeatedly fails despite recognition success

## Leech Handling

Items with repeated failures should not be treated like normal items.

Suggested detection:

- `lapse_count >= 4` within a rolling window

Suggested treatment:

- shorter intervals
- easier prompt types
- contrast feedback
- possible confusable review

## Fallback and Safety Rules

If state becomes inconsistent or missing:

- fall back to conservative scheduling
- never schedule a brand-new productive item too far out
- never allow intervals to explode after one easy success

## Suggested V1 Thresholds To Tune

These should be treated as initial defaults, not permanent truth.

- strong success growth: `1.25`
- normal success growth: `1.15`
- weak success growth: `1.05`
- failure stability multiplier: `0.65`
- failure difficulty multiplier: `1.08`
- leech threshold: `4` lapses

## Required Event Inputs

The scheduler should consume these review event fields:

- `was_correct`
- `latency_ms`
- `hint_used`
- `exercise_type`
- `skill_type`
- `created_at`

## Outputs

For each updated state, the scheduler should produce:

- `retrievability`
- `stability`
- `difficulty`
- `next_due_at`
- `due_score`
- `recommended_next_exercise_type`
- `promotion_recommendation`

## Metrics To Evaluate Scheduler V1

Measure:

- lapse rate
- session completion rate
- percent of items repeatedly overdue
- productive recall improvement
- prediction usefulness based on actual success outcomes

## Why V1 Is Good Enough

V1 gives the system:

- a better memory model than SM-2
- skill-specific behavior
- support for weak-item recovery
- support for mixed session composition
- a path to more advanced scheduling later

without requiring heavy model infrastructure at the start.

## Final Recommendation

Build V1 as an interpretable adaptive scheduler with:

- stability
- difficulty
- retrievability
- skill-aware interval multipliers
- event-based updates

Then tune it using real user data before moving to a more advanced predictive model.
