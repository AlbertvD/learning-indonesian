---
module: analytics-engagement
surface: src/lib/analytics/engagement/
last_verified_against_code: 2026-06-12
status: stable
---

# Practice Time (`lib/analytics/engagement/`)

The **engagement** sub-module of `lib/analytics/` — "does the learner show up?".
Read-only: it derives **Practice Time** from `learning_sessions` and never writes
(the one write in the streak story — marking a session complete — lives in
`services/sessionService.ts`, not here). Practice Time is **exercises-only**: only
the capability/review path produces a `learning_sessions` row, so reading a lesson
or listening to a podcast contributes nothing (CONTEXT.md → Practice Time).

## 1. Public interface

`src/lib/analytics/engagement/index.ts`:

- `engagement.practiceTime(userId, timezone)` → `PracticeTime` (`index.ts:74`) —
  streak · minutes today/week/last-week/month/last-month · avg session minutes ·
  active days this week · last-practice age. Wraps the `get_practice_time` RPC.
- `engagement.dailyActivity(userId, timezone, days)` → `DailyActivity[]`
  (`index.ts`) — per-day **completed-session** counts for the last `days`
  timezone-local days, chronological, zero-filled. Wraps `get_daily_activity`.
  Feeds the home streak bar.
- Types `PracticeTime`, `DailyActivity`; factory `createEngagement(client)` for
  test injection; default `engagement` bound to the live client.

## 2. The server read-model (RPCs in `scripts/migration.sql`)

| RPC | Returns | Cite |
|---|---|---|
| `get_practice_time(uuid, text)` | streak + minute rollups (day/week/month) | `migration.sql:2138` |
| `get_current_streak_days(uuid, text)` | the streak integer | `migration.sql:2099` |
| `get_daily_activity(uuid, text, int)` | last-N-days completed-session counts | `migration.sql:2285` |
| `mark_session_complete(uuid)` | stamps `learning_sessions.completed_at` | `migration.sql:2323` |

Minute rollups (`get_practice_time`) sum **all** sessions' `duration_seconds`
(`migration.sql:2138`); duration is a proxy — first-answer→last-answer elapsed,
`0` for a single-answer session.

## 3. The streak = a COMPLETED session (not an answer)

The load-bearing definition, tightened 2026-06-12:

- A `learning_sessions` row is materialised lazily from answers (the
  `commit_capability_answer_report` path, `migration.sql:1800`) and stamped
  **`completed_at`** only when the learner **finishes** the session — the
  `ExperiencePlayer.onComplete` queue-exhausted event (`ExperiencePlayer.tsx:228`)
  → `Session.tsx` `handleSessionComplete` → `sessionService.markSessionComplete`
  → the `mark_session_complete` RPC (`migration.sql:2323`).
- "Finished" = answered the whole served session at the learner's configured
  length (`preferredSessionSize`); a single answer does **not** count.
- `get_current_streak_days` (`migration.sql:2099`) walks `completed_at` days back
  from today, counting consecutive completed days, **with a grace day**: if today
  isn't finished yet the streak stays alive from yesterday (it doesn't read 0
  until the day's session is done).
- The home streak bar mirrors this exactly: `get_daily_activity` counts **completed**
  sessions per day (`migration.sql:2285`), and `StreakBar.tsx`'s streak-glow
  applies the same grace (`StreakBar.tsx`) — so the flame number and the bars can
  never disagree.

`mark_session_complete` is `security definer` scoped to `auth.uid()` because
authenticated has **no write policy** on `learning_sessions` under retirement #5
(`migration.sql` `learning_sessions_write` dropped); the definer + ownership check
is the only path a learner can stamp their own completion.

## 4. Invariants

- **Streak unit = completed session, everywhere.** The streak number, the streak
  bar, and the glow all key on `completed_at`. Changing the rule means changing
  `get_current_streak_days` + `get_daily_activity` + `StreakBar`'s glow together.
- **Minutes count all sessions; streak counts completed ones.** Deliberate — time
  studied includes unfinished sessions; "days" require finishing.
- **Read-only module.** The completion *write* is `services/sessionService.ts`,
  invoked from `Session.tsx`, not from here.

## 5. Seams

- **Upstream (writes the rows it reads):** the capability review commit
  (`commit_capability_answer_report`, `migration.sql:1489`) materialises sessions;
  `sessionService.markSessionComplete` stamps completion.
- **Sibling:** [[analytics-mastery]] — the *outcome* axis (mastery progression);
  this module is the *input* axis (engagement). The home + voortgang surfaces
  compose both — see `analytics.md`.
- **Consumers:** `Dashboard.tsx` (streak bar + "min deze week" cell),
  `components/progress/TimeComparisonCard.tsx` (the Tijd tab).

## 6. What this spec does NOT cover

The mastery ladder, funnel, weekly movement, and skill gaps — see
[[analytics-mastery]]. The umbrella read-model map (which surface reads which RPC)
— see `analytics.md`.
