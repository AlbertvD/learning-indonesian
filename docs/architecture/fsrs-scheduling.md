# FSRS Scheduling

`src/lib/fsrs.ts` (FSRS implementation), `src/types/learning.ts` (types)

---

## Overview

The app uses FSRS (Free Spaced Repetition Scheduler) to schedule reviews. Each vocabulary item tracks multiple skills independently. The session engine reads FSRS state from `learner_skill_state` and uses it to prioritize items and select exercise types.

---

## Skill types

Four skill types are tracked per item:

| Skill | Exercise types that advance it | Meaning |
|---|---|---|
| `recognition` | `recognition_mcq`, `contrast_pair` | Seeing Indonesian, understanding meaning |
| `form_recall` | `typed_recall`, `cloze`, `sentence_transformation` | Recalling the Indonesian form from a prompt |
| `meaning_recall` | `cued_recall`, `constrained_translation` | Recalling meaning from an Indonesian cue |
| `spoken_production` | `speaking` | Producing spoken Indonesian (disabled) |

Each skill has its own `stability`, `difficulty`, `next_due_at`, and `lapse_count` values. An item can be due for one skill but not another — the session engine checks each skill independently.

---

## Item stages

Items progress through five stages tracked in `learner_item_state.stage`:

```
new → anchoring → retrieving → productive → maintenance
```

| Stage | Meaning | Session behavior | Promotion requires |
|---|---|---|---|
| `new` | Not yet introduced | Always `recognition_mcq`; included via new-item slots | Any review → anchoring |
| `anchoring` | Introduced, not yet stable | Mix of recognition_mcq, cued_recall, meaning_recall, cloze_mcq | Recognition stability >= 1.8, 3 successes, AND at least 1 successful meaning_recall review |
| `retrieving` | Stable enough for spaced recall | FSRS-scheduled; exercises promote recall | All 3 skills (recognition, form_recall, meaning_recall) at stability >= 4.5 |
| `productive` | Strong recall; ready for grammar exercises | Grammar variants preferred if available | All 3 skills at stability >= 21.0, zero lapses |
| `maintenance` | Long-term maintenance | Normal FSRS scheduling | — |

**Anchoring bypass:** Items at `anchoring` stage are always included in the session regardless of `next_due_at`. The reasoning: they have not been seen enough times to survive a gap without regressing.

**Meaning_recall gate (anchoring → retrieving):** Promotion requires at least 1 successful `meaning_recall` review (cued_recall or meaning_recall exercise). This ensures the learner has seen the word from the NL→ID direction before advancing. Based on the SLA acquisitional sequence (Laufer & Goldstein 2004): receptive recognition must precede productive recall.

---

## FSRS parameters per skill

`learner_skill_state` stores:

| Column | FSRS role |
|---|---|
| `stability` | S — interval scaling factor; higher = longer before next review |
| `difficulty` | D — item difficulty (0–1 scale roughly; higher = harder) |
| `next_due_at` | Computed from S and desired retention; when `getRetrievability` would fall below threshold |
| `retrievability` | Written on every review by `reviewHandler.ts`, but not authoritative for session decisions — always recomputed live via `getRetrievability(stability, last_reviewed_at)` |
| `last_reviewed_at` | Timestamp of last review; used with S to compute current R |

**Live retrievability computation:**

`getRetrievability(stability, last_reviewed_at)` computes the current probability of recall using the FSRS exponential decay formula. It is called at session-build time to prioritize items and is not stored in the DB for live use.

---

## Priority and ordering in the session engine

**Due items** are sorted by `1 - minRetrievability` (most overdue = highest priority). The minimum is taken across all due skills of the item — if any skill is in bad shape, the whole item gets elevated priority.

**`recall_sprint` mode** uses the same `1 - minRetrievability` ordering but restricts to items with a `form_recall` skill and forces form-recall exercise types regardless of stage.

---

## Lapse handling

`lapse_count` increments on each failed review. Two thresholds matter:

1. `lapse_count >= 3` → item is classified as **weak** and gets a dedicated weak slot (10% of session size in standard mode). Priority 1.0.

2. Exactly one skill and it is `recognition` (no recall skill yet) → also classified as **weak**. Priority 0.5. This condition is checked alongside lapse count.

3. `is_leech` — set when `lapse_count >= 8` at review time (in `reviewHandler.ts`). Leeches may be suspended (`suspended = true`) and excluded from sessions.

---

## Stage transitions

Stage transitions are recorded in `learner_stage_events` (append-only). The transition rules are applied by the scheduler after each review event. Progressions:

- `new → anchoring`: any review (correct or incorrect) — the flip is unconditional on correctness
- `anchoring → retrieving`: sufficient successful reviews with FSRS stability above a threshold
- `retrieving → productive`: FSRS stability threshold indicating strong recall
- Regressions (lapses): `productive → retrieving`, `retrieving → anchoring`, etc.

The exact thresholds are in `src/lib/stages.ts` (`checkPromotion`, `checkDemotion`). Key constants: `ANCHORING_RECOGNITION_STABILITY = 1.8`, `RETRIEVING_STABILITY = 4.5`.

---

## Session composition and FSRS

The session engine composes sessions in FSRS-aligned priority order:

1. **Anchoring items** — always included (analogous to FSRS learning steps; not yet on the long-term schedule)
2. **All FSRS-due items** — trust the algorithm's scheduling; no artificial percentage caps
3. **New items up to `dailyNewItemsLimit`** — user-configurable (default 10), stored in `profiles.daily_new_items_limit`

The total is trimmed to `preferredSessionSize`. This replaces the previous percentage-based slot allocation (55/20/10%) and new-learner protection rules, which were hand-crafted heuristics not derived from FSRS. See `docs/fsrs-algorithm-research.md` for the research that informed this change.

---

## `filterByApprovedContent` (deferred)

A commented-out policy hook in `sessionPolicies.ts` was intended to restrict grammar exercises to those where all content has been manually approved (via `exercise_type_availability.requires_approved_content`). This is deferred to Phase 2+. Currently all active exercise variants are served regardless of approval state.

---

## Tuning parameters

| Parameter | Location | Current value | Effect |
|---|---|---|---|
| `LESSON_MASTERY_THRESHOLD` | `sessionEngine.ts` | `0.70` | 70% of items must reach `retrieving`+ before next lesson unlocks |
| `dailyNewItemsLimit` | `profiles.daily_new_items_limit` | `10` (default) | New items introduced per session; user-configurable |
| `preferredSessionSize` | `profiles.preferred_session_size` | `15` (default) | Session size cap |
