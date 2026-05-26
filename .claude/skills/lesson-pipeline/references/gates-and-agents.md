# Gates & agents reference

Open this while running phases 5–10. It pins down what each gate finding means,
what each agent should produce, the signals that count as "something off", and
symptom→fix tables. Verify against code if a cite looks stale (the pipeline
moves); authoritative sources are `scripts/lib/pipeline/` and `docs/adr/0013`.

## Reading the publish output

`publish-approved-content.ts N [--dry-run]` runs the lint pre-flight, then
prints a JSON `LessonStageOutput` (Stage A) and a JSON `CapabilityStageOutput`
(Stage B). Both have the shape:

```
{ "status": "ok" | "validation_failed" | "partial",
  "counts": { ... },
  "findings": [ { "gate": "...", "severity": "error"|"warning", "message": "...", "context": {...} } ],
  "durationMs": N }
```

Parse both. `status: ok` = clean. `validation_failed` = a pre-write gate
rejected it before any DB write (Stage A only). `partial` = the writes landed
but a post-write verification flagged errors (no rollback) — re-publish after
fixing. For the report, group `findings` by `gate` and `severity`.

## The Lesson Gate (Stage A — `scripts/lib/pipeline/lesson-stage/`)

Stage A's self-contained gate (ADR 0013). Two layers; the pre-write family runs
in one of two modes — **pre-flight** (dry-run: enriched-translation completeness
relaxed to `warning`) or **publish** (CRITICAL). Self-contained to the lesson →
fresh-lesson-safe.

Pre-write (the `runLessonGate` family — `gate.ts`):

| Code | Checks | Notes |
|------|--------|-------|
| GT1 | grammar/reference_table sections carry non-empty, unprefixed `grammar_topics` | structural, always CRITICAL |
| GT4 | dialogue speakers all have a voice in `dialogue_voices` + `primary_voice` set | structural |
| GT5 | `content.type` ∈ canonical 10; per-type sub-shape (items[]/lines[]/letters[]/sections[]/paragraphs) | structural |
| GT6 | every item has `indonesian` + (`dutch`\|`english`); dialogue lines have `text`+`speaker` | structural |
| GT8 | dialogue line `text` (always CRITICAL) + NL `translation` (flexes with mode) | NL relaxes in pre-flight |
| GT9 | typed capability-contract rows complete: refs, `item_type`, `indonesian_text`, `l1_translation`, EN (`l2`/`title_en`/`rules_en`/example.english — flexes with mode) | EN relaxes in pre-flight |
| GT10 | display-content blob: grammar legacy `body:string`/empty category, translation-drill answers; `culture`/`reference_table` not empty shells | folded from lint-staging |

Post-write (`verify/`, only on a real publish — dry-run skips):

| Code | Checks |
|------|--------|
| LV1 | per-lesson row-count parity: each lesson-stage table has ≥ the rows the runner wrote (read back by `lesson_id`) |
| LV2 | every `lesson_sections.content` blob is a non-empty object (the reader has something to render) |

**Pre-flight EN/NL `warning`s are expected and not blockers** — they become
CRITICAL on the real publish only after the enrichers fill them. A fresh lesson
should clear the pre-flight Lesson Gate with 0 errors and possibly many EN/NL
warnings.

## lint-staging (capability pre-flight — `scripts/lint-staging.ts`)

DB-backed (`SUPABASE_SERVICE_KEY`). Run `bun scripts/lint-staging.ts --lesson N
--json`. As of the Lesson Gate slice-3 shrink it no longer checks `lesson.ts` —
only capability-side staging: `grammar-patterns.ts`, `candidates.ts`,
`cloze-contexts.ts`, `learning-items.ts`, vocab-enrichments, exercise coverage.
Exit 1 on any CRITICAL. Report `counts.critical`/`counts.warning` and each
finding's `file`+`rule`.

