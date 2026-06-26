---
status: approved
reviewed_by: [architect, data-architect]
supersedes: []
---

# Grammar Podcast Pipeline — automated per-lesson grammar audio (Kamoe Bisa)

## Problem

Each lesson page has a grammar-audio band (`lessons.audio_path` → reader's
`meta.lesson_audio_url`, played in `LessonAudioPlayer`). The audio currently
sitting there was made ad-hoc in NotebookLM; the hosts say **the wrong app name
or none at all**, because nothing constrained the source/branding. We now have a
product name — **Kamoe Bisa** — and want to **regenerate every lesson's grammar
audio from scratch**, as a **two-host podcast that clearly explains that
lesson's grammar**, in **both Dutch and English**, fully automated.

Scope: **30 lessons × 2 languages = 60 episodes.**

## Operating-context check

Pre-launch, single learner, disposable data (CLAUDE.md Operating Context). So:
no live-migration choreography — we **truncate the old grammar-audio paths and
rebuild**. The only durable constraint that matters is NotebookLM's **daily
generation cap**, which forces a resumable, multi-day script (a real
requirement, not live-system safety).

## Architecture grounding (required pre-draft check)

- **Reader surface = baked `content.json`, NOT a runtime adapter.** Each bespoke
  lesson page imports a **committed static** `src/pages/lessons/lesson-N/content.json`
  and renders `content.meta.lesson_audio_url` in the audio band, guarded on that
  value, via `LessonAudioPlayer` (`lesson-19/Page.tsx:24,30,291`;
  `src/components/lessons/LessonAudioPlayer.tsx`). No runtime DB read happens on
  the page. **Verified (both review rounds + direct read):** `src/lib/lessons/adapter.ts`
  has **no** `lesson_audio_url` mapping and feeds only the Lessons overview tiles
  (which render no audio player); `lessonService.getAudioUrl`
  (`src/services/lessonService.ts:18-23`) is **not** on the lesson-band path (its
  only live caller is `Podcast.tsx` via `podcastService`). An earlier draft of
  this plan mis-cited both as the seam — they are not.
- **The real writer of `lesson_audio_url`** is `scripts/fetch-lesson-content.ts`:
  it reads `lessons.audio_path` (`:50`), builds the public **`indonesian-lessons`**
  bucket URL (`:60-62`), and emits it as `meta.lesson_audio_url` (`:201`) into the
  per-lesson `content.json`. So "publish into the app" = extend this script to
  also emit the EN URL, then **regenerate each `content.json`** — the same
  re-fetch step any content update already requires. This is the content-pipeline
  seam, and it does **not** add code to `lib/audio` (out of scope per
  `docs/target-architecture.md:832`) nor to any folded file.
- **Language source.** The bespoke pages read no language today. The app-wide
  current language is `useAuthStore((s) => s.profile?.language ?? 'nl')`
  (`authStore.ts:198`; consumed e.g. `src/hooks/useT.ts:6`, `StreakBar.tsx:25`).
  The audio band selects `lang === 'en' ? meta.lesson_audio_url_en :
  meta.lesson_audio_url` using that selector.
- **podcastService stays untouched.** The `podcasts` table / Podcasts page hold
  the separate *story* podcasts (`docs/target-architecture.md:1036-1055`). These
  grammar episodes are lesson-bound, so they live on the lesson, not in
  `podcasts`. No constraint in target architecture blocks this.
- **Source extraction already exists.** `scripts/generate-grammar-audio-script.ts`
  already reads each lesson's grammar `lesson_sections` from the live DB and emits
  verbatim grammar text (`SD L<N>.txt`). We reuse this extractor to produce the
  NotebookLM source briefings — no new grammar-extraction mechanism.

## Design

### 1. Source briefings (deterministic, from the DB)

Reuse the grammar extractor to emit, per lesson, **two** briefing documents:

- **NL briefing** — Dutch rules + Indonesian examples (what `SD L<N>.txt`
  already contains).
- **EN briefing** — the English grammar enrichment already in the DB
  (`title_en` / `rules_en` on the grammar categories; both are populated by the
  Lesson Stage enricher and currently *excluded* from `SD L<N>.txt` by design —
  see `generate-grammar-audio-script.ts:8-10`) + the Indonesian examples.

