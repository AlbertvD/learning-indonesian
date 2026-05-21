---
status: approved
---

# FSRS config tuning — switch from Anki-style steps to stability-driven scheduling

## Goal

Replace the ts-fsrs Anki-style short-term step machine with a pure stability-driven schedule, so the gap between a failed answer and its next appearance is computed from the cap's actual stability rather than a fixed 10-minute step. The user-visible win is that a cap which fails mid-session will not reappear 10 minutes later; in most cases it will not reappear within the session at all, which is the intended retrieval-practice behaviour. The intended consequence is *fewer* same-card recycles per session, accepted in exchange for *longer* gaps between encounters of weak caps.

The change is one Edge Function edit (`supabase/functions/commit-capability-answer-report/index.ts:4-9`): tune the four FSRS knobs that govern the Learning / Relearning state machine and the interval modifier. No schema change. No app-image rebuild.

## Plan grounding

Per `CLAUDE.md` § Quality Over Speed, every touched surface audited against the target architecture and the matching module spec:

| Surface | Target architecture reference | Module spec reference | Plan target lands at the right seam? |
|---|---|---|---|
| `supabase/functions/commit-capability-answer-report/index.ts` (FSRS params at lines 4-9) | `docs/target-architecture.md:1077-1112` (Edge function: `commit-capability-answer-report`) + `docs/target-architecture.md:932-979` (`_shared/srs/`, LOCKED but **not yet built**) | none (the Edge Function does not have its own module spec — its target lives in `docs/target-architecture.md`) | Yes — the params live inline at this seam today; the LOCKED `_shared/srs/` fold is unbuilt, so the seam *is* the Edge Function. The fold can absorb the tuned constants when it happens. |
| `_shared/srs/params.ts` (target) | `docs/target-architecture.md:954-961` | n/a (not yet built) | Out of scope — this plan tunes constants at the current seam; a separate plan would build the shared module and migrate them. |
| Live `learner_capability_state` rows (the per-user FSRS state) | `docs/target-architecture.md:1107-1112` (side effects of the Edge Function) | `docs/current-system/modules/session-builder.md:281-296` ("FSRS state … written by the server-side review processor") | No migration. Existing `stability`/`difficulty` carry over verbatim; new intervals apply from the next answer commit (decision D2). |
| `learner_capability_state.activation_state='active'` rows where current code forces `state=2` (Review) on the Card object before calling `scheduler.next` (`commit-capability-answer-report/index.ts:130-136`) | n/a (implementation detail of the Edge Function) | n/a | This plan does NOT change the `state=2` override. Under `enable_short_term: false`, the LongTermScheduler converges `newState` / `learningState` / `reviewState` to the same stability-driven path (`packages/fsrs/src/impl/long_term_scheduler.ts:11, 56`) — so the override is inert for routing. It still does work defensively against `createEmptyCard`'s `state: State.New` default (`packages/fsrs/src/default.ts:155-167`), guaranteeing that a non-dormant cap with a known stability/difficulty never accidentally re-traverses the initial-stability path. Inert but not deletable — see D6. |

Verified `docs/target-architecture.md:932-979` lists `_shared/srs/` as LOCKED but unbuilt (current edge function inlines params). Verified by `ls supabase/functions/_shared/`: directory does not exist. So the only live FSRS seam is `commit-capability-answer-report/index.ts:4-9`.

No constraints found in the target architecture against tuning request_retention / learning_steps / relearning_steps / enable_short_term at this seam.

## What's broken today

### The user-visible symptom

After every failed answer, the same capability resurfaces in 10 minutes. With a ~25 % failure rate (see snapshot below), roughly every fourth answer creates a 10-minute recycle. In a short session (preferred size ~6 cards), this manifests as 1–2 cards repeating within the session and again in the next session 10 minutes later. The hardest few capabilities — those with difficulty saturated at the upper bound — never escape this loop.

### Live-DB snapshot (queried 2026-05-21 against testuser@duin.home, user_id `7eaacda5-4004-4bc3-9e32-586dfcdf1ee7`)

```text
TOTAL caps in learner_capability_state: 252
activation_state distribution: active=252 (no dormant, suspended, or retired)

stability buckets (active caps):
  < 0.01 (1m):           0
  0.01–0.1 (10m):        0
  0.1–1 (intra-day):    25
  1–7 (days):          193
  7–30:                 34
  > 30:                  0

interval distribution (minutes), n=252:
  p10 =     10.0   (= relearning_steps[0])
  p25 =   2880.0   (≈ 2 days)
  p50 =   7200.0   (≈ 5 days)
  p75 =  10080.0   (= 7 days)
  p90 =  33120.0   (≈ 23 days)

top-5 lapse-rate caps (review_count ≥ 3):
  rc=13 lc=12 cfc=13 stab=0.16 diff=9.77
  rc=12 lc=11 cfc=12 stab=0.16 diff=9.75
  rc=14 lc=12 cfc= 0 stab=0.16 diff=9.71
  rc=10 lc= 8 cfc= 0 stab=1.11 diff=9.52
  rc= 9 lc= 7 cfc= 0 stab=0.86 diff=9.52

capability_review_events sampled (most-recent 2000): 623 rows, 2026-05-01 → 2026-05-21
  rating=1 (Again):  159   (25.5 %)
  rating=2 (Hard):     6    (1.0 %)
  rating=3 (Good):   458   (73.5 %)
```

