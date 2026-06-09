---
name: capability-stage
description: >-
  Run, closely monitor, auto-correct, and report on the Capability Stage (Stage
  B) of the content pipeline for ONE lesson — the stage that seeds
  learning_capabilities, item distractors, grammar exercises, cloze, and the
  typed capability tables that FSRS schedules. Use this whenever the user wants
  to "run the capability stage for lesson N", "seed capabilities for lesson N",
  "run Stage B for lesson N", "(re)generate distractors/grammar exercises for a
  lesson", "monitor the capability seeding", or asks to watch a publish's
  capability side gate-by-gate and report what landed in the DB. This is the
  focused Stage-B monitor: it dry-runs, confirms, runs live in the background
  while reporting per-phase + per-gate progress, auto-fixes transient/known
  failures, halts on real content defects, and ends with a ground-truth DB
  report. For the FULL authoring pipeline (photos → OCR → agents → both stages)
  use the `lesson-pipeline` skill instead; reach for THIS one when the lesson's
  staging already exists and the capability side is what you care about.
---

# Capability Stage monitor (Stage B)

Drive the capability stage for one lesson and be the close observer the user
wants: kick it off, watch it phase-by-phase and gate-by-gate, **alert the moment
something is wrong**, fix the things that are safe to fix, and end with a
verified report of exactly what reached the database. The deliverable is two
things: **the capabilities actually land and become schedulable**, and **a
report that shows every gate's verdict and the ground-truth DB write surface.**

## What this stage is (and what it is not)

The capability side is invoked through the publish CLI together with Stage A:

```
bun scripts/publish-approved-content.ts <N> [--dry-run] [--skip-lint]
```

There is **no standalone capability entry point** — it needs the `lesson.id`
Stage A returns. So you always run the publish command; Stage A (lesson reader
content) runs first as a fast, idempotent re-projection, then the capability
side is your focus. Everything capability-related reads its lesson content
*from the DB* Stage A just wrote (no staging file crosses the boundary — ADR
0011/0012).

**The publish CLI runs THREE writers, not two** (verify in
`scripts/publish-approved-content.ts:103-152`):

1. **Stage A** — `runLessonStage`: lesson reader content.
2. **Stage B** — `runCapabilityStage`: the **non-item** kinds — `dialogue_line`
   caps (incl. dialogue cloze, generated in-stage by `generateClozeContexts.ts`),
   `pattern`/grammar exercises (`generateGrammarExercises.ts`), `affixed_form_pairs`.
   Its post-write gate is CS7/CS8/CS9 + the dialogue/pattern validators.
3. **Stage Vocabulary** — `publishVocabulary` (`capability-stage/vocabulary/`):
   the **entire item slice** end-to-end — items, anchors, item caps, content_units,
   junction, and **item distractors** (`selectDistractors.ts` → `seedDistractors.ts`).
   The runner passes `learningItems:[]`/`candidates:[]` — it **no longer touches
   items** (cap-v2 #161 cutover). Its own **vocab gate** owns CS14–CS17/CS19/CS20.
   It runs *independently* of Stage B (a Stage B `partial` does not block it —
   `publish-approved-content.ts:128-136`) and prints a third `Stage Vocabulary:`
   report.

So "where did this distractor come from / which gate failed on this item" →
**Stage Vocabulary + the vocab gate**, not the runner. "Dialogue cloze / grammar
exercise / affixed pair" → the runner (Stage B). The ground-truth read-back
(step 4) counts by `lesson_id` and so covers all three writers regardless.

This skill assumes the lesson's **staging already exists** (the authoring agents
have run). If it doesn't, that's the `lesson-pipeline` skill's job — say so and
hand off rather than half-authoring here.

## Non-negotiables

1. **Dry-run, then confirm, then live.** The live run writes to prod Supabase
   (`api.supabase.duin.home`) and makes **billable Sonnet calls** —
   grammar-exercise + dialogue-cloze generation. (Item distractors are
   **deterministic** selection, not an LLM call — see writer 3 above.) Always run
   `--dry-run` first. **Caveat — the dry-run is NOT write- or LLM-free:**
   `publish-approved-content.ts --dry-run` runs **Stage A LIVE** (an idempotent
   lesson-content reprojection + the Haiku enrichers: grammar topics, dialogue
   translation, EN). Only the Stage B *runner* and Stage Vocabulary short-circuit
   before any capability write or Sonnet call (phase 2b). So the dry-run is free
   of *capability* writes/LLM — not free overall; never tell the user "nothing
   was written." Show the preview, then get an explicit go-ahead before the real
   run. Never publish to prod unprompted.
