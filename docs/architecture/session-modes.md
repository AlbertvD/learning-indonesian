# Session Modes

## Legacy Queue Modes

`src/lib/sessionQueue.ts` currently supports:

```ts
export type SessionMode = 'standard' | 'backlog_clear' | 'quick'
```

## `standard`

The normal legacy queue. It can include due review, anchoring reinforcement, new vocabulary, and grammar items.

New item pacing is controlled by `dailyNewItemsLimit`, lesson gating, exercise availability, and the final session size cap.

## `quick`

A short legacy queue with:

```text
effectiveSessionSize = 5
```

Quick mode keeps the same safety gates but suppresses grammar slots and trims the queue early.

## `backlog_clear`

A due-review recovery mode. It suppresses new item introduction and grammar slots so the learner can reduce review backlog without adding more review debt.

## Capability Planner Modes

The capability planner budget layer also names future focus modes:

```text
listening_focus
pattern_workshop
podcast
```

These are budget/planning concepts in `src/lib/pedagogy/loadBudgets.ts`. They are not the same as active legacy `sessionQueue.ts` modes unless a caller explicitly wires them into a capability session flow.

## Session Posture

Posture is separate from mode:

```text
balanced
light_recovery
review_first
comeback
```

Posture is decided from meaningful practice recency, due backlog pressure, preferred session size, and available eligible new material. It controls hard maximums for risky load; it does not force padding when good candidates run out.
