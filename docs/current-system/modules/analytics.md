---
module: analytics
surface: src/lib/analytics/, src/components/progress/, src/components/dashboard/
last_verified_against_code: 2026-06-12
status: stable
---

# Analytics (the learner-progress read-model)

The analytics module is the **read-only** layer that tells the learner how they're
doing. It schedules nothing and writes nothing (except one completion stamp — see
§4); it reads capability review state + sessions and derives learner-facing
progress. It powers three surfaces: the **home** page (decide + glance), the
**Voortgang** page (reflect), and the **lesson tiles** (per-lesson % mastered).

It has three sub-modules (CONTEXT.md → Learner Progress Axes):

- **Axis 1 — Practice Time** (input / engagement): `lib/analytics/engagement/` →
  spec [[analytics-engagement]]. Streak · minutes · sessions.
- **Axis 2 — Mastery progression** (outcome): `lib/analytics/mastery/` → spec
  [[analytics-mastery]]. The ladder funnel, weekly movement, skill gaps, grammar
  topics, the canonical `mastered`/`at_risk` predicates. Now also the **growth
  curve** — the funnel reconstructed per week-end (`deriveFunnelSeries` /
  `getFunnelSeries`, client-side, reusing `deriveMasteryFunnel`).
- **Trajectory — durability** (revived 2026-06-30 for the Voortgang "Groei" tab):
  `lib/analytics/memory/` — `stabilitySeries`, average FSRS stability over time
  from the `get_stability_series` RPC. Consumed by **direct import**, not the
  barrel. See `docs/plans/2026-06-30-voortgang-groei-dimension-design.md`.

The leaderboard was **decommissioned** in this redesign; analytics is learner-
facing, not competitive.

## 1. Surfaces (who reads what)

**Home — `src/pages/Dashboard.tsx`:**
- **Streak bar** (`components/dashboard/StreakBar.tsx`) — last 5 days of completed
  sessions + the streak flame. Fed by `engagement.dailyActivity` +
  `engagement.practiceTime`.
- **"… min deze week"** cell → deep-links to Voortgang **Tijd** (`/progress?tab=time`).
- **"Deze week omhoog"** cell — split **woorden · grammatica** → deep-links to
  Voortgang **Woordenschat** (`/progress?tab=woorden`). Fed by `getWeeklyMovement`.
- **Continue lesson** — latest activated lesson.

**Voortgang — `src/pages/Progress.tsx`** (hub-vs-detail on one route, switched by
`?tab=` — voortgang-hub-redesign, docs/plans/2026-07-09-voortgang-hub-redesign.md;
see [[progress]] for the full module spec). Mobile with no/unknown `?tab=` shows a
five-card hub; a known `?tab=` shows that detail with the shared `ProgressNav`
switcher; desktop always lands on a detail (no hub screen):
- **Woordenschat** (`?tab=woorden`, `MasteryFunnelPanel` + `MasteryLadder`) — the
  mastery ladder with a per-lesson filter, plus the at-risk `ListCard`.
- **Grammatica** (`?tab=grammar`) / **Morfologie** (`?tab=morfologie`) — the same
  `MasteryFunnelPanel`/`MasteryLadder`, scoped to their bucket; Grammatica adds
  `GrammarPatternList` when a lesson is picked.
- **Vaardigheden** (`?tab=skills`, `SkillModeGapsCard`) — skill-mode gaps
  (recognise/produce/listen).
- **Tijd** (`?tab=time`, `TimeComparisonCard` + `DurabilityCard`) — week/month time
  comparison + memory durability.

**Lesson tiles** — per-lesson **% mastered** from `get_lessons_overview`
(`migration.sql:1979`); see [[lessons-overview]].

## 2. The read-model — server RPCs vs TS derivers

Some metrics aggregate **server-side** (an RPC returns a small result, ADR 0015);
others fetch capability rows and derive **in TS**. The split:

| Metric | Where computed | Cite |
|---|---|---|
| Practice time / minutes | RPC `get_practice_time` | `migration.sql:2138` |
| Streak | RPC `get_current_streak_days` | `migration.sql:2099` |
| Daily activity (streak bar) | RPC `get_daily_activity` | `migration.sql:2285` |
| Weekly movement | RPC `get_weekly_movement` | `migration.sql:2222` |
| Per-lesson % mastered | RPC `get_lessons_overview` | `migration.sql:1979` |
| Mastery funnel (vocab/grammar) | TS `deriveMasteryFunnel` | `masteryModel.ts` |
| Skill-mode gaps | TS `deriveSkillModeGaps` | `masteryModel.ts` |
| Grammar topics | TS `deriveGrammarTopics` | `masteryModel.ts` |

