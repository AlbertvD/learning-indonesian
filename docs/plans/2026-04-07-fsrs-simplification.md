# FSRS Simplification: Remove Session Engine, Trust the Scheduler

**Date:** 2026-04-07
**Status:** Proposed
**Depends On:** Retention-First V2 (`2026-03-30`), FSRS Goal System (`2026-04-02`), Session Refactor (`2026-04-02`)

---

## Problem

Four vocabulary items are permanently stuck in `anchoring` stage despite 30+ correct reviews. Their stability converges toward zero instead of growing past the 1.8 promotion threshold.

**Root cause:** The session engine forces anchoring items into every session (line 108: `if (state.stage === 'anchoring')`). Because the user does multiple sessions per day, anchoring items get reviewed at near-perfect retrievability (R ~ 1.0). FSRS's stability update includes a `(e^(w[10]*(1-R)) - 1)` term — when R ~ 1 this produces near-zero or negative stability gain. After 30+ reviews, stability remains 0.08-0.79.

**Why piecemeal fixes fail:** The session engine's stage-based scheduling fundamentally conflicts with FSRS. Any fix that keeps the engine's anchoring-priority logic risks a repeat — the engine will always find a reason to over-schedule items that FSRS already handles correctly. The correct fix is to stop second-guessing FSRS.

---

## Solution

Delete `sessionEngine.ts`. Replace its 743 lines with a simple due-queue that trusts FSRS scheduling completely.

### New session queue logic

```typescript
// src/lib/sessionQueue.ts (~80 lines total including exercise selection)

export type SessionMode = 'standard' | 'backlog_clear' | 'quick'

export function buildSessionQueue(input: SessionBuildInput): SessionQueueItem[] {
  const { skillStates, itemStates, preferredSessionSize, dailyNewItemsLimit,
          lessonFilter, lessonOrder, userLanguage } = input
  const sessionMode = input.sessionMode ?? 'standard'
  const effectiveSessionSize = sessionMode === 'quick' ? 5 : preferredSessionSize

  // 1. Filter eligible items (by lesson, by language — same as today)
  let eligibleItems = filterEligible(input)

  // 2. Due items: any skill with next_due_at <= now, most overdue first
  const now = new Date()
  const dueItems = eligibleItems
    .filter(item => {
      const state = itemStates[item.id]
      if (!state || state.stage === 'new' || state.suspended) return false
      const skills = skillStates[item.id] ?? []
      return skills.some(s => s.next_due_at && new Date(s.next_due_at) <= now)
    })
    .sort((a, b) => {
      const aMin = Math.min(...(skillStates[a.id] ?? [])
        .filter(s => s.next_due_at && new Date(s.next_due_at) <= now)
        .map(s => new Date(s.next_due_at!).getTime()))
      const bMin = Math.min(...(skillStates[b.id] ?? [])
        .filter(s => s.next_due_at && new Date(s.next_due_at) <= now)
        .map(s => new Date(s.next_due_at!).getTime()))
      return aMin - bMin  // most overdue first
    })

  // 3. New items: gated by lesson mastery, capped by dailyNewItemsLimit
  const newItems = sessionMode === 'backlog_clear'
    ? []
    : applyLessonGate(eligibleItems, itemStates, contextsByItem, lessonOrder)
        .slice(0, dailyNewItemsLimit)

  // 4. Compose queue: due first, then new, trimmed to session size
  const candidates = [...dueItems, ...newItems].slice(0, effectiveSessionSize)

  // 5. Build exercises and order
  return buildAndOrderExercises(candidates, input)
}
```

Key property: **no stage-based branching in queue building**. FSRS's `next_due_at` is the sole scheduling signal. Anchoring items appear when FSRS says they're due — not before.

### What changes

