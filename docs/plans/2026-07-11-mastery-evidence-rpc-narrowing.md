---
status: implementing
implementation: PR #445
reviewed_by:
  - staff-engineer (2026-07-11 — GO after revisions; TTL dropped, tiebreak pinned)
  - data-architect (2026-07-11 — SIGN-OFF yes; 3 minors folded in below)
  - architect (2026-07-11 — SIGN-OFF yes, round 2; round 1 critical + warnings addressed)
---

# Mastery evidence RPC narrowing + shared fetch

Fixes the two critical findings of the 2026-07-11 prod-ready review, which are one
disease: the mastery analytics read learner history through unbounded client-side
PostgREST selects, and every Progress card re-runs that read independently.

- **C1 — silent truncation:** `masteryModel.ts:1075-1079` (`allLearnerEvidence`)
  and `:1140-1157` (`getFunnelSeries`) fetch ALL `learner_capability_state` rows
  and the learner's **lifetime** `capability_review_events` with plain
  `.select().eq('user_id')` — no limit, no pagination, no RPC. Past
  PGRST max-rows (~1000 default) the result silently truncates and every mastery
  surface computes wrong numbers. This is the bug class already fixed for the
  session-builder by `get_session_build_data`
  (`docs/plans/2026-07-02-session-data-narrowing-rpc.md` — archived; RPC at
  `scripts/migration.sql:4049-4198`; guarded by HC39/HC40).
- **C2 — five scans per page load:** the Progress "woorden" tab mounts five cards
  that each independently call into `allLearnerEvidence`/`getFunnelSeries`
  (`Progress.tsx:169-174`, `VocabMasteryPanel.tsx:30,52-58`,
  `StubbornWordsCard.tsx:30`, `GrowthCurveCard.tsx:65`,
  `SkillModeGapsCard.tsx:38`) with no sharing; `chunkedQuery.ts:41` additionally
  awaits each 50-id chunk sequentially.

## Target-architecture grounding

`lib/analytics/` is LOCKED and read-only (`docs/target-architecture.md:55`,
`:179`); this plan keeps it read-only — both new RPCs are `stable` reads. The
intra-module decomposition of `masteryModel.ts` (`target-architecture.md:682-719`)
is explicitly deferred per the module spec
(`docs/current-system/modules/analytics-mastery.md:16-21`) and this plan does
NOT do it — no file split is smuggled in. The module spec's §1 already names
`allLearnerEvidence` as the designed shared fetch ("all readers except
content-unit/pattern share one `allLearnerEvidence(userId)` fetch",
spec :34-37) — so the sharing fix lands at the existing seam, not a new one.

## Design

### 1. RPC A — `get_mastery_evidence(p_user_id uuid) → jsonb`

Scalar-jsonb (immune to row truncation), `language sql stable security invoker`,
`set search_path = indonesian, public`, DROP-first idiom, `revoke ... from
public; grant execute ... to authenticated, service_role` — all exactly the
`get_session_build_data` idiom (`migration.sql:4079-4198`).

Returns one object replacing `allLearnerEvidence`'s four client reads:

```jsonc
{
  "states":               [ /* ALL learner_capability_state rows for p_user_id:
                               capability_id, review_count, lapse_count,
                               consecutive_failure_count, stability, last_reviewed_at */ ],
  "capabilities":         [ /* learning_capabilities joined via the state rows'
                               capability_ids, retired_at IS NULL:
                               id, canonical_key, source_kind, source_ref,
                               capability_type, modality, readiness_status,
                               publication_status, lesson_id */ ],
  "activated_lesson_ids": [ /* learner_lesson_activation.lesson_id for p_user_id */ ],
  "lessons":              [ /* {id, order_index} for ALL lessons */ ]
}
```

**Parity constraints (do not "improve" these):**
- `capabilities` filters ONLY `retired_at is null` — NOT
  readiness/publication. The current TS (`capabilityRowsByIds`,
  `masteryModel.ts:1032-1040`) includes reviewed-but-since-unpublished caps in
  evidence; the RPC must match, or mastery counts shift on cutover.
- `states` is unfiltered beyond `user_id` — every state row, matching
  `allLearnerEvidence`'s select at `:1075-1079`.

### 2. RPC B — `get_funnel_series_events(p_user_id uuid, p_window_start timestamptz) → jsonb`

