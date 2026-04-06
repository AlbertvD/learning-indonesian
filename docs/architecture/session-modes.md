# Session Modes

`src/lib/sessionEngine.ts` — `SessionMode` type

---

## Overview

Session mode is passed as `sessionMode` in `SessionBuildInput`. It modifies slot allocation, item eligibility, exercise type selection, and session size in `buildSessionQueue`. Five modes exist; `standard` is the default when `sessionMode` is absent or undefined.

```ts
export type SessionMode = 'standard' | 'backlog_clear' | 'recall_sprint' | 'push_to_productive' | 'quick'
```

---

## `standard`

The default mode. Normal slot-allocation ratios. Full exercise type rotation based on item stage.

| Slot type | Allocation |
|---|---|
| Due reviews | 55% of session size |
| Anchoring reinforcement | 20% |
| Weak items | 10% |
| New items | `calculateNewSlots()` — 0/2/8 based on due count, or fills remaining capacity when no reviews exist at all |

All five session policies apply. Item eligibility: all active items with meanings in the user's language (grammar items exempt from meanings filter).

---

## `quick`

A frictionless short session for high-frequency study. Designed for a few minutes between other activities.

**Differences from standard:**
- `effectiveSessionSize` is fixed to **5** regardless of `preferredSessionSize`.
- Items that already have a `form_recall` skill at `retrieving`+ stage are biased toward recall exercises (`typed_recall` or `cloze`) rather than the stage-based default.
- Items without a `form_recall` skill (new, anchoring) fall through to normal stage-based exercise selection.
- Slot allocation ratios (55% due / 20% anchoring / 10% weak) are identical to `standard`, applied to `effectiveSessionSize = 5`. New items still use `calculateNewSlots`.

The 5-item cap means session policies (particularly `trimQueueToCapacity`) have little work to do — the queue is already small.

---

## `recall_sprint`

Focuses entirely on recall quality. Designed for testing what the learner can actively produce.

**Differences from standard:**
- **Item filter:** Only items with a `form_recall` skill are eligible. New and `anchoring` items are excluded — they produce recognition exercises and cannot improve recall quality.
- **Slot allocation:** All eligible items are placed in the `due` bucket (ranked by lowest retrievability). No anchoring, weak, or new slots.
- **Exercise selection:** Forces recall exercise types regardless of stage — `cloze` for sentence items, `typed_recall` for word items.
- **Ordering:** Items are prioritized by `1 - minRetrievability` across `form_recall` skills — the most-forgotten items come first.

This mode does not throttle new items (there are none) and ignores FSRS due dates — all eligible items are candidates.

---

## `backlog_clear`

Clears a large due backlog as efficiently as possible.

**Differences from standard:**
- `dueSlots` is set to 100% of session size.
- `anchoringSlots`, `weakSlots`, and `newSlots` are all 0.
- Anchoring, weak, and new slots are all zeroed — enforced via slot allocation, not an eligibility filter. Only due items end up in the session.

This mode is not meant for regular use — it is a recovery tool when the learner returns after a long break and has many overdue items. No new introductions happen until the backlog is cleared.

---

## `push_to_productive`

Accelerates items from `retrieving` stage toward `productive`.

**Differences from standard:**
- **Item filter:** Only items at `retrieving` stage **and** with a `form_recall` skill are included. Items with only a `recognition` skill are excluded — typed recall exercises would have no matching skill state to score against.
- **Slot allocation:** All qualifying items go into the `due` bucket regardless of FSRS due date. Priority: `maxStability / 20` — higher stability means longer time before forgetting; in this context it serves as a proxy for graduation readiness.
- **New items:** Suppressed (same as `backlog_clear` and `recall_sprint`).

This mode is used when the learner wants to push through to productive-level mastery rather than waiting for the normal FSRS schedule.

---

## Mode comparison table

| Feature | `standard` | `quick` | `recall_sprint` | `backlog_clear` | `push_to_productive` |
|---|---|---|---|---|---|
| Session size | `preferredSessionSize` | 5 | `preferredSessionSize` | `preferredSessionSize` | `preferredSessionSize` |
| Due items | 55% | 55% | All eligible | 100% | All retrieving+recall |
| Anchoring | 20% | 20% | 0 | 0 | 0 |
| Weak | 10% | 10% | 0 | 0 | 0 |
| New items | `calculateNewSlots` | `calculateNewSlots` | 0 | 0 | 0 |
| Exercise type | Stage-based | Recall-biased for items with form_recall at retrieving+; stage-based otherwise | Force recall | Stage-based | Stage-based |
| FSRS due gate | Yes | Yes | No (all eligible) | Yes | No (all retrieving) |
| Item filter | Active + meanings | Active + meanings | Has form_recall skill | Active + meanings | retrieving + form_recall |

---

## Session mode and session policies

Session policies (`applyPolicies`) always run after `buildSessionQueue` regardless of mode. All five active policy layers (out of seven enumerated) apply to all modes. The most relevant interactions:

- **Grammar-aware interleaving (layer 2):** Applied to all modes. Grammar items are interleaved regardless of mode.
- **New learner protection (layer 4):** Applied regardless of mode. In `recall_sprint`/`backlog_clear`/`push_to_productive`, there are no new items in the raw queue, so this layer is a no-op.
- **Queue trimming (layer 5):** The `sessionInteractionCap` hard cap is always enforced. In `quick` mode the queue is already at 5 items so trimming rarely applies.
