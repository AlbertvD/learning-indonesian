---
status: implementing
branch: feat/launch-readiness-round-2
reviewed_by: [data-architect, architect]
approved_at: 2026-07-02
implementation: PR TBD (branch feat/launch-readiness-round-2)
supersedes: []
---

# Session-data narrowing RPC (`get_session_build_data`)

> **Review gate:** this spec touches the data model (a new RPC over the typed
> capability/state/collection tables). Per `CLAUDE.md` → "A spec that touches the
> data model needs BOTH `architect` and `data-architect` sign-off", **both** must
> appear in `reviewed_by:` before this moves to `status: approved`. The pre-commit
> `plan-review-gate` enforces this. Do not implement while `status: draft`.

## Problem

`src/lib/session-builder/adapter.ts` `loadCapabilitySessionData` (`adapter.ts:272-306`)
fans out **six** client-side queries on **every** session build, via `Promise.all`:

1. **The entire capability catalog** — `learning_capabilities` filtered only to
   `readiness_status='ready' AND publication_status='published' AND retired_at IS NULL`,
   13 columns, **no user scope** (`adapter.ts:288-293`, columns at
   `adapter.ts:33-47`). This is the unbounded term: the live catalog is already
   thousands of rows and grows with **every** published lesson, the top-100→1000
   frequency bands, the 7+ themepacks, book-2's 14 chapters, and story podcasts
   (`MEMORY.md` → collections build). It is fetched **whole, to the browser, per
   build, per user**.
2. All of the learner's `learner_capability_state` rows (`adapter.ts:294`).
3. Activated lessons (`listActivatedLessons`, `adapter.ts:295`).
4. All lessons `(id, order_index)` (`adapter.ts:296`).
5. Today's review events (`adapter.ts:297-301`).
6. Activated collection/harvest member refs (`resolveActivatedMemberRefs`,
   `adapter.ts:305`) — itself 2–3 more queries (`collections/adapter.ts:14-62`).

Separately, `listLearnerCapabilityStates` (`adapter.ts:251-270`) loads the catalog
again (3 columns, all non-retired) plus all learner states.

At one learner this is fine. For a multi-user cloud deployment it is the top
payload/scaling item: **megabytes per session build, growing with the catalog, paid
per user, per build.** HC39 (`scripts/check-supabase-deep.ts:1992-2023`) was added to
catch silent `PGRST_DB_MAX_ROWS` truncation of the unpaginated catalog fetch — it
guards the *symptom* (truncation) but not the payload itself.

## Goals

- Replace the six-query **data fan-out** in `loadCapabilitySessionData` with **one**
  RPC, `indonesian.get_session_build_data(p_user_id, p_mode, p_selected_source_refs,
  p_day_start)`, that returns a **narrowed, provably-sufficient** snapshot:
  the catalog is narrowed server-side to the learner's *activated surface + their
  state*, so payload grows with the **learner's progress**, not the **catalog's
  size**.
- Keep the pure-TS planner (`pedagogy.ts`, `builder.ts`, `dueFilter.ts`,
  `compose.ts`, `siblingBury.ts`, `drying.ts`) **unchanged and client-side**. It is
  tested, pure, and deep; porting its gate → prioritize → allocate + staging-gate
  + sibling-bury logic to plpgsql would duplicate ~600 LOC of complex policy in a
  second language — a Minimum-Mechanism violation and an ADR-0015-style parity
  liability far larger than the one this spec accepts.
- Prove sufficiency with a **consumer → fields → why-covered** table (below) and a
  **two-layer parity test** (ADR 0015): structural (the RPC's inclusion predicate
  matches the documented sufficiency clauses) + semantic (the narrowed set yields
  an identical planner/due/practice result to the full-catalog assembly on the same
  live data).

## Non-goals

- **No planner logic moves to SQL.** The RPC is a *read-model narrowing*, not a
  scheduler. It returns rows; TS decides.
- **No new tables, no caching layer, no versioning/coexistence machinery.** One RPC.
  (Operating Context: build-stage, single learner — but see Cutover: the parity
  test is the one safety mechanism kept for the imminent commercial-live flip.)
- **`listLearnerCapabilityStates` is out of scope** (see §"Secondary consumer").
- **No change to session composition, gating, budgets, or sibling-burying
  behaviour.** This is a *transport* change; the SessionPlan must be identical.

## Target-architecture grounding

Per `CLAUDE.md` ("Before drafting any plan… ground it in the target architecture"):

- `docs/target-architecture.md:413-415` — `lib/session-builder/adapter.ts` is the
  module's **"read-only Supabase queries for capability state, lesson activation,
  FSRS state"** seam; `:119-121` — `adapter.ts` is the **abstraction-translation
  seam** that "hides the schema name, table names, **RPC names**, snake/camel
  mapping, RLS quirks". **This change lands squarely at the sanctioned seam**:
  swapping N table reads for one RPC read is exactly the complexity `adapter.ts` is
  meant to hide. No module placement moves; no fold-slated file is touched.
- `docs/target-architecture.md:59` (Rule 6, one source of truth) and `:644`
  (analytics is bimodal: TS orchestration + Postgres aggregation) — this RPC is a
  read aggregation of the same shape ADR 0015 blesses.
- `docs/current-system/modules/session-builder.md:129-147` (§3.1) documents the
  current five/six-read adapter; **this spec is the before-spec's diff target** and
  its §3.1 + §5 (Seams → Upstream) must be rewritten in the implementing PR.
- No constraint in the target architecture *forbids* server-side aggregation here;
  ADR 0015 makes it the **default** reached-for-first.

## ADR compatibility

- **ADR 0015** (read-model aggregation server-side; parity-tested mirrored
  predicate is not a single-source violation) — this is the **motivating ADR**. The
  "mirrored predicate" here is the **sufficiency predicate** (which caps the RPC must
  include so the client planner sees an identical world). It is guarded by the
  two-layer parity test ADR 0015 mandates. Canonical definition documented in this
  spec's §"Sufficiency predicate" and to be added to `CONTEXT.md`.
- **ADR 0001 / 0003** (FSRS on capabilities, server-side) — unaffected. The RPC
  reads `learner_capability_state`, never writes; FSRS math stays in the commit
  edge function.
- **ADR 0006** (every lesson-derived cap has an introducing lesson; podcast caps
  are the null-`lesson_id` carve-out) — **load-bearing here**: it is *why* the
  candidate predicate needs clause (D) `lesson_id IS NULL` (podcast caps bypass the
  lesson-activation gate and can be new introductions in standard mode —
  `pedagogy.ts:196-201, 407-414`). Preserved exactly.
- **ADR 0011** (capability content DB-authoritative after seeding) — unaffected; the
  RPC reads published capability rows.
- No ADR is contradicted.

## Design

### The RPC

`get_session_build_data(p_user_id uuid, p_mode text, p_selected_source_refs text[],
p_day_start timestamptz)` → **`jsonb`** (a single object).

**Why a single `jsonb` scalar return, not `RETURNS TABLE`:** a scalar-returning RPC
yields exactly **one API row** regardless of how many capabilities it contains, so
`PGRST_DB_MAX_ROWS` — which truncates *rows in a result set* — **cannot silently
truncate it**. This **eliminates the failure mode HC39 exists to catch** (see
§"Health checks"). It also lets one call return the six heterogeneous pieces the
adapter assembles, in one round trip.