Replaces the lifetime `capability_review_events` fetch with a **bounded** set:

```jsonc
{
  "baseline":      [ /* latest event per capability_id with created_at < p_window_start:
                        id, capability_id, created_at, state_after_json
                        (DISTINCT ON (capability_id) ... ORDER BY capability_id, created_at DESC, id DESC) */ ],
  "window_events": [ /* all events with created_at >= p_window_start, same fields */ ]
}
```

**Tiebreak (staff-engineer 2026-07-11):** "latest event per capability" is the
one predicate mirrored between SQL and TS, so same-instant events must resolve
identically on both sides. Rows carry `id`; SQL orders `created_at DESC, id
DESC`; `FunnelSeriesEvent` gains an optional `id` and the TS sort
(`masteryModel.ts:538`) adds the same `id DESC` tiebreak. Negligible in
practice, but the mirror must be pinned, not probabilistic.

**Why baseline ∪ window is exact, not approximate:** `deriveFunnelSeries`
(`masteryModel.ts:522-570`) uses only the **latest event per capability ≤
cutoff** (`:547`, `list.find` over a newest-first sort), and every cutoff the
caller generates is ≥ `p_window_start`. For any cutoff C ≥ window start,
latest-≤-C over (baseline ∪ window) ≡ latest-≤-C over (all events): if the cap
has any event in `[window_start, C]` the window set supplies it; otherwise its
latest ≤ C is its latest < window_start, which baseline supplies. The deriver
is therefore **unchanged** — the client concatenates `baseline ∪ window_events`
and passes them in as today. Payload is bounded by (#capabilities + one
window's events) forever, instead of growing with lifetime reviews.

`p_window_start` is computed client-side as the UTC instant of the oldest
week's local-Monday start from `weekEndsBackFrom(now, timezone, weeks)`
(`masteryModel.ts:579`) — the window math stays in one place (TS), the RPC just
takes a timestamp. `getFunnelSeries` no longer fetches state rows to learn the
capability-id set (`:1140-1144` deleted) — it reuses the shared evidence fetch
(§3) for capabilities/activations/lessons.

**`state_after_json` is a raw passthrough** (data-architect 2026-07-11): the
RPC ships the column verbatim; the camelCase unpack into
`reviewCount`/`lapseCount`/… stays exactly where it is today
(`masteryModel.ts:1165-1178`), unchanged. Do NOT reimplement that parsing in
SQL.

**ADR 0015 note:** "latest event per capability" is the one predicate mirrored
between SQL (`DISTINCT ON`) and TS (`:547`). It is guarded live by the parity
health check (§5) and by a unit property test (§6). No mastery-label logic
crosses into SQL. **The ADR's structural parity layer (a) and a CONTEXT.md
canonical-definition entry are deliberately N/A here** (architect 2026-07-11):
no business predicate (threshold, label, coalesce rule) crosses the boundary —
only the generic "latest row per key" ordering, which the data-architect
confirmed the `id DESC` tiebreak makes deterministic on the SQL side in its own
right (`DISTINCT ON` with a partial ORDER BY is otherwise
implementation-defined). The semantic layer (HC-b + property test) is the
whole guard, and that is sufficient for an ordering, not a diluted version of
the two-layer rule.

### 3. Client sharing — one evidence fetch per (client, user)

`allLearnerEvidence` becomes cache-fronted inside `masteryModel.ts` (no
component changes — every reader already funnels through it, module spec §1):

- Module-level `WeakMap<client, Map<userId, Promise<...>>>`.
  Keying by client keeps injected-client tests isolated for free (each test's
  mock client is a fresh WeakMap key); the browser's single global client gets
  one shared entry per user.
- **In-flight dedup ONLY — no TTL** (staff-engineer 2026-07-11: a timed cache
  solves tab-switch re-fetch, which C2 never claimed, and buys a
  Session→Progress staleness window for it). The entry is created when a fetch
  starts and evicted when it settles (resolve or reject). The five concurrent
  mounts on the woorden tab coalesce into one RPC call; a later tab switch
  issues a fresh — now cheap, single-RPC — fetch and is always current.
  Evict-on-settle also makes rejected-promise poisoning structurally
  impossible.

The `getFunnelSeries` reader consumes the same cached evidence (capabilities +
activations + lesson map) and adds RPC B for events.

### 4. `chunkedIn` parallelization

`src/lib/chunkedQuery.ts:37-44`: replace the sequential await-in-loop with
`Promise.all` over the chunk queries (result order = chunk order either way).
After this plan, the mastery hot path no longer uses `chunkedIn` at all (RPC A
returns the caps), so this is a general improvement for the remaining callers
(lessons/mnemonics/morphology/reading adapters, exercise-content).

### 5. Health checks (the HC39/HC40 pattern, repointed here)

Numbering: take the next free HC numbers (grep `check-supabase-deep.ts` for the
current max at implementation time — do not assume).

- **HC-a (static source check, HC39-style), scoped to the UNBOUNDED pattern**
  (architect 2026-07-11): assert `masteryModel.ts` contains no full-history
  client read — i.e. no `.from('learner_capability_state')` /
  `.from('capability_review_events')` builder chain that filters only
  `.eq('user_id', …)` without chunking or an RPC. It must NOT flag (and must
  not be weakened to miss) the **legitimately retained**
  `chunkedIn('learner_capability_state', …)` path in `learnerStates`
  (`masteryModel.ts:1043-1051`) — the content-unit/pattern readers keep their
  scoped, chunked reads; this plan does not migrate them and they are not the
  truncation bug. (The earlier claim "the only paths are the two RPCs" was
  wrong for exactly this reason.)
- **HC-b (live parity, HC40-style) — MUST NOT be able to pass vacuously**
  (architect 2026-07-11, critical): SECURITY INVOKER + a silent RLS-deny
  returns *empty*, and `empty ≡ empty` is green. So, mirroring
  `scripts/verify-lessons-overview-rls.ts`: execute both RPCs under
  `set local role authenticated` + `set local request.jwt.claims` for the E2E
  test user, **assert non-empty** `states`, `capabilities`, and `baseline`
  first, and only then run the parity compare against direct service-role
  reads: (1) RPC A's states/capabilities counts + id sets ≡ direct reads;
  (2) `deriveFunnelSeries` over RPC B's baseline ∪ window ≡ the same deriver
  over the full event history, 12-week window.
- **HC-b fixture precondition** (data-architect 2026-07-11): the baseline
  branch is only exercised if the E2E test user has events **predating** the
  window start — otherwise `baseline` is trivially empty and the `DISTINCT ON`
  collapse is never proven live. The implementation must either verify the
  test user's oldest event predates the 12-week window (and fail the check
  with a "fixture too young" message if not) or seed pre-window events for the
  test account.
  **RESOLVED 2026-07-12 (first live run):** the fixed 12-week window DID fail
  on the young fixture. Instead of seeding synthetic rows into a precious
  learner table, HC53 derives the widest window (≤12 weeks) whose start
  postdates the fixture's oldest real event — the baseline branch is always
  exercised on real data and the check survives fixture resets. History under
  ~2 weeks fails explicitly as fixture-too-young; an empty baseline is now
  unambiguously the RLS-deny regression (the window construction guarantees
  ≥1 baseline row otherwise).

