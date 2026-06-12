---
status: approved
reviewed_by: [architect, data-architect]   # both APPROVE-WITH-CHANGES (2026-06-12); all findings applied
review_notes: |
  architect APPROVE-WITH-CHANGES: Q2 (moeilijk = separate TS signal, not a MasteryLabel/rung) confirmed sound;
  TS-only/no-SQL-mirror + constant threshold + mastered-out-of-scope all confirmed lower-mechanism. W1 (pin
  predicate order TS=SQL) applied §2; W2 (resolve Q5 in-spec) applied §5; W3 (Q-B consolidation) applied §5.1;
  stale analytics-mastery.md §2 noted (two revisions behind — OR→AND).
  data-architect APPROVE-WITH-CHANGES: Q1 (only _mastery_label computes at_risk; get_lessons_overview untouched)
  + Q5 (first-miss = no movement; rank tables unchanged) verified. MAJOR F1 (pin exact _mastery_label CASE order,
  TS=SQL) applied §2 verbatim; F3 (compound parity-test regex + assert naked form absent) applied §3; F2
  (weakestLabel comment) + I1 (drop inert lapse_count select in get_lessons_overview) noted §3.
supersedes: []
grounded_against:
  - CONTEXT.md → Mastered / at_risk (the canonical predicate this refines)
  - docs/current-system/modules/analytics-mastery.md (labelForCapability, weakestLabel, the funnel/movement derivers)
  - docs/current-system/modules/analytics.md (the ADR-0015 SQL-mirror map; HC27/HC28)
  - docs/adr/0015-read-model-aggregation-server-side-parity-tested-mirror.md (the TS↔SQL mirror obligation)
  - docs/plans/2026-06-11-at-risk-currently-failing.md (the self-healing change this builds on)
  - src/lib/analytics/mastery/masteryModel.ts (labelForCapability:169, weakestLabel:201)
  - scripts/migration.sql (_mastery_label:2203; get_lessons_overview:1979 — mastered only, untouched)
related:
  - docs/plans/2026-06-10-learner-progress-analytics-redesign.md (the funnel/movement surfaces that consume this)
---

# Refine the mastery ladder: at-risk = genuine lapse only; new "moeilijk" stubborn-word signal

## 1. Problem

The `at_risk` rung fires on **any** current failure (`labelForCapability:170`,
`consecutiveFailureCount > 0`). On live data that floods it with **new-word
acquisition misses**: of one learner's 33 at-risk words, **23 had never been
learned** (`lapse_count = 0`, all seen ≤ 1×) and only **10 were genuine lapses**
(`lapse_count > 0` — learned, then forgotten). Flagging a word you just met and
missed as "needs attention" is wrong — you can't be *at risk of forgetting*
something you never knew. It also makes `at_risk` churn and feel meaningless, and
it makes weekly movement miscount a first-miss as an "advance" (introduced rank 1
→ at_risk rank 2).

Separately, the ladder has **no signal for a word the learner keeps failing during
acquisition** (never learned, repeatedly missed). Lumping it into plain
`introduced` loses the one signal that matters — that word needs a *different
strategy*, not more reps ("labor in vain"; the encoding, not retrieval, is the
bottleneck — keyword-mnemonic evidence). This is the deferred "stubborn / leech"
concept (CONTEXT.md:119), scoped for acquisition rather than retention.

## 2. The change

### Part A — Refined rung boundary (canonical predicate; SQL-mirrored)

The boundary between `introduced` and `at_risk` becomes one question: **have you
ever learned this word?** — operationally, did it ever *lapse from a learned
state* (`lapse_count` is the only counter that survives a failure; FSRS increments
it only when a **graduated** card is forgotten; live data confirms new-word misses
all carry `lapse_count = 0`).

**Pinned predicate — TS and SQL use the SAME clause order (the failing block
first), so the parity test and HC28 can't disagree** (architect W1 / data-architect
F1). The current order is kept (`consecutiveFailureCount > 0` first); only the first
clause's return changes, plus the lapse sub-branch — a minimal diff.

`labelForCapability` (`masteryModel.ts:169`) becomes:
```
if (consecutiveFailureCount > 0)
    return lapseCount > 0 ? 'at_risk'                              // genuine lapse
                         : (lessonActivated ? 'introduced'         // never learned, still acquiring
                                            : 'not_assessed')
if (reviewCount === 0)  return lessonActivated ? 'introduced' : 'not_assessed'
if (isCapabilityMastered) return 'mastered'
if (reviewCount >= 3 || stability >= 5) return 'strengthening'
return 'learning'
```