**Why `SECURITY INVOKER`** (not `DEFINER`): identical to the working
`get_lessons_overview` (`migration.sql:1926`) and `get_collections_overview`
(`migration.sql:3661`) precedent. Under INVOKER, RLS on the owner-scoped tables
(`learner_capability_state`, `learner_lesson_activation`,
`learner_collection_activation`, `learner_reading_harvest`,
`capability_review_events`) is **still enforced against `auth.uid()`**, so a spoofed
`p_user_id ≠ auth.uid()` yields a **degenerate empty snapshot, never another
learner's data** (the owner predicates return zero rows; no leak, no RAISE needed).
`learning_capabilities`, `lessons`, `collections`, `collection_items` are
authenticated-readable and carry no per-user rows.

> **CRITICAL (SECURITY INVOKER over RLS-protected joins):** per `CLAUDE.md` and the
> 2026-05-08 `get_lessons_overview`/`lesson_page_blocks` outage, a SECURITY INVOKER
> function that joins an RLS-protected table returns **"no rows" silently** if that
> table has RLS-enabled-but-no-policy. The RLS audit in §"Supabase Requirements"
> enumerates every joined table's policy, and the test plan includes a **mandatory
> `set local role authenticated` + jwt-claims test asserting a non-empty snapshot**
> for the seed user. This guards the exact regression class.

#### Full RPC body (inline — no placeholder, per spec-quality rule)

```sql
-- ============================================================================
-- get_session_build_data — narrowed session-build snapshot (pre-cloud hardening
--   item 7). Replaces the six-query client-side fan-out in
--   src/lib/session-builder/adapter.ts loadCapabilitySessionData.
--
-- Returns ONE jsonb object (scalar → immune to PGRST_DB_MAX_ROWS row truncation).
-- SECURITY INVOKER: RLS on the owner-scoped tables keeps every read scoped to
--   auth.uid(); a spoofed p_user_id yields an empty snapshot, not a leak.
--
-- Candidate-set sufficiency predicate (the ADR-0015 mirrored predicate; canonical
--   definition in CONTEXT.md → "Session-build candidate sufficiency"):
--     a ready+published+live cap is returned iff ANY of
--       (A) it has a learner_capability_state row for p_user_id          [all modes]
--       (B) standard mode AND its lesson_id is activated by the learner
--       (C) standard mode AND its source_ref is in the learner's activated
--           collection ∪ reading-harvest member refs
--       (D) standard mode AND its lesson_id IS NULL (podcast carve-out, ADR 0006)
--       (E) scoped mode  AND its source_ref = ANY(p_selected_source_refs)
--   Proof that this is sufficient for every downstream consumer: see the spec's
--   consumer→fields table. Key facts: (1) due caps come from ANY lesson (dueFilter
--   ignores activation) → clause (A) returns ALL state rows unconditionally;
--   (2) prerequisite/unlock satisfaction reads learner STATE rows only, and a
--   prereq is satisfiable only if the learner already has a state for it — which
--   (A) always returns — so no prerequisite cap needs importing into the catalog.
--
-- Idempotent. DROP FUNCTION first (safe idiom; also required if the return
-- signature ever changes — CREATE OR REPLACE cannot alter it).
-- ============================================================================
drop function if exists indonesian.get_session_build_data(uuid, text, text[], timestamptz);
create or replace function indonesian.get_session_build_data(
  p_user_id             uuid,
  p_mode                text,
  p_selected_source_refs text[]      default '{}',
  p_day_start           timestamptz  default date_trunc('day', now())
)
returns jsonb
language sql stable security invoker
set search_path = indonesian, public
as $$
  with
  activated_lessons as (
    select lla.lesson_id
    from indonesian.learner_lesson_activation lla
    where lla.user_id = p_user_id
  ),
  -- Collections ∪ reading harvest, resolved to the item source_ref form
  -- 'learning_items/<normalized_text>' (HC9 invariant). Mirrors
  -- lib/collections/membership.resolveActivatedMemberRefs — NO is_published
  -- filter (that function does not filter it either).
  activated_member_refs as (
    select 'learning_items/' || li.normalized_text as source_ref
    from indonesian.collection_items ci
    join indonesian.learner_collection_activation lca
      on lca.collection_id = ci.collection_id and lca.user_id = p_user_id
    join indonesian.learning_items li on li.id = ci.learning_item_id
    union
    select 'learning_items/' || li.normalized_text
    from indonesian.learner_reading_harvest lrh
    join indonesian.learning_items li on li.id = lrh.learning_item_id
    where lrh.user_id = p_user_id
  ),
  user_states as (
    select s.*
    from indonesian.learner_capability_state s
    where s.user_id = p_user_id
  ),
  candidate_caps as (
    select c.*
    from indonesian.learning_capabilities c
    where c.readiness_status = 'ready'
      and c.publication_status = 'published'
      and c.retired_at is null
      and (
        exists (select 1 from user_states us where us.capability_id = c.id)      -- (A)
        or (p_mode = 'standard' and (
             c.lesson_id in (select lesson_id from activated_lessons)            -- (B)
             or c.source_ref in (select source_ref from activated_member_refs)   -- (C)
             or c.lesson_id is null                                              -- (D)
           ))
        or (p_mode <> 'standard' and c.source_ref = any(p_selected_source_refs)) -- (E)
      )
  ),
  reviewed_today as (
    -- Local-midnight boundary supplied by the client (p_day_start) so the seed
    -- for sibling-burying matches the learner's wall-clock day exactly, as the
    -- current adapter does (adapter.ts:277-278). now() here would be UTC-midnight
    -- and drift from the browser-local day.
    select distinct e.capability_id
    from indonesian.capability_review_events e
    where e.user_id = p_user_id
      and e.created_at >= p_day_start
  )
  select jsonb_build_object(
    'capabilities', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id,
        'canonical_key', c.canonical_key,
        'source_kind', c.source_kind,
        'source_ref', c.source_ref,
        'capability_type', c.capability_type,
        'direction', c.direction,
        'modality', c.modality,
        'learner_language', c.learner_language,
        'projection_version', c.projection_version,
        'readiness_status', c.readiness_status,
        'publication_status', c.publication_status,
        'lesson_id', c.lesson_id,
        'prerequisite_keys', coalesce(c.prerequisite_keys, array[]::text[])
      )) from candidate_caps c
    ), '[]'::jsonb),
    'learner_states', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', us.id,
        'user_id', us.user_id,
        'capability_id', us.capability_id,
        'canonical_key_snapshot', us.canonical_key_snapshot,
        'activation_state', us.activation_state,
        'stability', us.stability,
        'difficulty', us.difficulty,
        'last_reviewed_at', us.last_reviewed_at,
        'next_due_at', us.next_due_at,
        'review_count', us.review_count,
        'lapse_count', us.lapse_count,
        'consecutive_failure_count', us.consecutive_failure_count,
        'state_version', us.state_version
      )) from user_states us
    ), '[]'::jsonb),
    'activated_lesson_ids', coalesce((
      select jsonb_agg(lesson_id) from activated_lessons
    ), '[]'::jsonb),
    'lessons', coalesce((
      select jsonb_agg(jsonb_build_object('id', l.id, 'order_index', l.order_index))
      from indonesian.lessons l
    ), '[]'::jsonb),
    'reviewed_today_capability_ids', coalesce((
      select jsonb_agg(capability_id) from reviewed_today
    ), '[]'::jsonb),
    'activated_member_refs', coalesce((
      select jsonb_agg(source_ref) from activated_member_refs
    ), '[]'::jsonb)
  );
$$;

revoke all on function indonesian.get_session_build_data(uuid, text, text[], timestamptz) from public;
grant execute on function indonesian.get_session_build_data(uuid, text, text[], timestamptz) to authenticated, service_role;
```

