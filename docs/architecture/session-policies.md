# Session Policies

`src/lib/sessionPolicies.ts`

## Overview

`applyPolicies` transforms the legacy queue returned by `buildSessionQueue`.

```ts
export function applyPolicies(
  queue: SessionQueueItem[],
  context: SessionPoliciesContext,
): SessionQueueItem[]
```

The capability session path has its own planner/composer gates and does not use this policy stack directly.

## Active Layers

Current active layers:

```text
1. exercise availability gating
2. grammar-aware interleaving
3. consecutive exercise-type cap
4. queue trimming
```

Older references to a new-learner-protection layer or five active layers are stale.

## Layer 1: Exercise Availability Gating

`filterByExerciseAvailability` removes exercises that are disabled.

Order:

```text
environment feature flag
database exercise_type_availability.session_enabled
```

If the database availability row is missing, this bulk policy is fail-open so a transient availability-loading issue does not empty the whole queue.

## Layer 2: Grammar-Aware Interleaving

`applyGrammarAwareInterleaving` separates grammar items with the same `confusion_group` where alternatives exist. The rule is best-effort and does not drop items to enforce perfect spacing.

## Layer 3: Consecutive Type Cap

`applyConsecutiveTypeCap` avoids more than two consecutive exercises of the same type when alternatives are available. The cap softens when the remaining queue has no alternatives.

## Layer 4: Queue Trimming

`trimQueueToCapacity` slices the queue to `sessionInteractionCap`.

The legacy queue is already ordered by session priority before policy trimming, so the trim preserves the queue's intended priority order.

## Deferred Policies

Deferred policy ideas remain outside this function:

- approved-content enforcement for grammar variants;
- mid-session overload detection;
- capability-posture adaptation after repeated failures.