Plus two **non-speculative** additions (no LLM-invented grammar):
- **English example glosses** in the EN briefing. The DB has `rules_en` (rule
  text) but the *examples* are glossed in Dutch only (`examples: [{indonesian,
  dutch, note}]` — no English field, confirmed in the extractor's
  `KNOWN_CATEGORY_KEYS`). The EN briefing needs English glosses so the EN hosts
  don't read Dutch. Source order: reuse a DB English meaning if one exists, else a
  bounded translate-the-gloss step (translation only, not grammar authoring).
- **A deterministic framing header** per briefing: lesson title + the lesson's
  **CEFR level** (`lessons.level`) + the list of grammar-topic titles this episode
  covers + the audience line. Assembled from the DB — orients NotebookLM, invents
  nothing. The level travels into the instruction prompt (§2) so the hosts pitch
  to it.

These are plain text/markdown files under `content/grammar-briefings/`
(gitignored, like other generated content dirs). They are the NotebookLM
*source*, nothing else. Deterministic selection from existing data + the two
additions above — no LLM grammar authoring in this step (Minimum Mechanism:
deterministic > LLM). The briefing is built **from the verified grammar** (see
§Content quality system, Phase 0).

### 2. Generate via NotebookLM (`notebooklm-py`)

A standalone **Python** tool (Python because `notebooklm-py` is Python; the rest
of the pipeline is Bun/TS — documented deviation, the tool exists only because
the library is Python). Auth: one-time `notebooklm login` (Google account,
cookies reused). Per (lesson, language):

1. `client.notebooks.create("Kamoe Bisa — Les {N} grammatica ({LANG})")`
2. upload the matching briefing as a source
3. `generate_audio(nb_id, instructions=<prompt>, language=<nl|en>)` — wait for
   completion
4. `download_audio(nb_id, <local mp3>)`

**Branding/focus prompts (language-specific, not translations):**

`{level}` below is the lesson's CEFR level from `lessons.level` (A1/A2/B1/B2),
injected per episode.

> **NL:** *"Jullie zijn de twee vaste presentatoren van Kamoe Bisa, een podcast
> die Nederlandstaligen helpt Indonesisch te leren. Deze aflevering behandelt de
> grammatica van les {N}: '{titel}'. Begin met een begroeting en noem de show —
> 'Welkom terug bij Kamoe Bisa' (spreek 'Kamoe Bisa' uit als ka-moe bie-sa). Leg
> elk grammaticapunt uit het bronmateriaal helder en gedetailleerd uit, met de
> Indonesische voorbeelden. **Dit is een les op niveau {level} (ERK): houd de
> uitleg, woordenschat en voorbeelden passend bij een {level}-leerder; introduceer
> geen grammatica of woordenschat boven dat niveau.** Neem de tijd en sla geen
> enkel punt over. Houd het warm en bemoedigend. Spreek volledig in het
> Nederlands. Noem Google, NotebookLM of andere product- of bronnamen niet."*

> **EN:** *"You are the two regular hosts of Kamoe Bisa, a podcast for learning
> Indonesian. This episode covers the grammar of Lesson {N}: '{title}'. Open by
> greeting listeners and naming the show — 'Welcome back to Kamoe Bisa'
> (pronounce 'Kamoe Bisa' as kah-moo bee-sah). Explain every grammar point in the
> source document clearly and in detail, with the Indonesian examples. **This is a
> CEFR {level} lesson: keep the explanation, vocabulary and examples appropriate
> for a {level} learner; do not introduce grammar or vocabulary beyond that
> level.** Take your time and don't skip any point. Keep it warm and encouraging.
> Speak entirely in English. Do not mention Google, NotebookLM, or any other
> product or source name."*

The final "do not name any other product/source" line is the direct fix for the
wrong/missing-name defect.

### 3. Publish into the app

Publishing one episode is a **four-step chain** (the DB column alone is inert —
the page reads baked JSON, not the DB):