**Deviation from the directed signature (flagged):** the direction specified
`get_session_build_data(p_user_id, p_mode, p_selected_source_refs)`. I added
`p_day_start timestamptz` because `reviewedTodayRefs` uses the **browser-local**
midnight (`adapter.ts:277-278`), and `now()` inside the function is UTC — a silent
day-boundary drift that would change *which* sibling is buried near midnight.
Passing the client's local day-start preserves exact behaviour. It defaults to
`date_trunc('day', now())` so callers that don't care get server-day. `data-architect`
to confirm this is preferable to widening the seam.

### Sufficiency predicate (the ADR-0015 mirrored definition)

> A ready+published (`retired_at IS NULL`) capability is a **session-build
> candidate** for `(user, mode, selected_source_refs)` iff **any** of:
> **(A)** the user has a `learner_capability_state` row for it *(all modes)*;
> **(B)** `mode='standard'` and its `lesson_id` is in the user's activated lessons;
> **(C)** `mode='standard'` and its `source_ref` is in the user's activated
> collection ∪ reading-harvest member refs;
> **(D)** `mode='standard'` and its `lesson_id IS NULL` (podcast carve-out);
> **(E)** `mode≠'standard'` and its `source_ref ∈ selected_source_refs`.
> The user's **full** `learner_capability_state` set is always returned (it is
> bounded by the learner's own history, not the catalog).

### Consumer → fields → why-covered (sufficiency proof)

| Consumer (file) | Fields it reads | Source in RPC payload | Why the narrowed set is sufficient |
|---|---|---|---|
| **dueFilter** `getDueCapabilitiesFromRows` (`dueFilter.ts:64-105`) | per state: `activationState`, `readinessStatus`, `publicationStatus`, `nextDueAt`, `id`, `capabilityId`, `canonicalKeySnapshot`, `stateVersion` (+ `lastReviewedAt`, `consecutiveFailureCount` for recentFailures) | `learner_states` (all) + readiness/publication joined in-memory from `capabilities` via `capability_id` | **Trap 1**: due caps come from **any** lesson — `dueFilter` never consults activation (`pedagogy.ts` gates only *new* intros). Clause (A) returns **every** user state unconditionally, so no due cap is lost. Readiness/publication resolve because every state's cap that is ready+published is in (A); states whose cap is absent are dropped in-memory, exactly matching the current `capabilityById.has` filter (`adapter.ts:346`). |
| **pedagogy gate** `gateCandidates` (`pedagogy.ts:291-420`) | per cap: `readinessStatus`, `publicationStatus`, `sourceRef`, `lessonId`, `prerequisiteKeys`, `canonicalKey`, `capabilityType`, `sourceKind`; `stateByKey.activationState`; `satisfiedKeys`; `unlockedSourceRefs`; `activatedLessons`; `activatedCollectionRefs` | `capabilities` (A∪B∪C∪D or A∪E) + `learner_states` + `activated_lesson_ids` + `activated_member_refs` | Gate-**passing** new caps are dormant, prereq-satisfied, unlocked, and lesson/collection-activated (or null-lesson). That set ⊆ **(B∪C∪D)** in standard / **(E)** in scoped — exactly the predicate. Already-active caps are in (A) and get correctly suppressed as `already_active_or_retired`. |
| — `satisfiedKeys` (`pedagogy.ts:544-546`) | active + `successfulReviewCount>0` state `canonicalKey`s | `learner_states` | **Trap 2**: `satisfiedKeys` reads **states only**, never the catalog. A prereq key is satisfied *iff* the learner has an active/successful state for it — and clause (A) returns that state. So a candidate whose prereq lies "outside" the activated surface still gates **identically**: either the learner has the prereq's state (→ returned → satisfied) or they don't (→ `missing_prerequisite`, candidate never passes anyway). **No prerequisite cap needs importing into the catalog.** |
| — `unlockedSourceRefs` (`buildUnlockedSourceRefs`, `pedagogy.ts:245-259`) | active+stable+successful states mapped `canonicalKey → cap.sourceRef` | `learner_states` + `capabilities` | A Phase≥3 candidate `C` (sourceRef `R`) unlocks iff some active+stable state's cap has sourceRef `R` — i.e. a **sibling** of `C` sharing `R`. That sibling has a state → in (A) → its cap is in `capabilities` → `R` resolves. `C` itself is present via (B/C/D) or (E). Both sides present → identical gating. (`word_form_pair_src`/`dialogue_line_src`/`grammar_pattern_src` bypass this gate entirely — `pedagogy.ts:377-386`.) |
| **prioritize** `prioritizeCandidates` (`pedagogy.ts:437-470`) | `lessonOrder`, `canonicalKey`, `capabilityType`, `sourceKind` | `lessons(id, order_index)` → `lessonOrder` via `lesson_id`; rest from `capabilities` | Only orders gate-passing caps, all of which are in `capabilities`. `lessons` returned whole (tiny, ~tens of rows). |
| **allocate** `allocateBudget` (`pedagogy.ts:481-526`) + `decideLoadBudget` | `capabilityType`/`sourceKind` (isPattern/isProduction/isHiddenAudio); `dueCount` | `capabilities` + `dueCount` derived client-side from `learner_states` | `dueCount` = length of the (scoped) due list computed from all states (clause A). Unchanged math. |
| **siblingBury seed** `reviewedTodayRefs` (`adapter.ts:320-324`, `builder.ts:256`) | today's reviewed `capability_id` → `source_ref` | `reviewed_today_capability_ids` → `source_ref` via `capabilities` map | A cap reviewed today **has** a `learner_capability_state` row (review writes state) → in (A) → its `source_ref` resolves. A reviewed cap no longer ready+published is dropped in **both** old and new (consistent — old `capabilityById` is also ready+published only). |
| **drying detector** `deriveLessonProgression` (`adapter.ts:126-145`) | `activatedLessonIds`, `lessons(id, order_index)` | `activated_lesson_ids` + `lessons` | Both returned whole. |
| **compose / resolveCandidate** (`builder.ts:183-211`, `compose.ts`) | `capabilitiesByKey` (full `ProjectedCapability`) + `readinessByKey` for **due, practice, new** caps | `capabilities` (12 projected fields per cap) | Due+practice caps are state-referenced (A); new caps are (B/C/D)/(E) — all in `capabilities`. `readinessByKey` is recomputed client-side via `validateCapability` over the returned caps (now a small set). |

**Two traps, resolved:**

1. **Due caps ignore activation scope.** Handled by making clause (A) —
   *all* learner state rows and their caps — **unconditional across every mode**.
   Due/practice never narrow to "activated caps"; they narrow to "caps the learner
   has a state for," which is what the RPC returns.