`_mastery_label` (`migration.sql:2203`) mirrors it **in the same order** (the SQL has
no `lessonActivated` concept — always `introduced` for review_count 0, as today):
```sql
when p_consec > 0 and p_lapse > 0  then 'at_risk'
when p_consec > 0                  then 'introduced'   -- failing, never lapsed → still acquiring
when coalesce(p_review_count, 0) = 0 then 'introduced'
when p_review_count >= 4 and coalesce(p_stability,0) >= 14
     and p_last_reviewed is not null and p_last_reviewed > p_now - interval '30 days' then 'mastered'
when p_review_count >= 3 or coalesce(p_stability,0) >= 5 then 'strengthening'
else 'learning'
```

(The two early branches — `consec > 0` and `review_count = 0` — are **mutually
exclusive on live data**: the commit RPC increments `review_count` on every review
(`migration.sql:1717`), so a failing cap always has `review_count >= 1`. Order
between them is therefore safe; we pin it for parity-test determinism, not runtime.)

- `at_risk = consecutiveFailureCount > 0 AND lapseCount > 0`. This re-introduces
  `lapse_count` but as an **AND gate**, not the OR removed on 2026-06-11 — the OR
  made at-risk *permanent*; the AND keeps it **self-healing** (a correct answer
  resets `consecutiveFailureCount` → 0 → no longer at-risk). `lapse_count` only
  decides *which* currently-failing words are lapses vs still-acquiring.
- A never-learned word that's currently failing → **`introduced`** (not `learning`,
  not `at_risk`). Success — not mere exposure — is what promotes out of introduced.
- **`mastered` is unchanged** (reviewCount ≥ 4, stability ≥ 14d, recency,
  consecutiveFailureCount = 0). So `get_lessons_overview` (% mastered) is
  **untouched** — only `_mastery_label` changes.

### Part B — New "moeilijk" (stubborn) signal (TS-only, no SQL)

A **separate** signal, *not* a `MasteryLabel` and *not* a funnel rung (a stubborn
word's funnel rung stays `introduced` — it hasn't progressed):

```
isStubborn(evidence) = lapseCount === 0
                    && reviewCount > 0
                    && consecutiveFailureCount >= STUBBORN_THRESHOLD   (default 4)
```

- **Threshold = 4** failed attempts, never once correct. Rationale: Anki's leech
  default (8) is a *retention* concept (post-graduation) and deliberately generous;
  for *acquisition* the evidence says more retrieval is "labor in vain" and the fix
  is richer encoding — so intervene early. Live data: this learner's never-learned
  misses currently top out at `consecutiveFailureCount = 1` (the scheduler
  re-spaces a miss and they usually get it next time), so reaching **4** means a
  word resisted across **4 separate sessions** — genuinely stubborn, not noise.
- **Self-clearing**: a correct answer resets `consecutiveFailureCount` → 0 → leaves
  "moeilijk" → becomes `learning`. (A later lapse would make it `at_risk` — the
  right next state.)
- **Action differs from at-risk**: the callout says *"try a different approach —
  mnemonic, add context, break it down,"* **not** "review these." (Keyword-mnemonic
  + deconstruction is the evidence-backed help for difficult vocab; more reps are
  what *isn't* working.)
- Surfaced as a **callout list** alongside the at-risk callout. Item-level: a word
  is "moeilijk" if **any** of its capabilities is stubborn (parallel to `at_risk`
  being any-cap), naming the specific failing skill.

## 3. Surfaces touched (ADR 0015 lockstep)

**TS (canonical):**
- `src/lib/analytics/mastery/masteryModel.ts` — `labelForCapability` (Part A);
  new `isStubborn` predicate + a `deriveStubbornWords` deriver (Part B) + its IO
  wrapper, parallel to the existing funnel/skill/grammar derivers.

- `src/lib/analytics/mastery/masteryModel.ts` — `weakestLabel` (`:201`) needs **no
  code change** (its `at_risk` short-circuit now fires only on genuine lapses,
  which is intended), but add a one-line comment noting that, since the inline
  short-circuit otherwise carries no rationale (data-architect F2).

**SQL mirror (same commit or parity fails):**
- `scripts/migration.sql` — `_mastery_label` (`:2203`): the exact pinned CASE order
  in §2. **No** moeilijk in SQL (TS-only signal). `get_lessons_overview`
  **unchanged** — verified: it computes only `mastered` and never `at_risk` (its
  one `consecutive_failure_count = 0` use is the mastered numerator at
  `migration.sql:2035`). (Opportunistic: `get_lessons_overview` still SELECTs
  `lapse_count` into its CTE (`migration.sql:2009`) but no longer uses it — inert
  dead select left from 2026-06-11; drop it in the same commit, data-architect I1.)

**Parity tests + deep check:**
- `scripts/__tests__/weekly-movement-parity.test.ts` — replace the at_risk
  structural assertion with the **compound** form and assert the naked form is
  absent (data-architect F3):
  ```ts
  expect(/when p_consec > 0 and p_lapse > 0 then 'at_risk'/.test(sqlLabel)).toBe(true)
  expect(/when p_consec > 0 then 'at_risk'/.test(sqlLabel)).toBe(false) // no naked consec-only at_risk
  ```