1. **Upload** the MP3 to the **`indonesian-lessons`** bucket at a deterministic
   path (e.g. `grammar/lesson-{N}-{lang}.mp3`), `upsert: true` so re-runs
   overwrite the same object (no delete grant needed).
2. **Set the DB column:** `lessons.audio_path` = NL episode path,
   `lessons.audio_path_en` = EN episode path (new column, §Supabase).
3. **Bake the URL into `content.json`:** extend `scripts/fetch-lesson-content.ts`
   to also `select` `audio_path_en`, build the EN bucket URL (mirror `:60-62`),
   and emit `meta.lesson_audio_url_en` (mirror `:201`); then re-run it for the
   lesson to regenerate `src/pages/lessons/lesson-N/content.json`. **Without this
   step the player never sees the audio.**
4. **Page band selects by language:** each bespoke page's audio band reads
   `useAuthStore((s) => s.profile?.language ?? 'nl')` and plays
   `lang === 'en' ? meta.lesson_audio_url_en : meta.lesson_audio_url`. The band
   already self-guards on a non-null URL (`lesson-19/Page.tsx:291`).

To keep step 4 from being 30 divergent edits, extract the band into a single
shared component — `LessonGrammarAudioBand` — and swap each page's inline band
block for it. **The inline bands are NOT identical**, so the component must absorb
the divergence rather than flatten it: ~18 pages pass
`voice={meta.primary_voice ?? undefined}`, ~12 (lessons 3–12, 17) pass only
`src`, and lesson-12 additionally renders a label (`Uitleg bij de grammatica ·
audio`, `lesson-12/Page.tsx:323-330`) with per-page CSS-module styling
(`audioBand`/`audioInner`/`audioLabel`, `lesson-12/Page.module.css:118-120`).
Component contract:

```
LessonGrammarAudioBand({
  nl?: string | null,        // meta.lesson_audio_url      (may be ABSENT pre-rebake, not just null)
  en?: string | null,        // meta.lesson_audio_url_en
  voice?: string,            // meta.primary_voice
  label?: string,            // optional caption (lesson-12)
  className?: string,        // per-page band styling
})
```

It reads the language selector, picks `lang === 'en' ? en : nl`, and renders
nothing when the chosen URL is absent/null. Both URL props are **optional** —
un-re-baked lessons simply have no `lesson_audio_url_en` key in `content.json`, so
the prop is `undefined`, not `null`. ~30 swaps, mechanical but not verbatim;
**apply from the main thread, not a code subagent** (the read-before-edit hook
blocks subagent edits — MEMORY `project_subagent_edit_hook_transcript_fault`).

### 4. Long-running, resumable, self-throttling orchestration

- **DB is the to-do list.** "Done" = the relevant path column is non-null. Each
  pass queries the (lesson, language) episodes still missing audio. No
  drift-prone side-state file.
- **Ordering:** **all NL first (lessons 1→30), then all EN** — queue sorts by
  `(language: nl before en, then order_index)`.
- **Daily cap:** `--max-per-day N` and also **detect** NotebookLM's rate-limit
  error and stop the day cleanly.
- **Modes:** plain run does one day's quota and exits (cron-friendly, the simple
  core). `--loop` wraps that exact core in a sleep-until-next-day repeat so it can
  be left running for the multi-day grind. Kept thin deliberately — it is *only*
  the sleep wrapper over the resumable single-run core, not a stateful daemon
  (reviewer flagged a daemon as over-mechanism; the user explicitly asked for a
  long-running script, so the one-line-reason deviation is: keep the long-running
  affordance but implement it as the trivial sleep-loop, not new state).
- **Restart-safe:** progress is the DB; kill/reboot → restart → resumes, no
  double-generation.
- **Regenerate-from-scratch:** `--regenerate <lessons|--all>` nulls the path
  columns → those episodes re-enter the to-do list; the next generation
  **overwrites** the same bucket object (`upsert`) and re-bakes `content.json`. No
  bucket-delete grant required.
- **Per-episode log/report:** lesson, language, generated?, duration, failures
  to retry. NotebookLM is unofficial/fragile, so a single lesson's failure is
  logged and skipped — never crashes the batch.