### 6. Tests

- Dedup: 5 concurrent `getX(userId)` calls → exactly 1 RPC invocation; a call
  AFTER the first settles issues a fresh fetch (evict-on-settle, both resolve
  and reject paths); injected clients don't share the default-client entry.
- Baseline∪window equivalence: property-style unit test — synthetic event
  histories (caps with all-before-window, straddling, all-inside-window,
  no-events cases); `deriveFunnelSeries(full)` ≡ `deriveFunnelSeries(baseline ∪
  window)` for every week-end.
- Adapter shape tests: RPC jsonb → `LearnerCapabilityStateRow` /
  `LearningCapabilityRow` / `FunnelSeriesEvent` mapping (snake_case fields,
  null stability, empty arrays).
- `chunkedIn`: parallel dispatch preserves order + still chunks at 50.
- Existing mastery tests must pass unchanged (the derivers are untouched).

## Supabase Requirements

### Schema changes
- Two new functions in `scripts/migration.sql` (canonical file):
  `indonesian.get_mastery_evidence(uuid)`,
  `indonesian.get_funnel_series_events(uuid, timestamptz)`. Additive only; no
  tables, no columns, no writes. DROP-first idiom per the file's header.
- RLS policies: none new. Both functions are SECURITY INVOKER; the existing
  owner-only policies on `learner_capability_state`, `capability_review_events`,
  `learner_lesson_activation` scope every read to `auth.uid()` (a spoofed
  `p_user_id` yields an empty result, not a leak — same argument as
  `get_session_build_data`, `migration.sql:4055-4056`). `lessons` is readable
  by `authenticated` (`migration.sql:351` grant + `lessons_read` policy
  `:407-408`).