2. **Monitor live, don't just wait for the exit code.** Run the live publish in
   the **background**, tee its output to a logfile, and tail it so you can report
   progress as it happens and catch a stall in the slow LLM phases (5c/5d). The
   per-phase + per-gate progress IS what the user asked for.
3. **Auto-fix the known/transient; halt on real defects.** Retry rate-limit
   throws (bigger throttle), `--regenerate` a written-but-bad distractor/grammar
   set, treat fresh-lesson bootstrapping findings as expected. **Halt and alert**
   on genuine content/authoring defects (CS9 seed-integrity, CS7 parity bug, a
   real CS17 cross-lesson collision, a failed promotion) — those need an upstream
   fix, not a silent re-run. The full symptom→action table is in the reference.
4. **Report against ground truth, always.** End with the gate verdicts AND an
   independent DB read-back (`capability-readback.ts`), even on failure or abort.
   "It said ok" is not enough — query what actually landed and whether it became
   schedulable.
5. **The hard gate must pass before you call it done.** After any live
   capability publish, run `capability-readback.ts N --gate` (step 4). It writes
   `.claude/data/capability-report-N.json`; a **Stop hook blocks the session**
   if a live capability publish ran without a passing capture for that lesson.
   The decisive assertion is **no stuck-draft caps** — the `status: partial`
   silent failure. Don't work around the hook; make the gate pass (re-publish to
   promote, or `--regenerate` the bad item/pattern).

Keep `references/stage-b-internals.md` open the whole time — it has the 13-phase
map, every CS gate code, the fresh-lesson-expected flags, and the symptom→action
table. Don't reason about a finding code from memory; look it up there.

## Step 0 — preconditions (verify, don't assume)

Take the lesson number `N` from the user. Before anything:

- **Service key** — `SUPABASE_SERVICE_KEY` in `.env.local` (the DB-backed lint +
  the read-back need it). Without it the dry-run skips the lint gate and the
  read-back can't run.
- **Anthropic key** — `ANTHROPIC_API_KEY` for the in-stage generators (5c/5d).
  Absent → generation throws mid-run; catch this now, not at minute 3.
- **Staging present** — probe only the **real inputs** so you don't run on a
  lesson the agents never authored. The capability side reads its content from
  the DB, so the only required staging files are `learning-items.ts` (the item
  pool) and `grammar-patterns.ts` (the pattern seed):
  ```bash
  bun -e 'const fs=require("fs");const d=`scripts/data/staging/lesson-'"$N"'`;
  for (const f of ["learning-items.ts","grammar-patterns.ts"])
    {const p=`${d}/${f}`;console.log(fs.existsSync(p)?`✓ ${f} (${fs.statSync(p).size}b)`:`· ${f} MISSING`)}'
  ```
  **Do NOT probe `candidates.ts` / `cloze-contexts.ts`** — those are **vestigial
  empty stubs by design** now (grammar exercises + dialogue cloze + item
  distractors are generated *in-stage*, not read from staging). Every healthy
  recent lesson (e.g. L12) has them as 64–66-byte `export const x = []` stubs;
  treating that as "thin staging" would wrongly hand a fine lesson back to
  `lesson-pipeline`. Only `learning-items.ts`/`grammar-patterns.ts` missing or
  stubbed is a real "not authored yet" signal.

State your precondition conclusion in one line before running.

## Step 1 — dry-run preview

```bash
bun scripts/publish-approved-content.ts N --dry-run > /tmp/cap-N-dry.out 2>&1
bun .claude/skills/lesson-pipeline/scripts/parse-report.ts /tmp/cap-N-dry.out
```

