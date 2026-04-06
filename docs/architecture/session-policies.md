# Session Policies

`src/lib/sessionPolicies.ts`

---

## Overview

`applyPolicies` takes the raw queue from `buildSessionQueue` and runs it through four active policy layers. Each layer returns a (possibly shorter or reordered) queue. Layers are intentionally composable and independently testable.

```ts
export function applyPolicies(
  queue: SessionQueueItem[],
  context: SessionPoliciesContext,
): SessionQueueItem[]
```

The `SessionPoliciesContext` carries `sessionInteractionCap`, exercise availability data, and grammar pattern metadata.

---

## Layer 1: Exercise Availability Gating

**Function:** `filterByExerciseAvailability`

This layer removes any exercise whose type is currently disabled.

**Early return:** If `context.exerciseTypeAvailability` is `undefined` (the map itself was never loaded), the entire filter is skipped and the queue passes through unchanged — the feature-flag check is also skipped in this case.

Two independent gates are checked in order when the availability map is present:

1. **Env-var feature flag** — `isExerciseTypeEnabled(exerciseType)` from `featureFlags.ts`. This takes precedence. If the flag says disabled, the item is filtered regardless of the DB state.

2. **DB availability gate** — `exercise_type_availability.session_enabled`. If the record is missing (e.g. the availability table failed to load due to a service error), the item **passes through**. This is intentionally fail-open: a transient DB failure should not break an entire session.

```ts
if (!isExerciseTypeEnabled(exerciseType)) return false   // flag wins
const availability = context.exerciseTypeAvailability?.[exerciseType]
if (!availability) return true                          // fail-open: pass through
return availability.session_enabled !== false
```

Note: `exerciseAvailabilityService.isSessionEnabled` is fail-closed and is used for explicit checks; the bulk filtering here is deliberately fail-open.

---

## Layer 2: Grammar-Aware Interleaving

**Function:** `applyGrammarAwareInterleaving`

Skipped if `context.grammarPatterns` is not provided or the queue has ≤2 items.

Grammar items that test the same confusable form are identified via `grammar_patterns.confusion_group`. Seeing two items from the same confusion group back-to-back can cause interference (the learner pattern-matches on recency rather than understanding). This layer reorders the queue to separate them.

**Algorithm:**

1. Partition items into groups by `confusion_group`. Items with no group go into a separate `noGroup` list.
2. Distribute grouped items: the loop advances through groups, placing one item per non-exhausted group per pass. It is not a strict round-robin — `groupIndex` only increments when a group is exhausted, so it repeatedly draws from the same group until it runs dry before moving on.
3. Insert ungrouped items every 3rd position (0-indexed: positions 2, 5, 8, …) across the result.

The algorithm is a best-effort heuristic. If a confusion group has more items than alternatives allow, some adjacency may remain — the constraint is softened rather than hard.

---

## Layer 3: Consecutive Type Cap

**Function:** `applyConsecutiveTypeCap`

Limits consecutive same-type exercises to a maximum of 2 in a row, provided alternatives exist. If all remaining items are the same type, they are placed sequentially (the cap is softened, not enforced at the cost of dropping items).

**Algorithm:** greedy scan — for each position, find the next item in the remaining pool whose type differs from the type of the item placed two positions back (`lastN[0]`). If no such item exists, take the first available. Note: this compares against the older of the last two items, not the most recent — the cap is permissive in edge cases where the last two items differ in type.

This layer applies when the queue has more than 2 items.

---

## Layer 4: Queue Trimming

**Function:** `trimQueueToCapacity`

Simple slice to `sessionInteractionCap`. The session engine outputs the queue in priority order (anchoring → due → new), so a slice preserves the correct priority.

---

## Deferred policies

Two policy hooks are present but intentionally inactive:

- **Approved content check:** `filterByApprovedContent` — commented out, deferred to Phase 2+. Grammar exercises would only be served if all their content has been manually approved. The `exercise_type_availability.requires_approved_content` flag is the planned gate.

- **Mid-session overload detection:** described in comments as "not applicable during initial queue build". It will be applied by `Session.tsx` during the session itself, not during queue construction.

---

## `SessionPoliciesContext` fields

| Field | Purpose |
|---|---|
| `sessionInteractionCap` | Hard cap on queue length after all policies (set to `preferredSessionSize` in Session.tsx) |
| `exerciseTypeAvailability` | Optional map of exercise type → `ExerciseTypeAvailability` from DB |
| `grammarPatterns` | Optional map of item ID → `{ confusion_group? }` |