**Fresh-lesson caveat:** some checks run against the *live DB* pool (e.g.
`dialogue-cloze-blank-not-in-pool` builds the known-word set from `learning_items`
where `is_active=true`). A never-published lesson's own new vocabulary isn't in
the DB yet, so a fresh lesson can fail these on words it legitimately introduces.
These are bootstrapping artifacts (epic #98 makes the capability gate
fresh-safe), **not** lesson-content defects — flag them as such, don't treat
them as a reason the lesson is broken.

## Capability gate (Stage B — `scripts/lib/pipeline/capability-stage/`)

Pre-write validators (`validators/`): candidate payload shape, per-item meaning
presence, grammar-pattern shape, POS taxonomy (12 values), affixed-form pairs,
dialogue clozes, item source-ref resolvability, item translations, lesson_id
stamping. Post-write verify (`verify/`): **CS7** count parity, **CS8** content
non-empty, **CS9** seed integrity (every non-dialogue item is reviewable: an NL
meaning OR a context with an active exercise variant). On any error Stage B
returns `partial` and does **not** auto-promote capabilities; on `ok` it
promotes draft→ready/published.

## Command path vs agents (what's deterministic)

Most authoring steps have a deterministic `make` target (the script form, which
calls the Claude API non-interactively). **Four artifacts have no command** and
require dispatching a Claude Code agent. Prefer the command; reach for the agent
for the four gaps or when a command's output is thin/wrong.

| Artifact | Deterministic command | Agent form |
|----------|----------------------|-----------|
| `sections-catalog.json` | `make catalog-sections LESSON=N` | content-ingestor |
| staging scaffolds (`lesson.ts`, `learning-items.ts`, stubs) | `make staging-files LESSON=N` | content-ingestor |
| structured grammar/exercise sections in `lesson.ts` | `make build-sections LESSON=N` (reads existing patterns) | linguist-structurer (also does the next row) |
| **`grammar-patterns.ts` pattern extraction** | **none** (scripts only stub it) | **linguist-structurer** |
| `candidates.ts` | `make generate-exercises LESSON=N` | grammar-exercise-creator |
| **`vocab-enrichments.ts`** | **none** | **vocab-exercise-creator** |
| **`cloze-contexts.ts`** | **none** | **cloze-creator** |
| **`review-report.json`** | **none** | **linguist-reviewer** |
| publish + all gates | `make publish-content LESSON=N` | content-seeder |

## Agents — expected output & anomaly signals