(`parse-report.ts` from the sibling skill already extracts and summarises both
stage JSON reports — reuse it, don't re-roll the brace matcher.)

The dry-run gives you: the lint-staging verdict, Stage A pre-flight gate, Stage B
**pre-write** validators (CS3/4/4b/5/6/13), and **projected** counts. It does NOT
run the post-write gates or the generators (those are live-only). Present:

- lint-staging: `C` CRITICAL / `W` WARNING, with the `file`/`rule` of each, and
  whether any are fresh-lesson bootstrapping (→ #98, expected).
- Stage B pre-write findings by gate/severity. EN/POS warnings are expected.
- The **only projected count** is the vocab item-cap line
  (`[DRY RUN] Vocab lesson N: I items, C item caps — pre-write gate passed`).
  **Grammar-exercise and dialogue-cloze counts are NOT projectable** — they're
  generated live, so the dry-run *cannot* catch under-generation (the old
  "2 candidates for 9 patterns" check no longer applies — candidates aren't read
  from staging). That signal is the post-live per-pattern `N valid (M dropped)`
  line (step 2), not here.
- Your read of it: pre-write findings that look off (an invalid POS, a missing
  item meaning) — coverage of exercises/cloze is invisible to the dry-run.

## Step 2 — confirm, then run live in the background

After the preview, ask plainly whether to proceed with the live publish to prod
(billable LLM + prod write). Only on an explicit yes:

```bash
# background so you can monitor; tee so you can both stream and parse the end
bun scripts/publish-approved-content.ts N > /tmp/cap-N.out 2>&1 &
```

Use `run_in_background: true` on the Bash call, then poll the logfile (read
`/tmp/cap-N.out`, or `tail`/`grep` it) every so often to report progress. Map the
tail to the 13-phase table in the reference and narrate where it is:

- `✓ Level enrichment` / `✓ Dialogue translation propagation` → phase 1b done.
- **The slow, billable, rate-limit-prone work is the runner's two Sonnet
  generators** — **grammar exercises** (`► Generating grammar exercises for P
  patterns…`, then one **`<slug>: N valid (M dropped)`** line per pattern) and
  **dialogue cloze**. The per-pattern `N valid (M dropped)` line is the single
  best live quality signal — `0 dropped` is healthy; a high drop count or a
  pattern that yields few/none is the thing to flag. **Item distractors are
  deterministic (instant), NOT a slow phase.** A long gap during the Sonnet calls
  is normal (throttled 1500ms/call + SDK backoff), not a hang — but watch for an
  actual `429`/throw → auto-fix path (step 3).
- **Two promotion lines, not one.** `✓ Promoted N capabilities` from the runner
  (dialogue + pattern caps), then a second `✓ Promoted M capabilities → ready/
  published` from **Stage Vocabulary** (item caps), and the run closes with the
  `Stage Vocabulary: { … }` report block. `Skipping capability promotion
  (status=partial)` on *either* writer → a post-write gate failed (surface it).

Report each phase as it lands; don't go silent for the whole run.

## Step 3 — when something goes wrong (the correction loop)

Read the actual tail/findings; classify with the reference's symptom→action
table; act per the autonomy rule:

- **Transient (rate-limit throw):** re-run with a bigger throttle —
  `GENERATION_THROTTLE_MS=4000 bun scripts/publish-approved-content.ts N`. It's
  idempotent (only un-seeded rows regenerate). Auto-retry once; if it still
  fails, report.
- **Written-but-bad (CS15/CS16 one item, CS18 one pattern):** targeted
  destructive regenerate — `--regenerate <normalized_text>` or
  `--regenerate-pattern <slug>` — then re-verify. These are the only destructive
  paths and they're single-target.
- **Fresh-lesson bootstrapping (`blank-not-in-pool`, CS17 self-dupe on
  re-publish):** recognise as expected, do NOT mutate content, note it as "#98"
  / benign in the report.
- **Real content defect (CS9 seed-integrity, CS7 parity bug, genuine CS17
  cross-lesson collision, promotion failure):** **stop and alert.** Name the
  gate + offending rows. The fix is upstream (fix `learning-items.ts` / re-run a
  creator), not a re-publish — say so. Still produce the report up to the halt.

Never silently barrel past an error finding. A `partial` status means the rows
landed but capabilities did NOT promote (they're stuck `draft`, not
schedulable) — that is a failure to surface, not a success.

## Step 4 — ground-truth DB read-back + the hard gate

Regardless of the reported status, confirm what actually landed — and run the
**hard gate** (`--gate`), which the Stop hook enforces:

```bash
bun .claude/skills/lesson-pipeline/scripts/parse-report.ts /tmp/cap-N.out        # final declared counts + gate findings
bun .claude/skills/capability-stage/scripts/capability-readback.ts N --gate      # ground truth + ASSERT schedulable
```

`capability-readback.ts` queries `learning_capabilities` by `lesson_id` (the
schedulable spine — ADR 0006), grouped by source_kind / readiness /
**publication** status (excluding soft-retired caps), plus content_units (via
junction), capability_artifacts, grammar_patterns, exercise_variants — covering
all three writers. Plain mode prints; `--json` emits the report; **`--gate`
ASSERTS** the surface is actually schedulable and **writes
`.claude/data/capability-report-N.json` with `ok:true` only if**:

- `capabilities-exist` — the lesson has active caps,
- `no-stuck-drafts` — **zero** active caps in draft/null (the `status: partial`
  silent failure: rows written but phase-13 promotion skipped → not schedulable),
- `readback-complete` — no gateway ERR hid a count.

It exits non-zero on any failure. **A live capability publish this session that
has no passing `--gate` capture will block the Stop hook** (see Non-negotiable 5)
— that is the "no DQ slips through" guarantee. Divergence between the read-back
and the Stage B/Vocabulary `counts` is itself a flag.

## Step 5 — final report (the deliverable)

ALWAYS end with this, even on abort. Write "n/a — did not reach this" rather than
dropping a section.

```
# Lesson N capability stage — <seeded | dry-run only | partial | blocked>

## Preconditions
Service key / Anthropic key / staging present — <ok | what was missing>.

## Dry-run preview
lint-staging: <C crit / W warn — top rules; bootstrapping flagged>.
Stage B pre-write: <findings by gate/severity>. Projected counts: <…>.

## Live run — phases
The phases that ran, with the ✓/⚠ markers. Time in 5c/5d (the LLM phases).
Anything that stalled or retried.

## Gates
- Pre-write (CS3/6/13 runner; CS4/4b/5 item): <verdict + findings>.
- Runner post-write (CS7/8/9/18): <verdict + findings>.
- Vocab post-write (CS14/15/16/17/19/20/23): <verdict + findings>.
- Mark any fresh-lesson bootstrapping findings as "expected until #98".
- The decisive ones: did CS9 pass (runner)? Did BOTH promotions run (no
  `status: partial` on the runner OR Stage Vocabulary)?

## Corrections applied
What you auto-fixed (retry / --regenerate) and the outcome. "none" if clean.

## What landed in the DB (ground truth)
From capability-readback.ts: capabilities total + by source_kind + **by
publication status**, content_units, artifacts, grammar_patterns,
exercise_variants. Note any draft/unpromoted caps. Confirm vs the Stage B counts;
call out divergence.

## Flags / things that seem off
Consolidated, most severe first. Empty = "none — stage ran clean."

## Verdict
One line: is the lesson's capability surface live and schedulable, and the
recommended next action (e.g. "re-publish after fixing X", "audio is the next
step via the lesson-pipeline skill").
```

## Gotchas

- **No `timeout` on macOS.** Don't wrap commands in `timeout`/`gtimeout` — not
  installed; the command silently fails with "command not found". Just run it;
  the publish finishes on its own.
- **The dry-run is free of *capability* work, not free overall.** Stage B + Stage
  Vocabulary short-circuit at phase 2b (no capability write, no Sonnet) — but
  **Stage A still runs LIVE** in a dry-run (idempotent content reprojection +
  Haiku enrichers on a fresh lesson). Safe to run freely, but don't claim
  "nothing was written" — the *capability* side is what's previewed.
- **Re-runs are idempotent (ADR 0011).** Skip-if-exists on seeded rows, so
  re-publishing to recover from a transient/partial only regenerates the
  un-seeded surfaces. Recovery is "fix cause → re-invoke".
- **`status: partial` ≠ done.** Rows exist but promotion was skipped → not
  schedulable. Treat as a failure to fix, not a soft success.
- **Audio is not part of this stage.** The app's `audio_clips` are a separate
  post-publish step (`set-lesson-voices` → `generate-exercise-audio N`); name it
  as a follow-on, don't run it here.
