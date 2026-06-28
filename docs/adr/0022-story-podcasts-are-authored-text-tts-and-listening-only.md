# Story podcasts are authored-text→TTS, leveled, and listening-only

- **Status:** accepted (2026-06-27)
- **Context:** design grill `docs/plans/` (forthcoming spec); pairs with `CONTEXT.md` → "Story podcast (listening content)".

## Context

The app already produces **grammar podcasts** — two-host NotebookLM "Kamoe Bisa" episodes, one per lesson, attached via `lessons.audio_path` (the `feat/grammar-podcast-pipeline` work). Separately, roadmap §B #4 wants a *listening* channel: leveled (A1–B2) **story** podcasts the learner picks by level to practise hearing Indonesian, reading along in their chosen language. The two share the word "podcast" but are different content with different production needs, so the design choices below are non-obvious and worth recording.

## Decision

A **story podcast** is:

1. **Authored-text → TTS**, *not* NotebookLM. An LLM writes the exact Indonesian script; we synthesise audio from it (Google Chirp3-HD or Gemini 2.5 TTS — settled by a by-ear bake-off). The audio is therefore **word-for-word the transcript**.
2. **Leveled and shared.** Authored at a fixed CEFR level; one episode per (level, topic) serves every learner; pre-seeded into `podcasts` + the `indonesian-podcasts` bucket. Never generated per-user at runtime.
3. **Comprehensible by lexical coverage.** The author leans on the app's vocabulary at the target level (`learning_items`, level ≤ target) as a *soft* anchor, targeting **~95% known-word coverage** (the research threshold for adequate listening comprehension; van Zeeland & Schmitt 2013) — a prompt target, not an enforced whitelist.
4. **Listening-only.** Not wired into capabilities / FSRS. The transcript→core-vocab *harvest* loop (roadmap #4 "PLUS") is a separate, deferred feature and must never gate the listen surface.
5. **Read-along.** The transcript is stored **sentence-aligned across ID / NL / EN** (`transcript_segments`), defaulting the reader to **Indonesian** (audio stays load-bearing), with Dutch available on demand.

## Considered and rejected

- **Reuse NotebookLM (as the grammar pipeline does).** Rejected: NotebookLM *improvises* two hosts from a briefing and gives no control over the exact words or level — you'd transcribe *after*, and the transcript would never match the audio. Fatal for a leveled read-along surface. (Accepting NotebookLM for grammar but TTS for stories means the app deliberately runs **two audio engines** — that is the surprise this ADR exists to explain.)
- **Per-user personalized stories** (generate from a learner's mastered words). Rejected: per-use runtime AI cost, can't pre-seed, and breaks the north-star content model (content flows homelab→cloud by re-publish from git, learner data never crosses). The comprehensibility benefit is delivered well enough by per-level coverage.
- **Bundle the transcript→vocab harvest into this feature.** Rejected: it pulls the capability/FSRS data model in, and — per the affective-filter research — bolting testing onto extensive listening removes the very thing that makes it work. Kept separate and deferred.
- **Karaoke audio-sync now** (auto-highlight the current line). Deferred: true timepoints aren't wired and would lock the engine to Chirp3-HD (Gemini TTS returns no timestamps), killing the bake-off for ~20% of the felt value. Sentence-level read-along (no sync) delivers the rest cheaply.

## Amendment (2026-06-27) — sourcing & attribution

Story content may be **either LLM-invented or adapted from an openly-licensed public-domain
source** (the pipeline's author step has an *adapt* mode that grades a source story down to the
target CEFR level). Decisions:

- **Prefer CC-BY** (StoryWeaver, Let's Read, Global Digital Library) over **CC-BY-SA** (Wikibooks
  dongeng) for durable content: CC-BY-SA's share-alike would force our derivative audio/translations
  to carry the same open license — awkward for the Phase-2 paid app. CC-BY-SA is fine for the
  build-stage personal instance; treat the swap to CC-BY as a pre-monetization task.
- **Attribution is mandatory and stored.** Sourced episodes carry a `PodcastAttribution`
  (`{source_title, source_url, author, license, license_url}`) in a new nullable `podcasts.attribution`
  JSONB column (data-architect-resolved, same reasoning as `transcript_segments`), and the reader
  **must display** the credit — a CC-BY/SA legal requirement, enforced by a pre-write guard
  (sourced episode ⇒ complete attribution) rather than a DB health check.
- The pipeline does **not** scrape per-platform; the operator provides the source as a local text
  file (CC-BY platforms are JS apps / API-blocked).

## Amendment (2026-06-28) — timed follow-along (rung C) via STT word-offsets

This ADR originally **deferred** karaoke audio-sync, reasoning that "true timepoints aren't
wired and would lock the engine to Chirp3-HD (Gemini TTS returns no timestamps)." A design grill
plus an empirical probe against the live service account showed that reasoning was **doubly
wrong**, and the deferral is now reversed for the **sentence-level** highlight:

- **The TTS engine cannot supply timings at all on our voice.** Google Cloud TTS
  `enableTimePointing: ['SSML_MARK']` is a **`v1beta1`-only** field (the `v1` endpoint we call
  rejects it), and on **Chirp3-HD it returns `timepoints: []`** — the warm storyteller voice the
  pipeline is built on emits *no* timepoints. (Wavenet returns real ones, but switching would cost
  the voice.) So timings cannot come from the synthesizer, regardless of engine bake-off.
- **Timings come from ASR, not TTS.** We synthesise on Chirp3-HD unchanged, then run the audio
  through **Google Speech-to-Text `longrunningrecognize` with `enableWordTimeOffsets`** and align
  the recognised words to the *known* script. Probed live: `longrunningrecognize` accepts **inline
  base64** at our ~90s episode length (**no GCS bucket needed**) and returns clean per-word
  `{word, startTime, endTime}` (recognition is near-perfect because it's pristine TTS audio of text
  we authored). This **does not** lock or change the TTS engine — the bake-off question is moot for
  timing, and is independently retired only because Chirp3-HD already won by ear.
- **Schema.** Each `TranscriptSegment` gains `words: { word: string; start: number; end: number }[]`
  (the universal ASR / read-along shape; JSON-in-DB because the reader renders a custom highlight,
  not WebVTT `<track>` captions). Additive to the existing `transcript_segments` JSONB — **no
  migration**. A sentence's start derives as `words[0].start`.
- **Scope.** **Word-level following is the goal** (operator-stated): each word highlights as it is
  spoken, driven by `<audio onTimeUpdate>` against the stored per-word `start`/`end`. Sentences are
  the visual grouping and the click-to-seek target. (Word-level is tractable precisely *because* STT
  supplies per-word offsets — the old "needs forced alignment" objection does not apply.) Re-timing
  the already-live episodes needs **no re-synthesis** — STT runs over the existing bucket audio
  (zero Gemini/TTS calls), via a `--retime` flag on `run.ts` beside the existing `--resume`.
  needs **no re-synthesis** — STT runs over the existing bucket audio (zero Gemini/TTS calls), via a
  `--retime` flag on `run.ts` beside the existing `--resume`.
- **Prerequisite.** Speech-to-Text must be enabled (and billing attached) on the TTS Cloud project
  `hassio-integration-5a907`; usage is within the free tier. The reader degrades gracefully when a
  row lacks `words` (static segmented lines, then the legacy prose blob).

## Consequences

- The codebase intentionally has **two podcast audio paths**: NotebookLM (grammar, per-lesson, `lessons.audio_path`) and authored-text→TTS (story, `podcasts` table). A future reader should not "unify" them — the read-along fidelity requirement is the reason.
- `podcasts` gains a **`transcript_segments JSONB`** column (sentence-aligned ID/NL/EN); the existing `transcript_*` text columns stay as denormalized full-text so the current 3-tab reader keeps working until the segmented read-along reader lands.
- The pipeline runs on **Gemini** (author + translate + grade + TTS) via the existing `GEMINI_API_KEY`, avoiding the Anthropic credit fragility that stalled the grammar pipeline. Swapping the author step to Claude later is a one-function change.
- **Pedagogy is a prompt/sequencing concern, not new mechanism:** ~95% coverage target, ID-default read-along, theme-clustered batches (narrow listening), level-graded speech rate/pause/length, ungraded surface, short advance organizer.