(Diagnostic script: to be committed at `scripts/diagnostics/fsrs-state.ts` per D8. Source below. Run with `bun --env-file=.env.local scripts/diagnostics/fsrs-state.ts <user_id>`.)

```typescript
// scripts/diagnostics/fsrs-state.ts — per-user FSRS distribution snapshot
import { createClient } from '@supabase/supabase-js'

const url = process.env.VITE_SUPABASE_URL!
const key = process.env.SUPABASE_SERVICE_KEY!
const userId = process.argv[2]
if (!userId) { console.error('usage: bun fsrs-state.ts <user_id>'); process.exit(1) }

const sb = createClient(url, key, { db: { schema: 'indonesian' } })

const { data: state, error } = await sb
  .from('learner_capability_state')
  .select('capability_id, stability, difficulty, review_count, lapse_count, consecutive_failure_count, activation_state, next_due_at, last_reviewed_at')
  .eq('user_id', userId)
if (error) { console.error(error); process.exit(1) }
const rows = state ?? []
console.log(`TOTAL caps: ${rows.length}`)

const byAct = new Map<string, number>()
for (const r of rows) byAct.set(r.activation_state, (byAct.get(r.activation_state) ?? 0) + 1)
console.log('activation_state:', Object.fromEntries(byAct))

const active = rows.filter(r => r.activation_state === 'active' && r.stability != null)
const buckets = { '< 0.01 (1m)': 0, '0.01–0.1 (10m)': 0, '0.1–1 (intra-day)': 0, '1–7 (days)': 0, '7–30': 0, '> 30': 0 }
for (const r of active) {
  const s = r.stability!
  if (s < 0.01) buckets['< 0.01 (1m)']++
  else if (s < 0.1) buckets['0.01–0.1 (10m)']++
  else if (s < 1) buckets['0.1–1 (intra-day)']++
  else if (s < 7) buckets['1–7 (days)']++
  else if (s < 30) buckets['7–30']++
  else buckets['> 30']++
}
console.log('stability buckets:', buckets)

const deltas = active
  .filter(r => r.next_due_at && r.last_reviewed_at)
  .map(r => (new Date(r.next_due_at!).getTime() - new Date(r.last_reviewed_at!).getTime()) / 60000)
  .sort((a, b) => a - b)
const pct = (p: number) => deltas[Math.floor(deltas.length * p)]
console.log(`interval minutes: p10=${pct(0.1)?.toFixed(1)} p25=${pct(0.25)?.toFixed(1)} p50=${pct(0.5)?.toFixed(1)} p75=${pct(0.75)?.toFixed(1)} p90=${pct(0.9)?.toFixed(1)}`)

const worst = [...active]
  .filter(r => (r.review_count ?? 0) >= 3)
  .sort((a, b) => (b.lapse_count / b.review_count) - (a.lapse_count / a.review_count))
  .slice(0, 5)
console.log('top-5 lapse-rate caps:')
for (const r of worst) console.log(`  cap=${r.capability_id.slice(0,8)} rc=${r.review_count} lc=${r.lapse_count} cfc=${r.consecutive_failure_count} stab=${r.stability?.toFixed(2)} diff=${r.difficulty?.toFixed(2)}`)

const { data: events } = await sb
  .from('capability_review_events')
  .select('created_at, rating')
  .eq('user_id', userId)
  .order('created_at', { ascending: false })
  .limit(2000)
console.log(`review_events (recent ≤2000): ${events?.length ?? 0}`)
if (events?.length) {
  const byR = new Map<number, number>()
  for (const e of events) byR.set(e.rating, (byR.get(e.rating) ?? 0) + 1)
  console.log('rating distribution:', Object.fromEntries([...byR].sort()))
}
```

### What the snapshot says (and what the initial framing got wrong)

The initial framing ("~230 of 252 caps stuck in ts-fsrs's Learning state with 1-minute and 10-minute intervals") is **not what the data shows**. The data shows:

1. **No caps have stability < 0.1.** The 1-minute step is never reached at steady state. Most caps have stability 0.1–7 days.
2. **The 10-minute recycle is concentrated in ~10 % of caps** (`p10 = 10.0 min`), not 90 %. It is the **Relearning** state, not the Learning state — entered after Again on a Review-state card, not on a New card.
3. **Median interval is 5 days.** For the majority of caps, FSRS is scheduling reasonable spacing. The user-perceived "same exercises over and over" is the bottom decile (the Again-recycled caps), which the session-builder picks first because it sorts due caps by `next_due_at` ascending (`src/lib/session-builder/dueFilter.ts:66`, called from `src/lib/session-builder/builder.ts:236-262`).