| Component | Action | Reason |
|-----------|--------|--------|
| `src/lib/sessionEngine.ts` | **Delete** | Replaced by `src/lib/sessionQueue.ts` |
| `src/lib/sessionQueue.ts` | **Create** | Simple due-queue + exercise selection |
| `src/lib/fsrs.ts` | **No change** | `enable_short_term` already absent (defaults to `true` in ts-fsrs); we keep it absent — see note below |
| `src/lib/stages.ts` | **No change** | Stage labels remain for display/progression |
| `src/lib/sessionPolicies.ts` | **No change** | Still applies exercise availability, grammar interleaving, consecutive cap |
| `src/lib/reviewHandler.ts` | **No change** | Processes reviews the same way |
| `src/pages/Session.tsx` | **Update imports** | `buildSessionQueue` from new file, `SessionMode` reduced to 3 values |
| `src/pages/Dashboard.tsx` | **Update action cards** | Remove `recall_sprint` and `push_to_productive` mode references |
| `src/__tests__/sessionEngine.test.ts` | **Replace** with `sessionQueue.test.ts` | New tests for simplified queue |

### `enable_short_term` note

ts-fsrs defaults `enable_short_term` to `true`, which enables intraday learning steps (intervals < 1 day). The current `fsrs.ts` does not set this parameter, so it uses the default. With the old session engine gone, FSRS short-term steps handle intraday repetition naturally — no special anchoring logic needed. If testing reveals that short-term steps cause the same over-scheduling problem (user does many sessions/day), set `enable_short_term: false` explicitly to force minimum 1-day intervals. This is a tuning decision, not an architectural one.

---

## What's removed and why

| Removed | Why it existed | Why it's safe to remove |
|---------|---------------|------------------------|
| Anchoring priority (`anchoringItems` array) | Pre-FSRS reinforcement heuristic | FSRS handles new-card intervals via learning steps |
| `recall_sprint` mode | Escape hatch to force recall practice | Unnecessary once FSRS schedules correctly; users can filter by lesson instead |
| `push_to_productive` mode | Escape hatch to force retrieving items | Unnecessary once stuck items are unstuck; FSRS naturally advances stability |
| Stage-based exercise selection weighting | Controlled exercise type by stage | Exercise selection still stage-aware (new items get recognition MCQ, retrieving items get recall) — this logic moves into `sessionQueue.ts` unchanged |
| Priority scoring by retrievability | Complex scoring for queue ordering | Replaced by simple `next_due_at` sort (most overdue first) |

---

## What's kept and why

| Kept | Why |
|------|-----|
| Stage labels (anchoring/retrieving/productive/maintenance) | Display, progression thresholds in `stages.ts`, dashboard stats |
| `standard` / `backlog_clear` / `quick` modes | Useful session framing: standard (due + new), backlog_clear (due only), quick (cap 5) |
| Lesson gating for new items | 70% mastery gate prevents lesson-skipping; logic extracted from `applyLessonGate` as-is |
| Exercise type selection by stage | New items → recognition MCQ, retrieving → recall exercises. Logic preserved, just relocated |
| `sessionPolicies.ts` | Exercise availability, grammar interleaving, consecutive cap — all still apply post-queue |
| Weekly goals | Computed from `review_events` and `learner_skill_state`, not from session engine |
| Semantic distractor groups | MCQ quality feature, moves into `sessionQueue.ts` unchanged |

---

## Migration plan

### Step 1: Repair damaged stability (one-time script)

Create `scripts/repair-stability.ts` to fix items with stability damaged by the over-review bug:

```typescript
// Find learner_skill_states where:
//   - success_count >= 5 (plenty of correct reviews)
//   - stability < 1.0 (should be higher given success count)
//   - item stage is 'anchoring' (stuck)
//
// For each: reset stability to a healthy value based on success_count,
// set next_due_at to now + 1 day, and promote to 'retrieving' if thresholds met.
```

Run via `bun run scripts/repair-stability.ts` with `SUPABASE_SERVICE_KEY`. Idempotent — safe to re-run.

### Step 2: Create `sessionQueue.ts`