## Content quality system

Two independent gates: **input** (is the grammar we feed NotebookLM *correct*?)
and **output** (does the episode *faithfully teach it* with the right branding?).
The input gate runs **once per lesson** (grammar is static — not a per-episode
cost); the output gate runs **per generated episode**.

### Phase 0 — grammar verification (input gate, before any audio)

Runs before generation; **also improves the lesson reader**, since corrections
land at source. Effectively a whole-app grammar audit gated in front of the
podcast run.

1. **Automated cross-check vs TBBBI + KBBI** (free, official, legitimately
   fetchable Indonesian-government authorities — Sneddon is copyrighted and is
   **not** used by the automated layer). A per-lesson agent (reuse the
   web-enabled `grammar-exercise-creator` / `linguist-reviewer` agent surface)
   reads the lesson's grammar from the DB and checks each claim against
   **TBBBI** (`acuanbahasa.kemdikbud.go.id`, rules) and **KBBI**
   (`kbbi.kemdikbud.go.id`, word-level). Output: a structured per-lesson report
   — each grammar claim marked confirmed / wrong / incomplete, with the **specific
   TBBBI/KBBI citation** behind each verdict. Written to
   `content/grammar-review/lesson-N.tbbbi.json` (gitignored).
   - **Level guard.** The agent is given the lesson's `lessons.level` (A1/A2/B1/B2)
     and verifies *correctness only* — it must **not escalate the level**. Any
     "improvement" that would add grammar/vocabulary beyond the lesson's CEFR level
     is **flagged, not applied**; corrections fix errors and fill same-level gaps,
     never raise difficulty. (CEFR rubric: MEMORY
     `project_cefr_level_rubric_reassessment`.) The Sneddon worksheet carries the
     same instruction.
2. **Human Sneddon review — every lesson** (not only flagged items). The pipeline
   emits a per-lesson **worksheet** `content/grammar-review/lesson-N.sneddon.md`
   listing each grammar topic + its rules + examples (from the DB) with a verdict
   field per claim. The author works through it against their **own legitimate
   Sneddon copy** and records corrections in their own words.
   - *Copyright boundary (load-bearing):* facts/rules are not copyrightable, only
     Sneddon's expression is. The pipeline **never ingests or stores Sneddon
     text** — Sneddon is a reference the human consults; only own-words
     corrections (and our own example sentences) re-enter the data. No Sneddon
     sentence/example is copied verbatim.
