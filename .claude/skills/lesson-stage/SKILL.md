---
name: lesson-stage
description: >-
  Run, quality-check, and capture the Lesson Stage (Stage A) of the content
  pipeline for ONE lesson — the stage that writes the learner-facing reader
  content (lessons, lesson_sections, dialogue lines, the typed grammar /
  item / affixed-pair contract tables, audio_clips) and certifies it with the
  self-contained Lesson Gate. At the end it produces the lesson's grammar
  audio-recording script (audio-scripts/SD L<N>.txt), the same artifact the
  other lessons have, ready for you to record narration from. Use this whenever
  the user wants to "run stage a for lesson N", "publish just the lesson /
  reader content", "(re)generate the grammar recording script / audio script
  for lesson N", "check the lesson gate for lesson N", or wants the reader
  content live + verified WITHOUT seeding capabilities. It is deterministic by
  design: a single orchestrator script runs the publish, asserts every gate,
  reads the DB back for parity, generates + coverage-checks the grammar txt, and
  writes a machine-readable capture that a Stop hook enforces — so no
  data-quality gap reaches "done". For the capability side (Stage B / vocab) use
  `capability-stage`; for the FULL authoring pipeline (photos → OCR → agents →
  both stages) use `lesson-pipeline`.
---

# Lesson Stage runner (Stage A) + grammar audio script

Drive Stage A for one lesson to a verified, captured finish. The deliverables
are three: **the reader content lands and the Lesson Gate certifies it**, **the
grammar audio-recording script (`SD L<N>.txt`) is generated and proven to cover
every grammar section**, and **a capture report that records every gate verdict
and DB parity check** so nothing silently drifts.

This skill is **deterministic on purpose.** The happy path is one orchestrator
script — you do not hand-roll the steps or eyeball the gates. You run the
orchestrator, read its machine verdict, and interpret only when it fails.

## What this stage is (and is not)

Stage A = `runLessonStage` (`scripts/lib/pipeline/lesson-stage/`), reached via the
**Stage-A-only** entry point:

```
bun scripts/publish-lesson-content.ts <N> [--dry-run]
```

It writes ONLY the lesson reader content + runs the **Lesson Gate** (ADR 0013).
Stage B (capabilities) and the separate Stage Vocabulary writer are **not** run.
Lesson content is an idempotent DB projection of the staging files (ADR 0011) —
re-publishing overwrites cleanly, there is no rollback, daily backups are the
safety net.

**Boundaries:**
- It assumes the lesson's **staging exists** (`scripts/data/staging/lesson-N/lesson.ts`
  is structured). If it doesn't, that's `lesson-pipeline`'s job — hand off.
- It does **not** seed capabilities. After Stage A the lesson is *readable* but
  not yet *schedulable* — `capability-stage` is the follow-on.
- The grammar txt reads grammar `lesson_sections` **from the DB**, so it only
  works **after** a live Stage A has written them.

## The orchestrator (your one command)

```
bun .claude/skills/lesson-stage/scripts/run-stage-a.ts <N> [--dry-run]
```

It is a thin composition over the canonical scripts (`publish-lesson-content.ts`
+ `generate-grammar-audio-script.ts`) plus an independent DB read-back. It runs
every check as a scripted assertion and writes a capture to
**`audio-scripts/SD L<N>.report.json`**, exiting `0` only if **every** check
passed. The checks:

| Check | What it asserts |
|---|---|
| `lesson-gate-status` | Stage A report `status == ok` |
| `lesson-gate-no-errors` | zero `severity:error` findings (GT1/4/5/6/8/9/10 pre-write + LV1/LV2 post-write) |
| `db-readback-parity` | each of the 6 lesson-content tables has DB rows ≥ the report's declared count (independent of the publish's own LV1) |
| `grammar-audio-file` | `SD L<N>.txt` exists and is non-empty (when the lesson has grammar) |
| `grammar-section-coverage` | the txt emitted exactly as many grammar sections as the DB holds |
| `grammar-no-silent-drops` | the generator printed **no** `content NOT emitted` warnings (a silent content drop is the DQ failure we refuse) |

In `--dry-run` it runs the pre-write gate preview only (no DB write, no readback,
no grammar txt) and writes a `mode:"dry-run"` capture.

## Non-negotiables