- `scripts/check-supabase-deep.ts` — **HC28**'s inline `rankOf`/`isAtRisk` mirror
  (`~:1471`): at_risk now requires `lapseCount > 0`; a never-lapsed failing cap
  ranks as `introduced`. (HC27 / `get_lessons_overview` unaffected — mastered
  unchanged.)
- `scripts/__tests__/lessons-overview-mastery-parity.test.ts` — stays green
  (mastered unchanged); the lapse-absent assertion (`:74-80`) is unaffected.

**Unit tests (assert at_risk on lapse=0 failing caps → update):**
- `masteryModel.test.ts`, `masteryFunnel.test.ts`, `weeklyMovement.test.ts` — any
  case driving `at_risk` with `lapseCount: 0` must add `lapseCount: 1`, and add
  new cases: (i) never-learned failing → `introduced`, (ii) `isStubborn` at the
  threshold, (iii) self-clear on success.

**Docs:**
- `CONTEXT.md` — the Mastered/at_risk paragraph (`:119`): at_risk = lapse-gated;
  introduced = not-yet-recalled; new **Moeilijk (stubborn word)** term; the funnel
  paragraph (`:134`) notes moeilijk is a callout, not a rung.
- `docs/current-system/modules/analytics-mastery.md` + `analytics.md` — update the
  predicate definitions.

## 4. Supabase Requirements

### Schema changes
- **None.** Only the `_mastery_label` function *body* changes. `STUBBORN_THRESHOLD`
  is a TS constant (default 4) — see open question Q3 on making it a setting. No
  table/column/grant/RLS change.

### homelab-configs changes
- PostgREST / Kong / GoTrue / Storage — **N/A**.

### Health check additions
- None new. HC28 must stay green after the TS + SQL change land in lockstep.
  `make migrate-idempotent-check` before merge.

## 5. Consequences (intended)
- `at_risk` shrinks to genuine lapses (this learner: 33 → 10) and stops churning.
- New-word misses land in `introduced` (≈23 here), matching "you're still
  acquiring it."
- **Weekly movement: a first-miss is now no-movement, not a slip (verified, Q5).**
  With the rank table `introduced = 1`, `at_risk = 2` (`masteryModel.ts:556`,
  `migration.sql:2267`), a first-miss previously went `introduced(1) → at_risk(2)`
  — a *spurious* +1 advance and a spurious slip. It now stays `introduced(1) →
  introduced(1)`, so `deriveWeeklyMovement` (`:605`, fires only when
  `LABEL_RANK[after] > LABEL_RANK[before]`) counts nothing, and the `slipped`
  counter (`migration.sql:2276`) no longer fires. **No rank-table change needed** —
  the existing ranks already produce the right result once the label is fixed.
- A small, often-empty **moeilijk** list surfaces only genuinely stuck words, with
  *change-your-strategy* help — the right intervention per the encoding literature.

### 5.1 Relation to the soon-retired lapse surfaces (architect Q-B)
The `learnerProgressService` lapse surfaces (`get_lapse_prevention`,
`get_vulnerable_capabilities`, `get_memory_health`) are a **separate, soon-retired**
predicate (CONTEXT.md; flagged out-of-scope in the 2026-06-11 review). **moeilijk
does not add a third live lapse notion** — it is the go-forward home (in
`analytics.mastery`) for the *acquisition-difficulty* signal, alongside `at_risk`
for the *retention-loss* signal. When the legacy `learnerProgressService` surfaces
are retired, `at_risk` + `moeilijk` are their consolidated replacements; this spec
does not wire anything into the retiring surfaces.

## 6. Review outcome (resolved)
Both reviewers returned **APPROVE-WITH-CHANGES**; all findings applied above.
- **Q1 (data-architect) — RESOLVED:** `_mastery_label` is the only SQL site
  computing `at_risk`; `get_lessons_overview` is unaffected (mastered only). §3.
- **Q2 (architect) — RESOLVED:** moeilijk is a separate TS deriver, **not** a
  `MasteryLabel` and **not** a funnel rung (rung stays `introduced`); making it a
  label would force changes into `weakestLabel`/`LABEL_RANK`/`emptyFunnel`/the SQL
  rank case — the omission-test chain we avoid. `any-cap-stubborn → moeilijk` is the
  correct existential rollup (not weakest-wins). §2 Part B.
- **Q3 — RESOLVED:** `STUBBORN_THRESHOLD` ships as a TS constant (default 4);
  profile setting deferred (YAGNI, single-learner build-stage).
- **Q4 (architect) — RESOLVED:** define the signal here; build the **moeilijk
  callout UI** as a thin follow-up (parallel to `MasteryJourney`'s at-risk callout).
- **Q5 (data-architect) — RESOLVED:** first-miss = no movement; rank tables
  unchanged. §5.
- **Q-B (architect):** consolidation vs the soon-retired lapse surfaces — §5.1.
