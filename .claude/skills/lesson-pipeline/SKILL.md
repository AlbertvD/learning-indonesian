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
| 1 | Photos present | (precondition — verify only) | `content/raw/lesson-N/*.{heic,jpg}` | exists & non-empty |
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
| 11 | Audio (post-publish, optional) | **[cmd]** `bun scripts/set-lesson-voices.ts` → `bun scripts/generate-exercise-audio.ts N` | `audio_clips` rows + storage uploads | generate-exercise-audio reports clips created/reused |

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
- **Audio is a separate POST-publish step (phase 11), not part of the publish.**
  Stage A's inline audio is effectively unused for real lessons — it reads
  voices from the *staging* file, which is never populated, so it reports
  `audioClipsSynthesised`/`Reused` = 0 for every lesson. **That 0 is normal**,
  not a defect — don't alarm on it. The app's per-text `audio_clips` are
  produced post-publish by `generate-exercise-audio.ts` (see phase 11). TTS
  authenticates via the **service-account file `~/.config/gcloud/tts-indonesian.json`**
  (the main client does NOT use `GOOGLE_TTS_API_KEY` — that var is only the
  legacy `generate-section-audio.ts` path). `audio_clips` is keyed by
  (normalized_text, voice_id) and shared across lessons — it has no `lesson_id`,
  so don't count it per-lesson; use `generate-exercise-audio`'s own reported
  counts. If the key file is missing, say so plainly and treat audio as a
  deferred follow-on, not a publish blocker.

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

## Audio (phase 11 — post-publish, optional, makes real TTS calls)

The app's per-text audio lives in `audio_clips` and is produced **after** the
publish by `generate-exercise-audio.ts`, NOT by Stage A. This is how every
existing lesson got its audio. It is optional and separate — a lesson is
"published" without it; offer it as a follow-on.

Prerequisites and sequence:
1. **Credential** — the TTS client reads `~/.config/gcloud/tts-indonesian.json`
   (a Google service account). If it's absent, audio can't run — say so; it's
   not a publish blocker.
2. **Voices in the DB** — `bun scripts/set-lesson-voices.ts` writes
   `primary_voice` to the `lessons` row and the dialogue speaker→voice mapping to
   the typed `lesson_speakers` table (migration §3.5 / decision J; the old
   `lessons.dialogue_voices` jsonb column is deprecated). It reads sections from
   the DB, so the lesson must be published first. `generate-exercise-audio`
   **errors** if `primary_voice` is unset, so this must run first. Preview with
   `--dry-run`.
3. **Synthesize** — `bun scripts/generate-exercise-audio.ts N` reads the
   lesson's texts from the DB (`learning_items`, `exercise_variants`,
   `lesson_sections`), dedups by (text, voice), synthesizes the missing ones,
   uploads to storage, and inserts `audio_clips`. It prints how many clips it
   created/reused — that count is the coverage signal (you can't count
   `audio_clips` per-lesson; it has no `lesson_id`). Preview with `--dry-run`.

This makes **real, billable TTS calls** and writes to prod storage — treat it
like the publish: confirm before running it for real. Note: item/exercise audio
needs Stage B published too; on a fresh lesson where Stage B is deferred (#98),
`generate-exercise-audio` will only have `lesson_sections` text to voice. The
separate `make audio-pipeline LESSON=N` path produces full-section *narration
files* (different output, legacy `GOOGLE_TTS_API_KEY` path) — usually not what
you want for the per-text app audio.

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
cloze_contexts (Stage B). **Audio:** Stage A inline audio is always 0 (normal) —
report whether phase 11 ran and `generate-exercise-audio`'s clip count; if audio
hasn't run, say so and name the follow-on (`set-lesson-voices` →
`generate-exercise-audio N`, TTS via `~/.config/gcloud/tts-indonesian.json`). For
a dry-run, report the *projected* counts instead and say "not written".

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