New file with:
- `buildSessionQueue()` — the simplified queue builder
- `applyLessonGate()` — extracted from old engine, unchanged
- `selectExercises()` — extracted from old engine, unchanged
- `orderQueue()` — extracted from old engine, unchanged
- Exercise maker functions (`makeRecognitionMCQ`, `makeTypedRecall`, etc.) — unchanged
- Semantic distractor groups — unchanged

The exercise selection logic (which exercise type for which stage) is preserved exactly. Only the queue building and prioritization logic changes.

### Step 3: Update Session.tsx

- Import from `@/lib/sessionQueue` instead of `@/lib/sessionEngine`
- Remove `recall_sprint` and `push_to_productive` from the `SessionMode` validation

### Step 4: Update Dashboard.tsx

- `recall_quality` action card: change mode from `recall_sprint` to `standard` (or remove special mode)
- `usable_vocabulary` action card: change mode from `push_to_productive` to `standard`
- Keep `backlog_clear` and `quick` modes as-is

### Step 5: Delete `sessionEngine.ts` and update tests

- Delete `src/lib/sessionEngine.ts`
- Replace `src/__tests__/sessionEngine.test.ts` with `src/__tests__/sessionQueue.test.ts`

### Step 6: Verify

```bash
bun run test          # all tests pass
bun run build         # compiles cleanly
bun run check-types   # no type errors
```

Manual verification: run a session, confirm anchoring items only appear when their `next_due_at` has passed.

---

## Dashboard action card mapping (after simplification)

| Goal | Old mode | New mode | Behavior |
|------|----------|----------|----------|
| `consistency` | `quick` | `quick` | Cap 5, mixed due + new |
| `recall_quality` | `recall_sprint` | `standard` | Normal session (FSRS already schedules recall-due items) |
| `usable_vocabulary` | `push_to_productive` | `standard` | Normal session (FSRS naturally advances items) |
| `review_health` | `backlog_clear` | `backlog_clear` | Due only, no new items |

---

## Risks and rollback

| Risk | Mitigation |
|------|-----------|
| New items drip too slowly (FSRS schedules 1-day minimum) | Monitor via dashboard stats; if needed, enable `enable_short_term: true` for sub-day intervals on first-seen items |
| Removing recall_sprint removes user agency | Users can still filter by lesson; the main value prop was fixing stuck items, which the stability repair addresses |
| Exercise type distribution changes | Exercise selection logic is preserved exactly — only queue composition changes |
| Repair script damages good data | Script only targets items with success_count >= 5 AND stability < 1.0 — a combination that should not occur under healthy FSRS |

**Rollback:** `sessionEngine.ts` remains in git history. If the simplified queue causes regressions, restore it and revert `Session.tsx` imports. The stability repair is a separate, non-reversible fix (but correct regardless of which queue system is used).

---

## Supabase Requirements

### Schema changes
- N/A — no database schema changes. `SessionMode` is a frontend-only concept passed via URL `?mode=` param. `learning_sessions.session_type` column tracks `lesson|learning|podcast|practice`, not session modes.
- The stability repair script writes to existing `learner_skill_state` and `learner_item_state` tables using `service_role` — no new tables, columns, or policies needed.

### homelab-configs changes
- [ ] PostgREST: N/A — no new schema exposure
- [ ] Kong: N/A — no new CORS origins
- [ ] Storage: N/A — no new buckets

### Health check additions
- N/A — no new tables or RPC functions to check

---

## Files summary

| File | Change |
|------|--------|
| `src/lib/sessionQueue.ts` | **New** — simplified queue builder (~300 lines: queue logic + exercise selection + helpers) |
| `src/lib/sessionEngine.ts` | **Delete** (743 lines) |
| `src/pages/Session.tsx` | **Update** — import from `sessionQueue`, remove 2 session modes |
| `src/pages/Dashboard.tsx` | **Update** — remap action card modes |
| `src/__tests__/sessionQueue.test.ts` | **New** — replaces `sessionEngine.test.ts` |
| `src/__tests__/sessionEngine.test.ts` | **Delete** |
| `scripts/repair-stability.ts` | **New** — one-time data repair |
