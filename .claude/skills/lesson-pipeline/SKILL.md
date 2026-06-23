---
name: lesson-pipeline
description: >-
  Run the Indonesian-lesson content pipeline end-to-end for one lesson — from
  wherever it currently is (raw photos, partial staging, or ready-to-publish)
  through every authoring agent and every quality gate to a live publish, then
  produce a full report of every step, every gate, agent performance, and what
  landed in the database. Use this whenever the user wants to "run the lesson
  pipeline", "publish lesson N", "process / build / ship lesson N end to end",
  "take lesson N to production", or asks to run the lesson through the agents
  and gates — even if they don't name the scripts or agents. Also use it to
  dry-run / validate a lesson's pipeline without publishing. This is the
  orchestrator for scripts/lib/pipeline/ + the linguist agents; prefer it over
  invoking the individual scripts/agents one at a time.
---

# Lesson pipeline orchestrator

Drive one lesson from its current state to a live publish, checking every gate,
reviewing every agent's output, and ending with a full report. You are the
conductor: you run the deterministic scripts, dispatch the authoring agents,
read what they produced, and decide whether each step is healthy before moving
on. The user wants two things above all: **the pipeline actually runs through to
a correct publish**, and **a report that shows what happened at every step,
every gate, and how each agent performed.**

## Non-negotiables

1. **Resume, don't restart.** Detect the furthest-complete artifact and run only
   what's left. Re-running a finished step wastes LLM/API budget and can
   overwrite good work. See "Detect the resume point".
2. **Confirm before the live write.** The publish writes to the live homelab
   Supabase (`api.supabase.duin.home`). Always run the full dry-run validation
   first, show the pre-flight summary, and get an explicit go-ahead before the
   real `publish-approved-content` run. Never publish to prod unprompted.
3. **Review every step, don't just check exit codes.** Each step gets a
   deterministic check (artifact exists / non-empty / exit code / parsed
   findings) AND a judgment pass (read the output; does it look right?). Flag
   anything that "seems off" even if nothing errored — that's the whole point.
4. **Report at the end, always.** Even on failure. Use the report template
   below. The report is the deliverable.

## The pipeline (resume-aware phase map)

Take the lesson number `N` from the user. These phases run in order; each
produces an artifact that marks it complete (used for resume) and feeds the
next. Commands are verified against the Makefile + `scripts/`.

**Prefer the deterministic `make` target wherever one exists** — it is
reproducible and is what the user expects to "invoke". Only **four** authoring
artifacts have *no* command and require dispatching a Claude Code agent
(marked **[agent]**); everything else is a single command (**[cmd]**). Don't
dispatch an agent for a step that has a `make` target unless the command's
output comes back thin/wrong and needs richer re-authoring.