2. **Prerequisite closure.** `satisfiedKeys` and `unlockedSourceRefs` are functions
   of **learner state rows only** (+ the state's own cap for the sourceRef map),
   never of un-stated catalog rows. Since (A) returns every state and its cap, the
   gate's prereq/unlock decisions are byte-identical to the full-catalog run. A
   prerequisite that is *not* satisfied keeps its candidate suppressed in both
   worlds — so its absence from the narrowed catalog changes nothing.

### Adapter change (TS)

`loadCapabilitySessionData` becomes: one `supabase.schema('indonesian').rpc(
'get_session_build_data', { p_user_id, p_mode, p_selected_source_refs, p_day_start })`
call, then the **same in-memory assembly** already in `adapter.ts:313-384`
(build `capabilitiesByKey`/`readinessByKey`, `reviewedTodayRefs` from
`reviewed_today_capability_ids`, `lessonOrderById`, `dueCount`, `recentFailures`,
`deriveLessonProgression`). The mapping functions (`toProjectedCapability`,
`toPlannerCapability`, `toLearnerRow`, `toPlannerState`) are **unchanged** — they
already consume plain row shapes; the RPC returns the same field names (snake_case)
those mappers expect. `resolveActivatedMemberRefs`, `listActivatedLessons`, and the
five direct `.from(...)` reads inside `loadCapabilitySessionData` are **deleted**
(their data now arrives in the RPC payload). `p_day_start` is the browser-local
midnight the adapter already computes (`adapter.ts:277-278`).

## Secondary consumer (`listLearnerCapabilityStates`) — explicitly out of scope

`listLearnerCapabilityStates` (`adapter.ts:251-270`) also reads the full catalog (3
columns, all non-retired) + all states. **It has no production caller on the session-
build path** — `builder.ts:233` supplies an *inline* adapter to `getDueCapabilities`,
and a `src/` grep finds only the interface/tests referencing the real method. It is a
*lesser* instance of the same unbounded-catalog class; because it is not on the hot
path and may be dead, it is left untouched here and flagged for a **separate**
retirement/narrowing decision (open question 4). Folding it in now would be scope
creep beyond "replace the fan-out in `loadCapabilitySessionData`."

## Edge cases

- **Brand-new learner** (no states, no manual activations): signup auto-activates
  lessons 1–3 (`migration.sql:1867-1874`), so clause (B) yields those lessons' caps;
  L1 intros surface. (A)/(C) empty, (D) = podcast caps. Matches current behaviour.
- **De-activated lesson with active due caps**: due caps still surface (Trap 1) — (A)
  returns their states unconditionally, independent of the lesson gate.
- **`affix_practice` with a root-vocab prereq in another lesson** (`pedagogy.ts:334-336`
  keeps the root-vocab prereq): the prereq's state is in (A) even though the prereq
  cap is out of scope — gate satisfied identically.
- **Podcast-segment caps** (`podcast_segment_src`, null `lesson_id`,
  `isAllowedInSessionMode`=true — `pedagogy.ts:196-201`): included via (D) in
  standard, excluded in scoped modes (correct — they're not in `selected_source_refs`).
- **Collection activated, its home lesson not**: gap-word caps surface via (C)
  (`get_collections_overview` gate-OR parity, `migration.sql:3677-3696`).
- **Scoped mode with empty `selected_source_refs`**: clause (E) is `= ANY('{}')` =
  false → no scoped new intros; `builder.ts` already rejects an empty lesson scope
  upstream (`lessonScope`, `builder.ts:105-120`). No behavioural change.
- **`PGRST_DB_MAX_ROWS` set on the shared instance**: scalar `jsonb` return = one API
  row → never truncated. The class HC39 guards is eliminated by construction.
- **Cross-user `p_user_id ≠ auth.uid()`**: RLS on owner tables returns zero rows →
  empty/degenerate snapshot, no leak (tested).
- **Completionist who activated everything**: (B) degenerates toward the full catalog
  → payload ≈ today's. **No regression, no improvement** — the win is for the typical
  partial-activation learner, and the catalog-grows-faster-than-one-learner asymmetry.
  Stated honestly, not oversold.
- **`prerequisite_keys` NULL**: coalesced to `'{}'` in the RPC (mirrors
  `toProjectedCapability`'s `?? []`, `adapter.ts:165`).

## Testing

Concrete scenarios (mock at the service/RPC layer per `CLAUDE.md` → Testing; the
supabase chain is not intercepted):

1. **Snapshot parity (integration, `src/lib/session-builder/__tests__/`)** — a fixture
   DB snapshot fed through (a) the *old* six-read assembly and (b) the RPC payload
   → assert the two `CapabilitySessionDataSnapshot`s are deep-equal (capabilities map,
   schedulerRows, plannerInput, reviewedTodayRefs, currentLessonId,
   nextLessonNeedsExposure). Deterministic (no `Math.random` on this path).
2. **Sufficiency (pure unit, ADR-0015 layer-b at function level)** — given a
   full-catalog fixture and the predicate-narrowed subset, assert
   `planLearningPath(...)` + `getDueCapabilitiesFromRows(...)` (fixed injected
   `random`) yield **identical** `eligibleNewCapabilities` (canonicalKey set), due
   set, and practice set. Includes a **Trap-2 case**: a Phase≥3 candidate whose
   unlock-sibling and whose prereq are reachable only through state rows (their caps
   excluded from the non-(A) surface) still gates identically.
3. **Trap-1 case** — a due cap in a **non-activated** lesson is present in
   `learner_states`, survives the RPC narrowing, and appears in the due list.
4. **Structural parity (ADR-0015 layer-a, source-scan test like
   `scripts/__tests__/lessons-overview-mastery-parity.test.ts`)** — assert the RPC
   `candidate_caps` WHERE clause contains all five documented sufficiency arms
   (state-exists (A), activated-lesson (B), activated-member-ref (C), null-lesson (D),
   scoped-source-ref (E)) and the `ready/published/retired_at` guard — catches a drift
   where an arm is dropped/reworded.
5. **CRITICAL — authenticated-role RLS test** — `set local role authenticated` +
   `set local request.jwt.claims` to the seed user, call
   `get_session_build_data(seed, 'standard', '{}', now())`, assert `capabilities`
   **and** `learner_states` are **non-empty**. Guards the SECURITY-INVOKER-over-RLS
   silent-empty regression (2026-05-08 class).
6. **Cross-user isolation** — call with `p_user_id` ≠ the jwt subject; assert the
   owner-scoped arrays (`learner_states`, `activated_lesson_ids`,
   `activated_member_refs`, `reviewed_today_capability_ids`) are empty.
7. **Friendly-error path** — a mocked RPC rejection surfaces the existing
   session-load error notification (no raw Supabase code to the user, per CLAUDE.md).
8. **HC40 deep-check (live, `scripts/check-supabase-deep.ts`)** — see below.

## Rollout / cutover

Build-stage Operating Context (`CLAUDE.md`): **build the target and delete the old
path in one move — no additive-then-subtractive parity rollout, no coexistence
layer.** Single PR on `feat/pre-cloud-hardening`:

1. Add `get_session_build_data` to `scripts/migration.sql` (per the migration
   source-of-truth rule — **not** `scripts/migrations/*.sql`).
2. Rewrite `loadCapabilitySessionData` to the single RPC call; delete the five
   `.from(...)` reads + the `resolveActivatedMemberRefs`/`listActivatedLessons`
   calls it made.
3. Repoint HC39 + add HC40 (below); add the four TS tests + the two SQL tests.
4. Update `docs/current-system/modules/session-builder.md` §3.1 + §5 in the same
   commit (spec drift = code regression).

**Deploy ordering (per-spec, re-deduced — not defaulted):** new client code
**requires** the RPC to exist to build any session at all → this is a **migrate-first**
change (`make migrate` before the container recreate). Rollback = revert the code
(the RPC is additive and harmless if left in place). The single kept "live-system
safety mechanism" — because the context is about to flip to commercial-live — is the
**parity test** (tests 2+4 + HC40); everything else the live-system lens would add
(shadow reads, dual-write, version guards) is correctly omitted at build-stage.

Gates before merge (migration-touching): **`make migrate-idempotent-check`** (applies
`migration.sql` twice, asserts green — the `drop function if exists` idiom is
idempotent) and **`make pre-deploy`** (lint + test + build + tier-1 + tier-2).

## Supabase Requirements

### Schema changes
- **New RPC** `indonesian.get_session_build_data(uuid, text, text[], timestamptz)`
  in `scripts/migration.sql` (full body above). No new tables, no new columns.
- **RLS:** N/A for the function itself; it is `SECURITY INVOKER`, so it inherits and
  **relies on** the existing RLS of every table it reads. **RLS audit of joined
  tables (all confirmed present):**
  - `learner_capability_state` — RLS enabled + owner-read policy `user_id=auth.uid()`
    (`migration.sql:1281,1293-1295`); authenticated SELECT (`:1317`). ✔
  - `capability_review_events` — RLS + owner-read (`migration.sql:1282,1297-1299`);
    authenticated SELECT (`:1318`). ✔
  - `learner_lesson_activation` — RLS + owner-read (`migration.sql:1799-1806`);
    authenticated SELECT (`:1808`). ✔
  - `learner_collection_activation` — RLS enabled (`migration.sql:3549`); owner-read
    policy present in the collections block — **data-architect: confirm the SELECT
    policy is `user_id=auth.uid()` (open question 3).** ✔ (verify)
  - `learner_reading_harvest` — reader §4 states owner-RLS; **confirm SELECT policy
    exists (open question 3).**
  - `learning_capabilities`, `lessons`, `collections`, `collection_items` —
    authenticated SELECT, no per-user rows (`collection_items` policy `using(true)`,
    `migration.sql:3544-3545`). ✔
  - **If any joined table were RLS-enabled with zero policies, the INVOKER function
    returns silent empties — test 5 is the guard.**
- **Grants:** `revoke all … from public` + `grant execute … to authenticated,
  service_role` (service_role for the parity/force-capability scripts). **Never
  `GRANT ALL`.** No table grants change.

### homelab-configs changes
- **N/A** — no new schema exposure (`indonesian` already in `PGRST_DB_SCHEMAS`), no
  new CORS origin, no GoTrue change, no storage bucket. An RPC on an exposed schema
  needs no PostgREST config beyond the `grant execute` above.

### Health check additions
- **HC39 (`check-supabase-deep.ts:1992-2023`) — repoint, do not delete.** Its
  original subject (unpaginated client catalog fetch that `PGRST_DB_MAX_ROWS` could
  truncate) **no longer exists** after this PR. The scalar-`jsonb` RPC makes row
  truncation structurally impossible, so the check would test dead code. Repoint HC39
  to assert **the old unpaginated `.from('learning_capabilities').select(...)` catalog
  fetch is gone from `session-builder/adapter.ts`** (a source assertion) — or fold it
  into HC40. Record the supersession reason in the check's comment.
- **HC40 (new) — session-build narrowing parity (ADR-0015 layer-b, live).** For the
  seed user: (1) fetch the full ready+published catalog + all states the *old* way;
  (2) call `get_session_build_data`; (3) run the pure `planLearningPath` +
  `getDueCapabilitiesFromRows` (fixed `random`) over both; assert identical
  gate-passing / due / practice canonicalKey sets. Expects parity = 0 diffs.
- **`check-supabase.ts` (tier-1, anon key):** N/A — the RPC needs an authenticated
  JWT; tier-1 is anon-scoped.

## Open questions (for data-architect)

1. **`p_day_start` param vs. server `now()`** — I added `p_day_start timestamptz` to
   preserve the browser-local day boundary for `reviewedTodayRefs` (vs. UTC drift).
   Confirm this is preferable to accepting UTC-day semantics (which would drop the
   param and simplify the signature). Behavioural impact is limited to which sibling
   is buried within the ~1h window around local midnight.
2. **`jsonb` scalar vs. multiple `RETURNS TABLE` RPCs** — one `jsonb` object gives one
   round trip + `PGRST_DB_MAX_ROWS` immunity, at the cost of losing column typing at
   the PostgREST boundary (the client re-maps snake_case JSON). Confirm this beats a
   `RETURNS TABLE` per section (which would reintroduce the truncation surface and
   N round trips).
3. **RLS policy confirmation** — verify `learner_collection_activation` and
   `learner_reading_harvest` each carry a `SELECT TO authenticated USING
   (user_id = auth.uid())` policy (not RLS-enabled-with-zero-policies). If either is
   missing, the INVOKER function silently returns empties for that arm.
4. **`listLearnerCapabilityStates` disposition** — confirm it has no production caller
   (my `src/` grep found none on the build path). If dead, it should be *retired*
   separately; if live somewhere I missed, it needs the same narrowing (a
   state-scoped readiness join, not a full-catalog fetch).
5. **`candidate_caps` performance** — the predicate leans on
   `learner_capability_state(capability_id)` (`migration.sql:1237`) for arm (A) and
   `learning_capabilities(lesson_id)` (`:1859`) for arm (B). Confirm no new index is
   needed for the `source_ref = ANY(...)` arms (C/E) at catalog scale, or add a
   `learning_capabilities(source_ref)` index in this PR.


## Data-architect review (2026-07-02)

**Verdict: APPROVE.** `reviewed_by` updated to `[data-architect]`. `status` left at
`draft` — `architect` sign-off is still required before this can move to `approved`
(per `CLAUDE.md`'s dual-review rule for data-model-touching specs).

**Sources read:** `scripts/migration.sql` (RLS/policy/index blocks at 1156-1330,
1790-1815, 3529-3620, plus `learning_capabilities_lesson_idx`/`learning_capabilities_active_idx`
at 1859-1860/3112-3114, `learning_capabilities_source_ref_type_uidx` at 1184-1185,
`get_lessons_overview`/`get_collections_overview` signatures at 1908-1926/3649-3661,
`learning_items`/`lessons` RLS at 337-421); `src/lib/session-builder/adapter.ts` (full
file, 455 lines); `src/lib/session-builder/dueFilter.ts` (full file, 118 lines);
`src/lib/session-builder/pedagogy.ts` (full file, 581 lines); `src/lib/session-builder/builder.ts`
(100-511); `src/lib/collections/membership.ts` (full file); `src/lib/collections/adapter.ts`
(full file); `src/lib/lessons/activation.ts:44-55`; `src/lib/reading/adapter.ts:29`,
`src/lib/reading/index.ts:105`; `docs/plans/2026-06-09-sibling-burying-design.md`
(frontmatter + lines 57-156); `scripts/check-supabase-deep.ts:1992-2023`.

### Open question 1 — `p_day_start` param: CONFIRMED, keep it

`adapter.ts:277-278` is genuinely local-midnight, not UTC:
```
const dayStart = new Date(request.now)
dayStart.setHours(0, 0, 0, 0)
```
`Date.setHours` mutates in the **JS runtime's local timezone** (the browser's), so
`dayStart` is local midnight; `.toISOString()` (line 301) then converts that instant
to UTC for the `timestamptz` comparison. This is not incidental — the design doc this
code implements says so explicitly: "**Local-midnight source — RESOLVED.** `now =
new Date()` is constructed browser-side... Derive local midnight from `now`... No
timezone config needed." (`docs/plans/2026-06-09-sibling-burying-design.md:156`,
status: shipped, PR #185). A `now()`-based UTC boundary inside the function would
silently drift the sibling-bury day-window by the learner's UTC offset near midnight
— exactly the kind of transport-layer behavior change the spec's own Non-Goals
forbid ("No change to... sibling-burying behaviour. This is a transport change; the
SessionPlan must be identical," line 73-74). **Keep `p_day_start timestamptz`.**
Dropping it to "simplify the signature" would be goal-erosion, not minimum mechanism
— the goal (byte-identical `SessionPlan`) requires it.

### Open question 2 — `jsonb` scalar vs `RETURNS TABLE`: CONFIRMED, keep `jsonb`

The repo's "typed column over JSON blob" preference (`CLAUDE.md` Preferred-solutions
table, "Storage" row) is scoped to **storage** — a column the DB persists and the
type-checker enforces on read. This RPC is pure **transport**: nothing here is
stored, and the per-item pieces (`capabilities`, `learner_states`) are heterogeneous
arrays-of-objects that would need `jsonb_agg(jsonb_build_object(...))` **inside**
a `RETURNS TABLE` body too — `RETURNS TABLE(capabilities jsonb, learner_states
jsonb, ...)` would not add real column-level typing over the nested payload; it
would only catch a wrong **piece count**, not a wrong **JSON key string** (Postgres
does not validate `jsonb_build_object` key-literals against anything). The two
existing precedent RPCs (`get_lessons_overview`, `migration.sql:1908-1926`;
`get_collections_overview`, `migration.sql:3649-3661`) both use `RETURNS TABLE`
because they return **homogeneous flat rows** — a shape this RPC does not have (six
heterogeneous pieces, one of them user-owned FSRS state). Verified the field-count
arithmetic between the RPC body and the existing DB-row interfaces line up exactly
(no drift introduced by the jsonb encoding):
- `capabilities` object (RPC lines 246-260, 13 keys) == `CAPABILITY_COLUMNS`
  (`adapter.ts:33-47`, 13 columns) == `LearningCapabilityDbRow` (`adapter.ts:76-90`).
- `learner_states` object (RPC lines 263-277, 13 keys) == `LEARNER_STATE_COLUMNS`
  (`adapter.ts:60-74`, 13 columns) == `LearnerCapabilityStateDbRow` (`adapter.ts:92-106`).
- `lessons` (RPC line 283, `id`/`order_index`) == `LessonOrderDbRow` (`adapter.ts:117-120`).
- `activated_lesson_ids` (RPC line 280, array of `lesson_id`) == `listActivatedLessons`'s
  return shape (`src/lib/lessons/activation.ts:44-55`, `Promise<Set<string>>` of
  `lesson_id`).

**The real cost of the jsonb choice** — a typo'd JSON key literal inside
`jsonb_build_object` is invisible to Postgres at `CREATE FUNCTION` time and would
only surface via the mandated parity tests (spec's Testing #1 snapshot-parity and
#4 structural-parity) or a runtime `undefined` in a TS mapper. This is an accepted,
correctly-priced cost **conditional on those two tests actually shipping in the same
PR** (not deferred) — they are the substitute mechanism for the DB-level typing this
transport shape can't give you. Consistent with `CLAUDE.md`'s "Read aggregation"
preferred-solution row: "a mirrored predicate is OK if parity-tested (ADR 0015)."
**Keep `jsonb`,** contingent on Testing items 1 and 4 shipping, not "TODO"'d.

### Open question 3 — RLS policy confirmation: CONFIRMED, no gap

Read every RLS/policy block for every table the RPC joins. All owner-scoped tables
carry the `user_id = auth.uid()` SELECT policy the spec assumes; none is
RLS-enabled-with-zero-policies (the 2026-05-08 outage class):

| Table | RLS enabled | Owner SELECT policy | Cite |
|---|---|---|---|
| `learner_capability_state` | yes | `user_id = auth.uid()` | `migration.sql:1281,1293-1295` |
| `capability_review_events` | yes | `user_id = auth.uid()` | `migration.sql:1282,1297-1299` |
| `learner_lesson_activation` | yes | `user_id = auth.uid()` | `migration.sql:1800,1802-1806` |
| `learner_collection_activation` | yes | `user_id = auth.uid()` | `migration.sql:3549-3552` |
| `learner_reading_harvest` | yes | `user_id = auth.uid()` (+owner INSERT) | `migration.sql:3609-3615` |
| `learning_capabilities` | yes | `USING (true)` to authenticated | `migration.sql:1279,1285-1287` |
| `lessons` | yes | `USING (true)` to authenticated | `migration.sql:365,393-394` |
| `learning_items` | yes | `USING (true)` to authenticated | `migration.sql:368,418-419` |
| `collections`, `collection_items` | yes | `USING (true)` to authenticated | `migration.sql:3540-3545` |

No CRITICAL SECURITY-INVOKER-over-RLS finding. The spec's own mandatory test 5
(authenticated-role RLS assertion) is still worth keeping as a regression guard, but
it is not gating a known gap — it's a trip-wire for a **future** policy drop.

### Open question 4 — `listLearnerCapabilityStates` disposition: CONFIRMED dead on the only call path

Traced the full call graph, not just a `src/` grep:
- `sessionBuilderAdapter` (the real DB-backed adapter, `adapter.ts:454`) is used in
  exactly one production call site: `Session.tsx:136`, passed into `buildSession`.
- `buildSession` (`builder.ts:451-506`) calls **only**
  `input.adapter.loadCapabilitySessionData(...)` (line 480) and, on the force-capability
  path, `loadForceCapabilitySnapshot`. It never calls `.listLearnerCapabilityStates`.
- `getDueCapabilities`/`CapabilitySchedulerReadAdapter.listLearnerCapabilityStates`
  (the interface `listLearnerCapabilityStates` implements, `dueFilter.ts:37-45`) has
  exactly one caller in non-test code: `builder.ts:227-234`, which supplies an
  **inline stub** — `listLearnerCapabilityStates: async () => input.schedulerRows`
  — not `sessionBuilderAdapter`'s real method.
- The two `grep` hits outside `adapter.ts`/`builder.ts`/`dueFilter.ts` are both test
  mocks (`capabilitySessionLoader.test.ts:206`, `dueFilter.test.ts:33`).

**Confirmed dead on the only production path.** Safe to retire in the implementing
PR as the spec proposes deferring — agreed this is out of scope for *this* PR (it
would be scope creep per the spec's own framing), but flag it as a **MINOR** finding:
once this RPC ships, `listLearnerCapabilityStates` becomes 100% unreachable
production code (not just "no current caller" — there will be no plausible future
caller once `loadCapabilitySessionData` is the sole entry point), so the follow-up
retirement should be filed as a tracked item, not left indefinite.

### Open question 5 — index for `source_ref = ANY(...)` (clauses C/E): CONFIRMED, no new index needed

`learning_capabilities_source_ref_type_uidx` (`migration.sql:1184-1185`) is a unique
B-tree index on `(source_ref, capability_type)`. `source_ref` is the **leading**
column, so a predicate filtering on `source_ref` alone (`= ANY(...)` or `IN`) can use
this index for an efficient lookup/range scan without needing `capability_type` in
the predicate — the same way any index on `(a, b)` serves queries filtering on `a`
alone. `learning_capabilities_source_idx` (`source_kind, source_ref`,
`migration.sql:1176-1177`) is a red herring here (wrong leading column for a
source_ref-only filter) but the `_uidx` above already covers it. **No new index
required for clauses C/E.** Clause B (`lesson_id`) is already served by
`learning_capabilities_lesson_idx` (partial, `WHERE lesson_id IS NOT NULL`,
`migration.sql:1859-1860`) and `learning_capabilities_active_idx` (`lesson_id,
source_kind WHERE retired_at IS NULL`, `migration.sql:3112-3114`). Clause A is served
by `learner_capability_state_capability_idx` (`migration.sql:1237`, cited correctly
in the spec) against a small (`user_id`-bounded) `user_states` CTE, so Postgres will
hash it rather than lean on the index either way — fine at any realistic per-learner
state-row count.

**INFO** (not blocking, out of this agent's EXPLAIN/query-plan scope per its Scope
boundaries): the `candidate_caps` predicate's clause (D) (`lesson_id IS NULL`) can't
usefully share an index with A/B/C inside one OR, so at large catalog scale the
planner will likely fall back to scanning the readiness/publication-narrowed subset
(`learning_capabilities_readiness_publication_idx`, `migration.sql:1178-1179`) and
evaluating the 4-way OR row-by-row. At current/near-term catalog size (low thousands
of rows per the spec's own Problem statement) this is not a >100ms hot-path concern
and doesn't rise to MAJOR; worth an `EXPLAIN ANALYZE` pass in the operational
migration step once the catalog crosses ~50-100k rows, not a gate on this spec.

### Trap-2 sufficiency claim: CONFIRMED — verified against pedagogy.ts, not just asserted

Traced every read in `gateCandidates` (`pedagogy.ts:291-420`) and `planLearningPath`
(`pedagogy.ts:530-581`) that could touch a prerequisite/sibling capability's own
catalog row (as opposed to its learner-state row):

- **`satisfiedKeys`** (`pedagogy.ts:544-546`): `new Set(input.learnerCapabilityStates
  .filter(state => state.activationState === 'active' && state.successfulReviewCount
  > 0).map(state => state.canonicalKey))`. This reads **only** `PlannerLearnerCapabilityState`
  fields (`activationState`, `successfulReviewCount`, `canonicalKey` — all populated
  from `learner_capability_state` columns via `toPlannerState`, `adapter.ts:218-229`).
  It never joins back to `readyCapabilities` / the catalog. The gate check at
  `pedagogy.ts:337` (`prereqKeys.some(key => !ctx.satisfiedKeys.has(key))`) is
  therefore fully answerable from state rows alone. **A prerequisite capability that
  the learner has a state for is always covered — clause (A) is unconditional across
  every mode** (`c.readiness_status='ready' AND ... AND (exists(...user_states...) OR
  ...)`, RPC lines 218-232) — so a prereq's state row is never missing from the
  narrowed set for a reason the old full-catalog fetch wouldn't also produce (both
  regimes drop states whose capability fell below ready+published — see below).
- **`unlockedSourceRefs`** (`buildUnlockedSourceRefs`, `pedagogy.ts:245-259`) *does*
  read a catalog field of another capability — `cap.sourceRef` via
  `capabilityByCanonicalKey.get(state.canonicalKey)` (`pedagogy.ts:255-256`). This is
  the one place the claim needs the stronger argument, and the spec makes it
  correctly: the sibling capability being looked up **has an active state** (the loop
  is `for (const state of input.learnerCapabilityStates)`, gated on
  `state.activationState !== 'active'` at line 252) — so by clause (A) that sibling's
  capability row is unconditionally present in the RPC's `capabilities` array
  (provided it is itself ready+published+non-retired, the same top-level guard the
  *old* client-side fetch already applied at `adapter.ts:288-293`). No regression.
- **Cross-check against the client-side filter that actually gates which states reach
  the planner at all**: `schedulerRows` (`adapter.ts:345-347`) filters
  `statesResult.data` to `capabilityById.has(row.capability_id)` — i.e., **today**,
  a learner's state for a capability that has become unready/unpublished/retired is
  already silently dropped from the planner's view (pre-existing behavior, not
  introduced by this spec). Under the RPC, `user_states` returns every raw state
  row unconditionally, but the client-side `capabilityById` is built from the RPC's
  `capabilities` array — which is exactly `candidate_caps`, gated by the same
  `ready/published/not-retired` guard. So the same states get dropped, for the same
  reason, in both regimes. **Byte-identical**, not merely "probably fine."

**No consumer reads a catalog field of a capability that can be outside the narrowed
set.** The one place that reads a catalog field of an *other* capability
(`unlockedSourceRefs`) only does so for capabilities reachable via clause (A)
(active-state siblings), which is unconditional. Confirmed, not refuted.

### Additional verification (not one of the five open questions)

- **`resolveActivatedMemberRefs` parity** (`src/lib/collections/membership.ts:35-47`,
  `src/lib/collections/adapter.ts:14-62`): confirmed no `is_published` filter on
  either the collection-membership or harvest path, matching the RPC comment's claim
  verbatim (RPC lines 197-200). Confirmed `ITEM_SOURCE_REF_PREFIX = 'learning_items/'`
  (`membership.ts:14`) matches the RPC's `'learning_items/' || li.normalized_text`
  construction exactly (RPC lines 202, 208). Confirmed harvest is read unconditionally
  (UNION, not gated on collection activation) in both the TS module (comment,
  `membership.ts:33-34`) and the RPC (`union`, RPC lines 207-211).
- **`src/lib/reading/`**: only writes `learner_reading_harvest`
  (`src/lib/reading/adapter.ts:29`) and documents the collections-gate-OR seam as a
  downstream reader (`src/lib/reading/index.ts:105`) — it does not read session-build
  data itself, so it is not a consumer this RPC needs to satisfy; it is a **writer**
  whose row shape (`user_id`, `learning_item_id`) the RPC's `learner_reading_harvest`
  join already matches (`migration.sql:3600-3605`).
- **`isCapabilityInScope`** (`builder.ts:122-129`) and **`resolveCandidate`**
  (`builder.ts:183-211`) both do defensive `Map.get(...)` lookups against
  `capabilitiesByKey` and degrade to a documented failure path
  (`missing_capability_projection` / scope-exclusion) rather than throwing when a
  capability is absent — consistent with due caps always being present per the Trap-1
  argument, and safe even if that argument were ever violated by a future change.

### Findings summary

No CRITICAL or MAJOR findings. Two MINOR/INFO notes, neither blocking:

- **MINOR** — file a follow-up issue to retire `listLearnerCapabilityStates`
  (`adapter.ts:251-270`) once this RPC ships; it will be provably unreachable
  production code, not merely "no current caller."
- **INFO** — `candidate_caps`'s 4-way OR (clauses A-D) can't share one index; revisit
  with `EXPLAIN ANALYZE` once the catalog crosses roughly 50-100k rows. Not a gate on
  this spec (query-plan tuning is out of this agent's scope).

### Conditions of this APPROVE

1. Testing items 1 (snapshot parity) and 4 (structural parity) ship in the **same
   PR** as the RPC — they are the load-bearing substitute for the DB-level typing the
   `jsonb` transport shape forgoes (open question 2).
2. `docs/current-system/modules/session-builder.md` §3.1 + §5 are updated in the same
   commit, per the spec's own Rollout step 4 and `CLAUDE.md`'s spec-drift-is-a-regression
   rule.

Still required before `status: approved`: **`architect`** sign-off (module
placement / ADR fit / seam check) — not performed by this pass.

## Architect review (2026-07-02)

**Verdict: APPROVE.** `reviewed_by` updated to `[data-architect, architect]`.
`status` stays `draft` — the user decides the flip to `approved`. My lens is the
complement to the data-architect's writer-reader-validator pass: module placement,
ADR fit, seams, Minimum Mechanism. Every load-bearing cite re-verified against code
(the code is authoritative; prose lags).

**Sources re-read (code, not memory):** `src/lib/session-builder/adapter.ts` (full,
455 lines — six `Promise.all` reads at 280-306, `CAPABILITY_COLUMNS` 33-47,
`LEARNER_STATE_COLUMNS` 60-74, local-midnight compute 277-278, in-memory assembly
313-384); `dueFilter.ts` (full — **Trap 1**: `getDueCapabilitiesFromRows` 64-105
filters state rows on `activationState/readinessStatus/publicationStatus/nextDueAt`
only, never activation); `pedagogy.ts:180-420,525-581` (**Trap 2**: `satisfiedKeys`
544-546 and `buildUnlockedSourceRefs` 245-259 read state rows only, the latter only
active-state siblings at 251-256; lesson-activation-OR-collection gate 407-414;
podcast / `isAllowedInSessionMode` carve-out 196-201); `docs/adr/0015-...md`;
`docs/adr/0006-...md` (podcast null-`lesson_id` carve-out); `docs/target-architecture.md:110-137,408-418`
(`adapter.ts` is the abstraction-translation seam that hides RPC names; it folds
`capabilitySessionDataService.ts` INTO itself — a KEEP surface); `session-builder.md`
(before-spec, `status: stable`; §3.1/§4/§5); `scripts/check-supabase-deep.ts:1992-2023`
(HC39 guards exactly the removed fetch); `migration.sql` (both precedent RPCs present).

### 1. Module placement — CLEAN

Lands squarely at `adapter.ts`, the sanctioned seam that hides "the schema name, table
names, **RPC names**, snake/camel mapping, RLS quirks" (`target-architecture.md:119-121`).
Swapping six `.from(...)` reads for one `.rpc(...)` is exactly the complexity that seam
absorbs; the output contract (`CapabilitySessionDataSnapshot`) is unchanged and the pure
planner stays client-side. The four mappers consume snake_case rows the RPC reproduces
field-for-field. No fold-slated file touched — `adapter.ts` is a KEEP surface that
absorbs `capabilitySessionDataService.ts` per `target-architecture.md:415`. No #4/#4b drift.

### 2. ADR fit — CONSISTENT, none contradicted

- **ADR 0015** (motivating): two-layer parity obligation discharged — structural (test #4)
  + semantic-live (HC40). Framing NOTE below.
- **ADR 0006**: clause (D) `lesson_id IS NULL` reproduces the podcast carve-out verbatim;
  verified against the `pedagogy.ts:407-414` gate it mirrors. Preserved, not weakened.
- **ADR 0011 / 0001 / 0003**: read-only over published caps; no write. Unaffected.
- No other ADR touched by a transport-only read change.

### 3. Minimum Mechanism — PASSES the omission test on every element

- **Clauses A-E**: each has a distinct, non-self-created justification (omit A → due caps
  from non-activated lessons vanish; B → no lesson intros; C → collection gap-words never
  surface; D → podcast caps never surface; E → scoped modes get no intros). No clause
  patches a problem another clause created.
- **`p_day_start`**: omitting it drifts sibling-bury to UTC midnight — forbidden by the
  "identical SessionPlan" goal. Minimum-mechanism-toward-the-goal, not gold-plating.
- **Planner NOT ported to SQL**: correctly rejected (far larger parity liability).
- **No live-system machinery**; only the parity test kept, justified by the live flip.
- **No goal-erosion**: all six original query outputs traced to RPC payload keys; every
  derived value reconstructs client-side. Full deliverable reached.

### 4. Cutover — old path DELETED in one move, not left as fallback

Rollout step 2 deletes the five `.from(...)` reads + the `resolveActivatedMemberRefs` /
`listActivatedLessons` calls; no coexistence branch, no flag, no dual-read. Deploy
ordering re-deduced per-spec (migrate-first). Matches the "build the target and delete
the old in one move" Operating-Context shape. `listLearnerCapabilityStates` correctly
scoped out (grep-evidenced dead surface), not smuggled in.

### Refactor discipline (before-spec + invariants)

Before-spec exists (`session-builder.md`, `status: stable`). Transport-only refactor:
none of the §4 invariants constrains *how* the adapter fetches — they are behavioural,
and the parity tests prove the `SessionPlan` is byte-identical, preserving every one at
the strongest level. Rollout step 4 commits to rewriting §3.1 + §5 (see WARNING).

### Findings

**CRITICAL:** none.

**WARNING:**
- The before-spec §3.1 header (`session-builder.md:129`) says "**five** parallel Supabase
  reads," but the live adapter runs **six** (the `resolveActivatedMemberRefs` collections
  read at `adapter.ts:305` was added later and is not reflected). The plan itself is
  grounded in code (Problem section enumerates all six), so not a plan defect — but the
  implementing PR's §3.1 rewrite (rollout step 4) must correct "five"→"six" and its
  enumerated list, or the module spec ships a fresh drift.

**NOTES (judgment calls; author may push back):**
- **ADR 0015 framing.** ADR 0015's letter is about read *aggregations* (a small scalar
  answer); this is a read *narrowing* that still ships bounded rows. The inclusion filter
  is a parity-tested *superset* predicate (provably ⊇ what the planner selects, guarded by
  the semantic layer), not a byte-identical mirror of one TS predicate. Spirit fits and
  the obligation is discharged — but phrase it as "ADR-0015-adjacent: parity-tested
  sufficiency *superset*" in the spec + `CONTEXT.md` so a future reviewer doesn't expect
  an exact predicate mirror.
- **`p_user_id` is redundant under INVOKER.** Every owner-scoped CTE filters on
  `p_user_id` while RLS independently scopes to `auth.uid()`; the param can only ever
  usefully equal `auth.uid()`. Could drop it for `auth.uid()` internally (removes a
  footgun). Kept as a NOTE, not a finding: matches the `get_lessons_overview(p_user_id)`
  precedent and was the directed signature. Author's call.
- **HC39 repoint vs delete.** The truncation class is eliminated by construction, so HC39
  could be deleted with HC40 as the regression guard. The spec's repoint-to-source-
  assertion is a mild extra guard; "fold into HC40" (offered) is the leaner default.

### Verdict

**APPROVE** for architect sign-off. Module placement is exactly right, no ADR is
contradicted, the mechanism is minimal-toward-the-goal with no goal-erosion, and the
cutover deletes the old path in one move. The two data-architect conditions carry forward
(Testing #1 + #4 same PR; §3.1 + §5 same commit); I add one: the §3.1 rewrite must fix the
five→six read-count drift (WARNING above). `status` stays `draft` pending the user's
approval decision.
