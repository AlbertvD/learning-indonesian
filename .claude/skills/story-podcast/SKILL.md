---
name: story-podcast
description: >-
  Generate and publish a leveled Story podcast (A1–B2) for the Kamoe Bisa app —
  a warm-narrated Indonesian listening story with word-level follow-along, seeded
  live into the `podcasts` table + `indonesian-podcasts` bucket. Use whenever the
  user wants to "generate a story podcast", "publish a podcast", "add story
  podcasts at level X", "make a podcast from this StoryWeaver PDF / source story",
  or "re-time an existing episode". Covers the whole operator workflow: acquire +
  level a source, curate it to clean text, write CC attribution, run the
  author→translate→narrate→align→seed pipeline (`scripts/podcasts/run.ts`), and
  verify follow-along timings with the gate. NOT the grammar/NotebookLM podcast
  (that's `lessons.audio_path`); NOT the lesson content pipeline (`lesson-pipeline`).
---

# Story podcast — generate & publish

Produces one **Story podcast** (CONTEXT.md → "Story podcast"; ADR 0022): an authored-
or adapted-text → TTS Indonesian listening story, leveled A1–B2, with **word-level
follow-along** (each word highlights as spoken). Listening-only — never wired to FSRS.

**Read for the "why" (don't duplicate here):** ADR `docs/adr/0022-story-podcasts-are-authored-text-tts-and-listening-only.md` (+ its 2026-06-28 follow-along amendment) and the module spec `docs/current-system/modules/story-podcast-pipeline.md`.

## Prerequisites (one-time, mostly done)

- Env in `.env.local`: `GEMINI_API_KEY`, `SUPABASE_SERVICE_KEY`; Google TTS service
  account at `~/.config/gcloud/tts-indonesian.json`.
- **Speech-to-Text API enabled** on the TTS Cloud project `hassio-integration-5a907`
  (used for word timings). Already enabled.
- `pdftotext` (poppler) for source curation: `brew install poppler`.
- **⚠️ `NODE_TLS_REJECT_UNAUTHORIZED=0`** must prefix any direct `run.ts` invocation —
  the homelab bucket/DB upload uses a Step-CA cert the Node client otherwise rejects.

## Three modes (`scripts/podcasts/run.ts`)

| Mode | Command | Use |
|---|---|---|
| **Adapt** | `--level <CEFR> --source <txt> --attribution <json> --source-level "StoryWeaver Level N"` | grade an openly-licensed source story to a CEFR level (the usual path) |
| **Invent** | `--level <CEFR> --topic "<seed>"` | Gemini writes an original story |
| **Re-time** | `--retime <record.json>` | recover word timings for an existing episode from its audio — **no** re-author/translate/synthesis |

`--dry-run` prints the plan with no API calls. `--resume <record.json>` re-seeds after a transient upload failure (no STT).

## Workflow (adapt a sourced story — the common case)

1. **Acquire.** Download the story from StoryWeaver as PDF (+ its `StoryWeaverAttribution_*.txt`). The site is a JS app / 403s automated fetches — **download by hand**. **Prefer CC-BY** sources over CC-BY-SA (share-alike taints the eventual paid app; ADR 0022).
2. **Level.** Read the **Level badge on the PDF cover** (`Read` the PDF, page 1). Map StoryWeaver level → CEFR target: **L1→A1, L2→A2, L3→B1, L4→B1/B2**. (Validated: Cuaca was L2 → A2.) You grade *down* well; don't grade a simple text *up*.
3. **Curate** the PDF to clean prose:
   ```
   bun scripts/podcasts/curate-source.ts <story>.pdf scripts/data/podcast-sources/<slug>.txt
   ```
   It strips the cover header, `N/M` page numbers, the credits block, and any glossary/bulleted appendix. **Verify** the output is story-only (`head`/`tail`); manually trim any non-narrative appendix the heuristic missed.
4. **Attribution** — write `scripts/data/podcast-sources/<slug>.attribution.json` with all 5 fields (the pipeline refuses a sourced episode without them). Get the credit text from **either** the `StoryWeaverAttribution_*.txt` downloaded alongside the PDF (easiest — it's the full citation), **or** the PDF's "Story Attribution:" block near the end (`pdftotext <pdf> - | grep -A4 "Story Attribution"`). Compose:
   ```json
   { "source_title": "<Indonesian title>", "source_url": "https://storyweaver.org.in/en/stories/<id>-<english-slug-from-the-folder-name>",
     "author": "Translation by <translator> (© <translation ©-holder>, <year>); original '<English title>' by <author> (© Pratham Books, <year>)",
     "license": "CC BY 4.0", "license_url": "https://creativecommons.org/licenses/by/4.0/" }
   ```
   `source_url` = `https://storyweaver.org.in/en/stories/<download-folder-name>` (id + English slug, e.g. `39803-the-red-raincoat`). Map `CC BY-SA 4.0` → `https://creativecommons.org/licenses/by-sa/4.0/` if a CC-BY-SA source is used.
5. **Generate** (seeds live):
   ```
   NODE_TLS_REJECT_UNAUTHORIZED=0 bun scripts/podcasts/run.ts \
     --level <CEFR> --source scripts/data/podcast-sources/<slug>.txt \
     --attribution scripts/data/podcast-sources/<slug>.attribution.json \
     --source-level "StoryWeaver Level N"
   ```
   Flow: adapt (Gemini, condensed to the level's sentence budget) → translate ID→NL/EN → narrate (Chirp3-HD) → **align** (STT word-offsets → script) → assemble → seed.
6. **Verify timings** (the follow-along gate — must pass):
   ```
   bun scripts/podcasts/check-timings.ts
   ```
   `✓ all N clean` = good. A `✗ … collapse>0` means a residual skip/hover — first try `--retime` (STT retry); the aligner already auto-spreads tail-drops, so a true failure is rare.
7. **Commit** (no redeploy — data + scripts only; the episode is already live):
   - the `podcast-sources/<slug>.{txt,attribution.json}` and the new `generated-podcasts/<…>.json` (content commit; `ALLOW_LARGE_COMMIT=1` if >10 files);
   - then `git push origin main`.

## Gotchas (all already handled in code — don't re-derive)

- **5000-byte SSML cap** — the narrator synthesises one request; a too-long story throws. The adapt prompt now caps length to the level's sentence budget, so long sources are condensed. Invent/very-long A1 could still hit it → shorten the story.
- **STT model** — uses `latest_long` + `useEnhanced` (the default model drops word-runs on long audio → skip/hover). Don't revert.
- **Tail-drops** — even `latest_long` occasionally drops the final run; the aligner (`spreadCollapsedClusters`) redistributes it. The gate is the backstop.
- **Levels** — `--source-level` is just a hint to the grader; `--level` is the real target.

## Files

`scripts/podcasts/`: `run.ts` (orchestrator), `storyAuthor.ts`, `translate.ts`, `narrator.ts`, `stt.ts`, `align.ts`, `assemble.ts`, `seed.ts`, `pacing.ts`, `curate-source.ts`, `check-timings.ts`. Sources in `scripts/data/podcast-sources/`; git-tracked seed records in `scripts/data/generated-podcasts/`. Reader: `src/pages/Podcast.tsx` + `src/lib/followAlong.ts`.
