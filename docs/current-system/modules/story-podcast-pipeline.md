---
module: story-podcast-pipeline
surface: scripts/podcasts/
last_verified_against_code: 2026-06-27
status: in-flight
---

# Story-podcast pipeline

Generates **Story podcasts** (CONTEXT.md → "Story podcast (listening content)"): leveled
(A1–B2), warm-narrated Indonesian stories for listening practice, seeded into the `podcasts`
table + `indonesian-podcasts` bucket. Listening-only — never wired into capabilities/FSRS
(ADR 0022). A sibling of `scripts/grammar-podcast/`; **not** the dead capability-projection
`scripts/lib/pipeline/podcast-stage/`.

> **Slice status:** this spec covers slice 1 (#293) — the single-episode tracer bullet on the
> Chirp3-HD arm. The Gemini-TTS arm + engine bake-off (#295), the vocab-pool anchor (#294), the
> quality gate + resumable batch (#296), and the live theme-cluster seed (#298) extend it.

## 1. Public interface (CLI)

Two modes:
- **Invent** — `--level <A1|A2|B1|B2> --topic "<seed>"`: Gemini authors an original story.
- **Adapt** — `--level <…> --source <file> --attribution <file.json> [--source-level <lvl>]`:
  grades an openly-licensed source story (e.g. a Wikibooks dongeng) down to the target level.
  A sourced episode **requires** a complete CC attribution file — `run.ts` refuses without it.

`[--dry-run]` prints the plan and makes **no** API calls or writes. `[--voice <id>]` overrides the
narrator voice. Non-dry-run requires `GEMINI_API_KEY`, the Google TTS service account
(`~/.config/gcloud/tts-indonesian.json`), and `SUPABASE_SERVICE_KEY`.

The operator provides the source as a **local text file** (the pipeline does not scrape per-platform);
CC-BY platforms (StoryWeaver/Let's Read) are downloaded by hand, Wikibooks (CC-BY-SA) can be pasted in.

## 2. Internal flow

A thin composition (`run.ts:66-88`): **author** → **translate** → **narrate** → **assemble** → **seed**.

- **author / adapt** — `authorStory` (invent) or `adaptStory` (grade an openly-licensed source to
  level) in `storyAuthor.ts`, both via Gemini with `AUTHOR_SCHEMA` structured output → `{title,
  description, sentences[]}`; prompts are `buildAuthorPrompt` / `buildAdaptPrompt` (pure). The story
  is *already segmented* (one sentence per element), so alignment is free. Sourced episodes carry a
  `PodcastAttribution`, validated complete by `loadAttribution` (`run.ts`) before any work.
- **translate** — `translateSegments` (`translate.ts:48-66`) translates the Indonesian sentence
  array to NL + EN in one Gemini call, then `alignTranslations` (`translate.ts:14-21`, pure) zips
  them into `TranscriptSegment[]`, throwing if counts diverge (the alignment invariant).
- **narrate** — `synthesizeEpisode` (`narrator.ts:34-49`) builds level-graded SSML via
  `buildNarrationSsml` (`narrator.ts:21-25`) and synthesises one MP3 through the SSML-capable
  `synthesizeSsml` (`scripts/lib/tts-client.ts:96-98`). Chirp3-HD arm.
- **assemble** — `assembleEpisode` (`assemble.ts:48-62`, pure) builds the `PodcastData` record:
  the aligned segments plus the **denormalized** `transcript_*` full-text columns (segments joined
  with `SEGMENT_JOIN`, `assemble.ts:14`).
- **seed** — `persistSeedRecord` (`seed.ts:23-29`) writes the record to a git-tracked
  generated-seed JSON (re-publishable); `seedEpisode` (`seed.ts:32-66`) uploads the MP3 to the
  bucket and upserts the `podcasts` row (onConflict `title`).

## 3. Reused seams

- `scripts/lib/ssml-builder.ts` `buildSSML` — via the CEFR→(variant, speed) adapter `levelToPacing`
  (`pacing.ts:23-25`); the shared builder is **not** edited.
- `scripts/lib/tts-client.ts` — auth/token + the new `synthesizeSsml` (sends `input:{ssml}`, the
  field Google honours for `<prosody>`/`<break>`; the per-word `effectiveVoiceFor` fallback is
  intentionally not applied to multi-sentence prose).
- The `podcasts` upload+upsert pattern from `scripts/seed-podcasts.ts` (extended for
  `transcript_segments`).

## 4. Invariants

- **Read-along fidelity** — audio is synthesised from the authored transcript, so audio == transcript
  (ADR 0022). No NotebookLM.
- **Alignment** — `|id| == |nl| == |en|` per episode (`translate.ts:15-20`).
- **Denormalization consistency** — `transcript_indonesian/dutch/english` == the joined segments.
  Enforced by the shared `SEGMENT_JOIN` delimiter (one writer, `assemble.ts:14`) and asserted live
  by **HC36** (`scripts/check-supabase-deep.ts`) via the pure `transcriptDrift` predicate
  (`assemble.ts:23-37`).
- **Listening-only** — writes only `podcasts` + the bucket; touches no capability table.

## 5. Seams to other modules

- **Upstream:** Gemini (`@google/genai`, `GEMINI_API_KEY`); Google Cloud TTS (`tts-client.ts`).
- **Reader (downstream):** `src/services/podcastService.ts` (`Podcast.transcript_segments`,
  `TranscriptSegment`) → `src/pages/Podcast.tsx`. The current 3-tab reader renders the denormalized
  full-text; the **segmented read-along reader is a fast-follow** (out of scope for #293).
- **Schema:** `indonesian.podcasts.transcript_segments jsonb` (`scripts/migration.sql`).
- **Type home (the triangle):** `TranscriptSegment` in `src/services/podcastService.ts`, imported by
  `PodcastData` (`scripts/data/podcasts.ts`), the seed upsert, and the reader interface.

## 6. Known limitations / what this spec does NOT cover

- **Single TTS arm.** Only Chirp3-HD; the Gemini 2.5 TTS arm + the engine adapter + the by-ear
  bake-off are #295/#297.
- **No vocab anchor yet.** `run.ts` passes an empty pool (`run.ts:74`); the `learning_items`-at-level
  soft anchor is #294.
- **No quality gate / batch.** `gradeLevel`, `--auto-regenerate`, DB-as-todo resumable batch are #296.
- **5000-byte TTS cap.** One synthesis request per episode; over the cap it throws rather than
  chunking (`narrator.ts:42-46`). Chunk-and-concat is deferred.
- **Estimated duration.** `duration_seconds` is a word-count estimate (`run.ts:52-54`), not a probe.
