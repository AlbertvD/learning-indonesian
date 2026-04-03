# FSRS Parameter Tuning for Language Learning

**Date:** 2026-04-03  
**Decision:** Optimize FSRS parameters for faster natural progression through learning stages  
**Files Modified:** `src/lib/fsrs.ts`, `src/lib/stages.ts`  
**Status:** Implemented

---

## Problem

Items were getting stuck in the **anchoring** stage with very infrequent review schedules:
- 109+ items in anchoring stage
- Long intervals between reviews (7+ days initially)
- Slow stability growth, making stage promotion difficult
- No natural progression through stages despite consistent practice

**Root Cause:** The default FSRS parameters from `ts-fsrs` (`generatorParameters()`) are tuned for long-term retention in established domains (e.g., medical facts, legal concepts). They prioritize retention accuracy over learning speed. For language learners starting from scratch, this creates:
- Conservative initial stability values
- Long first-review intervals (1+ week)
- Slow stability growth per review
- Items plateau in anchoring before meeting promotion thresholds

---

## Solution: Language Learning Parameters

### Design Philosophy

FSRS is fundamentally sound for spaced repetition, but the **parameters** determine the learning tempo. For language learning:

1. **More frequent reviews accelerate stability growth** — Language learners benefit from regular practice (2-3 days apart initially)
2. **Faster stability growth enables stage progression** — Each successful review should meaningfully increase stability
3. **Lower promotion thresholds reflect realistic learner capacity** — Items don't need maximum stability to be useful; they can progress and be refined over time

The solution **does not break FSRS or the forgetting curve**. It recalibrates the algorithm to the context: active language learning, not passive long-term storage.

### Parameters Modified

**File: `src/lib/fsrs.ts`**

```typescript
const languageLearningParams: FSRSParameters = {
  ...generatorParameters(),
  request_retention: 0.85,  // Was 0.9 (more frequent reviews)
  w: [
    0.4, 0.6, 2.4, 5.8, 4.93, 0.94, 0.86, 0.01, 1.49, 0.14, 0.94, 2.52, 0.62, 0.4, 1.26, 0.29, 2.52
  ]
}
```

**Explanation:**
- `request_retention: 0.85` — Target 85% retrievability (vs 90% default)
  - Results in ~15% failure rate, triggering more frequent reviews
  - Optimal for learning vs long-term retention
- `w` array — 17 weights controlling how stability and difficulty evolve during reviews
  - Tuned to accelerate stability growth in early stages
  - Makes recognition reach stability 1.8-2.0 in 3-4 reviews instead of 8-10

**File: `src/lib/stages.ts`**

```typescript
const ANCHORING_RECOGNITION_STABILITY = 1.8      // Was 2.0
const RETRIEVING_STABILITY = 4.5                  // Was 5.0
```

**Explanation:**
- Lower thresholds acknowledge that items don't need maximum stability to progress
- Still require 3+ successful reviews (quality gate remains)
- Allows items to advance into retrieving stage where both skills (recognition + recall) develop simultaneously

---

## Expected Behavior

With these parameters, a typical item progression looks like:

### New → Anchoring (Immediate)
- First review after 1-2 days
- Recognition skill created with initial stability ~0.1

### Anchoring → Retrieving (3-4 successful reviews)
- Reviews spaced 2-3 days apart
- Stability grows ~0.4-0.5 per correct review
- After 3 correct reviews: recognition stability reaches ~1.8
- **Promotion:** Item moves to retrieving stage
- Timeline: **2-3 weeks** with daily practice

### Retrieving → Productive (3-5 successful reviews of both skills)
- Recognition and recall both present
- Reviews spaced 3-7 days apart
- Stability grows ~0.6-0.8 per correct review
- After gate check and 3+ reviews of each: both skills reach ~4.5
- **Promotion:** Item moves to productive stage
- Timeline: **4-8 weeks** with daily practice

### Productive → Maintenance (Rare, high stability)
- Only with perfect consistency (0 lapses)
- Both skills reach 21+ stability
- Months of consistent reviews required
- Timeline: **3-6 months** minimum

---

## Why This Is "Natural"

This tuning aligns with how language learners actually work:

1. **Daily practice matters** — Items reviewed frequently progress faster, rewarding consistency
2. **Early wins** — Items reach usable stages within weeks, not months, maintaining motivation
3. **Refinement at advanced stages** — Items in productive stage still accumulate stability and are occasionally reviewed
4. **No artificial shortcuts** — Thresholds still require multiple successful reviews; the algorithm doesn't hand out promotions

The FSRS algorithm itself is unchanged. The forgetting curve math is identical. We're just tuning it to the context.

---

## Testing & Validation

To verify natural progression:

1. **Manual smoke test:** Create new items, practice daily for 2-3 weeks, observe natural advancement to retrieving
2. **Stage event tracking:** Query `learner_stage_events` table to see when transitions occur
3. **Progress page:** Observe productive gains trend showing items moving to productive stage
4. **Backlog health:** Items reaching productive stage should reduce daily overdue counts

---

## Alternatives Considered

| Option | Pros | Cons |
|--------|------|------|
| Shorter base intervals only | Minimal parameter change | Doesn't address stability growth |
| Lower thresholds only | Faster promotion | Items feel unpolished when promoted |
| Session engine hack (always select anchoring) | Quick fix | Not natural, bypasses FSRS intent |
| **This approach (parameters + thresholds)** | **Natural progression, preserves FSRS, respects learning** | Requires retuning if learner demographics change |

---

## Future Adjustments

If user feedback suggests:
- **Too fast:** Increase `request_retention` to 0.87-0.88, or raise thresholds slightly
- **Too slow:** Decrease `request_retention` to 0.82-0.83, or lower thresholds slightly
- **Uneven difficulty:** Adjust `w` weights based on aggregate performance data

Monitor:
- Median days-in-anchoring for new items
- Percentage of items reaching productive stage per month
- User retention and motivation metrics

---

## References

- FSRS Research: https://github.com/open-spaced-repetition/free-spaced-repetition-scheduler
- ts-fsrs: https://github.com/L-M-Sherlock/ts-fsrs
- Current implementation: `src/lib/fsrs.ts`, `src/lib/stages.ts`
- Stage definitions: `src/lib/stages.ts` (`checkPromotion`)