## 3. Canonical definitions — stored once, reused everywhere

The whole point of this module is **aligned definitions across surfaces**. Each
load-bearing definition lives in exactly one place:

- **The mastery rung** — `labelForCapability` (`masteryModel.ts`) maps one
  capability's evidence to `introduced/learning/strengthening/mastered/at_risk`.
  The funnel, weekly movement, skill gaps, and lesson tiles all call it; none
  re-implements the thresholds.
- **`mastered`** — `isCapabilityMastered` (`mastered.ts`): reviewCount ≥ 4,
  stability ≥ 14d, reviewed within 30d, **and not currently failing**.
- **`at_risk` = a genuine lapse** (2026-06-12): `consecutiveFailureCount > 0 AND
  lapseCount > 0` (currently failing **and** previously learned). Still
  self-healing (a correct answer clears it); a never-learned failing word is
  `introduced`, not `at_risk`. The boundary is "have you ever learned this word?"
- **`moeilijk` (stubborn)** — a *separate* acquisition-difficulty signal
  (`isStubborn` / `deriveStubbornWords`): never learned (`lapseCount = 0`) and
  failed ≥ 4×. Not a `MasteryLabel`/rung (rung stays `introduced`); a callout with
  *change-your-strategy* help. TS-only, no SQL mirror.
- **The vocab/grammar split** — `funnelBucket(sourceKind)` (`masteryModel.ts`):
  `item`→vocab, `pattern`/`affixed_form_pair`→grammar, else excluded. Shared by
  the funnel, weekly movement, and HC28 — so they can't disagree on what counts
  as vocab vs grammar.
- **The streak** — a **completed session**, not an answer (see [[analytics-engagement]] §3).

### The cross-language mirror (ADR 0015)

The metrics computed in SQL (`get_lessons_overview`, `get_weekly_movement`'s
`_mastery_label` at `migration.sql:2203`) necessarily duplicate the TS predicate —
a SQL function can't import TS. That duplication is policed, not trusted:

- **Parity tests** (`scripts/__tests__/lessons-overview-mastery-parity.test.ts`,
  `weekly-movement-parity.test.ts`) assert the SQL carries the same thresholds.
- **Health checks** recompute in TS and compare to the RPC over live data:
  **HC27** % mastered (`check-supabase-deep.ts:1397`) and **HC28** weekly movement.
  They go RED if the two sides ever diverge.

So: TS-only metrics propagate automatically (one function, many callers); SQL
mirrors are enforced-equal by HC27/HC28.

## 4. Weekly Movement (the fast pulse on the slow axis)

`getWeeklyMovement` / `deriveWeeklyMovement` (`masteryModel.ts`) →
`{ advancedVocab, advancedGrammar, reachedMastered, slipped }`. Counts **distinct
`source_ref`** (a word / grammar topic, counted once however many of its caps
advanced) that climbed a rung this week, **split + scoped to the same two buckets
as the funnel** (`funnelBucket`); `dialogue_line`/`podcast` excluded. Derived from
`capability_review_events` before/after rungs (ADR 0016, not snapshotted). The
home card shows it split (`X woorden · Y grammatica`).

## 5. What changed in the 2026-06-10..12 redesign

- Two learner-aligned axes (Practice Time + Mastery progression); leaderboard
  decommissioned.
- Weekly movement (ADR 0016, derive-from-event-log), then fixed to count distinct
  **words** not capabilities, then **split** vocab/grammar via `funnelBucket`.
- `at_risk` made self-healing (currently-failing only).
- Home rebuilt: first-of-day greeting, streak bar, deep-links, split movement card.
- Voortgang rebuilt as URL-addressable animated tabs (funnel · skills · time ·
  grammar) with pill segmented controls + a chevron funnel.
- App-tailored study tips (`lib/analytics/studyTips.ts`) surfaced via `InsightTips`.
- Streak tightened: a day counts only if you **finish a session**
  (`completed_at` + `mark_session_complete`, grace day).

## 6. Seams

- **Upstream:** capability review state (`learner_capability_state`,
  `capability_review_events`) written by the review commit
  (`migration.sql:1489`); `learning_sessions` (engagement). Activation gates which
  caps count (ADR 0006).
- **Sub-module specs:** [[analytics-mastery]] (ladder/funnel/movement/predicates),
  [[analytics-engagement]] (Practice Time/streak).
- **Sibling:** [[lessons-overview]] (per-lesson % mastered — same `mastered`
  predicate, SQL-mirrored).

## 7. What this spec does NOT cover

Internal flow of the mastery derivers → [[analytics-mastery]]. Practice Time
internals → [[analytics-engagement]]. The exercise-play surface that *produces* the
review events → [[experience]] / [[session-builder]].