3. **Apply fixes at source.** Confirmed corrections (from both 1 and 2) are edited
   into the **staging** `scripts/data/staging/lesson-N/lesson.ts` grammar — under
   `content.categories` (NOT `grammar_topics`, which is enricher-owned and
   overwritten; MEMORY `project_grammar_categories_key_not_grammar_topics`), per
   the lesson-content **pipeline-is-writer** regime (ADR 0011; MEMORY
   `feedback_pipeline_is_writer_not_db`). A **re-publish** of the corrected
   lessons (Lesson Stage) propagates the fix to the DB → reader → `SD L<N>.txt` →
   the podcast briefing. Direct DB edits are **not** used for lesson grammar.
   **Ordering:** edit staging → re-publish the lesson → *only then* run
   `build-briefings.ts` (the briefing reads the corrected grammar from the DB; a
   briefing built before re-publish reflects the old grammar — m1).
   - *Omission test:* without "at source," a grammar fix would live only in the
     briefing and silently diverge from the reader — two truths for one rule.
     Landing at source keeps one truth.
   - **Audio-path ownership invariant (C1).** The Lesson Stage writer
     (`lesson-stage/adapter.ts` `upsertLesson`) writes only `{title, description,
     level}` + sections — it does **not** write `audio_path` / `audio_path_en`,
     which are owned **solely** by `scripts/grammar-podcast/publish.ts`. So
     re-publishing a corrected lesson whose podcast already exists does **not**
     clobber its audio. This is currently an *accidental* property of the narrow
     `LessonInput`; make it an explicit invariant (a comment in `adapter.ts` on
     `upsertLesson` + `LessonInput`) so a future "let the Lesson Stage manage
     audio too" edit can't silently null produced podcasts.
   - **Capability-side caveat (don't over-claim).** A plain re-publish updates the
     reader text + `SD L<N>.txt` + briefing, but already-seeded **grammar pattern
     capabilities/exercises** are additive-only (ADR 0011) — propagating a changed
     *rule* into the scheduled exercises needs an explicit
     `--regenerate <lesson>`. The podcast briefing path needs only the plain
     re-publish; the reader-text improvement is real, the scheduled-exercise
     improvement requires the regenerate.

### Output gate — episode faithfulness (per episode, after generation)

After an episode is generated, obtain its transcript — **prefer NotebookLM's own
transcript** if `notebooklm-py` exposes one; otherwise **back-transcribe** with
Google STT (reuse the `scripts/asr-quality-gate.ts` + `scripts/lib/tts-client.ts`
pattern; `GOOGLE_STT_API_KEY` already wired). **STT language:** the reused gate
hardcodes `id-ID` (`asr-quality-gate.ts:241`) — the back-transcription here must
pass `nl-NL` for the NL episode and `en-US` for the EN episode, or the "Language"
check grades garbage (a). Claude grades the transcript against a rubric, **fed the
deterministic topic checklist** from the briefing's framing header (§1) so the
"Coverage" check compares against a known list rather than re-deriving topics from
the transcript (b):

| Check | Pass condition |
|---|---|
| Branding | Names "Kamoe Bisa" near the open |
| No foreign names | Never says NotebookLM / Google / "Deep Dive" / other product or source |
| Language | NL episode is in Dutch, EN episode in English (no drift) |
| Coverage | Every grammar topic from the briefing is discussed (none skipped) |
| Clear & detailed | Substantive explanation, not a shallow skim |
| Level-appropriate | Stays at the lesson's CEFR level — no grammar/vocabulary beyond `{level}` |

On **fail**: by default **flag** (write a verdict to `content/grammar-podcast/
lesson-N-{lang}.verdict.json` and the run report) and leave the episode's path
**null** so it does not publish. Opt-in `--auto-regenerate` retries the episode
**once** before flagging — never silently burns multiple daily NotebookLM slots.
A failed episode never reaches the app: the path column stays null → the band
plays nothing for that language (the existing done-state contract).

### Enrichment decision (deferred, evidence-based)

We do **not** pre-author extra grammar depth with an LLM (hallucination risk in a
teaching app, and the verified source is already substantive). After Phase 0
lands and **lesson 1 NL+EN is generated and graded**, we listen + read the
"clear & detailed" verdict and decide *from evidence* whether any briefing
enrichment is warranted. Default expectation: none.

## Supabase Requirements

### Schema changes
- **New column:** `indonesian.lessons.audio_path_en text` (nullable). The
  existing `audio_path` becomes the canonical **NL** grammar-audio path; the new
  column is the **EN** one. Add to `scripts/migration.sql` (idempotent
  `ADD COLUMN IF NOT EXISTS`) and `scripts/migrate.ts`.
  - *Omission test:* without it there is nowhere to store the second-language
    episode; the reader can't offer EN audio. One column is the minimum — the two
    languages are a fixed 1:1 per lesson, so a child table would be over-mechanism.
- **RLS / grants:** none new. `lessons` already has authenticated SELECT + admin
  write; a new column inherits both. Verify in `check-supabase-deep`.
- **Storage:** reuse the existing **`indonesian-lessons`** public-read bucket. No
  new bucket.

### homelab-configs changes
- [ ] PostgREST schema exposure — **N/A** (`indonesian` already exposed).
- [ ] Kong CORS — **N/A** (no new origin/header).
- [ ] GoTrue — **N/A**.
- [ ] Storage buckets — **N/A** (reuse `indonesian-lessons`).

### Health check additions
- **`check-supabase-deep.ts` (written in THIS PR, not a follow-on):** a structural
  column-existence check mirroring the `pos` pattern at `:389-408` —
  *"HC-N: `lessons.audio_path_en` column exists"*: `select('id, audio_path_en')
  .limit(1)`, fail if the error mentions `'column'`. Without it the structural
  guarantee is unenforced by `make pre-deploy`.
- **`check-supabase.ts` (tier-1)** currently HEAD-checks only the non-null
  `audio_path` URLs (it filters `.not('audio_path','is',null)`,
  `check-supabase.ts:240`) — i.e. **NL only**. **Follow-on:** extend it to also
  HEAD-check `audio_path_en` once EN is complete, so a broken EN bucket path can't
  pass tier-1 silently. Not blocking the initial cut (EN arrives in bulk after all
  NL).
- **Optional coverage check:** count lessons missing NL and/or EN grammar audio —
  doubles as the pipeline's progress report. (Not a gate; informational.)

## Reader / app changes
- `scripts/fetch-lesson-content.ts` — **the real reader-side writer.** Add
  `audio_path_en` to the lesson `select` (`:50`), build its `indonesian-lessons`
  URL (mirror the NL block `:60-62`), and extend the `output` block (`:192-204`,
  where `:201` currently emits the NL `lesson_audio_url`) to add
  `lesson_audio_url_en`.
- Each `src/pages/lessons/lesson-N/content.json` — regenerated by re-running the
  fetch script after audio is published (per-lesson; a build-time committed file,
  not a runtime call).
- New `src/components/lessons/LessonGrammarAudioBand.tsx` — reads the language
  selector, picks NL vs EN URL, renders `LessonAudioPlayer`. Each bespoke page's
  inline audio band is swapped for this component (~30 identical edits, **main
  thread**).
- `src/lib/lessons/adapter.ts` / `get_lessons_overview` SQL — **out of scope.**
  They feed the Lessons overview tiles, which render no audio player; adding
  `audio_path_en` there is future-facing only and **not** required for playback.
- `src/services/lessonService.ts:getAudioUrl` — unchanged (not on this path).

## Components / new files
**Phase 0 — grammar verification (input gate):**
- `scripts/grammar-podcast/build-sneddon-worksheet.ts` — emit per-lesson
  `content/grammar-review/lesson-N.sneddon.md` (every grammar claim, verdict
  field) for the human Sneddon review.
- Automated TBBBI/KBBI cross-check — a per-lesson agent run (reuse the web-enabled
  `grammar-exercise-creator` / `linguist-reviewer` surface; no new agent unless
  scoping shows one is needed) → `content/grammar-review/lesson-N.tbbbi.json`.
- Corrections re-enter via the **existing** Lesson Stage (edit staging `lesson.ts`
  → re-publish) — no new writer.

**Generation + publish:**
- `scripts/grammar-podcast/build-briefings.ts` — emit NL + EN briefings per
  lesson from the **verified** DB grammar (+ EN example glosses + framing header).
- `scripts/grammar-podcast/generate.py` — `notebooklm-py` driver: create notebook
  → upload → generate (prompt + language) → download (+ transcript if exposed).
- `scripts/grammar-podcast/quality-gate.ts` — transcript (NotebookLM or STT
  back-transcription) → Claude rubric grade → verdict JSON; gates publish.
- `scripts/grammar-podcast/publish.ts` — upload MP3 (`upsert`) → set path column
  → trigger the `content.json` re-bake for that lesson. Only runs on a passing
  verdict.
- `scripts/grammar-podcast/run.ts` — orchestrator: DB to-do query, NL-first
  ordering, daily cap, `--loop`, quality-gate → publish-or-flag,
  `--auto-regenerate` (single retry), reporting, `--regenerate` reset. Thin
  composition over the pure pieces (Minimum Mechanism: composition > stateful
  runner).

## Testing
- Briefing builder: unit test — given grammar sections (NL + EN enrichment),
  emits both briefings with **field-level completeness** (every field of every
  grammar category appears; a fixture category carrying a field outside the
  extractor's `KNOWN_CATEGORY_KEYS` must raise, not silently vanish — M1). Any new
  grammar field shape introduced by Phase-0 corrections requires a matching
  `KNOWN_CATEGORY_KEYS` / briefing-builder update.
- TBBBI/KBBI cross-check report: unit test — given fixture grammar + mocked agent
  verdicts, the report carries exactly one verdict + citation per grammar claim
  and drops nothing silently (c).
- To-do query + ordering: unit test — NL-before-EN, lesson order, "done" = path
  set, regenerate resets.
- Daily-cap / rate-limit handling: unit test the throttle + clean-stop logic with
  a mocked client (the `notebooklm-py` boundary is mocked — we don't test the
  library itself).
- `fetch-lesson-content.ts`: unit test — given a lesson row with `audio_path_en`,
  the emitted `meta` carries the correct `lesson_audio_url_en` bucket URL (replaces
  the bogus adapter-mapping test from the earlier draft; the adapter is not on
  this path).
- `LessonGrammarAudioBand`: RTL test — `profile.language === 'nl'` plays the NL
  URL, `'en'` plays the EN URL, neither renders when both are null.
- Sneddon worksheet builder: unit test — every DB grammar claim appears once with
  a verdict field; no claim silently dropped.
- Quality gate: unit test the rubric grader with fixture transcripts — a
  wrong-name transcript fails "no foreign names"; a Dutch transcript on the EN
  episode fails "language"; a transcript missing a briefing topic fails
  "coverage"; the Claude call and STT boundary are mocked.

## Rollout
- **Branch:** `feat/grammar-podcast-pipeline` off `main`.
- **Schema first.** Land `audio_path_en` in `scripts/migration.sql` (additive,
  nullable, `ADD COLUMN IF NOT EXISTS`, mirroring the `is_hidden` pattern at
  `migration.sql:100-101`) + `scripts/migrate.ts`. Run **`make
  migrate-idempotent-check`** before merge, then **`make pre-deploy`** (required
  for any `migration.sql` change — GitHub Actions can't reach the homelab).
- **Deploy ordering is unconstrained** (code-first or DB-first both safe): the
  column is additive/nullable; the reader change ships as committed `content.json`
  + page code together; an empty `audio_path_en` simply means the band plays NL (or
  nothing) — never an error. State this explicitly rather than choreographing.
- **Content activities are separate, long, post-merge** and do not gate the PRs:
  (a) **Phase 0 grammar verification** — automated TBBBI/KBBI run + the human
  Sneddon worksheet pass over 30 lessons + re-publish of corrected lessons; then
  (b) the **60-episode generation** over days via the resumable script.
- **Suggested PR split:** (1) **app-side — SHIPPED-IN-BRANCH** (schema +
  `fetch-lesson-content.ts` + `LessonGrammarAudioBand` + 30 page swaps + tests;
  commits 94d86b9, 89c7032); (2) Phase-0 verification tooling (worksheet builder +
  TBBBI/KBBI cross-check); (3) the `scripts/grammar-podcast/` generation + quality
  gate. Independently reviewable; author may combine 2+3.

## Open questions / risks
- **NotebookLM daily cap value** is account-tier-dependent and Google changes it;
  the script is configurable + auto-detects the limit rather than hardcoding.
- **`notebooklm-py` stability** — unofficial, can break on Google changes. Mitigated
  by per-episode isolation, full resumability, and a clear failure report so a
  broken run is obvious and re-runnable.
- **Audio-overview language fidelity** — relies on NotebookLM honoring the
  `language` param + same-language source briefing. Validate on lesson 1 NL/EN
  before committing the full 60-episode run.
- **Does `notebooklm-py` expose a transcript?** Determines whether the output gate
  needs STT back-transcription. Resolve at build time; STT fallback already exists.
- **TBBBI/KBBI fetchability** — the agent must reach `acuanbahasa.kemdikbud.go.id`
  / `kbbi.kemdikbud.go.id`; if a page is JS-gated, fall back to the Kemdikbud
  repository PDF. Cite the exact entry per verdict so claims stay checkable.
- **Sneddon manual effort** — a worksheet per lesson × 30 is real human work; it is
  deliberately one-time and improves the reader too, so it is not on the
  per-episode path. Sequence it so it doesn't block app-side merge.
- **Enrichment** — resolved: none up front; decided from the lesson-1 grade
  (§Content quality system → Enrichment decision).