| # | Phase | How to run | Completion artifact | Gate / review |
|---|-------|-----------|---------------------|---------------|
| 1 | Ingest photos | **[cmd]** move lesson N's raw HEIC from `~/Downloads` → `content/raw/lesson-N/` (see "Phase 1" below), then verify | `content/raw/lesson-N/*.{heic,jpg}` | exists & non-empty |
| 2 | Convert + OCR | **[cmd]** `make convert-heic LESSON=N` then `make ocr-pages LESSON=N` (OCR needs `tesseract`) | `content/extracted/lesson-N/page-*.txt` | one .txt per page, non-empty |
| 3 | Section catalog | **[cmd]** `make catalog-sections LESSON=N` (needs `ANTHROPIC_API_KEY`) | `sections-catalog.json` | valid JSON, sections tagged |
| 4 | Generate staging | **[cmd]** `make staging-files LESSON=N` | `lesson.ts`, `learning-items.ts` + **stubs** for grammar-patterns/candidates/cloze | files written |
| 5 | Structure + extract patterns | **[agent]** dispatch **linguist-structurer** (does both); `make build-sections LESSON=N` is the **[cmd]** for the structuring half *if patterns already exist* | `grammar-patterns.ts` populated, `pattern-brief.json`, structured `lesson.ts` | patterns > 0; no `body:string` grammar/exercises (scripts only stub `grammar-patterns.ts`, so a fresh lesson needs the agent) |
| 6a | Grammar exercise candidates | **[cmd]** `make generate-exercises LESSON=N` (or the **grammar-exercise-creator** agent for richer authoring) | `candidates.ts` | non-empty; coverage vs patterns (`check-exercise-coverage.ts`) |
| 6b | Vocab enrichments | **[agent]** dispatch **vocab-exercise-creator** | `vocab-enrichments.ts` | curated distractor sets, non-empty |
| 6c | Cloze contexts | **[agent]** dispatch **cloze-creator** | `cloze-contexts.ts` | coverage vs vocab items |
| 7 | Review | **[agent]** dispatch **linguist-reviewer** | `review-report.json` | criticals == 0 (or triaged) |
| 8 | Pre-flight (all gates, dry-run) | **[cmd]** `bun scripts/publish-approved-content.ts N --dry-run` (+ `lint-staging --lesson N`) | exit code + two JSON stage reports | 0 CRITICAL on the lesson-content side |
| 9 | **Confirm**, then live publish | **[cmd]** `make publish-content LESSON=N` | Stage A + Stage B JSON reports, DB rows | Stage A `ok`, Stage B `ok`/`partial` |
| 10 | Post-publish verify | **[cmd]** `scripts/verify-published.ts <lessonId>` (+ optionally `make check-supabase-deep`) | row counts by lesson_id | counts match the Stage A report |
| 11 | Audio top-up (usually a no-op) | reader audio is already done by Stage A (#168); **[cmd]** `bun scripts/generate-exercise-audio.ts N` only to backfill a gap (TTS cred absent at publish, or `exercise_variants` text) | `audio_clips` rows + storage uploads | check `audio_clips` by `generated_for_lesson_id`; top-up reports created/reused |

**Deterministic shortcut:** `make full-pipeline LESSON=N` bundles catalog (3) →
staging (4) → build-sections (5, structuring half) → generate-exercises (6a) in
one command. It does **not** cover the four **[agent]** artifacts
(grammar-pattern extraction, vocab-enrichments, cloze-contexts, review) — and
because `build-sections`/`generate-exercises` only *read* `grammar-patterns.ts`,
running `full-pipeline` on a fresh lesson whose patterns are still stubbed
yields thin/empty candidates. So on a genuinely new lesson, dispatch
**linguist-structurer** *before* `full-pipeline`. A practical resume-aware
ordering: 2–4 (cmd) → **linguist-structurer** (agent, 5) → `make generate-exercises`
(6a) → **vocab-exercise-creator** + **cloze-creator** (agents, 6b/6c) →
**linguist-reviewer** (7) → 8 → 9 → 10. The gates and publish (8–10) are fully
command-driven.

Notes:
- **Stage A** (`runLessonStage`) writes lessons/sections + the typed
  capability-contract tables + audio; its gate is the **Lesson Gate**
  (pre-write GT1/GT4/GT5/GT6/GT8/GT9/GT10 + post-write LV1/LV2). **Stage B**
  (`runCapabilityStage`) writes everything capability-related; its gate is the
  capability validators + post-write CS7/CS8/CS9. `lint-staging` is the
  capability-side pre-flight (DB-backed).
- For a **net-new lesson**, the capability side (Stage B / `lint-staging`) may
  report CRITICALs that are fresh-lesson bootstrapping artifacts (a cloze
  blanking a word that isn't in the DB pool *yet*) — these are tracked under
  epic #98 and are NOT lesson-content defects. The Lesson Gate (Stage A) is
  fresh-lesson-safe by construction. **Always separate lesson-content gate
  results from capability-side results in the report**, and flag bootstrapping
  CRITICALs as "expected for a fresh lesson until #98" rather than blockers.
- A lesson-content-only publish (no Stage B) is `bun
  scripts/publish-lesson-content.ts N` (Stage A + Lesson Gate only). Offer this
  when the user wants just the reader content, or when Stage B is blocked on a
  fresh-lesson bootstrapping issue.

## Phase 1 — ingest raw photos from Downloads

The lesson's source photos usually arrive as HEICs dropped in `~/Downloads`. The
first thing the pipeline does is move **this lesson's** HEICs into
`content/raw/lesson-N/` (phase 2's `convert-heic` reads from there).

**The catch: HEIC filenames carry no lesson number** (they're `IMG_####.heic`),
and Downloads usually holds unrelated/older HEICs too. So you must *identify* the
lesson's set before moving — never blindly `mv ~/Downloads/*.heic`.

1. List candidates with timestamps:
   ```bash
   ls -lt ~/Downloads/*.heic ~/Downloads/*.HEIC 2>/dev/null
   ```
2. Pick the lesson's batch by **recency + contiguity** — a fresh lesson's photos
   are a contiguous `IMG_####` run captured together (same day/minute cluster).
   Old one-off HEICs with unrelated dates are NOT part of it.
3. **Confirm the file list with the user before moving — by default.** Unless the
   user *explicitly named the files or the source* when they invoked the skill
   (e.g. "lesson 13's photos are IMG_1514–1521 in Downloads"), do NOT move on your
   own inference: show the batch you identified (filenames + count + timestamps)
   and ask them to verify it's the right set before moving. Always ask when
   there's any ambiguity (more than one recent cluster, a non-contiguous run, or
   stray files in range). A wrong move pollutes the lesson's OCR input — a silent
   misfire is worse than a one-line confirmation.
4. Move the confirmed set (don't glob the whole folder):
   ```bash
   mkdir -p content/raw/lesson-N
   mv ~/Downloads/IMG_1514.heic ~/Downloads/IMG_1515.heic … content/raw/lesson-N/
   ```
5. Verify: `ls content/raw/lesson-N/` shows the expected page count, non-empty.

If `content/raw/lesson-N/` is already populated (resume), there's nothing in
Downloads to ingest — skip straight to the phase-2 check. If neither Downloads
nor `content/raw` has the photos, stop and ask the user for the source images.

## Bundled helpers & gotchas

Two scripts in this skill's `scripts/` save you from hand-rolling fragile parsing
(every run otherwise re-invents them, and the brace-matching is easy to get
wrong). Run them from the repo root:

- **`bun .claude/skills/lesson-pipeline/scripts/parse-report.ts <file>`** —
  extracts the Stage A/B JSON report(s) from a saved publish stdout and prints
  status + counts + findings-by-gate/severity, and flags audio == 0. Capture the
  publish output first: `bun scripts/publish-approved-content.ts N --dry-run > /tmp/pub.out 2>&1`, then pipe/pass `/tmp/pub.out`.
- **`bun .claude/skills/lesson-pipeline/scripts/verify-published.ts <lessonId>`**
  — phase-10 read-back: counts the six lesson-content tables by `lesson_id`
  (the `lesson.id` is in the Stage A report). Corroborates LV1.

Gotchas learned the hard way:
- **No `timeout` on macOS.** Do NOT wrap commands in `timeout`/`gtimeout` — it's
  not installed and the whole command silently fails with "command not found".
  Just run the command; the publish scripts finish on their own.
- **NEVER query the DB or run the capability gate while a publish is still
  in-flight.** A live publish writes in stages (Stage A → runner → `publishVocabulary`);
  the runner's grammar caps land FIRST as `draft`, and `publishVocabulary` (vocab
  caps) + the final draft→published promotion land LAST. If you read mid-flight you
  see a *false* "0 vocab caps / 27 stuck-draft caps / status=partial" — a snapshot
  of a half-done publish, NOT a bug. A long publish is auto-backgrounded; WAIT for
  the task-completion notification (or the process to exit) before any read-back or
  `capability-readback --gate`. (Cost a long false-bug chase on L20, 2026-06-18.)
- **The dry-run (`--dry-run`) cannot validate Stage B for a fresh lesson.** Stage B
  reads lesson content *from the DB* (ADR 0011/0012); a dry-run doesn't write Stage
  A's rows, so Stage B reads empty and reports all-zero capability counts. Real
  capability output only exists after a true publish — don't read a clean dry-run as
  "caps will be fine."
- **A fresh affix/vocab lesson's caps come from TWO writers.** `runCapabilityStage`
  (the runner) writes only pattern/dialogue/affixed caps; the cap-v2 `vocabulary/`
  module `publishVocabulary` (called AFTER the runner in `publish-approved-content.ts`)
  owns ALL vocab `learning_items` + caps + distractors. Lessons published before that
  cutover kept their vocab caps (seed-once); a *fresh* publish needs both to run.
- **`learning_items` has no `introduced_by_lesson_id` column.** The item→lesson link
  is `item_contexts.source_lesson_id` (count items per lesson via that). Querying the
  non-existent column returns a null count, which looks like "0 items written."
- **Per-text audio is synthesized INSIDE Stage A, not as a separate step.** Bug
  fix #168: the Lesson Stage runner self-assigns voices
  (`setLessonVoicesForLesson` → persists `lessons.primary_voice` + `lesson_speakers`)
  and then `ensureLessonAudio` synthesizes the lesson's reader-page texts (vocab
  items + dialogue lines) into `audio_clips` via Cloud TTS — deduped against
  existing clips, budget-capped at 500. So a fresh lesson's Stage A reports
  `audioClipsSynthesised: N` (the new clips) and a re-publish reports
  `Reused: M, Synthesised: 0` (all already present). **A `Synthesised: 0` on a
  re-run is "nothing new," NOT "audio is missing"** — check `audio_clips` by
  `generated_for_lesson_id` to see the real coverage. (The old "Stage A audio is
  always 0 / it's a post-publish step" claim predates #168 — it is wrong now.)
  TTS authenticates via the **service-account file
  `~/.config/gcloud/tts-indonesian.json`** (NOT `GOOGLE_TTS_API_KEY` — that's the
  legacy `generate-section-audio.ts` path); if it's missing, Stage A's synthesis
  fails (non-fatal — the publish continues), and you backfill later. `audio_clips`
  is keyed by (normalized_text, voice_id) and **shared across lessons**, but it
  DOES carry `generated_for_lesson_id` — use that to count a lesson's coverage.
  The Capability Stage synthesizes **no** audio (pure reader, ADR 0012).
  `generate-exercise-audio.ts` (phase 11) is now a **top-up / backfill** tool, not
  the primary path — reach for it only when Stage A couldn't voice something
  (TTS credential absent at publish time, or `exercise_variants` text that exists
  only after Stage B). When Stage A already covered the content, phase 11 is a no-op.

Read `references/gates-and-agents.md` before running phases 5–10 — it has the
exact finding-code meanings, each agent's expected output, and the anomaly
signals that count as "something off". Keep it open while you review.

## Detect the resume point

Don't ask the user where to start — figure it out. Walk the artifacts for
`lesson-N` from last to first; the first one that's present-and-healthy tells
you what's done. A file existing isn't enough — a stub `candidates.ts` with an
empty array means phase 6 hasn't really run. Quick probe:

```bash
bun -e 'const fs=require("fs");const d=`scripts/data/staging/lesson-'"$N"'`;
for (const f of ["review-report.json","cloze-contexts.ts","candidates.ts","grammar-patterns.ts","lesson.ts","sections-catalog.json"])
  { const p=`${d}/${f}`; console.log(fs.existsSync(p)?`✓ ${f} (${fs.statSync(p).size}b)`:`· ${f}`)}'
```

State your conclusion ("lesson N already has staging through phase 6; resuming
at the reviewer") before running anything, so the user can redirect.

## Running each phase

- **Script phases (2–4, 8–10):** run the command, capture stdout/exit code.
  Non-zero exit → stop, diagnose, report. The publish scripts emit JSON stage
  reports — parse them (`status`, `counts`, `findings[]`).
- **Agent phases (5–7):** dispatch the named agent with the Agent tool, passing
  the lesson number and a clear task. When it returns, **read the files it wrote**
  (don't trust the summary) and apply the per-agent anomaly checks from the
  reference. Phase 6's three creators are independent — dispatch them in one
  turn so they run in parallel.
- **After every phase:** record for the report — what ran, exit/status, the key
  output (counts, file sizes), and any flags. If a deterministic check passes
  but the output looks wrong on read (e.g. 2 candidates for 9 patterns, a grammar
  rule that's actually prose, a cloze whose answer isn't in the sentence), flag
  it. Prefer flagging a false positive over missing a real problem.

## The gates (what to capture)

For the report you need each gate's verdict and findings, not just pass/fail:

- **Lesson Gate (Stage A):** from the Stage A JSON report — `status` (`ok` /
  `validation_failed` / `partial`) and `findings[]`. Group findings by `gate`
  (GT1/4/5/6/8/9/10 = pre-write; LV1/LV2 = post-write) and `severity`. In the
  pre-flight dry-run, EN + dialogue-NL completeness show as `warning` (the
  enrichers haven't run) — that's expected, not a failure.
- **lint-staging (capability pre-flight):** run `bun scripts/lint-staging.ts
  --lesson N --json` (needs `SUPABASE_SERVICE_KEY`); report `counts.critical` /
  `counts.warning` and the `file`/`rule` of each. Remember it's capability-side
  only now (lesson.ts checks moved into the Lesson Gate).
- **Capability gate (Stage B):** from the Stage B JSON report — `status` and
  `findings[]` grouped by `gate` (validators + CS7/CS8/CS9).

See `references/gates-and-agents.md` for what each code means and which are
fresh-lesson-expected.

## Confirm before publishing

After phase 8 (dry-run), present the pre-flight summary: each gate's verdict,
total CRITICAL/WARNING on the lesson-content side vs capability side, and any
anomalies you flagged. Then ask, plainly, whether to proceed with the live
publish to prod. Only on an explicit yes do you run phase 9. If the
lesson-content side has unresolved CRITICALs, recommend against publishing and
say what to fix.

## Audio (mostly done by Stage A; phase 11 is a top-up)

The app's per-text audio lives in `audio_clips` and is **primarily synthesized
inside Stage A** (bug fix #168): the Lesson Stage runner self-assigns voices
(`setLessonVoicesForLesson` → `lessons.primary_voice` + `lesson_speakers`), then
`ensureLessonAudio` voices the lesson's reader-page texts (vocab items + dialogue
lines) — deduped, budget 500, via Cloud TTS. So a normally-published lesson
**already has its reader audio** when Stage A finishes; the Capability Stage adds
**none** (pure reader, ADR 0012). Confirm coverage by querying `audio_clips` by
`generated_for_lesson_id = <lessonId>`.

**Phase 11 (`generate-exercise-audio.ts`) is therefore a TOP-UP, not the primary
path** — and is frequently a no-op. Run it only when there's a genuine gap:
- the TTS credential `~/.config/gcloud/tts-indonesian.json` was absent at publish
  time (so Stage A's synthesis failed — it's non-fatal, the publish still
  succeeds), or
- there are `exercise_variants` text rows that only exist after Stage B and want
  audio (note: typed grammar-exercise rows are NOT in `exercise_variants`, so a
  grammar-only lesson like L13 has nothing extra here).

If you do run it: `bun scripts/generate-exercise-audio.ts N` reads the lesson's
DB texts (`learning_items`, `exercise_variants`, `lesson_sections`), dedups by
(text, voice), synthesizes the missing ones, uploads, inserts `audio_clips`. Its
`--dry-run` **skips the existing-check** so it lists the whole surface as if new
— don't read its dry-run count as "clips needed"; the real new-count only shows
on a live run. It makes **real billable TTS calls** — confirm before running for
real. (Voices are already set by Stage A, so `set-lesson-voices.ts` is only
needed to re-assign them. The separate `make audio-pipeline LESSON=N` path
produces full-section *narration files* — different output, legacy
`GOOGLE_TTS_API_KEY` — usually not what you want.)

## Final report (the deliverable)

ALWAYS end with this report, even on failure or abort. Fill every section; write
"n/a — did not reach this phase" rather than dropping a section.

```
# Lesson N pipeline report — <published | dry-run only | blocked | partial>

## Resume point
Started at phase <#> (<why>). Phases run this session: <list>.

## Steps
For each phase run: phase name · command/agent · status (✓/✗/⚠) · key output
(counts, files, sizes) · anomalies flagged (or "none").

## Gates
- Lesson Gate (Stage A): <status> — pre-write GT findings: <by code/severity>;
  post-write LV1/LV2: <verdict>. (Pre-flight EN/NL warnings noted as expected.)
- lint-staging (capability pre-flight): <C CRITICAL, W WARNING> — <top rules>.
- Capability gate (Stage B): <status> — validator + CS7/CS8/CS9 findings.
Mark any capability-side CRITICALs that are fresh-lesson bootstrapping (→ #98).

## Agent performance
For each agent dispatched (structurer, the 3 creators, reviewer): ran? · output
produced (counts) · quality flags (e.g. "thin coverage: 2 candidates for 9
patterns", "review-report clean"). Call out the weakest link.

## What was published
DB write surface + counts (verify with `verify-published.ts`): lessons,
lesson_sections, the typed lesson-content tables (Stage A); content_units,
learning_capabilities, learning_items + meanings, exercise_variants,
cloze_contexts (Stage B). **Audio:** report Stage A's `audioClipsSynthesised` /
`Reused` counts — Stage A is the synthesizer (#168), so a fresh lesson shows
`Synthesised: N` and a re-publish shows `Reused: M, Synthesised: 0` (both mean
audio is present). Confirm with `audio_clips` by `generated_for_lesson_id`. Only
flag an audio gap if that count is 0 (e.g. TTS credential was absent at publish)
→ then name the top-up (`generate-exercise-audio N`, TTS via
`~/.config/gcloud/tts-indonesian.json`). For a dry-run, report projected counts
and say "not written".

## Flags / things that seem off
The consolidated list of anomalies across all steps, most severe first. Empty =
"none — pipeline ran clean."

## Verdict
One line: what state the lesson is in now and the recommended next action.
```

## When something fails

Stop at the failing phase, don't barrel on. Read the actual error / findings,
state the likely cause and the fix (the reference's failure tables map common
symptoms → fixes), and still produce the report with everything up to the
failure. A half-run pipeline with a clear report beats a silent abort. Re-runs
are idempotent (re-publish overwrites; staging regenerates), so recovery is
"fix the cause, re-invoke" — say that.
