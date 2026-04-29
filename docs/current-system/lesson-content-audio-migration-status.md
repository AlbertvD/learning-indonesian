# Lesson Content, Exercise, and Audio Migration Status

Date: 2026-04-29

This note tracks what is needed to bring the current Indonesian lesson material into the new lesson reader and capability-session setup.

## What Was Started

The hard cutover is already on `main`. The old `/practice` page is gone, the new lesson reader is fail-closed on `lesson_page_blocks`, and lesson-scoped sessions are selected from lesson page block capability refs.

Local Slice 10 staging output now exists for lessons 2-9:

| Lesson | Content units | Capabilities | Exercise assets | Lesson page blocks |
|---:|---:|---:|---:|---:|
| 1 | 70 | 190 | 441 | 138 |
| 2 | 83 | 267 | 599 | 146 |
| 3 | 76 | 256 | 575 | 136 |
| 4 | 132 | 482 | 1083 | 252 |
| 5 | 76 | 267 | 600 | 140 |
| 6 | 67 | 203 | 455 | 114 |
| 7 | 84 | 293 | 658 | 156 |
| 8 | 82 | 285 | 640 | 152 |
| 9 | 112 | 399 | 896 | 208 |

Lessons 2-9 also pass `publish-approved-content.ts <lesson> --dry-run` local Slice 10 validation. The dry-run skipped DB-backed lint because this checkout does not currently have `SUPABASE_SERVICE_KEY` in `.env.local`.

Lesson 9 now also projects the existing `morphology-patterns.ts` affix pairs into Slice 10 content units, lesson page blocks, capabilities, and exercise assets, so that material is no longer stranded outside the new lesson/session setup.

## Current Content Readiness

Local staged capability projection health:

| Lesson | Ready | Blocked | Main blockers |
|---:|---:|---:|---|
| 1 | 251 | 0 | None in staged projection |
| 2 | 261 | 6 | Missing grammar pattern examples |
| 3 | 254 | 2 | Missing grammar pattern examples |
| 4 | 545 | 1 | Missing grammar pattern example |
| 5 | 265 | 2 | Missing grammar pattern examples |
| 6 | 203 | 0 | None in staged projection |
| 7 | 252 | 45 | Dialogue chunks missing Dutch meaning or accepted answers; 1 grammar pattern example |
| 8 | 216 | 69 | Dialogue chunks missing Dutch meaning or accepted answers; 1 grammar pattern example |
| 9 | 419 | 0 | None in local capability health; publish dry-run still defers 4 dialogue chunks until cloze coverage is added |

Interpretation: lessons 1, 6, and 9 are the cleanest local capability-health candidates. Lessons 2-5 are mostly usable but need a small grammar-example pass. Lessons 7-8 still need dialogue translation or cloze coverage before their dialogue chunks can be fully practiceable. Lesson 9 has Dutch translations for the dialogue chunks, but 4 short dialogue chunks still need cloze coverage before the publish script will stop deferring them.

## What Is Still Needed

To make lesson material visible in the new app:

1. Ensure the capability and lesson block migrations are applied in Supabase.
2. Publish each lesson with `npx tsx scripts/publish-approved-content.ts <lesson>`.
3. Confirm `lesson_page_blocks` exists for each lesson source ref (`lesson-1` through `lesson-9`).

To make exercise material schedulable through FSRS:

1. Keep generated capability rows as draft until promotion.
2. Review/approve concrete exercise artifacts, especially generated item meanings and grammar pattern examples.
3. Run `npx tsx scripts/promote-capabilities.ts --lesson <lesson> --dry-run`.
4. Apply promotion only for capabilities that resolve to ready/published.
5. Run DB-backed `check-capability-release-readiness.ts` and `check-capability-health.ts`.

To bring audio into the new setup:

1. `lessons.audio_path` is the canonical lesson-level audio source. The new lesson reader now renders a lesson audio player when that field is present.
2. Block-level audio can still come from `lesson_page_blocks.payload_json.audioUrl`, but all generated blocks currently have `withAudio = 0`.
3. Local seed data only lists lesson audio filenames for lessons 1-4.
4. The repo has audio specs for lessons 1-4, but no actual `.mp3`/`.m4a` lesson audio files in `content/`.
5. Add or recover lesson audio metadata/files for lessons 5-9.

Recommended next implementation slice: decide whether meaningful playback of lesson-level audio should mark all grammar/pattern blocks as heard, or whether grammar audio should be attached to specific lesson page blocks. The current implementation renders the audio but does not fan out lesson-level playback into per-pattern source progress.

## Current Local Blockers

The repo cannot publish to Supabase from this checkout yet:

```text
.env.local exists
VITE_SUPABASE_URL is present
SUPABASE_SERVICE_KEY is not present
```

Once those are supplied, the next safe release order is:

```text
1. Run DB migrations if not already applied.
2. Run publish dry-run with DB-backed lint for lesson 1 and lesson 6.
3. Publish lesson 1 and lesson 6.
4. Promote only ready capabilities.
5. Smoke test lesson reader, source progress, lesson practice, and Today session.
6. Repeat for lesson 9 after adding cloze coverage for the 4 deferred dialogue chunks.
7. Repeat for lessons 2-5 after adding missing grammar examples.
8. Repeat for lessons 7-8 after dialogue translations or cloze coverage are completed.
```