The brief's secondary framing ("`request_retention=0.85` means more frequent reviews than ts-fsrs default of 0.9") is **also wrong**, and `docs/target-architecture.md:950` propagates the same error. The ts-fsrs interval formula (`packages/fsrs/src/algorithm.ts:80-90`) is `I(r, s) = (r^(1/DECAY) - 1) / FACTOR · s`. With `DECAY = -0.5` (the FSRS5_DEFAULT_DECAY auto-filled by `migrateParameters` for our 17-weight w array), the interval modifier evaluates to:

| `request_retention` | interval modifier (× stability) |
|---|---|
| 0.90 (library default) | 1.00 |
| 0.85 (our current value) | 1.64 |
| 0.80 | 2.40 |
| 0.75 | 3.32 |

So `0.85` already produces **longer** intervals than the library default. Lowering further would lengthen the long-tail intervals (p50, p90), but it does **not** address the 10-minute relearning step — that step is driven by `relearning_steps[0]`, not by the interval modifier.

### The actual root cause

Two compounding effects:

1. **`relearning_steps` defaults to `['10m']`** (`packages/fsrs/src/constant.ts:8-12`, verified at v5.3.2 commit `072b5584`). The Edge Function does not override it (`commit-capability-answer-report/index.ts:4-9`). So `BasicScheduler.reviewState` calls `applyLearningSteps(next_again, Again, State.Relearning)` (`packages/fsrs/src/impl/basic_scheduler.ts:135`), which sets `nextCard.due = now + 10 min` and `nextCard.state = State.Relearning` for every Again on a Review-state card.
2. **Difficulty climbs to the ceiling for the hardest caps.** `CLAMP_PARAMETERS` caps initial difficulty at `[1.0, 10.0]` (`packages/fsrs/src/constant.ts:48`). Once a cap saturates at difficulty=9.7+, every Again drops stability close to the floor (`S_MIN = 0.001`), and the next-stability computation cannot recover quickly. These caps fail → 10-minute recycle → fail again → 10-minute recycle, indefinitely. The five worst caps in the snapshot have `stab ∈ [0.16, 1.11]` with `diff ∈ [9.52, 9.77]` and lapse-rates 70–92 %.

### Why the current `state: 2` override doesn't help

The Edge Function forces `card.state = 2` (Review) on every non-dormant cap before calling `scheduler.next` (`commit-capability-answer-report/index.ts:130-136`). The intent appears to be "always treat re-reviews as Review-state". That intent is partially achieved: with `enable_short_term: true`, `BasicScheduler` (via `AbstractScheduler.review` — verified at `packages/fsrs/src/abstract_scheduler.ts` dispatching on `this.last.state`) routes `state=Review` to `reviewState()`. But `reviewState(Again)` STILL kicks the card into Relearning via `applyLearningSteps(next_again, Again, State.Relearning)` (`packages/fsrs/src/impl/basic_scheduler.ts:135`). The override bypasses Learning steps on re-reviews; it does NOT bypass Relearning steps after an Again. That's the 10-minute leak.

### Three propagators of the "0.85 = more frequent" error

The historical research doc `docs/research/2026-04-03-fsrs-language-learning-tuning.md:47-58` is the third propagator (after target-architecture.md:950 and the conversation framing) of the inverted-direction error. The research doc claims "0.85 = more frequent reviews than 0.9 default"; the math (`packages/fsrs/src/algorithm.ts:80-90`) shows the opposite. As part of landing this plan, the research doc should be either annotated with a correction note or have its frontmatter status flipped to `superseded` with a link to this plan. The target-architecture entry at line 950 should be corrected to match. **Not in this plan's diff scope** — flag as a follow-up doc-fix commit.

## Decisions

### D1. Disable the short-term scheduler (`enable_short_term: false`) and lower `request_retention` to 0.80

**Picked.** Combined intervention.

`enable_short_term: false` makes `FSRS` instantiate `LongTermScheduler` instead of `BasicScheduler` (`packages/fsrs/src/fsrs.ts:103`). `LongTermScheduler` overrides `newState`, `learningState`, and `reviewState` to skip the Learning + Relearning state machine entirely — every transition computes the next interval from stability via `algorithm.next_interval(stability, elapsed_days)` (`packages/fsrs/src/impl/long_term_scheduler.ts:25-53, 56-87`).

`request_retention: 0.80` lengthens every stability-driven interval by ~46 % relative to today's 0.85 (modifier 2.40 vs 1.64).

**Expected interval after Again, by cap difficulty/stability bucket:**

The post-Again stability is `s_after_fail` computed from `next_state`, then the interval is `s_after_fail · interval_modifier` days. For the new regime with `request_retention = 0.80` → modifier 2.40:

| Bucket today | Today's post-Again interval (BasicScheduler) | Post-Again interval (new regime) — order of magnitude |
|---|---|---|
| Worst caps (diff ≥ 9.5, stab ≈ 0.2 d) | 10 minutes (relearning_steps[0]) | **2–12 hours** (depends on r_pre — short-elapsed retests give ~2-3 h; longer-elapsed first-failure-of-the-day gives ~10-12 h) |
| Mid-stability (diff ≈ 5, stab ≈ 1 d) | 10 minutes | **~16-24 hours** |
| Mid-stability (diff ≈ 5, stab ≈ 3 d) | 10 minutes | **~1.5-2 days** |
| Long-stability (diff ≈ 3, stab ≈ 7 d) | 10 minutes | **~4-5 days** |
| Long-stability (diff ≈ 3, stab ≈ 14 d) | 10 minutes | **~6-7 days** |

(Numbers are order-of-magnitude estimates derived from the FSRS-5 `next_state` formula `next_s_fail = w[11] · D^(-w[12]) · ((S+1)^w[13] - 1) · e^(w[14] · (1 - r_pre))` with our 17-element w array. The post-Again stability depends on pre-review retrievability `r_pre`, which varies with how long the cap has been ripening — hence ranges, not single figures. The validation step in D3 will surface the actual measured values.)

This is the **chief regime change**, and it goes well beyond fixing the bottom-decile recycle. Today, *every* Again on *any* cap re-surfaces in 10 minutes. Tomorrow, a cap with mid-stability that fails will not re-appear until the next day; a cap with long stability that fails won't reappear for several days. This is intentional: retrieval-practice literature (Roediger & Karpicke 2006; the spaced-practice citations in `~/.claude/projects/-Users-albert-home-learning-indonesian/memory/research_audio_sla.md`) finds that gap-then-retest produces stronger long-term retention than rapid restudy. But it does change the user's mental model: "fail it now, see it later in the same session" disappears under this regime.

For the median cap (stability ≈ 5 days, *Good* answer): interval shifts from ~8 days today (5 × 1.64) to ~12 days tomorrow (5 × 2.40). The expected effect on the p10 bucket (the chief symptom) is the dominant gain — the 10-minute step disappears — but long-tail intervals also lengthen.

**Note on stability-after-Again with `enable_short_term: false`:** the FSRS-5 stability formula contains a separate short-term factor `s / exp(w[17] · w[18])` (`packages/fsrs/src/algorithm.ts:next_state` — gated on `param.enable_short_term`). With `enable_short_term: true` (today), this factor would normally apply on top of `s_after_fail`. **But our w[17] and w[18] are 0 already today** — `migrateParameters` (`packages/fsrs/src/default.ts:75-96`) auto-fills our 17-element FSRS-5 weight array to 21 elements with `[0, 0, 0, FSRS5_DEFAULT_DECAY]`, so the short-term-stability exponents are zero, and `exp(0 · 0) = 1`. Net: the stability-after-Again formula is identical today and tomorrow; only the *scheduling* of the next interval changes.

**Rationale for the combination, not just one knob:**

- `enable_short_term: false` alone (with `request_retention: 0.85`): fixes the 10-minute leak. Median interval is unchanged from today (~5 days × 1.64 ≈ 8 days). Good but conservative.
- `request_retention: 0.80` alone (with `enable_short_term: true`): lengthens median intervals (~5 days × 2.40 ≈ 12 days) but the 10-minute Again recycle persists.
- Combined: fixes the leak AND lengthens long-tail intervals. Net effect: hard caps recycle on a multi-hour basis (acceptable for retrieval practice) and easy caps space out further (matches adult SLA literature — see ADR 0007 and the dual-coding research note `~/.claude/.../research_audio_sla.md` for the canonical citation set).

**Why 0.80 and not 0.75:** 0.80 is the FSRS-default-for-language-learning recommendation in the FSRS4Anki wiki. 0.75 stretches the long-tail to ~17 days median, which past empirical retrievability for unstable caps lands below 70 %, increasing relapse risk. Pick the conservative move; reassess after data lands.

**Rejected: extending `learning_steps` to `['10m', '1h', '1d']`.**

This was the brief's recommended option A. It would keep Anki-style intra-session recycling for caps that fail repeatedly, with multiple "must answer correctly N times in a row" gates before graduation. Three reasons against:

- The Anki-style "scaffold of short steps that gradually lengthen" is tuned for elementary-school flashcard use where the learner has no prior knowledge of the material. Adult learners practising a second language already have a receptive-before-productive scaffold from the capability staging gate (`docs/adr/0007-receptive-before-productive-staging.md` + `docs/current-system/modules/session-builder.md:289-296`). The pedagogic scaffold is upstream of FSRS, not inside it.
- The data shows the user's problem is the *Relearning* step, not the Learning step. Even if learning_steps were lengthened, the Again-on-Review path would still route through `relearning_steps`, so the recycle would not be fixed.
- Adding three Learning-state gates would *increase* per-cap review count for new caps (now 3 successful reviews to graduate, not 1). For a learner introducing ~5 caps per session, that's ~15 extra answers committed before any new cap reaches the stability-driven schedule. The session-builder's `loadBudget` already gates new-cap introductions to avoid overload; adding intra-card gates is double-gating.

**Rejected: only adjusting `request_retention`.**

