# Session Modes

The runtime `SessionMode` type lives in `src/lib/session/sessionPlan.ts`:

```ts
export type SessionMode = 'standard' | 'lesson_practice' | 'lesson_review'
```

`standard` is the global Today path. `lesson_practice` and `lesson_review` are launched from an individual lesson page; they filter capabilities to the selected lesson's source refs before the composer fills the session. `lesson_review` does not introduce new capabilities.

The legacy queue modes (`backlog_clear`, `quick`) were retired with `sessionQueue.ts` in retirement #7.

## Capability Planner Modes

The capability planner budget layer also names future focus modes:

```text
listening_focus
pattern_workshop
podcast
```

These are budget/planning concepts in `src/lib/pedagogy/loadBudgets.ts`. They are distinct from the runtime `SessionMode` and only apply when a caller explicitly wires them into a capability session flow.

## Session Posture

Posture is separate from mode:

```text
balanced
light_recovery
review_first
comeback
```

Posture is decided from meaningful practice recency, due backlog pressure, preferred session size, and available eligible new material. It controls hard maximums for risky load; it does not force padding when good candidates run out.