1. **Dry-run, then confirm, then live.** A live run writes to prod Supabase
   (`api.supabase.duin.home`) and makes billable enricher calls (EN/NL/grammar
   topics, Haiku). Always run `--dry-run` first, show the preview, and get an
   explicit go-ahead before the live run. Never publish to prod unprompted.
   - **Caveat (important):** unlike the dry-run on the *full* publish CLI, THIS
     orchestrator's `--dry-run` truly writes nothing — it calls
     `publish-lesson-content.ts --dry-run`, which runs `runLessonStage` with
     `dryRun:true`. (The `publish-approved-content.ts` dry-run, by contrast, runs
     Stage A *live*. Don't confuse the two.)
2. **Trust the capture, not the vibe.** The orchestrator's exit code and the
   `ok` field of `SD L<N>.report.json` are the verdict. If it says a gate
   failed, it failed — read the finding, don't rationalise it green.
3. **The capture must exist and be `ok:true` before you call it done.** A Stop
   hook blocks the session if a live Stage A ran this session without a complete,
   passing capture (and a non-empty grammar txt). That is the "no DQ slips
   through" guarantee — let it do its job; don't work around it.
4. **Report against ground truth, always** — even on failure. End with the gate
   verdicts AND the DB read-back numbers from the capture.

## Step 0 — preconditions (verify, don't assume)

Take the lesson number `N`. Before running:

- **Service key** — `SUPABASE_SERVICE_KEY` in `.env.local` (DB read-back).
- **Anthropic key** — `ANTHROPIC_API_KEY` (the live Lesson Stage enrichers). The
  orchestrator aborts before any write if it's missing on a live run.
- **Staging present + structured** — the lesson's `lesson.ts` exists and has no
  unstructured `body:string` grammar/exercise sections:
  ```bash
  bun -e 'const fs=require("fs");const p=`scripts/data/staging/lesson-'"$N"'/lesson.ts`;
    console.log(fs.existsSync(p)?`✓ lesson.ts (${fs.statSync(p).size}b)`:"· lesson.ts MISSING — hand off to lesson-pipeline")'
  ```

State your precondition conclusion in one line before running.

## Step 1 — dry-run preview

```bash
bun .claude/skills/lesson-stage/scripts/run-stage-a.ts N --dry-run
```

Present the pre-write gate verdict and the projected counts. In dry-run, the
EN/NL/dialogue completeness gates (GT8/GT9) are relaxed to warnings (the
enrichers haven't run) — that's expected, not a blocker. Flag anything that
looks off (e.g. 0 sections, a grammar gate error).

## Step 2 — confirm, then run live

Ask plainly whether to proceed with the live publish to prod. Only on an
explicit yes:

```bash
bun .claude/skills/lesson-stage/scripts/run-stage-a.ts N
```

This is fast (no slow LLM generation — only the lightweight Haiku enrichers), so
it normally finishes in under a minute; you don't need to background it. Read the
per-check ✓/✗ lines as they print.

## Step 3 — when a check fails (the correction loop)

The orchestrator exits non-zero and the capture's failing check names the cause.
Classify and act:

| Failing check | Likely cause | Fix |
|---|---|---|
| `lesson-gate-status` / `lesson-gate-no-errors` GT1 | grammar section has empty/prefixed `grammar_topics` | re-run the enricher (check `ANTHROPIC_API_KEY`); persistent → the grammar section was never structured → `linguist-structurer` |
| GT9 EN error (live) | EN enricher didn't fill `l2`/`title_en`/`rules_en` | re-run live (idempotent); persistent → hand-author EN in `lesson.ts` |
| GT5/GT6/GT8/GT10 | malformed section shape / missing item field / unstructured grammar body | fix the staging `lesson.ts` row named in the finding |
| `db-readback-parity` | a write didn't land | re-publish (idempotent); inspect the named table |
| `grammar-section-coverage` / `grammar-no-silent-drops` | the grammar generator hit an unhandled content field and dropped it | add the field to the script's known-keys, or fix the section's shape in `lesson.ts`, then re-run |

Re-runs are idempotent — recovery is always "fix the cause → re-invoke the
orchestrator". Never hand-edit the DB to make a check pass.

## Step 4 — final report (the deliverable)

ALWAYS end with this, even on abort. Write "n/a — did not reach this" rather than
dropping a section.

```
# Lesson N — Stage A <published+captured | dry-run only | blocked | partial>

## Preconditions
Service key / Anthropic key / staging structured — <ok | what was missing>.

## Lesson Gate
status=<ok|…>; pre-write GT findings <by code/severity>; post-write LV1/LV2
<verdict>. (Dry-run EN/NL warnings noted as expected.)

## DB read-back (ground truth)
The 6 lesson-content tables: <table: db/declared …>. Parity <ok | divergence>.

## Grammar audio script
SD L<N>.txt — <generated: G sections, L lines | not generated (no grammar | did
not reach)>. Silent drops: <none | the warnings>. Ready to record: <yes/no>.

## Capture
audio-scripts/SD L<N>.report.json — ok=<true|false>. <one line>.

## Flags / things that seem off
Most severe first. Empty = "none — Stage A ran clean."

## Verdict
One line: reader content state + the grammar script's readiness + the next step
(usually: "capabilities are the follow-on via the capability-stage skill").
```

## Gotchas

- **No `timeout` on macOS** — don't wrap commands in `timeout`/`gtimeout` (not
  installed; silently fails). Just run them.
- **The capture file is load-bearing** — the Stop hook reads
  `audio-scripts/SD L<N>.report.json`. Don't delete it mid-session or the hook
  will (correctly) consider the capture incomplete.
- **Audio recording is downstream** — this skill produces the *text* the human
  records from (`SD L<N>.txt`). The app's per-text `audio_clips` are a different
  surface, produced by `generate-exercise-audio.ts` after Stage B (see
  `lesson-pipeline` phase 11), not here.
- **`SD L<N>.txt` is DB-sourced** — it reflects what Stage A wrote, so always
  regenerate it (the orchestrator does) after re-publishing the lesson content.