- Indexes: **none new — verified sufficient** (data-architect 2026-07-11,
  against the live schema): `cre_user_created_idx (user_id, created_at DESC)`
  (`migration.sql:2262-2263`) serves RPC B's window query;
  `cre_user_capability_created_idx (user_id, capability_id, created_at)`
  (`:2264-2265`) serves the baseline `DISTINCT ON` via backward index scan.
- Grants: `revoke from public; grant execute to authenticated, service_role`
  on both functions.

### homelab-configs changes
- [ ] PostgREST: N/A — `indonesian` schema already exposed.
- [ ] Kong: N/A — no new origins/headers.
- [ ] GoTrue: N/A.
- [ ] Storage: N/A.

### Health check additions
- `scripts/check-supabase-deep.ts`: HC-a (static source) + HC-b (live parity)
  per §5. Nothing for tier-1 `check-supabase.ts` (no new user-facing surface).

## Gates & rollout

Additive migration; learner tables are read, never written. Still runs the full
chain because it touches `scripts/migration.sql`:
`make migrate-idempotent-check` → `make migrate` (chains deep checks, so HC-b
runs against live immediately) → `make pre-deploy` before merge. Client cutover
and RPCs land in the same PR — the old code paths are deleted, not
feature-flagged (content-shape freedom does not apply, but this is a pure read
path with a live parity check; a broken RPC fails loudly at HC-b, and the app
change is an ordinary deploy rollback).

Same commit also updates `docs/current-system/modules/analytics-mastery.md` —
§1 IO model, §3 internal flow (evidence now sourced via RPC A, not a direct
client join), §5 seams (the two RPCs + the dedup entry) — and **retires the
`M1` "UNBOUNDED on time" code comment** at `masteryModel.ts:1150-1152`, which
would otherwise contradict the new baseline∪window fetch (architect
2026-07-11). The dedup note in the module spec must state that in-flight
dedup with evict-on-settle keeps the readers observationally pure — output
identical to the uncached path — so the module's read-only/deterministic
invariants are unchanged.

## Coordination — in-flight `feat/voortgang-hub-redesign`

`docs/plans/2026-07-09-voortgang-hub-redesign.md` is `status: implementing` on
branch `feat/voortgang-hub-redesign` and reworks the exact woorden-tab
components the C2 finding cites (architect 2026-07-11). This plan composes
regardless: the entire fix sits **below the component seam** (RPCs + the
shared fetch inside `allLearnerEvidence` + `chunkedIn`); no component files
are touched, so however the hub redesign regroups the cards, their reads
coalesce the same way. Implementation must (1) re-verify the C2 `file:line`
cites against whatever is on `main` at build time (they are evidence, not
work items), and (2) merge ordering: whichever branch lands second rebases
trivially — if conflicts appear in `masteryModel.ts` or Progress components,
STOP and re-check rather than force the merge.

## Omission test (per CLAUDE.md Minimum Mechanism)

- RPC A omitted → C1 truncation stands on five surfaces. RPC B omitted → C1
  stands on the growth curve (the worst-growing read: lifetime events).
- Baseline∪window omitted (ship lifetime events via jsonb instead) → payload
  grows unbounded forever; the RPC merely hides the bug behind a bigger pipe.
- Cache omitted → C2 stands (5× RPC per tab load).
- `chunkedIn` Promise.all omitted → nothing breaks in the mastery path
  (RPC A removed its hot caller); kept because it is a two-line fix to a shared
  helper with six remaining call sites. If reviewers judge it scope creep,
  it drops without affecting C1/C2.
- Not built: no new tables, no snapshots/materialized views, no event-log
  compaction, no per-week SQL aggregation (the funnel derivation stays a pure
  TS function per the module spec), no masteryModel.ts file split (deferred per
  target architecture).