Composable but insufficient on its own. The 10-minute recycle is the chief symptom; lengthening long-tail intervals doesn't fix it.

**Rejected: re-tuning the `w[]` array.**

The current w array (`commit-capability-answer-report/index.ts:7`) is the 17-element FSRS-4/5 stock weight set; ts-fsrs auto-migrates it to 21 elements with `[0.0, 0.0, 0.0, FSRS5_DEFAULT_DECAY]` for the four new FSRS-6 short-term-stability fields (`packages/fsrs/src/default.ts:75-96`). The first two FSRS-6 extensions (`w[17]`, `w[18]`) are the short-term-stability exponents that govern the Learning + Relearning step's effect on stability. With `enable_short_term: false`, the LongTermScheduler doesn't execute that code path, so those weights are inert. Re-tuning the rest of the w array requires running FSRS-6 optimization on the live user data — a separate, much larger project. Out of scope here.

### D2. State migration: forward-only

**Picked.** Existing `stability` and `difficulty` values stay verbatim. The next answer commit on each cap is computed under the new params and the cap's interval converges from there. No backfill, no recompute pass.

**Rationale:** The stability and difficulty values are *per-cap learned signals* (how predictable is the user's recall for this specific cap). The intervention changes which scheduler the FSRSAlgorithm uses (`BasicScheduler` → `LongTermScheduler`) and the `intervalModifier` constant (`request_retention` proxy setter at `algorithm.ts:115-118`). Neither changes how stability/difficulty are computed from a new review (`algorithm.next_state` is invoked from both schedulers identically — verified at `basic_scheduler.ts:182-198` and `long_term_scheduler.ts:42-54`). Existing learned signals remain valid.

The first ~24 hours post-deploy will see the bottom decile of caps "rebase" from 10-min intervals to multi-hour intervals as their next answers are committed. After that, the steady state is the new regime.

**Rejected: recompute next_due_at for every cap at deploy time.**

Tempting but unnecessary. The Edge Function only runs at answer-commit time, so a one-off recompute would require a separate migration script. The live-data convergence (24 hours) is short enough that this is wasted complexity.

**Rejected: zero out stability for difficulty-saturated caps (the worst 5).**

Plausible — "give the hardest caps a clean slate". Rejected because: (a) the user's struggle with those caps is real data, not noise; FSRS has correctly inferred high difficulty. Zeroing stability would just delay re-discovery of difficulty. (b) Without solving the underlying pedagogic problem (the cap is genuinely hard for the user), reset would only delay the next failure. The new `enable_short_term: false` regime alone changes the recycle interval from 10 min to ~11 hours, which is the user-visible win.

### D3. Rollout

**Picked.** Sync the edited function file to the homelab via SSH, then restart the `supabase-edge-functions` container.

The Supabase Cloud `supabase functions deploy --project-ref <ref>` flow **does not apply** to this self-hosted stack. The edge function code is volume-mounted from the homelab host (verified at `homelab-configs/services/supabase/docker-compose.yml:151-153`):

```yaml
volumes:
  - /opt/docker/appdata/supabase/functions:/home/deno/functions
```

The `supabase-edge-functions` container starts with `--main-service /home/deno/functions/commit-capability-answer-report` (`docker-compose.yml:154-157`). Deno reloads the entry-point on container restart.

**Deploy command sequence (run from the project root with the change committed locally):**

```bash
# 1. Sync the function file to the homelab
scp supabase/functions/commit-capability-answer-report/index.ts \
    mrblond@master-docker:/opt/docker/appdata/supabase/functions/commit-capability-answer-report/index.ts

# 2. Restart the edge-functions container
ssh mrblond@master-docker docker restart supabase-edge-functions

# 3. Verify it came up healthy
ssh mrblond@master-docker docker logs --tail 20 supabase-edge-functions
```

Container restart is brief (a few seconds). The Edge Function is the sole writer of `capability_review_events`; during the restart any in-flight answer commit fails with a transient error. Coordination with the user: run the deploy when the user is not actively in a session (or accept the ~5-second window of "answer didn't commit, retry").

**Alternative: Portainer.** The homelab also has Portainer MCP (`environment id 3`). For this single-file change SCP is simpler than navigating Portainer's stack-editor UI; the SCP path is documented above. If the operator prefers Portainer, the equivalent action is "edit `services/supabase` stack → recreate the `functions` service".

**Validation sequence:**

1. Deploy via the command sequence above.
2. Sign in as testuser@duin.home, run a short session (≥ 3 answers including ≥ 1 deliberate failure on a cap with known mid-stability ≥ 1 day). Confirm the failed cap's next-due time is **more than 1 day away**, not 10 minutes (visible in the `capability_review_events.state_after_json.nextDueAt` row written by the commit; query against the live DB with `bun --env-file=.env.local scripts/diagnostics/fsrs-state.ts` after committing the diagnostic script — see D8).
3. Wait 24 hours; re-run the diagnostic. Confirm the p10 interval is no longer 10 min (target: ≥ 4 hours).
4. Wait 7 days; re-run. Confirm the `stability < 1` day bucket has shrunk from 10 % (25/252) toward ≤ 5 %, and the median interval has grown from ~5 days toward 7–10 days.

**Failure handling:** if step 2 fails (the failed cap re-surfaces in minutes anyway), roll back per §Rollback before doing anything else. Do not iterate on the deploy in-place; the answer commits during the iteration would corrupt the comparison data.

**Rejected: feature-flag the change.**

There is no precedent for flagging Edge Function behaviour in this repo, and the function has no env-var-driven branch points today. Adding one would mean a code change *in the same file* that the constants live in. The deploy is reversible in seconds (rollback = re-SCP the previous version + restart — see §Rollback). Flagging is overhead without benefit.

**Rejected: roll out to testuser only.**

The Edge Function code is per-user-agnostic. There is no learner-cohort gating in the function. Single-user rollout would require new code in the function to read a flag — that's strictly more risk than just deploying.

### D4. Telemetry — what tells us this is working (and what tells us it's not)

**Metrics to watch in `capability_review_events.state_after_json` 24 hours and 7 days post-deploy:**

| Metric | Today (snapshot) | Target after 24 h | Target after 7 d |
|---|---|---|---|
| p10 of `(nextDueAt - reviewedAt)` for events with rating=Again | 10 min | ≥ 4 hours | ≥ 8 hours |
| Fraction of `learner_capability_state` rows with `stability < 0.1` | 0 % | 0 % (unchanged) | 0 % (unchanged) |
| Fraction with `stability < 1` day | 10 % (25/252) | ≤ 8 % | ≤ 5 % |
| Median `(nextDueAt - reviewedAt)` across all commits | 5 days | 6–8 days | 7–10 days |
| User-visible repeat rate (same cap shown twice in a session of size ≤ 6) | high (anecdotal) | low (manual check) | low (manual check) |

**Per the `feedback_answer_log_check` rule** (memory `feedback_answer_log_check.md`), the post-deploy verification step is to **re-query `capability_review_events`** and confirm the regime change shows up in the live answer log, not just in trace-level evidence. A unit-test pass is not sufficient; the rule requires ground-truth evidence that a user actually exercised the new path. Validation sequence step 2 (D3) creates that evidence by having the user drive a real session.

**Counter-metric (so we notice if the change hurts):** the 7-day rolling Again rate, interpreted with the transient-convergence period explicit.

- **Today:** 25.5 % (159 / 623 events over 2026-05-01 → 2026-05-21).
- **Steady-state target under `request_retention = 0.80`:** ~20 % (the modelled target retrievability, less = more failures).
- **Transient (first 7 days post-deploy):** **expected** to climb to ~30–35 % as long-tail caps surface at intervals where their actual retrievability has dropped below today's 0.85 threshold. This is intended convergence, not regression.
- **Regression signal:** sustained > 35 % at day 14+, OR per-cap `lapseCount` growth rate (cap's lapses-per-week) climbing > 50 % vs the prior 4-week baseline. Either signal means the regime is over-stretching intervals for the user's actual recall.

If a regression signal fires: roll back per §Rollback (request_retention to 0.85, enable_short_term back to true). The intermediate option of "keep enable_short_term=false but raise request_retention to 0.85" is also available without triggering a relearning-step recycle (since enable_short_term=false bypasses relearning_steps).

### D5. Lapsed items (the difficulty-saturated worst caps)

**No special handling.** The 5 worst caps in the snapshot have difficulty 9.5–9.8 (out of the `[1.0, 10.0]` ceiling) and stability 0.16–1.11 days. They will continue to be hard for the user. Under the new regime, they will:

- After Again, schedule for ~11 hours (vs 10 min today). Less intra-day recycling.
- Stability continues to evolve from real answers; FSRS adapts. Difficulty is already saturated for these caps, so any improvement comes from the user actually learning the cap, not from FSRS retuning.

**Honest acknowledgment of the chronic-friction outcome.** This decision deliberately keeps these caps in the user's queue, and the regime change stretches their recycle from 10 min to roughly 2–12 hours (depending on retrievability — see D1 worst-cap row) but does NOT break the loop: fail → 2-12 h recycle → fail again → 2-12 h recycle, indefinitely. The 5 worst caps will likely continue to surface in roughly every session or every other session for as long as the difficulty stays saturated, and they are likely the bulk of what the user perceives as "the same exercises". The chief user-visible win is for the rest of the pool (the 247 non-saturated caps), whose Again-recycles disappear into stability-driven intervals.

**Punted to follow-up (not in this plan's scope):** a user-driven "suspend / hide" gesture in the session UI for these chronic caps, OR a UI prompt that fires after `consecutiveFailureCount ≥ N` offering the user the choice. This was discussed during spec drafting and deferred because (a) the manual-suspend UI is a separate design problem, (b) the current plan should not bundle a UI surface change, and (c) the regime change here may be enough to make the 5 saturated caps feel like 1-2 per session rather than 5, at which point the user's tolerance might be sufficient.

Removing or auto-suspending these caps would mask the underlying pedagogic problem (the cap is genuinely hard) and risk the same user-blocker pattern that the FSRS-on-capabilities ADR (`docs/adr/0003-fsrs-schedules-capabilities-not-content-sources.md`) explicitly designs around. The right shape of the fix is user-driven, not automated.

**Rejected: reset stability for caps with difficulty > 9.5 and lapseCount > 5.**

Plausible, but see D2 last paragraph — covered there.

**Rejected: auto-suspend caps with consecutiveFailureCount ≥ 10.**

This would silently hide the user's hardest caps. The capability suspension state (`activation_state='suspended'`) exists in the schema and the Edge Function declines to commit on suspended caps (`commit-capability-answer-report/index.ts:281-283`), but suspension is an admin/user gesture, not an automated one. Don't introduce a new automation here.

### D6. Leave the `state: 2` override in place

**Picked.** The Edge Function's override of `card.state = 2` (`commit-capability-answer-report/index.ts:130-136`) becomes inert for *routing* under `enable_short_term: false`: `LongTermScheduler` converges `newState` / `learningState` / `reviewState` to the same stability-driven computation (`packages/fsrs/src/impl/long_term_scheduler.ts:11, 56`). However, the override is **not pure dead code** — it defends against the `createEmptyCard` default of `state: State.New` (`packages/fsrs/src/default.ts:155-167`) for non-dormant caps. With the override, a non-dormant cap with known stability/difficulty cannot accidentally enter the initial-stability code path inside `algorithm.next_state`. Without the override, it could.

Conclusion: leave the override in place. Removing it conflates two changes in one deploy and changes a defensive guard whose value (under `enable_short_term: false`) is subtle. Revisit in a follow-up cleanup PR after the new regime stabilises, with a separate evidence-based case for whether removing it is safe.

### D7. Fold `_shared/srs/` before or after this tuning

**Picked: tune now, fold later.** The fold target — `supabase/functions/_shared/srs/` — is LOCKED-but-unbuilt per `docs/target-architecture.md:932-979`. Two possible orderings:

- **A: Tune now, fold later.** Land the tuned constants at the current inline seam (`commit-capability-answer-report/index.ts:4-9`). The `_shared/srs/` fold (when it happens) will move them across as part of the fold scope. The folded module's `params.ts` will inherit the tuned values as its initial state.
- **B: Fold first, then tune.** Build `_shared/srs/params.ts` per the target-architecture spec, then change the constants there.

Why A: the fold is a larger refactor with its own design + review loop, and bundling a behavioural change into it would muddy the fold's correctness review. The tuning is a 4-line behavioural change at a well-defined seam. Decoupling them lets the user-visible win land sooner without adding scope to the eventual fold. Compatible with the project's general "small commits, one concern each" pattern (CLAUDE.md § Quality Over Speed).

### D8. Commit the diagnostic script

**Picked.** The diagnostic script body lives at `/tmp/fsrs-diag.ts` in the drafting session, which will not survive a reboot of the operator's machine. Commit it as `scripts/diagnostics/fsrs-state.ts` in the same PR as this spec (or as a follow-up before deploy). Source is the body in §"What's broken today" (re-listed below); the script reads `learner_capability_state` + `capability_review_events` for a given `user_id`, buckets by stability, percentile-reports `next_due - last_reviewed`, and lists the worst lapse-rate caps.

Why a `scripts/diagnostics/` directory and not a Makefile target: the script reads per-user data, so making it a Makefile target invites accidental population-wide scans. Keep it as an opt-in script invoked with a user-id argument.

## Sizing

**Lines changed:** 1 file, 4 lines in the `fsrsParams` initialiser.

```ts
// supabase/functions/commit-capability-answer-report/index.ts:4-9
const fsrsParams: FSRSParameters = {
  ...generatorParameters(),
  request_retention: 0.80,                    // was 0.85
  enable_short_term: false,                   // NEW
  learning_steps: [],                         // NEW — empty array; LongTermScheduler ignores
  relearning_steps: [],                       // NEW — empty array; LongTermScheduler ignores
  w: [0.4, 0.6, 2.4, 5.8, 4.93, 0.94, 0.86, 0.01, 1.49, 0.14, 0.94, 2.52, 0.62, 0.4, 1.26, 0.29, 2.52],
}
```

(The empty `learning_steps` and `relearning_steps` are belt-and-braces — `generatorParameters()` will substitute the defaults if they're undefined, but with `enable_short_term: false` the LongTermScheduler ignores both arrays anyway. Setting them to `[]` documents intent at the seam.)

**Deploy:** SCP + restart per D3. Three SSH commands total. Permissions assumption surfaced in Open Questions §1.

**Tests:** No automated tests exist for the Edge Function today (verified — no `commit-capability-answer-report/__tests__/` directory). The validation sequence (D3) is the test.

**Monitoring:** D4 metrics, queried via the diagnostic script committed per D8 at T+24h and T+7d.

**Diagnostic script commit:** D8 — commit `scripts/diagnostics/fsrs-state.ts` (~60 LOC) in the same PR as this spec.

**Total effort:** ~60 min — 10 min for the params edit, 5 min for the diagnostic script commit, 10 min for the SCP/restart sequence, 30 min for validation (running a real session as testuser and re-running the diagnostic). Add 30 min slack for unknown homelab permission/SSH issues if they surface.

## Rollback story

The rollback is one Edge Function re-deploy. The previous version of `commit-capability-answer-report/index.ts:4-9` (status before this plan):

```ts
const fsrsParams: FSRSParameters = {
  ...generatorParameters(),
  request_retention: 0.85,
  w: [0.4, 0.6, 2.4, 5.8, 4.93, 0.94, 0.86, 0.01, 1.49, 0.14, 0.94, 2.52, 0.62, 0.4, 1.26, 0.29, 2.52],
}
```

Rollback command sequence:

```bash
# 1. Revert the change locally
git revert <commit-sha-of-param-change>

# 2. Re-SCP + restart
scp supabase/functions/commit-capability-answer-report/index.ts \
    mrblond@master-docker:/opt/docker/appdata/supabase/functions/commit-capability-answer-report/index.ts
ssh mrblond@master-docker docker restart supabase-edge-functions
ssh mrblond@master-docker docker logs --tail 20 supabase-edge-functions
```

**RTO:** ~5 minutes if SSH + SCP work as expected. Add 10 min slack for SSH friction (key issues, network blips). The container restart itself is 5-10 seconds; in-flight answer commits during the restart fail with a transient 500, which the client surfaces and the user can retry.

**State convergence after rollback:** existing `learner_capability_state` rows retain whatever stability/difficulty values they had at rollback time. Next answers will be computed under the rolled-back params. Mirror of D2: forward-only, no migration. Caps that converged during the new-regime window will not lose their stability gains; they'll just schedule on the old (shorter) intervals.

**Worst-case scenario this rollback addresses:** the new regime drops retention below an acceptable threshold for a meaningful slice of caps, surfacing as a sustained Again rate > 35 % at day 14+. The counter-metric in D4 catches this. Rollback restores the prior schedule; no learner data is lost.

**Partial-rollback option:** if the symptom is "long-tail intervals too long but the relearning-fix is good", set `request_retention` back to 0.85 but keep `enable_short_term: false`. This restores today's median interval length while preserving the no-10-min-recycle win. Intermediate option; no special tooling needed — just edit the constant and re-deploy.

## Supabase Requirements

Per `CLAUDE.md` § Feature Design Rule, every design includes this section.

### Schema changes

- No table changes.
- No column changes.
- No RLS policy changes.
- No grant changes.

### homelab-configs changes

- [ ] PostgREST: N/A — no new schema exposure needed (no new table).
- [ ] Kong: N/A — no new CORS headers or origins needed (no new route; the existing `/functions/v1/commit-capability-answer-report` is in the Kong config).
- [ ] GoTrue: N/A — no auth config changes.
- [ ] Storage: N/A — no new buckets.

### Edge Function changes

- **`commit-capability-answer-report`** — 4-line edit in the `fsrsParams` initialiser as shown in §Sizing.

### Health check additions

- N/A — no new health checks needed. The existing `make check-supabase-deep` does not exercise the Edge Function (the function is auth-gated and per-user). The diagnostic script in §"What's broken today" is the validation tool; it is intentionally NOT a Makefile target because it is a learner-data inspection, not a deployment gate.

### Migration source-of-truth

- `scripts/migration.sql` is not touched.

## Open questions

1. **Edge-functions volume permissions on the homelab.** The deploy command sequence in D3 assumes `mrblond@master-docker` has write access to `/opt/docker/appdata/supabase/functions/commit-capability-answer-report/index.ts`. The mount is bind-mounted from the host (`docker-compose.yml:151-152`) so OS permissions, not container permissions, govern it. This is the standard SSH user for the homelab and is expected to have access, but the deploy operator should `ssh mrblond@master-docker ls -la /opt/docker/appdata/supabase/functions/commit-capability-answer-report/` before the SCP to confirm.

2. **What if a user has caps with `stability < 0.001`?** `S_MIN = 0.001` is the floor in ts-fsrs (`packages/fsrs/src/constant.ts:18`). Live snapshot shows zero caps below 0.1, so this is not a concern at present user-population scale. If a future user reaches the S_MIN floor, the long-term scheduler will schedule the interval at `0.001 · 2.40 = 0.0024 days ≈ 3.5 minutes`, which is shorter than today's 10-min relearning step. Realistically the cap would have been suspended long before this regime, but a follow-up safety floor (clamp `interval >= 1 hour`) could be added if observed. Not in scope here.

3. **Should the `state: 2` override removal ride along?** D6 says no (conflates two changes, and the override is not pure dead code). Architect review confirms the override's defensive role under `enable_short_term: false`. Open here only in case future evidence (a confirmed bug in the override path) makes removal more urgent. Default: do not remove in this plan.