For agent phases, dispatch via the Agent tool with the lesson number, then
**read the files it wrote** (don't trust the summary) and apply these checks.
Apply the same checks to a command's output — a `make generate-exercises` run is
reviewed identically to a grammar-exercise-creator dispatch.

| Step | Should produce | Flag if… |
|------|----------------|----------|
| **linguist-structurer** (agent) | `grammar-patterns.ts` with ≥1 pattern (slug + complexity), `pattern-brief.json`, structured grammar/exercise sections in `lesson.ts` | 0 patterns; `lesson.ts` grammar/exercises still has `body:string` (unstructured); no pattern-brief; slugs not kebab-case or duplicated across lessons |
| **generate-exercises** (cmd) / **grammar-exercise-creator** (agent) | `candidates.ts` with the 4 exercise types per pattern (contrast_pair, sentence_transformation, constrained_translation, cloze_mcq) | candidate count ≪ pattern count; a pattern missing required types (`bun scripts/check-exercise-coverage.ts`); payloads missing promptText/options/correctOptionId; distractors that are substrings of the answer |
| **vocab-exercise-creator** (agent) | `vocab-enrichments.ts` curated distractor sets for recognition_mcq / cued_recall / cloze_mcq vocab | empty file; distractor == answer; distractors not same POS; <3 distractors |
| **cloze-creator** (agent) | `cloze-contexts.ts` carrier sentences for vocab items + dialogue-line clozes (one blanked word) | vocab items with no cloze (coverage gap); blanked word not present in the sentence; answer not in known pool (fresh-lesson → note, don't block) |
| **linguist-reviewer** (agent) | `review-report.json` with findings | `counts.critical > 0`; report missing or stale (older than the creators' output) |

For the report's "agent performance" section, give each a one-liner: ran?,
counts produced, and the single biggest quality concern (or "clean"). Name the
weakest link explicitly — that's the most useful signal for the user.

## Symptom → fix

Stage A / Lesson Gate:

| Symptom | Cause | Fix |
|---------|-------|-----|
| GT1 `grammar_topics empty` | grammar-topics enricher failed | re-run (check `ANTHROPIC_API_KEY`); deterministic path should still fill from titles |
| GT4 missing voice | dialogue speaker without a voice mapping | the audio orchestrator sets voices at publish; if hand-authored, fix `dialogue_voices` |
| GT9 EN error on a real publish | EN enricher didn't fill `l2`/`title_en`/`rules_en` | re-run publish (LLM enrichment); persistent → hand-author EN in `lesson.ts` |
| GT10 `body:string and no categories` | grammar section never structured | re-run **linguist-structurer** for that section |
| LV1/LV2 → `partial` | a write didn't land / empty blob | re-publish (idempotent); inspect the named table/row |

Stage B / capability:

| Symptom | Cause | Fix |
|---------|-------|-----|
| `Invalid POS` | item POS outside the 12-value taxonomy | re-run `catalog-lesson-sections.ts` or fix `learning-items.ts` |
| `Missing meaning artifact` | learning item has no `translation_nl` | fix the staging row |
| `Broken candidate payload` | candidate shape ≠ renderer | re-run **grammar-exercise-creator** for that pattern |
| `Unresolved cloze slug` / `blank-not-in-pool` | cloze references an item not in the set/DB | re-run **cloze-creator**; if fresh-lesson bootstrapping, note as #98 |
| CS7 count mismatch | projector / upsert-order bug | read the `findings` — it names the diverged count |

## Health & DB counts (phase 10)

After a live publish: `make check-supabase-deep` (tables, RLS, grants,
policies). For the "what was published" counts, use
`scripts/verify-published.ts <lessonId>` — it counts the six typed
lesson-content tables by `lesson_id` (Stage A). For Stage B, query
`content_units`, `learning_capabilities`, `learning_items`, `exercise_variants`,
`cloze_contexts` for `lesson_id = N`. Compare against the Stage A/B `counts`
reports — divergence is a flag. Do NOT count `audio_clips` per-lesson — it is
keyed by (normalized_text, voice_id) and shared across lessons (no `lesson_id`).

## Audio (phase 11) — how lessons actually get audio

Stage A's inline audio (`ensureLessonAudio` → reads voices from the *staging*
file) is effectively dead: staging never carries voices, so it reports
`audioClipsSynthesised`/`Reused` = 0 for every lesson. The app's `audio_clips`
are produced **post-publish** by `generate-exercise-audio.ts`:

1. **Credential:** `~/.config/gcloud/tts-indonesian.json` (Google service
   account; the client mints a JWT → access token → TTS REST API). NOT
   `GOOGLE_TTS_API_KEY` — that var is only the legacy `generate-section-audio.ts`
   narration path.
2. `bun scripts/set-lesson-voices.ts` — writes `primary_voice` +
   `dialogue_voices` to the DB `lessons` row (reads sections from DB → lesson
   must be published first). Required: `generate-exercise-audio` errors if
   `primary_voice` is unset.
3. `bun scripts/generate-exercise-audio.ts N` — reads the lesson's DB texts
   (`learning_items`, `exercise_variants`, `lesson_sections`), dedups by (text,
   voice), synthesizes the missing, uploads to storage, inserts `audio_clips`.
   Its printed clip count is the coverage signal. On a fresh lesson with Stage B
   deferred (#98), only `lesson_sections` text is available to voice.

Real, billable TTS calls + prod storage writes — confirm before running for real.
